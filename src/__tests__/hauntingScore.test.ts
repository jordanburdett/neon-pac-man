import { describe, it, expect } from 'vitest';
import { CORRUPTION_TIERS } from '../game/constants';

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
