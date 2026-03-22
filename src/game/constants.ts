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
