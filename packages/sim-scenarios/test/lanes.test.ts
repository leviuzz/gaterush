import { readFileSync } from 'node:fs';
import { MS_PER_MINUTE } from '@gateflow/domain';
import { validatePopulation } from '@gateflow/sim-model';
import { describe, expect, it } from 'vitest';
import {
  FORECAST_FIRST_SEED,
  LANE_DECISIONS_PER_DAY,
  arrivalForecast,
  canonicalJson,
  generatePopulation,
  maxPlannedLanes,
  parseScenario,
  parseScenarioText,
  planLanes,
} from '../src';
import type { LaneStaffingSpec, Scenario } from '../src';

const demo = parseScenarioText(
  readFileSync(new URL('../../../scenarios/single-checkpoint-demo.yaml', import.meta.url), 'utf8'),
);

const STAFFING: LaneStaffingSpec = {
  maxExtraLanes: 2,
  openDelayMinutes: { median: 10, sigma: 0.4 },
  minOpenMinutes: 30,
  followShare: 0.8,
};

/** The demo with staff on call and a checkpoint of `lanes` lanes. */
function staffed(spec: LaneStaffingSpec = STAFFING, lanes = 6): Scenario {
  return parseScenario({
    ...demo,
    checkpoint: {
      ...demo.checkpoint,
      lanesAvailable: { value: lanes, source: 'SYNTHETIC' },
      laneStaffing: { value: spec, source: 'SYNTHETIC' },
    },
  });
}

describe('staff on call (S8)', () => {
  it('adds the day of the staff without changing anything else of the population', () => {
    const scenario = staffed();
    for (const seed of [1, 2, 3]) {
      const { staffing, ...rest } = generatePopulation(scenario, seed);
      expect(canonicalJson(rest)).toBe(canonicalJson(generatePopulation(demo, seed)));
      expect(staffing).toMatchObject({
        lanesAvailable: 6,
        maxExtraLanes: 2,
        openDelayEstimateMs: 10 * MS_PER_MINUTE,
        minOpenMs: 30 * MS_PER_MINUTE,
      });
      expect(staffing?.openDelaysMs).toHaveLength(LANE_DECISIONS_PER_DAY);
      expect(staffing?.follows).toHaveLength(LANE_DECISIONS_PER_DAY);
      expect(() => {
        validatePopulation(generatePopulation(scenario, seed));
      }).not.toThrow();
    }
    expect(generatePopulation(demo, 1).staffing).toBeUndefined();
  });

  it('draws delays around the median and answers with the follow share', () => {
    const delays: number[] = [];
    let followed = 0;
    let answers = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const staffing = generatePopulation(staffed(), seed).staffing;
      if (staffing === undefined) throw new Error('expected staff on call');
      delays.push(...staffing.openDelaysMs);
      followed += staffing.follows.filter(Boolean).length;
      answers += staffing.follows.length;
    }
    delays.sort((a, b) => a - b);
    const median = delays[Math.floor(delays.length / 2)] ?? 0;
    expect(median / MS_PER_MINUTE).toBeGreaterThan(9.5);
    expect(median / MS_PER_MINUTE).toBeLessThan(10.5);
    expect(delays.every((d) => Number.isInteger(d) && d > 0)).toBe(true);
    expect(followed / answers).toBeGreaterThan(0.77);
    expect(followed / answers).toBeLessThan(0.83);
  });

  it('gives every policy the same day: same seed, same draws; another seed, others', () => {
    const a = generatePopulation(staffed(), 7).staffing;
    expect(generatePopulation(staffed(), 7).staffing).toEqual(a);
    expect(generatePopulation(staffed(), 8).staffing).not.toEqual(a);
    // A different follow share changes the answers, not the delays (streams of their own).
    const always = generatePopulation(staffed({ ...STAFFING, followShare: 1 }), 7).staffing;
    expect(always?.openDelaysMs).toEqual(a?.openDelaysMs);
    expect(always?.follows.every(Boolean)).toBe(true);
    const never = generatePopulation(staffed({ ...STAFFING, followShare: 0 }), 7).staffing;
    expect(never?.follows.some(Boolean)).toBe(false);
  });

  it('needs the lanes the checkpoint has', () => {
    expect(() =>
      parseScenario({
        ...demo,
        checkpoint: { ...demo.checkpoint, laneStaffing: { value: STAFFING, source: 'SYNTHETIC' } },
      }),
    ).toThrow(/laneStaffing needs checkpoint.lanesAvailable/);
  });
});

describe('arrival forecast (S8)', () => {
  it('is the average arrival profile of days never simulated in the reports', () => {
    const forecast = arrivalForecast(demo, 3);
    let people = 0;
    const byMinute = new Map<number, number>();
    for (let i = 0; i < 3; i++) {
      for (const p of generatePopulation(demo, FORECAST_FIRST_SEED + i).passengers) {
        people += p.partySize;
        const minute = Math.floor(p.arrivalMs / MS_PER_MINUTE);
        byMinute.set(minute, (byMinute.get(minute) ?? 0) + p.partySize);
      }
    }
    const total = forecast.peoplePerMinute.reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(people / 3, 9);
    const first = Math.min(...byMinute.keys());
    expect(forecast.startMs).toBe(first * MS_PER_MINUTE);
    for (const [minute, n] of byMinute) {
      expect(forecast.peoplePerMinute[minute - first]).toBeCloseTo(n / 3, 9);
    }
    expect(arrivalForecast(demo, 3)).toEqual(forecast);
  });

  it('rejects a number of days that is not a positive integer', () => {
    expect(() => arrivalForecast(demo, 0)).toThrow(RangeError);
    expect(() => arrivalForecast(demo, 1.5)).toThrow(RangeError);
  });
});

describe('lane plan rule with a roster limit (S8)', () => {
  it('plans at most maxLanes, the other lanes being left for extra lanes', () => {
    const rule = { utilisation: 0.9, intervalMinutes: 60 as const, minLanes: 1, planningDays: 10 };
    const busy = parseScenario({
      ...demo,
      checkpoint: { ...demo.checkpoint, lanesAvailable: { value: 8, source: 'SYNTHETIC' } },
    });
    const free = planLanes(busy, rule, 8);
    const peak = Math.max(...free.map((e) => e.lanes));
    expect(peak).toBeGreaterThan(2);
    const capped = planLanes(busy, { ...rule, maxLanes: peak - 1 }, 8);
    expect(Math.max(...capped.map((e) => e.lanes))).toBe(peak - 1);
    expect(maxPlannedLanes({ ...rule, maxLanes: 5 }, 8)).toBe(5);
    expect(maxPlannedLanes({ ...rule, maxLanes: 12 }, 8)).toBe(8);
    expect(maxPlannedLanes(rule, 8)).toBe(8);
  });
});
