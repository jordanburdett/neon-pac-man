import {
  TILE_SIZE,
  COLS,
  ROWS,
  CANVAS_WIDTH,
  CANVAS_HEIGHT,
  PACMAN_SPEED,
  PACMAN_START_COL,
  PACMAN_START_ROW,
  PELLET_SCORE,
  POWER_PELLET_SCORE,
  INITIAL_LIVES,
  MAX_DT,
  TUNNEL_ROW,
  MODE_CYCLE_DURATIONS,
  FRIGHTENED_DURATION,
  FRIGHTENED_FLASH_START,
  GHOST_EAT_SCORES,
  SCORE_POPUP_TTL,
  INKY_RELEASE_DOTS,
  CLYDE_RELEASE_DOTS,
  LEVEL_FRIGHTENED_DECREASE,
  LEVEL_FRIGHTENED_FLOOR,
  LEVEL_PACMAN_SPEED_INCREASE,
  LEVEL_PACMAN_SPEED_CAP,
  HIGH_SCORE_KEY,
  LEVEL_FLASH_DURATION,
  LEVEL_FLASH_INTERVAL,
  CORRUPTION_TIERS,
} from './constants';
import { MAZE_LAYOUT, isTileWalkable, tileCenterPx, pixelToTile, countPellets } from './mazeData';
import { Direction, GameState, GhostMode, GhostId } from './types';
import type { Vec2, ScorePopup } from './types';
import { Ghost } from './Ghost';

// ─── High-score localStorage helpers ────────────────────────────────────────

export function readHighScore(): number {
  try {
    return parseInt(localStorage.getItem(HIGH_SCORE_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

export function writeHighScore(score: number): void {
  try {
    localStorage.setItem(HIGH_SCORE_KEY, String(score));
  } catch {
    // ignore storage errors
  }
}

export function maybeUpdateHighScore(score: number): number {
  const current = readHighScore();
  if (score > current) {
    writeHighScore(score);
    return score;
  }
  return current;
}

// ─── Level progression helpers ───────────────────────────────────────────────

export function levelFrightenedDuration(level: number): number {
  const reduced = FRIGHTENED_DURATION - (level - 1) * LEVEL_FRIGHTENED_DECREASE;
  return Math.max(reduced, LEVEL_FRIGHTENED_FLOOR);
}

export function levelPacmanSpeed(level: number): number {
  const speed = PACMAN_SPEED / TILE_SIZE + (level - 1) * LEVEL_PACMAN_SPEED_INCREASE;
  return Math.min(speed, LEVEL_PACMAN_SPEED_CAP) * TILE_SIZE;
}

// ─── Color helpers ───────────────────────────────────────────────────────────

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

export class GameEngine {
  private ctx: CanvasRenderingContext2D;

  // Global elapsed time (seconds) for animations
  private globalTime = 0;

  // Game state
  private state: GameState = GameState.TITLE;
  private score = 0;
  private highScore = 0;
  private lives = INITIAL_LIVES;
  private level = 1;

  // Mutable grid (pellets get eaten)
  private grid: number[][];
  private totalPellets: number;
  private pelletsEaten = 0;

  // Pac-Man
  private pacPos: Vec2;
  private pacDir: Direction = Direction.LEFT;
  private pacNextDir: Direction = Direction.LEFT;

  // Ghosts
  private ghosts: Ghost[];
  private blinky: Ghost;
  private pinky: Ghost;
  private inky: Ghost;
  private clyde: Ghost;

  // Mode cycling state machine
  // Indices 0,2,4,6 = scatter; 1,3,5,7 = chase
  private modeCycleIndex = 0;
  private modeCycleTimer = 0;
  private globalMode: GhostMode = GhostMode.SCATTER;

  // Frightened mode
  private frightenedTimer = 0;
  private currentFrightenedDuration: number;

  // Ghost eating combo (resets each power pellet)
  private ghostEatCombo = 0;

  // Score popups
  private scorePopups: ScorePopup[] = [];

  // Dying animation
  private dyingTimer = 0;
  private readonly DYING_DURATION = 1.5;

  // Level complete flash
  private levelCompleteTimer = 0;
  private readonly LEVEL_COMPLETE_DURATION = LEVEL_FLASH_DURATION;
  private flashState = false;
  private flashAccum = 0;

  // RAF handle
  private rafHandle = 0;
  private lastTimestamp = 0;

  // Keyboard listener ref
  private onKeyDown: (e: KeyboardEvent) => void;

  // External direction input (from D-pad)
  setNextDirection(dir: Direction): void {
    this.pacNextDir = dir;
    if (this.state === GameState.GAME_OVER || this.state === GameState.TITLE) {
      this.startGame();
    }
  }

  constructor(ctx: CanvasRenderingContext2D) {
    this.ctx = ctx;
    this.highScore = readHighScore();
    this.currentFrightenedDuration = FRIGHTENED_DURATION;

    // Deep-copy the maze so we can mutate pellet tiles
    this.grid = MAZE_LAYOUT.map(row => [...row]);

    const { pellets, powerPellets } = countPellets(this.grid);
    this.totalPellets = pellets + powerPellets;

    // Pac-Man starts at the center of tile (14, 23)
    const start = tileCenterPx(PACMAN_START_COL, PACMAN_START_ROW);
    this.pacPos = { x: start.x, y: start.y };

    // Initialise ghosts
    this.blinky = new Ghost(GhostId.BLINKY, '#FF0000', 14, 11, true);
    this.pinky  = new Ghost(GhostId.PINKY,  '#FF69B4', 13, 14, false);
    this.inky   = new Ghost(GhostId.INKY,   '#00FFFF', 11, 14, false);
    this.clyde  = new Ghost(GhostId.CLYDE,  '#FFA500', 16, 14, false);

    this.ghosts = [this.blinky, this.pinky, this.inky, this.clyde];

    // Pinky exits immediately
    this.pinky.startExiting(this.grid);

    this.onKeyDown = this.handleKeyDown.bind(this);
    window.addEventListener('keydown', this.onKeyDown);

    this.startLoop();
  }

  destroy(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    cancelAnimationFrame(this.rafHandle);
  }

  private handleKeyDown(e: KeyboardEvent): void {
    const keyMap: Record<string, Direction> = {
      ArrowLeft: Direction.LEFT,
      ArrowRight: Direction.RIGHT,
      ArrowUp: Direction.UP,
      ArrowDown: Direction.DOWN,
      a: Direction.LEFT,
      d: Direction.RIGHT,
      w: Direction.UP,
      s: Direction.DOWN,
    };
    const dir = keyMap[e.key] ?? keyMap[e.key.toLowerCase()];
    if (dir) {
      e.preventDefault();
      this.pacNextDir = dir;
    }

    // On title/game over: any key starts/restarts
    if (this.state === GameState.TITLE || this.state === GameState.GAME_OVER) {
      this.startGame();
    } else if (this.state === GameState.LEVEL_COMPLETE) {
      this.advanceLevel();
    }
  }

  private startGame(): void {
    this.grid = MAZE_LAYOUT.map(row => [...row]);
    const { pellets, powerPellets } = countPellets(this.grid);
    this.totalPellets = pellets + powerPellets;
    this.pelletsEaten = 0;
    this.score = 0;
    this.lives = INITIAL_LIVES;
    this.level = 1;
    this.currentFrightenedDuration = FRIGHTENED_DURATION;
    this.state = GameState.PLAYING;
    this.resetModeTimer();
    this.frightenedTimer = 0;
    this.ghostEatCombo = 0;
    this.scorePopups = [];
    this.respawnPacMan();
    this.resetGhosts();
  }

  private respawnPacMan(): void {
    const start = tileCenterPx(PACMAN_START_COL, PACMAN_START_ROW);
    this.pacPos = { x: start.x, y: start.y };
    this.pacDir = Direction.LEFT;
    this.pacNextDir = Direction.LEFT;
  }

  private resetModeTimer(): void {
    this.modeCycleIndex = 0;
    this.modeCycleTimer = 0;
    this.globalMode = GhostMode.SCATTER;
  }

  private resetGhosts(): void {
    this.blinky.reset(this.grid, true);
    this.pinky.reset(this.grid, false);
    this.inky.reset(this.grid, false);
    this.clyde.reset(this.grid, false);
    for (const g of this.ghosts) {
      g.level = this.level;
    }
    // Pinky exits immediately
    this.pinky.startExiting(this.grid);
  }

  private startLoop(): void {
    const loop = (timestamp: number) => {
      if (this.lastTimestamp === 0) this.lastTimestamp = timestamp;
      const rawDt = (timestamp - this.lastTimestamp) / 1000;
      const dt = Math.min(rawDt, MAX_DT);
      this.lastTimestamp = timestamp;

      this.globalTime += dt;

      this.update(dt);
      this.render();

      this.rafHandle = requestAnimationFrame(loop);
    };
    this.rafHandle = requestAnimationFrame(loop);
  }

  private update(dt: number): void {
    if (this.state === GameState.TITLE) return;

    if (this.state === GameState.DYING) {
      this.dyingTimer -= dt;
      if (this.dyingTimer <= 0) {
        if (this.lives > 0) {
          this.respawnPacMan();
          this.resetGhosts();
          this.frightenedTimer = 0;
          this.ghostEatCombo = 0;
          this.state = GameState.PLAYING;
        } else {
          this.highScore = maybeUpdateHighScore(this.score);
          this.state = GameState.GAME_OVER;
        }
      }
      return;
    }

    if (this.state === GameState.LEVEL_COMPLETE) {
      this.levelCompleteTimer -= dt;
      // Wall flash toggle
      this.flashAccum += dt;
      if (this.flashAccum >= LEVEL_FLASH_INTERVAL) {
        this.flashAccum -= LEVEL_FLASH_INTERVAL;
        this.flashState = !this.flashState;
      }
      if (this.levelCompleteTimer <= 0) {
        this.advanceLevel();
      }
      return;
    }

    if (this.state !== GameState.PLAYING) return;

    // Update score popups
    this.scorePopups = this.scorePopups.filter(p => p.ttl > 0);
    for (const p of this.scorePopups) p.ttl -= dt;

    // Mode cycle timer (paused during frightened)
    if (this.frightenedTimer <= 0) {
      this.updateModeCycle(dt);
    }

    // Frightened timer
    if (this.frightenedTimer > 0) {
      this.frightenedTimer -= dt;
      if (this.frightenedTimer <= 0) {
        this.frightenedTimer = 0;
        this.ghostEatCombo = 0;
        for (const g of this.ghosts) {
          g.onFrightenedEnd(this.globalMode);
        }
      }
    }

    // Ghost release based on pellets eaten
    if (!this.inky.isReleased && !this.inky.isExiting && this.pelletsEaten >= INKY_RELEASE_DOTS) {
      this.inky.startExiting(this.grid);
    }
    if (!this.clyde.isReleased && !this.clyde.isExiting && this.pelletsEaten >= CLYDE_RELEASE_DOTS) {
      this.clyde.startExiting(this.grid);
    }

    this.movePacMan(dt);
    this.checkPelletCollision();
    this.updateGhosts(dt);
    this.checkGhostCollision();
  }

  private updateModeCycle(dt: number): void {
    const duration = MODE_CYCLE_DURATIONS[this.modeCycleIndex] ?? Infinity;
    if (duration === Infinity) return; // indefinite chase

    this.modeCycleTimer += dt;
    if (this.modeCycleTimer >= duration) {
      this.modeCycleTimer -= duration;
      this.modeCycleIndex = Math.min(this.modeCycleIndex + 1, MODE_CYCLE_DURATIONS.length - 1);
      // Even indices = SCATTER, odd indices = CHASE
      this.globalMode = this.modeCycleIndex % 2 === 0 ? GhostMode.SCATTER : GhostMode.CHASE;
      for (const g of this.ghosts) {
        g.onGlobalModeChange(this.globalMode);
      }
    }
  }

  private updateGhosts(dt: number): void {
    const pacTile = pixelToTile(this.pacPos.x, this.pacPos.y);
    const blinkyTile = this.blinky.tilePos;

    for (const g of this.ghosts) {
      g.update(dt, this.grid, pacTile, this.pacDir, blinkyTile);
    }
  }

  private advanceLevel(): void {
    this.level++;
    // Apply level progression
    this.currentFrightenedDuration = levelFrightenedDuration(this.level);
    // Apply ghost speed increase via their level property
    this.grid = MAZE_LAYOUT.map(row => [...row]);
    const { pellets, powerPellets } = countPellets(this.grid);
    this.totalPellets = pellets + powerPellets;
    this.pelletsEaten = 0;
    this.flashState = false;
    this.flashAccum = 0;
    this.state = GameState.PLAYING;
    this.resetModeTimer();
    this.frightenedTimer = 0;
    this.ghostEatCombo = 0;
    this.scorePopups = [];
    this.respawnPacMan();
    this.resetGhosts();
  }

  private movePacMan(dt: number): void {
    const speed = levelPacmanSpeed(this.level);

    // Try switching to next direction if grid-aligned
    const aligned =
      Math.abs((this.pacPos.x % TILE_SIZE) - TILE_SIZE / 2) < 2 &&
      Math.abs((this.pacPos.y % TILE_SIZE) - TILE_SIZE / 2) < 2;

    if (aligned && this.pacNextDir !== Direction.NONE) {
      const { col, row } = pixelToTile(this.pacPos.x, this.pacPos.y);
      const { dc, dr } = dirDelta(this.pacNextDir);
      const nextCol = col + dc;
      const nextRow = row + dr;
      if (isTileWalkable(this.grid, nextCol, nextRow)) {
        this.pacDir = this.pacNextDir;
        this.pacPos.x = col * TILE_SIZE + TILE_SIZE / 2;
        this.pacPos.y = row * TILE_SIZE + TILE_SIZE / 2;
      }
    }

    const { dc, dr } = dirDelta(this.pacDir);
    const newX = this.pacPos.x + dc * speed * dt;
    const newY = this.pacPos.y + dr * speed * dt;

    const radius = TILE_SIZE * 0.4;
    const leadX = newX + dc * radius;
    const leadY = newY + dr * radius;
    const { col: leadCol, row: leadRow } = pixelToTile(leadX, leadY);

    if (isTileWalkable(this.grid, leadCol, leadRow)) {
      this.pacPos.x = newX;
      this.pacPos.y = newY;
    } else {
      const curTile = pixelToTile(this.pacPos.x, this.pacPos.y);
      this.pacPos.x = curTile.col * TILE_SIZE + TILE_SIZE / 2;
      this.pacPos.y = curTile.row * TILE_SIZE + TILE_SIZE / 2;
    }

    // Tunnel wrapping at TUNNEL_ROW
    const curRow = pixelToTile(this.pacPos.x, this.pacPos.y).row;
    if (curRow === TUNNEL_ROW) {
      if (this.pacPos.x < 0) {
        this.pacPos.x = (COLS - 1) * TILE_SIZE + TILE_SIZE / 2;
      } else if (this.pacPos.x > COLS * TILE_SIZE) {
        this.pacPos.x = TILE_SIZE / 2;
      }
    }
  }

  private checkPelletCollision(): void {
    const { col, row } = pixelToTile(this.pacPos.x, this.pacPos.y);
    if (row < 0 || row >= this.grid.length) return;
    const gridRow = this.grid[row];
    if (!gridRow) return;
    const tile = gridRow[col];

    if (tile === 2) {
      gridRow[col] = 0;
      this.score += PELLET_SCORE;
      this.pelletsEaten++;
      this.highScore = maybeUpdateHighScore(this.score);
      if (this.pelletsEaten >= this.totalPellets) {
        this.state = GameState.LEVEL_COMPLETE;
        this.levelCompleteTimer = this.LEVEL_COMPLETE_DURATION;
        this.flashState = false;
        this.flashAccum = 0;
      }
    } else if (tile === 3) {
      gridRow[col] = 0;
      this.score += POWER_PELLET_SCORE;
      this.pelletsEaten++;
      this.highScore = maybeUpdateHighScore(this.score);
      // Trigger frightened mode
      this.frightenedTimer = this.currentFrightenedDuration;
      this.ghostEatCombo = 0;
      for (const g of this.ghosts) {
        g.onFrightened();
      }
      if (this.pelletsEaten >= this.totalPellets) {
        this.state = GameState.LEVEL_COMPLETE;
        this.levelCompleteTimer = this.LEVEL_COMPLETE_DURATION;
        this.flashState = false;
        this.flashAccum = 0;
      }
    }
  }

  private checkGhostCollision(): void {
    const collisionRadius = TILE_SIZE * 0.75;
    for (const ghost of this.ghosts) {
      const dx = this.pacPos.x - ghost.pixelPos.x;
      const dy = this.pacPos.y - ghost.pixelPos.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist >= collisionRadius) continue;

      if (ghost.mode === GhostMode.FRIGHTENED) {
        // Eat the ghost
        const pts = GHOST_EAT_SCORES[Math.min(this.ghostEatCombo, GHOST_EAT_SCORES.length - 1)] ?? 1600;
        this.score += pts;
        this.highScore = maybeUpdateHighScore(this.score);
        this.ghostEatCombo++;
        ghost.onEaten(this.grid);
        // Score popup at ghost position
        this.scorePopups.push({
          x: ghost.pixelPos.x,
          y: ghost.pixelPos.y,
          value: pts,
          ttl: SCORE_POPUP_TTL,
        });
      } else if (ghost.mode === GhostMode.CHASE || ghost.mode === GhostMode.SCATTER) {
        // Pac-Man dies
        this.lives--;
        this.state = GameState.DYING;
        this.dyingTimer = this.DYING_DURATION;
        return;
      }
      // EATEN ghosts don't hurt Pac-Man
    }
  }

  // ─── rendering ───────────────────────────────────────────────────────────

  private render(): void {
    const ctx = this.ctx;
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    if (this.state === GameState.TITLE) {
      this.renderTitleScreen();
      return;
    }

    this.renderMaze();
    if (this.score >= CORRUPTION_TIERS[1]) {
      this.renderWallTendrils();
    }
    if (this.score >= CORRUPTION_TIERS[3]) {
      this.renderPelletHalos();
    }
    this.renderPellets();
    this.renderGhostTrails();
    this.renderGhosts();
    this.renderPacMan();
    this.renderScorePopups();
    this.renderHUD();

    if (this.state === GameState.DYING) {
      this.renderDyingOverlay();
    } else if (this.state === GameState.GAME_OVER) {
      this.renderGameOver();
    } else if (this.state === GameState.LEVEL_COMPLETE) {
      this.renderLevelComplete();
    }
  }

  private renderMaze(): void {
    const ctx = this.ctx;

    // For level-complete flash: alternate wall color between blue and white
    const isFlashing = this.state === GameState.LEVEL_COMPLETE;
    const wallColor = isFlashing && this.flashState ? '#ffffff' : '#00BFFF';

    ctx.save();
    ctx.shadowColor = wallColor;
    ctx.shadowBlur = 8;
    ctx.strokeStyle = wallColor;
    ctx.lineWidth = 1;

    for (let r = 0; r < ROWS; r++) {
      const row = this.grid[r];
      if (!row) continue;
      for (let c = 0; c < COLS; c++) {
        if (row[c] === 1) {
          ctx.fillStyle = wallColor;
          ctx.fillRect(c * TILE_SIZE, r * TILE_SIZE, TILE_SIZE, TILE_SIZE);
        }
      }
    }

    ctx.restore();
  }

  private renderWallTendrils(): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(80,120,255,0.18)';

    for (let r = 0; r < ROWS; r++) {
      const row = this.grid[r];
      if (!row) continue;
      for (let c = 0; c < COLS; c++) {
        if (row[c] !== 1) continue;

        // Check each diagonal neighbor; draw a tendril toward each that is also a wall
        const diagonals: [number, number][] = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
        for (const [dr, dc] of diagonals) {
          const nr = r + dr;
          const nc = c + dc;
          if (this.grid[nr]?.[nc] !== 1) continue;

          // Corner pixel of this wall tile toward that diagonal
          const px = c * TILE_SIZE + ((dc + 1) / 2) * TILE_SIZE;
          const py = r * TILE_SIZE + ((dr + 1) / 2) * TILE_SIZE;

          const alpha = Math.sin(this.globalTime * 2 + c * 0.4 + r * 0.3) * 0.12 + 0.13;
          ctx.globalAlpha = Math.max(0, alpha);

          ctx.beginPath();
          ctx.moveTo(px, py);
          ctx.lineTo(px + dc * 7, py + dr * 7);
          ctx.stroke();
        }
      }
    }

    ctx.globalAlpha = 1;
    ctx.restore();
  }

  private renderPellets(): void {
    const ctx = this.ctx;

    for (let r = 0; r < ROWS; r++) {
      const row = this.grid[r];
      if (!row) continue;
      for (let c = 0; c < COLS; c++) {
        const cx = c * TILE_SIZE + TILE_SIZE / 2;
        const cy = r * TILE_SIZE + TILE_SIZE / 2;
        if (row[c] === 2) {
          ctx.save();
          ctx.fillStyle = '#FFD700';
          ctx.shadowColor = '#FFD700';
          ctx.shadowBlur = 4;
          ctx.beginPath();
          ctx.arc(cx, cy, 3, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        } else if (row[c] === 3) {
          // Pulsing power pellet
          const pulse = 8 + 12 * Math.abs(Math.sin(this.globalTime * 2));
          ctx.save();
          ctx.fillStyle = '#FF00FF';
          ctx.shadowColor = '#FF00FF';
          ctx.shadowBlur = pulse;
          ctx.beginPath();
          ctx.arc(cx, cy, 7, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
      }
    }
  }

  private renderGhostTrails(): void {
    const ctx = this.ctx;

    for (const ghost of this.ghosts) {
      if (ghost.trailPositions.length === 0) continue;
      for (let i = 0; i < ghost.trailPositions.length; i++) {
        const trail = ghost.trailPositions[i];
        if (!trail) continue;
        // Oldest trail at index 0 is most faded
        const alpha = this.score >= CORRUPTION_TIERS[2]
          ? 0.35 - i * 0.08
          : 0.5 - i * 0.08;
        ctx.save();
        ctx.globalAlpha = Math.max(0, alpha);
        ctx.fillStyle = ghost.color;
        ctx.beginPath();
        if (this.score >= CORRUPTION_TIERS[2]) {
          // Tier 2: directional ellipse bleed-smear
          ctx.ellipse(trail.x, trail.y, 5, 3, 0, 0, Math.PI * 2);
        } else {
          ctx.arc(trail.x, trail.y, 4, 0, Math.PI * 2);
        }
        ctx.fill();
        ctx.restore();
      }
    }
  }

  private renderPelletHalos(): void {
    const ctx = this.ctx;
    const ghostColors = ['#FF0000', '#FF69B4', '#00FFFF', '#FFA500'];

    ctx.save();
    for (let r = 0; r < ROWS; r++) {
      const row = this.grid[r];
      if (!row) continue;
      for (let c = 0; c < COLS; c++) {
        if (row[c] !== 2) continue;
        const cx = c * TILE_SIZE + TILE_SIZE / 2;
        const cy = r * TILE_SIZE + TILE_SIZE / 2;
        const color = ghostColors[(r * COLS + c) % 4] as string;
        const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, 14);
        gradient.addColorStop(0, hexToRgba(color, 0.18));
        gradient.addColorStop(1, 'transparent');
        ctx.fillStyle = gradient;
        ctx.fillRect(cx - 14, cy - 14, 28, 28);
      }
    }
    ctx.restore();
  }

  private renderGhosts(): void {
    const radius = TILE_SIZE * 0.45;

    for (const ghost of this.ghosts) {
      if (ghost.mode === GhostMode.EATEN) {
        this.renderGhostEyes(ghost.pixelPos.x, ghost.pixelPos.y, ghost.direction);
        continue;
      }

      let bodyColor = ghost.color;
      let frightened = false;

      if (ghost.mode === GhostMode.FRIGHTENED) {
        frightened = true;
        // Flash between blue and white in the last 2 seconds
        if (this.frightenedTimer < FRIGHTENED_FLASH_START) {
          const flash = Math.floor(this.frightenedTimer / 0.25) % 2 === 0;
          bodyColor = flash ? '#1A1AFF' : '#ffffff';
        } else {
          bodyColor = '#1A1AFF';
        }
      }

      this.renderGhostBody(ghost.pixelPos.x, ghost.pixelPos.y, radius, bodyColor, ghost.direction, frightened);
    }
  }

  private renderGhostBody(
    x: number,
    y: number,
    radius: number,
    color: string,
    direction: Direction,
    frightened: boolean,
  ): void {
    const ctx = this.ctx;

    ctx.save();
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 6;

    // Ghost body: semicircle top + rectangular sides + 3 scalloped bumps at bottom
    const top = y - radius;
    const bottom = y + radius;
    const left = x - radius;
    const right = x + radius;

    ctx.beginPath();
    // Semicircle top
    ctx.arc(x, y, radius, Math.PI, 0, false);
    // Right side down
    ctx.lineTo(right, bottom);
    // 3 scalloped bumps at bottom (right to left)
    const bumpR = radius / 3;
    ctx.arc(x + bumpR, bottom, bumpR, 0, Math.PI, true);
    ctx.arc(x, bottom, bumpR, 0, Math.PI, true);
    ctx.arc(x - bumpR, bottom, bumpR, 0, Math.PI, true);
    // Left side back up
    ctx.lineTo(left, top + radius); // back to semicircle start
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // Eyes (only when not frightened)
    if (!frightened) {
      this.renderGhostEyes(x, y, direction);
    } else {
      // Frightened: draw simple wavy mouth
      ctx.save();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      const mouthY = y + radius * 0.3;
      const mouthLeft = x - radius * 0.5;
      const mouthRight = x + radius * 0.5;
      const waveH = radius * 0.2;
      ctx.moveTo(mouthLeft, mouthY);
      ctx.quadraticCurveTo(mouthLeft + radius * 0.25, mouthY - waveH, x, mouthY);
      ctx.quadraticCurveTo(x + radius * 0.25, mouthY + waveH, mouthRight, mouthY);
      ctx.stroke();
      ctx.restore();
    }
  }

  private renderGhostEyes(x: number, y: number, direction: Direction): void {
    const ctx = this.ctx;
    const eyeRadius = TILE_SIZE * 0.15;
    const pupilRadius = TILE_SIZE * 0.08;
    const eyeOffsetX = TILE_SIZE * 0.15;
    const eyeOffsetY = TILE_SIZE * 0.1;

    // Pupil offset based on direction
    const dirOffsets: Record<Direction, { px: number; py: number }> = {
      LEFT:  { px: -2, py: 0 },
      RIGHT: { px: 2,  py: 0 },
      UP:    { px: 0,  py: -2 },
      DOWN:  { px: 0,  py: 2 },
      NONE:  { px: 0,  py: 0 },
    };
    const { px, py } = dirOffsets[direction];

    // Left eye white
    ctx.save();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(x - eyeOffsetX, y - eyeOffsetY, eyeRadius, 0, Math.PI * 2);
    ctx.fill();
    // Right eye white
    ctx.beginPath();
    ctx.arc(x + eyeOffsetX, y - eyeOffsetY, eyeRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Pupils (colored)
    ctx.save();
    ctx.fillStyle = '#4444ff';
    ctx.beginPath();
    ctx.arc(x - eyeOffsetX + px, y - eyeOffsetY + py, pupilRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x + eyeOffsetX + px, y - eyeOffsetY + py, pupilRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  private renderPacMan(): void {
    if (this.state === GameState.DYING && this.dyingTimer < this.DYING_DURATION * 0.5) {
      return;
    }
    const ctx = this.ctx;
    const radius = TILE_SIZE * 0.45;

    // Animated mouth: opens/closes based on globalTime
    const mouth = Math.abs(Math.sin(this.globalTime * 8)) * 0.35;

    const rotations: Record<Direction, number> = {
      RIGHT: 0,
      DOWN: Math.PI / 2,
      LEFT: Math.PI,
      UP: -Math.PI / 2,
      NONE: 0,
    };
    const rotation = rotations[this.pacDir];

    ctx.save();
    ctx.fillStyle = '#FFE000';
    ctx.shadowColor = '#FFE000';
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.moveTo(this.pacPos.x, this.pacPos.y);
    ctx.arc(
      this.pacPos.x,
      this.pacPos.y,
      radius,
      rotation + (0.35 + mouth),
      rotation + Math.PI * 2 - (0.35 + mouth),
    );
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  private renderScorePopups(): void {
    const ctx = this.ctx;
    ctx.font = 'bold 12px monospace';
    ctx.textAlign = 'center';
    for (const p of this.scorePopups) {
      const alpha = Math.min(1, p.ttl / SCORE_POPUP_TTL);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = '#ffffff';
      ctx.fillText(`${p.value}`, p.x, p.y);
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = 'left';
  }

  private renderHUD(): void {
    const ctx = this.ctx;

    // Score top-left
    ctx.fillStyle = '#FFE000';
    ctx.font = '14px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`SCORE: ${this.score}`, 8, 16);

    // High score top-center
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(`HI: ${this.highScore}`, CANVAS_WIDTH / 2, 16);

    // Level top-right
    ctx.textAlign = 'right';
    ctx.fillStyle = '#00BFFF';
    ctx.fillText(`LVL: ${this.level}`, CANVAS_WIDTH - 8, 16);

    ctx.textAlign = 'left';

    // Lives: small Pac-Man arc icons bottom-left (radius 7px)
    for (let i = 0; i < this.lives; i++) {
      const lx = 16 + i * 20;
      const ly = CANVAS_HEIGHT - 12;
      ctx.save();
      ctx.fillStyle = '#FFE000';
      ctx.shadowColor = '#FFE000';
      ctx.shadowBlur = 6;
      ctx.beginPath();
      ctx.moveTo(lx, ly);
      ctx.arc(lx, ly, 7, 0.3 * Math.PI, 1.7 * Math.PI);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  private renderDyingOverlay(): void {
    const ctx = this.ctx;
    ctx.fillStyle = 'rgba(255,0,0,0.3)';
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  }

  private renderTitleScreen(): void {
    const ctx = this.ctx;

    // Dimly lit maze in background at 20% opacity
    ctx.save();
    ctx.globalAlpha = 0.2;
    this.renderMaze();
    ctx.restore();

    // Title
    ctx.save();
    ctx.fillStyle = '#FFE000';
    ctx.shadowColor = '#FFE000';
    ctx.shadowBlur = 20;
    ctx.font = 'bold 36px Orbitron, monospace';
    ctx.textAlign = 'center';
    ctx.fillText('NEON PAC-MAN', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 40);
    ctx.restore();

    // Subtitle
    ctx.save();
    ctx.fillStyle = '#00BFFF';
    ctx.shadowColor = '#00BFFF';
    ctx.shadowBlur = 10;
    ctx.font = '14px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('PRESS ANY KEY OR TAP TO START', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 20);
    ctx.restore();

    // High score
    ctx.fillStyle = '#ffffff';
    ctx.font = '13px monospace';
    ctx.textAlign = 'center';
    if (this.highScore > 0) {
      ctx.fillText(`BEST: ${this.highScore}`, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 50);
    }
    ctx.textAlign = 'left';
  }

  private renderGameOver(): void {
    const ctx = this.ctx;

    // Semi-transparent dark overlay
    ctx.fillStyle = 'rgba(0,0,0,0.8)';
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // GAME OVER text
    ctx.save();
    ctx.fillStyle = '#FF0000';
    ctx.shadowColor = '#FF0000';
    ctx.shadowBlur = 20;
    ctx.font = 'bold 36px Orbitron, monospace';
    ctx.textAlign = 'center';
    ctx.fillText('GAME OVER', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 40);
    ctx.restore();

    // Score
    ctx.fillStyle = '#FFE000';
    ctx.font = '18px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`SCORE: ${this.score}`, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 5);

    // High score
    ctx.fillStyle = '#ffffff';
    ctx.font = '16px monospace';
    ctx.fillText(`BEST: ${this.highScore}`, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 30);

    ctx.fillStyle = '#00BFFF';
    ctx.font = '13px monospace';
    ctx.fillText('TAP OR PRESS ANY KEY TO RESTART', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 60);
    ctx.textAlign = 'left';
  }

  private renderLevelComplete(): void {
    const ctx = this.ctx;

    // The maze flash is handled in renderMaze() via flashState
    // Just show a brief overlay message
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    ctx.save();
    ctx.fillStyle = this.flashState ? '#ffffff' : '#00FF00';
    ctx.shadowColor = ctx.fillStyle;
    ctx.shadowBlur = 20;
    ctx.font = 'bold 28px Orbitron, monospace';
    ctx.textAlign = 'center';
    ctx.fillText('LEVEL COMPLETE!', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 20);
    ctx.restore();

    ctx.fillStyle = '#FFE000';
    ctx.font = '18px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`SCORE: ${this.score}`, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 20);
    ctx.textAlign = 'left';
  }

  // ─── accessors for testing ────────────────────────────────────────────────
  getScore(): number { return this.score; }
  getLives(): number { return this.lives; }
  getState(): GameState { return this.state; }
  getPelletsEaten(): number { return this.pelletsEaten; }
  getGhosts(): Ghost[] { return this.ghosts; }
  getGlobalMode(): GhostMode { return this.globalMode; }
  getFrightenedTimer(): number { return this.frightenedTimer; }
  getModeCycleIndex(): number { return this.modeCycleIndex; }
  getLevel(): number { return this.level; }
  getHighScore(): number { return this.highScore; }
  getGlobalTime(): number { return this.globalTime; }
}

// Helper: direction to column/row deltas
function dirDelta(dir: Direction): { dc: number; dr: number } {
  switch (dir) {
    case Direction.LEFT:  return { dc: -1, dr: 0 };
    case Direction.RIGHT: return { dc: 1,  dr: 0 };
    case Direction.UP:    return { dc: 0,  dr: -1 };
    case Direction.DOWN:  return { dc: 0,  dr: 1 };
    case Direction.NONE:  return { dc: 0,  dr: 0 };
  }
}
