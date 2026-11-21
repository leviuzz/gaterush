import { streamFor, standardNormal } from '@gateflow/sim-kernel';
import { describe, expect, it } from 'vitest';
import {
  acrossDays,
  bootstrapMeanInterval,
  formatSeedRanges,
  quantileSorted,
  roundNumbers,
  sortedAscending,
} from '../src';

describe('quantileSorted (type 7)', () => {
  it('interpolates between order statistics', () => {
    const data = sortedAscending([4, 1, 3, 2]);
    expect(quantileSorted(data, 0)).toBe(1);
    expect(quantileSorted(data, 0.5)).toBe(2.5);
    expect(quantileSorted(data, 0.9)).toBeCloseTo(3.7, 12);
    expect(quantileSorted(data, 1)).toBe(4);
    expect(quantileSorted(sortedAscending([7]), 0.3)).toBe(7);
  });

  it('rejects empty samples and invalid probabilities', () => {
    expect(() => quantileSorted([], 0.5)).toThrow(RangeError);
    expect(() => quantileSorted([1], 1.5)).toThrow(RangeError);
  });

  it('sorts numerically, not lexicographically', () => {
    expect(Array.from(sortedAscending([10, 9, 100]))).toEqual([9, 10, 100]);
  });
});

describe('acrossDays', () => {
  it('summarises values across days', () => {
    expect(acrossDays([1, 2, 3, 4, 5])).toEqual({
      mean: 3,
      p05: 1.2,
      p50: 3,
      p95: 4.8,
      min: 1,
      max: 5,
    });
  });
});

describe('bootstrapMeanInterval', () => {
  const options = { resamples: 2000, confidence: 0.95, seed: 7, key: 'test' };

  it('is deterministic and brackets the sample mean', () => {
    const values = [3, 5, 4, 8, 6, 2, 7, 5, 4, 6];
    const a = bootstrapMeanInterval(values, options);
    expect(bootstrapMeanInterval(values, options)).toEqual(a);
    expect(a.lower).toBeLessThan(5);
    expect(a.upper).toBeGreaterThan(5);
    expect(bootstrapMeanInterval(values, { ...options, key: 'other' })).not.toEqual(a);
  });

  it('collapses for constant data', () => {
    expect(bootstrapMeanInterval([4, 4, 4], options)).toEqual({ lower: 4, upper: 4 });
  });

  it('has roughly the width of the normal-theory interval for normal data', () => {
    const rng = streamFor(11, [1]);
    const values = Array.from({ length: 400 }, () => 10 + 2 * standardNormal(rng));
    const { lower, upper } = bootstrapMeanInterval(values, options);
    const theoretical = 2 * 1.96 * (2 / Math.sqrt(400));
    expect((upper - lower) / theoretical).toBeGreaterThan(0.85);
    expect((upper - lower) / theoretical).toBeLessThan(1.15);
  });

  it('validates its inputs', () => {
    expect(() => bootstrapMeanInterval([], options)).toThrow(RangeError);
    expect(() => bootstrapMeanInterval([1], { ...options, resamples: 0 })).toThrow(RangeError);
    expect(() => bootstrapMeanInterval([1], { ...options, confidence: 1 })).toThrow(RangeError);
  });
});

describe('formatSeedRanges and roundNumbers', () => {
  it('compresses consecutive seeds into ranges', () => {
    expect(formatSeedRanges([1, 2, 3, 7, 9, 10])).toBe('1-3,7,9-10');
    expect(formatSeedRanges([5])).toBe('5');
    expect(formatSeedRanges([])).toBe('');
  });

  it('rounds non-integers to 4 decimals and keeps integers', () => {
    expect(roundNumbers({ a: 1.234567, b: [2, -0.00001], c: 'x', d: 10 })).toEqual({
      a: 1.2346,
      b: [2, 0],
      c: 'x',
      d: 10,
    });
  });
});
