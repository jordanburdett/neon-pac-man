/**
 * Ghost.ts — Full canonical ghost AI for Neon Pac-Man.
 *
 * Each ghost owns its own state. The GameEngine drives the global mode cycle
 * timer and broadcasts mode changes. Ghost.update(dt) is called every frame.
 *
 * TypeScript constraints: no enum keyword, all params used, erasableSyntaxOnly.
 */

import {
  TILE_SIZE,
  COLS,
  TUNNEL_ROW,
  GHOST_HOUSE_ENTRY_COL,
  GHOST_HOUSE_ENTRY_ROW,
  GHOST_SPEED_NORMAL_L1,
  GHOST_SPEED_NORMAL_L2,
  GHOST_SPEED_FRIGHTENED,
  GHOST_SPEED_EATEN,
  TUNNEL_SPEED_FACTOR,
  SCATTER_TARGETS,
  CLYDE_CHASE_DISTANCE,
} from './constants';
import { bfsPath, pixelToTile, tileCenterPx } from './mazeData';
import { Direction, GhostMode, GhostId } from './types';
import type { TilePos } from './types';

// ─── exported helpers (used by tests and GameEngine) ─────────────────────────

export function dirDeltaGhost(dir: Direction): { dc: number; dr: number } {
  switch (dir) {
    case Direction.LEFT:  return { dc: -1, dr: 0 };
    case Direction.RIGHT: return { dc: 1,  dr: 0 };
    case Direction.UP:    return { dc: 0,  dr: -1 };
    case Direction.DOWN:  return { dc: 0,  dr: 1 };
    case Direction.NONE:  return { dc: 0,  dr: 0 };
  }
}

export function oppositeDir(dir: Direction): Direction {
  switch (dir) {
    case Direction.LEFT:  return Direction.RIGHT;
    case Direction.RIGHT: return Direction.LEFT;
    case Direction.UP:    return Direction.DOWN;
    case Direction.DOWN:  return Direction.UP;
    case Direction.NONE:  return Direction.NONE;
  }
}

function euclid(a: TilePos, b: TilePos): number {
  const dx = a.col - b.col;
  const dr = a.row - b.row;
  return dx * dx + dr * dr; // squared is fine for comparisons
}

// ─── Ghost class ──────────────────────────────────────────────────────────────

export class Ghost {
  readonly id: GhostId;
  readonly color: string;
  readonly scatterTarget: TilePos;

  // Pixel position (center of ghost)
  pixelPos: { x: number; y: number };

  // Current mode
  mode: GhostMode = GhostMode.SCATTER;

  // Current movement direction
  direction: Direction;

  // The tile the ghost occupied last time a direction decision was made.
  // Used to forbid reversal mid-corridor.
  private lastDecisionTile: TilePos;

  // Starting tile (used for reset / EATEN respawn)
  private readonly startTile: TilePos;

  // Whether this ghost has exited the ghost house
  isReleased: boolean;

  // Current level (affects speed)
  level = 1;

  // Trail positions (last 6 pixel positions) for neon trail rendering
  trailPositions: { x: number; y: number }[] = [];

  // Path to follow when exiting ghost house, or when EATEN returning home.
  // Each Direction step is consumed as the ghost crosses tile boundaries.
  private activePath: Direction[] = [];
  // Pixel position at which the current path step began
  private pathStepOrigin: { x: number; y: number } | null = null;
  // Index into activePath
  private pathStepIndex = 0;

  // Whether the ghost is in the process of exiting the ghost house
  private _isExiting = false;

  constructor(
    id: GhostId,
    color: string,
    startCol: number,
    startRow: number,
    isReleased: boolean,
  ) {
    this.id = id;
    this.color = color;
    this.startTile = { col: startCol, row: startRow };
    this.scatterTarget = SCATTER_TARGETS[id];

    const center = tileCenterPx(startCol, startRow);
    this.pixelPos = { x: center.x, y: center.y };
    this.lastDecisionTile = { col: startCol, row: startRow };
    this.isReleased = isReleased;
    this.direction = isReleased ? Direction.LEFT : Direction.UP;
  }

  // ─── tilePos derived property ──────────────────────────────────────────────

  get tilePos(): TilePos {
    return pixelToTile(this.pixelPos.x, this.pixelPos.y);
  }

  /** Public getter so GameEngine doesn't need bracket notation. */
  get isExiting(): boolean {
    return this._isExiting;
  }

  // ─── lifecycle callbacks (called by GameEngine) ──────────────────────────

  /** Reset to starting position for new life / level. */
  reset(grid: number[][], isReleased: boolean): void {
    const center = tileCenterPx(this.startTile.col, this.startTile.row);
    this.pixelPos = { x: center.x, y: center.y };
    this.lastDecisionTile = { col: this.startTile.col, row: this.startTile.row };
    this.mode = GhostMode.SCATTER;
    this.direction = isReleased ? Direction.LEFT : Direction.UP;
    this.isReleased = isReleased;
    this._isExiting = false;
    this.activePath = [];
    this.pathStepIndex = 0;
    this.pathStepOrigin = null;
    this.trailPositions = [];
    // Suppress unused parameter warning — grid is used by subclasses / tests
    void grid;
  }

  /** Called by GameEngine when global mode switches (scatter↔chase). */
  onGlobalModeChange(newMode: GhostMode): void {
    if (this.mode === GhostMode.FRIGHTENED || this.mode === GhostMode.EATEN) return;
    this.mode = newMode;
    this.direction = oppositeDir(this.direction);
  }

  /** Called when Pac-Man eats a power pellet. */
  onFrightened(): void {
    if (this.mode === GhostMode.EATEN) return;
    if (this.mode !== GhostMode.FRIGHTENED) {
      this.direction = oppositeDir(this.direction);
    }
    this.mode = GhostMode.FRIGHTENED;
  }

  /** Called when frightened timer expires; restore to current global mode. */
  onFrightenedEnd(globalMode: GhostMode): void {
    if (this.mode !== GhostMode.FRIGHTENED) return;
    this.mode = globalMode;
  }

  /**
   * Called when this ghost is eaten by Pac-Man.
   * Computes BFS path back to ghost house entry.
   */
  onEaten(grid: number[][]): void {
    this.mode = GhostMode.EATEN;
    const target = { col: GHOST_HOUSE_ENTRY_COL, row: GHOST_HOUSE_ENTRY_ROW };
    this.activePath = bfsPath(grid, this.tilePos, target);
    this.pathStepIndex = 0;
    this.pathStepOrigin = { x: this.pixelPos.x, y: this.pixelPos.y };
    if (this.activePath.length > 0) {
      this.direction = this.activePath[0] as Direction;
    }
  }

  /**
   * Called by GameEngine when this ghost should start exiting the ghost house.
   */
  startExiting(grid: number[][]): void {
    if (this._isExiting || this.isReleased) return;
    this._isExiting = true;
    const target = { col: GHOST_HOUSE_ENTRY_COL, row: GHOST_HOUSE_ENTRY_ROW };
    this.activePath = bfsPath(grid, this.tilePos, target);
    this.pathStepIndex = 0;
    this.pathStepOrigin = { x: this.pixelPos.x, y: this.pixelPos.y };
    if (this.activePath.length > 0) {
      this.direction = this.activePath[0] as Direction;
    } else {
      // Already at entry tile
      this.finishExiting();
    }
  }

  // ─── main update ─────────────────────────────────────────────────────────

  /**
   * Advance ghost position by dt seconds.
   * pacTile, pacDir, blinkyTile are needed for targeting.
   */
  update(
    dt: number,
    grid: number[][],
    pacTile: TilePos,
    pacDir: Direction,
    blinkyTile: TilePos,
  ): void {
    if (!this.isReleased && !this._isExiting) return;

    // Record position for trail before moving
    this.trailPositions.push({ x: this.pixelPos.x, y: this.pixelPos.y });
    if (this.trailPositions.length > 6) {
      this.trailPositions.shift();
    }

    const speed = this.currentSpeed(grid); // tiles/sec
    const distPx = speed * TILE_SIZE * dt;

    if (this._isExiting || this.mode === GhostMode.EATEN) {
      this.moveAlongPath(distPx, grid);
      return;
    }

    this.moveNormal(distPx, grid, pacTile, pacDir, blinkyTile);
  }

  // ─── private: path-following movement ───────────────────────────────────

  /**
   * Move along activePath step by step.
   * Each step covers exactly TILE_SIZE pixels in one direction.
   */
  private moveAlongPath(distPx: number, grid: number[][]): void {
    let remaining = distPx;

    while (remaining > 0) {
      if (this.pathStepIndex >= this.activePath.length) {
        // Path exhausted
        if (this.mode === GhostMode.EATEN) {
          this.onEatenArrived();
        } else if (this._isExiting) {
          this.finishExiting();
        }
        return;
      }

      const stepDir = this.activePath[this.pathStepIndex] as Direction;
      this.direction = stepDir;

      if (!this.pathStepOrigin) {
        this.pathStepOrigin = { x: this.pixelPos.x, y: this.pixelPos.y };
      }

      const { dc, dr } = dirDeltaGhost(stepDir);
      const stepTarget = {
        x: this.pathStepOrigin.x + dc * TILE_SIZE,
        y: this.pathStepOrigin.y + dr * TILE_SIZE,
      };

      const remX = stepTarget.x - this.pixelPos.x;
      const remY = stepTarget.y - this.pixelPos.y;
      const remDist = Math.sqrt(remX * remX + remY * remY);

      if (remaining >= remDist) {
        // Arrive at next tile
        this.pixelPos = { x: stepTarget.x, y: stepTarget.y };
        remaining -= remDist;
        this.pathStepIndex++;
        this.pathStepOrigin = { x: stepTarget.x, y: stepTarget.y };
      } else {
        // Partial step
        const frac = remaining / remDist;
        this.pixelPos = {
          x: this.pixelPos.x + remX * frac,
          y: this.pixelPos.y + remY * frac,
        };
        remaining = 0;
      }
    }

    // Apply tunnel wrap for EATEN ghosts (shouldn't normally happen but be safe)
    this.applyTunnelWrap();
    void grid; // grid param available for future use
  }

  private onEatenArrived(): void {
    // Teleport back to start tile and respawn
    const startCtr = tileCenterPx(this.startTile.col, this.startTile.row);
    this.pixelPos = { x: startCtr.x, y: startCtr.y };
    this.lastDecisionTile = { col: this.startTile.col, row: this.startTile.row };
    this.mode = GhostMode.SCATTER;
    this.isReleased = true;
    this.direction = Direction.LEFT;
    this.activePath = [];
    this.pathStepIndex = 0;
    this.pathStepOrigin = null;
  }

  private finishExiting(): void {
    const center = tileCenterPx(GHOST_HOUSE_ENTRY_COL, GHOST_HOUSE_ENTRY_ROW);
    this.pixelPos = { x: center.x, y: center.y };
    this.lastDecisionTile = { col: GHOST_HOUSE_ENTRY_COL, row: GHOST_HOUSE_ENTRY_ROW };
    this._isExiting = false;
    this.isReleased = true;
    this.direction = Direction.LEFT;
    this.activePath = [];
    this.pathStepIndex = 0;
    this.pathStepOrigin = null;
  }

  // ─── private: normal movement ────────────────────────────────────────────

  /**
   * Normal movement (SCATTER / CHASE / FRIGHTENED):
   * At each new tile, choose the best next direction using targeting.
   */
  private moveNormal(
    distPx: number,
    grid: number[][],
    pacTile: TilePos,
    pacDir: Direction,
    blinkyTile: TilePos,
  ): void {
    let remaining = distPx;
    const maxIter = 4; // safety cap to avoid infinite loop at low FPS

    for (let iter = 0; iter < maxIter && remaining > 0; iter++) {
      const { dc, dr } = dirDeltaGhost(this.direction);
      // How far to the center of the next tile in current direction?
      const nextTileCenter = this.nextTileCenter();
      const remX = nextTileCenter.x - this.pixelPos.x;
      const remY = nextTileCenter.y - this.pixelPos.y;
      const remDist = Math.abs(dc !== 0 ? remX : remY);

      if (remaining >= remDist && remDist > 0) {
        // Arrive at next tile center
        this.pixelPos = { x: nextTileCenter.x, y: nextTileCenter.y };
        remaining -= remDist;

        const curTile = this.tilePos;
        // Only make a direction decision if we moved to a new tile
        if (curTile.col !== this.lastDecisionTile.col || curTile.row !== this.lastDecisionTile.row) {
          this.lastDecisionTile = { col: curTile.col, row: curTile.row };
          const target = this.targetTile(pacTile, pacDir, blinkyTile);
          this.direction = this.chooseBestDirection(grid, curTile, target);
        }

        this.applyTunnelWrap();
      } else {
        // Partial move in current direction
        this.pixelPos = {
          x: this.pixelPos.x + dc * remaining,
          y: this.pixelPos.y + dr * remaining,
        };
        remaining = 0;
        this.applyTunnelWrap();
      }
    }
  }

  /**
   * Return the pixel center of the tile directly ahead in the current direction.
   */
  private nextTileCenter(): { x: number; y: number } {
    const { dc, dr } = dirDeltaGhost(this.direction);
    const tile = this.tilePos;
    const ahead = { col: tile.col + dc, row: tile.row + dr };
    // Center of that tile
    return {
      x: ahead.col * TILE_SIZE + TILE_SIZE / 2,
      y: ahead.row * TILE_SIZE + TILE_SIZE / 2,
    };
  }

  private applyTunnelWrap(): void {
    const tile = this.tilePos;
    if (tile.row === TUNNEL_ROW) {
      if (this.pixelPos.x < 0) {
        this.pixelPos.x = (COLS - 1) * TILE_SIZE + TILE_SIZE / 2;
      } else if (this.pixelPos.x > COLS * TILE_SIZE) {
        this.pixelPos.x = TILE_SIZE / 2;
      }
    }
  }

  // ─── targeting ───────────────────────────────────────────────────────────

  /**
   * Compute target tile based on current mode and ghost identity.
   * Exported as public so it can be tested in isolation.
   */
  targetTile(pacTile: TilePos, pacDir: Direction, blinkyTile: TilePos): TilePos {
    if (this.mode === GhostMode.SCATTER) {
      return this.scatterTarget;
    }
    if (this.mode === GhostMode.FRIGHTENED) {
      // Direction is random — return dummy (chooseBestDirection handles randomness)
      return { col: 0, row: 0 };
    }
    return this.chaseTarget(pacTile, pacDir, blinkyTile);
  }

  private chaseTarget(
    pacTile: TilePos,
    pacDir: Direction,
    blinkyTile: TilePos,
  ): TilePos {
    switch (this.id) {
      case GhostId.BLINKY:
        return { col: pacTile.col, row: pacTile.row };

      case GhostId.PINKY: {
        const effectiveDir = pacDir === Direction.NONE ? Direction.LEFT : pacDir;
        const { dc, dr } = dirDeltaGhost(effectiveDir);
        // Classic overflow bug: when facing UP, col is also offset by -4
        const colBias = effectiveDir === Direction.UP ? -4 : 0;
        return {
          col: pacTile.col + dc * 4 + colBias,
          row: pacTile.row + dr * 4,
        };
      }

      case GhostId.INKY: {
        const effectiveDir = pacDir === Direction.NONE ? Direction.LEFT : pacDir;
        const { dc, dr } = dirDeltaGhost(effectiveDir);
        // Classic overflow bug applies for UP direction here too
        const colBias = effectiveDir === Direction.UP ? -2 : 0;
        const intermediate = {
          col: pacTile.col + dc * 2 + colBias,
          row: pacTile.row + dr * 2,
        };
        // Double the vector from Blinky to intermediate
        return {
          col: intermediate.col + (intermediate.col - blinkyTile.col),
          row: intermediate.row + (intermediate.row - blinkyTile.row),
        };
      }

      case GhostId.CLYDE: {
        const dist = Math.sqrt(
          (this.tilePos.col - pacTile.col) ** 2 +
          (this.tilePos.row - pacTile.row) ** 2
        );
        if (dist > CLYDE_CHASE_DISTANCE) {
          return { col: pacTile.col, row: pacTile.row };
        }
        return this.scatterTarget;
      }
    }
  }

  // ─── direction selection ─────────────────────────────────────────────────

  /**
   * At a tile, choose the valid neighbor direction minimizing Euclidean
   * distance to target. No reversing allowed. FRIGHTENED = random valid dir.
   */
  chooseBestDirection(grid: number[][], tile: TilePos, target: TilePos): Direction {
    const forbidden = oppositeDir(this.direction);
    const candidates: Direction[] = [
      Direction.UP,
      Direction.LEFT,
      Direction.DOWN,
      Direction.RIGHT,
    ];

    const valid = candidates.filter(dir => {
      if (dir === forbidden) return false;
      const { dc, dr } = dirDeltaGhost(dir);
      return this.isGhostWalkable(grid, tile.col + dc, tile.row + dr);
    });

    if (valid.length === 0) {
      // Corridor dead-end: allow reverse
      const rev = oppositeDir(this.direction);
      const { dc, dr } = dirDeltaGhost(rev);
      if (this.isGhostWalkable(grid, tile.col + dc, tile.row + dr)) {
        return rev;
      }
      return this.direction;
    }

    if (this.mode === GhostMode.FRIGHTENED) {
      return valid[Math.floor(Math.random() * valid.length)] as Direction;
    }

    // Pick direction minimizing distance to target (ties broken by UP>LEFT>DOWN>RIGHT)
    let best = valid[0] as Direction;
    let bestDist = Infinity;
    for (const dir of valid) {
      const { dc, dr } = dirDeltaGhost(dir);
      const neighbor: TilePos = { col: tile.col + dc, row: tile.row + dr };
      const d = euclid(neighbor, target);
      if (d < bestDist) {
        bestDist = d;
        best = dir;
      }
    }
    return best;
  }

  // ─── walkability ─────────────────────────────────────────────────────────

  /**
   * Ghost walkability: 0, 2, 3 always walkable.
   * Tile 4 (ghost house interior) is walkable only when EATEN or not yet released.
   */
  isGhostWalkable(grid: number[][], col: number, row: number): boolean {
    if (row < 0 || row >= grid.length) return false;
    const gridRow = grid[row];
    if (!gridRow) return false;
    if (col < 0 || col >= gridRow.length) return false;
    const tile = gridRow[col];
    if (tile === 1) return false;
    if (tile === 4) {
      // Allow ghost house interior when exiting, EATEN, or not yet released
      return this.mode === GhostMode.EATEN || this._isExiting || !this.isReleased;
    }
    return true;
  }

  // ─── speed ───────────────────────────────────────────────────────────────

  normalSpeed(): number {
    return this.level >= 2 ? GHOST_SPEED_NORMAL_L2 : GHOST_SPEED_NORMAL_L1;
  }

  currentSpeed(grid: number[][]): number {
    void grid; // reserved for future per-tile speed adjustments
    if (this.mode === GhostMode.EATEN) return GHOST_SPEED_EATEN;
    if (this.mode === GhostMode.FRIGHTENED) return GHOST_SPEED_FRIGHTENED;
    const base = this.normalSpeed();
    const tile = this.tilePos;
    if (tile.row === TUNNEL_ROW) return base * TUNNEL_SPEED_FACTOR;
    return base;
  }
}
