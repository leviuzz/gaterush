import type { Band } from './forecast';

/*
 * How wrong a forecast was (S21): its median against what happened, and whether what happened
 * fell in its band. Calibrated bands hold 80 % of the truths between their 10th and 90th
 * percentiles.
 */

/** What a forecast says: arrivals in a bucket, people not yet admitted, a party's wait. */
export const QUANTITIES = ['arrivals', 'backlog', 'wait'] as const;
export type Quantity = (typeof QUANTITIES)[number];

/** A forecast's band at a horizon, and what then happened. */
export interface Observation {
  readonly quantity: Quantity;
  readonly horizon: number;
  readonly truth: number;
  readonly band: Band;
}

export interface ErrorSummary {
  readonly n: number;
  /** Mean absolute error of the median. */
  readonly mae: number;
  /** Weighted absolute percentage error: the absolute errors over the truths; null if they sum to 0. */
  readonly wape: number | null;
  /** Mean of the median less the truth: above 0, the forecast said more than happened. */
  readonly bias: number;
  /** Share of the truths within the 10th and 90th percentiles: 0.8 when calibrated. */
  readonly coverage: number;
  /** Share of the truths below the 10th percentile: 0.1 when calibrated. */
  readonly below: number;
  /** Share of the truths above the 90th percentile: 0.1 when calibrated. */
  readonly above: number;
  /** Mean width of the band (90th less 10th percentile): the narrower, the more it says. */
  readonly width: number;
}

/** The errors of a set of observations; null when there is none. */
export function errorSummary(observations: readonly Observation[]): ErrorSummary | null {
  const n = observations.length;
  if (n === 0) return null;
  let absolute = 0;
  let signed = 0;
  let truths = 0;
  let below = 0;
  let above = 0;
  let width = 0;
  for (const o of observations) {
    const error = o.band.p50 - o.truth;
    absolute += Math.abs(error);
    signed += error;
    truths += Math.abs(o.truth);
    if (o.truth < o.band.p10) below++;
    else if (o.truth > o.band.p90) above++;
    width += o.band.p90 - o.band.p10;
  }
  return {
    n,
    mae: absolute / n,
    wape: truths === 0 ? null : absolute / truths,
    bias: signed / n,
    coverage: (n - below - above) / n,
    below: below / n,
    above: above / n,
    width: width / n,
  };
}

/**
 * The forecasts that say something about a queue: those whose median or truth is at least 1 (a
 * person, a minute). Leaving out the hours when nobody waits and none is forecast to keeps them
 * from passing for calibrated bands; the misses and the false alarms stay in.
 */
export function isBusy(observation: Observation): boolean {
  return observation.truth >= 1 || observation.band.p50 >= 1;
}
