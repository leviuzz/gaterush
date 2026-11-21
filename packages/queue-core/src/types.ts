import type { KnownDeadline, Millis, RiskClass, Segment } from '@gateflow/domain';
import type { ReasonCode, SelectionParams } from '@gateflow/priority-engine';

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
export interface Policy {
  readonly id: string;
  readonly version: string;
  readonly title: string;
  readonly selection: SelectionParams;
  readonly queue: QueueOperation;
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
  'ADMITTED' | 'REACTIVATED' | 'EXPIRED' | 'NOT_CALLED' | 'ALREADY_ADMITTED' | 'UNKNOWN_TICKET';

/** Transitions, reported to an optional listener (audit log in production, metrics in simulation). */
export type QueueEvent =
  | { readonly type: 'ISSUED'; readonly ticketId: string; readonly atMs: Millis }
  | {
      readonly type: 'COMMITTED';
      readonly ticketId: string;
      readonly atMs: Millis;
      readonly priority: boolean;
      readonly reasons: readonly ReasonCode[];
    }
  | { readonly type: 'CALLED'; readonly ticketId: string; readonly atMs: Millis }
  | { readonly type: 'RECALLED'; readonly ticketId: string; readonly atMs: Millis }
  | { readonly type: 'NO_SHOW'; readonly ticketId: string; readonly atMs: Millis }
  | { readonly type: 'ADMITTED'; readonly ticketId: string; readonly atMs: Millis }
  | { readonly type: 'REACTIVATED'; readonly ticketId: string; readonly atMs: Millis }
  | { readonly type: 'EXPIRED'; readonly ticketId: string; readonly atMs: Millis };

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
}
