import { readFileSync } from 'node:fs';
import {
  BUCKET_MS,
  HORIZONS_MIN,
  LIBRARY_CALIBRATION,
  errorSummary,
  isBusy,
} from '@gateflow/forecast';
import { PRIORITY_V3_POLICY, classificationOf } from '@gateflow/queue-core';
import { FORECAST_DAYS, generatePopulation, parseScenarioText } from '@gateflow/sim-scenarios';
import { describe, expect, it } from 'vitest';
import {
  BACKTEST_SCHEMA,
  CALIBRATION_SCHEMA,
  ORIGIN_EVERY_MS,
  backtestDay,
  buildBacktest,
  buildCalibration,
  calibrationDay,
  calibrationOfDays,
  checkpointProfile,
  planBacktest,
  renderBacktestReport,
  renderCalibrationModule,
  stringifyBacktest,
  summariseBacktest,
} from '../src';

const load = (file: string) =>
  parseScenarioText(readFileSync(new URL(`../../../scenarios/${file}`, import.meta.url), 'utf8'));
const demo = load('single-checkpoint-demo.yaml');
const staffed = load('single-checkpoint-staffed.yaml');
const classification = classificationOf(PRIORITY_V3_POLICY)!;
const MIN = 60_000;

describe('the profile forecasts read of a scenario (S21)', () => {
  it("counts the people taking a number on other days, and keeps the scenario's lane plan", () => {
    const profile = checkpointProfile(demo, 3);
    expect(profile.bucketMs).toBe(BUCKET_MS);
    expect(profile.days).toHaveLength(3);
    expect(new Set(profile.days.map((day) => day.length)).size).toBe(1);
    expect(profile.lanePlan).toEqual([{ fromMs: 0, lanes: 6 }]);
    // The first day of the profile is the first forecast day: assisted parties take no number.
    const first = generatePopulation(demo, 1_000_001).passengers.filter((p) => p.path === 'QUEUE');
    const people = first.reduce((sum, p) => sum + p.partySize, 0);
    expect(profile.days[0]?.reduce((a, b) => a + b, 0)).toBe(people);
    expect(checkpointProfile(demo).days).toHaveLength(FORECAST_DAYS);
    expect(checkpointProfile(staffed, 1).lanePlan.length).toBeGreaterThan(5);
    expect(() => checkpointProfile(demo, 0)).toThrow(RangeError);
  });
});

describe('the backtest of the forecasts on the simulated truth (S21)', () => {
  const job = planBacktest(demo, PRIORITY_V3_POLICY, classification);
  const day = backtestDay(job, 1);

  it('forecasts every 15 minutes and compares each horizon with what the simulator did', () => {
    const population = generatePopulation(demo, 1);
    const queueParties = population.passengers.filter((p) => p.path === 'QUEUE');
    const lastMs = Math.max(...queueParties.map((p) => p.arrivalMs));
    const origins = [...new Set(day.map((o) => o.originMs))];
    expect(origins.length).toBeGreaterThan(50);
    for (const [i, t] of origins.entries()) {
      expect(t % ORIGIN_EVERY_MS).toBe(0);
      if (i > 0) expect(t - (origins[i - 1] ?? 0)).toBe(ORIGIN_EVERY_MS);
    }
    for (const o of day) {
      expect(HORIZONS_MIN).toContain(o.horizon);
      expect(o.originMs + o.horizon * MIN).toBeLessThanOrEqual(lastMs);
      expect(o.truth).toBeGreaterThanOrEqual(0);
      expect(o.band.p10).toBeLessThanOrEqual(o.band.p50);
      expect(o.band.p50).toBeLessThanOrEqual(o.band.p90);
    }
    // The truth of the arrivals, counted again from the population.
    for (const o of day.filter((x) => x.quantity === 'arrivals')) {
      const end = o.originMs + o.horizon * MIN;
      const people = queueParties
        .filter((p) => p.arrivalMs >= end - BUCKET_MS && p.arrivalMs < end)
        .reduce((sum, p) => sum + p.partySize, 0);
      expect(o.truth).toBe(people);
    }
    // People not yet admitted are whole people; somebody waited during the morning peak.
    const backlog = day.filter((o) => o.quantity === 'backlog');
    expect(backlog.every((o) => Number.isInteger(o.truth))).toBe(true);
    expect(Math.max(...backlog.map((o) => o.truth))).toBeGreaterThan(20);
    expect(backtestDay(job, 1)).toEqual(day);
  });

  it('sums the days up per quantity and horizon, apart for the forecasts of a queue', () => {
    const days = [day, backtestDay(job, 2)];
    const summary = summariseBacktest(days);
    for (const quantity of ['arrivals', 'backlog', 'wait'] as const) {
      for (const h of HORIZONS_MIN) {
        const all = days.flat().filter((o) => o.quantity === quantity && o.horizon === h);
        const errors = summary[quantity][String(h)];
        expect(errors?.all?.n).toBe(all.length);
        expect(errors?.all?.mae).toBeCloseTo(errorSummary(all)?.mae ?? NaN, 4);
        expect(errors?.busy?.n).toBe(all.filter((o) => isBusy(o)).length);
      }
    }
    // Most of the day nobody waits: the forecasts of a queue are a part of them.
    expect(summary.backlog['30']?.busy?.n).toBeLessThan((summary.backlog['30']?.all?.n ?? 0) / 2);
  });

  it('writes a deterministic document and a report with a table per horizon', () => {
    const doc = buildBacktest(
      {
        scenario: demo,
        scenarioHash: 'sha256:test',
        policy: PRIORITY_V3_POLICY,
        seeds: [2, 1],
        generator: { name: 'test', version: '0.0.0' },
        commit: 'test',
      },
      [day, backtestDay(job, 2)],
    );
    expect(doc.schema).toBe(BACKTEST_SCHEMA);
    expect(doc.manifest.seeds).toEqual({ count: 2, ranges: '1-2' });
    expect(doc.manifest.horizonsMinutes).toEqual([15, 30, 60, 90]);
    expect(JSON.parse(stringifyBacktest(doc))).toEqual(doc);
    const report = renderBacktestReport(doc);
    expect(report).toContain('SIMULATED RESULTS ON SYNTHETIC OR HYPOTHETICAL DATA');
    expect(report).toContain('## Arrivals');
    expect(report).toContain('### When a queue was forecast or happened');
    expect(report.match(/^\| 90 min \|/gm)).toHaveLength(5);
    expect(report).not.toMatch(/NaN|undefined|Infinity/);
  });

  it("follows the scenario's lane plan when the lanes change over the day", () => {
    const planned = planBacktest(staffed, PRIORITY_V3_POLICY, classification);
    expect(planned.profile.lanePlan).toEqual(
      generatePopulation(staffed, 1).checkpoint.laneSchedule.map((e) => ({
        fromMs: e.fromMs,
        lanes: e.lanes,
      })),
    );
    expect(backtestDay(planned, 1).length).toBeGreaterThan(0);
  });
});

describe('the calibration of the bands on simulated days (S21.3)', () => {
  const job = planBacktest(demo, PRIORITY_V3_POLICY, classification);
  const pits = calibrationDay(job, 2_000_001);

  it('places every truth of the arrivals, and of a queue, among the paths', () => {
    const day = backtestDay(job, 2_000_001);
    for (const h of HORIZONS_MIN) {
      const at = (q: 'arrivals' | 'backlog' | 'wait') =>
        day.filter((o) => o.quantity === q && o.horizon === h);
      expect(pits.arrivals[String(h)]).toHaveLength(at('arrivals').length);
      // A queue: the paths' median or the truth at least 1 (person, minute).
      expect(pits.backlog[String(h)]).toHaveLength(at('backlog').filter((o) => isBusy(o)).length);
      expect(pits.wait[String(h)]?.length).toBeGreaterThan(0);
      for (const values of [pits.arrivals, pits.backlog, pits.wait]) {
        for (const u of values[String(h)] ?? []) {
          expect(u).toBeGreaterThanOrEqual(0);
          expect(u).toBeLessThanOrEqual(1);
        }
      }
    }
    // Pooled days give the levels of their PIT values; one day of the demo is enough for 30 of
    // the arrivals at every horizon.
    const calibration = calibrationOfDays([pits, calibrationDay(job, 2_000_002)]);
    expect(calibration.levels.arrivals['15']?.p50).toBe(0.5);
    expect(calibration.levels.arrivals['15']?.p10).toBeLessThanOrEqual(0.5);
  });

  it('writes the calibration as a module of the forecasts, with where it comes from', () => {
    const doc = buildCalibration(
      {
        scenarios: [{ id: demo.id, hash: 'sha256:' + 'ab'.repeat(32), policy: 'priority-v3' }],
        seeds: [2_000_002, 2_000_001],
        generator: { name: 'test', version: '0.0.0' },
      },
      [pits, calibrationDay(job, 2_000_002)],
    );
    expect(doc.schema).toBe(CALIBRATION_SCHEMA);
    expect(doc.seeds).toEqual({ count: 2, ranges: '2000001-2000002' });
    expect(doc.truths.arrivals['15']).toBe(
      (pits.arrivals['15']?.length ?? 0) +
        (calibrationDay(job, 2_000_002).arrivals['15']?.length ?? 0),
    );
    const module = renderCalibrationModule(doc);
    expect(module).toContain('export const LIBRARY_CALIBRATION: Calibration = {');
    expect(module).toContain(`- ${demo.id} (priority-v3, sha256:abababababab...)`);
    expect(module).toContain(
      'export const LIBRARY_CALIBRATION_SOURCE = "the scenario library (1 scenarios, seeds 2000001-2000002)";',
    );
    const start = module.indexOf('Calibration = ') + 'Calibration = '.length;
    const json = module.slice(start, module.indexOf('};', start) + 1);
    expect(JSON.parse(json)).toEqual({ levels: doc.levels });
    expect(renderCalibrationModule(doc)).toBe(module);
  });

  it('reports the calibrated bands, and how the paths as they are did', () => {
    const days = [1, 2].map((seed) => backtestDay(job, seed, LIBRARY_CALIBRATION));
    const doc = buildBacktest(
      {
        scenario: demo,
        scenarioHash: 'sha256:test',
        policy: PRIORITY_V3_POLICY,
        seeds: [1, 2],
        generator: { name: 'test', version: '0.0.0' },
        commit: 'test',
        calibration: { source: 'the library', calibration: LIBRARY_CALIBRATION },
      },
      days,
    );
    expect(doc.manifest.calibration).toEqual({
      source: 'the library',
      levels: LIBRARY_CALIBRATION.levels,
    });
    const after = doc.summary.wait['30']?.busy;
    const before = doc.uncalibrated?.wait['30']?.busy;
    // The same forecasts and the same medians; wider bands.
    expect(after?.n).toBe(before?.n);
    expect(after?.mae).toBe(before?.mae);
    expect(after?.bias).toBe(before?.bias);
    expect(after?.width).toBeGreaterThan(before?.width ?? Infinity);
    expect(after?.coverage).toBeGreaterThanOrEqual(before?.coverage ?? Infinity);
    expect(summariseBacktest(days)).toEqual(doc.uncalibrated);
    const report = renderBacktestReport(doc);
    expect(report).toContain('| Paths in p10-p90 |');
    expect(report).toContain('calibration (the library)');
    expect(report).not.toMatch(/NaN|undefined|Infinity/);
  });
});
