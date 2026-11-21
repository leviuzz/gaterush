import type { KnownDeadline, Millis, RiskClass, Segment } from '@gateflow/domain';
import type { ReasonCode } from './reasons';

/** A ticket waiting to be called at a checkpoint, as seen by the engine. */
export interface WaitingTicket {
  /** Unique ticket identifier. */
  readonly id: string;
  /**
   * Issue order at the checkpoint (lower = issued earlier). Defines the FIFO order and must be
   * unique among the waiting tickets.
   */
  readonly fifoKey: number;
  readonly segment: Segment;
  /** The passenger's deadline as known by the system (not necessarily the ground truth). */
  readonly deadline: KnownDeadline;
  /** Estimated walking time from the checkpoint exit to the gate (W). */
  readonly walkEstimateMs: Millis;
  /** How many times this ticket has already been overtaken while waiting. */
  readonly overtakenCount: number;
}

/** Operational estimates for the checkpoint at the time of the decision. */
export interface CheckpointEstimates {
  /** Total nominal throughput of the open lanes, in passengers per hour. Must be > 0. */
  readonly throughputPerHour: number;
  /** Estimated time to get through the checkpoint once called (P). */
  readonly processMs: Millis;
  /** Estimated time for a called passenger to reach the access point (R). */
  readonly responseMs: Millis;
}

/** Parameters that decide how a ticket is classified. */
export interface ClassificationParams {
  /** Slack (under FIFO) below which a ticket is flagged `ATTENTION` (theta_att). */
  readonly attentionThresholdMs: Millis;
  /** Safety margin added to every journey (B). */
  readonly safetyBufferMs: Millis;
  /** Whether deadlines derived from an approved rule (source `RULE`) may drive a boost. */
  readonly allowRuleBasedDeadline: boolean;
  /** Segments that may receive an automatic boost. */
  readonly eligibleSegments: readonly Segment[];
}

/** Plain first-in, first-out (policy A). */
export interface FifoPolicyParams {
  readonly kind: 'fifo';
}

/**
 * Constrained earliest-deadline-first (policy B): boosts `URGENT` tickets in order of their latest
 * useful call time, subject to a cap on priority calls and a bound on overtakes per ticket.
 */
export interface ConstrainedEdfPolicyParams extends ClassificationParams {
  readonly kind: 'constrained-edf';
  /** Size N of the sliding window of calls used by the cap. */
  readonly capWindowCalls: number;
  /** At most k priority calls in any window of N consecutive calls. */
  readonly capMaxPriorityCalls: number;
  /** A ticket is never overtaken more than K times. */
  readonly maxOvertakes: number;
}

export type PolicyParams = FifoPolicyParams | ConstrainedEdfPolicyParams;

/** A named, versioned policy. Versions are immutable: any change to `params` needs a new version. */
export interface Policy {
  readonly id: string;
  readonly version: string;
  readonly title: string;
  readonly params: PolicyParams;
}

/** Everything the engine needs to decide the next call. */
export interface EngineInput {
  readonly nowMs: Millis;
  readonly checkpoint: CheckpointEstimates;
  /** Waiting tickets, in any order (the engine sorts them by `fifoKey` when needed). */
  readonly waiting: readonly WaitingTicket[];
  /**
   * Whether each previous call at this checkpoint was a priority call, oldest first.
   * Only the last N - 1 entries are used.
   */
  readonly recentPriorityCalls: readonly boolean[];
  readonly policy: PolicyParams;
}

/** The engine's explanation of a ticket's situation. */
export interface Assessment {
  readonly ticketId: string;
  readonly riskClass: RiskClass;
  /** Number of waiting tickets ahead of this one in FIFO order. */
  readonly aheadInFifo: number;
  /** Estimated wait until the call if served in FIFO order. */
  readonly fifoWaitEstimateMs: Millis;
  /** Latest instant at which the passenger can be called and still make it (L). */
  readonly latestCallMs: Millis | null;
  /** Margin if served in FIFO order: L - (now + FIFO wait). */
  readonly slackFifoMs: Millis | null;
  /** Margin if called now: L - now. */
  readonly slackNowMs: Millis | null;
  /** True when the ticket may be boosted automatically (URGENT and eligible). */
  readonly boostEligible: boolean;
  readonly reasons: readonly ReasonCode[];
}

/** The engine's decision for the next call. */
export interface Selection {
  readonly ticketId: string;
  readonly fifoKey: number;
  /** Position of the selected ticket in FIFO order, i.e. the number of tickets it overtakes. */
  readonly positionInFifo: number;
  /** True when the call jumps the FIFO order because of urgency (counts against the cap). */
  readonly priorityCall: boolean;
  /** Why this ticket was selected. */
  readonly reasons: readonly ReasonCode[];
  /** Number of boost-eligible URGENT tickets at decision time. */
  readonly urgentCandidates: number;
  /** Assessment of the selected ticket (`null` for the plain FIFO policy). */
  readonly assessment: Assessment | null;
}
