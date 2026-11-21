import { readFileSync } from 'node:fs';
import {
  FIFO_MANUAL_POLICY,
  FIFO_POLICY,
  PRIORITY_V3_POLICY,
  VIRTUAL_FIFO_POLICY,
  classificationOf,
} from '@gateflow/queue-core';
import type { Policy } from '@gateflow/queue-core';
import { generatePopulation, parseScenarioText } from '@gateflow/sim-scenarios';
import { describe, expect, it } from 'vitest';
import {
  SweepConfigError,
  applySetting,
  assembleSweep,
  buildSweepResults,
  planSweep,
  renderSweepReport,
  runExperiment,
  runSweep,
  runSweepDay,
  stringifySweep,
  sweepDayJob,
} from '../src';
import type { SweepConfig, SweepDimension } from '../src';

const load = (name: string) =>
  parseScenarioText(
    readFileSync(new URL(`../../../scenarios/${name}.yaml`, import.meta.url), 'utf8'),
  );
const demo = load('single-checkpoint-demo');
const disrupted = load('single-checkpoint-disrupted');
const POLICIES: Policy[] = [
  FIFO_POLICY,
  FIFO_MANUAL_POLICY,
  VIRTUAL_FIFO_POLICY,
  PRIORITY_V3_POLICY,
];
const COMPARISONS = [
  { candidateId: 'priority-v3', referenceId: 'fifo-manual' },
  { candidateId: 'priority-v3', referenceId: 'virtual-fifo' },
];
const classification = classificationOf(PRIORITY_V3_POLICY)!;

function config(dimensions: SweepDimension[], overrides: Partial<SweepConfig> = {}): SweepConfig {
  return {
    id: 'test-sweep',
    title: 'Test sweep',
    description: 'A small sweep for tests.',
    scenario: demo,
    seeds: [1, 2],
    policies: POLICIES,
    baselinePolicyId: 'fifo',
    candidateId: 'priority-v3',
    comparisons: COMPARISONS,
    classification,
    bootstrap: { resamples: 50, confidence: 0.95, seed: 7 },
    dimensions,
    ...overrides,
  };
}

const selection = (policies: readonly Policy[], id = 'priority-v3') => {
  const s = policies.find((p) => p.id === id)?.selection;
  if (s?.kind !== 'constrained-edf') throw new Error('not a priority policy');
  return s;
};

describe('sweep settings', () => {
  const base = { scenario: demo, policies: POLICIES };
  const apply = (
    parameter: Parameters<typeof applySetting>[1]['parameter'],
    value: number | null,
  ) => applySetting(base, { parameter, value }, 'priority-v3');

  it('changes only the candidate for its policy parameters', () => {
    const v = apply('maxOvertakes', 12);
    expect(selection(v.policies).maxOvertakes).toBe(12);
    expect(v.policies.filter((p) => p.id !== 'priority-v3')).toEqual(
      POLICIES.filter((p) => p.id !== 'priority-v3'),
    );
    expect(v.scenario).toBe(demo);
    expect(selection(apply('capMaxPriorityCalls', 4).policies).capMaxPriorityCalls).toBe(4);
    expect(selection(apply('hysteresisMinutes', 1.5).policies).hysteresisMs).toBe(90_000);
    expect(selection(apply('maxDeadlineAgeMinutes', null).policies).maxDeadlineAgeMs).toBeNull();
    expect(selection(apply('maxDeadlineAgeMinutes', 45).policies).maxDeadlineAgeMs).toBe(2_700_000);
  });

  it('changes every virtual queue for queue parameters, so the same-queue comparison holds', () => {
    for (const parameter of [
      'prepareWindowSize',
      'callAheadSeconds',
      'responseEstimateSeconds',
    ] as const) {
      const v = apply(parameter, 4);
      for (const p of v.policies) {
        expect(p.queue.kind === 'virtual' ? p.queue[parameter] : 'physical').toBe(
          p.queue.kind === 'virtual' ? 4 : 'physical',
        );
      }
    }
    expect(() => apply('callAheadSeconds', -1)).toThrow(SweepConfigError);
  });

  it('changes the simulated days for its scenario parameters, validated again', () => {
    const lanes = apply('lanesDelta', -5).scenario.checkpoint.laneSchedule.value;
    expect(lanes.map((e) => e.lanes)).toEqual([1]);
    const lf = apply('loadFactorScale', 1.1).scenario.passengers.loadFactor.value;
    expect(lf).toEqual({ min: 0.66, mode: 0.935, max: 1 });
    const showUp = apply('showUpShiftMinutes', -10).scenario.passengers.showUp;
    expect(showUp.departing.value.medianExtraMinutes).toBe(60);
    expect(showUp.transfer.value.medianExtraMinutes).toBe(15);
    expect(
      apply('callResponseMedianSeconds', 120).scenario.passengers.callResponse.value,
    ).toMatchObject({
      medianSeconds: 120,
      absentProbability: 0.04,
    });
    const feed = applySetting(
      { scenario: disrupted, policies: POLICIES },
      { parameter: 'feedOutagesPerDay', value: 4 },
      'priority-v3',
    ).scenario.disruptions.feedOutages.value;
    expect(feed.perDay).toBe(4);
    // The base is never modified.
    expect(demo.checkpoint.laneSchedule.value[0]?.lanes).toBe(6);
  });

  it('rejects values that make no sense', () => {
    expect(() => apply('maxOvertakes', 2.5)).toThrow(SweepConfigError);
    expect(() => apply('capMaxPriorityCalls', 21)).toThrow(/exceeds capWindowCalls/);
    expect(() => apply('hysteresisMinutes', null)).toThrow(SweepConfigError);
    expect(() => apply('showUpShiftMinutes', -70)).toThrow(/no extra time/);
    expect(() => apply('absentProbability', 1.5)).toThrow(/invalid/);
    expect(() => applySetting(base, { parameter: 'maxOvertakes', value: 10 }, 'fifo')).toThrow(
      /not a priority/,
    );
  });
});

describe('planSweep', () => {
  it('shares the simulated days of policy-only points and the runs of identical points', () => {
    const plan = planSweep(
      config([
        { id: 'k', title: 'K', parameter: 'maxOvertakes', values: [10, 30] },
        { id: 'h', title: 'h', parameter: 'hysteresisMinutes', values: [0, 3] },
        { id: 'lanes', title: 'Lanes', parameter: 'lanesDelta', values: [0, 1] },
      ]),
    );
    // One scenario for all policy points and lanes +0; another for lanes +1.
    expect(plan.variants).toHaveLength(2);
    expect(plan.points.map((p) => p.variant)).toEqual([0, 0, 0, 0, 0, 1]);
    // K 30, h 3 and lanes +0 are the base: one run.
    expect(plan.points.map((p) => p.run)).toEqual([0, 1, 2, 1, 1, 0]);
    expect(plan.variants[0]?.runs).toHaveLength(3);
  });

  it('rejects inconsistent sweeps', () => {
    const k = { id: 'k', title: 'K', parameter: 'maxOvertakes' as const, values: [10] };
    const bad: Partial<SweepConfig>[] = [
      { candidateId: 'nope' },
      { comparisons: [] },
      { comparisons: [{ candidateId: 'priority-v3', referenceId: 'priority-v3' }] },
      { dimensions: [] },
      { dimensions: [k, k] },
      { dimensions: [{ ...k, values: [] }] },
      { dimensions: [{ ...k, values: [10, 10] }] },
      { dimensions: [{ ...k, values: [null] }] },
      { seeds: [] },
    ];
    for (const overrides of bad) {
      expect(() => planSweep(config([k], overrides))).toThrow();
    }
  });
});

describe('runSweep', () => {
  const sweepConfig = config([
    { id: 'k', title: 'Overtake bound', parameter: 'maxOvertakes', values: [10, 30] },
    { id: 'lanes', title: 'One lane fewer', parameter: 'lanesDelta', values: [-1] },
  ]);
  const sweep = runSweep(sweepConfig);

  it('gives every point the metrics of an ordinary experiment on the same settings', () => {
    // The point K = 10 is an experiment with that policy.
    const k10 = applySetting(
      { scenario: demo, policies: POLICIES },
      { parameter: 'maxOvertakes', value: 10 },
      'priority-v3',
    );
    const experiment = runExperiment({
      scenario: k10.scenario,
      seeds: [1, 2],
      policies: k10.policies,
      baselinePolicyId: 'fifo',
      comparisons: COMPARISONS,
      classification,
      bootstrap: sweepConfig.bootstrap,
    });
    const days = sweep.days[0] ?? [];
    expect(days.map((d) => d.policies)).toEqual(experiment.perSeed.map((s) => s.policies));
    expect(days.map((d) => d.comparisons)).toEqual(experiment.perSeed.map((s) => s.comparisons));
  });

  it('assembles days computed separately, in any order, into the same sweep', () => {
    const plan = planSweep(sweepConfig);
    const results = plan.variants.map((variant) => {
      const job = sweepDayJob(sweepConfig, variant);
      return [...plan.seeds].reverse().map((seed) => structuredClone(runSweepDay(job, seed)));
    });
    expect(assembleSweep(sweepConfig, plan, results)).toEqual(sweep);
    expect(() => assembleSweep(sweepConfig, plan, results.slice(1))).toThrow(SweepConfigError);
    expect(() => assembleSweep(sweepConfig, plan, [results[0]!.slice(1), results[1]!])).toThrow(
      /expected 2 seeds/,
    );
  });

  it('builds a deterministic document and report, with the base point marked', () => {
    const input = {
      generator: { name: 'test', version: '0' },
      commit: 'test',
      scenarioHash: 'sha256:x',
      sweepHash: 'sha256:y',
      specPath: 'sweeps/test.yaml',
    };
    const doc = buildSweepResults(sweep, input);
    expect(stringifySweep(buildSweepResults(runSweep(sweepConfig), input))).toBe(
      stringifySweep(doc),
    );
    expect(doc.dimensions.map((d) => d.points.map((p) => [p.label, p.isBase]))).toEqual([
      [
        ['10', false],
        ['30', true],
      ],
      [['-1', false]],
    ]);
    // Fewer lanes, more missed flights under FIFO.
    const fifoMissed = (d: number, p: number) =>
      doc.dimensions[d]?.points[p]?.policies.fifo?.missed.mean ?? NaN;
    expect(fifoMissed(1, 0)).toBeGreaterThan(fifoMissed(0, 1));
    const report = renderSweepReport(doc);
    expect(report).toContain('> **SIMULATED RESULTS');
    expect(report).toContain('**30 (base)**');
    expect(report).toContain('Net saved vs `fifo-manual`');
    expect(report).toContain('Others delayed > 5 min');
    expect(report).not.toMatch(/NaN|undefined|Infinity/);
    expect(doc.manifest).toMatchObject({ simulatedDays: 4, seeds: { ranges: '1-2' } });
  });

  it('simulates each distinct policy once per day', () => {
    // Two runs of the base variant differ only by the candidate: the baselines are shared.
    const plan = planSweep(sweepConfig);
    const job = sweepDayJob(sweepConfig, plan.variants[0]!);
    const day = runSweepDay(job, 1);
    expect(day.runs[0]?.policies.fifo).toEqual(day.runs[1]?.policies.fifo);
    expect(generatePopulation(demo, 1).passengers.length).toBeGreaterThan(0);
  });
});
