import { readFileSync } from 'node:fs';
import { BUCKET_MS, HORIZONS_MIN, errorSummary, isBusy } from '@gateflow/forecast';
import { PRIORITY_V3_POLICY, classificationOf } from '@gateflow/queue-core';
import { FORECAST_DAYS, generatePopulation, parseScenarioText } from '@gateflow/sim-scenarios';
import { describe, expect, it } from 'vitest';
import {
  BACKTEST_SCHEMA,
  ORIGIN_EVERY_MS,
  backtestDay,
  buildBacktest,
  checkpointProfile,
  planBacktest,
  renderBacktestReport,
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
