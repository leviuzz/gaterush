import { readFileSync } from 'node:fs';
import {
  FIFO_MANUAL_POLICY,
  FIFO_POLICY,
  PRIORITY_V3_POLICY,
  classificationOf,
  findPolicyPreset,
  withLaneMode,
} from '@gateflow/queue-core';
import type { Policy } from '@gateflow/queue-core';
import { arrivalForecast, parseScenario, parseScenarioText } from '@gateflow/sim-scenarios';
import type { Scenario } from '@gateflow/sim-scenarios';
import { describe, expect, it } from 'vitest';
import {
  SweepConfigError,
  applyScenarioSettings,
  applySetting,
  bootstrapRatioInterval,
  buildResults,
  differencesFromPreset,
  needsForecast,
  planExperiment,
  renderReport,
  runDay,
  runExperiment,
} from '../src';

const demo = parseScenarioText(
  readFileSync(new URL('../../../scenarios/single-checkpoint-demo.yaml', import.meta.url), 'utf8'),
);

/** The demo with two more lanes than the plan uses and staff on call for two extra lanes. */
const staffedDemo: Scenario = parseScenario({
  ...demo,
  checkpoint: {
    ...demo.checkpoint,
    lanesAvailable: { value: 8, source: 'SYNTHETIC' },
    laneStaffing: {
      value: {
        maxExtraLanes: 2,
        openDelayMinutes: { median: 10, sigma: 0.4 },
        minOpenMinutes: 30,
        followShare: 0.8,
      },
      source: 'SYNTHETIC',
    },
  },
});

const reactive = withLaneMode(FIFO_MANUAL_POLICY, 'reactive');
const predict = withLaneMode(FIFO_MANUAL_POLICY, 'predict');
const classification = classificationOf(PRIORITY_V3_POLICY)!;

describe('lane settings of the checkpoint (S8)', () => {
  it("sets the supervisor's thresholds from today's practice and GateFlow's from its settings", () => {
    const [manual, supervisor, gateflow, v3] = applyScenarioSettings(
      [
        FIFO_MANUAL_POLICY,
        reactive,
        withLaneMode(PRIORITY_V3_POLICY, 'predict'),
        PRIORITY_V3_POLICY,
      ],
      {
        todayPractice: {
          value: {
            callWindowMinutes: 20,
            announcementIntervalMinutes: 5,
            laneOpenWaitMinutes: 15,
            laneCloseWaitMinutes: 4,
          },
          source: 'AIRPORT_PROVIDED',
        },
        gateflow: {
          value: { laneTargetWaitMinutes: 8, laneHorizonMinutes: 60 },
          source: 'AIRPORT_PROVIDED',
        },
      },
    );
    expect(manual).toEqual(FIFO_MANUAL_POLICY);
    expect(v3).toEqual(PRIORITY_V3_POLICY);
    expect(supervisor?.lanes).toMatchObject({ openWhenWaitMs: 900_000, closeWhenWaitMs: 240_000 });
    expect(gateflow?.lanes).toMatchObject({ targetWaitMs: 480_000, horizonMs: 3_600_000 });
    expect(supervisor === undefined ? [] : differencesFromPreset(supervisor)).toEqual([
      { parameter: 'lanes.openWhenWaitMs', value: 900_000, preset: 600_000 },
      { parameter: 'lanes.closeWhenWaitMs', value: 240_000, preset: 120_000 },
    ]);
    // Settings equal to the presets change nothing.
    const same = applyScenarioSettings([reactive], {
      todayPractice: {
        value: {
          callWindowMinutes: 20,
          announcementIntervalMinutes: 5,
          laneOpenWaitMinutes: 10,
          laneCloseWaitMinutes: 2,
        },
        source: 'SYNTHETIC',
      },
    });
    expect(same).toEqual([reactive]);
    expect(findPolicyPreset(reactive.id)).toEqual(reactive);
  });

  it('rejects thresholds that make the lane rule invalid', () => {
    expect(() =>
      applyScenarioSettings([predict], {
        gateflow: { value: { laneTargetWaitMinutes: 2 }, source: 'SYNTHETIC' },
      }),
    ).toThrow(/closeWhenWaitMs must be below lanes.targetWaitMs/);
  });
});

describe('bootstrapRatioInterval', () => {
  const options = { resamples: 500, confidence: 0.9, seed: 3, key: 'ratio' };

  it('estimates a ratio of totals, deterministically, with an interval around it', () => {
    const num = [10, 20, 30, 0, 25];
    const den = [1, 2, 2, 0, 1];
    const a = bootstrapRatioInterval(num, den, options);
    expect(a?.estimate).toBeCloseTo(85 / 6, 12);
    expect(a?.lower).toBeLessThanOrEqual(a?.estimate ?? 0);
    expect(a?.upper).toBeGreaterThanOrEqual(a?.estimate ?? 0);
    expect(bootstrapRatioInterval(num, den, options)).toEqual(a);
    expect(bootstrapRatioInterval(num, den, { ...options, key: 'other' })).not.toEqual(a);
  });

  it('is not defined without a positive denominator in every resample', () => {
    expect(bootstrapRatioInterval([1, 2], [0, 0], options)).toBeNull();
    expect(bootstrapRatioInterval([1, 2], [1, -1], options)).toBeNull();
    // One day in forty with lanes added: some resample has none.
    const den = Array.from({ length: 40 }, (_, i) => (i === 0 ? 1 : 0));
    expect(bootstrapRatioInterval(den, den, options)).toBeNull();
    expect(() => bootstrapRatioInterval([], [], options)).toThrow(RangeError);
    expect(() => bootstrapRatioInterval([1], [1, 2], options)).toThrow(RangeError);
  });
});

describe('experiments with lane management (S8)', () => {
  const policies: Policy[] = [FIFO_POLICY, FIFO_MANUAL_POLICY, reactive, predict];
  const config = {
    scenario: staffedDemo,
    seeds: [1, 2, 3],
    policies,
    baselinePolicyId: 'fifo',
    comparisons: [
      { candidateId: reactive.id, referenceId: 'fifo-manual' },
      { candidateId: predict.id, referenceId: 'fifo-manual' },
      { candidateId: predict.id, referenceId: reactive.id },
    ],
    classification,
    bootstrap: { resamples: 100, confidence: 0.95, seed: 1 },
  };

  it('computes the forecast once, only for policies that use one', () => {
    expect(needsForecast(policies)).toBe(true);
    expect(needsForecast([FIFO_POLICY, reactive])).toBe(false);
    expect(planExperiment(config).job.forecast).toEqual(arrivalForecast(staffedDemo));
    expect(
      planExperiment({ ...config, policies: [FIFO_POLICY, reactive], comparisons: [] }).job
        .forecast,
    ).toBeUndefined();
  });

  it('opens extra lanes within the limits and reports what they buy', () => {
    const experiment = runExperiment(config);
    for (const day of experiment.perSeed) {
      const plain = day.policies['fifo-manual'];
      for (const id of [reactive.id, predict.id]) {
        const m = day.policies[id];
        expect(m?.maxOpenLanes).toBeLessThanOrEqual(8);
        expect(m?.extraLaneHours).toBeGreaterThanOrEqual(0);
        expect(m?.laneDecisionsFollowed).toBeLessThanOrEqual(m?.laneDecisions ?? 0);
        expect(m?.staffedLaneHours).toBeCloseTo(
          (plain?.staffedLaneHours ?? 0) + (m?.extraLaneHours ?? 0),
          0,
        );
      }
      expect(plain).toMatchObject({ extraLaneHours: 0, laneDecisions: 0 });
      // The day is the same for every policy: the same people and the same staff on call.
      expect(day.policies[predict.id]?.passengers).toBe(plain?.passengers);
    }
    const predictDays = experiment.perSeed.map((d) => d.policies[predict.id]?.extraLaneHours ?? 0);
    expect(predictDays.some((h) => h > 0)).toBe(true);
    const doc = buildResults(experiment, {
      generator: { name: 'test', version: '0' },
      commit: 'test',
      scenarioHash: 'sha256:test',
    });
    const versus = doc.summary.comparisons[`${predict.id} vs fifo-manual`];
    expect(versus?.metrics.extraLaneHoursDelta.mean).toBeGreaterThan(0);
    expect(versus?.perExtraLaneHour?.waitSavedPersonHours.estimate).toBeGreaterThan(0);
    // Against the supervisor the lane-hours may go either way: no ratio.
    const modes = doc.summary.comparisons[`${predict.id} vs ${reactive.id}`];
    if (
      experiment.perSeed.some(
        (d) => (d.comparisons[`${predict.id} vs ${reactive.id}`]?.extraLaneHoursDelta ?? 0) < 0,
      )
    ) {
      expect(modes?.perExtraLaneHour).toBeUndefined();
    }
    const report = renderReport(doc);
    expect(report).toMatch(/## \d+\. Lane management/);
    expect(report).toContain('never more than the 8 lanes the checkpoint has');
    expect(report).toContain('the duty manager follows 80% of its recommendations');
    expect(report).toContain(`| \`${predict.id}\` vs \`fifo-manual\` |`);
    expect(report).toContain('| lanes.targetWaitMs | 10.0 min |');
    // A comparison that changes only the lanes prioritises nobody: no fairness section for it.
    expect(report).not.toContain(
      `not prioritised by \`${reactive.id}\` (compared with \`fifo-manual\`)`,
    );
    expect(JSON.stringify(doc.summary)).not.toMatch(/null|NaN|Infinity/);
  });

  it('gives the same days without staff on call to policies with or without lane management', () => {
    const job = planExperiment({ ...config, scenario: demo }).job;
    const day = runDay(job, 2);
    const { extraLaneHours, laneDecisions, lanesOpened } = day.policies[predict.id] ?? {};
    expect([extraLaneHours, laneDecisions, lanesOpened]).toEqual([0, 0, 0]);
    expect({ ...day.policies[predict.id] }).toEqual({ ...day.policies['fifo-manual'] });
  });
});

describe('sweeps of lane management (S8)', () => {
  const base = { scenario: staffedDemo, policies: [FIFO_MANUAL_POLICY, reactive, predict] };
  const apply = (parameter: Parameters<typeof applySetting>[1]['parameter'], value: number) =>
    applySetting(base, { parameter, value }, predict.id);

  it('varies the staff on call and the target wait of the candidate', () => {
    const staffing = (parameter: Parameters<typeof applySetting>[1]['parameter'], value: number) =>
      apply(parameter, value).scenario.checkpoint.laneStaffing?.value;
    expect(staffing('maxExtraLanes', 3)?.maxExtraLanes).toBe(3);
    expect(staffing('laneOpenDelayMinutes', 20)?.openDelayMinutes).toEqual({
      median: 20,
      sigma: 0.4,
    });
    expect(staffing('laneFollowShare', 0.5)?.followShare).toBe(0.5);
    const target = apply('laneTargetWaitMinutes', 6).policies.find((p) => p.id === predict.id);
    expect(target?.lanes).toMatchObject({ targetWaitMs: 360_000 });
    expect(apply('laneTargetWaitMinutes', 6).policies[1]).toBe(reactive);
  });

  it('rejects lane parameters that cannot apply', () => {
    expect(() =>
      applySetting(
        { scenario: demo, policies: base.policies },
        { parameter: 'maxExtraLanes', value: 1 },
        predict.id,
      ),
    ).toThrow(/needs checkpoint.laneStaffing/);
    expect(() =>
      applySetting(base, { parameter: 'laneTargetWaitMinutes', value: 6 }, reactive.id),
    ).toThrow(/does not recommend lanes/);
    expect(() => apply('laneTargetWaitMinutes', 2)).toThrow(SweepConfigError);
    expect(() => apply('laneFollowShare', 1.5)).toThrow(/invalid/);
    expect(() => apply('maxExtraLanes', 1.5)).toThrow(SweepConfigError);
  });
});
