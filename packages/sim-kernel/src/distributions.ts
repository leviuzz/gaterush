import { exp, ln } from './dmath';
import type { RandomSource } from './prng';

/**
 * Random variates. Every function consumes numbers from the given source in a documented,
 * fixed way and uses only deterministic arithmetic (see dmath.ts).
 */

function assertFinite(value: number, what: string): void {
  if (!Number.isFinite(value)) throw new RangeError(`${what} must be finite, got ${value}`);
}

/** Uniform in [min, max). */
export function uniform(rng: RandomSource, min: number, max: number): number {
  assertFinite(min, 'min');
  assertFinite(max, 'max');
  if (max < min) throw new RangeError(`max (${max}) must be >= min (${min})`);
  return min + (max - min) * rng.nextFloat();
}

/** True with probability `p`. Consumes exactly one uniform. */
export function bernoulli(rng: RandomSource, p: number): boolean {
  if (!(p >= 0 && p <= 1)) throw new RangeError(`p must be in [0, 1], got ${p}`);
  return rng.nextFloat() < p;
}

/** Exponential with the given mean (inverse transform). Consumes exactly one uniform. */
export function exponential(rng: RandomSource, mean: number): number {
  if (!(mean > 0) || !Number.isFinite(mean)) throw new RangeError(`mean must be > 0, got ${mean}`);
  return -mean * ln(1 - rng.nextFloat());
}

/**
 * Standard normal variate (Marsaglia polar method). Only the first variate of each accepted pair
 * is used, so each call is independent of previous calls.
 */
export function standardNormal(rng: RandomSource): number {
  for (;;) {
    const u = 2 * rng.nextFloat() - 1;
    const v = 2 * rng.nextFloat() - 1;
    const s = u * u + v * v;
    if (s > 0 && s < 1) return u * Math.sqrt((-2 * ln(s)) / s);
  }
}

/** Normal with the given mean and standard deviation. */
export function normal(rng: RandomSource, mean: number, sd: number): number {
  assertFinite(mean, 'mean');
  if (!(sd >= 0) || !Number.isFinite(sd)) throw new RangeError(`sd must be >= 0, got ${sd}`);
  return mean + sd * standardNormal(rng);
}

/** Log-normal parameterised by its median and the standard deviation of the underlying normal. */
export function lognormalFromMedian(rng: RandomSource, median: number, sigma: number): number {
  if (!(median > 0) || !Number.isFinite(median)) {
    throw new RangeError(`median must be > 0, got ${median}`);
  }
  if (!(sigma >= 0) || !Number.isFinite(sigma)) {
    throw new RangeError(`sigma must be >= 0, got ${sigma}`);
  }
  return median * exp(sigma * standardNormal(rng));
}

/**
 * Log-normal parameterised by its mean and coefficient of variation (sd / mean).
 * sigma^2 = ln(1 + cv^2), mu = ln(mean) - sigma^2 / 2. With cv = 0 it returns `mean` exactly
 * (still consuming one normal variate, so streams stay aligned).
 */
export function lognormalFromMeanCv(rng: RandomSource, mean: number, cv: number): number {
  if (!(mean > 0) || !Number.isFinite(mean)) throw new RangeError(`mean must be > 0, got ${mean}`);
  if (!(cv >= 0) || !Number.isFinite(cv)) throw new RangeError(`cv must be >= 0, got ${cv}`);
  const z = standardNormal(rng);
  if (cv === 0) return mean;
  const sigma2 = ln(1 + cv * cv);
  const sigma = Math.sqrt(sigma2);
  return exp(ln(mean) - sigma2 / 2 + sigma * z);
}

/** Triangular distribution on [min, max] with the given mode (inverse transform, one uniform). */
export function triangular(rng: RandomSource, min: number, mode: number, max: number): number {
  assertFinite(min, 'min');
  assertFinite(mode, 'mode');
  assertFinite(max, 'max');
  if (!(min <= mode && mode <= max)) {
    throw new RangeError(`triangular requires min <= mode <= max, got ${min}, ${mode}, ${max}`);
  }
  const u = rng.nextFloat();
  const range = max - min;
  if (range === 0) return min;
  const split = (mode - min) / range;
  if (u < split) return min + Math.sqrt(u * range * (mode - min));
  return max - Math.sqrt((1 - u) * range * (max - mode));
}

/**
 * Index drawn with probability proportional to `weights` (non-negative, at least one positive).
 * Consumes exactly one uniform.
 */
export function categorical(rng: RandomSource, weights: readonly number[]): number {
  let total = 0;
  for (const w of weights) {
    if (!(w >= 0) || !Number.isFinite(w)) throw new RangeError(`invalid weight ${w}`);
    total += w;
  }
  if (!(total > 0)) throw new RangeError('at least one weight must be positive');
  const target = rng.nextFloat() * total;
  let cumulative = 0;
  let last = -1;
  for (let i = 0; i < weights.length; i++) {
    const w = weights[i] ?? 0;
    if (w <= 0) continue;
    last = i;
    cumulative += w;
    if (target < cumulative) return i;
  }
  return last; // guards against floating-point rounding in the cumulative sum
}
