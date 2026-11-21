import { MS_PER_HOUR } from '@gateflow/domain';
import type { KnownDeadline, Millis, RiskClass } from '@gateflow/domain';
import type { ReasonCode } from './reasons';
import type { Assessment, CheckpointEstimates, ClassificationParams, WaitingTicket } from './types';
import {
  toFifoOrder,
  validateAheadOfWaiting,
  validateCheckpoint,
  validateNow,
  validateTicket,
} from './validate';

/**
 * Estimated wait until the call for a ticket with `ahead` people in front of it, if the queue is
 * served in FIFO order at the nominal throughput: floor(ahead * 1 h / throughput).
 */
export function fifoWaitEstimateMs(ahead: number, throughputPerHour: number): Millis {
  return Math.floor((ahead * MS_PER_HOUR) / throughputPerHour);
}

/** People travelling on a ticket (1 unless the ticket is a group ticket). */
export function partySizeOf(ticket: Pick<WaitingTicket, 'partySize'>): number {
  return ticket.partySize ?? 1;
}

/** True when the deadline may drive an automatic boost under `params`. */
export function isDeadlineTrusted(
  deadline: KnownDeadline,
  params: Pick<ClassificationParams, 'allowRuleBasedDeadline'>,
): boolean {
  if (deadline.atMs === null) return false;
  if (deadline.source === 'FEED') return true;
  return deadline.source === 'RULE' && params.allowRuleBasedDeadline;
}

/**
 * The stale-data rule: true when the policy has a maximum data age and the deadline was last
 * confirmed by its source longer ago than that (a value without an observation time is live).
 */
export function isDeadlineStale(
  deadline: KnownDeadline,
  params: Pick<ClassificationParams, 'maxDeadlineAgeMs'>,
  nowMs: Millis,
): boolean {
  const maxAge = params.maxDeadlineAgeMs;
  const observedAt = deadline.observedAtMs;
  return maxAge !== null && observedAt !== undefined && nowMs - observedAt > maxAge;
}

/** Urgency order of the verified classes, used by the hysteresis. */
const URGENCY: Readonly<Record<RiskClass, number>> = {
  UNVERIFIED: -1,
  NORMAL: 0,
  ATTENTION: 1,
  URGENT: 2,
  CRITICAL: 3,
};

/**
 * The class given by the two margins, with hysteresis: a threshold that the ticket has already
 * crossed towards urgency (its previous class is at least as urgent) is moved by h, so that the
 * ticket goes back only once the margin exceeds the threshold by h.
 * - CRITICAL: feasibility margin < 0 (+ h if it was CRITICAL);
 * - URGENT: FIFO margin < 0 (+ h if it was URGENT or CRITICAL);
 * - ATTENTION: FIFO margin < attention threshold (+ h if it was ATTENTION or more urgent);
 * - NORMAL otherwise.
 * `held` tells whether the hysteresis kept a more urgent class than the margins alone.
 */
export function classifyMargins(
  feasibilitySlackMs: Millis,
  slackFifoMs: Millis,
  params: Pick<ClassificationParams, 'attentionThresholdMs' | 'hysteresisMs'>,
  lastRiskClass?: RiskClass,
): { readonly riskClass: RiskClass; readonly held: boolean } {
  const level = lastRiskClass === undefined ? -1 : URGENCY[lastRiskClass];
  const h = params.hysteresisMs;
  const raw = classAt(feasibilitySlackMs, slackFifoMs, params.attentionThresholdMs, 0, 0, 0);
  const riskClass = classAt(
    feasibilitySlackMs,
    slackFifoMs,
    params.attentionThresholdMs,
    level >= 3 ? h : 0,
    level >= 2 ? h : 0,
    level >= 1 ? h : 0,
  );
  return { riskClass, held: riskClass !== raw };
}

function classAt(
  feasibility: Millis,
  slackFifo: Millis,
  attention: Millis,
  hCritical: Millis,
  hUrgent: Millis,
  hAttention: Millis,
): RiskClass {
  if (feasibility < hCritical) return 'CRITICAL';
  if (slackFifo < hUrgent) return 'URGENT';
  if (slackFifo < attention + hAttention) return 'ATTENTION';
  return 'NORMAL';
}

/**
 * The presentation rule (anti-abuse): a departing passenger may be boosted automatically only if
 * they presented at the checkpoint at least `latePresentationCutoffMs` before the scheduled
 * departure. Returns the reason that blocks the boost, or `null` when the rule does not apply or
 * is satisfied. Transfers are exempt.
 */
export function presentationBlock(
  ticket: WaitingTicket,
  params: Pick<ClassificationParams, 'latePresentationCutoffMs'>,
): 'LATE_PRESENTATION' | 'PRESENTATION_UNVERIFIED' | null {
  const cutoff = params.latePresentationCutoffMs;
  if (cutoff === null || ticket.segment !== 'DEPARTING') return null;
  const presented = ticket.presentedAtMs;
  const departure = ticket.scheduledDepartureMs;
  if (presented === undefined || departure === undefined || departure === null) {
    return 'PRESENTATION_UNVERIFIED';
  }
  return presented > departure - cutoff ? 'LATE_PRESENTATION' : null;
}

/** Estimated journeys of a ticket, from a call made now to the gate. */
export interface JourneyEstimates {
  /** Through the queue: R + n P + W (n people screened one after the other). */
  readonly queueJourneyMs: Millis;
  /** If boosted: as through the queue, or with the fast-track response time under the fast track. */
  readonly boostJourneyMs: Millis;
  /**
   * Time before a boosted ticket is called: the time C to call the committed people ahead, or
   * zero under the fast track (a fast-track call is made next).
   */
  readonly boostDrainMs: Millis;
}

/**
 * The journeys of `ticket` through the queue and through a boost. Under the fast track the
 * response time of a boosted call is the fast-track estimate, or the time since the passenger was
 * last at the access point when that is shorter: they cannot have walked further away (ADR-018).
 */
export function journeyEstimates(
  ticket: WaitingTicket,
  nowMs: Millis,
  checkpoint: CheckpointEstimates,
  params: Pick<ClassificationParams, 'fastTrack'>,
  committedAhead: number,
): JourneyEstimates {
  // A group is screened one person after the other: the last one is through after size x P.
  const tailMs = checkpoint.processMs * partySizeOf(ticket) + ticket.walkEstimateMs;
  const drainMs = fifoWaitEstimateMs(committedAhead, checkpoint.throughputPerHour);
  const queueJourneyMs = checkpoint.responseMs + tailMs;
  if (!params.fastTrack) {
    return { queueJourneyMs, boostJourneyMs: queueJourneyMs, boostDrainMs: drainMs };
  }
  let responseMs = checkpoint.fastTrackResponseMs ?? checkpoint.responseMs;
  if (ticket.lastSeenAtMs !== undefined) {
    responseMs = Math.min(responseMs, Math.max(0, nowMs - ticket.lastSeenAtMs));
  }
  return { queueJourneyMs, boostJourneyMs: responseMs + tailMs, boostDrainMs: 0 };
}

/**
 * Classifies one ticket.
 *
 * L = deadline - (R + n P + W + B) is the latest useful call time with the safety margin B, for a
 * ticket of n people (screened one after the other). The ticket is compared with what would
 * happen under plain FIFO (slackFifo = deadline - (R + n P + W + B) - now - FIFO wait, the FIFO
 * wait counting everybody ahead, committed tickets included) and if it were selected right now
 * (slackNow = L - now - C, where C is the estimated time to call the `committedAhead` people
 * already committed ahead of the waiting list, who cannot be overtaken). Using the FIFO
 * counterfactual avoids the circularity of estimating a wait that itself depends on the priority
 * decision. Under the fast track, L and slackNow use the fast-track journey and C = 0
 * ({@link journeyEstimates}); slackFifo keeps the journey through the queue.
 *
 * The ticket is CRITICAL when, selected now, it would not make it even with the smaller
 * feasibility margin F: deadline - (R + P + W + F) - now - C < 0.
 *
 * `aheadInFifo` counts every person in front of this ticket, committed ones included, so it must
 * be at least `committedAhead`.
 */
export function assessTicket(
  ticket: WaitingTicket,
  aheadInFifo: number,
  nowMs: Millis,
  checkpoint: CheckpointEstimates,
  params: ClassificationParams,
  committedAhead = 0,
): Assessment {
  const fifoWait = fifoWaitEstimateMs(aheadInFifo, checkpoint.throughputPerHour);
  const reasons: ReasonCode[] = [];
  const { deadline } = ticket;
  const segmentEligible = params.eligibleSegments.includes(ticket.segment);
  const presentation = presentationBlock(ticket, params);

  if (deadline.atMs === null) {
    reasons.push('DEADLINE_UNKNOWN');
    if (!segmentEligible) reasons.push('SEGMENT_NOT_ELIGIBLE');
    if (presentation !== null) reasons.push(presentation);
    return unverified(ticket.id, aheadInFifo, fifoWait, reasons);
  }
  reasons.push(deadline.source === 'FEED' ? 'DEADLINE_FROM_FEED' : 'DEADLINE_FROM_RULE');
  if (!isDeadlineTrusted(deadline, params)) {
    reasons.push('RULE_DEADLINE_NOT_ALLOWED');
    if (!segmentEligible) reasons.push('SEGMENT_NOT_ELIGIBLE');
    if (presentation !== null) reasons.push(presentation);
    return unverified(ticket.id, aheadInFifo, fifoWait, reasons);
  }
  if (isDeadlineStale(deadline, params, nowMs)) {
    reasons.push('DEADLINE_STALE');
    if (!segmentEligible) reasons.push('SEGMENT_NOT_ELIGIBLE');
    if (presentation !== null) reasons.push(presentation);
    return unverified(ticket.id, aheadInFifo, fifoWait, reasons);
  }

  const journey = journeyEstimates(ticket, nowMs, checkpoint, params, committedAhead);
  const latestCallMs = deadline.atMs - (journey.boostJourneyMs + params.safetyBufferMs);
  const slackNowMs = latestCallMs - nowMs - journey.boostDrainMs;
  // The FIFO wait already counts the committed tickets ahead: they must not be subtracted twice.
  const slackFifoMs =
    deadline.atMs - (journey.queueJourneyMs + params.safetyBufferMs) - nowMs - fifoWait;
  const feasibilitySlackMs =
    deadline.atMs -
    (journey.boostJourneyMs + params.feasibilityMarginMs) -
    nowMs -
    journey.boostDrainMs;
  const { riskClass, held } = classifyMargins(
    feasibilitySlackMs,
    slackFifoMs,
    params,
    ticket.lastRiskClass,
  );
  if (riskClass === 'CRITICAL') reasons.push('CRITICAL_ESCALATION');
  if (riskClass === 'URGENT' && slackNowMs < 0) reasons.push('INSIDE_SAFETY_MARGIN');
  if (held) reasons.push('HYSTERESIS_HOLD');
  if (!segmentEligible) reasons.push('SEGMENT_NOT_ELIGIBLE');
  if (presentation !== null) reasons.push(presentation);
  return {
    ticketId: ticket.id,
    riskClass,
    aheadInFifo,
    fifoWaitEstimateMs: fifoWait,
    latestCallMs,
    slackFifoMs,
    slackNowMs,
    feasibilitySlackMs,
    boostEligible: riskClass === 'URGENT' && segmentEligible && presentation === null,
    reasons,
  };
}

function unverified(
  ticketId: string,
  aheadInFifo: number,
  fifoWait: Millis,
  reasons: ReasonCode[],
): Assessment {
  return {
    ticketId,
    riskClass: 'UNVERIFIED',
    aheadInFifo,
    fifoWaitEstimateMs: fifoWait,
    latestCallMs: null,
    slackFifoMs: null,
    slackNowMs: null,
    feasibilitySlackMs: null,
    boostEligible: false,
    reasons,
  };
}

/** Input of {@link assessQueue}. */
export interface QueueSnapshot {
  readonly nowMs: Millis;
  readonly checkpoint: CheckpointEstimates;
  readonly waiting: readonly WaitingTicket[];
  /** People committed to be called before every waiting ticket. Default 0. */
  readonly aheadOfWaiting?: number;
}

/** Assesses every waiting ticket. The result is in FIFO order (one entry per ticket). */
export function assessQueue(snapshot: QueueSnapshot, params: ClassificationParams): Assessment[] {
  validateNow(snapshot.nowMs);
  validateCheckpoint(snapshot.checkpoint);
  const offset = snapshot.aheadOfWaiting ?? 0;
  validateAheadOfWaiting(offset);
  const ordered = toFifoOrder(snapshot.waiting);
  let ahead = offset;
  return ordered.map((ticket) => {
    validateTicket(ticket);
    const assessment = assessTicket(
      ticket,
      ahead,
      snapshot.nowMs,
      snapshot.checkpoint,
      params,
      offset,
    );
    ahead += partySizeOf(ticket);
    return assessment;
  });
}
