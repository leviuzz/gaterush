import { describe, expect, it } from 'vitest';
import { exp, ln, streamFor } from '../src';

const bits = new DataView(new ArrayBuffer(8));

/** Distance in units in the last place between two doubles of the same sign. */
function ulpDistance(a: number, b: number): number {
  if (Object.is(a, b) || (Number.isNaN(a) && Number.isNaN(b))) return 0;
  bits.setFloat64(0, a);
  const ab = bits.getBigInt64(0);
  bits.setFloat64(0, b);
  const bb = bits.getBigInt64(0);
  const d = ab - bb;
  return Number(d < 0n ? -d : d);
}

describe('ln', () => {
  it('handles special values', () => {
    expect(ln(1)).toBe(0);
    expect(ln(0)).toBe(-Infinity);
    expect(ln(-0)).toBe(-Infinity);
    expect(ln(-1)).toBeNaN();
    expect(ln(-Infinity)).toBeNaN();
    expect(ln(Infinity)).toBe(Infinity);
    expect(ln(NaN)).toBeNaN();
    expect(ln(Number.MIN_VALUE)).toBeCloseTo(-744.4400719213812, 12);
  });

  it('returns fixed golden values (locks the implementation)', () => {
    expect(ln(2)).toBe(0.6931471805599453);
    expect(ln(10)).toBe(2.302585092994046);
    expect(ln(0.5)).toBe(-0.6931471805599453);
    expect(ln(1e-300)).toBe(-690.7755278982137);
  });

  it('is within 1 ulp of Math.log over the full positive range', () => {
    const rng = streamFor(2024, [1]);
    let worst = 0;
    for (let i = 0; i < 200_000; i++) {
      const exponent = Math.floor(rng.nextFloat() * 2100) - 1075;
      const x = (1 + rng.nextFloat()) * 2 ** exponent;
      worst = Math.max(worst, ulpDistance(ln(x), Math.log(x)));
    }
    // Observed: 0 on V8 (the port is bit-identical to V8's fdlibm-based Math.log).
    expect(worst).toBeLessThanOrEqual(1);
  });
});

describe('exp', () => {
  it('handles special values and range limits', () => {
    expect(exp(0)).toBe(1);
    expect(exp(-0)).toBe(1);
    expect(exp(Infinity)).toBe(Infinity);
    expect(exp(-Infinity)).toBe(0);
    expect(exp(NaN)).toBeNaN();
    expect(exp(710)).toBe(Infinity);
    expect(exp(-746)).toBe(0);
    expect(exp(709.78)).toBeLessThan(Infinity);
    expect(exp(1e-30)).toBe(1);
  });

  it('returns fixed golden values (locks the implementation)', () => {
    expect(exp(1)).toBe(2.718281828459045);
    expect(exp(-1)).toBe(0.36787944117144233);
    expect(exp(0.5)).toBe(1.6487212707001282);
    expect(exp(-700)).toBe(9.85967654375977e-305);
  });

  it('is within 1 ulp of Math.exp over its domain', () => {
    const rng = streamFor(2024, [2]);
    let worst = 0;
    for (let i = 0; i < 200_000; i++) {
      const wide = (rng.nextFloat() * 2 - 1) * 745;
      const narrow = (rng.nextFloat() * 2 - 1) * 4;
      worst = Math.max(worst, ulpDistance(exp(wide), Math.exp(wide)));
      worst = Math.max(worst, ulpDistance(exp(narrow), Math.exp(narrow)));
    }
    // Observed: 0 on V8 (the port is bit-identical to V8's fdlibm-based Math.exp).
    expect(worst).toBeLessThanOrEqual(1);
  });

  it('inverts ln within a few ulp', () => {
    const rng = streamFor(2024, [3]);
    for (let i = 0; i < 10_000; i++) {
      const x = 1e-6 + rng.nextFloat() * 1e6;
      expect(Math.abs(exp(ln(x)) - x) / x).toBeLessThan(1e-12);
    }
  });
});
