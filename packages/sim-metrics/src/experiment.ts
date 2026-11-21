import type { ClassificationParams, Policy } from '@gateflow/priority-engine';
import { simulateCheckpoint } from '@gateflow/sim-model';
import type { RunResult } from '@gateflow/sim-model';
import { generatePopulation } from '@gateflow/sim-scenarios';
import type { Scenario } from '@gateflow/sim-scenarios';
import { comparisonDayMetrics, policyDayMetrics } from './day-metrics';
import type { ComparisonDayMetrics, PolicyDayMetrics } from './day-metrics';

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

export interface ExperimentConfig {
  readonly scenario: Scenario;
  /** Replication seeds (one simulated day each). Normalised to ascending unique order. */
  readonly seeds: readonly number[];
  /** Policies to compare. Must include the baseline. */
  readonly policies: readonly Policy[];
  readonly baselinePolicyId: string;
  /** Classification used for the on-arrival risk class (same for every policy). */
  readonly classification: ClassificationParams;
  readonly bootstrap: BootstrapSettings;
}

export interface SeedResult {
  readonly seed: number;
  readonly passengers: number;
  readonly flights: number;
  readonly policies: Readonly<Record<string, PolicyDayMetrics>>;
  /** Comparisons of each non-baseline policy with the baseline. */
  readonly comparisons: Readonly<Record<string, ComparisonDayMetrics>>;
}

export interface ExperimentResult {
  readonly config: ExperimentConfig;
  /** Normalised seeds actually simulated. */
  readonly seeds: readonly number[];
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

function validateConfig(config: ExperimentConfig): void {
  const ids = config.policies.map((p) => p.id);
  if (new Set(ids).size !== ids.length) throw new ExperimentConfigError('duplicate policy ids');
  if (!ids.includes(config.baselinePolicyId)) {
    throw new ExperimentConfigError(
      `baseline policy ${config.baselinePolicyId} is not among the policies`,
    );
  }
  if (config.seeds.length === 0) throw new ExperimentConfigError('at least one seed is required');
}

/**
 * Runs every policy on every seed. All policies see exactly the same passengers on a given seed
 * (common random numbers), so comparisons are paired passenger by passenger.
 */
export function runExperiment(
  config: ExperimentConfig,
  onSeedDone?: (done: number, total: number) => void,
): ExperimentResult {
  validateConfig(config);
  const seeds = normaliseSeeds(config.seeds);
  const perSeed: SeedResult[] = [];
  seeds.forEach((seed, i) => {
    const population = generatePopulation(config.scenario, seed);
    const runs = new Map<string, RunResult>();
    for (const policy of config.policies) {
      runs.set(
        policy.id,
        simulateCheckpoint(population, policy, { classification: config.classification }),
      );
    }
    const baseline = runs.get(config.baselinePolicyId);
    if (baseline === undefined) throw new ExperimentConfigError('baseline run missing');
    const policies: Record<string, PolicyDayMetrics> = {};
    const comparisons: Record<string, ComparisonDayMetrics> = {};
    for (const policy of config.policies) {
      const run = runs.get(policy.id);
      if (run === undefined) continue;
      policies[policy.id] = policyDayMetrics(population, run);
      if (policy.id !== config.baselinePolicyId) {
        comparisons[policy.id] = comparisonDayMetrics(baseline, run);
      }
    }
    perSeed.push({
      seed,
      passengers: population.passengers.length,
      flights: population.flights.length,
      policies,
      comparisons,
    });
    onSeedDone?.(i + 1, seeds.length);
  });
  return { config, seeds, perSeed };
}
