import { readFileSync } from 'node:fs';
import {
  FIFO_MANUAL_POLICY,
  FIFO_POLICY,
  PRIORITY_V1_POLICY,
  PRIORITY_V2_POLICY,
  VIRTUAL_FIFO_POLICY,
  classificationOf,
} from '@gateflow/queue-core';
import { generatePopulation, parseScenarioText } from '@gateflow/sim-scenarios';
import { describe, expect, it } from 'vitest';
import { roundNumbers, runExperiment } from '../src';

/**
 * Acceptance criterion of slice S5: without disruptions, and with the S5 rules disabled
 * (`priority-v1` and `priority-v2` have no maximum data age and no hysteresis), outcomes equal
 * S4. The fixture holds the per-seed results of the S4 commit (see its `description`).
 */
interface S4Fixture {
  readonly sourceCommit: string;
  readonly policies: readonly string[];
  readonly comparisons: readonly string[];
  readonly seeds: readonly {
    readonly seed: number;
    readonly passengers: number;
    readonly policies: Readonly<Record<string, Readonly<Record<string, number>>>>;
    readonly comparisons: Readonly<Record<string, Readonly<Record<string, number>>>>;
  }[];
}

const fixture = JSON.parse(
  readFileSync(new URL('./fixtures/s4-demo-seeds-1-3.json', import.meta.url), 'utf8'),
) as S4Fixture;

const demo = parseScenarioText(
  readFileSync(new URL('../../../scenarios/single-checkpoint-demo.yaml', import.meta.url), 'utf8'),
);

/** The fields of `expected` taken from `actual`, rounded as the fixture was. */
function sameFields(
  actual: unknown,
  expected: Readonly<Record<string, number>>,
): Record<string, number> {
  const rounded = roundNumbers(actual) as Record<string, number>;
  for (const key of Object.keys(expected)) expect(rounded, `metric ${key}`).toHaveProperty(key);
  return Object.fromEntries(Object.keys(expected).map((key) => [key, rounded[key]!]));
}

describe('regression: without disruptions, slice S5 reproduces slice S4', () => {
  const policies = [
    FIFO_POLICY,
    FIFO_MANUAL_POLICY,
    VIRTUAL_FIFO_POLICY,
    PRIORITY_V1_POLICY,
    PRIORITY_V2_POLICY,
  ];
  const result = runExperiment({
    scenario: demo,
    seeds: fixture.seeds.map((s) => s.seed),
    policies,
    baselinePolicyId: FIFO_POLICY.id,
    comparisons: fixture.comparisons.map((key) => {
      const [candidateId = '', referenceId = ''] = key.split(' vs ');
      return { candidateId, referenceId };
    }),
    classification: classificationOf(PRIORITY_V2_POLICY)!,
    bootstrap: { resamples: 10, confidence: 0.95, seed: 1 },
  });

  it('uses the S4 policy set, with the S5 rules disabled, on a day without disruptions', () => {
    expect(policies.map((p) => p.id)).toEqual(fixture.policies);
    expect(fixture.seeds.map((s) => s.seed)).toEqual([1, 2, 3]);
    for (const policy of [PRIORITY_V1_POLICY, PRIORITY_V2_POLICY]) {
      expect(policy.selection).toMatchObject({ maxDeadlineAgeMs: null, hysteresisMs: 0 });
    }
    const population = generatePopulation(demo, 1);
    expect(population.laneOutages).toBeUndefined();
    expect(population.feedOutages).toBeUndefined();
    expect(population.flights.some((f) => f.updates !== undefined)).toBe(false);
  });

  it.each(fixture.seeds.map((s) => [s.seed, s] as const))('seed %i', (seed, s4) => {
    const day = result.perSeed.find((d) => d.seed === seed);
    expect(day?.passengers).toBe(s4.passengers);
    for (const [id, metrics] of Object.entries(s4.policies)) {
      expect(sameFields(day?.policies[id], metrics), id).toEqual(metrics);
    }
    for (const [key, metrics] of Object.entries(s4.comparisons)) {
      expect(sameFields(day?.comparisons[key], metrics), key).toEqual(metrics);
    }
  });
});
