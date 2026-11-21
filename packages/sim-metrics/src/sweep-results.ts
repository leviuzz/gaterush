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
import type { ComparisonDayMetrics, PolicyDayMetrics } from './day-metrics';
import { comparisonKey } from './experiment';
import type { PolicyComparison } from './experiment';
import { DISCLAIMER, MODEL_LIMITATIONS, formatSeedRanges, roundNumbers } from './results';
import type { ComparisonMetricSummary } from './results';
import { acrossDays, bootstrapMeanInterval } from './stats';
import type { AcrossDays } from './stats';
import { applySetting } from './sweep';
import type {
  SweepConfig,
  SweepDimension,
  SweepParameter,
  SweepResult,
  SweepSetting,
  SweepValue,
} from './sweep';
import { scenarioProvenance } from './provenance';
import type { ScenarioProvenance } from './provenance';

export const SWEEP_SCHEMA = 'gateflow.sim.sweep/3';

/** Policy metrics reported at every point of a sweep. */
export const SWEEP_POLICY_METRICS = [
  'missed',
  'missedPer1000',
  'prioritized',
  'waitMeanMin',
  'waitP90Min',
  'standingMeanMin',
  'maxOvertakes',
  'classReversals',
  'misinformedPriorityPeople',
  'staffedLaneHours',
  'extraLaneHours',
] as const satisfies readonly (keyof PolicyDayMetrics)[];
export type SweepPolicyMetric = (typeof SWEEP_POLICY_METRICS)[number];

/** Comparison metrics reported with a bootstrap interval at every point. */
export const SWEEP_COMPARISON_METRICS = [
  'net',
  'saved',
  'harmed',
  'nonPriorityExtraWaitMeanMin',
  'nonPriorityDelayedOver5MinShare',
  'waitMeanDeltaMin',
  'extraLaneHoursDelta',
] as const satisfies readonly (keyof ComparisonDayMetrics)[];
export type SweepComparisonMetric = (typeof SWEEP_COMPARISON_METRICS)[number];

export interface SweepComparisonSummary {
  readonly metrics: Readonly<Record<SweepComparisonMetric, ComparisonMetricSummary>>;
  /** Largest extra wait of any non-prioritised passenger, across days (no interval). */
  readonly nonPriorityExtraWaitMaxMin: AcrossDays;
  readonly shareDaysNetPositive: number;
  readonly shareDaysNetNegative: number;
}

export interface SweepPointSummary {
  readonly value: SweepValue;
  readonly label: string;
  /** True for the value the base configuration has (on this curve). */
  readonly isBase: boolean;
  readonly policies: Readonly<Record<string, Readonly<Record<SweepPolicyMetric, AcrossDays>>>>;
  readonly comparisons: Readonly<Record<string, SweepComparisonSummary>>;
}

export interface SweepDimensionSummary {
  readonly id: string;
  readonly title: string;
  readonly parameter: SweepParameter;
  readonly base: readonly SweepSetting[];
  readonly points: readonly SweepPointSummary[];
}

export interface SweepManifestInput {
  readonly generator: { readonly name: string; readonly version: string };
  readonly commit: string;
  /** Hash of the canonical base scenario. */
  readonly scenarioHash: string;
  /** Hash of the canonical sweep specification. */
  readonly sweepHash: string;
  /** Path of the specification file, for the reproduce command. */
  readonly specPath: string;
}

export interface SweepDocument {
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
    readonly sweep: {
      readonly id: string;
      readonly title: string;
      readonly description: string;
      readonly hash: string;
    };
    readonly scenario: {
      readonly id: string;
      readonly title: string;
      readonly hash: string;
      readonly dataClassification: string;
      readonly timeZone: string;
    } & ScenarioProvenance;
    readonly seeds: { readonly count: number; readonly ranges: string };
    readonly baselinePolicyId: string;
    readonly candidateId: string;
    readonly policies: readonly Policy[];
    readonly comparisons: readonly PolicyComparison[];
    readonly classification: ClassificationParams;
    readonly statistics: {
      readonly bootstrapResamples: number;
      readonly confidenceLevel: number;
      readonly bootstrapSeed: number;
      readonly quantileMethod: string;
    };
    readonly simulatedDays: number;
    readonly reproduce: string;
  };
  readonly assumptions: readonly Assumption[];
  readonly modelLimitations: readonly string[];
  readonly dimensions: readonly SweepDimensionSummary[];
}

/** The value a parameter has in a variant (to mark the base point of each curve). */
function currentValue(
  config: SweepConfig,
  scenario: SweepConfig['scenario'],
  policies: readonly Policy[],
  parameter: SweepParameter,
): SweepValue | undefined {
  const candidate = policies.find((p) => p.id === config.candidateId);
  const selection = candidate?.selection.kind === 'constrained-edf' ? candidate.selection : null;
  const virtual = policies.find((p) => p.queue.kind === 'virtual');
  const minutes = (ms: number) => ms / 60_000;
  switch (parameter) {
    case 'maxOvertakes':
      return selection?.maxOvertakes;
    case 'capMaxPriorityCalls':
      return selection?.capMaxPriorityCalls;
    case 'capWindowCalls':
      return selection?.capWindowCalls;
    case 'hysteresisMinutes':
      return selection === null ? undefined : minutes(selection.hysteresisMs);
    case 'maxDeadlineAgeMinutes':
      if (selection === null) return undefined;
      return selection.maxDeadlineAgeMs === null ? null : minutes(selection.maxDeadlineAgeMs);
    case 'prepareWindowSize':
    case 'callAheadSeconds':
    case 'responseEstimateSeconds':
      return virtual?.queue.kind === 'virtual' ? virtual.queue[parameter] : undefined;
    case 'lanesDelta':
    case 'showUpShiftMinutes':
      return 0;
    case 'loadFactorScale':
      return 1;
    case 'serviceTimeMeanSeconds':
      return scenario.checkpoint.serviceTimeMeanSeconds.value;
    case 'callResponseMedianSeconds':
      return scenario.passengers.callResponse.value.medianSeconds;
    case 'absentProbability':
      return scenario.passengers.callResponse.value.absentProbability;
    case 'flightDelayShare':
      return scenario.disruptions.flightDelays.value.share;
    case 'laneOutagesPerDay':
      return scenario.disruptions.laneOutages.value.perDay;
    case 'feedOutagesPerDay':
      return scenario.disruptions.feedOutages.value.perDay;
    case 'feedOutageMedianMinutes':
      return scenario.disruptions.feedOutages.value.medianMinutes;
    case 'laneTargetWaitMinutes':
      return candidate?.lanes?.kind === 'predict'
        ? minutes(candidate.lanes.targetWaitMs)
        : undefined;
    case 'maxExtraLanes':
      return scenario.checkpoint.laneStaffing?.value.maxExtraLanes;
    case 'laneOpenDelayMinutes':
      return scenario.checkpoint.laneStaffing?.value.openDelayMinutes.median;
    case 'laneFollowShare':
      return scenario.checkpoint.laneStaffing?.value.followShare;
  }
}

/** Label of a value on a curve: "none" for no maximum, a signed number for offsets. */
export function sweepValueLabel(parameter: SweepParameter, value: SweepValue): string {
  if (value === null) return 'none';
  if ((parameter === 'lanesDelta' || parameter === 'showUpShiftMinutes') && value > 0) {
    return `+${value}`;
  }
  return String(value);
}

function summariseDimension(
  sweep: SweepResult,
  dimension: SweepDimension,
  offset: number,
): SweepDimensionSummary {
  const { config } = sweep;
  let start = { scenario: config.scenario, policies: config.policies };
  for (const setting of dimension.base ?? [])
    start = applySetting(start, setting, config.candidateId);
  const baseValue = currentValue(config, start.scenario, start.policies, dimension.parameter);
  const points = dimension.values.map((value, i): SweepPointSummary => {
    const days = sweep.days[offset + i] ?? [];
    const label = sweepValueLabel(dimension.parameter, value);
    const policies: Record<string, Record<SweepPolicyMetric, AcrossDays>> = {};
    for (const policy of config.policies) {
      const metrics = {} as Record<SweepPolicyMetric, AcrossDays>;
      for (const metric of SWEEP_POLICY_METRICS) {
        metrics[metric] = acrossDays(
          days.map((d) => {
            const m = d.policies[policy.id];
            if (m === undefined) throw new RangeError(`missing metrics for ${policy.id}`);
            return m[metric];
          }),
        );
      }
      policies[policy.id] = metrics;
    }
    const comparisons: Record<string, SweepComparisonSummary> = {};
    for (const comparison of config.comparisons) {
      const key = comparisonKey(comparison);
      const rows = days.map((d) => {
        const c = d.comparisons[key];
        if (c === undefined) throw new RangeError(`missing comparison ${key}`);
        return c;
      });
      const metrics = {} as Record<SweepComparisonMetric, ComparisonMetricSummary>;
      for (const metric of SWEEP_COMPARISON_METRICS) {
        const values = rows.map((r) => r[metric]);
        const interval = bootstrapMeanInterval(values, {
          ...config.bootstrap,
          key: `${dimension.id}=${label}:${key}:${metric}`,
        });
        metrics[metric] = {
          ...acrossDays(values),
          ciLower: interval.lower,
          ciUpper: interval.upper,
        };
      }
      comparisons[key] = {
        metrics,
        nonPriorityExtraWaitMaxMin: acrossDays(rows.map((r) => r.nonPriorityExtraWaitMaxMin)),
        shareDaysNetPositive: rows.filter((r) => r.net > 0).length / rows.length,
        shareDaysNetNegative: rows.filter((r) => r.net < 0).length / rows.length,
      };
    }
    return { value, label, isBase: value === baseValue, policies, comparisons };
  });
  return {
    id: dimension.id,
    title: dimension.title,
    parameter: dimension.parameter,
    base: dimension.base ?? [],
    points,
  };
}

export function buildSweepResults(sweep: SweepResult, input: SweepManifestInput): SweepDocument {
  const { config, plan } = sweep;
  const dimensions: SweepDimensionSummary[] = [];
  let offset = 0;
  for (const dimension of config.dimensions) {
    dimensions.push(summariseDimension(sweep, dimension, offset));
    offset += dimension.values.length;
  }
  const ranges = formatSeedRanges(plan.seeds);
  return {
    schema: SWEEP_SCHEMA,
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
      sweep: {
        id: config.id,
        title: config.title,
        description: config.description,
        hash: input.sweepHash,
      },
      scenario: {
        id: config.scenario.id,
        title: config.scenario.title,
        hash: input.scenarioHash,
        dataClassification: config.scenario.dataClassification,
        timeZone: config.scenario.timeZone,
        ...scenarioProvenance(config.scenario),
      },
      seeds: { count: plan.seeds.length, ranges },
      baselinePolicyId: config.baselinePolicyId,
      candidateId: config.candidateId,
      policies: config.policies,
      comparisons: config.comparisons,
      classification: config.classification,
      statistics: {
        bootstrapResamples: config.bootstrap.resamples,
        confidenceLevel: config.bootstrap.confidence,
        bootstrapSeed: config.bootstrap.seed,
        quantileMethod: 'linear interpolation between order statistics (Hyndman-Fan type 7)',
      },
      // Distinct simulated days (scenario variants x seeds); points with the same days share them.
      simulatedDays: plan.variants.length * plan.seeds.length,
      reproduce:
        `gateflow-sim sweep --spec ${input.specPath} --seeds ${ranges} ` +
        `--bootstrap-resamples ${config.bootstrap.resamples}`,
    },
    assumptions: collectAssumptions(config.scenario),
    modelLimitations: MODEL_LIMITATIONS,
    dimensions: roundNumbers(dimensions),
  };
}

/** Serialises a sweep document deterministically (2-space indentation, trailing newline). */
export function stringifySweep(document: SweepDocument): string {
  return `${JSON.stringify(document, null, 2)}\n`;
}
