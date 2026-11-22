import type { KnownDeadline, Millis, Segment } from '@gateflow/domain';
import type { ClassificationParams } from '@gateflow/priority-engine';
import type {
  CheckpointMode,
  Policy,
  PresentOutcome,
  QueueEvent,
  ReviewDecision,
  StaffActionOutcome,
  TicketState,
} from '@gateflow/queue-core';

/**
 * How a checkpoint runs for one service day. Fixed when the day opens and recorded in the log, so
 * that the day can be rebuilt with exactly the same rules.
 */
export interface DayConfig {
  readonly checkpointId: string;
  /** Local date of the service day, `YYYY-MM-DD`. */
  readonly serviceDay: string;
  /** Prefix of the public ticket numbers, e.g. `A` gives A001, A002... */
  readonly ticketPrefix: string;
  /** The policy in force for the day (selection and queue operation). */
  readonly policy: Policy;
  /** Classification used for the risk class of each ticket at issue. */
  readonly classification: ClassificationParams;
  /** Lanes open, and the nominal screening rate of one lane, for the engine's estimates. */
  readonly lanesOpen: number;
  readonly ratePerLanePerHour: number;
  /** The engine's estimate of the screening time of one person. */
  readonly processEstimateMs: Millis;
  /**
   * The mode the day opens in (S17): the mode the previous day ended in, so that an emergency
   * goes on across the start of a service day. Absent for NORMAL, and in logs before S17.
   */
  readonly mode?: CheckpointMode;
}

/** Opens the service day: the first command of a day's log. */
export interface OpenDay {
  readonly type: 'OPEN_DAY';
  readonly config: DayConfig;
}

/** Where a ticket comes from. */
export const TICKET_SOURCES = [
  /** Issued by staff for a passenger (manual ticket). */
  'STAFF',
  /** Issued by a kiosk from a scanned boarding pass. */
  'KIOSK',
] as const;
export type TicketSource = (typeof TICKET_SOURCES)[number];

/**
 * Issues a ticket. Every value is chosen before the command is applied (identifiers, the opaque
 * reference, what is known of the flight), so that replaying the command gives the same ticket.
 */
export interface IssueTicket {
  readonly type: 'ISSUE_TICKET';
  readonly ticketId: string;
  /** Random reference for the passenger's page and QR code: it identifies nobody. */
  readonly opaqueRef: string;
  readonly source: TicketSource;
  readonly flightId: string;
  readonly segment: Segment;
  readonly partySize: number;
  /** When boarding closes, as known when the ticket is issued. */
  readonly deadline: KnownDeadline;
  /** Nominal walking time from the checkpoint to the flight's gate zone. */
  readonly walkEstimateMs: Millis;
  readonly scheduledDepartureMs: Millis | null;
  /**
   * For a ticket from a boarding pass: the HMAC of the pass's flight, check-in sequence and
   * booking reference (ADR-043), so that the same pass scanned again finds this ticket. The pass
   * itself is never recorded. Null for a ticket issued by staff.
   */
  readonly dedupKey: string | null;
  /**
   * Why staff issued the ticket by hand (S15): a coded reason, never free text. Absent from
   * kiosk tickets, and from staff tickets of logs written before S15.
   */
  readonly reason?: ManualReason;
  /**
   * The infant the boarding pass speaks of (ADR-046), if any. An adult's pass with an infant
   * counts the infant in `partySize`; an infant's own pass counts the infant. A party counts each
   * infant once, whichever of the two passes comes first.
   */
  readonly infant?: PassInfant;
}

/**
 * An infant a boarding pass speaks of (ADR-046), from its passenger description: an adult
 * travelling with an infant on the lap (`WITH_INFANT`), or the infant's own pass (`INFANT`).
 */
export const PASS_INFANTS = ['WITH_INFANT', 'INFANT'] as const;
export type PassInfant = (typeof PASS_INFANTS)[number];

/** Why staff issue a ticket by hand (S15). */
export const MANUAL_REASONS = [
  /** The passenger has no boarding pass to scan (a paper ticket, a pass on a dead phone). */
  'NO_BOARDING_PASS',
  /** The kiosk could not read the pass, or sent the passenger to staff. */
  'PASS_UNREADABLE',
  /** A passenger who needs assistance. */
  'ASSISTANCE',
  /** A group or family on one number. */
  'GROUP',
  'OTHER',
] as const;
export type ManualReason = (typeof MANUAL_REASONS)[number];

/** Staff call the next passenger: the engine chooses who. */
export interface CallNext {
  readonly type: 'CALL_NEXT';
}

/** How a ticket was identified at the access point: its number, its QR code, its boarding pass. */
export const PRESENT_METHODS = ['NUMBER', 'REF', 'PASS'] as const;
export type PresentMethod = (typeof PRESENT_METHODS)[number];

/** A passenger presents their ticket at the access point. */
export interface Present {
  readonly type: 'PRESENT';
  readonly ticketId: string;
  readonly method: PresentMethod;
}

/**
 * Applies the timeouts due by now: second calls, no-shows, the expiry of no-shows (S15). The
 * server's scheduler sends it when the day's next timeout is due, so that tickets change state
 * on time even when nobody acts.
 */
export interface Advance {
  readonly type: 'ADVANCE';
}

/** What staff can do to one ticket (S15), and who may reactivate it (a kiosk too). */
export const STAFF_ACTIONS = ['RECALL', 'MARK_NO_SHOW', 'REACTIVATE', 'HOLD', 'CANCEL'] as const;
export type StaffAction = (typeof STAFF_ACTIONS)[number];

/**
 * A staff action on a ticket (S15):
 * - RECALL: call a called passenger again now; the no-show timeout counts from this call;
 * - MARK_NO_SHOW: a called passenger is absent, now;
 * - REACTIVATE: a no-show comes back within its window (by staff, or by a rescan at a kiosk);
 * - HOLD: a waiting ticket is held for a review, keeping its place;
 * - CANCEL: the ticket is cancelled.
 */
export interface ActOnTicket {
  readonly type: StaffAction;
  readonly ticketId: string;
}

/** Staff end a review: back to the queue at its place, or cancelled (S15). */
export interface ResolveReview {
  readonly type: 'RESOLVE_REVIEW';
  readonly ticketId: string;
  readonly decision: ReviewDecision;
}

/**
 * More people join the party of a waiting ticket (S15): at the kiosk, a family scans its other
 * boarding passes onto one number. The HMAC of each pass added is recorded, so that a rescan of it
 * finds the family's number.
 */
export interface AddToParty {
  readonly type: 'ADD_TO_PARTY';
  readonly ticketId: string;
  /**
   * The people the pass brings: 1, or 2 for an adult with an infant (ADR-046). An infant the
   * party counts already, from an adult's pass or from its own, is not counted again: the party
   * grows by `CheckpointDay.partyGrowth`.
   */
  readonly people: number;
  /** The infant the pass speaks of, if any (ADR-046). */
  readonly infant?: PassInfant;
  /** The HMAC of the boarding pass added (ADR-043); null when staff add people by hand. */
  readonly dedupKey: string | null;
}

/**
 * The supervisor sets the mode of the checkpoint (S17, ADR-048):
 * - NORMAL: the policy of the day orders the queue;
 * - FIFO_ONLY: the order of arrival, whatever the policy: the fallback at hand;
 * - PAUSED: nobody is called; kiosks go on issuing, and the timers of those called run;
 * - EMERGENCY: nobody is called and no ticket is issued; the call timers stop, so that nobody
 *   becomes a no-show, and start again where they stopped when the emergency ends.
 * On resuming from PAUSED or EMERGENCY, `reset` announces the prepare window again in order of
 * arrival; without it, the window stays as announced.
 */
export interface SetMode {
  readonly type: 'SET_MODE';
  readonly mode: CheckpointMode;
  readonly reset: boolean;
}

export type Command =
  | OpenDay
  | IssueTicket
  | CallNext
  | Present
  | Advance
  | ActOnTicket
  | ResolveReview
  | AddToParty
  | SetMode;
export type CommandType = Command['type'];

/** A command as recorded in a checkpoint's log: its place in the log and its time. */
export interface CommandRecord {
  /** Position in the checkpoint's log, from 1, without gaps. */
  readonly seq: number;
  /** When the command was applied (epoch milliseconds). Never earlier than the previous one. */
  readonly atMs: Millis;
  readonly command: Command;
}

/** What staff may see of a ticket: no personal data, no opaque reference. */
export interface TicketSummary {
  readonly ticketId: string;
  readonly number: string;
  readonly state: TicketState;
  readonly source: TicketSource;
  readonly flightId: string;
  readonly segment: Segment;
  readonly partySize: number;
  /** Risk class at the latest assessment (at issue for policies that do not classify). */
  readonly riskClass: string;
  /** True when a commitment of the ticket jumped the order of arrival. */
  readonly priority: boolean;
  readonly calls: number;
  readonly issuedAtMs: Millis;
  readonly firstCalledAtMs: Millis | null;
  /** The latest call (a reactivated ticket is called again). */
  readonly lastCalledAtMs: Millis | null;
  readonly admittedAtMs: Millis | null;
}

/** A number called, as the displays show it (S16). */
export interface BoardCall {
  readonly number: string;
  /** The second call: the passenger did not come at the first. */
  readonly second: boolean;
  /** The latest call. */
  readonly calledAtMs: Millis;
}

/**
 * What the displays of a checkpoint show (S16): the numbers called, the latest call first, and
 * the numbers to get ready, in the order they will be called. Numbers only: no personal data.
 */
export interface Board {
  readonly called: readonly BoardCall[];
  readonly prepare: readonly string[];
  /** The mode of the checkpoint (S17): the displays say when calls are paused, or stopped. */
  readonly mode: CheckpointMode;
}

/** What a command did, besides the events it caused. */
export type CommandResult =
  | { readonly type: 'DAY_OPENED'; readonly serviceDay: string }
  | {
      readonly type: 'TICKET_ISSUED';
      readonly ticket: TicketSummary;
      /** The reference printed on the ticket (only in the answer to the issue). */
      readonly opaqueRef: string;
    }
  /** `ticket` is null when nobody is waiting. */
  | { readonly type: 'CALLED'; readonly ticket: TicketSummary | null }
  | {
      readonly type: 'PRESENTED';
      readonly outcome: PresentOutcome;
      readonly ticket: TicketSummary;
    }
  /** The timeouts due were applied; `nextDueMs` is the next one, or null when none is pending. */
  | { readonly type: 'ADVANCED'; readonly nextDueMs: Millis | null }
  | {
      readonly type: 'ACTED';
      readonly action: StaffAction | 'RESOLVE_REVIEW' | 'ADD_TO_PARTY';
      readonly outcome: StaffActionOutcome;
      readonly ticket: TicketSummary;
    }
  /**
   * The mode was set (S17); NOT_ALLOWED, nothing changed: the mode was already that one, or a
   * reset resumed nothing.
   */
  | {
      readonly type: 'MODE_SET';
      readonly outcome: 'DONE' | 'NOT_ALLOWED';
      /** The mode now: the one set or, when NOT_ALLOWED, the one still in force. */
      readonly mode: CheckpointMode;
      readonly previous: CheckpointMode;
      readonly reset: boolean;
    };

/** An event of the day: the queue's own events, and the opening of the day. */
export type DayLogEvent =
  { readonly type: 'DAY_OPENED'; readonly atMs: Millis; readonly serviceDay: string } | QueueEvent;

/** The outcome of one command: what it did and every event it caused, in order. */
export interface Applied {
  readonly result: CommandResult;
  readonly events: readonly DayLogEvent[];
}
