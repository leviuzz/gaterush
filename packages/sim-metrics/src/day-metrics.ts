import { MS_PER_MINUTE } from '@gateflow/domain';
import type { Population, RunResult } from '@gateflow/sim-model';
import { mean, quantileSorted, sortedAscending } from './stats';

/** Metrics of one policy on one simulated day (one seed). */
export interface PolicyDayMetrics {
  readonly passengers: number;
  readonly missed: number;
  readonly missedDeparting: number;
  readonly missedTransfer: number;
  readonly missedPer1000: number;
  readonly waitMeanMin: number;
  readonly waitP50Min: number;
  readonly waitP90Min: number;
  readonly waitP99Min: number;
  readonly waitMaxMin: number;
  /** Passengers called through a priority call. */
  readonly prioritized: number;
  readonly priorityCallShare: number;
  readonly capReachedCalls: number;
  readonly overtakeGuardCalls: number;
  /** Passengers overtaken at least once. */
  readonly passengersOvertaken: number;
  readonly maxOvertakes: number;
  readonly laneUtilization: number;
  readonly meanQueueLength: number;
  readonly maxQueueLength: number;
  readonly urgentOnArrival: number;
  readonly criticalOnArrival: number;
}

/** Paired comparison of a candidate policy with the baseline on the same simulated day. */
export interface ComparisonDayMetrics {
  /** Missed under the baseline, made it under the candidate. */
  readonly saved: number;
  /** Made it under the baseline, missed under the candidate. */
  readonly harmed: number;
  /** saved - harmed (equals baseline misses minus candidate misses). */
  readonly net: number;
  /** Passengers classified URGENT on arrival in the baseline run. */
  readonly atRiskCohort: number;
  readonly atRiskReachedBaseline: number;
  readonly atRiskReachedCandidate: number;
  /** Passengers never prioritised by the candidate. */
  readonly nonPrioritized: number;
  readonly nonPriorityExtraWaitMeanMin: number;
  readonly nonPriorityExtraWaitP90Min: number;
  readonly nonPriorityExtraWaitMaxMin: number;
  readonly nonPriorityDelayedOver5MinShare: number;
  readonly waitMeanDeltaMin: number;
}

function toMinutes(ms: number): number {
  return ms / MS_PER_MINUTE;
}

export function policyDayMetrics(population: Population, run: RunResult): PolicyDayMetrics {
  const n = population.passengers.length;
  const waits: number[] = [];
  let missed = 0;
  let missedDeparting = 0;
  let missedTransfer = 0;
  let prioritized = 0;
  let passengersOvertaken = 0;
  let maxOvertakes = 0;
  let urgentOnArrival = 0;
  let criticalOnArrival = 0;
  run.outcomes.forEach((outcome, i) => {
    const passenger = population.passengers[i];
    if (passenger === undefined) throw new RangeError('outcomes do not match the population');
    waits.push(outcome.waitMs);
    if (outcome.missed) {
      missed++;
      if (passenger.segment === 'TRANSFER') missedTransfer++;
      else missedDeparting++;
    }
    if (outcome.priorityCall) prioritized++;
    if (outcome.overtakenCount > 0) passengersOvertaken++;
    maxOvertakes = Math.max(maxOvertakes, outcome.overtakenCount);
    if (outcome.classAtArrival === 'URGENT') urgentOnArrival++;
    if (outcome.classAtArrival === 'CRITICAL') criticalOnArrival++;
  });
  const sorted = sortedAscending(waits);
  const horizon = run.stats.lastServiceEndMs - run.stats.firstArrivalMs;
  const lanes = population.checkpoint.lanes;
  return {
    passengers: n,
    missed,
    missedDeparting,
    missedTransfer,
    missedPer1000: n === 0 ? 0 : (1000 * missed) / n,
    waitMeanMin: toMinutes(mean(waits)),
    waitP50Min: n === 0 ? 0 : toMinutes(quantileSorted(sorted, 0.5)),
    waitP90Min: n === 0 ? 0 : toMinutes(quantileSorted(sorted, 0.9)),
    waitP99Min: n === 0 ? 0 : toMinutes(quantileSorted(sorted, 0.99)),
    waitMaxMin: n === 0 ? 0 : toMinutes(sorted[n - 1] ?? 0),
    prioritized,
    priorityCallShare: run.stats.calls === 0 ? 0 : run.stats.priorityCalls / run.stats.calls,
    capReachedCalls: run.stats.capReachedCalls,
    overtakeGuardCalls: run.stats.overtakeGuardCalls,
    passengersOvertaken,
    maxOvertakes,
    laneUtilization: horizon <= 0 ? 0 : run.stats.busyMs / (lanes * horizon),
    meanQueueLength: horizon <= 0 ? 0 : run.stats.waitingAreaMs / horizon,
    maxQueueLength: run.stats.maxWaiting,
    urgentOnArrival,
    criticalOnArrival,
  };
}

export function comparisonDayMetrics(
  baseline: RunResult,
  candidate: RunResult,
): ComparisonDayMetrics {
  if (baseline.outcomes.length !== candidate.outcomes.length) {
    throw new RangeError('paired runs must cover the same passengers');
  }
  let saved = 0;
  let harmed = 0;
  let atRiskCohort = 0;
  let atRiskReachedBaseline = 0;
  let atRiskReachedCandidate = 0;
  let deltaSum = 0;
  const extraWaits: number[] = [];
  let delayedOver5 = 0;
  baseline.outcomes.forEach((b, i) => {
    const c = candidate.outcomes[i];
    if (c === undefined) throw new RangeError('paired runs must cover the same passengers');
    if (b.missed && !c.missed) saved++;
    if (!b.missed && c.missed) harmed++;
    if (b.classAtArrival === 'URGENT') {
      atRiskCohort++;
      if (!b.missed) atRiskReachedBaseline++;
      if (!c.missed) atRiskReachedCandidate++;
    }
    deltaSum += c.waitMs - b.waitMs;
    if (!c.priorityCall) {
      const extra = c.waitMs - b.waitMs;
      extraWaits.push(extra);
      if (extra > 5 * MS_PER_MINUTE) delayedOver5++;
    }
  });
  const n = baseline.outcomes.length;
  const sorted = sortedAscending(extraWaits);
  const m = extraWaits.length;
  return {
    saved,
    harmed,
    net: saved - harmed,
    atRiskCohort,
    atRiskReachedBaseline,
    atRiskReachedCandidate,
    nonPrioritized: m,
    nonPriorityExtraWaitMeanMin: toMinutes(mean(extraWaits)),
    nonPriorityExtraWaitP90Min: m === 0 ? 0 : toMinutes(quantileSorted(sorted, 0.9)),
    nonPriorityExtraWaitMaxMin: m === 0 ? 0 : toMinutes(sorted[m - 1] ?? 0),
    nonPriorityDelayedOver5MinShare: m === 0 ? 0 : delayedOver5 / m,
    waitMeanDeltaMin: n === 0 ? 0 : toMinutes(deltaSum / n),
  };
}
