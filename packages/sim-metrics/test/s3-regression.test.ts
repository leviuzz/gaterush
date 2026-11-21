import { readFileSync } from 'node:fs';
import {
  FIFO_MANUAL_POLICY,
  FIFO_POLICY,
  PRIORITY_V1_POLICY,
  VIRTUAL_FIFO_POLICY,
  classificationOf,
} from '@gateflow/queue-core';
import { parseScenarioText } from '@gateflow/sim-scenarios';
import { describe, expect, it } from 'vitest';
import { roundNumbers, runExperiment } from '../src';

/**
 * Acceptance criterion of slice S4: with the fast track disabled (priority-v1), outcomes equal S3.
 * The fixture holds the per-seed results of the S3 commit (see its `description`).
 */
interface S3Fixture {
  readonly sourceCommit: string;
  readonly scenarioHash: string;
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
  readFileSync(new URL('./fixtures/s3-demo-seeds-1-3.json', import.meta.url), 'utf8'),
) as S3Fixture;

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

describe('regression: without the fast track, slice S4 reproduces slice S3', () => {
  const policies = [FIFO_POLICY, FIFO_MANUAL_POLICY, VIRTUAL_FIFO_POLICY, PRIORITY_V1_POLICY];
  const result = runExperiment({
    scenario: demo,
    seeds: fixture.seeds.map((s) => s.seed),
    policies,
    baselinePolicyId: FIFO_POLICY.id,
    comparisons: fixture.comparisons.map((key) => {
      const [candidateId = '', referenceId = ''] = key.split(' vs ');
      return { candidateId, referenceId };
    }),
    classification: classificationOf(PRIORITY_V1_POLICY)!,
    bootstrap: { resamples: 10, confidence: 0.95, seed: 1 },
  });

  it('uses the S3 policy set', () => {
    expect(policies.map((p) => p.id)).toEqual(fixture.policies);
    expect(fixture.seeds.map((s) => s.seed)).toEqual([1, 2, 3]);
  });

  it.each(fixture.seeds.map((s) => [s.seed, s] as const))('seed %i', (seed, s3) => {
    const day = result.perSeed.find((d) => d.seed === seed);
    expect(day?.passengers).toBe(s3.passengers);
    for (const [id, metrics] of Object.entries(s3.policies)) {
      expect(sameFields(day?.policies[id], metrics), id).toEqual(metrics);
    }
    for (const [key, metrics] of Object.entries(s3.comparisons)) {
      expect(sameFields(day?.comparisons[key], metrics), key).toEqual(metrics);
    }
  });
});
