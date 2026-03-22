import { describe, expect, it } from '@jest/globals';
import { clamp01, lerp, sampleSeamlessFractalNoise } from '../../src/graph/seamless-noise';

describe('seamless noise', () => {
  it('clamps values into the unit interval and interpolates linearly', () => {
    expect(clamp01(-5)).toBe(0);
    expect(clamp01(0.25)).toBe(0.25);
    expect(clamp01(5)).toBe(1);
    expect(lerp(10, 20, 0.25)).toBe(12.5);
  });

  it('returns zero when there are no octaves to normalize', () => {
    expect(sampleSeamlessFractalNoise(123, 0.2, 0.7, {
      cycleX: 3,
      cycleY: 2,
      octaves: 0,
      persistence: 0.5,
      lacunarity: 2,
    })).toBe(0);
  });

  it('produces deterministic normalized output for repeated inputs', () => {
    const first = sampleSeamlessFractalNoise(123, 0.2, 0.7, {
      cycleX: 3,
      cycleY: 2,
      octaves: 4,
      persistence: 0.55,
      lacunarity: 2.1,
    });
    const second = sampleSeamlessFractalNoise(123, 0.2, 0.7, {
      cycleX: 3,
      cycleY: 2,
      octaves: 4,
      persistence: 0.55,
      lacunarity: 2.1,
    });

    expect(first).toBeCloseTo(second, 10);
    expect(first).toBeGreaterThanOrEqual(-1);
    expect(first).toBeLessThanOrEqual(1);
  });
});
