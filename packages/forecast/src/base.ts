import { MS_PER_MINUTE } from '@gateflow/domain';

/*
 * What the modules of the forecasts share (S21): the horizons, the buckets, a band, the
 * quantities, the error they throw and the quantile they read.
 */

/** The buckets of a forecast: 5 minutes. */
export const BUCKET_MS = 5 * MS_PER_MINUTE;
/** The horizons the duty manager reads, in minutes. */
export const HORIZONS_MIN = [15, 30, 60, 90] as const;
/** How far a forecast goes. */
export const SPAN_MS = 90 * MS_PER_MINUTE;
/** A forecast's spread: three quantiles of its paths, the 10th, 50th and 90th unless calibrated. */
export interface Band {
  readonly p10: number;
  readonly p50: number;
  readonly p90: number;
}

/** What a forecast says: arrivals in a bucket, people not yet admitted, a party's wait. */
export const QUANTITIES = ['arrivals', 'backlog', 'wait'] as const;
export type Quantity = (typeof QUANTITIES)[number];

/** Thrown when a forecast's inputs cannot make one. */
export class ForecastError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ForecastError';
  }
}

/** The quantile of sorted values, by linear interpolation (Hyndman-Fan type 7, as the simulator). */
export function quantile(sorted: readonly number[], q: number): number {
  if (sorted.length === 0) throw new ForecastError('the quantile of nothing');
  const position = (sorted.length - 1) * q;
  const below = Math.floor(position);
  const low = sorted[below] ?? 0;
  const high = sorted[Math.min(sorted.length - 1, below + 1)] ?? low;
  return low + (position - below) * (high - low);
}
