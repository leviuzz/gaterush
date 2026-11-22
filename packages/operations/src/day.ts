import { SEGMENTS } from '@gateflow/domain';
import type { KnownDeadline } from '@gateflow/domain';
import type { CheckpointEstimates } from '@gateflow/priority-engine';
import {
  CheckpointQueue,
  QueueError,
  fastTrackResponseEstimateMs,
  responseEstimateMs,
} from '@gateflow/queue-core';
import type { TicketView } from '@gateflow/queue-core';
import { MANUAL_REASONS, PRESENT_METHODS, TICKET_SOURCES } from './commands';
import type {
  Applied,
  Command,
  CommandRecord,
  CommandResult,
  DayConfig,
  DayLogEvent,
  IssueTicket,
  StaffAction,
  TicketSource,
  TicketSummary,
} from './commands';

/** Why a command was refused. */
export const OPERATION_ERRORS = [
  /** The command is malformed or breaks a rule of the day. */
  'INVALID_COMMAND',
  /** The command is not the next one of the log, or goes back in time. */
  'OUT_OF_ORDER',
  /** The ticket named by the command does not exist on this day. */
  'UNKNOWN_TICKET',
] as const;
export type OperationErrorCode = (typeof OPERATION_ERRORS)[number];

/**
 * A command the day refuses. The day may have applied the timeouts due before the command, so the
 * caller rebuilds it from its log after any error (see `CheckpointDay.replay`).
 */
export class OperationError extends Error {
  constructor(
    readonly code: OperationErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'OperationError';
  }
}

/** What the day keeps about a ticket besides the queue's own record. */
interface TicketInfo {
  readonly number: string;
  readonly opaqueRef: string;
  readonly source: TicketSource;
  readonly flightId: string;
  readonly segment: IssueTicket['segment'];
}

const SERVICE_DAY = /^\d{4}-\d{2}-\d{2}$/;
const PREFIX = /^[A-Z]{1,3}$/;
/** The largest group on one ticket: larger groups are split by staff. */
export const MAX_PARTY_SIZE = 20;

function invalid(message: string): never {
  throw new OperationError('INVALID_COMMAND', message);
}

function requireInteger(value: number, what: string, min: number, max = Number.MAX_SAFE_INTEGER) {
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    invalid(`${what} must be a whole number from ${min} to ${max}, not ${value}`);
  }
}

function validateConfig(config: DayConfig): void {
  if (config.checkpointId.length === 0) invalid('the checkpoint id is empty');
  if (!SERVICE_DAY.test(config.serviceDay)) invalid('the service day must be written YYYY-MM-DD');
  if (!PREFIX.test(config.ticketPrefix))
    invalid('the ticket prefix must be 1 to 3 capital letters');
  if (config.policy.queue.kind !== 'virtual') {
    invalid('the live system runs a virtual queue: a physical queue is only simulated');
  }
  if (config.policy.lanes !== undefined) {
    invalid('extra lanes are simulated; in the live system staff open and close lanes');
  }
  requireInteger(config.lanesOpen, 'lanes open', 1, 200);
  if (!(config.ratePerLanePerHour > 0) || !Number.isFinite(config.ratePerLanePerHour)) {
    invalid('the screening rate of a lane must be a positive number');
  }
  requireInteger(config.processEstimateMs, 'the screening time estimate', 0);
}

function validateDeadline(deadline: KnownDeadline): void {
  if (deadline.source === 'NONE') {
    if (deadline.atMs !== null) invalid('a deadline from no source has no time');
    return;
  }
  // A command read back from a log is not trusted to carry a known source.
  const source: string = deadline.source;
  if (source !== 'FEED' && source !== 'RULE') invalid(`unknown deadline source ${source}`);
  if (deadline.atMs === null || !Number.isSafeInteger(deadline.atMs)) {
    invalid('a known deadline needs a time in whole milliseconds');
  }
  if (deadline.observedAtMs !== undefined && !Number.isSafeInteger(deadline.observedAtMs)) {
    invalid('the observation time of a deadline must be whole milliseconds');
  }
}

/** The engine's estimates for a day: the open lanes and the queue's response times. */
export function estimatesOf(config: DayConfig): CheckpointEstimates {
  return {
    throughputPerHour: config.lanesOpen * config.ratePerLanePerHour,
    processMs: config.processEstimateMs,
    responseMs: responseEstimateMs(config.policy.queue),
    fastTrackResponseMs: fastTrackResponseEstimateMs(config.policy.queue),
  };
}

/**
 * One service day of a checkpoint in the live system. It runs the simulator's queue
 * (`CheckpointQueue`) unchanged: commands go in, the queue's events come out. It reads no clock and
 * draws no random number, so its log of commands rebuilds it exactly (`replay`), wherever and
 * whenever it runs.
 */
export class CheckpointDay {
  readonly config: DayConfig;
  private readonly queue: CheckpointQueue;
  private readonly estimates: CheckpointEstimates;
  private readonly info = new Map<string, TicketInfo>();
  private readonly issueOrder: string[] = [];
  private readonly byNumber = new Map<string, string>();
  private readonly byRef = new Map<string, string>();
  private pending: DayLogEvent[] = [];
  private seq: number;
  private atMs: number;

  private constructor(config: DayConfig, seq: number, atMs: number) {
    validateConfig(config);
    this.config = config;
    this.estimates = estimatesOf(config);
    try {
      this.queue = new CheckpointQueue(config.policy, config.classification, {
        listener: (event) => {
          this.pending.push(event);
        },
      });
    } catch (error) {
      if (error instanceof QueueError) invalid(error.message);
      throw error;
    }
    this.seq = seq;
    this.atMs = atMs;
  }

  /** Opens a day from the first command of its log. */
  static open(record: CommandRecord): { readonly day: CheckpointDay; readonly applied: Applied } {
    if (record.command.type !== 'OPEN_DAY') {
      throw new OperationError('OUT_OF_ORDER', 'a day starts with OPEN_DAY');
    }
    requireInteger(record.seq, 'the sequence number', 1);
    requireInteger(record.atMs, 'the time of the command', 0);
    const day = new CheckpointDay(record.command.config, record.seq, record.atMs);
    const serviceDay = record.command.config.serviceDay;
    return {
      day,
      applied: {
        result: { type: 'DAY_OPENED', serviceDay },
        events: [{ type: 'DAY_OPENED', atMs: record.atMs, serviceDay }],
      },
    };
  }

  /** Rebuilds a day from its log: the same commands give the same day and the same events. */
  static replay(records: readonly CommandRecord[]): CheckpointDay {
    const [first, ...rest] = records;
    if (first === undefined)
      throw new OperationError('OUT_OF_ORDER', 'the log of the day is empty');
    const { day } = CheckpointDay.open(first);
    for (const record of rest) day.apply(record);
    return day;
  }

  /** Sequence number of the last command applied. */
  get lastSeq(): number {
    return this.seq;
  }

  /** Time of the last command applied. */
  get lastAtMs(): number {
    return this.atMs;
  }

  /** Applies the next command of the log. */
  apply(record: CommandRecord): Applied {
    if (record.seq !== this.seq + 1) {
      throw new OperationError(
        'OUT_OF_ORDER',
        `command ${record.seq} is not the next one (${this.seq + 1})`,
      );
    }
    if (!Number.isSafeInteger(record.atMs) || record.atMs < this.atMs) {
      throw new OperationError('OUT_OF_ORDER', 'a command cannot go back in time');
    }
    this.pending = [];
    const result = this.run(record.command, record.atMs);
    this.seq = record.seq;
    this.atMs = record.atMs;
    const events = this.pending;
    this.pending = [];
    return { result, events };
  }

  private run(command: Command, nowMs: number): CommandResult {
    try {
      switch (command.type) {
        case 'OPEN_DAY':
          return invalid('the day is already open');
        case 'ISSUE_TICKET':
          return this.issue(command, nowMs);
        case 'CALL_NEXT': {
          const view = this.queue.callNext(nowMs, this.estimates);
          return { type: 'CALLED', ticket: view === null ? null : this.summaryOf(view) };
        }
        case 'PRESENT': {
          if (!PRESENT_METHODS.includes(command.method)) invalid('unknown way of presenting');
          this.requireTicket(command.ticketId);
          const outcome = this.queue.present(command.ticketId, nowMs, this.estimates);
          return {
            type: 'PRESENTED',
            outcome,
            ticket: this.summaryOf(this.view(command.ticketId)),
          };
        }
        case 'ADVANCE':
          this.queue.advance(nowMs);
          return { type: 'ADVANCED', nextDueMs: this.queue.nextDueMs() };
        case 'RECALL':
        case 'MARK_NO_SHOW':
        case 'REACTIVATE':
        case 'HOLD':
        case 'CANCEL':
          return this.act(command.type, command.ticketId, nowMs);
        case 'ADD_TO_PARTY': {
          this.requireTicket(command.ticketId);
          const size = this.view(command.ticketId).partySize;
          requireInteger(command.people, 'the people joining', 1, MAX_PARTY_SIZE - size);
          if (command.dedupKey !== null && !/^[0-9a-f]{64}$/.test(command.dedupKey)) {
            invalid('the deduplication key must be a hexadecimal SHA-256 HMAC');
          }
          const outcome = this.queue.grow(command.ticketId, command.people, nowMs, this.estimates);
          return {
            type: 'ACTED',
            action: 'ADD_TO_PARTY',
            outcome,
            ticket: this.summaryOf(this.view(command.ticketId)),
          };
        }
        case 'RESOLVE_REVIEW': {
          // A command read back from a log is not trusted to carry a known decision.
          const decision: string = command.decision;
          if (decision !== 'QUEUE' && decision !== 'CANCEL') {
            invalid('a review ends with QUEUE or CANCEL');
          }
          this.requireTicket(command.ticketId);
          const outcome = this.queue.resolve(
            command.ticketId,
            command.decision,
            nowMs,
            this.estimates,
          );
          return {
            type: 'ACTED',
            action: 'RESOLVE_REVIEW',
            outcome,
            ticket: this.summaryOf(this.view(command.ticketId)),
          };
        }
      }
    } catch (error) {
      if (error instanceof QueueError) invalid(error.message);
      throw error;
    }
  }

  private requireTicket(ticketId: string): void {
    if (!this.info.has(ticketId)) {
      throw new OperationError('UNKNOWN_TICKET', `no ticket ${ticketId} today`);
    }
  }

  private act(action: StaffAction, ticketId: string, nowMs: number): CommandResult {
    this.requireTicket(ticketId);
    const queue = this.queue;
    const outcome =
      action === 'RECALL'
        ? queue.recall(ticketId, nowMs, this.estimates)
        : action === 'MARK_NO_SHOW'
          ? queue.markNoShow(ticketId, nowMs, this.estimates)
          : action === 'REACTIVATE'
            ? queue.reactivate(ticketId, nowMs, this.estimates)
            : action === 'HOLD'
              ? queue.hold(ticketId, nowMs, this.estimates)
              : queue.cancel(ticketId, nowMs, this.estimates);
    return { type: 'ACTED', action, outcome, ticket: this.summaryOf(this.view(ticketId)) };
  }

  private issue(command: IssueTicket, nowMs: number): CommandResult {
    if (command.ticketId.length === 0 || this.info.has(command.ticketId)) {
      invalid(`the ticket id ${command.ticketId} is empty or already used`);
    }
    if (command.opaqueRef.length < 16 || this.byRef.has(command.opaqueRef)) {
      invalid('the opaque reference is too short or already used');
    }
    if (!TICKET_SOURCES.includes(command.source)) invalid('unknown ticket source');
    if (!SEGMENTS.includes(command.segment)) invalid('unknown passenger segment');
    if (command.flightId.length === 0) invalid('the flight id is empty');
    requireInteger(command.partySize, 'the party size', 1, MAX_PARTY_SIZE);
    requireInteger(command.walkEstimateMs, 'the walking time estimate', 0);
    if (command.scheduledDepartureMs !== null) {
      requireInteger(command.scheduledDepartureMs, 'the scheduled departure', 0);
    }
    validateDeadline(command.deadline);
    if (command.dedupKey !== null && !/^[0-9a-f]{64}$/.test(command.dedupKey)) {
      invalid('the deduplication key must be a hexadecimal SHA-256 HMAC');
    }
    if (command.reason !== undefined) {
      if (command.source !== 'STAFF') invalid('only a ticket issued by staff has a reason');
      if (!MANUAL_REASONS.includes(command.reason)) invalid('unknown reason for a manual ticket');
    }
    const number = `${this.config.ticketPrefix}${String(this.issueOrder.length + 1).padStart(3, '0')}`;
    const view = this.queue.issue(
      {
        id: command.ticketId,
        segment: command.segment,
        deadline: command.deadline,
        walkEstimateMs: command.walkEstimateMs,
        partySize: command.partySize,
        presentedAtMs: nowMs,
        scheduledDepartureMs: command.scheduledDepartureMs,
        flightId: command.flightId,
      },
      nowMs,
      this.estimates,
    );
    this.info.set(command.ticketId, {
      number,
      opaqueRef: command.opaqueRef,
      source: command.source,
      flightId: command.flightId,
      segment: command.segment,
    });
    this.issueOrder.push(command.ticketId);
    this.byNumber.set(number, command.ticketId);
    this.byRef.set(command.opaqueRef, command.ticketId);
    return { type: 'TICKET_ISSUED', ticket: this.summaryOf(view), opaqueRef: command.opaqueRef };
  }

  private view(ticketId: string): TicketView {
    const view = this.queue.ticket(ticketId);
    if (view === undefined) throw new OperationError('UNKNOWN_TICKET', `no ticket ${ticketId}`);
    return view;
  }

  private summaryOf(view: TicketView): TicketSummary {
    const info = this.info.get(view.id);
    if (info === undefined) throw new OperationError('UNKNOWN_TICKET', `no ticket ${view.id}`);
    return {
      ticketId: view.id,
      number: info.number,
      state: view.state,
      source: info.source,
      flightId: info.flightId,
      segment: info.segment,
      partySize: view.partySize,
      riskClass: view.riskClass ?? view.classAtIssue,
      priority: view.everPrioritized,
      calls: view.calls,
      issuedAtMs: view.issuedAtMs,
      firstCalledAtMs: view.firstCalledAtMs,
      lastCalledAtMs: view.lastCalledAtMs,
      admittedAtMs: view.admittedAtMs,
    };
  }

  /** A ticket of the day. */
  ticket(ticketId: string): TicketSummary | undefined {
    return this.info.has(ticketId) ? this.summaryOf(this.view(ticketId)) : undefined;
  }

  /** The ticket with this public number, e.g. `A012`. */
  ticketByNumber(number: string): TicketSummary | undefined {
    const id = this.byNumber.get(number);
    return id === undefined ? undefined : this.ticket(id);
  }

  /** The ticket with this opaque reference (its QR code or page). */
  ticketByRef(opaqueRef: string): TicketSummary | undefined {
    const id = this.byRef.get(opaqueRef);
    return id === undefined ? undefined : this.ticket(id);
  }

  /** Every ticket of the day, in issue order. */
  tickets(): TicketSummary[] {
    return this.issueOrder.map((id) => this.summaryOf(this.view(id)));
  }

  /** The prepare window, in the order in which its tickets will be called. */
  prepareWindow(): TicketSummary[] {
    return this.queue.prepareWindow().map((view) => this.summaryOf(view));
  }

  /** When the next timeout of the queue is due (a second call, a no-show, an expiry). */
  nextDueMs(): number | null {
    return this.queue.nextDueMs();
  }
}
