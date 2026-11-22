import { describe, expect, it } from 'vitest';
import {
  ForecastError,
  HORIZONS_MIN,
  PATHS_PER_DAY,
  SCALE_FADE_MIN,
  arrivalScale,
  bandOf,
  errorSummary,
  expectedLastHour,
  isBusy,
  forecastFrom,
  plannedLanesAt,
} from '../src';
import type { CheckpointProfile, LiveState } from '../src';

const MIN = 60_000;

/** A day of `perBucket` people in every 5-minute bucket from midnight, for 24 hours. */
const flatDay = (perBucket: number) => Array.from({ length: 288 }, () => perBucket);

const profile = (days: readonly (readonly number[])[]): CheckpointProfile => ({
  startMs: 0,
  bucketMs: 5 * MIN,
  days,
  lanePlan: [],
});

const state = (overrides: Partial<LiveState> = {}): LiveState => ({
  nowMs: 8 * 60 * MIN,
  arrivalsLastHour: 120,
  backlog: 0,
  lanesOpen: 1,
  ratePerLanePerHour: 60,
  ...overrides,
});

describe('the forecast of a checkpoint (S21)', () => {
  it('scales the arrivals as GateFlow does in the simulator (S8)', () => {
    expect(arrivalScale(100, 100)).toBe(1);
    expect(arrivalScale(55, 105)).toBe(0.5454545454545454);
    expect(arrivalScale(1000, 10)).toBe(2);
    expect(arrivalScale(0, 1000)).toBe(0.5);
    // A flat day of 10 people per 5 minutes: 120 an hour.
    expect(expectedLastHour(profile([flatDay(10)]), 8 * 60 * MIN)).toBeCloseTo(120, 9);
  });

  it('projects the queue: arrivals above the capacity build it up', () => {
    // Two people a minute arrive, the one lane serves one a minute.
    const f = forecastFrom(profile(Array.from({ length: 50 }, () => flatDay(10))), state());
    expect(f.scale).toBe(1);
    expect(f.paths).toBe(50 * PATHS_PER_DAY);
    expect(f.capacityPerHour).toBe(60);
    expect(f.buckets).toHaveLength(18);
    expect(f.horizons.map((h) => h.minutes)).toEqual([...HORIZONS_MIN]);
    for (const h of f.horizons) {
      // 10 people in every bucket, every day.
      expect(h.arrivals).toEqual({ p10: 10, p50: 10, p90: 10 });
      // About one more person a minute; the wait is the people ahead at a person a minute.
      expect(h.backlog.p50).toBeGreaterThan(h.minutes * 0.75);
      expect(h.backlog.p50).toBeLessThan(h.minutes * 1.25);
      expect(h.waitMs.p50 / MIN).toBeCloseTo(h.backlog.p50, 9);
      expect(h.backlog.p10).toBeLessThan(h.backlog.p90);
    }
  });

  it('drains a queue the lanes can serve, and follows the arrivals it sees', () => {
    const quiet = profile(Array.from({ length: 20 }, () => flatDay(0)));
    const drained = forecastFrom(quiet, state({ backlog: 40, arrivalsLastHour: 0 }));
    // Two lanes of 60 an hour: two a minute; 40 people are gone in 20 minutes.
    const two = forecastFrom(quiet, state({ backlog: 40, arrivalsLastHour: 0, lanesOpen: 2 }));
    expect(two.horizons[0]?.backlog.p50).toBeGreaterThan(0);
    expect(two.horizons[1]?.backlog.p50).toBe(0);
    expect(drained.horizons[0]?.backlog.p50).toBeGreaterThan(two.horizons[0]?.backlog.p50 ?? 0);
    // Twice the arrivals expected in the last hour: more arrivals ahead, the more so the sooner.
    const busy = profile(Array.from({ length: 20 }, () => flatDay(10)));
    const seen = forecastFrom(busy, state({ arrivalsLastHour: 240 }));
    expect(seen.scale).toBeCloseTo((240 + 5) / (120 + 5), 12);
    const fading = (m: number) => 1 + (seen.scale - 1) * Math.exp(-m / SCALE_FADE_MIN);
    const first = [0, 1, 2, 3, 4].reduce((sum, m) => sum + 2 * fading(m), 0);
    expect(seen.buckets[0]?.arrivals.p50).toBeCloseTo(first, 6);
    const last = [85, 86, 87, 88, 89].reduce((sum, m) => sum + 2 * fading(m), 0);
    expect(seen.horizons[3]?.arrivals.p50).toBeCloseTo(last, 6);
    expect(last).toBeLessThan(10.03);
  });

  it("follows the lane plan, keeping today's difference from it", () => {
    // The plan opens a second lane at 08:30 and a third at 09:00; one lane more is open now.
    const plan = [
      { fromMs: 0, lanes: 1 },
      { fromMs: 8.5 * 60 * MIN, lanes: 2 },
      { fromMs: 9 * 60 * MIN, lanes: 3 },
    ];
    expect(plannedLanesAt(plan, 0)).toBe(1);
    expect(plannedLanesAt(plan, 8.5 * 60 * MIN - 1)).toBe(1);
    expect(plannedLanesAt(plan, 8.5 * 60 * MIN)).toBe(2);
    expect(plannedLanesAt([], 0)).toBeNull();
    const busy = { ...profile(Array.from({ length: 20 }, () => flatDay(10))), lanePlan: plan };
    const f = forecastFrom(busy, state({ lanesOpen: 2, backlog: 60 }));
    expect(f.lanesAt).toEqual([
      { minutes: 15, lanes: 2 },
      { minutes: 30, lanes: 3 },
      { minutes: 60, lanes: 4 },
      { minutes: 90, lanes: 4 },
    ]);
    // Two lanes serve the two people arriving a minute; then the queue drains at 3 and 4 lanes.
    const held = forecastFrom({ ...busy, lanePlan: [] }, state({ lanesOpen: 2, backlog: 60 }));
    expect(f.horizons[3]?.backlog.p50).toBe(0);
    expect(held.horizons[3]?.backlog.p50).toBeGreaterThan(30);
    // With the lanes held, a party arriving waits for the people ahead at two a minute.
    for (const h of held.horizons) {
      expect(h.waitMs.p50).toBeCloseTo((h.backlog.p50 / 2) * MIN, 6);
      expect(h.waitMs.p90).toBeCloseTo((h.backlog.p90 / 2) * MIN, 6);
    }
    // With the plan's third and fourth lanes, the people ahead go faster.
    expect(f.horizons[1]?.waitMs.p90).toBeLessThan(((f.horizons[1]?.backlog.p90 ?? 0) / 2) * MIN);
  });

  it('gives bands in order, from the spread of the simulated days, the same every time', () => {
    // Days of different loads: the band spans them.
    const days = Array.from({ length: 30 }, (_, d) => flatDay(5 + (d % 10)));
    const p = profile(days);
    const f = forecastFrom(p, state({ backlog: 25, lanesOpen: 2, arrivalsLastHour: 115 }));
    for (const b of f.buckets) {
      expect(b.arrivals.p10).toBeLessThanOrEqual(b.arrivals.p50);
      expect(b.arrivals.p50).toBeLessThanOrEqual(b.arrivals.p90);
      expect(b.arrivals.p10).toBeLessThan(b.arrivals.p90);
    }
    for (const h of f.horizons) {
      for (const band of [h.arrivals, h.backlog, h.waitMs]) {
        expect(band.p10).toBeLessThanOrEqual(band.p50);
        expect(band.p50).toBeLessThanOrEqual(band.p90);
      }
    }
    expect(forecastFrom(p, state({ backlog: 25, lanesOpen: 2, arrivalsLastHour: 115 }))).toEqual(f);
    expect(bandOf([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])).toEqual({ p10: 1.9, p50: 5.5, p90: 9.1 });
  });

  it('refuses what cannot make a forecast', () => {
    expect(() => forecastFrom(profile([]), state())).toThrow(ForecastError);
    expect(() => forecastFrom(profile([flatDay(1), [1]]), state())).toThrow(/same buckets/);
    expect(() => forecastFrom(profile([flatDay(1)]), state({ lanesOpen: 0 }))).toThrow(/one lane/);
    expect(() => forecastFrom(profile([flatDay(1)]), state({ backlog: -1 }))).toThrow(
      /not yet admitted/,
    );
    expect(() =>
      forecastFrom({ startMs: 0, bucketMs: 90_000, days: [flatDay(1)], lanePlan: [] }, state()),
    ).toThrow(/whole number of minutes/);
    const unsorted = [
      { fromMs: 60 * MIN, lanes: 2 },
      { fromMs: 0, lanes: 1 },
    ];
    expect(() => forecastFrom({ ...profile([flatDay(1)]), lanePlan: unsorted }, state())).toThrow(
      /sorted/,
    );
  });
});

describe('the errors of forecasts (S21)', () => {
  it('measures the median and the band against what happened', () => {
    const band = { p10: 8, p50: 10, p90: 12 };
    const summary = errorSummary([
      { quantity: 'arrivals', horizon: 15, truth: 10, band },
      { quantity: 'arrivals', horizon: 15, truth: 14, band },
      { quantity: 'arrivals', horizon: 15, truth: 7, band },
      { quantity: 'arrivals', horizon: 15, truth: 9, band },
    ]);
    // Errors 0, -4, 3, 1: absolute 8 over 4; truths 40; two of four inside the band, one above
    // it, one below it; every band 4 wide.
    expect(summary).toEqual({
      n: 4,
      mae: 2,
      wape: 0.2,
      bias: 0,
      coverage: 0.5,
      below: 0.25,
      above: 0.25,
      width: 4,
    });
    expect(errorSummary([])).toBeNull();
    expect(
      errorSummary([
        { quantity: 'backlog', horizon: 30, truth: 0, band: { p10: 0, p50: 0, p90: 1 } },
      ])?.wape,
    ).toBeNull();
    // Nobody waiting and none forecast: not a forecast of a queue; a miss and a false alarm are.
    const quiet = { p10: 0, p50: 0, p90: 2 };
    expect(isBusy({ quantity: 'backlog', horizon: 15, truth: 0, band: quiet })).toBe(false);
    expect(isBusy({ quantity: 'backlog', horizon: 15, truth: 12, band: quiet })).toBe(true);
    expect(isBusy({ quantity: 'wait', horizon: 15, truth: 0, band: { ...quiet, p50: 3 } })).toBe(
      true,
    );
  });
});
