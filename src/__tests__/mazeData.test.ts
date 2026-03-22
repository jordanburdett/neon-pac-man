import { describe, it, expect } from 'vitest';
import {
  MAZE_LAYOUT,
  isTileWalkable,
  tileCenterPx,
  pixelToTile,
  countPellets,
  bfsPath,
} from '../game/mazeData';
import {
  TILE_SIZE,
  COLS,
  ROWS,
  PELLET_SCORE,
  POWER_PELLET_SCORE,
} from '../game/constants';

describe('MAZE_LAYOUT dimensions', () => {
  it('has exactly 31 rows', () => {
    expect(MAZE_LAYOUT.length).toBe(ROWS);
  });

  it('every row has exactly 28 columns', () => {
    for (let r = 0; r < MAZE_LAYOUT.length; r++) {
      expect(MAZE_LAYOUT[r].length).toBe(COLS);
    }
  });

  it('row 0 and row 30 are all walls', () => {
    const allWall = (row: number[]) => row.every(v => v === 1);
    expect(allWall(MAZE_LAYOUT[0])).toBe(true);
    expect(allWall(MAZE_LAYOUT[30])).toBe(true);
  });

  it('col 0 and col 27 are walls on top boundary rows', () => {
    for (let r = 0; r <= 8; r++) {
      expect(MAZE_LAYOUT[r][0]).toBe(1);
      expect(MAZE_LAYOUT[r][27]).toBe(1);
    }
  });
});

describe('pellet counts', () => {
  it('has at least 200 regular pellets', () => {
    const { pellets } = countPellets(MAZE_LAYOUT);
    expect(pellets).toBeGreaterThanOrEqual(200);
  });

  it('has exactly 4 power pellets', () => {
    const { powerPellets } = countPellets(MAZE_LAYOUT);
    expect(powerPellets).toBe(4);
  });

  it('power pellets are at row 3 (cols 1, 26) and row 22 (cols 1, 26)', () => {
    expect(MAZE_LAYOUT[3][1]).toBe(3);
    expect(MAZE_LAYOUT[3][26]).toBe(3);
    expect(MAZE_LAYOUT[22][1]).toBe(3);
    expect(MAZE_LAYOUT[22][26]).toBe(3);
  });
});

describe('isTileWalkable', () => {
  it('wall tiles (value 1) are not walkable', () => {
    // Row 0 is all walls
    expect(isTileWalkable(MAZE_LAYOUT, 0, 0)).toBe(false);
    expect(isTileWalkable(MAZE_LAYOUT, 14, 0)).toBe(false);
  });

  it('pellet tiles (value 2) are walkable', () => {
    // Row 1, col 1 is a pellet
    expect(MAZE_LAYOUT[1][1]).toBe(2);
    expect(isTileWalkable(MAZE_LAYOUT, 1, 1)).toBe(true);
  });

  it('power pellet tiles (value 3) are walkable', () => {
    // Row 3, col 1 is a power pellet
    expect(MAZE_LAYOUT[3][1]).toBe(3);
    expect(isTileWalkable(MAZE_LAYOUT, 1, 3)).toBe(true);
  });

  it('ghost-house interior tiles (value 4) are NOT walkable by Pac-Man', () => {
    // Row 13, col 13 is ghost house
    expect(MAZE_LAYOUT[13][13]).toBe(4);
    expect(isTileWalkable(MAZE_LAYOUT, 13, 13)).toBe(false);
  });

  it('empty tiles (value 0) are walkable', () => {
    // Row 14, col 0 is 0 (tunnel entry)
    expect(MAZE_LAYOUT[14][0]).toBe(0);
    expect(isTileWalkable(MAZE_LAYOUT, 0, 14)).toBe(true);
  });

  it('out-of-bounds tiles are not walkable', () => {
    expect(isTileWalkable(MAZE_LAYOUT, -1, 0)).toBe(false);
    expect(isTileWalkable(MAZE_LAYOUT, 0, -1)).toBe(false);
    expect(isTileWalkable(MAZE_LAYOUT, COLS, 0)).toBe(false);
    expect(isTileWalkable(MAZE_LAYOUT, 0, ROWS)).toBe(false);
  });
});

describe('tileCenterPx', () => {
  it('returns correct center for tile (0, 0)', () => {
    const { x, y } = tileCenterPx(0, 0);
    expect(x).toBe(TILE_SIZE / 2);
    expect(y).toBe(TILE_SIZE / 2);
  });

  it('returns correct center for tile (14, 23)', () => {
    const { x, y } = tileCenterPx(14, 23);
    expect(x).toBe(14 * TILE_SIZE + TILE_SIZE / 2);
    expect(y).toBe(23 * TILE_SIZE + TILE_SIZE / 2);
  });
});

describe('pixelToTile', () => {
  it('maps pixel center of tile (0,0) back to (0,0)', () => {
    const { col, row } = pixelToTile(TILE_SIZE / 2, TILE_SIZE / 2);
    expect(col).toBe(0);
    expect(row).toBe(0);
  });

  it('maps pixel center of tile (14, 23) back to (14, 23)', () => {
    const cx = 14 * TILE_SIZE + TILE_SIZE / 2;
    const cy = 23 * TILE_SIZE + TILE_SIZE / 2;
    const { col, row } = pixelToTile(cx, cy);
    expect(col).toBe(14);
    expect(row).toBe(23);
  });
});

describe('bfsPath', () => {
  it('returns empty array when already at destination', () => {
    const path = bfsPath(MAZE_LAYOUT, { col: 1, row: 1 }, { col: 1, row: 1 });
    expect(path).toHaveLength(0);
  });

  it('finds a path between two walkable tiles', () => {
    // Col 1 row 1 → col 1 row 5 (both are pellet tiles in open corridor)
    const path = bfsPath(MAZE_LAYOUT, { col: 1, row: 1 }, { col: 1, row: 5 });
    expect(path.length).toBeGreaterThan(0);
  });

  it('returns empty array when source is unreachable wall (0,0)', () => {
    // (0,0) is a wall; BFS starts there but all neighbors are also walls
    const path = bfsPath(MAZE_LAYOUT, { col: 0, row: 0 }, { col: 5, row: 5 });
    expect(path).toHaveLength(0);
  });
});

describe('scoring constants', () => {
  it('PELLET_SCORE is 10', () => {
    expect(PELLET_SCORE).toBe(10);
  });

  it('POWER_PELLET_SCORE is 50', () => {
    expect(POWER_PELLET_SCORE).toBe(50);
  });

  it('TILE_SIZE is 20', () => {
    expect(TILE_SIZE).toBe(20);
  });

  it('canvas is 560x620', () => {
    expect(COLS * TILE_SIZE).toBe(560);
    expect(ROWS * TILE_SIZE).toBe(620);
  });
});
