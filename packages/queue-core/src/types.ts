import type { KnownDeadline, Millis, RiskClass, Segment } from '@gateflow/domain';
import type { Assessment, ReasonCode, SelectionParams } from '@gateflow/priority-engine';

/** Life cycle of a ticket. `ADMITTED` and `EXPIRED` are terminal. */
export const TICKET_STATES = [
  /** Waiting in the virtual queue, not yet announced. */
  'QUEUED',
  /** Committed to the "prepare" window shown on displays: it will be called in this order. */
  'PREPARE',
  /** Called: the passenger should present at the access point. */
  'CALLED',
  /** Called a second time after the first timeout. */
  'RECALLED',
  /** Did not present in time; may be reactivated within a window. */
  'NO_SHOW',
  /** Validated at the access point. */
  'ADMITTED',
  /** No-show that was not (or could no longer be) reactivated. */
  'EXPIRED',
  /**
   * Held by staff for a review (S15): out of the order of calls, the ticket keeps its place and
   * goes back to it, or is cancelled, when the review is resolved.
   */
  'REVIEW',
  /** Cancelled by staff: final. */
  'CANCELLED',
] as const;
export type TicketState = (typeof TICKET_STATES)[number];

/** Today's physical queue: nobody is called, the next person in line steps forward. */
export interface PhysicalQueue {
  readonly kind: 'physical';
}

/** GateFlow virtual queue: tickets are called on displays and validated at an access point. */
export interface VirtualQueue {
  readonly kind: 'virtual';
  /**
   * Seconds of lane work kept in the pipeline (called passengers walking to the access point plus
   * passengers waiting at the lanes) beyond the free lanes, to hide the response time to calls.
   */
  readonly callAheadSeconds: number;
  /** Planning estimate of the time from a call to the passenger reaching the access point. */
  readonly responseEstimateSeconds: number;
  /** Number of tickets announced and committed ahead of the waiting list (M). */
  readonly prepareWindowSize: number;
  /** Time after a call before the ticket is called a second time (T1). */
  readonly callTimeoutMs: Millis;
  /** Further time after the second call before the ticket becomes a no-show (T2). */
  readonly recallTimeoutMs: Millis;
  /** A no-show can be reactivated (rescan or operator) within this time. */
  readonly reactivationWindowMs: Millis;
  /** Maximum number of reactivations per ticket (r). */
  readonly maxReactivations: number;
  /** Where a reactivated ticket goes: back to its original place, or to the back of the queue. */
  readonly reactivationPosition: 'ORIGINAL' | 'BACK';
}

export type QueueOperation = PhysicalQueue | VirtualQueue;

/**
 * A named, versioned policy: how the next ticket is selected and how the queue is operated.
 * Versions are immutable: any change to `selection` or `queue` needs a new version.
 */
/**
 * Today's practice for extra lanes (S8): a supervisor looks at the queue every `reviewIntervalMs`.
 * When the wait it shows (people waiting / lanes open x lane rate) exceeds `openWhenWaitMs`, they
 * have one more lane staffed; when it falls below `closeWhenWaitMs`, they send the staff of an
 * extra lane back. They decide again only after `cooldownMs`.
 */
export interface ReactiveLanes {
  readonly kind: 'reactive';
  readonly reviewIntervalMs: Millis;
  readonly openWhenWaitMs: Millis;
  readonly closeWhenWaitMs: Millis;
  readonly cooldownMs: Millis;
}

/**
 * GateFlow's recommendation of extra lanes (S8): every `reviewIntervalMs` it projects the queue
 * over `horizonMs` from the people waiting, the forecast of arrivals (scaled by the arrivals of
 * the last hour) and the lanes that will be open. When the longest projected wait exceeds
 * `targetWaitMs`, it recommends the fewest extra lanes that keep it within the target, counting
 * the time staff need to open them. When one lane fewer would keep it below `closeWhenWaitMs`, it
 * recommends closing an extra lane. The duty manager follows a recommendation or not; nothing is
 * recommended again before `cooldownMs`, and lanes already on their way count as open.
 */
export interface PredictiveLanes {
  readonly kind: 'predict';
  readonly reviewIntervalMs: Millis;
  readonly horizonMs: Millis;
  readonly targetWaitMs: Millis;
  readonly closeWhenWaitMs: Millis;
  readonly cooldownMs: Millis;
}

/** How lanes are opened beyond the plan during the day (S8). */
export type LaneManagement = ReactiveLanes | PredictiveLanes;

export interface Policy {
  readonly id: string;
  readonly version: string;
  readonly title: string;
  readonly selection: SelectionParams;
  readonly queue: QueueOperation;
  /** Extra lanes beyond the plan (S8). Absent: the lanes follow the plan only. */
  readonly lanes?: LaneManagement;
}

/** Data needed to issue a ticket. */
export interface TicketInput {
  readonly id: string;
  readonly segment: Segment;
  readonly deadline: KnownDeadline;
  readonly walkEstimateMs: Millis;
  /** People on the ticket, called together (a group or family scanned together). Default 1. */
  readonly partySize?: number;
  /**
   * When the passenger first presented at the checkpoint. Default: the issue time. A new ticket
   * issued after an expiry keeps the first presentation time.
   */
  readonly presentedAtMs?: Millis;
  /** Scheduled departure of the flight as known by the system (for the presentation rule). */
  readonly scheduledDepartureMs?: Millis | null;
  /** Flight of the ticket: `updateFlight` changes the knowledge of all its tickets at once. */
  readonly flightId?: string;
}

/** New knowledge about a flight, from the flight feed. */
export interface FlightKnowledge {
  readonly deadline?: KnownDeadline;
  readonly walkEstimateMs?: Millis;
}

/** Read-only snapshot of a ticket. */
export interface TicketView {
  readonly id: string;
  readonly fifoKey: number;
  readonly state: TicketState;
  readonly partySize: number;
  readonly presentedAtMs: Millis;
  readonly issuedAtMs: Millis;
  /** Last time the passenger was at the access point: taking the ticket, or rescanning it. */
  readonly lastSeenAtMs: Millis;
  /** The deadline as currently known (it changes with the flight feed). */
  readonly deadline: KnownDeadline;
  readonly walkEstimateMs: Millis;
  /**
   * Risk class under the policy's own parameters at the latest assessment while waiting (`null`
   * for policies that do not classify).
   */
  readonly riskClass: RiskClass | null;
  /** How many times that class changed while the ticket waited (stability). */
  readonly classChanges: number;
  /**
   * Changes of class opposite in direction to the ticket's previous change, e.g. ATTENTION to
   * URGENT and back (flapping).
   */
  readonly classReversals: number;
  /** Risk class when the ticket was issued. */
  readonly classAtIssue: RiskClass;
  /** People who overtook this ticket while it waited (in the queue or in the prepare window). */
  readonly overtakenCount: number;
  /** Number of times the ticket was called (second calls excluded). */
  readonly calls: number;
  readonly firstCalledAtMs: Millis | null;
  readonly lastCalledAtMs: Millis | null;
  readonly noShows: number;
  readonly reactivations: number;
  /** True when the latest commitment jumped the FIFO order because of urgency. */
  readonly priorityCommitment: boolean;
  /**
   * True when the latest commitment went through the fast track: called ahead of the prepare
   * window, the party goes to the next free lane on validating its ticket (ADR-027).
   */
  readonly fastTracked: boolean;
  /** True when any commitment of this ticket was a priority jump. */
  readonly everPrioritized: boolean;
  /** Reasons of the latest commitment. */
  readonly selectionReasons: readonly ReasonCode[];
  readonly admittedAtMs: Millis | null;
}

/** Result of a passenger presenting at the access point (or rescanning). */
export type PresentOutcome =
  | 'ADMITTED'
  | 'REACTIVATED'
  | 'EXPIRED'
  | 'NOT_CALLED'
  | 'ALREADY_ADMITTED'
  | 'UNKNOWN_TICKET'
  /** The ticket is held for a review: staff decide (S15). */
  | 'UNDER_REVIEW'
  | 'CANCELLED';

/**
 * The outcome of a staff action on a ticket (S15): `DONE` when the ticket's state allowed it,
 * `NOT_ALLOWED` otherwise (the ticket is unchanged and no event is reported).
 */
export type StaffActionOutcome = 'DONE' | 'NOT_ALLOWED' | 'UNKNOWN_TICKET';

/** What staff decide at the end of a review: back to the queue at its place, or cancelled. */
export type ReviewDecision = 'QUEUE' | 'CANCEL';

/** Transitions, reported to an optional listener (audit log in production, metrics in simulation). */
export type QueueEvent =
  | { readonly type: 'ISSUED'; readonly ticketId: string; readonly atMs: Millis }
  | {
      /**
       * The engine chose who is called next. The event carries what the decision was based on,
       * so that it can be explained and audited without running the engine again.
       */
      readonly type: 'COMMITTED';
      readonly ticketId: string;
      readonly atMs: Millis;
      /** True when the commitment jumps the FIFO order (by urgency, or by a staff flight call). */
      readonly priority: boolean;
      readonly reasons: readonly ReasonCode[];
      /** Waiting tickets that were ahead of this one in FIFO order and are now passed. */
      readonly passedTickets: number;
      /** People on those tickets. */
      readonly passedPeople: number;
      /**
       * True when the commitment goes through the fast track (ADR-027): it is called ahead of the
       * prepare window and the party then goes to the next free lane.
       */
      readonly fastTrack: boolean;
      /** Boost-eligible URGENT tickets when the decision was taken (see `Selection`). */
      readonly urgentCandidates: number;
      /**
       * The engine's assessment of the chosen ticket at its place in FIFO order (`null` for the
       * selections that do not assess tickets: plain FIFO and staff flight calls).
       */
      readonly assessment: Assessment | null;
    }
  | { readonly type: 'CALLED'; readonly ticketId: string; readonly atMs: Millis }
  | { readonly type: 'RECALLED'; readonly ticketId: string; readonly atMs: Millis }
  | { readonly type: 'NO_SHOW'; readonly ticketId: string; readonly atMs: Millis }
  | { readonly type: 'ADMITTED'; readonly ticketId: string; readonly atMs: Millis }
  | { readonly type: 'REACTIVATED'; readonly ticketId: string; readonly atMs: Millis }
  | { readonly type: 'EXPIRED'; readonly ticketId: string; readonly atMs: Millis }
  /** Staff hold the ticket for a review (S15). */
  | { readonly type: 'REVIEW'; readonly ticketId: string; readonly atMs: Millis }
  /** The review is resolved: the ticket is back in the queue at its place. */
  | { readonly type: 'RELEASED'; readonly ticketId: string; readonly atMs: Millis }
  | { readonly type: 'CANCELLED'; readonly ticketId: string; readonly atMs: Millis };

export type QueueListener = (event: QueueEvent) => void;

export interface QueueStats {
  readonly issued: number;
  readonly commitments: number;
  readonly priorityCommitments: number;
  /** People on the priority commitments. */
  readonly priorityPeople: number;
  /** Commitments made while URGENT tickets existed but the cap was full. */
  readonly capReached: number;
  /** Commitments forced by the overtake guard. */
  readonly overtakeGuard: number;
  readonly calls: number;
  readonly recalls: number;
  readonly noShows: number;
  readonly reactivations: number;
  readonly expirations: number;
  readonly admissions: number;
  /** Changes of the risk class of waiting tickets (stability), over all tickets. */
  readonly classChanges: number;
  /** Changes that reverse the direction of the ticket's previous change (flapping). */
  readonly classReversals: number;
}
