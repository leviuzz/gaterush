import { MS_PER_HOUR, MS_PER_MINUTE } from '@gateflow/domain';
import type { Population, RunResult } from '@gateflow/sim-model';
import { mean, quantileSorted, sortedAscending } from './stats';

/**
 * Metrics of one policy on one simulated day (one seed). Passenger counts are people: a party of
 * three that misses its flight counts as three missed passengers.
 */
export interface PolicyDayMetrics {
  readonly passengers: number;
  readonly missed: number;
  readonly missedDeparting: number;
  readonly missedTransfer: number;
  readonly missedPer1000: number;
  /** Time from arrival at the checkpoint to the start of screening. */
  readonly waitMeanMin: number;
  readonly waitP50Min: number;
  readonly waitP90Min: number;
  readonly waitP99Min: number;
  readonly waitMaxMin: number;
  /** Time spent standing in a queue (the whole wait in a physical queue). */
  readonly standingMeanMin: number;
  readonly standingP90Min: number;
  readonly standingMaxMin: number;
  /** Passengers whose tickets were committed through a priority call. */
  readonly prioritized: number;
  /** People who entered the lanes through the fast track. */
  readonly fastTrackPeople: number;
  /** People waiting at the lanes who were passed by a fast-tracked party (once per pass). */
  readonly lanePassedPeople: number;
  readonly priorityCallShare: number;
  readonly capReachedCalls: number;
  readonly overtakeGuardCalls: number;
  /** Passengers overtaken at least once. */
  readonly passengersOvertaken: number;
  readonly maxOvertakes: number;
  /** Calls made (second calls excluded). */
  readonly calls: number;
  readonly recalls: number;
  /** Share of calls followed by a second call (the passenger had not presented after T1). */
  readonly recallShare: number;
  readonly noShows: number;
  /** Share of calls not answered in time (missed-call rate). */
  readonly noShowShare: number;
  readonly reactivations: number;
  /** Tickets issued again because the previous one expired. */
  readonly reissuedTickets: number;
  readonly staffedLaneHours: number;
  /** Busy share of the staffed lane time. */
  readonly laneUtilization: number;
  /** Lane-minutes open and idle while passengers were waiting for or answering a call. */
  readonly idleLaneWithDemandMin: number;
  readonly idleLaneWithDemandShare: number;
  /** Mean and largest number of tickets waiting for their call. */
  readonly meanQueueLength: number;
  readonly maxQueueLength: number;
  /** Mean and largest number of people standing in a queue. */
  readonly meanStandingQueue: number;
  readonly maxStandingQueue: number;
  readonly urgentOnArrival: number;
  readonly criticalOnArrival: number;
  /** Parties (tickets or assisted parties) and groups of two or more people. */
  readonly parties: number;
  readonly groups: number;
  readonly peopleInGroups: number;
  /** Groups whose ticket was committed through a priority call. */
  readonly groupsPrioritized: number;
  /** People who took the assisted path, their mean time to screening and their misses. */
  readonly assistedPeople: number;
  readonly assistedWaitMeanMin: number;
  readonly assistedMissed: number;
  /** People who arrived late on purpose (ground truth), how many were prioritised or missed. */
  readonly strategicPeople: number;
  readonly strategicPrioritized: number;
  readonly strategicMissed: number;
}

/** Paired comparison of a candidate policy with a reference policy on the same simulated day. */
export interface ComparisonDayMetrics {
  /** Missed under the reference, made it under the candidate. */
  readonly saved: number;
  /** Made it under the reference, missed under the candidate. */
  readonly harmed: number;
  /** saved - harmed (equals reference misses minus candidate misses). */
  readonly net: number;
  /** Passengers classified URGENT on arrival in the reference run. */
  readonly atRiskCohort: number;
  readonly atRiskReachedReference: number;
  readonly atRiskReachedCandidate: number;
  /** Passengers never prioritised by the candidate. */
  readonly nonPrioritized: number;
  readonly nonPriorityExtraWaitMeanMin: number;
  readonly nonPriorityExtraWaitP90Min: number;
  readonly nonPriorityExtraWaitMaxMin: number;
  readonly nonPriorityDelayedOver5MinShare: number;
  readonly waitMeanDeltaMin: number;
  readonly standingMeanDeltaMin: number;
}

function toMinutes(ms: number): number {
  return ms / MS_PER_MINUTE;
}

function share(part: number, whole: number): number {
  return whole === 0 ? 0 : part / whole;
}

/** Mean, P90 and maximum of a list of durations, in minutes (zeros for an empty list). */
function durationSummary(values: readonly number[]): { mean: number; p90: number; max: number } {
  const n = values.length;
  if (n === 0) return { mean: 0, p90: 0, max: 0 };
  const sorted = sortedAscending(values);
  return {
    mean: toMinutes(mean(values)),
    p90: toMinutes(quantileSorted(sorted, 0.9)),
    max: toMinutes(sorted[n - 1] ?? 0),
  };
}

/** Pushes `value` `times` times (per-person statistics of a party). */
function pushTimes(list: number[], value: number, times: number): void {
  for (let i = 0; i < times; i++) list.push(value);
}

export function policyDayMetrics(population: Population, run: RunResult): PolicyDayMetrics {
  const waits: number[] = [];
  const standing: number[] = [];
  let people = 0;
  let missed = 0;
  let missedDeparting = 0;
  let missedTransfer = 0;
  let prioritized = 0;
  let passengersOvertaken = 0;
  let maxOvertakes = 0;
  let urgentOnArrival = 0;
  let criticalOnArrival = 0;
  let groups = 0;
  let peopleInGroups = 0;
  let groupsPrioritized = 0;
  let assistedPeople = 0;
  let assistedWaitSum = 0;
  let assistedMissed = 0;
  let strategicPeople = 0;
  let strategicPrioritized = 0;
  let strategicMissed = 0;
  run.outcomes.forEach((outcome, i) => {
    const passenger = population.passengers[i];
    if (passenger === undefined) throw new RangeError('outcomes do not match the population');
    const n = passenger.partySize;
    people += n;
    pushTimes(waits, outcome.waitMs, n);
    pushTimes(standing, outcome.standingMs, n);
    if (outcome.missed) {
      missed += n;
      if (passenger.segment === 'TRANSFER') missedTransfer += n;
      else missedDeparting += n;
    }
    if (outcome.priorityCall) prioritized += n;
    if (outcome.overtakenCount > 0) passengersOvertaken += n;
    maxOvertakes = Math.max(maxOvertakes, outcome.overtakenCount);
    if (outcome.classAtArrival === 'URGENT') urgentOnArrival += n;
    if (outcome.classAtArrival === 'CRITICAL') criticalOnArrival += n;
    if (n > 1) {
      groups++;
      peopleInGroups += n;
      if (outcome.priorityCall) groupsPrioritized++;
    }
    if (passenger.path === 'ASSISTED') {
      assistedPeople += n;
      assistedWaitSum += n * outcome.waitMs;
      if (outcome.missed) assistedMissed += n;
    }
    if (passenger.strategic) {
      strategicPeople += n;
      if (outcome.priorityCall) strategicPrioritized += n;
      if (outcome.missed) strategicMissed += n;
    }
  });
  const sorted = sortedAscending(waits);
  const standingSummary = durationSummary(standing);
  const { stats } = run;
  const horizon = stats.lastServiceEndMs - stats.firstArrivalMs;
  return {
    passengers: people,
    missed,
    missedDeparting,
    missedTransfer,
    missedPer1000: people === 0 ? 0 : (1000 * missed) / people,
    waitMeanMin: toMinutes(mean(waits)),
    waitP50Min: people === 0 ? 0 : toMinutes(quantileSorted(sorted, 0.5)),
    waitP90Min: people === 0 ? 0 : toMinutes(quantileSorted(sorted, 0.9)),
    waitP99Min: people === 0 ? 0 : toMinutes(quantileSorted(sorted, 0.99)),
    waitMaxMin: people === 0 ? 0 : toMinutes(sorted[people - 1] ?? 0),
    standingMeanMin: standingSummary.mean,
    standingP90Min: standingSummary.p90,
    standingMaxMin: standingSummary.max,
    prioritized,
    fastTrackPeople: stats.fastTrackPeople,
    lanePassedPeople: stats.lanePassedPeople,
    priorityCallShare: share(stats.priorityCalls, stats.calls),
    capReachedCalls: stats.capReachedCalls,
    overtakeGuardCalls: stats.overtakeGuardCalls,
    passengersOvertaken,
    maxOvertakes,
    calls: stats.calls,
    recalls: stats.recalls,
    recallShare: share(stats.recalls, stats.calls),
    noShows: stats.noShows,
    noShowShare: share(stats.noShows, stats.calls),
    reactivations: stats.reactivations,
    reissuedTickets: stats.reissuedTickets,
    staffedLaneHours: stats.staffedLaneMs / MS_PER_HOUR,
    laneUtilization: share(stats.busyMs, stats.staffedLaneMs),
    idleLaneWithDemandMin: toMinutes(stats.idleLaneWithDemandMs),
    idleLaneWithDemandShare: share(stats.idleLaneWithDemandMs, stats.staffedLaneMs),
    meanQueueLength: horizon <= 0 ? 0 : stats.waitingAreaMs / horizon,
    maxQueueLength: stats.maxWaiting,
    meanStandingQueue: horizon <= 0 ? 0 : stats.standingAreaMs / horizon,
    maxStandingQueue: stats.maxStanding,
    urgentOnArrival,
    criticalOnArrival,
    parties: run.outcomes.length,
    groups,
    peopleInGroups,
    groupsPrioritized,
    assistedPeople,
    assistedWaitMeanMin: assistedPeople === 0 ? 0 : toMinutes(assistedWaitSum / assistedPeople),
    assistedMissed,
    strategicPeople,
    strategicPrioritized,
    strategicMissed,
  };
}

/** Paired comparison of two runs on the same population, counted in people. */
export function comparisonDayMetrics(
  population: Population,
  reference: RunResult,
  candidate: RunResult,
): ComparisonDayMetrics {
  const parties = population.passengers.length;
  if (reference.outcomes.length !== parties || candidate.outcomes.length !== parties) {
    throw new RangeError('paired runs must cover the same passengers');
  }
  let saved = 0;
  let harmed = 0;
  let atRiskCohort = 0;
  let atRiskReachedReference = 0;
  let atRiskReachedCandidate = 0;
  let people = 0;
  let deltaSum = 0;
  let standingDeltaSum = 0;
  const extraWaits: number[] = [];
  let delayedOver5 = 0;
  reference.outcomes.forEach((r, i) => {
    const c = candidate.outcomes[i];
    const passenger = population.passengers[i];
    if (c === undefined || passenger === undefined) {
      throw new RangeError('paired runs must cover the same passengers');
    }
    const n = passenger.partySize;
    people += n;
    if (r.missed && !c.missed) saved += n;
    if (!r.missed && c.missed) harmed += n;
    if (r.classAtArrival === 'URGENT') {
      atRiskCohort += n;
      if (!r.missed) atRiskReachedReference += n;
      if (!c.missed) atRiskReachedCandidate += n;
    }
    deltaSum += n * (c.waitMs - r.waitMs);
    standingDeltaSum += n * (c.standingMs - r.standingMs);
    if (!c.priorityCall) {
      const extra = c.waitMs - r.waitMs;
      pushTimes(extraWaits, extra, n);
      if (extra > 5 * MS_PER_MINUTE) delayedOver5 += n;
    }
  });
  const extra = durationSummary(extraWaits);
  return {
    saved,
    harmed,
    net: saved - harmed,
    atRiskCohort,
    atRiskReachedReference,
    atRiskReachedCandidate,
    nonPrioritized: extraWaits.length,
    nonPriorityExtraWaitMeanMin: extra.mean,
    nonPriorityExtraWaitP90Min: extra.p90,
    nonPriorityExtraWaitMaxMin: extra.max,
    nonPriorityDelayedOver5MinShare: share(delayedOver5, extraWaits.length),
    waitMeanDeltaMin: people === 0 ? 0 : toMinutes(deltaSum / people),
    standingMeanDeltaMin: people === 0 ? 0 : toMinutes(standingDeltaSum / people),
  };
}
