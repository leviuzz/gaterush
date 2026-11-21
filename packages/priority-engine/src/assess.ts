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

/**
 * Classifies one ticket.
 *
 * L = deadline - (R + n P + W + B) is the latest useful call time with the safety margin B, for a
 * ticket of n people (screened one after the other). The
 * ticket is compared with what would happen under plain FIFO (slackFifo = L - now - FIFO wait,
 * the FIFO wait counting everybody ahead, committed tickets included) and if it were selected
 * right now (slackNow = L - now - C, where C is the estimated time to call the `committedAhead`
 * people already committed ahead of the waiting list, who cannot be overtaken). Using the FIFO
 * counterfactual avoids the circularity of estimating a wait that itself depends on the priority
 * decision.
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

  // A group is screened one person after the other: the last one is through after size x P.
  const journeyMs =
    checkpoint.responseMs + checkpoint.processMs * partySizeOf(ticket) + ticket.walkEstimateMs;
  const drainMs = fifoWaitEstimateMs(committedAhead, checkpoint.throughputPerHour);
  const latestCallMs = deadline.atMs - (journeyMs + params.safetyBufferMs);
  const slackNowMs = latestCallMs - nowMs - drainMs;
  // The FIFO wait already counts the committed tickets ahead: they must not be subtracted twice.
  const slackFifoMs = latestCallMs - nowMs - fifoWait;
  const feasibilitySlackMs =
    deadline.atMs - (journeyMs + params.feasibilityMarginMs) - nowMs - drainMs;
  let riskClass: RiskClass;
  if (feasibilitySlackMs < 0) {
    riskClass = 'CRITICAL';
    reasons.push('CRITICAL_ESCALATION');
  } else if (slackFifoMs < 0) {
    riskClass = 'URGENT';
    if (slackNowMs < 0) reasons.push('INSIDE_SAFETY_MARGIN');
  } else if (slackFifoMs < params.attentionThresholdMs) {
    riskClass = 'ATTENTION';
  } else {
    riskClass = 'NORMAL';
  }
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
