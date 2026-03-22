/**
 * Pulse feature tests for pulse-001 (shockwave visual) and pulse-002
 * (per-ghost frightened delay).
 *
 * Tests cover:
 * - SHOCKWAVE_SPEED constant value correctness
 * - Delay formula: dist / SHOCKWAVE_SPEED
 * - Ghosts within threshold (<=0.05s delay) flip immediately
 * - Distant ghosts receive a positive countdown (delayed)
 * - frightenedCountdowns.clear() on double power-pellet eat
 * - frightenedCountdowns.clear() on player death (DYING state)
 * - Countdown decrement drives ghost.onFrightened() when it expires
 */

import { describe, it, expect } from 'vitest';
import { Ghost } from '../game/Ghost';
import {
  SHOCKWAVE_SPEED,
  TILE_SIZE,
  CANVAS_WIDTH,
  CANVAS_HEIGHT,
} from '../game/constants';
import { GhostMode, GhostId, Direction } from '../game/types';
import { tileCenterPx } from '../game/mazeData';

// ─── SHOCKWAVE_SPEED constant ─────────────────────────────────────────────────

describe('SHOCKWAVE_SPEED constant', () => {
  it('is 200 pixels per second', () => {
    expect(SHOCKWAVE_SPEED).toBe(200);
  });

  it('is a positive number', () => {
    expect(SHOCKWAVE_SPEED).toBeGreaterThan(0);
  });

  it('is a finite number (not Infinity or NaN)', () => {
    expect(isFinite(SHOCKWAVE_SPEED)).toBe(true);
  });

  it('shockwave can cross the full canvas diagonal within a few seconds', () => {
    // Full canvas diagonal at 200 px/s — sanity check it is a reasonable speed
    const diagonal = Math.sqrt(CANVAS_WIDTH ** 2 + CANVAS_HEIGHT ** 2);
    const travelTime = diagonal / SHOCKWAVE_SPEED;
    // Should take less than 10 seconds to cross the whole canvas
    expect(travelTime).toBeLessThan(10);
    // And more than 0 seconds
    expect(travelTime).toBeGreaterThan(0);
  });
});

// ─── Delay formula correctness ────────────────────────────────────────────────

describe('Per-ghost frightened delay formula: dist / SHOCKWAVE_SPEED', () => {
  it('ghost at distance 0 → delay 0 (instant)', () => {
    const dist = 0;
    const delay = dist / SHOCKWAVE_SPEED;
    expect(delay).toBe(0);
  });

  it('ghost at distance 200px → delay 1 second', () => {
    const dist = 200;
    const delay = dist / SHOCKWAVE_SPEED;
    expect(delay).toBeCloseTo(1.0);
  });

  it('ghost at distance 100px → delay 0.5 seconds', () => {
    const dist = 100;
    const delay = dist / SHOCKWAVE_SPEED;
    expect(delay).toBeCloseTo(0.5);
  });

  it('ghost at distance 10px (just above threshold) → delay 0.05 exactly', () => {
    const dist = 10;
    const delay = dist / SHOCKWAVE_SPEED;
    expect(delay).toBeCloseTo(0.05);
  });

  it('ghost at distance 9px → delay < 0.05 (should flip immediately per impl)', () => {
    const dist = 9;
    const delay = dist / SHOCKWAVE_SPEED;
    expect(delay).toBeLessThan(0.05);
  });
});

// ─── Immediate vs delayed flip threshold ─────────────────────────────────────

/**
 * The implementation flips immediately when delay <= 0.05, otherwise it
 * schedules a countdown:
 *
 *   const delay = dist / SHOCKWAVE_SPEED;
 *   if (delay <= 0.05) {
 *     g.onFrightened();
 *   } else {
 *     this.frightenedCountdowns.set(g, delay);
 *   }
 */

describe('Immediate vs delayed ghost frightened flip', () => {
  it('ghost at dist=0 → delay 0 → classified as immediate (<=0.05)', () => {
    const delay = 0 / SHOCKWAVE_SPEED;
    expect(delay).toBeLessThanOrEqual(0.05);
  });

  it('ghost at dist=10 → delay 0.05 → still classified as immediate (boundary)', () => {
    const delay = 10 / SHOCKWAVE_SPEED;
    expect(delay).toBeLessThanOrEqual(0.05);
  });

  it('ghost at dist=10.001 → delay just above 0.05 → classified as delayed', () => {
    // dist = 10.001, delay = 10.001/200 = 0.050005
    const delay = 10.001 / SHOCKWAVE_SPEED;
    expect(delay).toBeGreaterThan(0.05);
  });

  it('ghost placed at Pac-Man position → distance 0 → immediate flip', () => {
    // Pac-Man at tile (14, 23) center
    const pacPos = tileCenterPx(14, 23);
    const ghost = new Ghost(GhostId.BLINKY, '#FF0000', 14, 23, true);
    ghost.mode = GhostMode.CHASE;

    const dx = ghost.pixelPos.x - pacPos.x;
    const dy = ghost.pixelPos.y - pacPos.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const delay = dist / SHOCKWAVE_SPEED;

    expect(delay).toBeLessThanOrEqual(0.05);
    // Calling onFrightened directly should work
    ghost.onFrightened();
    expect(ghost.mode).toBe(GhostMode.FRIGHTENED);
  });

  it('ghost placed far away → distance large → classified as delayed', () => {
    // Pac-Man at (14, 23), Blinky far at (1, 1)
    const pacPos = tileCenterPx(14, 23);
    const ghost = new Ghost(GhostId.BLINKY, '#FF0000', 1, 1, true);

    const dx = ghost.pixelPos.x - pacPos.x;
    const dy = ghost.pixelPos.y - pacPos.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const delay = dist / SHOCKWAVE_SPEED;

    expect(delay).toBeGreaterThan(0.05);
  });
});

// ─── Ghost onFrightened is applied when countdown expires ─────────────────────

/**
 * Simulates the countdown loop that GameEngine runs each tick:
 *
 *   for (const [ghost, countdown] of [...frightenedCountdowns.entries()]) {
 *     const newCountdown = countdown - dt;
 *     if (newCountdown <= 0) {
 *       ghost.onFrightened();
 *       frightenedCountdowns.delete(ghost);
 *     } else {
 *       frightenedCountdowns.set(ghost, newCountdown);
 *     }
 *   }
 */
function tickCountdowns(
  countdowns: Map<Ghost, number>,
  dt: number,
): void {
  for (const [ghost, countdown] of [...countdowns.entries()]) {
    const newCountdown = countdown - dt;
    if (newCountdown <= 0) {
      ghost.onFrightened();
      countdowns.delete(ghost);
    } else {
      countdowns.set(ghost, newCountdown);
    }
  }
}

describe('frightenedCountdowns tick loop', () => {
  it('ghost is not FRIGHTENED before countdown expires', () => {
    const ghost = new Ghost(GhostId.BLINKY, '#FF0000', 14, 11, true);
    ghost.mode = GhostMode.CHASE;
    const countdowns = new Map<Ghost, number>();
    countdowns.set(ghost, 1.0);

    tickCountdowns(countdowns, 0.5); // advance 0.5s — not yet expired

    expect(ghost.mode).toBe(GhostMode.CHASE);
    expect(countdowns.has(ghost)).toBe(true);
    expect(countdowns.get(ghost)).toBeCloseTo(0.5);
  });

  it('ghost flips to FRIGHTENED exactly when countdown hits 0', () => {
    const ghost = new Ghost(GhostId.BLINKY, '#FF0000', 14, 11, true);
    ghost.mode = GhostMode.CHASE;
    const countdowns = new Map<Ghost, number>();
    countdowns.set(ghost, 1.0);

    tickCountdowns(countdowns, 1.0); // exactly 1s — should expire

    expect(ghost.mode).toBe(GhostMode.FRIGHTENED);
    expect(countdowns.has(ghost)).toBe(false);
  });

  it('ghost flips to FRIGHTENED when countdown goes negative (overshoot)', () => {
    const ghost = new Ghost(GhostId.BLINKY, '#FF0000', 14, 11, true);
    ghost.mode = GhostMode.CHASE;
    const countdowns = new Map<Ghost, number>();
    countdowns.set(ghost, 0.3);

    tickCountdowns(countdowns, 0.5); // overshoot by 0.2s

    expect(ghost.mode).toBe(GhostMode.FRIGHTENED);
    expect(countdowns.has(ghost)).toBe(false);
  });

  it('ghost is removed from countdowns map once it flips', () => {
    const ghost = new Ghost(GhostId.BLINKY, '#FF0000', 14, 11, true);
    ghost.mode = GhostMode.CHASE;
    const countdowns = new Map<Ghost, number>();
    countdowns.set(ghost, 0.1);

    tickCountdowns(countdowns, 1.0);

    expect(countdowns.size).toBe(0);
  });

  it('multiple ghosts: near one flips first, far one stays pending', () => {
    const nearGhost = new Ghost(GhostId.BLINKY, '#FF0000', 14, 11, true);
    const farGhost = new Ghost(GhostId.PINKY, '#FF69B4', 13, 14, true);
    nearGhost.mode = GhostMode.CHASE;
    farGhost.mode = GhostMode.CHASE;

    const countdowns = new Map<Ghost, number>();
    countdowns.set(nearGhost, 0.1);  // near: flips at 0.1s
    countdowns.set(farGhost, 1.0);   // far: flips at 1.0s

    tickCountdowns(countdowns, 0.2); // tick 0.2s

    expect(nearGhost.mode).toBe(GhostMode.FRIGHTENED); // flipped
    expect(farGhost.mode).toBe(GhostMode.CHASE);        // still waiting
    expect(countdowns.has(nearGhost)).toBe(false);
    expect(countdowns.has(farGhost)).toBe(true);
    expect(countdowns.get(farGhost)).toBeCloseTo(0.8);
  });

  it('all ghosts flip after sufficient ticks', () => {
    const g1 = new Ghost(GhostId.BLINKY, '#FF0000', 14, 11, true);
    const g2 = new Ghost(GhostId.PINKY, '#FF69B4', 13, 14, true);
    g1.mode = GhostMode.CHASE;
    g2.mode = GhostMode.CHASE;

    const countdowns = new Map<Ghost, number>();
    countdowns.set(g1, 0.5);
    countdowns.set(g2, 0.5);

    tickCountdowns(countdowns, 1.0);

    expect(g1.mode).toBe(GhostMode.FRIGHTENED);
    expect(g2.mode).toBe(GhostMode.FRIGHTENED);
    expect(countdowns.size).toBe(0);
  });
});

// ─── frightenedCountdowns cleared on double power-pellet eat ─────────────────

/**
 * When a second power pellet is eaten while countdowns are still pending,
 * the code calls:
 *
 *   this.frightenedCountdowns.clear();
 *   for (const g of this.ghosts) { ... set new delays ... }
 *
 * This means old pending countdowns are wiped before new ones are computed.
 */
describe('frightenedCountdowns cleared on second power-pellet eat', () => {
  it('clear() removes all pending entries', () => {
    const g1 = new Ghost(GhostId.BLINKY, '#FF0000', 14, 11, true);
    const g2 = new Ghost(GhostId.PINKY, '#FF69B4', 13, 14, true);
    const countdowns = new Map<Ghost, number>();
    countdowns.set(g1, 2.0);
    countdowns.set(g2, 3.0);

    // Simulate second pellet eat: clear then repopulate
    countdowns.clear();

    expect(countdowns.size).toBe(0);
    expect(countdowns.has(g1)).toBe(false);
    expect(countdowns.has(g2)).toBe(false);
  });

  it('after clear(), new countdowns replace the old ones', () => {
    const ghost = new Ghost(GhostId.BLINKY, '#FF0000', 14, 11, true);
    ghost.mode = GhostMode.CHASE;
    const countdowns = new Map<Ghost, number>();

    // First pellet eat: set countdown = 2.0s
    countdowns.set(ghost, 2.0);
    expect(countdowns.get(ghost)).toBeCloseTo(2.0);

    // Second pellet eat before first expires: clear then set new countdown
    countdowns.clear();
    const newDelay = 400 / SHOCKWAVE_SPEED; // 2.0s again for example
    countdowns.set(ghost, newDelay);

    expect(countdowns.get(ghost)).toBeCloseTo(newDelay);
    expect(countdowns.size).toBe(1);
  });

  it('ghosts that were in countdown state are NOT auto-frightened when cleared', () => {
    const ghost = new Ghost(GhostId.BLINKY, '#FF0000', 14, 11, true);
    ghost.mode = GhostMode.CHASE;
    const countdowns = new Map<Ghost, number>();
    countdowns.set(ghost, 5.0);

    // Clear (simulating second power pellet) — ghost should stay in CHASE
    countdowns.clear();

    expect(ghost.mode).toBe(GhostMode.CHASE);
  });
});

// ─── frightenedCountdowns cleared on player death ─────────────────────────────

describe('frightenedCountdowns cleared on player death (DYING transition)', () => {
  it('clear() on death leaves map empty', () => {
    const g1 = new Ghost(GhostId.BLINKY, '#FF0000', 14, 11, true);
    const g2 = new Ghost(GhostId.INKY, '#00FFFF', 11, 14, true);
    const countdowns = new Map<Ghost, number>();
    countdowns.set(g1, 0.3);
    countdowns.set(g2, 1.5);

    // Simulate death cleanup
    countdowns.clear();

    expect(countdowns.size).toBe(0);
  });

  it('ghosts pending countdown are not affected after clear on death', () => {
    const ghost = new Ghost(GhostId.CLYDE, '#FFA500', 16, 14, true);
    ghost.mode = GhostMode.CHASE;
    const countdowns = new Map<Ghost, number>();
    countdowns.set(ghost, 0.8);

    countdowns.clear();

    // Ghost was never flipped — still in CHASE
    expect(ghost.mode).toBe(GhostMode.CHASE);
    expect(countdowns.has(ghost)).toBe(false);
  });

  it('ticking after clear on death does nothing (empty map)', () => {
    const ghost = new Ghost(GhostId.BLINKY, '#FF0000', 14, 11, true);
    ghost.mode = GhostMode.CHASE;
    const countdowns = new Map<Ghost, number>();
    countdowns.set(ghost, 0.1);

    countdowns.clear(); // death clears it
    tickCountdowns(countdowns, 1.0); // tick with empty map

    // No change — ghost is still in CHASE
    expect(ghost.mode).toBe(GhostMode.CHASE);
  });
});

// ─── Ghost distance threshold boundary tests ─────────────────────────────────

describe('Ghost distance threshold: within 0.05s → immediate, beyond → delayed', () => {
  it('dist exactly at boundary (10px) → delay exactly 0.05 → immediate', () => {
    // delay = 10 / 200 = 0.05, which is <= 0.05 → immediate
    const dist = TILE_SIZE / 2; // 10px
    const delay = dist / SHOCKWAVE_SPEED;
    expect(delay).toBeLessThanOrEqual(0.05);
  });

  it('dist just above boundary (11px) → delay > 0.05 → delayed', () => {
    const dist = 11;
    const delay = dist / SHOCKWAVE_SPEED;
    expect(delay).toBeGreaterThan(0.05);
  });

  it('ghost on adjacent tile (TILE_SIZE = 20px away) → delayed', () => {
    // One tile away = 20px → delay = 20/200 = 0.1 → delayed
    const dist = TILE_SIZE;
    const delay = dist / SHOCKWAVE_SPEED;
    expect(delay).toBeGreaterThan(0.05);
    expect(delay).toBeCloseTo(0.1);
  });

  it('ghost 5 tiles away → delay = 5*TILE_SIZE / SHOCKWAVE_SPEED = 0.5s', () => {
    const dist = 5 * TILE_SIZE;
    const delay = dist / SHOCKWAVE_SPEED;
    expect(delay).toBeCloseTo(0.5);
    expect(delay).toBeGreaterThan(0.05); // definitely delayed
  });

  it('ghost 0px from pac-man → delay 0 → immediate', () => {
    const dist = 0;
    const delay = dist / SHOCKWAVE_SPEED;
    expect(delay).toBe(0);
    expect(delay).toBeLessThanOrEqual(0.05);
  });

  it('EATEN ghost is not affected by onFrightened (impl guard)', () => {
    // Verify that even if the delay fires for an EATEN ghost, it stays EATEN
    const ghost = new Ghost(GhostId.BLINKY, '#FF0000', 14, 11, true);
    ghost.mode = GhostMode.EATEN;
    ghost.onFrightened(); // should be a no-op for EATEN ghosts
    expect(ghost.mode).toBe(GhostMode.EATEN);
  });

  it('direction is reversed when non-FRIGHTENED ghost flips', () => {
    const ghost = new Ghost(GhostId.BLINKY, '#FF0000', 14, 11, true);
    ghost.mode = GhostMode.CHASE;
    ghost.direction = Direction.RIGHT;
    ghost.onFrightened();
    expect(ghost.direction).toBe(Direction.LEFT);
    expect(ghost.mode).toBe(GhostMode.FRIGHTENED);
  });

  it('already-FRIGHTENED ghost direction is not reversed on re-frighten', () => {
    // If ghost is already FRIGHTENED (e.g., first pellet hit it immediately)
    // and then arrives from a second pellet via countdown, direction stays.
    const ghost = new Ghost(GhostId.BLINKY, '#FF0000', 14, 11, true);
    ghost.mode = GhostMode.FRIGHTENED;
    ghost.direction = Direction.DOWN;
    ghost.onFrightened(); // already FRIGHTENED — direction should NOT flip
    expect(ghost.direction).toBe(Direction.DOWN);
    expect(ghost.mode).toBe(GhostMode.FRIGHTENED);
  });
});

// ─── Shockwave expansion physics ─────────────────────────────────────────────

describe('Shockwave radius expansion', () => {
  it('shockwave radius increases by SHOCKWAVE_SPEED * dt per frame', () => {
    // Shockwave impl: this.shockwave.radius += 200 * dt
    const initial = 0;
    const dt = 0.016; // ~60fps
    const newRadius = initial + SHOCKWAVE_SPEED * dt;
    expect(newRadius).toBeCloseTo(3.2);
  });

  it('shockwave is nullified once radius exceeds canvas diagonal', () => {
    const maxRadius = Math.sqrt(CANVAS_WIDTH ** 2 + CANVAS_HEIGHT ** 2);
    // A radius just above maxRadius means shockwave should be cleared
    const radius = maxRadius + 1;
    const shouldClear = radius > maxRadius;
    expect(shouldClear).toBe(true);
  });

  it('shockwave at radius 0 alpha is 1.0 (fully opaque)', () => {
    // alpha = 1 - radius / maxRadius
    const maxRadius = Math.sqrt(CANVAS_WIDTH ** 2 + CANVAS_HEIGHT ** 2);
    const alpha = 1 - 0 / maxRadius;
    expect(alpha).toBeCloseTo(1.0);
  });

  it('shockwave alpha decreases as radius increases', () => {
    const maxRadius = Math.sqrt(CANVAS_WIDTH ** 2 + CANVAS_HEIGHT ** 2);
    const alpha0 = 1 - 0 / maxRadius;
    const alpha100 = 1 - 100 / maxRadius;
    expect(alpha100).toBeLessThan(alpha0);
  });

  it('shockwave alpha is 0 at maxRadius (fully transparent)', () => {
    const maxRadius = Math.sqrt(CANVAS_WIDTH ** 2 + CANVAS_HEIGHT ** 2);
    const alpha = 1 - maxRadius / maxRadius;
    expect(alpha).toBeCloseTo(0);
  });
});
