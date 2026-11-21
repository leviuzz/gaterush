import { readFileSync } from 'node:fs';
import {
  DEFAULT_VIRTUAL_QUEUE,
  FIFO_POLICY,
  PRIORITY_V0_POLICY,
  PRIORITY_V0_SELECTION,
  classificationOf,
} from '@gateflow/queue-core';
import type { Policy } from '@gateflow/queue-core';
import { parseScenarioText } from '@gateflow/sim-scenarios';
import type { Scenario } from '@gateflow/sim-scenarios';
import { describe, expect, it } from 'vitest';
import { roundNumbers, runExperiment } from '../src';
import type { PolicyDayMetrics } from '../src';
import { withoutS3Features } from './legacy';

/**
 * Acceptance criterion of slice S2: with zero call latency and no no-shows, outcomes equal S1.
 * The fixture holds the per-seed metrics produced by S1 (see its `description`).
 */
interface S1Fixture {
  readonly sourceCommit: string;
  readonly seeds: readonly {
    readonly seed: number;
    readonly passengers: number;
    readonly fifo: Readonly<Record<string, number>>;
    readonly priorityV0: Readonly<Record<string, number>>;
  }[];
}

const fixture = JSON.parse(
  readFileSync(new URL('./fixtures/s1-demo-seeds-1-3.json', import.meta.url), 'utf8'),
) as S1Fixture;

const demo = withoutS3Features(
  parseScenarioText(
    readFileSync(
      new URL('../../../scenarios/single-checkpoint-demo.yaml', import.meta.url),
      'utf8',
    ),
  ),
);

/** The demo scenario with every call answered at once and never missed. */
const instantResponses: Scenario = {
  ...demo,
  passengers: {
    ...demo.passengers,
    callResponse: {
      ...demo.passengers.callResponse,
      value: { ...demo.passengers.callResponse.value, medianSeconds: 0, absentProbability: 0 },
    },
  },
};

/** Priority v0 on a virtual queue without call-ahead or prepare window. */
const instantPriority: Policy = {
  id: 'priority-v0-instant',
  version: '0',
  title: 'Priority v0 with instant calls (S1 equivalent)',
  selection: PRIORITY_V0_SELECTION,
  queue: {
    ...DEFAULT_VIRTUAL_QUEUE,
    callAheadSeconds: 0,
    responseEstimateSeconds: 0,
    prepareWindowSize: 0,
  },
};

function run(scenario: Scenario) {
  return runExperiment({
    scenario,
    seeds: fixture.seeds.map((s) => s.seed),
    policies: [FIFO_POLICY, instantPriority],
    baselinePolicyId: FIFO_POLICY.id,
    classification: classificationOf(PRIORITY_V0_POLICY)!,
    bootstrap: { resamples: 10, confidence: 0.95, seed: 1 },
  });
}

/** The S1 fields of `metrics`, rounded as S1 rounded them. */
function asS1(metrics: PolicyDayMetrics | undefined, s1: Readonly<Record<string, number>>) {
  expect(metrics).toBeDefined();
  const rounded = roundNumbers(metrics) as unknown as Record<string, number>;
  for (const key of Object.keys(s1)) expect(rounded, `metric ${key}`).toHaveProperty(key);
  return Object.fromEntries(Object.keys(s1).map((key) => [key, rounded[key]]));
}

describe('regression: without call latency or no-shows, slice S2 reproduces slice S1', () => {
  const instant = run(instantResponses);
  const withResponses = run(demo);

  it.each(fixture.seeds.map((s) => [s.seed, s] as const))('seed %i', (seed, s1) => {
    const day = instant.perSeed.find((d) => d.seed === seed);
    expect(day?.passengers).toBe(s1.passengers);
    expect(asS1(day?.policies.fifo, s1.fifo)).toEqual(s1.fifo);
    expect(asS1(day?.policies['priority-v0-instant'], s1.priorityV0)).toEqual(s1.priorityV0);
    // The physical queue ignores response times altogether.
    const sameDay = withResponses.perSeed.find((d) => d.seed === seed);
    expect(asS1(sameDay?.policies.fifo, s1.fifo)).toEqual(s1.fifo);
  });
});
