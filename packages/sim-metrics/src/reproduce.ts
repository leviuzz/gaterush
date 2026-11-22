import type { ClassificationParams } from '@gateflow/priority-engine';
import { QueueError, validatePolicy } from '@gateflow/queue-core';
import type { Policy } from '@gateflow/queue-core';
import { canonicalJson } from '@gateflow/sim-scenarios';
import type { Scenario } from '@gateflow/sim-scenarios';
import { ExperimentConfigError } from './experiment';
import type { BootstrapSettings, ExperimentConfig, PolicyComparison } from './experiment';
import { formatSeedRanges } from './results';
import { arrivalClassification } from './setup';

/*
 * Results reproduced from their manifest (S19). A manifest says everything its experiment was:
 * the scenario (by the hash of its canonical JSON), the seeds, the policies whole, the status quo,
 * the comparisons, the classification on arrival and the bootstrap. The same scenario and the same
 * manifest give the same results wherever they are computed (the CLI, the Studio, the API): only
 * the generator and the source revision tell them apart, and the fingerprint leaves both out.
 */

const MAX_SEED = 0xffffffff;

/** Parses seeds as a manifest writes them (`1-200`, `1-10,42`): sorted and unique. */
export function parseSeedRanges(ranges: string, maxCount = 100_000): number[] {
  const seeds = new Set<number>();
  const seed = (text: string): number => {
    if (!/^\d+$/.test(text)) throw new ExperimentConfigError(`invalid seed "${text}"`);
    const value = Number(text);
    if (value > MAX_SEED) throw new ExperimentConfigError(`seed ${text} exceeds 2^32 - 1`);
    return value;
  };
  for (const part of ranges.split(',')) {
    const item = part.trim();
    const range = /^(\d+)-(\d+)$/.exec(item);
    const [from, to] =
      range === null ? [seed(item), seed(item)] : [seed(range[1] ?? ''), seed(range[2] ?? '')];
    if (to < from) throw new ExperimentConfigError(`invalid seed range "${item}"`);
    if (to - from + 1 > maxCount) throw new ExperimentConfigError(`at most ${maxCount} seeds`);
    for (let s = from; s <= to; s++) seeds.add(s);
    if (seeds.size > maxCount) throw new ExperimentConfigError(`at most ${maxCount} seeds`);
  }
  return [...seeds].sort((a, b) => a - b);
}

/** What a results manifest says of its experiment (the other fields describe it). */
export interface ExperimentManifest {
  readonly scenario: { readonly hash: string };
  readonly seeds: { readonly ranges: string; readonly count?: number };
  readonly baselinePolicyId: string;
  readonly policies: readonly Policy[];
  readonly comparisons: readonly PolicyComparison[];
  readonly classification: ClassificationParams;
  readonly statistics: {
    readonly bootstrapResamples: number;
    readonly confidenceLevel: number;
    readonly bootstrapSeed: number;
  };
}

/** Limits of an experiment made from a manifest. */
export interface ManifestLimits {
  readonly maxDays?: number;
  readonly maxPolicies?: number;
  readonly maxResamples?: number;
}

/**
 * The experiment of a manifest, on its scenario (found by the manifest's hash: the caller checks
 * it). Checked as GateFlow's tools make experiments: valid policies, the classification of their
 * first priority policy, comparisons among them, seeds written as results write them. Throws
 * {@link ExperimentConfigError} otherwise.
 */
export function experimentFromManifest(
  manifest: ExperimentManifest,
  scenario: Scenario,
  limits: ManifestLimits = {},
): ExperimentConfig {
  const maxDays = limits.maxDays ?? 100_000;
  const maxPolicies = limits.maxPolicies ?? 100;
  const maxResamples = limits.maxResamples ?? 100_000;
  const seeds = parseSeedRanges(manifest.seeds.ranges, maxDays);
  if (seeds.length === 0) throw new ExperimentConfigError('at least one seed is required');
  if (formatSeedRanges(seeds) !== manifest.seeds.ranges) {
    throw new ExperimentConfigError(
      `seeds.ranges must be written as results write them: ${formatSeedRanges(seeds)}`,
    );
  }
  if (manifest.seeds.count !== undefined && manifest.seeds.count !== seeds.length) {
    throw new ExperimentConfigError(
      `seeds.count says ${manifest.seeds.count} days, its ranges give ${seeds.length}`,
    );
  }
  const policies = manifest.policies;
  if (policies.length === 0) throw new ExperimentConfigError('at least one policy is required');
  if (policies.length > maxPolicies) {
    throw new ExperimentConfigError(`at most ${maxPolicies} policies`);
  }
  for (const policy of policies) {
    try {
      validatePolicy(policy);
    } catch (error) {
      if (error instanceof QueueError) throw new ExperimentConfigError(error.message);
      throw error;
    }
  }
  // The tools classify on arrival with the first priority policy's parameters: a manifest that
  // says otherwise was not made by them.
  let classification: ClassificationParams;
  try {
    classification = arrivalClassification(policies);
  } catch (error) {
    throw new ExperimentConfigError(error instanceof Error ? error.message : String(error));
  }
  if (canonicalJson(classification) !== canonicalJson(manifest.classification)) {
    throw new ExperimentConfigError(
      'the classification on arrival is not that of the first priority policy',
    );
  }
  const { bootstrapResamples, confidenceLevel, bootstrapSeed } = manifest.statistics;
  if (!Number.isSafeInteger(bootstrapResamples) || bootstrapResamples < 1) {
    throw new ExperimentConfigError('statistics.bootstrapResamples must be a positive integer');
  }
  if (bootstrapResamples > maxResamples) {
    throw new ExperimentConfigError(`at most ${maxResamples} bootstrap resamples`);
  }
  if (!(confidenceLevel > 0 && confidenceLevel < 1)) {
    throw new ExperimentConfigError('statistics.confidenceLevel must be between 0 and 1');
  }
  if (!Number.isSafeInteger(bootstrapSeed) || bootstrapSeed < 0 || bootstrapSeed > MAX_SEED) {
    throw new ExperimentConfigError('statistics.bootstrapSeed must be an integer seed');
  }
  const bootstrap: BootstrapSettings = {
    resamples: bootstrapResamples,
    confidence: confidenceLevel,
    seed: bootstrapSeed,
  };
  return {
    scenario,
    seeds,
    policies,
    baselinePolicyId: manifest.baselinePolicyId,
    comparisons: manifest.comparisons,
    classification: manifest.classification,
    bootstrap,
  };
}

/**
 * What the fingerprint of results covers (S19): the results document read from its file, as
 * canonical JSON, without `manifest.generator` and `manifest.commit`. The same experiment gives
 * the same material whichever tool computed it, and whatever the formatting of the file; its
 * SHA-256 is the fingerprint.
 */
export function fingerprintMaterial(resultsText: string): string {
  let doc: unknown;
  try {
    doc = JSON.parse(resultsText);
  } catch {
    throw new ExperimentConfigError('the results are not JSON');
  }
  if (typeof doc !== 'object' || doc === null || Array.isArray(doc)) {
    throw new ExperimentConfigError('the results are not a results document');
  }
  const { manifest, ...rest } = doc as Record<string, unknown>;
  if (typeof manifest !== 'object' || manifest === null || Array.isArray(manifest)) {
    throw new ExperimentConfigError('the results have no manifest');
  }
  const kept = Object.fromEntries(
    Object.entries(manifest).filter(([key]) => key !== 'generator' && key !== 'commit'),
  );
  return canonicalJson({ ...rest, manifest: kept });
}
