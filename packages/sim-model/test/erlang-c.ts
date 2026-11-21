import { expect } from 'vitest';
import { simulateCheckpoint } from '../src';
import { CLASSIFICATION, FIFO, mmcPopulation } from './helpers';

/**
 * Validation of the checkpoint model against queueing theory (acceptance criterion 4 of Slice 1).
 * With Poisson arrivals, exponential service and FIFO, the mean waiting time must match the
 * Erlang C formula.
 *
 * Design (see DECISIONS.md, ADR-012):
 * - three configurations (c = 1, rho = 0.8; c = 4, rho = 0.85; c = 6, rho = 0.9), each with its
 *   own random streams (seed = 1000 * (configuration + 1) + replication);
 * - 20 independent replications per configuration, each discarding a 10 000-customer warm-up;
 * - control variates (Lavenberg and Welch): the realised mean service time and mean
 *   inter-arrival time of each replication, whose true means are known, absorb input sampling
 *   noise so that the test measures model bias rather than the luck of the draw;
 * - pass criteria: relative error below 3%, and the analytic value inside the simultaneous 95%
 *   confidence interval (Bonferroni over three configurations, 17 degrees of freedom:
 *   t(1 - 0.05/6, 17) = 2.655). Three separate 95% intervals would reject a correct model about
 *   14% of the time.
 *
 * An independent diagnostic run without control variates (40 x 200 000 customers, M/M/1,
 * rho = 0.8) gave +0.49% (t = 1.34), i.e. no detectable bias.
 */

/** Mean waiting time in queue of an M/M/c queue (Erlang C), in the unit of 1 / mu. */
export function erlangCMeanWait(lambda: number, mu: number, c: number): number {
  const a = lambda / mu;
  const rho = a / c;
  let term = 1; // a^k / k!
  let sum = 0;
  for (let k = 0; k < c; k++) {
    if (k > 0) term *= a / k;
    sum += term;
  }
  const lastTerm = (term * a) / c; // a^c / c!
  const probabilityOfWaiting = lastTerm / (1 - rho) / (sum + lastTerm / (1 - rho));
  return probabilityOfWaiting / (c * mu - lambda);
}

export interface Replication {
  /** Response: mean waiting time after warm-up. */
  readonly y: number;
  /** Controls with known mean zero. */
  readonly c1: number;
  readonly c2: number;
}

/**
 * Multiple control-variate estimator with two controls of known mean zero.
 * Returns the adjusted mean and its standard error (R - 3 degrees of freedom).
 */
export function controlVariateEstimate(reps: readonly Replication[]): {
  estimate: number;
  standardError: number;
} {
  const r = reps.length;
  const mean = (f: (x: Replication) => number) => reps.reduce((a, x) => a + f(x), 0) / r;
  const my = mean((x) => x.y);
  const m1 = mean((x) => x.c1);
  const m2 = mean((x) => x.c2);
  let s11 = 0;
  let s12 = 0;
  let s22 = 0;
  let s1y = 0;
  let s2y = 0;
  for (const x of reps) {
    const d1 = x.c1 - m1;
    const d2 = x.c2 - m2;
    const dy = x.y - my;
    s11 += d1 * d1;
    s12 += d1 * d2;
    s22 += d2 * d2;
    s1y += d1 * dy;
    s2y += d2 * dy;
  }
  const det = s11 * s22 - s12 * s12;
  const i11 = s22 / det;
  const i12 = -s12 / det;
  const i22 = s11 / det;
  const b1 = i11 * s1y + i12 * s2y;
  const b2 = i12 * s1y + i22 * s2y;
  let sse = 0;
  for (const x of reps) {
    const e = x.y - my - b1 * (x.c1 - m1) - b2 * (x.c2 - m2);
    sse += e * e;
  }
  const residualVariance = sse / (r - 3);
  const quadratic = m1 * (i11 * m1 + i12 * m2) + m2 * (i12 * m1 + i22 * m2);
  return {
    estimate: my - b1 * m1 - b2 * m2,
    standardError: Math.sqrt(residualVariance * (1 / r + quadratic)),
  };
}

const MEAN_SERVICE_MS = 60_000;
const REPLICATIONS = 20;
const WARM_UP = 10_000;
/** Student t quantile 1 - 0.05 / 6 with 17 degrees of freedom (simultaneous 95% over 3 configs). */
const T_SIMULTANEOUS_95 = 2.655;

export interface ErlangCheck {
  readonly configuration: number;
  readonly lanes: number;
  readonly rho: number;
  readonly customers: number;
}

export function checkAgainstErlangC({ configuration, lanes, rho, customers }: ErlangCheck): void {
  const mu = 1 / MEAN_SERVICE_MS;
  const expected = erlangCMeanWait(rho * lanes * mu, mu, lanes);
  const meanInterarrival = MEAN_SERVICE_MS / (rho * lanes);
  const reps: Replication[] = [];
  for (let r = 0; r < REPLICATIONS; r++) {
    const seed = 1_000 * (configuration + 1) + r;
    const population = mmcPopulation(lanes, rho, MEAN_SERVICE_MS, customers, seed);
    const run = simulateCheckpoint(population, FIFO, { classification: CLASSIFICATION });
    let wait = 0;
    let service = 0;
    for (let i = WARM_UP; i < customers; i++) {
      wait += run.outcomes[i]!.waitMs;
      service += population.passengers[i]!.serviceMs;
    }
    const n = customers - WARM_UP;
    const span =
      population.passengers[customers - 1]!.arrivalMs -
      population.passengers[WARM_UP - 1]!.arrivalMs;
    reps.push({
      y: wait / n,
      c1: service / n - MEAN_SERVICE_MS,
      c2: span / n - meanInterarrival,
    });
  }
  const { estimate, standardError } = controlVariateEstimate(reps);
  expect(Math.abs(estimate - expected) / expected).toBeLessThan(0.03);
  expect(Math.abs(estimate - expected)).toBeLessThanOrEqual(T_SIMULTANEOUS_95 * standardError);
}
