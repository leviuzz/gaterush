import { MS_PER_MINUTE } from '@gateflow/domain';
import type { ClassificationParams, ConstrainedEdfSelection } from '@gateflow/priority-engine';
import type { CheckpointProfile } from '@gateflow/forecast';
import type { Policy } from '@gateflow/queue-core';
import type { ArrivalForecast, RunResult } from '@gateflow/sim-model';
import { canonicalJson, parseScenario } from '@gateflow/sim-scenarios';
import type { Scenario } from '@gateflow/sim-scenarios';
import { comparisonDayMetrics, policyDayMetrics } from './day-metrics';
import type { ComparisonDayMetrics, PolicyDayMetrics } from './day-metrics';
import {
  ExperimentConfigError,
  comparisonKey,
  dayPopulation,
  laneInputsFor,
  normaliseSeeds,
} from './experiment';
import type { BootstrapSettings, PolicyComparison } from './experiment';
import { simulatePolicy } from './lane-advice';

/**
 * Parameters a sensitivity sweep can vary. Policy parameters change the candidate policy (the
 * prepare window, the call-ahead and the response estimate change every virtual queue, so that
 * comparisons on the same queue stay valid); scenario parameters change the simulated days.
 */
export const SWEEP_PARAMETERS = [
  'maxOvertakes',
  'capMaxPriorityCalls',
  'capWindowCalls',
  'hysteresisMinutes',
  'maxDeadlineAgeMinutes',
  'prepareWindowSize',
  'callAheadSeconds',
  'responseEstimateSeconds',
  'lanesDelta',
  'serviceTimeMeanSeconds',
  'loadFactorScale',
  'showUpShiftMinutes',
  'callResponseMedianSeconds',
  'absentProbability',
  'flightDelayShare',
  'laneOutagesPerDay',
  'feedOutagesPerDay',
  'feedOutageMedianMinutes',
  // S8: GateFlow's target wait for extra lanes (candidate), and the staff on call (scenario).
  'laneTargetWaitMinutes',
  'maxExtraLanes',
  'laneOpenDelayMinutes',
  'laneFollowShare',
] as const;
export type SweepParameter = (typeof SWEEP_PARAMETERS)[number];

/** A sweep value: a number, or `null` for "none" (only for the maximum data age). */
export type SweepValue = number | null;

export interface SweepSetting {
  readonly parameter: SweepParameter;
  readonly value: SweepValue;
}

/** One curve of the sweep: a parameter varied over values, the rest at the base. */
export interface SweepDimension {
  readonly id: string;
  readonly title: string;
  readonly parameter: SweepParameter;
  readonly values: readonly SweepValue[];
  /** Settings applied before the values, e.g. a less reliable feed for this curve only. */
  readonly base?: readonly SweepSetting[];
}

export interface SweepConfig {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly scenario: Scenario;
  readonly seeds: readonly number[];
  /** Policies of every point, as at the base; the candidate's parameters vary. */
  readonly policies: readonly Policy[];
  readonly baselinePolicyId: string;
  readonly candidateId: string;
  readonly comparisons: readonly PolicyComparison[];
  /** Classification of the on-arrival risk class, the same at every point (cohorts). */
  readonly classification: ClassificationParams;
  readonly bootstrap: BootstrapSettings;
  readonly dimensions: readonly SweepDimension[];
}

/** Thrown when a sweep is misconfigured or a value cannot be applied. */
export class SweepConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SweepConfigError';
  }
}

interface Variant {
  readonly scenario: Scenario;
  readonly policies: readonly Policy[];
}

function requireNumber(parameter: SweepParameter, value: SweepValue): number {
  if (value === null || !Number.isFinite(value)) {
    throw new SweepConfigError(`${parameter} needs a number, got ${String(value)}`);
  }
  return value;
}

function requireInteger(parameter: SweepParameter, value: SweepValue, min: number): number {
  const n = requireNumber(parameter, value);
  if (!Number.isInteger(n) || n < min) {
    throw new SweepConfigError(`${parameter} must be an integer >= ${min}, got ${n}`);
  }
  return n;
}

function minutes(parameter: SweepParameter, value: SweepValue): number {
  const n = requireNumber(parameter, value);
  if (n < 0) throw new SweepConfigError(`${parameter} must not be negative, got ${n}`);
  return Math.round(n * MS_PER_MINUTE);
}

function withSelection(
  policies: readonly Policy[],
  candidateId: string,
  change: (selection: ConstrainedEdfSelection) => ConstrainedEdfSelection,
): Policy[] {
  return policies.map((policy) => {
    if (policy.id !== candidateId) return policy;
    if (policy.selection.kind !== 'constrained-edf') {
      throw new SweepConfigError(
        `candidate ${candidateId} is not a priority (constrained EDF) policy`,
      );
    }
    return { ...policy, selection: change(policy.selection) };
  });
}

/** The scenario with `change` applied to a deep copy, validated again by the schema. */
function withScenario(scenario: Scenario, change: (copy: Scenario) => void): Scenario {
  // A deep copy through JSON: scenarios are plain data (no structuredClone in pure packages).
  const copy = JSON.parse(JSON.stringify(scenario)) as Scenario;
  change(copy);
  try {
    return parseScenario(copy);
  } catch (error) {
    throw new SweepConfigError(
      `the varied scenario is invalid: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/** Applies one setting to a variant (pure: returns new objects, validated). */
export function applySetting(
  variant: Variant,
  setting: SweepSetting,
  candidateId: string,
): Variant {
  const { scenario, policies } = variant;
  const { parameter, value } = setting;
  const policy = (change: (s: ConstrainedEdfSelection) => ConstrainedEdfSelection): Variant => ({
    scenario,
    policies: withSelection(policies, candidateId, change),
  });
  const days = (change: (copy: Scenario) => void): Variant => ({
    scenario: withScenario(scenario, change),
    policies,
  });
  switch (parameter) {
    case 'maxOvertakes':
      return policy((s) => ({ ...s, maxOvertakes: requireInteger(parameter, value, 0) }));
    case 'capMaxPriorityCalls':
      return policy((s) => {
        const k = requireInteger(parameter, value, 0);
        if (k > s.capWindowCalls) {
          throw new SweepConfigError(
            `capMaxPriorityCalls ${k} exceeds capWindowCalls ${s.capWindowCalls}`,
          );
        }
        return { ...s, capMaxPriorityCalls: k };
      });
    case 'capWindowCalls':
      return policy((s) => {
        const n = requireInteger(parameter, value, 1);
        if (s.capMaxPriorityCalls > n) {
          throw new SweepConfigError(
            `capWindowCalls ${n} is below capMaxPriorityCalls ${s.capMaxPriorityCalls}`,
          );
        }
        return { ...s, capWindowCalls: n };
      });
    case 'hysteresisMinutes':
      return policy((s) => ({ ...s, hysteresisMs: minutes(parameter, value) }));
    case 'maxDeadlineAgeMinutes':
      return policy((s) => ({
        ...s,
        maxDeadlineAgeMs: value === null ? null : minutes(parameter, value),
      }));
    case 'prepareWindowSize':
    case 'callAheadSeconds':
    case 'responseEstimateSeconds': {
      const n = requireInteger(parameter, value, 0);
      return {
        scenario,
        policies: policies.map((p) =>
          p.queue.kind === 'virtual' ? { ...p, queue: { ...p.queue, [parameter]: n } } : p,
        ),
      };
    }
    case 'lanesDelta': {
      const delta = requireInteger(parameter, value, -64);
      return days((copy) => {
        copy.checkpoint.laneSchedule.value = copy.checkpoint.laneSchedule.value.map((entry) => ({
          ...entry,
          lanes: Math.max(1, entry.lanes + delta),
        }));
        // Added lanes are hypothetical lanes the checkpoint would have.
        const available = copy.checkpoint.lanesAvailable;
        if (available !== undefined && delta > 0) {
          copy.checkpoint.lanesAvailable = { ...available, value: available.value + delta };
        }
      });
    }
    case 'serviceTimeMeanSeconds': {
      const seconds = requireNumber(parameter, value);
      if (seconds <= 0) {
        throw new SweepConfigError(`serviceTimeMeanSeconds must be positive, got ${seconds}`);
      }
      return days((copy) => {
        copy.checkpoint.serviceTimeMeanSeconds = {
          ...copy.checkpoint.serviceTimeMeanSeconds,
          value: seconds,
        };
      });
    }
    case 'loadFactorScale': {
      const factor = requireNumber(parameter, value);
      if (factor <= 0)
        throw new SweepConfigError(`loadFactorScale must be positive, got ${factor}`);
      return days((copy) => {
        const lf = copy.passengers.loadFactor.value;
        copy.passengers.loadFactor.value = {
          min: Math.min(1, lf.min * factor),
          mode: Math.min(1, lf.mode * factor),
          max: Math.min(1, lf.max * factor),
        };
      });
    }
    case 'showUpShiftMinutes': {
      const shift = requireNumber(parameter, value);
      return days((copy) => {
        for (const segment of ['departing', 'transfer'] as const) {
          const curve = copy.passengers.showUp[segment].value;
          const median = curve.medianExtraMinutes + shift;
          if (median <= 0) {
            throw new SweepConfigError(
              `showUpShiftMinutes ${shift} leaves no extra time for ${segment} passengers`,
            );
          }
          copy.passengers.showUp[segment].value = { ...curve, medianExtraMinutes: median };
        }
      });
    }
    case 'callResponseMedianSeconds':
      return days((copy) => {
        copy.passengers.callResponse.value = {
          ...copy.passengers.callResponse.value,
          medianSeconds: requireNumber(parameter, value),
        };
      });
    case 'absentProbability':
      return days((copy) => {
        copy.passengers.callResponse.value = {
          ...copy.passengers.callResponse.value,
          absentProbability: requireNumber(parameter, value),
        };
      });
    case 'flightDelayShare':
      return days((copy) => {
        copy.disruptions.flightDelays.value = {
          ...copy.disruptions.flightDelays.value,
          share: requireNumber(parameter, value),
        };
      });
    case 'laneOutagesPerDay':
      return days((copy) => {
        copy.disruptions.laneOutages.value = {
          ...copy.disruptions.laneOutages.value,
          perDay: requireNumber(parameter, value),
        };
      });
    case 'feedOutagesPerDay':
      return days((copy) => {
        copy.disruptions.feedOutages.value = {
          ...copy.disruptions.feedOutages.value,
          perDay: requireNumber(parameter, value),
        };
      });
    case 'feedOutageMedianMinutes':
      return days((copy) => {
        copy.disruptions.feedOutages.value = {
          ...copy.disruptions.feedOutages.value,
          medianMinutes: requireNumber(parameter, value),
        };
      });
    case 'laneTargetWaitMinutes': {
      const target = minutes(parameter, value);
      return {
        scenario,
        policies: policies.map((p) => {
          if (p.id !== candidateId) return p;
          if (p.lanes?.kind !== 'predict') {
            throw new SweepConfigError(
              `candidate ${candidateId} does not recommend lanes from a forecast (@predict)`,
            );
          }
          if (target <= p.lanes.closeWhenWaitMs) {
            throw new SweepConfigError(
              `laneTargetWaitMinutes must exceed the wait below which a lane closes`,
            );
          }
          return { ...p, lanes: { ...p.lanes, targetWaitMs: target } };
        }),
      };
    }
    case 'maxExtraLanes':
    case 'laneOpenDelayMinutes':
    case 'laneFollowShare': {
      const n =
        parameter === 'maxExtraLanes'
          ? requireInteger(parameter, value, 0)
          : requireNumber(parameter, value);
      return days((copy) => {
        const staffing = copy.checkpoint.laneStaffing;
        if (staffing === undefined) {
          throw new SweepConfigError(`${parameter} needs checkpoint.laneStaffing in the scenario`);
        }
        const spec = staffing.value;
        staffing.value =
          parameter === 'maxExtraLanes'
            ? { ...spec, maxExtraLanes: n }
            : parameter === 'laneFollowShare'
              ? { ...spec, followShare: n }
              : { ...spec, openDelayMinutes: { ...spec.openDelayMinutes, median: n } };
      });
    }
  }
}

/** A point of the sweep: one value of one dimension. */
export interface SweepPoint {
  readonly dimensionId: string;
  readonly value: SweepValue;
  /** Group of points sharing the same simulated days (the same scenario). */
  readonly variant: number;
  /** Distinct policy set within that group; points with identical settings share it. */
  readonly run: number;
}

/** Points that share a scenario: their days are simulated together, policies run once each. */
export interface SweepVariant {
  readonly scenario: Scenario;
  readonly runs: readonly (readonly Policy[])[];
}

export interface SweepPlan {
  readonly seeds: readonly number[];
  readonly points: readonly SweepPoint[];
  readonly variants: readonly SweepVariant[];
}

/** Work of one simulated day of one variant (for a worker thread). */
export interface SweepDayJob {
  readonly scenario: Scenario;
  readonly runs: readonly (readonly Policy[])[];
  readonly comparisons: readonly PolicyComparison[];
  readonly classification: ClassificationParams;
  /** Arrival forecast of the variant's scenario, when a policy manages lanes from one (S8). */
  readonly forecast?: ArrivalForecast;
  /** What the forecasts know of the variant's scenario, for the console's `@advise` (S22.3). */
  readonly profile?: CheckpointProfile;
}

export interface SweepRunDay {
  readonly policies: Readonly<Record<string, PolicyDayMetrics>>;
  readonly comparisons: Readonly<Record<string, ComparisonDayMetrics>>;
}

export interface SweepDayResult {
  readonly seed: number;
  /** One entry per run of the job, in order. */
  readonly runs: readonly SweepRunDay[];
}

function validateSweep(config: SweepConfig): void {
  const ids = config.policies.map((p) => p.id);
  if (new Set(ids).size !== ids.length) throw new SweepConfigError('duplicate policy ids');
  for (const id of [config.baselinePolicyId, config.candidateId]) {
    if (!ids.includes(id)) throw new SweepConfigError(`policy ${id} is not among the policies`);
  }
  if (config.comparisons.length === 0) throw new SweepConfigError('at least one comparison');
  for (const c of config.comparisons) {
    for (const id of [c.candidateId, c.referenceId]) {
      if (!ids.includes(id)) {
        throw new SweepConfigError(`comparison ${comparisonKey(c)}: unknown policy ${id}`);
      }
    }
    if (c.candidateId === c.referenceId) {
      throw new SweepConfigError(`comparison ${comparisonKey(c)} compares a policy with itself`);
    }
  }
  if (config.dimensions.length === 0) throw new SweepConfigError('at least one dimension');
  const dimensionIds = new Set<string>();
  for (const d of config.dimensions) {
    if (dimensionIds.has(d.id)) throw new SweepConfigError(`duplicate dimension ${d.id}`);
    dimensionIds.add(d.id);
    if (d.values.length === 0) throw new SweepConfigError(`dimension ${d.id} has no values`);
    const keys = d.values.map((v) => String(v));
    if (new Set(keys).size !== keys.length) {
      throw new SweepConfigError(`dimension ${d.id} repeats a value`);
    }
    for (const v of d.values) {
      if (v === null && d.parameter !== 'maxDeadlineAgeMinutes') {
        throw new SweepConfigError(`dimension ${d.id}: only maxDeadlineAgeMinutes accepts "none"`);
      }
    }
  }
}

/**
 * Expands a sweep into points, and groups the points by simulated days: points with the same
 * scenario share a population per seed, and identical policy sets are simulated once.
 */
export function planSweep(config: SweepConfig): SweepPlan {
  validateSweep(config);
  const seeds = normaliseSeeds(config.seeds);
  if (seeds.length === 0) throw new SweepConfigError('at least one seed is required');
  const variants: {
    key: string;
    scenario: Scenario;
    runs: (readonly Policy[])[];
    runKeys: string[];
  }[] = [];
  const points: SweepPoint[] = [];
  const base: Variant = { scenario: config.scenario, policies: config.policies };
  for (const dimension of config.dimensions) {
    let start = base;
    for (const setting of dimension.base ?? [])
      start = applySetting(start, setting, config.candidateId);
    for (const value of dimension.values) {
      const v = applySetting(start, { parameter: dimension.parameter, value }, config.candidateId);
      const scenarioKey = canonicalJson(v.scenario);
      let variant = variants.findIndex((g) => g.key === scenarioKey);
      if (variant < 0) {
        variants.push({ key: scenarioKey, scenario: v.scenario, runs: [], runKeys: [] });
        variant = variants.length - 1;
      }
      const group = variants[variant];
      if (group === undefined) throw new SweepConfigError('internal: missing variant');
      const runKey = canonicalJson(v.policies);
      let run = group.runKeys.indexOf(runKey);
      if (run < 0) {
        group.runs.push(v.policies);
        group.runKeys.push(runKey);
        run = group.runs.length - 1;
      }
      points.push({ dimensionId: dimension.id, value, variant, run });
    }
  }
  return {
    seeds,
    points,
    variants: variants.map(({ scenario, runs }) => ({ scenario, runs })),
  };
}

/** The job of one variant, for {@link runSweepDay} (with its forecast when a policy needs one). */
export function sweepDayJob(config: SweepConfig, variant: SweepVariant): SweepDayJob {
  return {
    scenario: variant.scenario,
    runs: variant.runs,
    comparisons: config.comparisons,
    classification: config.classification,
    ...laneInputsFor(variant.scenario, variant.runs.flat()),
  };
}

/**
 * Simulates one day of one variant: every policy set of the job on the same passengers. A policy
 * that appears in several sets (e.g. the baselines) is simulated once. Pure and deterministic.
 */
export function runSweepDay(job: SweepDayJob, seed: number): SweepDayResult {
  const population = dayPopulation(job.scenario, job.forecast, seed);
  const cache = new Map<string, { run: RunResult; metrics: PolicyDayMetrics }>();
  const simulated = (policy: Policy) => {
    const key = canonicalJson(policy);
    let entry = cache.get(key);
    if (entry === undefined) {
      const run = simulatePolicy(
        population,
        policy,
        { classification: job.classification },
        job.profile,
      );
      entry = { run, metrics: policyDayMetrics(population, run) };
      cache.set(key, entry);
    }
    return entry;
  };
  const runs = job.runs.map((policies): SweepRunDay => {
    const byId = new Map(policies.map((p) => [p.id, simulated(p)]));
    const comparisons: Record<string, ComparisonDayMetrics> = {};
    for (const c of job.comparisons) {
      const reference = byId.get(c.referenceId);
      const candidate = byId.get(c.candidateId);
      if (reference === undefined || candidate === undefined) {
        throw new ExperimentConfigError(`missing run for ${comparisonKey(c)}`);
      }
      comparisons[comparisonKey(c)] = comparisonDayMetrics(
        population,
        reference.run,
        candidate.run,
      );
    }
    const metrics: Record<string, PolicyDayMetrics> = {};
    for (const [id, entry] of byId) metrics[id] = entry.metrics;
    return { policies: metrics, comparisons };
  });
  return { seed, runs };
}

/** The days of every point, in seed order. */
export interface SweepResult {
  readonly config: SweepConfig;
  readonly plan: SweepPlan;
  /** Per point (in plan order), the days of its run in seed order. */
  readonly days: readonly (readonly SweepRunDay[])[];
}

/**
 * Assembles a sweep from the days of every variant (`results[variant]`, in any order of seeds).
 * Each planned (variant, seed) must be present exactly once.
 */
export function assembleSweep(
  config: SweepConfig,
  plan: SweepPlan,
  results: readonly (readonly SweepDayResult[])[],
): SweepResult {
  if (results.length !== plan.variants.length) {
    throw new SweepConfigError(`expected ${plan.variants.length} variants, got ${results.length}`);
  }
  const ordered = results.map((variantDays, v) => {
    const bySeed = new Map<number, SweepDayResult>();
    for (const day of variantDays) {
      if (bySeed.has(day.seed)) throw new SweepConfigError(`variant ${v}: seed ${day.seed} twice`);
      bySeed.set(day.seed, day);
    }
    if (bySeed.size !== plan.seeds.length) {
      throw new SweepConfigError(`variant ${v}: expected ${plan.seeds.length} seeds`);
    }
    return plan.seeds.map((seed) => {
      const day = bySeed.get(seed);
      if (day === undefined) throw new SweepConfigError(`variant ${v}: seed ${seed} missing`);
      return day;
    });
  });
  const days = plan.points.map((point) =>
    (ordered[point.variant] ?? []).map((day) => {
      const run = day.runs[point.run];
      if (run === undefined) throw new SweepConfigError(`missing run ${point.run}`);
      return run;
    }),
  );
  return { config, plan, days };
}

/** Runs a whole sweep in this thread (tests and small sweeps). */
export function runSweep(config: SweepConfig): SweepResult {
  const plan = planSweep(config);
  const results = plan.variants.map((variant) => {
    const job = sweepDayJob(config, variant);
    return plan.seeds.map((seed) => runSweepDay(job, seed));
  });
  return assembleSweep(config, plan, results);
}
