import { MS_PER_HOUR, MS_PER_MINUTE } from '@gateflow/domain';
import type { Millis } from '@gateflow/domain';
import { validateSelectionParams } from '@gateflow/priority-engine';
import type { ClassificationParams, ConstrainedEdfSelection } from '@gateflow/priority-engine';
import type { Policy, QueueOperation, VirtualQueue } from './types';

/** Thrown when the queue is misconfigured or misused. */
export class QueueError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'QueueError';
  }
}

function requireInteger(value: number, what: string, min: number): void {
  if (!Number.isSafeInteger(value) || value < min) {
    throw new QueueError(`${what} must be an integer >= ${min}, got ${value}`);
  }
}

function requireFinite(value: number, what: string, min: number, max: number): void {
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new QueueError(`${what} must be a number in [${min}, ${max}], got ${value}`);
  }
}

export function validateQueueOperation(input: QueueOperation): void {
  // Widened: callers may pass untyped data (e.g. parsed JSON).
  const kind: string = input.kind;
  if (kind === 'physical') return;
  if (kind !== 'virtual') throw new QueueError(`unknown queue kind: ${kind}`);
  const queue = input as VirtualQueue;
  requireFinite(queue.callAheadSeconds, 'callAheadSeconds', 0, 3600);
  requireFinite(queue.responseEstimateSeconds, 'responseEstimateSeconds', 0, 3600);
  requireInteger(queue.prepareWindowSize, 'prepareWindowSize', 0);
  if (queue.prepareWindowSize > 1000) throw new QueueError('prepareWindowSize must be <= 1000');
  requireInteger(queue.callTimeoutMs, 'callTimeoutMs', 1);
  requireInteger(queue.recallTimeoutMs, 'recallTimeoutMs', 0);
  requireInteger(queue.reactivationWindowMs, 'reactivationWindowMs', 0);
  requireInteger(queue.maxReactivations, 'maxReactivations', 0);
  const position: string = queue.reactivationPosition;
  if (position !== 'ORIGINAL' && position !== 'BACK') {
    throw new QueueError(`unknown reactivationPosition: ${position}`);
  }
}

export function validatePolicy(policy: Policy): void {
  for (const [field, value] of [
    ['id', policy.id],
    ['version', policy.version],
    ['title', policy.title],
  ] as const) {
    if (typeof value !== 'string' || value.length === 0) {
      throw new QueueError(`policy ${field} must be a non-empty string`);
    }
  }
  try {
    validateSelectionParams(policy.selection);
  } catch (error) {
    throw new QueueError(
      `policy ${policy.id}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  validateQueueOperation(policy.queue);
}

/** Size of the committed "prepare" window (always 0 for the physical queue). */
export function prepareWindowSizeOf(queue: QueueOperation): number {
  return queue.kind === 'virtual' ? queue.prepareWindowSize : 0;
}

/**
 * Engine estimate of the time from a call to the start of screening (R). In a virtual queue the
 * passenger walks to the access point and then waits behind the call-ahead buffer, so R is the
 * larger of the response estimate and the call-ahead time. Zero for the physical queue.
 */
export function responseEstimateMs(queue: QueueOperation): Millis {
  if (queue.kind === 'physical') return 0;
  return Math.round(Math.max(queue.responseEstimateSeconds, queue.callAheadSeconds) * 1000);
}

/**
 * Number of passengers to keep in the pipeline beyond the free lanes: the call-ahead seconds of
 * work at the current throughput, rounded up. Zero for the physical queue.
 */
export function callAheadTarget(
  queue: QueueOperation,
  openLanes: number,
  serviceRatePerLanePerHour: number,
): number {
  if (queue.kind === 'physical') return 0;
  return Math.ceil(
    (queue.callAheadSeconds * 1000 * openLanes * serviceRatePerLanePerHour) / MS_PER_HOUR,
  );
}

/** Selection of policy B, version 0 (values are hypotheses to calibrate, see ADR-004). */
export const PRIORITY_V0_SELECTION: ConstrainedEdfSelection = {
  kind: 'constrained-edf',
  capWindowCalls: 10,
  capMaxPriorityCalls: 3,
  maxOvertakes: 15,
  attentionThresholdMs: 15 * MS_PER_MINUTE,
  safetyBufferMs: 5 * MS_PER_MINUTE,
  allowRuleBasedDeadline: true,
  eligibleSegments: ['DEPARTING', 'TRANSFER'],
};

/** Default GateFlow virtual-queue operation (values are hypotheses to calibrate, see ADR-017). */
export const DEFAULT_VIRTUAL_QUEUE: VirtualQueue = {
  kind: 'virtual',
  callAheadSeconds: 180,
  responseEstimateSeconds: 90,
  prepareWindowSize: 10,
  callTimeoutMs: 3 * MS_PER_MINUTE,
  recallTimeoutMs: 2 * MS_PER_MINUTE,
  reactivationWindowMs: 15 * MS_PER_MINUTE,
  maxReactivations: 1,
  reactivationPosition: 'ORIGINAL',
};

/** Policy A: today's physical first-in, first-out queue (status quo). */
export const FIFO_POLICY: Policy = {
  id: 'fifo',
  version: '1.1.0',
  title: 'Physical FIFO queue (status quo, policy A)',
  selection: { kind: 'fifo' },
  queue: { kind: 'physical' },
};

/** GateFlow virtual queue served in FIFO order: isolates the cost of the call mechanics. */
export const VIRTUAL_FIFO_POLICY: Policy = {
  id: 'virtual-fifo',
  version: '0.1.0',
  title: 'GateFlow virtual queue in FIFO order',
  selection: { kind: 'fifo' },
  queue: DEFAULT_VIRTUAL_QUEUE,
};

/** Policy B, version 0: GateFlow virtual queue with constrained EDF priority. */
export const PRIORITY_V0_POLICY: Policy = {
  id: 'priority-v0',
  version: '0.2.0',
  title: 'GateFlow virtual queue with constrained EDF priority v0 (policy B)',
  selection: PRIORITY_V0_SELECTION,
  queue: DEFAULT_VIRTUAL_QUEUE,
};

export const POLICY_PRESETS: readonly Policy[] = [
  FIFO_POLICY,
  VIRTUAL_FIFO_POLICY,
  PRIORITY_V0_POLICY,
];

export function findPolicyPreset(id: string): Policy | undefined {
  return POLICY_PRESETS.find((policy) => policy.id === id);
}

/** Classification parameters of a policy, or `null` when it selects in plain FIFO order. */
export function classificationOf(policy: Policy): ClassificationParams | null {
  const { selection } = policy;
  if (selection.kind === 'fifo') return null;
  return {
    attentionThresholdMs: selection.attentionThresholdMs,
    safetyBufferMs: selection.safetyBufferMs,
    allowRuleBasedDeadline: selection.allowRuleBasedDeadline,
    eligibleSegments: selection.eligibleSegments,
  };
}
