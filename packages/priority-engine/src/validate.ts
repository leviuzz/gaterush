import { SEGMENTS } from '@gateflow/domain';
import type {
  CheckpointEstimates,
  ClassificationParams,
  ConstrainedEdfSelection,
  FlightCallSelection,
  SelectionParams,
  WaitingTicket,
} from './types';

/** Thrown when the engine receives an input that violates its contract. */
export class EngineInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EngineInputError';
  }
}

function requireSafeInteger(value: number, what: string, min = Number.MIN_SAFE_INTEGER): void {
  if (!Number.isSafeInteger(value) || value < min) {
    throw new EngineInputError(`${what} must be an integer >= ${min}, got ${value}`);
  }
}

export function validateSelectionParams(input: SelectionParams): void {
  // Widened to string: callers may pass untyped data (e.g. parsed JSON).
  const kind: string = input.kind;
  if (kind === 'fifo') return;
  if (kind === 'flight-call') {
    const call = input as FlightCallSelection;
    requireSafeInteger(call.callWindowMs, 'callWindowMs', 0);
    requireSafeInteger(call.announcementIntervalMs, 'announcementIntervalMs', 1);
    return;
  }
  if (kind !== 'constrained-edf') throw new EngineInputError(`unknown selection kind: ${kind}`);
  const params = input as ConstrainedEdfSelection;
  requireSafeInteger(params.capWindowCalls, 'capWindowCalls', 1);
  requireSafeInteger(params.capMaxPriorityCalls, 'capMaxPriorityCalls', 0);
  if (params.capMaxPriorityCalls > params.capWindowCalls) {
    throw new EngineInputError('capMaxPriorityCalls must not exceed capWindowCalls');
  }
  requireSafeInteger(params.maxOvertakes, 'maxOvertakes', 0);
  validateClassificationParams(params);
}

export function validateClassificationParams(params: ClassificationParams): void {
  requireSafeInteger(params.attentionThresholdMs, 'attentionThresholdMs', 0);
  requireSafeInteger(params.safetyBufferMs, 'safetyBufferMs', 0);
  requireSafeInteger(params.feasibilityMarginMs, 'feasibilityMarginMs', 0);
  // Widened: callers may pass untyped data (e.g. parsed JSON).
  const cutoff: unknown = params.latePresentationCutoffMs;
  if (cutoff !== null) {
    if (typeof cutoff !== 'number') {
      throw new EngineInputError('latePresentationCutoffMs must be a number or null');
    }
    requireSafeInteger(cutoff, 'latePresentationCutoffMs', 0);
  }
  // Widened: callers may pass untyped data (e.g. parsed JSON).
  const allowRule: unknown = params.allowRuleBasedDeadline;
  if (typeof allowRule !== 'boolean') {
    throw new EngineInputError('allowRuleBasedDeadline must be a boolean');
  }
  const seen = new Set<string>();
  for (const segment of params.eligibleSegments) {
    if (!(SEGMENTS as readonly string[]).includes(segment)) {
      throw new EngineInputError(`unknown segment in eligibleSegments: ${segment}`);
    }
    if (seen.has(segment)) throw new EngineInputError(`duplicate segment: ${segment}`);
    seen.add(segment);
  }
}

export function validateCheckpoint(checkpoint: CheckpointEstimates): void {
  if (!(checkpoint.throughputPerHour > 0) || !Number.isFinite(checkpoint.throughputPerHour)) {
    throw new EngineInputError(
      `throughputPerHour must be a finite number > 0, got ${checkpoint.throughputPerHour}`,
    );
  }
  requireSafeInteger(checkpoint.processMs, 'processMs', 0);
  requireSafeInteger(checkpoint.responseMs, 'responseMs', 0);
}

export function validateNow(nowMs: number): void {
  requireSafeInteger(nowMs, 'nowMs');
}

export function validateAheadOfWaiting(aheadOfWaiting: number): void {
  requireSafeInteger(aheadOfWaiting, 'aheadOfWaiting', 0);
}

export function validateTicket(ticket: WaitingTicket): void {
  if (typeof ticket.id !== 'string' || ticket.id.length === 0) {
    throw new EngineInputError('ticket id must be a non-empty string');
  }
  requireSafeInteger(ticket.fifoKey, `fifoKey of ${ticket.id}`);
  requireSafeInteger(ticket.walkEstimateMs, `walkEstimateMs of ${ticket.id}`, 0);
  requireSafeInteger(ticket.overtakenCount, `overtakenCount of ${ticket.id}`, 0);
  if (ticket.partySize !== undefined) {
    requireSafeInteger(ticket.partySize, `partySize of ${ticket.id}`, 1);
  }
  if (ticket.presentedAtMs !== undefined) {
    requireSafeInteger(ticket.presentedAtMs, `presentedAtMs of ${ticket.id}`);
  }
  if (ticket.scheduledDepartureMs !== undefined && ticket.scheduledDepartureMs !== null) {
    requireSafeInteger(ticket.scheduledDepartureMs, `scheduledDepartureMs of ${ticket.id}`);
  }
  if (!(SEGMENTS as readonly string[]).includes(ticket.segment)) {
    throw new EngineInputError(`unknown segment of ${ticket.id}: ${ticket.segment}`);
  }
  const atMs = ticket.deadline.atMs;
  // Widened to string: callers may pass untyped data (e.g. parsed JSON).
  const source: string = ticket.deadline.source;
  if (source === 'NONE') {
    if (atMs !== null) throw new EngineInputError(`deadline of ${ticket.id}: NONE requires null`);
  } else if (source === 'FEED' || source === 'RULE') {
    if (atMs === null)
      throw new EngineInputError(`deadline of ${ticket.id}: ${source} needs a time`);
    requireSafeInteger(atMs, `deadline of ${ticket.id}`);
  } else {
    throw new EngineInputError(`unknown deadline source of ${ticket.id}: ${source}`);
  }
}

/**
 * Returns the tickets sorted by `fifoKey` (the input itself when already sorted), validating every
 * ticket and rejecting duplicate keys.
 */
export function toFifoOrder(waiting: readonly WaitingTicket[]): readonly WaitingTicket[] {
  let sorted = true;
  for (let i = 0; i < waiting.length; i++) {
    const ticket = waiting[i] as WaitingTicket;
    validateTicket(ticket);
    if (i > 0 && (waiting[i - 1] as WaitingTicket).fifoKey >= ticket.fifoKey) sorted = false;
  }
  if (sorted) return waiting;
  const copy = [...waiting].sort((a, b) => a.fifoKey - b.fifoKey);
  for (let i = 1; i < copy.length; i++) {
    if ((copy[i - 1] as WaitingTicket).fifoKey === (copy[i] as WaitingTicket).fifoKey) {
      throw new EngineInputError(`duplicate fifoKey ${(copy[i] as WaitingTicket).fifoKey}`);
    }
  }
  return copy;
}
