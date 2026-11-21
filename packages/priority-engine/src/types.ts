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
  /**
   * How many people have overtaken this ticket while it waited (a group that overtakes counts as
   * its size).
   */
  readonly overtakenCount: number;
  /** People travelling on this ticket and called together (a group or family). Default 1. */
  readonly partySize?: number;
  /** When the passenger first presented at the checkpoint (used by the presentation rule). */
  readonly presentedAtMs?: Millis;
  /** Scheduled departure of the passenger's flight, as known by the system (presentation rule). */
  readonly scheduledDepartureMs?: Millis | null;
  /**
   * Last time the passenger was at the access point (taking the ticket, or rescanning it). A
   * passenger called sooner after it than their response time answers sooner (ADR-018), which
   * shortens the fast-track estimate. Unknown: no shortening.
   */
  readonly lastSeenAtMs?: Millis;
  /**
   * Risk class at the previous assessment (hysteresis): a ticket returns to a less urgent class
   * only with a margin of `hysteresisMs`. Unknown: no hysteresis for this ticket.
   */
  readonly lastRiskClass?: RiskClass;
}

/** Operational estimates for the checkpoint at the time of the decision. */
export interface CheckpointEstimates {
  /** Total nominal throughput of the open lanes, in passengers per hour. Must be > 0. */
  readonly throughputPerHour: number;
  /** Estimated time to get through the checkpoint once called (P). */
  readonly processMs: Millis;
  /** Estimated time from the call to the start of screening (R). */
  readonly responseMs: Millis;
  /**
   * Estimated time from a fast-track call to the start of screening: the walk back to the access
   * point, without the call-ahead buffer at the lanes. Default: `responseMs`.
   */
  readonly fastTrackResponseMs?: Millis;
}

/** Parameters that decide how a ticket is classified and whether it may be boosted. */
export interface ClassificationParams {
  /** Slack (under FIFO) below which a ticket is flagged `ATTENTION` (theta_att). */
  readonly attentionThresholdMs: Millis;
  /** Safety margin added to every journey to detect risk early (B). */
  readonly safetyBufferMs: Millis;
  /**
   * Margin that a passenger selected now must still have to be boosted automatically (F); below
   * it the ticket is CRITICAL and escalated instead. Engines 0.1 and 0.2 used F = B. With F < B
   * the engine also boosts passengers who would make it only by using part of the safety margin.
   */
  readonly feasibilityMarginMs: Millis;
  /** Whether deadlines derived from an approved rule (source `RULE`) may drive a boost. */
  readonly allowRuleBasedDeadline: boolean;
  /** Segments that may receive an automatic boost. */
  readonly eligibleSegments: readonly Segment[];
  /**
   * Departing passengers who presented at the checkpoint less than this long before their
   * scheduled departure are never boosted automatically (anti-abuse rule; transfers are exempt).
   * `null`: no such rule.
   */
  readonly latePresentationCutoffMs: Millis | null;
  /**
   * Fast track (ADR-027): a priority call is made next, ahead of the committed window, and the
   * party goes to the next free lane on validating its ticket. The engine then estimates a boosted
   * journey with the fast-track response time (shortened for a passenger who has just been at the
   * access point) and without the time to call the committed window. Every person the fast track
   * passes, in the window or at the lanes, counts towards the overtake bound K.
   */
  readonly fastTrack: boolean;
  /**
   * Stale-data rule (ADR-029): a deadline last confirmed by its source more than this long ago is
   * not trusted (the ticket is UNVERIFIED and served in FIFO order). `null`: no such rule.
   */
  readonly maxDeadlineAgeMs: Millis | null;
  /**
   * Hysteresis h (ADR-029): a move to a more urgent class is immediate, a move back to a less
   * urgent one needs the margin to exceed its threshold by h. 0: no hysteresis.
   */
  readonly hysteresisMs: Millis;
}

/** Plain first-in, first-out order. */
export interface FifoSelection {
  readonly kind: 'fifo';
}

/**
 * Constrained earliest-deadline-first: boosts `URGENT` tickets in order of their latest useful call
 * time, subject to a cap on priority calls and a bound on overtakes per ticket. Both count people:
 * a group counts as its size.
 */
export interface ConstrainedEdfSelection extends ClassificationParams {
  readonly kind: 'constrained-edf';
  /** Size N, in people, of the sliding window used by the cap. */
  readonly capWindowCalls: number;
  /** At most k people called by priority in any window of N consecutive people called. */
  readonly capMaxPriorityCalls: number;
  /** A ticket is never overtaken by more than K people. */
  readonly maxOvertakes: number;
}

/**
 * Today's manual practice, used as baseline A' in simulation: staff periodically announce the
 * flights whose boarding closes soon, and the passengers of those flights are taken first, earliest
 * boarding close first. There is no cap and no overtake bound.
 */
export interface FlightCallSelection {
  readonly kind: 'flight-call';
  /** Flights whose known boarding close is at most this long after the announcement are called. */
  readonly callWindowMs: Millis;
  /** Announcements happen at every multiple of this interval since midnight. */
  readonly announcementIntervalMs: Millis;
}

/** How the next ticket is chosen. Combined with queue operation rules into a policy by queue-core. */
export type SelectionParams = FifoSelection | ConstrainedEdfSelection | FlightCallSelection;

/** Everything the engine needs to decide the next call. */
export interface EngineInput {
  readonly nowMs: Millis;
  readonly checkpoint: CheckpointEstimates;
  /** Waiting tickets, in any order (the engine sorts them by `fifoKey` when needed). */
  readonly waiting: readonly WaitingTicket[];
  /**
   * For each person previously called at this checkpoint, whether they were called by priority,
   * oldest first (a group adds one entry per person). Only the last N - 1 entries are used.
   */
  readonly recentPriorityCalls: readonly boolean[];
  readonly selection: SelectionParams;
  /**
   * People already committed to be called before every waiting ticket (e.g. the "prepare" window
   * shown on displays). They count as people ahead in FIFO wait estimates. Default 0.
   */
  readonly aheadOfWaiting?: number;
  /**
   * Largest overtake count among the people committed ahead of the waiting list. A fast-track call
   * passes them too, so it is allowed only while none of them would exceed K. Default 0.
   */
  readonly aheadMaxOvertakenCount?: number;
}

/** The engine's explanation of a ticket's situation. */
export interface Assessment {
  readonly ticketId: string;
  readonly riskClass: RiskClass;
  /** People ahead of this ticket in FIFO order (committed ones included). */
  readonly aheadInFifo: number;
  /** Estimated wait until the call if served in FIFO order. */
  readonly fifoWaitEstimateMs: Millis;
  /**
   * Latest instant at which the passenger can be called by priority and still make it with the
   * margin B (L). Under the fast track the journey is the fast-track one.
   */
  readonly latestCallMs: Millis | null;
  /**
   * Margin if served in FIFO order: deadline - (R + P + W + B) - now - FIFO wait, always with the
   * journey through the queue.
   */
  readonly slackFifoMs: Millis | null;
  /**
   * Margin if selected now: L - now - C, where C is the time to call the committed tickets that
   * cannot be overtaken (zero without a prepare window, and zero with the fast track).
   */
  readonly slackNowMs: Millis | null;
  /**
   * Margin if selected now, measured with the feasibility margin F instead of B:
   * deadline - (R + P + W + F) - now - C, with the fast-track R and C = 0 under the fast track.
   * Negative means CRITICAL.
   */
  readonly feasibilitySlackMs: Millis | null;
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
  /** True when the call jumps the FIFO order (by urgency, or by a staff flight call). */
  readonly priorityCall: boolean;
  /** Why this ticket was selected. */
  readonly reasons: readonly ReasonCode[];
  /**
   * Number of boost-eligible URGENT tickets at decision time (for `flight-call`, the number of
   * waiting tickets of called flights).
   */
  readonly urgentCandidates: number;
  /** Assessment of the selected ticket (`null` for selections that do not assess tickets). */
  readonly assessment: Assessment | null;
}
