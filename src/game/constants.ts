// All tunable constants for Neon Pac-Man

export const TILE_SIZE = 20;
export const COLS = 28;
export const ROWS = 31;

export const CANVAS_WIDTH = COLS * TILE_SIZE;   // 560
export const CANVAS_HEIGHT = ROWS * TILE_SIZE;  // 620

// Scoring
export const PELLET_SCORE = 10;
export const POWER_PELLET_SCORE = 50;

// Pac-Man
export const PACMAN_SPEED = 9.4 * TILE_SIZE; // pixels/sec
export const PACMAN_START_COL = 14;
export const PACMAN_START_ROW = 23;

// Ghost home area
export const GHOST_HOME_COLS = [12, 13, 14, 15];
export const GHOST_HOME_ROWS = [13, 14, 15];

// Tunnel
export const TUNNEL_ROW = 14;

// Lives
export const INITIAL_LIVES = 3;

// Frame cap
export const MAX_DT = 0.05; // seconds

// Ghost placeholder positions (story-001: static only)
export const GHOST_STARTS = [
  { id: 'blinky', color: '#FF0000', col: 14, row: 11 },
  { id: 'pinky',  color: '#FF69B4', col: 13, row: 14 },
  { id: 'inky',   color: '#00FFFF', col: 11, row: 14 },
  { id: 'clyde',  color: '#FFA500', col: 16, row: 14 },
] as const;

// Ghost AI constants
export const GHOST_HOUSE_ENTRY_COL = 13;
export const GHOST_HOUSE_ENTRY_ROW = 11;

// Mode cycle sequence: [duration_seconds, ...] alternating scatter/chase
// Indices 0,2,4,6 = scatter; indices 1,3,5,7 = chase (Infinity = indefinite)
export const MODE_CYCLE_DURATIONS: ReadonlyArray<number> = [7, 20, 7, 20, 5, 20, 5, Infinity];

// Ghost release dot thresholds (total pellets eaten when ghost exits)
export const INKY_RELEASE_DOTS = 30;
export const CLYDE_RELEASE_DOTS = 60;

// Frightened mode duration (seconds)
export const FRIGHTENED_DURATION = 6.0;
export const FRIGHTENED_FLASH_START = 2.0; // start flashing this many seconds before end

// Ghost eating combo scores
export const GHOST_EAT_SCORES: ReadonlyArray<number> = [200, 400, 800, 1600];

// Ghost speeds (tiles/sec)
export const GHOST_SPEED_NORMAL_L1 = 7.5;
export const GHOST_SPEED_NORMAL_L2 = 8.5;
export const GHOST_SPEED_FRIGHTENED = 4.0;
export const GHOST_SPEED_EATEN = 16.0;
export const TUNNEL_SPEED_FACTOR = 0.6; // 40% reduction

// Scatter corner tiles per ghost (col, row)
export const SCATTER_TARGETS = {
  blinky: { col: 25, row: 0 },
  pinky:  { col: 2,  row: 0 },
  inky:   { col: 27, row: 30 },
  clyde:  { col: 0,  row: 30 },
} as const;

// Clyde distance threshold for targeting behavior (tiles)
export const CLYDE_CHASE_DISTANCE = 8;

// Score popup display duration (seconds)
export const SCORE_POPUP_TTL = 1.0;

// Level progression (applied on each level advance)
export const LEVEL_GHOST_SPEED_INCREASE = 0.5; // tiles/sec per level
export const LEVEL_GHOST_SPEED_CAP = 12.0;     // max tiles/sec
export const LEVEL_FRIGHTENED_DECREASE = 0.5;  // seconds less per level
export const LEVEL_FRIGHTENED_FLOOR = 2.0;     // minimum frightened duration (seconds)
export const LEVEL_PACMAN_SPEED_INCREASE = 0.2; // tiles/sec per level
export const LEVEL_PACMAN_SPEED_CAP = 11.0;    // max tiles/sec (in tiles/sec)

// LocalStorage key for high score
export const HIGH_SCORE_KEY = 'neonPacManHighScore';

// Level complete flash animation
export const LEVEL_FLASH_DURATION = 1.0; // seconds
export const LEVEL_FLASH_INTERVAL = 0.1; // seconds per toggle
