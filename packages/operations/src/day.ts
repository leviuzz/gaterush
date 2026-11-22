import { SEGMENTS } from '@gateflow/domain';
import type { KnownDeadline } from '@gateflow/domain';
import type { CheckpointEstimates } from '@gateflow/priority-engine';
import {
  CHECKPOINT_MODES,
  CheckpointQueue,
  QueueError,
  fastTrackResponseEstimateMs,
  responseEstimateMs,
  validatePolicy,
} from '@gateflow/queue-core';
import type { CheckpointMode, Policy, TicketView } from '@gateflow/queue-core';
import { MANUAL_REASONS, PASS_INFANTS, PRESENT_METHODS, TICKET_SOURCES } from './commands';
import type {
  Applied,
  Board,
  BoardCall,
  Command,
  CommandRecord,
  CommandResult,
  DayConfig,
  DayLogEvent,
  IssueTicket,
  OverrideTicket,
  PassInfant,
  SetLanes,
  SetMode,
  StaffAction,
  TicketSource,
  TicketSummary,
  UpdateFlight,
} from './commands';

/** Why a command was refused. */
export const OPERATION_ERRORS = [
  /** The command is malformed or breaks a rule of the day. */
  'INVALID_COMMAND',
  /** The command is not the next one of the log, or goes back in time. */
  'OUT_OF_ORDER',
  /** The ticket named by the command does not exist on this day. */
  'UNKNOWN_TICKET',
  /** The checkpoint is in an emergency: no ticket is issued, no party grows (S17). */
  'EMERGENCY',
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

/** The public number of the `n`-th ticket of a day: `A001`, `A002`... (`A1000` after `A999`). */
export function ticketNumber(prefix: string, n: number): string {
  return `${prefix}${String(n).padStart(3, '0')}`;
}

function invalid(message: string): never {
  throw new OperationError('INVALID_COMMAND', message);
}

function requireInteger(value: number, what: string, min: number, max = Number.MAX_SAFE_INTEGER) {
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    invalid(`${what} must be a whole number from ${min} to ${max}, not ${value}`);
  }
}

/**
 * Checks the infant a pass speaks of: a known one, with the people it brings (an adult with an
 * infant brings two). A command read back from a log is not trusted to carry a known value.
 */
function validateInfant(infant: PassInfant | undefined, people: number): void {
  if (infant === undefined) return;
  const value: string = infant;
  if (!(PASS_INFANTS as readonly string[]).includes(value)) invalid(`unknown infant ${value}`);
  if (infant === 'WITH_INFANT' && people < 2) {
    invalid('an adult with an infant brings two people');
  }
}

/** Checks a mode: a command read back from a log is not trusted to carry a known one. */
function validateMode(mode: CheckpointMode): void {
  const value: string = mode;
  if (!(CHECKPOINT_MODES as readonly string[]).includes(value)) invalid(`unknown mode ${value}`);
}

/**
 * Checks that a policy can run a live checkpoint (S17): a valid policy of a virtual queue, without
 * the simulated lane management. Refused with `INVALID_COMMAND`.
 */
export function validateLivePolicy(policy: Policy): void {
  try {
    validatePolicy(policy);
  } catch (error) {
    // A policy from a request is not trusted to have the shape of one: any failure refuses it.
    invalid(error instanceof Error ? error.message : String(error));
  }
  if (policy.queue.kind !== 'virtual') {
    invalid('the live system runs a virtual queue: a physical queue is only simulated');
  }
  if (policy.lanes !== undefined) {
    invalid('extra lanes are simulated; in the live system staff open and close lanes');
  }
}

function validateConfig(config: DayConfig): void {
  if (config.checkpointId.length === 0) invalid('the checkpoint id is empty');
  if (config.mode !== undefined) validateMode(config.mode);
  if (!SERVICE_DAY.test(config.serviceDay)) invalid('the service day must be written YYYY-MM-DD');
  if (!PREFIX.test(config.ticketPrefix))
    invalid('the ticket prefix must be 1 to 3 capital letters');
  validateLivePolicy(config.policy);
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
  /** The engine's estimates: they follow the lanes open (S17). */
  private estimates: CheckpointEstimates;
  private lanes: number;
  private readonly info = new Map<string, TicketInfo>();
  private readonly issueOrder: string[] = [];
  /** The position of each ticket in the order of issue, from 0. */
  private readonly issueIndex = new Map<string, number>();
  private readonly byNumber = new Map<string, string>();
  private readonly byRef = new Map<string, string>();
  /**
   * For each party with infants (ADR-046): the infants adults' passes declared, less the infants'
   * own passes added. Above zero, infants counted from an adult's pass whose own pass has not come;
   * below zero, infants counted from their own pass whose adult's pass has not come.
   */
  private readonly infants = new Map<string, number>();
  private pending: DayLogEvent[] = [];
  private seq: number;
  private atMs: number;

  private constructor(config: DayConfig, seq: number, atMs: number) {
    validateConfig(config);
    this.config = config;
    this.estimates = estimatesOf(config);
    this.lanes = config.lanesOpen;
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
    const config = record.command.config;
    const day = new CheckpointDay(config, record.seq, record.atMs);
    const serviceDay = config.serviceDay;
    const events: DayLogEvent[] = [{ type: 'DAY_OPENED', atMs: record.atMs, serviceDay }];
    // The mode the previous day ended in goes on (S17): its change is the day's first event.
    if (config.mode !== undefined && config.mode !== 'NORMAL') {
      day.queue.setMode(config.mode, record.atMs, day.estimates);
      events.push(...day.pending);
      day.pending = [];
    }
    return { day, applied: { result: { type: 'DAY_OPENED', serviceDay }, events } };
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

  /** The mode of the checkpoint (S17). */
  get mode(): CheckpointMode {
    return this.queue.mode;
  }

  /** The lanes open (S17): the day's configuration, until the supervisor sets them. */
  get lanesOpen(): number {
    return this.lanes;
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
          this.refuseInEmergency('no ticket is issued');
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
          this.refuseInEmergency('no party grows');
          this.requireTicket(command.ticketId);
          requireInteger(command.people, 'the people joining', 1, MAX_PARTY_SIZE);
          validateInfant(command.infant, command.people);
          if (command.dedupKey !== null && !/^[0-9a-f]{64}$/.test(command.dedupKey)) {
            invalid('the deduplication key must be a hexadecimal SHA-256 HMAC');
          }
          const view = this.view(command.ticketId);
          const growth = this.partyGrowth(command.ticketId, command.people, command.infant);
          if (view.partySize + growth > MAX_PARTY_SIZE) {
            invalid(`a party has at most ${String(MAX_PARTY_SIZE)} people`);
          }
          // An infant counted already joins without growing the party, while it waits.
          const outcome = this.queue.grow(command.ticketId, growth, nowMs, this.estimates);
          if (outcome === 'DONE') this.countInfant(command.ticketId, command.infant);
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
        case 'SET_MODE':
          return this.setMode(command, nowMs);
        case 'OVERRIDE':
          return this.override(command, nowMs);
        case 'SET_LANES':
          return this.setLanes(command);
        case 'UPDATE_FLIGHT':
          return this.updateFlight(command, nowMs);
      }
    } catch (error) {
      if (error instanceof QueueError) invalid(error.message);
      throw error;
    }
  }

  private refuseInEmergency(what: string): void {
    if (this.queue.mode === 'EMERGENCY') {
      throw new OperationError('EMERGENCY', `the checkpoint is in an emergency: ${what}`);
    }
  }

  private setMode(command: SetMode, nowMs: number): CommandResult {
    validateMode(command.mode);
    // A command read back from a log is not trusted to carry a boolean.
    const reset: unknown = command.reset;
    if (typeof reset !== 'boolean') invalid('a change of mode says whether it resets the window');
    const previous = this.queue.mode;
    const outcome = this.queue.setMode(command.mode, nowMs, this.estimates, command.reset);
    return {
      type: 'MODE_SET',
      outcome: outcome === 'DONE' ? 'DONE' : 'NOT_ALLOWED',
      mode: this.queue.mode,
      previous,
      reset: command.reset,
    };
  }

  private override(command: OverrideTicket, nowMs: number): CommandResult {
    this.requireTicket(command.ticketId);
    // The queue refuses an unknown override or reason (a command read back from a log).
    const outcome = this.queue.override(
      command.ticketId,
      command.override,
      command.reason,
      nowMs,
      this.estimates,
    );
    return {
      type: 'OVERRIDDEN',
      override: command.override,
      reason: command.reason,
      outcome: outcome === 'DONE' ? 'DONE' : 'NOT_ALLOWED',
      ticket: this.summaryOf(this.view(command.ticketId)),
    };
  }

  /**
   * The engine's estimates follow the lanes at once; the risk classes follow at its next decision
   * (a ticket issued or called), as in the simulator (S18). An assessment here, which the simulator
   * never makes, would move the reference of the hysteresis and could change a later call. The
   * queue itself is not touched: its timeouts due wait for the next operation, as in the simulator.
   */
  private setLanes(command: SetLanes): CommandResult {
    requireInteger(command.lanesOpen, 'lanes open', 1, 200);
    const previous = this.lanes;
    this.lanes = command.lanesOpen;
    this.estimates = estimatesOf({ ...this.config, lanesOpen: command.lanesOpen });
    return { type: 'LANES_SET', lanesOpen: this.lanes, previous };
  }

  /** What the feed now knows of a flight (S18), for every ticket of the flight still in play. */
  private updateFlight(command: UpdateFlight, nowMs: number): CommandResult {
    if (typeof command.flightId !== 'string' || command.flightId.length === 0) {
      invalid('the flight id is empty');
    }
    if (command.deadline === undefined && command.walkEstimateMs === undefined) {
      invalid('an update of a flight gives its boarding close, its walk, or both');
    }
    if (command.deadline !== undefined) validateDeadline(command.deadline);
    if (command.walkEstimateMs !== undefined) {
      requireInteger(command.walkEstimateMs, 'the walking time estimate', 0);
    }
    const tickets = this.queue.updateFlight(
      command.flightId,
      {
        ...(command.deadline === undefined ? {} : { deadline: command.deadline }),
        ...(command.walkEstimateMs === undefined ? {} : { walkEstimateMs: command.walkEstimateMs }),
      },
      nowMs,
      this.estimates,
    );
    return { type: 'FLIGHT_UPDATED', flightId: command.flightId, tickets };
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
    if (command.presentedAtMs !== undefined) {
      requireInteger(command.presentedAtMs, 'the first presentation', 0, nowMs);
    }
    if (command.dedupKey !== null && !/^[0-9a-f]{64}$/.test(command.dedupKey)) {
      invalid('the deduplication key must be a hexadecimal SHA-256 HMAC');
    }
    if (command.reason !== undefined) {
      if (command.source !== 'STAFF') invalid('only a ticket issued by staff has a reason');
      if (!MANUAL_REASONS.includes(command.reason)) invalid('unknown reason for a manual ticket');
    }
    validateInfant(command.infant, command.partySize);
    const number = ticketNumber(this.config.ticketPrefix, this.issueOrder.length + 1);
    const view = this.queue.issue(
      {
        id: command.ticketId,
        segment: command.segment,
        deadline: command.deadline,
        walkEstimateMs: command.walkEstimateMs,
        partySize: command.partySize,
        presentedAtMs: command.presentedAtMs ?? nowMs,
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
    this.issueIndex.set(command.ticketId, this.issueOrder.length);
    this.issueOrder.push(command.ticketId);
    this.byNumber.set(number, command.ticketId);
    this.byRef.set(command.opaqueRef, command.ticketId);
    this.countInfant(command.ticketId, command.infant);
    return { type: 'TICKET_ISSUED', ticket: this.summaryOf(view), opaqueRef: command.opaqueRef };
  }

  /** Records the infant a pass on the ticket speaks of (ADR-046). */
  private countInfant(ticketId: string, infant: PassInfant | undefined): void {
    if (infant === undefined) return;
    const balance = (this.infants.get(ticketId) ?? 0) + (infant === 'WITH_INFANT' ? 1 : -1);
    if (balance === 0) this.infants.delete(ticketId);
    else this.infants.set(ticketId, balance);
  }

  /**
   * How many people a pass adds to a party (ADR-046): the people it brings, less an infant the
   * party counts already. An adult's pass with an infant whose own pass came first adds the adult;
   * an infant's own pass whose adult declared it adds nobody.
   */
  partyGrowth(ticketId: string, people: number, infant: PassInfant | undefined): number {
    const balance = this.infants.get(ticketId) ?? 0;
    if (infant === 'WITH_INFANT' && balance < 0) return people - 1;
    if (infant === 'INFANT' && balance > 0) return people - 1;
    return people;
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
      overridden: view.overridden,
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

  /**
   * When the passenger of a ticket first presented at the checkpoint (S18): the issue, or an
   * earlier presentation that a ticket issued again kept. A new ticket after an expiry keeps it.
   */
  presentedAtMs(ticketId: string): number | undefined {
    return this.info.has(ticketId) ? this.view(ticketId).presentedAtMs : undefined;
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

  /**
   * What the displays show now (S16): the tickets called (a second call marked), the latest call
   * first, and the prepare window in call order.
   */
  board(): Board {
    // The tickets called whose passengers have not come yet: never every ticket of the day, which
    // grows to thousands while a display shows a few (S18).
    const called = this.queue
      .calledTickets()
      .map((view) => ({
        index: this.issueIndex.get(view.id) ?? 0,
        call: {
          number: this.info.get(view.id)?.number ?? '',
          second: view.state === 'RECALLED',
          calledAtMs: view.lastCalledAtMs ?? view.firstCalledAtMs ?? view.issuedAtMs,
        } satisfies BoardCall,
      }))
      // The latest call first; a tie in the order of issue, the latest number first.
      .sort((a, b) => b.call.calledAtMs - a.call.calledAtMs || b.index - a.index)
      .map((c) => c.call);
    return {
      called,
      prepare: this.queue.prepareWindow().map((view) => this.info.get(view.id)?.number ?? ''),
      mode: this.queue.mode,
    };
  }

  /** When the next timeout of the queue is due (a second call, a no-show, an expiry). */
  nextDueMs(): number | null {
    return this.queue.nextDueMs();
  }
}
