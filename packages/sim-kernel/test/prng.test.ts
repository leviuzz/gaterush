import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { Xoshiro128StarStar, streamFor } from '../src';

describe('Xoshiro128StarStar', () => {
  it('reproduces the reference output for state [1, 2, 3, 4]', () => {
    // Same values as the reference C implementation (and the rand_xoshiro test vector).
    const rng = new Xoshiro128StarStar(1, 2, 3, 4);
    const outputs = Array.from({ length: 8 }, () => rng.nextU32());
    expect(outputs).toEqual([
      11520, 0, 5927040, 70819200, 2031721883, 1637235492, 1287239034, 3734860849,
    ]);
  });

  it('rejects the all-zero state', () => {
    expect(() => new Xoshiro128StarStar(0, 0, 0, 0)).toThrow(RangeError);
  });

  it('produces floats in [0, 1) built from 53 random bits', () => {
    const rng = streamFor(7, [1]);
    let min = 1;
    let max = 0;
    let invalid = 0;
    for (let i = 0; i < 100_000; i++) {
      const x = rng.nextFloat();
      // In [0, 1) with 53-bit resolution: x * 2^53 is an integer.
      if (!(x >= 0 && x < 1) || !Number.isInteger(x * 9007199254740992)) invalid++;
      min = Math.min(min, x);
      max = Math.max(max, x);
    }
    expect(invalid).toBe(0);
    expect(min).toBeLessThan(0.001);
    expect(max).toBeGreaterThan(0.999);
  });
});

describe('streamFor', () => {
  it('derives the documented state for seed 1 and key [10, 20]', () => {
    // Cross-checked with an independent Python implementation.
    const rng = streamFor(1, [10, 20]);
    expect(rng.state()).toEqual([4036631795, 3556950218, 955332933, 1924051548]);
    expect(Array.from({ length: 6 }, () => rng.nextU32())).toEqual([
      1039253922, 1319856255, 1839752299, 656050752, 3386510559, 3246382237,
    ]);
  });

  it('is deterministic for the same seed and key', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 0xffffffff }),
        fc.array(fc.integer({ min: 0, max: 0xffffffff }), { maxLength: 5 }),
        (seed, key) => {
          const a = streamFor(seed, key);
          const b = streamFor(seed, key);
          for (let i = 0; i < 5; i++) if (a.nextU32() !== b.nextU32()) return false;
          return true;
        },
      ),
      { numRuns: 1000 },
    );
  });

  it('gives different streams for different seeds or keys', () => {
    const first = (seed: number, key: number[]) => streamFor(seed, key).nextU32();
    expect(first(1, [1, 2])).not.toBe(first(2, [1, 2]));
    expect(first(1, [1, 2])).not.toBe(first(1, [2, 1]));
    expect(first(1, [1, 2])).not.toBe(first(1, [1, 2, 0]));
  });

  it('rejects seeds and key parts outside the unsigned 32-bit range', () => {
    expect(() => streamFor(-1, [])).toThrow(RangeError);
    expect(() => streamFor(2 ** 32, [])).toThrow(RangeError);
    expect(() => streamFor(1, [1.5])).toThrow(RangeError);
  });

  it('has no obvious collisions across many derived streams', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 20_000; i++) {
      seen.add(streamFor(3, [5, i]).state().join(','));
    }
    expect(seen.size).toBe(20_000);
  });
});
