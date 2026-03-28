import { describe, it, expect } from 'vitest';
import { CORRUPTION_TIERS } from '../game/constants';

// ─── Pure helper: derives current corruption tier index from a score ──────────
// This mirrors the implicit logic in GameEngine render methods:
//   score >= CORRUPTION_TIERS[4] → tier 4 (inverted maze)
//   score >= CORRUPTION_TIERS[3] → tier 3 (pellet halos)
//   score >= CORRUPTION_TIERS[2] → tier 2 (ghost bleed-smear)
//   score >= CORRUPTION_TIERS[1] → tier 1 (wall tendrils)
//   otherwise                    → tier 0 (clean)
function corruptionTierForScore(score: number): number {
  let tier = 0;
  for (let i = 0; i < CORRUPTION_TIERS.length; i++) {
    if (score >= CORRUPTION_TIERS[i]) {
      tier = i;
    }
  }
  return tier;
}

// ─── CORRUPTION_TIERS structure ───────────────────────────────────────────────

describe('CORRUPTION_TIERS', () => {
  it('has 5 entries', () => {
    expect(CORRUPTION_TIERS.length).toBe(5);
  });

  it('has values [0, 500, 1500, 3000, 6000] in order', () => {
    expect(CORRUPTION_TIERS[0]).toBe(0);
    expect(CORRUPTION_TIERS[1]).toBe(500);
    expect(CORRUPTION_TIERS[2]).toBe(1500);
    expect(CORRUPTION_TIERS[3]).toBe(3000);
    expect(CORRUPTION_TIERS[4]).toBe(6000);
  });

  it('CORRUPTION_TIERS[0] is 0 (safe floor)', () => {
    expect(CORRUPTION_TIERS[0]).toBe(0);
  });

  it('each tier is strictly greater than the previous (ascending order invariant)', () => {
    for (let i = 0; i < CORRUPTION_TIERS.length - 1; i++) {
      expect(CORRUPTION_TIERS[i]).toBeLessThan(CORRUPTION_TIERS[i + 1]);
    }
  });
});

// ─── Score threshold gate tests ───────────────────────────────────────────────
// These verify the exact threshold boundaries that GameEngine render methods rely on.
// Render gates in GameEngine:
//   CORRUPTION_TIERS[1] (500)  → renderWallTendrils called
//   CORRUPTION_TIERS[2] (1500) → ghost trail bleed-smear instead of circle
//   CORRUPTION_TIERS[3] (3000) → renderPelletHalos called
//   CORRUPTION_TIERS[4] (6000) → inverted maze + dark background

describe('corruptionTierForScore — tier 0 (clean state)', () => {
  it('score 0 → tier 0', () => {
    expect(corruptionTierForScore(0)).toBe(0);
  });

  it('score 1 → tier 0', () => {
    expect(corruptionTierForScore(1)).toBe(0);
  });

  it('score 499 → tier 0 (one below tier 1 threshold)', () => {
    expect(corruptionTierForScore(499)).toBe(0);
  });
});

describe('corruptionTierForScore — tier 1 (wall tendrils, score >= 500)', () => {
  it('score exactly 500 → tier 1', () => {
    expect(corruptionTierForScore(500)).toBe(1);
  });

  it('score 501 → tier 1', () => {
    expect(corruptionTierForScore(501)).toBe(1);
  });

  it('score 1499 → tier 1 (one below tier 2 threshold)', () => {
    expect(corruptionTierForScore(1499)).toBe(1);
  });
});

describe('corruptionTierForScore — tier 2 (ghost bleed-smear, score >= 1500)', () => {
  it('score exactly 1500 → tier 2', () => {
    expect(corruptionTierForScore(1500)).toBe(2);
  });

  it('score 1501 → tier 2', () => {
    expect(corruptionTierForScore(1501)).toBe(2);
  });

  it('score 2999 → tier 2 (one below tier 3 threshold)', () => {
    expect(corruptionTierForScore(2999)).toBe(2);
  });
});

describe('corruptionTierForScore — tier 3 (pellet halos, score >= 3000)', () => {
  it('score exactly 3000 → tier 3', () => {
    expect(corruptionTierForScore(3000)).toBe(3);
  });

  it('score 3001 → tier 3', () => {
    expect(corruptionTierForScore(3001)).toBe(3);
  });

  it('score 5999 → tier 3 (one below tier 4 threshold)', () => {
    expect(corruptionTierForScore(5999)).toBe(3);
  });
});

describe('corruptionTierForScore — tier 4 (inverted ghost dimension, score >= 6000)', () => {
  it('score exactly 6000 → tier 4', () => {
    expect(corruptionTierForScore(6000)).toBe(4);
  });

  it('score 6001 → tier 4', () => {
    expect(corruptionTierForScore(6001)).toBe(4);
  });

  it('very high score (99999) → tier 4', () => {
    expect(corruptionTierForScore(99999)).toBe(4);
  });
});

describe('corruptionTierForScore — boundary correctness (one-below / exact)', () => {
  it('tier 0→1 boundary: 499 is tier 0, 500 is tier 1', () => {
    expect(corruptionTierForScore(499)).toBe(0);
    expect(corruptionTierForScore(500)).toBe(1);
  });

  it('tier 1→2 boundary: 1499 is tier 1, 1500 is tier 2', () => {
    expect(corruptionTierForScore(1499)).toBe(1);
    expect(corruptionTierForScore(1500)).toBe(2);
  });

  it('tier 2→3 boundary: 2999 is tier 2, 3000 is tier 3', () => {
    expect(corruptionTierForScore(2999)).toBe(2);
    expect(corruptionTierForScore(3000)).toBe(3);
  });

  it('tier 3→4 boundary: 5999 is tier 3, 6000 is tier 4', () => {
    expect(corruptionTierForScore(5999)).toBe(3);
    expect(corruptionTierForScore(6000)).toBe(4);
  });
});

describe('corruptionTierForScore — render gate assertions', () => {
  it('wall tendrils gate: tier >= 1 iff score >= CORRUPTION_TIERS[1]', () => {
    const justBelow = CORRUPTION_TIERS[1] - 1;
    const atThreshold = CORRUPTION_TIERS[1];
    expect(corruptionTierForScore(justBelow)).toBeLessThan(1);
    expect(corruptionTierForScore(atThreshold)).toBeGreaterThanOrEqual(1);
  });

  it('ghost bleed-smear gate: tier >= 2 iff score >= CORRUPTION_TIERS[2]', () => {
    const justBelow = CORRUPTION_TIERS[2] - 1;
    const atThreshold = CORRUPTION_TIERS[2];
    expect(corruptionTierForScore(justBelow)).toBeLessThan(2);
    expect(corruptionTierForScore(atThreshold)).toBeGreaterThanOrEqual(2);
  });

  it('pellet halos gate: tier >= 3 iff score >= CORRUPTION_TIERS[3]', () => {
    const justBelow = CORRUPTION_TIERS[3] - 1;
    const atThreshold = CORRUPTION_TIERS[3];
    expect(corruptionTierForScore(justBelow)).toBeLessThan(3);
    expect(corruptionTierForScore(atThreshold)).toBeGreaterThanOrEqual(3);
  });

  it('inverted maze gate: tier >= 4 iff score >= CORRUPTION_TIERS[4]', () => {
    const justBelow = CORRUPTION_TIERS[4] - 1;
    const atThreshold = CORRUPTION_TIERS[4];
    expect(corruptionTierForScore(justBelow)).toBeLessThan(4);
    expect(corruptionTierForScore(atThreshold)).toBeGreaterThanOrEqual(4);
  });
});

describe('corruptionTierForScore — edge cases', () => {
  it('score -1 (hypothetical underflow) → tier 0', () => {
    expect(corruptionTierForScore(-1)).toBe(0);
  });

  it('score Number.MAX_SAFE_INTEGER → tier 4', () => {
    expect(corruptionTierForScore(Number.MAX_SAFE_INTEGER)).toBe(4);
  });
});
