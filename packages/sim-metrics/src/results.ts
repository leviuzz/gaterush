import { ENGINE_VERSION } from '@gateflow/priority-engine';
import type { ClassificationParams } from '@gateflow/priority-engine';
import { QUEUE_CORE_VERSION } from '@gateflow/queue-core';
import type { Policy } from '@gateflow/queue-core';
import { KERNEL_VERSION } from '@gateflow/sim-kernel';
import { MODEL_VERSION } from '@gateflow/sim-model';
import {
  GENERATOR_VERSION,
  SCENARIO_SCHEMA_VERSION,
  collectAssumptions,
} from '@gateflow/sim-scenarios';
import type { Assumption } from '@gateflow/sim-scenarios';
import type { ComparisonDayMetrics, DayDisruptions, PolicyDayMetrics } from './day-metrics';
import { comparisonKey } from './experiment';
import type { ExperimentResult, PolicyComparison, SeedResult } from './experiment';
import { acrossDays, bootstrapMeanInterval } from './stats';
import type { AcrossDays } from './stats';

export const RESULTS_SCHEMA = 'gateflow.sim.results/5';

export const DISCLAIMER =
  'SIMULATED RESULTS ON SYNTHETIC OR HYPOTHETICAL DATA. These numbers are model outputs, not ' +
  'measurements, and must not be presented as evidence of operational performance.';

/** Simplifications of the current model version, reported with every result. */
export const MODEL_LIMITATIONS: readonly string[] = [
  'Single checkpoint. Lanes follow a planned schedule, minus unplanned outages when the scenario has them: a lane going out of service finishes its passenger first, at least one lane always stays open, and the system knows at once. No lanes are opened in reaction to the queue.',
  'Every passenger uses the virtual queue when one is simulated: no opt-outs, no passengers without a phone or a view of the displays.',
  'Response times and absences are drawn per party from assumed distributions. A second call does not make an absent passenger come sooner, the prepare window does not shorten response times, and a passenger who has been at the access point once answers later calls at once.',
  'The access point never becomes a bottleneck, and the walk from the access point to the lanes is part of the response time.',
  'Fast track (priority v2): a fast-tracked party is called next and, once its ticket is validated, goes ahead of the people waiting at the lanes who still have room under K. The fast-track entry never becomes a bottleneck of its own and needs no staff in the model.',
  'CRITICAL passengers are flagged for staff, but staff escorts are not modelled: such passengers wait in the queue order.',
  "Before any disruption the system's deadline equals the ground truth (boarding close from a fixed rule). Delays and gate changes, when the scenario has them, are known only once the flight feed announces them, and messages sent while the feed is down arrive when it recovers. Delays only move boarding later; passengers still arrive for the scheduled departure. A gate change affects only passengers who finish screening after it.",
  "Staff of baseline A' learn of delays when the system does and keep using the last known times while the feed is down (no stale-data rule).",
  'Passengers never abandon the queue, even after their flight has closed.',
  'A group stays together: one ticket, one call, one lane, screened one person after the other. Assisted passengers always get the next free lane and are not assessed by the engine.',
  "Baseline A' (`fifo-manual`) is an idealised staff practice: every five minutes staff call the flights closing within 20 minutes, and every passenger of those flights comes forward at once. Real practice is less systematic, so A' may overstate today's handling where it is informal, or understate it where staff watch individual passengers.",
  'Strategic late arrivals are a fixed share in a stress-test scenario, not a behavioural response to the policy.',
  'Tickets are issued on arrival with no kiosk or scanning delay.',
  'The engine estimates screening time as the mean screening time per person, walking time as the nominal time of the gate zone, and the time from call to screening as the larger of the response estimate and the call-ahead time (through the fast track: the response estimate, or the time since the passenger was last at the access point when shorter).',
];

export interface ManifestInput {
  readonly generator: { readonly name: string; readonly version: string };
  /** Source revision used to produce the results (e.g. a git commit). */
  readonly commit: string;
  /** Hash of the canonical scenario (e.g. `sha256:...`). */
  readonly scenarioHash: string;
}

export interface ComparisonMetricSummary extends AcrossDays {
  /** Bootstrap confidence interval of the mean over days. */
  readonly ciLower: number;
  readonly ciUpper: number;
}

export interface ComparisonSummary {
  readonly candidateId: string;
  readonly referenceId: string;
  readonly metrics: Readonly<Record<keyof ComparisonDayMetrics, ComparisonMetricSummary>>;
  /** Share of simulated days on which the candidate saved more flights than it lost. */
  readonly shareDaysNetPositive: number;
  readonly shareDaysNetNegative: number;
  /** Pooled over days: at-risk passengers who reached the gate in time / at-risk passengers. */
  readonly atRiskReachedShareReference: number;
  readonly atRiskReachedShareCandidate: number;
}

export interface ResultsDocument {
  readonly schema: string;
  readonly disclaimer: string;
  readonly manifest: {
    readonly generator: { readonly name: string; readonly version: string };
    readonly commit: string;
    readonly versions: {
      readonly engine: string;
      readonly queueCore: string;
      readonly model: string;
      readonly kernel: string;
      readonly populationGenerator: string;
      readonly scenarioSchema: number;
    };
    readonly scenario: {
      readonly id: string;
      readonly title: string;
      readonly hash: string;
      readonly dataClassification: string;
      readonly timeZone: string;
    };
    readonly seeds: { readonly count: number; readonly ranges: string };
    readonly baselinePolicyId: string;
    readonly policies: readonly Policy[];
    readonly comparisons: readonly PolicyComparison[];
    readonly classification: ClassificationParams;
    readonly statistics: {
      readonly bootstrapResamples: number;
      readonly confidenceLevel: number;
      readonly bootstrapSeed: number;
      readonly quantileMethod: string;
    };
    readonly reproduce: string;
  };
  readonly assumptions: readonly Assumption[];
  readonly modelLimitations: readonly string[];
  readonly summary: {
    readonly days: number;
    readonly passengersPerDay: AcrossDays;
    /** Disruptions per day (S5), the same for every policy. */
    readonly disruptions: Readonly<Record<keyof DayDisruptions, AcrossDays>>;
    readonly policies: Readonly<
      Record<string, Readonly<Record<keyof PolicyDayMetrics, AcrossDays>>>
    >;
    readonly comparisons: Readonly<Record<string, ComparisonSummary>>;
  };
  readonly perSeed: readonly SeedResult[];
}

/** Compresses sorted seeds into ranges, e.g. [1, 2, 3, 7] -> "1-3,7". */
export function formatSeedRanges(seeds: readonly number[]): string {
  const parts: string[] = [];
  let start: number | undefined;
  let previous: number | undefined;
  const flush = () => {
    if (start === undefined || previous === undefined) return;
    parts.push(start === previous ? String(start) : `${start}-${previous}`);
  };
  for (const seed of seeds) {
    if (previous !== undefined && seed === previous + 1) {
      previous = seed;
      continue;
    }
    flush();
    start = seed;
    previous = seed;
  }
  flush();
  return parts.join(',');
}

const DECIMAL_SCALE = 10_000;

/** Rounds every non-integer number to 4 decimals (presentation only; integers are kept). */
export function roundNumbers<T>(value: T): T {
  if (typeof value === 'number') {
    if (Number.isInteger(value)) return value;
    const rounded = Math.round(value * DECIMAL_SCALE) / DECIMAL_SCALE;
    return (rounded === 0 ? 0 : rounded) as T;
  }
  if (Array.isArray(value)) return value.map((v: unknown) => roundNumbers(v)) as T;
  if (typeof value === 'object' && value !== null) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = roundNumbers(v);
    return out as T;
  }
  return value;
}

function summariseRecords<K extends string>(
  records: readonly Readonly<Record<K, number>>[],
): Record<K, AcrossDays> {
  const first = records[0];
  if (first === undefined) throw new RangeError('no records to summarise');
  const out = {} as Record<K, AcrossDays>;
  for (const key of Object.keys(first) as K[]) out[key] = acrossDays(records.map((r) => r[key]));
  return out;
}

export function buildResults(experiment: ExperimentResult, input: ManifestInput): ResultsDocument {
  const { config, perSeed, seeds } = experiment;
  const { scenario, bootstrap } = config;

  const policies: Record<string, Record<keyof PolicyDayMetrics, AcrossDays>> = {};
  for (const policy of config.policies) {
    policies[policy.id] = summariseRecords(
      perSeed.map((s) => {
        const metrics = s.policies[policy.id];
        if (metrics === undefined) throw new RangeError(`missing metrics for ${policy.id}`);
        return metrics;
      }),
    );
  }

  const comparisons: Record<string, ComparisonSummary> = {};
  for (const comparison of experiment.comparisons) {
    const key = comparisonKey(comparison);
    const rows = perSeed.map((s) => {
      const metrics = s.comparisons[key];
      if (metrics === undefined) throw new RangeError(`missing comparison ${key}`);
      return metrics;
    });
    const metrics = {} as Record<keyof ComparisonDayMetrics, ComparisonMetricSummary>;
    for (const metric of Object.keys(rows[0] ?? {}) as (keyof ComparisonDayMetrics)[]) {
      const values = rows.map((r) => r[metric]);
      const interval = bootstrapMeanInterval(values, { ...bootstrap, key: `${key}:${metric}` });
      metrics[metric] = { ...acrossDays(values), ciLower: interval.lower, ciUpper: interval.upper };
    }
    const cohort = rows.reduce((a, r) => a + r.atRiskCohort, 0);
    comparisons[key] = {
      candidateId: comparison.candidateId,
      referenceId: comparison.referenceId,
      metrics,
      shareDaysNetPositive: rows.filter((r) => r.net > 0).length / rows.length,
      shareDaysNetNegative: rows.filter((r) => r.net < 0).length / rows.length,
      atRiskReachedShareReference:
        cohort === 0 ? 0 : rows.reduce((a, r) => a + r.atRiskReachedReference, 0) / cohort,
      atRiskReachedShareCandidate:
        cohort === 0 ? 0 : rows.reduce((a, r) => a + r.atRiskReachedCandidate, 0) / cohort,
    };
  }

  const ranges = formatSeedRanges(seeds);
  const policyIds = config.policies.map((p) => p.id).join(',');
  const comparePairs = experiment.comparisons
    .map((c) => `${c.candidateId}:${c.referenceId}`)
    .join(',');
  return {
    schema: RESULTS_SCHEMA,
    disclaimer: DISCLAIMER,
    manifest: {
      generator: input.generator,
      commit: input.commit,
      versions: {
        engine: ENGINE_VERSION,
        queueCore: QUEUE_CORE_VERSION,
        model: MODEL_VERSION,
        kernel: KERNEL_VERSION,
        populationGenerator: GENERATOR_VERSION,
        scenarioSchema: SCENARIO_SCHEMA_VERSION,
      },
      scenario: {
        id: scenario.id,
        title: scenario.title,
        hash: input.scenarioHash,
        dataClassification: scenario.dataClassification,
        timeZone: scenario.timeZone,
      },
      seeds: { count: seeds.length, ranges },
      baselinePolicyId: config.baselinePolicyId,
      policies: config.policies,
      comparisons: experiment.comparisons,
      classification: config.classification,
      statistics: {
        bootstrapResamples: bootstrap.resamples,
        confidenceLevel: bootstrap.confidence,
        bootstrapSeed: bootstrap.seed,
        quantileMethod: 'linear interpolation between order statistics (Hyndman-Fan type 7)',
      },
      reproduce:
        `gateflow-sim run --scenario scenarios/${scenario.id}.yaml --seeds ${ranges} ` +
        `--policies ${policyIds} --baseline ${config.baselinePolicyId} ` +
        (comparePairs === '' ? '' : `--compare ${comparePairs} `) +
        `--bootstrap-resamples ${bootstrap.resamples}`,
    },
    assumptions: collectAssumptions(scenario),
    modelLimitations: MODEL_LIMITATIONS,
    summary: roundNumbers({
      days: perSeed.length,
      passengersPerDay: acrossDays(perSeed.map((s) => s.passengers)),
      disruptions: summariseRecords(perSeed.map((s) => s.disruptions)),
      policies,
      comparisons,
    }),
    perSeed: roundNumbers(perSeed),
  };
}

/** Serialises the results deterministically (2-space indentation, trailing newline). */
export function stringifyResults(document: ResultsDocument): string {
  return `${JSON.stringify(document, null, 2)}\n`;
}
