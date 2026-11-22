import { ForecastError, HORIZONS_MIN, QUANTITIES, quantile } from './base';
import type { Quantity } from './base';

/*
 * The calibration of the bands (S21.3, ADR-055). A band reads the paths of a forecast at three
 * quantile levels: 0.1, 0.5 and 0.9 when the paths are taken as they are. The backtest showed
 * that the paths are too narrow for some quantities (the wait when there is a queue): the truths
 * fall outside the band more often than 1 time in 5. Calibrated levels for the band's edges are
 * read off the probability integral transform (PIT) of the truths on simulated days set apart for
 * it: where, among the paths, each truth fell. If 10 % of the truths fell below the paths' 3rd
 * percentile, the lower edge reads the paths at 0.03. The median stays the paths' median: moving
 * it too put the queue's median well below the truth on some days (ADR-055).
 */

/** The quantile levels at which a band reads the paths. */
export interface Levels {
  readonly p10: number;
  readonly p50: number;
  readonly p90: number;
}

/** The paths as they are: their 10th, 50th and 90th percentiles. */
export const UNCALIBRATED: Levels = { p10: 0.1, p50: 0.5, p90: 0.9 };

/** Fewer truths than this at a quantity and horizon: its levels stay uncalibrated. */
export const MIN_CALIBRATION_TRUTHS = 30;

/** Levels for every quantity at every horizon (keys: the horizons in minutes). */
export interface Calibration {
  readonly levels: Readonly<Record<Quantity, Readonly<Record<string, Levels>>>>;
}

function validLevels(levels: Levels): boolean {
  return (
    Number.isFinite(levels.p10) &&
    Number.isFinite(levels.p50) &&
    Number.isFinite(levels.p90) &&
    levels.p10 >= 0 &&
    levels.p10 <= levels.p50 &&
    levels.p50 <= levels.p90 &&
    levels.p90 <= 1
  );
}

/** Refuses a calibration with a level missing, outside 0 to 1, or out of order. */
export function validateCalibration(calibration: Calibration): void {
  for (const quantity of QUANTITIES) {
    for (const h of HORIZONS_MIN) {
      const levels = calibration.levels[quantity][String(h)];
      if (levels === undefined || !validLevels(levels)) {
        throw new ForecastError(
          `the calibration of ${quantity} at ${String(h)} minutes is invalid`,
        );
      }
    }
  }
}

/**
 * The levels of a quantity `minutes` ahead: a horizon's own, else interpolated between the two
 * horizons around it (the arrivals' 5-minute buckets), the nearest horizon's beyond them.
 */
export function levelsAt(
  calibration: Calibration | undefined,
  quantity: Quantity,
  minutes: number,
): Levels {
  if (calibration === undefined) return UNCALIBRATED;
  const of = (h: number) => calibration.levels[quantity][String(h)] ?? UNCALIBRATED;
  let previous: number | null = null;
  for (const h of HORIZONS_MIN) {
    if (minutes <= h) {
      if (previous === null || minutes === h) return of(h);
      const w = (minutes - previous) / (h - previous);
      const a = of(previous);
      const b = of(h);
      return {
        p10: a.p10 + w * (b.p10 - a.p10),
        p50: a.p50 + w * (b.p50 - a.p50),
        p90: a.p90 + w * (b.p90 - a.p90),
      };
    }
    previous = h;
  }
  return of(previous ?? HORIZONS_MIN[0]);
}

/**
 * Where a truth fell among sorted paths: the share of paths below it, plus half of those equal to
 * it (the mid-PIT: when many paths say 0 and nobody waited, the truth sits in their middle).
 */
export function pitOf(sorted: readonly number[], truth: number): number {
  if (sorted.length === 0) throw new ForecastError('the PIT of no path');
  let below = 0;
  let equal = 0;
  for (const value of sorted) {
    if (value < truth) below++;
    else if (value === truth) equal++;
    else break;
  }
  return (below + equal / 2) / sorted.length;
}

/** PIT values per quantity and horizon (keys: the horizons in minutes). */
export type PitSets = Readonly<Record<Quantity, Readonly<Record<string, readonly number[]>>>>;

/**
 * The calibration that PIT values give: at each quantity and horizon, the band's edges where 10 %
 * and 90 % of the truths fell; the median stays the paths'. Too few truths: the paths as they are.
 */
export function calibrationFrom(pits: PitSets, minimum = MIN_CALIBRATION_TRUTHS): Calibration {
  const levels = {} as Record<Quantity, Record<string, Levels>>;
  for (const quantity of QUANTITIES) {
    const byHorizon: Record<string, Levels> = {};
    for (const h of HORIZONS_MIN) {
      const values = [...(pits[quantity][String(h)] ?? [])].sort((a, b) => a - b);
      byHorizon[String(h)] =
        values.length < minimum
          ? UNCALIBRATED
          : {
              p10: Math.min(0.5, quantile(values, 0.1)),
              p50: 0.5,
              p90: Math.max(0.5, quantile(values, 0.9)),
            };
    }
    levels[quantity] = byHorizon;
  }
  return { levels };
}
