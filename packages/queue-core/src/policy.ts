import { MS_PER_HOUR, MS_PER_MINUTE } from '@gateflow/domain';
import type { Millis } from '@gateflow/domain';
import { validateSelectionParams } from '@gateflow/priority-engine';
import type {
  ClassificationParams,
  ConstrainedEdfSelection,
  FlightCallSelection,
} from '@gateflow/priority-engine';
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
 * Engine estimate of the time from a fast-track call to the start of screening: the walk back to
 * the access point (the response estimate), without the call-ahead buffer, since the party goes to
 * the next free lane. Zero for the physical queue.
 */
export function fastTrackResponseEstimateMs(queue: QueueOperation): Millis {
  if (queue.kind === 'physical') return 0;
  return Math.min(responseEstimateMs(queue), Math.round(queue.responseEstimateSeconds * 1000));
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
  // Engines 0.1-0.2 escalated every ticket that could not keep the whole safety margin.
  feasibilityMarginMs: 5 * MS_PER_MINUTE,
  allowRuleBasedDeadline: true,
  eligibleSegments: ['DEPARTING', 'TRANSFER'],
  latePresentationCutoffMs: null,
  fastTrack: false,
  maxDeadlineAgeMs: null,
  hysteresisMs: 0,
};

/**
 * Selection of policy B, version 1 (ADR-021 to ADR-026). Changes from v0, calibrated on seeds
 * 1001-1020 of the four S3 scenarios (ADR-025):
 * - the cap counts people: at most 10 priority people among any 20 people called, so groups can
 *   be boosted as a whole and the cap no longer binds before the overtake bound;
 * - the overtake bound is 30 people: with it no passenger was delayed more than 10 minutes on any
 *   calibration day, and at most 0.1% more than 5 minutes;
 * - CRITICAL means "cannot make it even without the safety margin" (F = 0): the margin is used to
 *   detect risk early, not to give up on passengers who can still make it;
 * - no late-presentation rule by default: in every scenario it cost flights to genuinely late
 *   passengers and did not protect anyone else (see {@link PRIORITY_V1_STRICT_SELECTION}).
 */
export const PRIORITY_V1_SELECTION: ConstrainedEdfSelection = {
  ...PRIORITY_V0_SELECTION,
  capWindowCalls: 20,
  capMaxPriorityCalls: 10,
  maxOvertakes: 30,
  feasibilityMarginMs: 0,
  latePresentationCutoffMs: null,
};

/**
 * Selection of policy B, version 2 (ADR-027): v1 with the fast track. A priority call is made next,
 * ahead of the prepare window, and the party goes to the next free lane on validating its ticket;
 * every person it passes counts towards K = 30. Calibrated on seeds 1001-1020 with the criterion of
 * ADR-025.
 */
export const PRIORITY_V2_SELECTION: ConstrainedEdfSelection = {
  ...PRIORITY_V1_SELECTION,
  fastTrack: true,
};

/**
 * Selection of policy B, version 3 (ADR-029): v2 with the S5 data-quality rules, calibrated on
 * seeds 1001-1020:
 * - stale data: a deadline the flight feed has not confirmed for more than 30 minutes is not
 *   trusted (the ticket is UNVERIFIED and served in FIFO order) until the feed recovers;
 * - hysteresis of 3 minutes: a ticket escalates at once and returns to a less urgent class only
 *   when its margin exceeds the threshold by 3 minutes, so classes no longer flap with the
 *   seconds-long oscillations of the FIFO estimate.
 */
export const PRIORITY_V3_SELECTION: ConstrainedEdfSelection = {
  ...PRIORITY_V2_SELECTION,
  maxDeadlineAgeMs: 30 * MS_PER_MINUTE,
  hysteresisMs: 3 * MS_PER_MINUTE,
};

/**
 * Policy B v1 with the anti-abuse rule: departing passengers must present at least 45 minutes
 * before the scheduled departure to be boosted automatically (transfers are exempt). For airports
 * that observe passengers arriving late on purpose; it costs flights to genuinely late passengers.
 */
export const PRIORITY_V1_STRICT_SELECTION: ConstrainedEdfSelection = {
  ...PRIORITY_V1_SELECTION,
  latePresentationCutoffMs: 45 * MS_PER_MINUTE,
};

/**
 * Staff practice modelled as baseline A' (ADR-022): every five minutes staff call the flights whose
 * boarding closes within the next 20 minutes, and those passengers are taken first.
 */
export const FLIGHT_CALL_SELECTION: FlightCallSelection = {
  kind: 'flight-call',
  callWindowMs: 20 * MS_PER_MINUTE,
  announcementIntervalMs: 5 * MS_PER_MINUTE,
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

/**
 * Policy A': today's physical queue with staff calling closing flights (an idealised version of
 * the manual handling of urgent passengers: every called passenger comes forward at once).
 */
export const FIFO_MANUAL_POLICY: Policy = {
  id: 'fifo-manual',
  version: '0.1.0',
  title:
    "Physical FIFO queue with staff calling closing flights (status quo with manual handling, policy A')",
  selection: FLIGHT_CALL_SELECTION,
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

/** Policy B, version 1: GateFlow virtual queue with constrained EDF priority v1. */
export const PRIORITY_V1_POLICY: Policy = {
  id: 'priority-v1',
  version: '0.1.0',
  title: 'GateFlow virtual queue with constrained EDF priority v1 (policy B)',
  selection: PRIORITY_V1_SELECTION,
  queue: DEFAULT_VIRTUAL_QUEUE,
};

/** Policy B, version 2: GateFlow virtual queue with constrained EDF priority and the fast track. */
export const PRIORITY_V2_POLICY: Policy = {
  id: 'priority-v2',
  version: '0.1.0',
  title: 'GateFlow virtual queue with constrained EDF priority v2 and fast track (policy B)',
  selection: PRIORITY_V2_SELECTION,
  queue: DEFAULT_VIRTUAL_QUEUE,
};

/**
 * Policy B, version 3: priority v2 that distrusts stale flight data and holds risk classes with
 * hysteresis (ADR-029).
 */
export const PRIORITY_V3_POLICY: Policy = {
  id: 'priority-v3',
  version: '0.1.0',
  title:
    'GateFlow virtual queue with constrained EDF priority v3: fast track, stale-data rule and hysteresis (policy B)',
  selection: PRIORITY_V3_SELECTION,
  queue: DEFAULT_VIRTUAL_QUEUE,
};

/** Policy B v1 with the late-presentation rule (anti-abuse). */
export const PRIORITY_V1_STRICT_POLICY: Policy = {
  id: 'priority-v1-strict',
  version: '0.1.0',
  title: 'GateFlow virtual queue with constrained EDF priority v1 and the late-presentation rule',
  selection: PRIORITY_V1_STRICT_SELECTION,
  queue: DEFAULT_VIRTUAL_QUEUE,
};

export const POLICY_PRESETS: readonly Policy[] = [
  FIFO_POLICY,
  FIFO_MANUAL_POLICY,
  VIRTUAL_FIFO_POLICY,
  PRIORITY_V0_POLICY,
  PRIORITY_V1_POLICY,
  PRIORITY_V1_STRICT_POLICY,
  PRIORITY_V2_POLICY,
  PRIORITY_V3_POLICY,
];

export function findPolicyPreset(id: string): Policy | undefined {
  return POLICY_PRESETS.find((policy) => policy.id === id);
}

/** Classification parameters of a policy, or `null` when it does not classify tickets. */
export function classificationOf(policy: Policy): ClassificationParams | null {
  const { selection } = policy;
  if (selection.kind !== 'constrained-edf') return null;
  return {
    attentionThresholdMs: selection.attentionThresholdMs,
    safetyBufferMs: selection.safetyBufferMs,
    feasibilityMarginMs: selection.feasibilityMarginMs,
    allowRuleBasedDeadline: selection.allowRuleBasedDeadline,
    eligibleSegments: selection.eligibleSegments,
    latePresentationCutoffMs: selection.latePresentationCutoffMs,
    fastTrack: selection.fastTrack,
    maxDeadlineAgeMs: selection.maxDeadlineAgeMs,
    hysteresisMs: selection.hysteresisMs,
  };
}
