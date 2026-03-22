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
} from './constants';
import { MAZE_LAYOUT, isTileWalkable, tileCenterPx, pixelToTile, countPellets } from './mazeData';
import { Direction, GameState, GhostMode, GhostId } from './types';
import type { Vec2, ScorePopup } from './types';
import { Ghost } from './Ghost';

export class GameEngine {
  private ctx: CanvasRenderingContext2D;

  // Game state
  private state: GameState = GameState.PLAYING;
  private score = 0;
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

  // Ghost eating combo (resets each power pellet)
  private ghostEatCombo = 0;

  // Score popups
  private scorePopups: ScorePopup[] = [];

  // Dying animation
  private dyingTimer = 0;
  private readonly DYING_DURATION = 1.5;

  // Level complete timer
  private levelCompleteTimer = 0;
  private readonly LEVEL_COMPLETE_DURATION = 2.0;

  // RAF handle
  private rafHandle = 0;
  private lastTimestamp = 0;

  // Keyboard listener ref
  private onKeyDown: (e: KeyboardEvent) => void;

  constructor(ctx: CanvasRenderingContext2D) {
    this.ctx = ctx;

    // Deep-copy the maze so we can mutate pellet tiles
    this.grid = MAZE_LAYOUT.map(row => [...row]);

    const { pellets, powerPellets } = countPellets(this.grid);
    this.totalPellets = pellets + powerPellets;

    // Pac-Man starts at the center of tile (14, 23)
    const start = tileCenterPx(PACMAN_START_COL, PACMAN_START_ROW);
    this.pacPos = { x: start.x, y: start.y };

    // Initialise ghosts
    // Blinky: starts outside ghost house, immediately released
    this.blinky = new Ghost(GhostId.BLINKY, '#FF0000', 14, 11, true);
    // Pinky: inside house but exits immediately — triggered on first frame
    this.pinky  = new Ghost(GhostId.PINKY,  '#FF69B4', 13, 14, false);
    // Inky: inside house, exits after 30 pellets
    this.inky   = new Ghost(GhostId.INKY,   '#00FFFF', 11, 14, false);
    // Clyde: inside house, exits after 60 pellets
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

    // Restart on Game Over; advance level on Level Complete (preserve score)
    if (this.state === GameState.GAME_OVER) {
      this.restart();
    } else if (this.state === GameState.LEVEL_COMPLETE) {
      this.advanceLevel();
    }
  }

  private restart(): void {
    this.grid = MAZE_LAYOUT.map(row => [...row]);
    const { pellets, powerPellets } = countPellets(this.grid);
    this.totalPellets = pellets + powerPellets;
    this.pelletsEaten = 0;
    this.score = 0;
    this.lives = INITIAL_LIVES;
    this.level = 1;
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

      this.update(dt);
      this.render();

      this.rafHandle = requestAnimationFrame(loop);
    };
    this.rafHandle = requestAnimationFrame(loop);
  }

  private update(dt: number): void {
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
          this.state = GameState.GAME_OVER;
        }
      }
      return;
    }

    if (this.state === GameState.LEVEL_COMPLETE) {
      this.levelCompleteTimer -= dt;
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
    if (!this.inky.isReleased && !this.inky['isExiting'] && this.pelletsEaten >= INKY_RELEASE_DOTS) {
      this.inky.startExiting(this.grid);
    }
    if (!this.clyde.isReleased && !this.clyde['isExiting'] && this.pelletsEaten >= CLYDE_RELEASE_DOTS) {
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
    this.grid = MAZE_LAYOUT.map(row => [...row]);
    const { pellets, powerPellets } = countPellets(this.grid);
    this.totalPellets = pellets + powerPellets;
    this.pelletsEaten = 0;
    this.state = GameState.PLAYING;
    this.resetModeTimer();
    this.frightenedTimer = 0;
    this.ghostEatCombo = 0;
    this.scorePopups = [];
    this.respawnPacMan();
    this.resetGhosts();
  }

  private movePacMan(dt: number): void {
    const speed = PACMAN_SPEED;

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
      if (this.pelletsEaten >= this.totalPellets) {
        this.state = GameState.LEVEL_COMPLETE;
        this.levelCompleteTimer = this.LEVEL_COMPLETE_DURATION;
      }
    } else if (tile === 3) {
      gridRow[col] = 0;
      this.score += POWER_PELLET_SCORE;
      this.pelletsEaten++;
      // Trigger frightened mode
      this.frightenedTimer = FRIGHTENED_DURATION;
      this.ghostEatCombo = 0;
      for (const g of this.ghosts) {
        g.onFrightened();
      }
      if (this.pelletsEaten >= this.totalPellets) {
        this.state = GameState.LEVEL_COMPLETE;
        this.levelCompleteTimer = this.LEVEL_COMPLETE_DURATION;
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
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    this.renderMaze();
    this.renderPellets();
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
    ctx.fillStyle = '#1a1aff';
    for (let r = 0; r < ROWS; r++) {
      const row = this.grid[r];
      if (!row) continue;
      for (let c = 0; c < COLS; c++) {
        if (row[c] === 1) {
          ctx.fillRect(c * TILE_SIZE, r * TILE_SIZE, TILE_SIZE, TILE_SIZE);
        }
      }
    }
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
          ctx.fillStyle = '#FFD700';
          ctx.beginPath();
          ctx.arc(cx, cy, 2, 0, Math.PI * 2);
          ctx.fill();
        } else if (row[c] === 3) {
          ctx.fillStyle = '#FF00FF';
          ctx.beginPath();
          ctx.arc(cx, cy, 5, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  }

  private renderGhosts(): void {
    const ctx = this.ctx;
    const radius = TILE_SIZE * 0.45;

    for (const ghost of this.ghosts) {
      let color = ghost.color;

      if (ghost.mode === GhostMode.FRIGHTENED) {
        // Flash between blue and white in the last 2 seconds
        if (this.frightenedTimer < FRIGHTENED_FLASH_START) {
          const flash = Math.floor(this.frightenedTimer / 0.25) % 2 === 0;
          color = flash ? '#1a1aff' : '#ffffff';
        } else {
          color = '#1a1aff';
        }
      } else if (ghost.mode === GhostMode.EATEN) {
        // Render as two eyes only
        this.renderGhostEyes(ghost.pixelPos.x, ghost.pixelPos.y);
        continue;
      }

      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(ghost.pixelPos.x, ghost.pixelPos.y, radius, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private renderGhostEyes(x: number, y: number): void {
    const ctx = this.ctx;
    const eyeRadius = TILE_SIZE * 0.15;
    const eyeOffsetX = TILE_SIZE * 0.15;
    const eyeOffsetY = TILE_SIZE * 0.1;

    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(x - eyeOffsetX, y - eyeOffsetY, eyeRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x + eyeOffsetX, y - eyeOffsetY, eyeRadius, 0, Math.PI * 2);
    ctx.fill();
  }

  private renderPacMan(): void {
    if (this.state === GameState.DYING && this.dyingTimer < this.DYING_DURATION * 0.5) {
      return;
    }
    const ctx = this.ctx;
    const radius = TILE_SIZE * 0.45;
    const mouthAngle = 0.25 * Math.PI;

    const rotations: Record<Direction, number> = {
      RIGHT: 0,
      DOWN: Math.PI / 2,
      LEFT: Math.PI,
      UP: -Math.PI / 2,
      NONE: 0,
    };
    const rotation = rotations[this.pacDir];

    ctx.fillStyle = '#FFE000';
    ctx.beginPath();
    ctx.moveTo(this.pacPos.x, this.pacPos.y);
    ctx.arc(
      this.pacPos.x,
      this.pacPos.y,
      radius,
      rotation + mouthAngle,
      rotation + Math.PI * 2 - mouthAngle
    );
    ctx.closePath();
    ctx.fill();
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
    ctx.fillStyle = '#FFE000';
    ctx.font = '14px monospace';
    ctx.fillText(`SCORE: ${this.score}`, 8, CANVAS_HEIGHT - 8);
    ctx.fillText(`LEVEL: ${this.level}`, CANVAS_WIDTH / 2 - 30, CANVAS_HEIGHT - 8);

    // Lives as small Pac-Man arcs
    ctx.fillStyle = '#FFE000';
    for (let i = 0; i < this.lives; i++) {
      const lx = CANVAS_WIDTH - 20 - i * 18;
      const ly = CANVAS_HEIGHT - 10;
      ctx.beginPath();
      ctx.arc(lx, ly, 6, 0.2 * Math.PI, 1.8 * Math.PI);
      ctx.moveTo(lx, ly);
      ctx.closePath();
      ctx.fill();
    }
  }

  private renderDyingOverlay(): void {
    const ctx = this.ctx;
    ctx.fillStyle = 'rgba(255,0,0,0.3)';
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  }

  private renderGameOver(): void {
    const ctx = this.ctx;
    ctx.fillStyle = 'rgba(0,0,0,0.75)';
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    ctx.fillStyle = '#FF0000';
    ctx.font = 'bold 36px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('GAME OVER', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 20);

    ctx.fillStyle = '#FFE000';
    ctx.font = '18px monospace';
    ctx.fillText(`SCORE: ${this.score}`, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 20);

    ctx.fillStyle = '#fff';
    ctx.font = '13px monospace';
    ctx.fillText('PRESS ANY KEY TO RESTART', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 55);
    ctx.textAlign = 'left';
  }

  private renderLevelComplete(): void {
    const ctx = this.ctx;
    ctx.fillStyle = 'rgba(0,0,0,0.75)';
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    ctx.fillStyle = '#00FF00';
    ctx.font = 'bold 28px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('LEVEL COMPLETE!', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 20);

    ctx.fillStyle = '#FFE000';
    ctx.font = '18px monospace';
    ctx.fillText(`SCORE: ${this.score}`, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 20);

    ctx.fillStyle = '#fff';
    ctx.font = '13px monospace';
    ctx.fillText('PRESS ANY KEY FOR NEXT LEVEL', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 55);
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
