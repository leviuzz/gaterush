import type { ReasonCode } from './reasons';
import {
  assessTicket,
  classifyMargins,
  fifoWaitEstimateMs,
  isDeadlineStale,
  isDeadlineTrusted,
  journeyEstimates,
  partySizeOf,
  presentationBlock,
} from './assess';
import type {
  ConstrainedEdfSelection,
  EngineInput,
  FlightCallSelection,
  Selection,
  WaitingTicket,
} from './types';
import {
  toFifoOrder,
  validateAheadMaxOvertakenCount,
  validateAheadOfWaiting,
  validateCheckpoint,
  validateNow,
  validateSelectionParams,
} from './validate';

/**
 * Number of people called by priority among the last `capWindowCalls - partySize` people called.
 * A priority call of a ticket with `partySize` people is allowed only while this plus `partySize`
 * stays within `capMaxPriorityCalls`, which guarantees that every window of `capWindowCalls`
 * consecutive people called contains at most `capMaxPriorityCalls` people called by priority.
 */
export function priorityCallsInWindow(
  recentPriorityCalls: readonly boolean[],
  capWindowCalls: number,
  partySize = 1,
): number {
  let count = 0;
  const from = Math.max(0, recentPriorityCalls.length - Math.max(0, capWindowCalls - partySize));
  for (let i = from; i < recentPriorityCalls.length; i++) if (recentPriorityCalls[i]) count++;
  return count;
}

/** True when the cap allows a priority call of a ticket with `partySize` people right now. */
export function capAllows(
  recentPriorityCalls: readonly boolean[],
  selection: Pick<ConstrainedEdfSelection, 'capWindowCalls' | 'capMaxPriorityCalls'>,
  partySize: number,
): boolean {
  return (
    priorityCallsInWindow(recentPriorityCalls, selection.capWindowCalls, partySize) + partySize <=
    selection.capMaxPriorityCalls
  );
}

/**
 * Decides which ticket to call next. Returns `null` when nobody is waiting.
 *
 * Constrained EDF, in order of precedence:
 * 1. If a ticket has been overtaken by K people, call the oldest such ticket (overtake guard),
 *    unless that would push an older ticket beyond K: then call the oldest ticket.
 * 2. Otherwise take the boost-eligible URGENT ticket with the earliest latest-call time L (ties:
 *    lower fifoKey), ignoring groups larger than the cap. Call it if the cap has room for its
 *    people and no older ticket would be overtaken by more than K people (under the fast track,
 *    the committed people ahead included); otherwise call the oldest ticket.
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
  validateAheadMaxOvertakenCount(input.aheadMaxOvertakenCount ?? 0);
  const waiting = toFifoOrder(input.waiting);
  const head = waiting[0];
  if (head === undefined) return null;

  const selection = input.selection;
  switch (selection.kind) {
    case 'fifo':
      return {
        ticketId: head.id,
        fifoKey: head.fifoKey,
        positionInFifo: 0,
        priorityCall: false,
        reasons: ['POLICY_FIFO'],
        urgentCandidates: 0,
        assessment: null,
      };
    case 'flight-call':
      return selectFlightCall(input, waiting, selection);
    case 'constrained-edf':
      return selectConstrainedEdf(input, waiting, selection);
  }
}

/**
 * Staff call the flights whose known boarding close is within the call window of the latest
 * announcement; their passengers are taken first, earliest boarding close first (ties: FIFO).
 */
function selectFlightCall(
  input: EngineInput,
  waiting: readonly WaitingTicket[],
  selection: FlightCallSelection,
): Selection {
  const interval = selection.announcementIntervalMs;
  const announcementMs = Math.floor(input.nowMs / interval) * interval;
  let best = -1;
  let bestDeadline = Infinity;
  let called = 0;
  for (let i = 0; i < waiting.length; i++) {
    const deadlineMs = (waiting[i] as WaitingTicket).deadline.atMs;
    if (deadlineMs === null || deadlineMs - announcementMs > selection.callWindowMs) continue;
    called++;
    if (deadlineMs < bestDeadline) {
      bestDeadline = deadlineMs;
      best = i;
    }
  }
  const index = Math.max(best, 0);
  const ticket = waiting[index] as WaitingTicket;
  return {
    ticketId: ticket.id,
    fifoKey: ticket.fifoKey,
    positionInFifo: index,
    priorityCall: best > 0,
    reasons: [best < 0 ? 'FIFO' : 'FLIGHT_CALL'],
    urgentCandidates: called,
    assessment: null,
  };
}

function selectConstrainedEdf(
  input: EngineInput,
  waiting: readonly WaitingTicket[],
  policy: ConstrainedEdfSelection,
): Selection {
  const { nowMs, checkpoint } = input;
  const offset = input.aheadOfWaiting ?? 0;
  const throughput = checkpoint.throughputPerHour;
  const maxBoostParty = Math.max(1, policy.capMaxPriorityCalls);
  let guardIndex = -1;
  let guardMaxOvertakenAhead = 0;
  let urgentIndex = -1;
  let urgentLatest = Infinity;
  let urgentMaxOvertakenAhead = 0;
  let urgentCandidates = 0;
  let peopleAhead = offset;
  let maxOvertakenAhead = 0;

  for (let i = 0; i < waiting.length; i++) {
    const ticket = waiting[i] as WaitingTicket;
    const size = partySizeOf(ticket);
    if (guardIndex < 0 && ticket.overtakenCount >= policy.maxOvertakes) {
      guardIndex = i;
      guardMaxOvertakenAhead = maxOvertakenAhead;
    }
    const deadlineMs = ticket.deadline.atMs;
    if (
      deadlineMs !== null &&
      isDeadlineTrusted(ticket.deadline, policy) &&
      !isDeadlineStale(ticket.deadline, policy, nowMs) &&
      policy.eligibleSegments.includes(ticket.segment) &&
      presentationBlock(ticket, policy) === null
    ) {
      // Without the fast track the boosted call waits for the committed people ahead (the drain);
      // with it the call is made next.
      const journey = journeyEstimates(ticket, nowMs, checkpoint, policy, offset);
      const latest = deadlineMs - journey.boostJourneyMs - policy.safetyBufferMs;
      const feasibilitySlack =
        deadlineMs -
        journey.boostJourneyMs -
        policy.feasibilityMarginMs -
        nowMs -
        journey.boostDrainMs;
      // The FIFO wait already counts the committed people ahead (the offset).
      const fifoWait = fifoWaitEstimateMs(peopleAhead, throughput);
      const slackFifo =
        deadlineMs - journey.queueJourneyMs - policy.safetyBufferMs - nowMs - fifoWait;
      const { riskClass } = classifyMargins(
        feasibilitySlack,
        slackFifo,
        policy,
        ticket.lastRiskClass,
      );
      if (riskClass === 'URGENT') {
        // URGENT and boost-eligible. Groups larger than the cap are counted but never boosted
        // (a single passenger is always a candidate: with a zero cap it meets CAP_REACHED).
        urgentCandidates++;
        if (size <= maxBoostParty && latest < urgentLatest) {
          urgentLatest = latest;
          urgentIndex = i;
          urgentMaxOvertakenAhead = maxOvertakenAhead;
        }
      }
    }
    maxOvertakenAhead = Math.max(maxOvertakenAhead, ticket.overtakenCount);
    peopleAhead += size;
  }

  if (guardIndex >= 0) {
    // Normally the ticket at the limit is the oldest one. A ticket put back at its original place
    // (a reactivated no-show) can sit ahead of it; if calling the ticket at the limit would push
    // that older ticket beyond K, the oldest ticket is called instead, which overtakes nobody.
    const size = partySizeOf(waiting[guardIndex] as WaitingTicket);
    const index = guardMaxOvertakenAhead + size > policy.maxOvertakes ? 0 : guardIndex;
    return build(input, waiting, policy, index, false, ['OVERTAKE_LIMIT_GUARD'], urgentCandidates);
  }
  // A boost jumps the older waiting tickets. Under the fast track it also jumps the committed people
  // and the people waiting at the lanes, so an URGENT head of the waiting list is boosted too: being
  // URGENT means that it would be too late through the window and the call-ahead buffer.
  const jumps = urgentIndex > 0 || (urgentIndex === 0 && policy.fastTrack);
  if (jumps) {
    const size = partySizeOf(waiting[urgentIndex] as WaitingTicket);
    if (!capAllows(input.recentPriorityCalls, policy, size)) {
      return build(input, waiting, policy, 0, false, ['CAP_REACHED'], urgentCandidates);
    }
    // A fast-track call is made ahead of the committed people too, so they count as overtaken.
    const passedMax = policy.fastTrack
      ? Math.max(urgentMaxOvertakenAhead, input.aheadMaxOvertakenCount ?? 0)
      : urgentMaxOvertakenAhead;
    if (passedMax + size > policy.maxOvertakes) {
      return build(input, waiting, policy, 0, false, ['OVERTAKE_ROOM_EXHAUSTED'], urgentCandidates);
    }
    return build(input, waiting, policy, urgentIndex, true, ['URGENT_FEASIBLE'], urgentCandidates);
  }
  // Without people ahead of the waiting list the head can never be URGENT (its FIFO wait is
  // zero); with a committed window ahead it can, and without the fast track it is simply called in
  // FIFO order.
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
  const offset = input.aheadOfWaiting ?? 0;
  let peopleAhead = offset;
  for (let j = 0; j < index; j++) peopleAhead += partySizeOf(waiting[j] as WaitingTicket);
  let assessment = assessTicket(ticket, peopleAhead, input.nowMs, input.checkpoint, policy, offset);
  if (assessment.boostEligible && partySizeOf(ticket) > Math.max(1, policy.capMaxPriorityCalls)) {
    assessment = { ...assessment, reasons: [...assessment.reasons, 'GROUP_EXCEEDS_CAP'] };
  }
  return {
    ticketId: ticket.id,
    fifoKey: ticket.fifoKey,
    positionInFifo: index,
    priorityCall,
    reasons,
    urgentCandidates,
    assessment,
  };
}
