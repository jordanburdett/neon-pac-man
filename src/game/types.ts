// Shared type definitions for Neon Pac-Man
// NOTE: TypeScript enum keyword is BANNED (erasableSyntaxOnly:true)
// Use const objects with `as const` pattern throughout.

export const Direction = {
  UP: 'UP',
  DOWN: 'DOWN',
  LEFT: 'LEFT',
  RIGHT: 'RIGHT',
  NONE: 'NONE',
} as const;
export type Direction = typeof Direction[keyof typeof Direction];

export const GameState = {
  PLAYING: 'PLAYING',
  GAME_OVER: 'GAME_OVER',
  LEVEL_COMPLETE: 'LEVEL_COMPLETE',
  DYING: 'DYING',
} as const;
export type GameState = typeof GameState[keyof typeof GameState];

export const TileType = {
  EMPTY: 0,
  WALL: 1,
  PELLET: 2,
  POWER_PELLET: 3,
  GHOST_HOUSE: 4,
} as const;
export type TileType = typeof TileType[keyof typeof TileType];

export interface Vec2 {
  x: number;
  y: number;
}

export interface TilePos {
  col: number;
  row: number;
}

export interface GhostData {
  id: string;
  color: string;
  col: number;
  row: number;
}
