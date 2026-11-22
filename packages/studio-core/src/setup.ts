import { findPolicyPreset } from '@gateflow/queue-core';
import type { Policy } from '@gateflow/queue-core';
import {
  DEFAULT_BOOTSTRAP,
  applyScenarioSettings,
  arrivalClassification,
  buildResults,
  recommendedComparisons,
} from '@gateflow/sim-metrics';
import type { ExperimentConfig, ExperimentResult, ResultsDocument } from '@gateflow/sim-metrics';
import type { Scenario } from '@gateflow/sim-scenarios';
import { scenarioHash } from './files';

/** Name of the Studio in the manifest of its results (`generator.name`). */
export const STUDIO_NAME = 'gateflow-studio';

/** The CLI's default policies, and those of the S8 reports for a checkpoint with staff on call. */
export function defaultPolicyIds(scenario: Scenario): string[] {
  return scenario.checkpoint.laneStaffing === undefined
    ? ['fifo', 'fifo-manual', 'virtual-fifo', 'priority-v3']
    : [
        'fifo',
        'fifo-manual',
        'fifo-manual@reactive',
        'fifo-manual@predict',
        'priority-v3',
        'priority-v3@predict',
      ];
}

export interface RunSettings {
  readonly scenario: Scenario;
  /** Preset ids, possibly with a lane mode (`fifo-manual@reactive`). */
  readonly policyIds: readonly string[];
  /** Status quo; the first policy when absent. */
  readonly baselineId?: string;
  /** Simulated days: seeds `firstSeed` to `firstSeed + days - 1`. */
  readonly days: number;
  readonly firstSeed?: number;
  readonly resamples?: number;
}

/** Thrown when the settings of a run cannot make an experiment. */
export class RunSettingsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RunSettingsError';
  }
}

/**
 * The experiment the CLI runs for the same scenario, policies, baseline and seeds: the policies
 * configured by the checkpoint's settings, the recommended comparisons, the classification of the
 * first priority policy and the default bootstrap.
 */
export function experimentConfig(settings: RunSettings): ExperimentConfig {
  const { scenario, policyIds, days } = settings;
  if (policyIds.length === 0) throw new RunSettingsError('choose at least one policy');
  if (new Set(policyIds).size !== policyIds.length) {
    throw new RunSettingsError('each policy can be chosen once');
  }
  if (!Number.isSafeInteger(days) || days < 1 || days > 10_000) {
    throw new RunSettingsError('the number of days must be a whole number from 1 to 10,000');
  }
  const firstSeed = settings.firstSeed ?? 1;
  const presets = policyIds.map((id): Policy => {
    const policy = findPolicyPreset(id);
    if (policy === undefined) throw new RunSettingsError(`unknown policy ${id}`);
    return policy;
  });
  let policies: Policy[];
  try {
    policies = applyScenarioSettings(presets, scenario);
  } catch (error) {
    throw new RunSettingsError(
      `the settings of the scenario make a policy invalid: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  const baselinePolicyId = settings.baselineId ?? policies[0]?.id ?? '';
  if (!policies.some((p) => p.id === baselinePolicyId)) {
    throw new RunSettingsError(`the status quo ${baselinePolicyId} must be one of the policies`);
  }
  return {
    scenario,
    seeds: Array.from({ length: days }, (_, i) => firstSeed + i),
    policies,
    baselinePolicyId,
    comparisons: recommendedComparisons(policies, baselinePolicyId),
    classification: arrivalClassification(policies),
    bootstrap: {
      ...DEFAULT_BOOTSTRAP,
      resamples: settings.resamples ?? DEFAULT_BOOTSTRAP.resamples,
    },
  };
}

/** The results document of a run, as the CLI writes it but naming the Studio as its generator. */
export function studioResults(
  experiment: ExperimentResult,
  build: { readonly version: string; readonly commit: string },
): ResultsDocument {
  return buildResults(experiment, {
    generator: { name: STUDIO_NAME, version: build.version },
    commit: build.commit,
    scenarioHash: scenarioHash(experiment.config.scenario),
  });
}
