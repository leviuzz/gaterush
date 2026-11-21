import { readFileSync } from 'node:fs';
import {
  FIFO_POLICY,
  PRIORITY_V0_POLICY,
  VIRTUAL_FIFO_POLICY,
  classificationOf,
} from '@gateflow/queue-core';
import { parseScenarioText } from '@gateflow/sim-scenarios';
import { describe, expect, it } from 'vitest';
import { roundNumbers, runExperiment } from '../src';
import { withoutS3Features } from './legacy';

/**
 * Acceptance criterion of slice S3: with the presentation rule disabled (priority-v0), and without
 * groups, assisted passengers or strategic arrivals, outcomes equal S2 (with the engine fix of
 * 0.2.1). The fixture holds the per-seed results of that commit (see its `description`).
 */
interface S2Fixture {
  readonly sourceCommit: string;
  readonly seeds: readonly {
    readonly seed: number;
    readonly passengers: number;
    readonly policies: Readonly<Record<string, Readonly<Record<string, number>>>>;
    readonly comparisons: Readonly<Record<string, Readonly<Record<string, number>>>>;
  }[];
}

const fixture = JSON.parse(
  readFileSync(new URL('./fixtures/s2-demo-seeds-1-3.json', import.meta.url), 'utf8'),
) as S2Fixture;

const demo = withoutS3Features(
  parseScenarioText(
    readFileSync(
      new URL('../../../scenarios/single-checkpoint-demo.yaml', import.meta.url),
      'utf8',
    ),
  ),
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

describe('regression: without the S3 features, slice S3 reproduces slice S2', () => {
  const result = runExperiment({
    scenario: demo,
    seeds: fixture.seeds.map((s) => s.seed),
    policies: [FIFO_POLICY, VIRTUAL_FIFO_POLICY, PRIORITY_V0_POLICY],
    baselinePolicyId: FIFO_POLICY.id,
    comparisons: [
      { candidateId: 'virtual-fifo', referenceId: 'fifo' },
      { candidateId: 'priority-v0', referenceId: 'fifo' },
      { candidateId: 'priority-v0', referenceId: 'virtual-fifo' },
    ],
    classification: classificationOf(PRIORITY_V0_POLICY)!,
    bootstrap: { resamples: 10, confidence: 0.95, seed: 1 },
  });

  it.each(fixture.seeds.map((s) => [s.seed, s] as const))('seed %i', (seed, s2) => {
    const day = result.perSeed.find((d) => d.seed === seed);
    expect(day?.passengers).toBe(s2.passengers);
    for (const [id, metrics] of Object.entries(s2.policies)) {
      expect(sameFields(day?.policies[id], metrics), id).toEqual(metrics);
    }
    for (const [key, metrics] of Object.entries(s2.comparisons)) {
      expect(sameFields(day?.comparisons[key], metrics), key).toEqual(metrics);
    }
  });
});
