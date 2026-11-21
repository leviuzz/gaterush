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

/** Everything that one simulated day needs: the experiment without its seeds and statistics. */
export interface DayJob {
  readonly scenario: Scenario;
  readonly policies: readonly Policy[];
  readonly comparisons: readonly PolicyComparison[];
  readonly classification: ClassificationParams;
}

/** A validated experiment: the work of one day and the seeds to run it on. */
export interface ExperimentPlan {
  readonly job: DayJob;
  readonly seeds: readonly number[];
}

/** Validates an experiment and splits it into independent days (for parallel execution). */
export function planExperiment(config: ExperimentConfig): ExperimentPlan {
  const comparisons = resolveComparisons(config);
  return {
    job: {
      scenario: config.scenario,
      policies: config.policies,
      comparisons,
      classification: config.classification,
    },
    seeds: normaliseSeeds(config.seeds),
  };
}

/**
 * Simulates one day: every policy on the same passengers (common random numbers), so that
 * comparisons are paired passenger by passenger. Pure and deterministic: the result depends on the
 * job and the seed only, wherever and in whatever order the days are computed.
 */
export function runDay(job: DayJob, seed: number): SeedResult {
  const population = generatePopulation(job.scenario, seed);
  const runs = new Map<string, RunResult>();
  const policies: Record<string, PolicyDayMetrics> = {};
  for (const policy of job.policies) {
    const run = simulateCheckpoint(population, policy, { classification: job.classification });
    runs.set(policy.id, run);
    policies[policy.id] = policyDayMetrics(population, run);
  }
  const pairs: Record<string, ComparisonDayMetrics> = {};
  for (const comparison of job.comparisons) {
    const reference = runs.get(comparison.referenceId);
    const candidate = runs.get(comparison.candidateId);
    if (reference === undefined || candidate === undefined) {
      throw new ExperimentConfigError(`missing run for ${comparisonKey(comparison)}`);
    }
    pairs[comparisonKey(comparison)] = comparisonDayMetrics(population, reference, candidate);
  }
  return {
    seed,
    passengers: population.passengers.length,
    flights: population.flights.length,
    disruptions: dayDisruptions(population),
    policies,
    comparisons: pairs,
  };
}

/**
 * Assembles an experiment from its days, computed in any order (e.g. by parallel workers). Every
 * planned seed must be present exactly once; days are ordered by seed, so the result is the same
 * as a sequential run.
 */
export function assembleExperiment(
  config: ExperimentConfig,
  days: readonly SeedResult[],
): ExperimentResult {
  const { job, seeds } = planExperiment(config);
  const bySeed = new Map<number, SeedResult>();
  for (const day of days) {
    if (bySeed.has(day.seed)) throw new ExperimentConfigError(`seed ${day.seed} computed twice`);
    bySeed.set(day.seed, day);
  }
  const perSeed = seeds.map((seed) => {
    const day = bySeed.get(seed);
    if (day === undefined) throw new ExperimentConfigError(`seed ${seed} was not computed`);
    return day;
  });
  if (bySeed.size !== seeds.length) {
    throw new ExperimentConfigError('days were computed for seeds that are not in the experiment');
  }
  return { config, seeds, comparisons: job.comparisons, perSeed };
}

/** Runs every policy on every seed, one day after the other. */
export function runExperiment(
  config: ExperimentConfig,
  onSeedDone?: (done: number, total: number) => void,
): ExperimentResult {
  const { job, seeds } = planExperiment(config);
  const days = seeds.map((seed, i) => {
    const day = runDay(job, seed);
    onSeedDone?.(i + 1, seeds.length);
    return day;
  });
  return assembleExperiment(config, days);
}
