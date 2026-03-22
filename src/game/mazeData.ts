import { COLS, ROWS, TILE_SIZE } from './constants';
import type { Direction } from './types';

// Tile value legend:
//   0 = empty walkable
//   1 = wall
//   2 = pellet
//   3 = power-pellet
//   4 = ghost-house interior (walkable by ghosts only)

export const MAZE_LAYOUT: number[][] = [
  // Row 0
  [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
  // Row 1
  [1,2,2,2,2,2,2,2,2,2,2,2,2,1,1,2,2,2,2,2,2,2,2,2,2,2,2,1],
  // Row 2
  [1,2,1,1,1,1,2,1,1,1,1,1,2,1,1,2,1,1,1,1,1,2,1,1,1,1,2,1],
  // Row 3
  [1,3,1,1,1,1,2,1,1,1,1,1,2,1,1,2,1,1,1,1,1,2,1,1,1,1,3,1],
  // Row 4
  [1,2,1,1,1,1,2,1,1,1,1,1,2,1,1,2,1,1,1,1,1,2,1,1,1,1,2,1],
  // Row 5
  [1,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,1],
  // Row 6
  [1,2,1,1,1,1,2,1,1,2,1,1,1,1,1,1,1,1,2,1,1,2,1,1,1,1,2,1],
  // Row 7
  [1,2,1,1,1,1,2,1,1,2,1,1,1,1,1,1,1,1,2,1,1,2,1,1,1,1,2,1],
  // Row 8
  [1,2,2,2,2,2,2,1,1,2,2,2,2,1,1,2,2,2,2,1,1,2,2,2,2,2,2,1],
  // Row 9
  [1,1,1,1,1,1,2,1,1,1,1,1,0,1,1,0,1,1,1,1,1,2,1,1,1,1,1,1],
  // Row 10
  [1,1,1,1,1,1,2,1,1,1,1,1,0,1,1,0,1,1,1,1,1,2,1,1,1,1,1,1],
  // Row 11
  [1,1,1,1,1,1,2,1,1,0,0,0,0,0,0,0,0,0,0,1,1,2,1,1,1,1,1,1],
  // Row 12
  [1,1,1,1,1,1,2,1,1,0,1,1,1,4,4,1,1,1,0,1,1,2,1,1,1,1,1,1],
  // Row 13
  [1,1,1,1,1,1,2,1,1,0,1,4,4,4,4,4,4,1,0,1,1,2,1,1,1,1,1,1],
  // Row 14 (tunnel row)
  [0,0,0,0,0,0,2,1,1,0,1,4,4,4,4,4,4,1,0,1,1,2,0,0,0,0,0,0],
  // Row 15
  [1,1,1,1,1,1,2,1,1,0,1,1,1,1,1,1,1,1,0,1,1,2,1,1,1,1,1,1],
  // Row 16
  [1,1,1,1,1,1,2,1,1,0,0,0,0,0,0,0,0,0,0,1,1,2,1,1,1,1,1,1],
  // Row 17
  [1,1,1,1,1,1,2,1,1,0,1,1,1,1,1,1,1,1,0,1,1,2,1,1,1,1,1,1],
  // Row 18
  [1,1,1,1,1,1,2,1,1,0,1,1,1,1,1,1,1,1,0,1,1,2,1,1,1,1,1,1],
  // Row 19
  [1,2,2,2,2,2,2,2,2,2,2,2,2,1,1,2,2,2,2,2,2,2,2,2,2,2,2,1],
  // Row 20
  [1,2,1,1,1,1,2,1,1,1,1,1,2,1,1,2,1,1,1,1,1,2,1,1,1,1,2,1],
  // Row 21
  [1,2,1,1,1,1,2,1,1,1,1,1,2,1,1,2,1,1,1,1,1,2,1,1,1,1,2,1],
  // Row 22
  [1,3,2,2,1,1,2,2,2,2,2,2,2,0,0,2,2,2,2,2,2,2,1,1,2,2,3,1],
  // Row 23
  [1,1,1,2,1,1,2,1,1,2,1,1,1,1,1,1,1,1,2,1,1,2,1,1,2,1,1,1],
  // Row 24
  [1,1,1,2,1,1,2,1,1,2,1,1,1,1,1,1,1,1,2,1,1,2,1,1,2,1,1,1],
  // Row 25
  [1,2,2,2,2,2,2,1,1,2,2,2,2,1,1,2,2,2,2,1,1,2,2,2,2,2,2,1],
  // Row 26
  [1,2,1,1,1,1,1,1,1,1,1,1,2,1,1,2,1,1,1,1,1,1,1,1,1,1,2,1],
  // Row 27
  [1,2,1,1,1,1,1,1,1,1,1,1,2,1,1,2,1,1,1,1,1,1,1,1,1,1,2,1],
  // Row 28
  [1,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,1],
  // Row 29
  [1,2,1,1,1,1,2,1,1,1,1,1,1,1,1,1,1,1,1,1,2,1,1,1,1,2,2,1],
  // Row 30
  [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
];

// Validate dimensions at module load (development guard)
if (MAZE_LAYOUT.length !== ROWS) {
  console.error(`Maze row count mismatch: expected ${ROWS}, got ${MAZE_LAYOUT.length}`);
}
for (let r = 0; r < MAZE_LAYOUT.length; r++) {
  if (MAZE_LAYOUT[r].length !== COLS) {
    console.error(`Maze col count mismatch at row ${r}: expected ${COLS}, got ${MAZE_LAYOUT[r].length}`);
  }
}

/**
 * Returns true if the tile at (col, row) can be walked on by Pac-Man.
 * Pac-Man cannot walk on walls (1) or ghost-house interiors (4).
 * Out-of-bounds tiles are treated as walls (not walkable).
 */
export function isTileWalkable(grid: number[][], col: number, row: number): boolean {
  if (row < 0 || row >= grid.length) return false;
  const gridRow = grid[row];
  if (!gridRow) return false;
  if (col < 0 || col >= gridRow.length) return false;
  const tile = gridRow[col];
  return tile !== 1 && tile !== 4;
}

/**
 * Returns the pixel center of a tile (col, row).
 */
export function tileCenterPx(col: number, row: number): { x: number; y: number } {
  return {
    x: col * TILE_SIZE + TILE_SIZE / 2,
    y: row * TILE_SIZE + TILE_SIZE / 2,
  };
}

/**
 * Returns the tile (col, row) that contains the given pixel position.
 */
export function pixelToTile(x: number, y: number): { col: number; row: number } {
  return {
    col: Math.floor(x / TILE_SIZE),
    row: Math.floor(y / TILE_SIZE),
  };
}

/**
 * Count all pellets (value 2) and power pellets (value 3) in the grid.
 */
export function countPellets(grid: number[][]): { pellets: number; powerPellets: number } {
  let pellets = 0;
  let powerPellets = 0;
  for (const row of grid) {
    for (const cell of row) {
      if (cell === 2) pellets++;
      else if (cell === 3) powerPellets++;
    }
  }
  return { pellets, powerPellets };
}

/**
 * BFS shortest path from `from` tile to `to` tile.
 * Walkable tiles for BFS: 0, 2, 3, 4 (ghost-house accessible).
 * Returns array of directions to follow, or empty array if no path.
 */
export function bfsPath(
  grid: number[][],
  from: { col: number; row: number },
  to: { col: number; row: number }
): Direction[] {
  type Node = { col: number; row: number; path: Direction[] };

  const visited = new Set<string>();
  const queue: Node[] = [{ col: from.col, row: from.row, path: [] }];
  visited.add(`${from.col},${from.row}`);

  const deltas: Array<{ dc: number; dr: number; dir: Direction }> = [
    { dc: 0, dr: -1, dir: 'UP' },
    { dc: 0, dr: 1,  dir: 'DOWN' },
    { dc: -1, dr: 0, dir: 'LEFT' },
    { dc: 1,  dr: 0, dir: 'RIGHT' },
  ];

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current.col === to.col && current.row === to.row) {
      return current.path;
    }
    for (const { dc, dr, dir } of deltas) {
      const nc = current.col + dc;
      const nr = current.row + dr;
      const key = `${nc},${nr}`;
      if (visited.has(key)) continue;
      if (nr < 0 || nr >= grid.length) continue;
      const gridRow = grid[nr];
      if (!gridRow) continue;
      if (nc < 0 || nc >= gridRow.length) continue;
      const tile = gridRow[nc];
      // BFS can walk through 0, 2, 3, 4 (including ghost house)
      if (tile === 1) continue;
      visited.add(key);
      queue.push({ col: nc, row: nr, path: [...current.path, dir] });
    }
  }
  return [];
}
