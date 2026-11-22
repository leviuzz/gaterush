import { describe, expect, it } from 'vitest';
import {
  ForecastError,
  LIBRARY_CALIBRATION,
  LIBRARY_CALIBRATION_TRUTHS,
  UNCALIBRATED,
  bandAt,
  calibrationFrom,
  forecastFrom,
  levelsAt,
  pitOf,
  validateCalibration,
} from '../src';
import type { Calibration, CheckpointProfile, Levels } from '../src';

const MIN = 60_000;
const flatDay = (perBucket: number) => Array.from({ length: 288 }, () => perBucket);

/** A calibration with the same levels everywhere. */
const everywhere = (levels: Levels): Calibration => {
  const horizons = { '15': levels, '30': levels, '60': levels, '90': levels };
  return { levels: { arrivals: horizons, backlog: horizons, wait: horizons } };
};

/** PIT values for every quantity and horizon. */
const pitsEverywhere = (values: readonly number[]) => {
  const horizons = { '15': values, '30': values, '60': values, '90': values };
  return { arrivals: horizons, backlog: horizons, wait: horizons };
};

describe('the calibration of the bands (S21.3)', () => {
  it('places a truth among the paths, half of the equal ones below it', () => {
    const paths = [0, 0, 0, 0, 2, 4, 6, 8, 10, 12];
    expect(pitOf(paths, -1)).toBe(0);
    expect(pitOf(paths, 0)).toBe(0.2);
    expect(pitOf(paths, 5)).toBe(0.6);
    expect(pitOf(paths, 12)).toBe(0.95);
    expect(pitOf(paths, 99)).toBe(1);
    expect(() => pitOf([], 1)).toThrow(ForecastError);
  });

  it("reads the band's edges where 10 % and 90 % of the truths fell, and keeps the median", () => {
    // Truths spread over 0 to 1 evenly: the paths are calibrated already.
    const even = Array.from({ length: 101 }, (_, i) => i / 100);
    expect(calibrationFrom(pitsEverywhere(even)).levels.wait['15']).toEqual({
      p10: 0.1,
      p50: 0.5,
      p90: 0.9,
    });
    // Truths fall outside the paths' 10th and 90th percentiles too often: wider edges.
    const wide = [...Array(20).fill(0.01), ...Array(60).fill(0.5), ...Array(20).fill(0.99)];
    const levels = calibrationFrom(pitsEverywhere(wide)).levels.backlog['90'];
    expect(levels?.p10).toBe(0.01);
    expect(levels?.p50).toBe(0.5);
    expect(levels?.p90).toBe(0.99);
    // Truths always below the median: the upper edge stays at the median, never below it.
    const low = Array.from({ length: 50 }, (_, i) => i / 200);
    expect(calibrationFrom(pitsEverywhere(low)).levels.arrivals['30']?.p90).toBe(0.5);
    // Too few truths: the paths as they are.
    expect(calibrationFrom(pitsEverywhere([0.01, 0.99])).levels.wait['60']).toEqual(UNCALIBRATED);
  });

  it("interpolates the levels between horizons for the arrivals' buckets", () => {
    const calibration: Calibration = {
      levels: {
        ...everywhere(UNCALIBRATED).levels,
        arrivals: {
          '15': { p10: 0.1, p50: 0.5, p90: 0.9 },
          '30': { p10: 0.04, p50: 0.5, p90: 0.96 },
          '60': UNCALIBRATED,
          '90': UNCALIBRATED,
        },
      },
    };
    expect(levelsAt(calibration, 'arrivals', 5)).toEqual({ p10: 0.1, p50: 0.5, p90: 0.9 });
    expect(levelsAt(calibration, 'arrivals', 20).p10).toBeCloseTo(0.08, 12);
    expect(levelsAt(calibration, 'arrivals', 30).p90).toBe(0.96);
    expect(levelsAt(calibration, 'arrivals', 120)).toEqual(UNCALIBRATED);
    expect(levelsAt(undefined, 'wait', 15)).toEqual(UNCALIBRATED);
  });

  it('moves the edges of a forecast, never its median, and refuses levels out of order', () => {
    const profile: CheckpointProfile = {
      startMs: 0,
      bucketMs: 5 * MIN,
      days: Array.from({ length: 30 }, (_, d) => flatDay(8 + (d % 7))),
      lanePlan: [],
    };
    const state = {
      nowMs: 8 * 60 * MIN,
      arrivalsLastHour: 120,
      backlog: 30,
      lanesOpen: 1,
      ratePerLanePerHour: 100,
    };
    const raw = forecastFrom(profile, state);
    const wider = forecastFrom(profile, state, everywhere({ p10: 0.02, p50: 0.5, p90: 0.98 }));
    expect(raw.calibrated).toBe(false);
    expect(wider.calibrated).toBe(true);
    for (const [i, h] of wider.horizons.entries()) {
      const r = raw.horizons[i];
      expect(h.backlog.p50).toBe(r?.backlog.p50);
      expect(h.waitMs.p50).toBe(r?.waitMs.p50);
      expect(h.backlog.p10).toBeLessThanOrEqual(r?.backlog.p10 ?? NaN);
      expect(h.backlog.p90).toBeGreaterThanOrEqual(r?.backlog.p90 ?? NaN);
      expect(h.waitMs.p90 - h.waitMs.p10).toBeGreaterThan(
        (r?.waitMs.p90 ?? NaN) - (r?.waitMs.p10 ?? NaN),
      );
    }
    expect(bandAt([1, 2, 3, 4, 5], { p10: 0, p50: 0.5, p90: 1 })).toEqual({
      p10: 1,
      p50: 3,
      p90: 5,
    });
    expect(() =>
      forecastFrom(profile, state, everywhere({ p10: 0.6, p50: 0.5, p90: 0.9 })),
    ).toThrow(/invalid/);
  });

  it('ships the calibration of the scenario library, edges only', () => {
    validateCalibration(LIBRARY_CALIBRATION);
    for (const quantity of ['arrivals', 'backlog', 'wait'] as const) {
      for (const h of ['15', '30', '60', '90']) {
        const levels = LIBRARY_CALIBRATION.levels[quantity][h];
        expect(levels?.p50).toBe(0.5);
        expect(LIBRARY_CALIBRATION_TRUTHS[quantity][h as '15']).toBeGreaterThan(1000);
      }
    }
    // The waits' bands were too narrow when there was a queue: the library widens them.
    const wait = LIBRARY_CALIBRATION.levels.wait['60'];
    expect(wait?.p10).toBeLessThan(0.1);
    expect(wait?.p90).toBeGreaterThan(0.9);
  });
});
