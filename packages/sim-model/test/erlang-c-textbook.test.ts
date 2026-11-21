import { describe, expect, it } from 'vitest';
import { controlVariateEstimate, erlangCMeanWait } from './erlang-c';

describe('Erlang C closed form', () => {
  it('reproduces textbook values', () => {
    // M/M/1 with rho = 0.8: Wq = rho / (mu - lambda) = 4 service times.
    expect(erlangCMeanWait(0.8, 1, 1)).toBeCloseTo(4, 12);
    // M/M/2 with a = 1: P(wait) = 1/3, Wq = (1/3) / (2 - 1) = 1/3.
    expect(erlangCMeanWait(1, 1, 2)).toBeCloseTo(1 / 3, 12);
  });
});

describe('controlVariateEstimate', () => {
  it('removes the effect of the controls exactly when the response is linear in them', () => {
    const reps = Array.from({ length: 20 }, (_, i) => {
      const c1 = ((i * 37) % 11) - 5;
      const c2 = ((i * 53) % 7) - 3;
      return { y: 100 + 2 * c1 - 3 * c2 + (i % 2 === 0 ? 0.5 : -0.5), c1, c2 };
    });
    const { estimate, standardError } = controlVariateEstimate(reps);
    expect(Math.abs(estimate - 100)).toBeLessThan(0.5);
    expect(standardError).toBeGreaterThan(0);
    expect(standardError).toBeLessThan(0.5);
  });
});
