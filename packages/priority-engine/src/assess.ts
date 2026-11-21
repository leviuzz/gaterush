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
 * Estimated wait until the call for a ticket with `ahead` tickets in front of it, if the queue is
 * served in FIFO order at the nominal throughput: floor(ahead * 1 h / throughput).
 */
export function fifoWaitEstimateMs(ahead: number, throughputPerHour: number): Millis {
  return Math.floor((ahead * MS_PER_HOUR) / throughputPerHour);
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
 * Classifies one ticket.
 *
 * L = deadline - (R + P + W + B) is the latest useful call time. The ticket is compared with what
 * would happen under plain FIFO (slackFifo = L - now - FIFO wait) and if it were selected right
 * now (slackNow = L - now - D). D is the estimated time to call the `committedAhead` tickets that
 * were already committed ahead of the waiting list and cannot be overtaken (the "prepare" window;
 * zero without one). Using the FIFO counterfactual avoids the circularity of estimating a wait
 * that itself depends on the priority decision.
 *
 * `aheadInFifo` counts every ticket in front of this one, committed ones included, so it must be
 * at least `committedAhead`.
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

  if (deadline.atMs === null) {
    reasons.push('DEADLINE_UNKNOWN');
    if (!segmentEligible) reasons.push('SEGMENT_NOT_ELIGIBLE');
    return unverified(ticket.id, aheadInFifo, fifoWait, reasons);
  }
  reasons.push(deadline.source === 'FEED' ? 'DEADLINE_FROM_FEED' : 'DEADLINE_FROM_RULE');
  if (!isDeadlineTrusted(deadline, params)) {
    reasons.push('RULE_DEADLINE_NOT_ALLOWED');
    if (!segmentEligible) reasons.push('SEGMENT_NOT_ELIGIBLE');
    return unverified(ticket.id, aheadInFifo, fifoWait, reasons);
  }

  const latestCallMs =
    deadline.atMs -
    (checkpoint.responseMs + checkpoint.processMs + ticket.walkEstimateMs + params.safetyBufferMs);
  const slackNowMs =
    latestCallMs - nowMs - fifoWaitEstimateMs(committedAhead, checkpoint.throughputPerHour);
  const slackFifoMs = slackNowMs - fifoWait;
  let riskClass: RiskClass;
  if (slackNowMs < 0) {
    riskClass = 'CRITICAL';
    reasons.push('CRITICAL_ESCALATION');
  } else if (slackFifoMs < 0) {
    riskClass = 'URGENT';
  } else if (slackFifoMs < params.attentionThresholdMs) {
    riskClass = 'ATTENTION';
  } else {
    riskClass = 'NORMAL';
  }
  if (!segmentEligible) reasons.push('SEGMENT_NOT_ELIGIBLE');
  return {
    ticketId: ticket.id,
    riskClass,
    aheadInFifo,
    fifoWaitEstimateMs: fifoWait,
    latestCallMs,
    slackFifoMs,
    slackNowMs,
    boostEligible: riskClass === 'URGENT' && segmentEligible,
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
    boostEligible: false,
    reasons,
  };
}

/** Input of {@link assessQueue}. */
export interface QueueSnapshot {
  readonly nowMs: Millis;
  readonly checkpoint: CheckpointEstimates;
  readonly waiting: readonly WaitingTicket[];
  /** Tickets committed to be called before every waiting ticket. Default 0. */
  readonly aheadOfWaiting?: number;
}

/** Assesses every waiting ticket. The result is in FIFO order (one entry per ticket). */
export function assessQueue(snapshot: QueueSnapshot, params: ClassificationParams): Assessment[] {
  validateNow(snapshot.nowMs);
  validateCheckpoint(snapshot.checkpoint);
  const offset = snapshot.aheadOfWaiting ?? 0;
  validateAheadOfWaiting(offset);
  const ordered = toFifoOrder(snapshot.waiting);
  return ordered.map((ticket, index) => {
    validateTicket(ticket);
    return assessTicket(
      ticket,
      offset + index,
      snapshot.nowMs,
      snapshot.checkpoint,
      params,
      offset,
    );
  });
}
