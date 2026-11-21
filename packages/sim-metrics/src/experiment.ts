import type { ClassificationParams } from '@gateflow/priority-engine';
import type { Policy } from '@gateflow/queue-core';
import { simulateCheckpoint } from '@gateflow/sim-model';
import type { RunResult } from '@gateflow/sim-model';
import { generatePopulation } from '@gateflow/sim-scenarios';
import type { Scenario } from '@gateflow/sim-scenarios';
import { comparisonDayMetrics, dayDisruptions, policyDayMetrics } from './day-metrics';
import type { ComparisonDayMetrics, DayDisruptions, PolicyDayMetrics } from './day-metrics';

export interface BootstrapSettings {
  readonly resamples: number;
  readonly confidence: number;
  readonly seed: number;
}

export const DEFAULT_BOOTSTRAP: BootstrapSettings = {
  resamples: 2000,
  confidence: 0.95,
  seed: 20261121,
};

/** A paired comparison: what changes when `candidateId` replaces `referenceId`. */
export interface PolicyComparison {
  readonly candidateId: string;
  readonly referenceId: string;
}

/** Key of a comparison in results, e.g. `priority-v0 vs virtual-fifo`. */
export function comparisonKey(comparison: PolicyComparison): string {
  return `${comparison.candidateId} vs ${comparison.referenceId}`;
}

export interface ExperimentConfig {
  readonly scenario: Scenario;
  /** Replication seeds (one simulated day each). Normalised to ascending unique order. */
  readonly seeds: readonly number[];
  /** Policies to simulate. Must include the baseline. */
  readonly policies: readonly Policy[];
  /** The status quo, listed first in reports. */
  readonly baselinePolicyId: string;
  /** Paired comparisons to report. Default: every other policy against the baseline. */
  readonly comparisons?: readonly PolicyComparison[];
  /** Classification used for the on-arrival risk class (same for every policy). */
  readonly classification: ClassificationParams;
  readonly bootstrap: BootstrapSettings;
}

export interface SeedResult {
  readonly seed: number;
  readonly passengers: number;
  readonly flights: number;
  /** Disruptions of the day (S5), the same for every policy. */
  readonly disruptions: DayDisruptions;
  readonly policies: Readonly<Record<string, PolicyDayMetrics>>;
  /** Paired comparisons, keyed by {@link comparisonKey}. */
  readonly comparisons: Readonly<Record<string, ComparisonDayMetrics>>;
}

export interface ExperimentResult {
  readonly config: ExperimentConfig;
  /** Normalised seeds actually simulated. */
  readonly seeds: readonly number[];
  /** Comparisons actually reported (the default ones when the config gives none). */
  readonly comparisons: readonly PolicyComparison[];
  readonly perSeed: readonly SeedResult[];
}

/** Thrown when an experiment is misconfigured. */
export class ExperimentConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ExperimentConfigError';
  }
}

export function normaliseSeeds(seeds: readonly number[]): number[] {
  for (const seed of seeds) {
    if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) {
      throw new ExperimentConfigError(`seeds must be integers in [0, 2^32 - 1], got ${seed}`);
    }
  }
  return [...new Set(seeds)].sort((a, b) => a - b);
}

/** Every policy other than the baseline, compared with the baseline. */
export function defaultComparisons(
  policies: readonly Policy[],
  baselinePolicyId: string,
): PolicyComparison[] {
  return policies
    .filter((p) => p.id !== baselinePolicyId)
    .map((p) => ({ candidateId: p.id, referenceId: baselinePolicyId }));
}

function resolveComparisons(config: ExperimentConfig): PolicyComparison[] {
  const ids = config.policies.map((p) => p.id);
  if (new Set(ids).size !== ids.length) throw new ExperimentConfigError('duplicate policy ids');
  if (!ids.includes(config.baselinePolicyId)) {
    throw new ExperimentConfigError(
      `baseline policy ${config.baselinePolicyId} is not among the policies`,
    );
  }
  if (config.seeds.length === 0) throw new ExperimentConfigError('at least one seed is required');
  const comparisons =
    config.comparisons ?? defaultComparisons(config.policies, config.baselinePolicyId);
  const keys = new Set<string>();
  for (const comparison of comparisons) {
    for (const id of [comparison.candidateId, comparison.referenceId]) {
      if (!ids.includes(id)) {
        throw new ExperimentConfigError(
          `comparison ${comparisonKey(comparison)}: unknown policy ${id}`,
        );
      }
    }
    if (comparison.candidateId === comparison.referenceId) {
      throw new ExperimentConfigError(
        `comparison ${comparisonKey(comparison)} compares a policy with itself`,
      );
    }
    const key = comparisonKey(comparison);
    if (keys.has(key)) throw new ExperimentConfigError(`duplicate comparison ${key}`);
    keys.add(key);
  }
  return comparisons.map(({ candidateId, referenceId }) => ({ candidateId, referenceId }));
}

/**
 * Runs every policy on every seed. All policies see exactly the same passengers on a given seed
 * (common random numbers), so comparisons are paired passenger by passenger.
 */
export function runExperiment(
  config: ExperimentConfig,
  onSeedDone?: (done: number, total: number) => void,
): ExperimentResult {
  const comparisons = resolveComparisons(config);
  const seeds = normaliseSeeds(config.seeds);
  const perSeed: SeedResult[] = [];
  seeds.forEach((seed, i) => {
    const population = generatePopulation(config.scenario, seed);
    const runs = new Map<string, RunResult>();
    const policies: Record<string, PolicyDayMetrics> = {};
    for (const policy of config.policies) {
      const run = simulateCheckpoint(population, policy, { classification: config.classification });
      runs.set(policy.id, run);
      policies[policy.id] = policyDayMetrics(population, run);
    }
    const pairs: Record<string, ComparisonDayMetrics> = {};
    for (const comparison of comparisons) {
      const reference = runs.get(comparison.referenceId);
      const candidate = runs.get(comparison.candidateId);
      if (reference === undefined || candidate === undefined) {
        throw new ExperimentConfigError(`missing run for ${comparisonKey(comparison)}`);
      }
      pairs[comparisonKey(comparison)] = comparisonDayMetrics(population, reference, candidate);
    }
    perSeed.push({
      seed,
      passengers: population.passengers.length,
      flights: population.flights.length,
      disruptions: dayDisruptions(population),
      policies,
      comparisons: pairs,
    });
    onSeedDone?.(i + 1, seeds.length);
  });
  return { config, seeds, comparisons, perSeed };
}
