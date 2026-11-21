import type { ReasonCode } from './reasons';
import { assessTicket, fifoWaitEstimateMs, isDeadlineTrusted } from './assess';
import type { ConstrainedEdfSelection, EngineInput, Selection, WaitingTicket } from './types';
import {
  toFifoOrder,
  validateAheadOfWaiting,
  validateCheckpoint,
  validateNow,
  validateSelectionParams,
} from './validate';

/**
 * Number of priority calls among the last `capWindowCalls - 1` calls. A new priority call is
 * allowed only while this is below `capMaxPriorityCalls`, which guarantees that every window of
 * `capWindowCalls` consecutive calls contains at most `capMaxPriorityCalls` priority calls.
 */
export function priorityCallsInWindow(
  recentPriorityCalls: readonly boolean[],
  capWindowCalls: number,
): number {
  let count = 0;
  const from = Math.max(0, recentPriorityCalls.length - (capWindowCalls - 1));
  for (let i = from; i < recentPriorityCalls.length; i++) if (recentPriorityCalls[i]) count++;
  return count;
}

/**
 * Decides which ticket to call next. Returns `null` when nobody is waiting.
 *
 * Constrained EDF, in order of precedence:
 * 1. If a ticket has been overtaken K times, call the oldest such ticket (overtake guard).
 * 2. Otherwise, if boost-eligible URGENT tickets exist and the cap allows another priority call,
 *    call the one with the earliest latest-call time L (ties: lower fifoKey).
 * 3. Otherwise call the oldest ticket (FIFO).
 *
 * The function is pure and deterministic: the same input always yields the same selection,
 * whatever the order of `input.waiting`.
 */
export function selectNext(input: EngineInput): Selection | null {
  validateNow(input.nowMs);
  validateCheckpoint(input.checkpoint);
  validateSelectionParams(input.selection);
  validateAheadOfWaiting(input.aheadOfWaiting ?? 0);
  const waiting = toFifoOrder(input.waiting);
  const head = waiting[0];
  if (head === undefined) return null;

  const selection = input.selection;
  if (selection.kind === 'fifo') {
    return {
      ticketId: head.id,
      fifoKey: head.fifoKey,
      positionInFifo: 0,
      priorityCall: false,
      reasons: ['POLICY_FIFO'],
      urgentCandidates: 0,
      assessment: null,
    };
  }
  return selectConstrainedEdf(input, waiting, selection);
}

function selectConstrainedEdf(
  input: EngineInput,
  waiting: readonly WaitingTicket[],
  policy: ConstrainedEdfSelection,
): Selection {
  const { nowMs, checkpoint } = input;
  const offset = input.aheadOfWaiting ?? 0;
  const fixedMs = checkpoint.responseMs + checkpoint.processMs + policy.safetyBufferMs;
  // Time to call the committed tickets ahead of the waiting list: nobody can be called earlier.
  const committedDrainMs = fifoWaitEstimateMs(offset, checkpoint.throughputPerHour);
  let guardIndex = -1;
  let urgentIndex = -1;
  let urgentLatest = Infinity;
  let urgentCandidates = 0;

  for (let i = 0; i < waiting.length; i++) {
    const ticket = waiting[i] as WaitingTicket;
    if (guardIndex < 0 && ticket.overtakenCount >= policy.maxOvertakes) guardIndex = i;
    const deadlineMs = ticket.deadline.atMs;
    if (deadlineMs === null || !isDeadlineTrusted(ticket.deadline, policy)) continue;
    if (!policy.eligibleSegments.includes(ticket.segment)) continue;
    const latest = deadlineMs - fixedMs - ticket.walkEstimateMs;
    const slackNow = latest - nowMs - committedDrainMs;
    if (slackNow < 0) continue; // CRITICAL: escalate, never boost automatically
    // The FIFO wait already counts the committed tickets ahead (the offset).
    const fifoWait = fifoWaitEstimateMs(offset + i, checkpoint.throughputPerHour);
    if (latest - nowMs - fifoWait >= 0) continue; // fine in FIFO
    urgentCandidates++;
    if (latest < urgentLatest) {
      urgentLatest = latest;
      urgentIndex = i;
    }
  }

  if (guardIndex >= 0) {
    return build(
      input,
      waiting,
      policy,
      guardIndex,
      false,
      ['OVERTAKE_LIMIT_GUARD'],
      urgentCandidates,
    );
  }
  if (urgentIndex > 0) {
    const used = priorityCallsInWindow(input.recentPriorityCalls, policy.capWindowCalls);
    if (used < policy.capMaxPriorityCalls) {
      return build(
        input,
        waiting,
        policy,
        urgentIndex,
        true,
        ['URGENT_FEASIBLE'],
        urgentCandidates,
      );
    }
    return build(input, waiting, policy, 0, false, ['CAP_REACHED'], urgentCandidates);
  }
  // Without tickets ahead of the waiting list the head can never be URGENT (its FIFO wait is zero);
  // with a committed window ahead it can, and it is simply called in FIFO order.
  return build(input, waiting, policy, 0, false, ['FIFO'], urgentCandidates);
}

function build(
  input: EngineInput,
  waiting: readonly WaitingTicket[],
  policy: ConstrainedEdfSelection,
  index: number,
  priorityCall: boolean,
  reasons: ReasonCode[],
  urgentCandidates: number,
): Selection {
  const ticket = waiting[index] as WaitingTicket;
  return {
    ticketId: ticket.id,
    fifoKey: ticket.fifoKey,
    positionInFifo: index,
    priorityCall,
    reasons,
    urgentCandidates,
    assessment: assessTicket(
      ticket,
      (input.aheadOfWaiting ?? 0) + index,
      input.nowMs,
      input.checkpoint,
      policy,
      input.aheadOfWaiting ?? 0,
    ),
  };
}
