import { SEGMENTS } from '@gateflow/domain';
import type {
  CheckpointEstimates,
  ClassificationParams,
  ConstrainedEdfPolicyParams,
  PolicyParams,
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

export function validatePolicyParams(input: PolicyParams): void {
  // Widened to string: callers may pass untyped data (e.g. parsed JSON).
  const kind: string = input.kind;
  if (kind === 'fifo') return;
  if (kind !== 'constrained-edf') throw new EngineInputError(`unknown policy kind: ${kind}`);
  const params = input as ConstrainedEdfPolicyParams;
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

export function validateTicket(ticket: WaitingTicket): void {
  if (typeof ticket.id !== 'string' || ticket.id.length === 0) {
    throw new EngineInputError('ticket id must be a non-empty string');
  }
  requireSafeInteger(ticket.fifoKey, `fifoKey of ${ticket.id}`);
  requireSafeInteger(ticket.walkEstimateMs, `walkEstimateMs of ${ticket.id}`, 0);
  requireSafeInteger(ticket.overtakenCount, `overtakenCount of ${ticket.id}`, 0);
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
