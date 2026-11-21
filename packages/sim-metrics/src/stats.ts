import { labelCode, streamFor } from '@gateflow/sim-kernel';

/** Numeric ascending copy of `values`. */
export function sortedAscending(values: readonly number[]): Float64Array {
  return Float64Array.from(values).sort();
}

/**
 * Quantile of sorted data by linear interpolation between order statistics (Hyndman and Fan
 * type 7, the default of R and NumPy). `p` is in [0, 1].
 */
export function quantileSorted(sorted: ArrayLike<number>, p: number): number {
  const n = sorted.length;
  if (n === 0) throw new RangeError('quantile of an empty sample');
  if (!(p >= 0 && p <= 1)) throw new RangeError(`p must be in [0, 1], got ${p}`);
  const h = (n - 1) * p;
  const lo = Math.floor(h);
  const hi = Math.min(n - 1, lo + 1);
  const a = sorted[lo] ?? 0;
  const b = sorted[hi] ?? 0;
  return a + (h - lo) * (b - a);
}

export function mean(values: ArrayLike<number>): number {
  if (values.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < values.length; i++) sum += values[i] ?? 0;
  return sum / values.length;
}

/** Summary of a sample across simulated days. */
export interface AcrossDays {
  readonly mean: number;
  readonly p05: number;
  readonly p50: number;
  readonly p95: number;
  readonly min: number;
  readonly max: number;
}

export function acrossDays(values: readonly number[]): AcrossDays {
  const sorted = sortedAscending(values);
  return {
    mean: mean(values),
    p05: quantileSorted(sorted, 0.05),
    p50: quantileSorted(sorted, 0.5),
    p95: quantileSorted(sorted, 0.95),
    min: sorted[0] ?? 0,
    max: sorted[sorted.length - 1] ?? 0,
  };
}

export interface BootstrapOptions {
  readonly resamples: number;
  readonly confidence: number;
  readonly seed: number;
  /** Distinguishes the random stream of each statistic, so intervals are independent. */
  readonly key: string;
}

/**
 * Percentile bootstrap confidence interval for the mean of i.i.d. values (one value per
 * simulated day). Deterministic for given options.
 */
export function bootstrapMeanInterval(
  values: readonly number[],
  options: BootstrapOptions,
): { lower: number; upper: number } {
  const n = values.length;
  if (n === 0) throw new RangeError('bootstrap of an empty sample');
  if (!Number.isInteger(options.resamples) || options.resamples < 1) {
    throw new RangeError('resamples must be a positive integer');
  }
  if (!(options.confidence > 0 && options.confidence < 1)) {
    throw new RangeError('confidence must be in (0, 1)');
  }
  const rng = streamFor(options.seed, [labelCode('gateflow.bootstrap'), labelCode(options.key)]);
  const means = new Float64Array(options.resamples);
  for (let b = 0; b < options.resamples; b++) {
    let sum = 0;
    for (let i = 0; i < n; i++) sum += values[Math.floor(rng.nextFloat() * n)] ?? 0;
    means[b] = sum / n;
  }
  means.sort();
  const alpha = 1 - options.confidence;
  return {
    lower: quantileSorted(means, alpha / 2),
    upper: quantileSorted(means, 1 - alpha / 2),
  };
}

/**
 * Percentile bootstrap confidence interval for a ratio of totals over days, such as the waiting
 * saved per extra lane-hour: days are resampled in pairs, and each resample gives
 * sum(numerators) / sum(denominators). `null` when some resample has no positive denominator (the
 * ratio is not defined), so it is only reported when every resample has one.
 */
export function bootstrapRatioInterval(
  numerators: readonly number[],
  denominators: readonly number[],
  options: BootstrapOptions,
): { estimate: number; lower: number; upper: number } | null {
  const n = numerators.length;
  if (n === 0 || denominators.length !== n) {
    throw new RangeError('a ratio needs as many denominators as numerators, at least one');
  }
  if (!Number.isInteger(options.resamples) || options.resamples < 1) {
    throw new RangeError('resamples must be a positive integer');
  }
  if (!(options.confidence > 0 && options.confidence < 1)) {
    throw new RangeError('confidence must be in (0, 1)');
  }
  let totalNumerator = 0;
  let totalDenominator = 0;
  for (let i = 0; i < n; i++) {
    totalNumerator += numerators[i] ?? 0;
    totalDenominator += denominators[i] ?? 0;
  }
  if (!(totalDenominator > 0)) return null;
  const rng = streamFor(options.seed, [labelCode('gateflow.bootstrap'), labelCode(options.key)]);
  const ratios = new Float64Array(options.resamples);
  for (let b = 0; b < options.resamples; b++) {
    let num = 0;
    let den = 0;
    for (let i = 0; i < n; i++) {
      const j = Math.floor(rng.nextFloat() * n);
      num += numerators[j] ?? 0;
      den += denominators[j] ?? 0;
    }
    if (!(den > 0)) return null;
    ratios[b] = num / den;
  }
  ratios.sort();
  const alpha = 1 - options.confidence;
  return {
    estimate: totalNumerator / totalDenominator,
    lower: quantileSorted(ratios, alpha / 2),
    upper: quantileSorted(ratios, 1 - alpha / 2),
  };
}
