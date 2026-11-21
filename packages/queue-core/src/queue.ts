import { RISK_CLASSES } from '@gateflow/domain';
import type { KnownDeadline, Millis, RiskClass, Segment } from '@gateflow/domain';
import {
  assessTicket,
  selectNext,
  validateCheckpoint,
  validateClassificationParams,
  validateNow,
  validateTicket,
} from '@gateflow/priority-engine';
import type {
  CheckpointEstimates,
  ClassificationParams,
  ConstrainedEdfSelection,
  ReasonCode,
  WaitingTicket,
} from '@gateflow/priority-engine';
import { QueueError, prepareWindowSizeOf, validatePolicy } from './policy';
import type {
  FlightKnowledge,
  Policy,
  PresentOutcome,
  QueueEvent,
  QueueListener,
  QueueStats,
  TicketInput,
  TicketState,
  TicketView,
  VirtualQueue,
} from './types';

/** Internal mutable ticket. Structurally a `WaitingTicket` for the engine. */
interface TicketRecord {
  readonly id: string;
  readonly segment: Segment;
  /** Known deadline and walking time: they change when the flight feed sends news. */
  deadline: KnownDeadline;
  walkEstimateMs: Millis;
  readonly flightId: string | null;
  /** Class at the latest assessment under the policy (hysteresis input); null before any. */
  lastRiskClass: RiskClass | undefined;
  classChanges: number;
  /** Direction of the latest change of class: +1 more urgent, -1 less urgent, 0 none yet. */
  lastChange: -1 | 0 | 1;
  /** Changes of class opposite in direction to the previous change (flapping). */
  classReversals: number;
  /** People on the ticket (a group or family is called together). */
  readonly partySize: number;
  /** When the passenger first presented at the checkpoint (kept across new tickets). */
  readonly presentedAtMs: Millis;
  readonly scheduledDepartureMs: Millis | null;
  fifoKey: number;
  /** People who overtook this ticket while it waited (in the queue or in the prepare window). */
  overtakenCount: number;
  /** Last time the passenger was at the access point: taking the ticket, or rescanning it. */
  lastSeenAtMs: Millis;
  /** Committed by a fast-track priority call (ahead of the prepare window). */
  fastTracked: boolean;
  state: TicketState;
  readonly issuedAtMs: Millis;
  readonly classAtIssue: RiskClass;
  calls: number;
  firstCalledAtMs: Millis | null;
  lastCalledAtMs: Millis | null;
  noShows: number;
  noShowAtMs: Millis | null;
  reactivations: number;
  priorityCommitment: boolean;
  everPrioritized: boolean;
  selectionReasons: readonly ReasonCode[];
  admittedAtMs: Millis | null;
}

/** Rank of a risk class from least to most urgent (`RISK_CLASSES` is in that order). */
function urgencyRank(riskClass: RiskClass): number {
  return RISK_CLASSES.indexOf(riskClass);
}

function view(record: TicketRecord): TicketView {
  return {
    id: record.id,
    fifoKey: record.fifoKey,
    state: record.state,
    partySize: record.partySize,
    presentedAtMs: record.presentedAtMs,
    issuedAtMs: record.issuedAtMs,
    lastSeenAtMs: record.lastSeenAtMs,
    deadline: record.deadline,
    walkEstimateMs: record.walkEstimateMs,
    riskClass: record.lastRiskClass ?? null,
    classChanges: record.classChanges,
    classReversals: record.classReversals,
    classAtIssue: record.classAtIssue,
    overtakenCount: record.overtakenCount,
    calls: record.calls,
    firstCalledAtMs: record.firstCalledAtMs,
    lastCalledAtMs: record.lastCalledAtMs,
    noShows: record.noShows,
    reactivations: record.reactivations,
    priorityCommitment: record.priorityCommitment,
    fastTracked: record.fastTracked,
    everPrioritized: record.everPrioritized,
    selectionReasons: record.selectionReasons,
    admittedAtMs: record.admittedAtMs,
  };
}

/** Number of people on the tickets of `list`. */
function peopleOn(list: readonly TicketRecord[]): number {
  let people = 0;
  for (const record of list) people += record.partySize;
  return people;
}

/** Runs an engine validator, reporting its failure as a {@link QueueError}. */
function check(validate: () => void): void {
  try {
    validate();
  } catch (error) {
    throw new QueueError(error instanceof Error ? error.message : String(error));
  }
}

/** Index at which a ticket with `fifoKey` keeps `list` sorted by fifoKey. */
function insertionIndex(list: readonly TicketRecord[], fifoKey: number): number {
  let lo = 0;
  let hi = list.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if ((list[mid] as TicketRecord).fifoKey < fifoKey) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/**
 * The queue of one checkpoint: a deterministic state machine driven by explicit calls with
 * explicit times. It owns tickets, the "prepare" window, calls, timeouts, no-shows and
 * reactivations, and delegates every ordering decision to the priority engine.
 *
 * It performs no I/O and reads no clock, so the same object runs inside the simulator and,
 * later, inside the operational API (which persists its events).
 *
 * Time never goes backwards: every operation takes a time at or after the previous one.
 *
 * Invariants (checked by property tests):
 * - a ticket is admitted at most once and `ADMITTED`/`EXPIRED` are terminal;
 * - a ticket in the prepare window leaves it only by being called (no churn on displays);
 * - the window never holds more than M tickets, and keeps its order except that a fast-track
 *   priority commitment goes ahead of the tickets that are not fast-tracked;
 * - the engine's cap and overtake bound hold over the sequence of commitments;
 * - events reach the listener in chronological order.
 */
export class CheckpointQueue {
  readonly policy: Policy;
  private readonly classification: ClassificationParams;
  private readonly virtual: VirtualQueue | null;
  private readonly windowSize: number;
  /** Priority calls go through the fast track (ADR-027). */
  private readonly fastTrack: boolean;
  private readonly listener: QueueListener | undefined;
  /** QUEUED tickets, sorted by fifoKey. */
  private readonly waiting: TicketRecord[] = [];
  /** PREPARE tickets, in commitment order. */
  private readonly window: TicketRecord[] = [];
  /** CALLED and RECALLED tickets, in call order. */
  private readonly outstanding: TicketRecord[] = [];
  /** NO_SHOW tickets that may still be reactivated, in no-show order. */
  private readonly noShows: TicketRecord[] = [];
  private readonly byId = new Map<string, TicketRecord>();
  private readonly byFlight = new Map<string, TicketRecord[]>();
  /** The policy's own classification parameters, when it classifies (constrained EDF). */
  private readonly ownClassification: ConstrainedEdfSelection | null;
  private readonly recentPriority: boolean[] = [];
  private readonly historyLimit: number;
  private nextFifoKey = 0;
  private lastNowMs = Number.MIN_SAFE_INTEGER;
  private readonly counters = {
    issued: 0,
    commitments: 0,
    priorityCommitments: 0,
    priorityPeople: 0,
    capReached: 0,
    overtakeGuard: 0,
    calls: 0,
    recalls: 0,
    noShows: 0,
    reactivations: 0,
    expirations: 0,
    admissions: 0,
    classChanges: 0,
    classReversals: 0,
  };

  constructor(
    policy: Policy,
    classification: ClassificationParams,
    options: { readonly listener?: QueueListener } = {},
  ) {
    validatePolicy(policy);
    check(() => {
      validateClassificationParams(classification);
    });
    this.policy = policy;
    this.classification = classification;
    this.virtual = policy.queue.kind === 'virtual' ? policy.queue : null;
    this.windowSize = prepareWindowSizeOf(policy.queue);
    this.fastTrack = policy.selection.kind === 'constrained-edf' && policy.selection.fastTrack;
    this.ownClassification = policy.selection.kind === 'constrained-edf' ? policy.selection : null;
    this.listener = options.listener;
    this.historyLimit =
      policy.selection.kind === 'constrained-edf' ? policy.selection.capWindowCalls : 1;
  }

  /** Tickets waiting in the virtual queue, not yet announced. */
  get waitingCount(): number {
    return this.waiting.length;
  }

  /** Tickets in the prepare window. */
  get windowCount(): number {
    return this.window.length;
  }

  /** Called (or recalled) tickets whose passenger has not presented yet. */
  get outstandingCount(): number {
    return this.outstanding.length;
  }

  /** No-shows that may still be reactivated. */
  get noShowCount(): number {
    return this.noShows.length;
  }

  /** People on the waiting tickets. */
  get waitingPeople(): number {
    return peopleOn(this.waiting);
  }

  /** People on the tickets of the prepare window. */
  get windowPeople(): number {
    return peopleOn(this.window);
  }

  /** People on the called tickets whose passengers have not presented yet. */
  get outstandingPeople(): number {
    return peopleOn(this.outstanding);
  }

  stats(): QueueStats {
    return { ...this.counters };
  }

  ticket(id: string): TicketView | undefined {
    const record = this.byId.get(id);
    return record === undefined ? undefined : view(record);
  }

  /** The prepare window, in the order in which tickets will be called (what displays show). */
  prepareWindow(): TicketView[] {
    return this.window.map(view);
  }

  /** Issues a ticket. Its risk class at issue is computed against everybody already ahead. */
  issue(input: TicketInput, nowMs: Millis, estimates: CheckpointEstimates): TicketView {
    if (typeof input.id !== 'string' || input.id.length === 0) {
      throw new QueueError('ticket id must be a non-empty string');
    }
    if (this.byId.has(input.id)) throw new QueueError(`duplicate ticket id ${input.id}`);
    this.begin(nowMs, estimates);
    const people = {
      partySize: input.partySize ?? 1,
      presentedAtMs: input.presentedAtMs ?? nowMs,
      scheduledDepartureMs: input.scheduledDepartureMs ?? null,
    };
    const asWaiting: WaitingTicket = {
      id: input.id,
      fifoKey: this.nextFifoKey,
      segment: input.segment,
      deadline: input.deadline,
      walkEstimateMs: input.walkEstimateMs,
      overtakenCount: 0,
      lastSeenAtMs: nowMs,
      ...people,
    };
    check(() => {
      validateTicket(asWaiting);
    });
    this.nextFifoKey++;
    const windowPeople = peopleOn(this.window);
    const classAtIssue = assessTicket(
      asWaiting,
      windowPeople + peopleOn(this.waiting),
      nowMs,
      estimates,
      this.classification,
      windowPeople,
    ).riskClass;
    const record: TicketRecord = {
      ...asWaiting,
      ...people,
      flightId: input.flightId ?? null,
      lastRiskClass: undefined,
      classChanges: 0,
      lastChange: 0,
      classReversals: 0,
      lastSeenAtMs: nowMs,
      fastTracked: false,
      state: 'QUEUED',
      issuedAtMs: nowMs,
      classAtIssue,
      calls: 0,
      firstCalledAtMs: null,
      lastCalledAtMs: null,
      noShows: 0,
      noShowAtMs: null,
      reactivations: 0,
      priorityCommitment: false,
      everPrioritized: false,
      selectionReasons: [],
      admittedAtMs: null,
    };
    this.waiting.push(record);
    this.byId.set(record.id, record);
    if (record.flightId !== null) {
      const list = this.byFlight.get(record.flightId);
      if (list === undefined) this.byFlight.set(record.flightId, [record]);
      else list.push(record);
    }
    this.counters.issued++;
    this.emit({ type: 'ISSUED', ticketId: record.id, atMs: nowMs });
    this.refillWindow(nowMs, estimates);
    this.reclassify(nowMs, estimates);
    return view(record);
  }

  /**
   * New knowledge about a flight from the feed (a delay, a gate change, a stale or fresh deadline).
   * It applies to every ticket of the flight that is not admitted or expired; the engine uses it
   * from the next decision on.
   */
  updateFlight(
    flightId: string,
    knowledge: FlightKnowledge,
    nowMs: Millis,
    estimates: CheckpointEstimates,
  ): void {
    this.begin(nowMs, estimates);
    const records = this.byFlight.get(flightId);
    if (records === undefined) return;
    let live = 0;
    for (const record of records) {
      if (record.state === 'ADMITTED' || record.state === 'EXPIRED') continue;
      const updated: WaitingTicket = {
        ...record,
        ...(knowledge.deadline === undefined ? {} : { deadline: knowledge.deadline }),
        ...(knowledge.walkEstimateMs === undefined
          ? {}
          : { walkEstimateMs: knowledge.walkEstimateMs }),
      };
      check(() => {
        validateTicket(updated);
      });
      record.deadline = updated.deadline;
      record.walkEstimateMs = updated.walkEstimateMs;
      records[live++] = record;
    }
    // Tickets that left for good are dropped from the index.
    records.length = live;
  }

  /**
   * Calls the next ticket: the head of the prepare window, or (without a window) the ticket chosen
   * by the engine right now. Returns `null` when nobody is waiting.
   */
  callNext(nowMs: Millis, estimates: CheckpointEstimates): TicketView | null {
    this.begin(nowMs, estimates);
    let record: TicketRecord | undefined;
    if (this.windowSize > 0) {
      this.refillWindow(nowMs, estimates);
      record = this.window.shift();
    } else {
      record = this.commit(nowMs, estimates);
    }
    if (record === undefined) return null;
    record.state = 'CALLED';
    record.calls++;
    record.firstCalledAtMs ??= nowMs;
    record.lastCalledAtMs = nowMs;
    this.outstanding.push(record);
    this.counters.calls++;
    this.emit({ type: 'CALLED', ticketId: record.id, atMs: nowMs });
    if (this.windowSize > 0) this.refillWindow(nowMs, estimates);
    this.reclassify(nowMs, estimates);
    return view(record);
  }

  /**
   * A passenger presents at the access point (or rescans after a no-show).
   *
   * Timeouts strictly before `nowMs` are applied first, so a passenger presenting exactly at a
   * deadline is still on time.
   */
  present(ticketId: string, nowMs: Millis, estimates: CheckpointEstimates): PresentOutcome {
    this.begin(nowMs, estimates);
    const record = this.byId.get(ticketId);
    if (record === undefined) return 'UNKNOWN_TICKET';
    switch (record.state) {
      case 'CALLED':
      case 'RECALLED':
        this.remove(this.outstanding, record);
        record.state = 'ADMITTED';
        record.admittedAtMs = nowMs;
        this.counters.admissions++;
        this.emit({ type: 'ADMITTED', ticketId: record.id, atMs: nowMs });
        return 'ADMITTED';
      case 'NO_SHOW':
        this.reactivate(record, nowMs, estimates);
        return 'REACTIVATED';
      case 'EXPIRED':
        return 'EXPIRED';
      case 'ADMITTED':
        return 'ALREADY_ADMITTED';
      case 'QUEUED':
      case 'PREPARE':
        return 'NOT_CALLED';
    }
  }

  /** Applies every timeout due at or before `nowMs` (second calls, no-shows, expiries). */
  advance(nowMs: Millis): void {
    this.tick(nowMs);
    this.applyTimeouts(nowMs, false);
  }

  /** Time of the next pending timeout, or `null` when none is pending. */
  nextDueMs(): Millis | null {
    return this.nextTimeout()?.atMs ?? null;
  }

  private tick(nowMs: Millis): void {
    check(() => {
      validateNow(nowMs);
    });
    if (nowMs < this.lastNowMs) {
      throw new QueueError(`time went backwards: ${nowMs} < ${this.lastNowMs}`);
    }
    this.lastNowMs = nowMs;
  }

  /** Common prologue of the operations: validates the inputs and applies the timeouts due. */
  private begin(nowMs: Millis, estimates: CheckpointEstimates): void {
    this.tick(nowMs);
    check(() => {
      validateCheckpoint(estimates);
    });
    this.applyTimeouts(nowMs, true);
  }

  private emit(event: QueueEvent): void {
    this.listener?.(event);
  }

  private remove(list: TicketRecord[], record: TicketRecord): void {
    const index = list.indexOf(record);
    if (index < 0) throw new QueueError(`ticket ${record.id} is not where its state says`);
    list.splice(index, 1);
  }

  /** Lets the engine choose among waiting tickets and removes the chosen one from the list. */
  private commit(nowMs: Millis, estimates: CheckpointEstimates): TicketRecord | undefined {
    const selection = selectNext({
      nowMs,
      checkpoint: estimates,
      waiting: this.waiting,
      recentPriorityCalls: this.recentPriority,
      selection: this.policy.selection,
      aheadOfWaiting: peopleOn(this.window),
      aheadMaxOvertakenCount: this.window.reduce((max, r) => Math.max(max, r.overtakenCount), 0),
    });
    if (selection === null) return undefined;
    const position = selection.positionInFifo;
    const record = this.waiting[position];
    if (record?.id !== selection.ticketId) {
      throw new QueueError(`engine selected ${selection.ticketId} at an unexpected position`);
    }
    // Every older ticket is overtaken by all the people of the committed ticket.
    for (let i = 0; i < position; i++) {
      (this.waiting[i] as TicketRecord).overtakenCount += record.partySize;
    }
    this.waiting.splice(position, 1);
    for (let p = 0; p < record.partySize; p++) this.recentPriority.push(selection.priorityCall);
    if (this.recentPriority.length > 2 * this.historyLimit + 64) {
      this.recentPriority.splice(0, this.recentPriority.length - this.historyLimit);
    }
    record.priorityCommitment = selection.priorityCall;
    record.fastTracked = selection.priorityCall && this.fastTrack;
    if (selection.priorityCall) record.everPrioritized = true;
    record.selectionReasons = selection.reasons;
    this.counters.commitments++;
    if (selection.priorityCall) {
      this.counters.priorityCommitments++;
      this.counters.priorityPeople += record.partySize;
    }
    if (selection.reasons.includes('CAP_REACHED')) this.counters.capReached++;
    if (selection.reasons.includes('OVERTAKE_LIMIT_GUARD')) this.counters.overtakeGuard++;
    this.emit({
      type: 'COMMITTED',
      ticketId: record.id,
      atMs: nowMs,
      priority: selection.priorityCall,
      reasons: selection.reasons,
    });
    return record;
  }

  private refillWindow(nowMs: Millis, estimates: CheckpointEstimates): void {
    while (this.window.length < this.windowSize) {
      const record = this.commit(nowMs, estimates);
      if (record === undefined) return;
      record.state = 'PREPARE';
      if (!record.fastTracked) {
        this.window.push(record);
        continue;
      }
      // Fast track: called next, behind earlier fast-track commitments only. Every person it passes
      // in the window is overtaken (the engine checked that none of them exceeds K).
      let index = 0;
      while (index < this.window.length && (this.window[index] as TicketRecord).fastTracked) {
        index++;
      }
      for (let i = index; i < this.window.length; i++) {
        (this.window[i] as TicketRecord).overtakenCount += record.partySize;
      }
      this.window.splice(index, 0, record);
    }
  }

  /**
   * Assesses every waiting ticket under the policy's own parameters and records its class, which
   * the hysteresis of the next decision uses, every change of class and every reversal of
   * direction (stability). Only policies that classify (constrained EDF) are tracked.
   */
  private reclassify(nowMs: Millis, estimates: CheckpointEstimates): void {
    const params = this.ownClassification;
    if (params === null) return;
    const windowPeople = peopleOn(this.window);
    let ahead = windowPeople;
    for (const record of this.waiting) {
      const { riskClass } = assessTicket(record, ahead, nowMs, estimates, params, windowPeople);
      const last = record.lastRiskClass;
      if (last !== undefined && last !== riskClass) {
        const direction = urgencyRank(riskClass) > urgencyRank(last) ? 1 : -1;
        record.classChanges++;
        this.counters.classChanges++;
        if (record.lastChange === -direction) {
          record.classReversals++;
          this.counters.classReversals++;
        }
        record.lastChange = direction;
      }
      record.lastRiskClass = riskClass;
      ahead += record.partySize;
    }
  }

  private reactivate(record: TicketRecord, nowMs: Millis, estimates: CheckpointEstimates): void {
    const v = this.virtual;
    if (v === null) throw new QueueError('no-shows cannot exist in a physical queue');
    this.remove(this.noShows, record);
    record.reactivations++;
    record.lastSeenAtMs = nowMs;
    record.state = 'QUEUED';
    record.priorityCommitment = false;
    record.fastTracked = false;
    if (v.reactivationPosition === 'BACK') {
      record.fifoKey = this.nextFifoKey++;
      record.overtakenCount = 0;
      this.waiting.push(record);
    } else {
      this.waiting.splice(insertionIndex(this.waiting, record.fifoKey), 0, record);
    }
    this.counters.reactivations++;
    this.emit({ type: 'REACTIVATED', ticketId: record.id, atMs: nowMs });
    this.refillWindow(nowMs, estimates);
  }

  private expire(record: TicketRecord, atMs: Millis): void {
    record.state = 'EXPIRED';
    this.counters.expirations++;
    this.emit({ type: 'EXPIRED', ticketId: record.id, atMs });
  }

  /**
   * The earliest pending timeout: a second call, a no-show or the expiry of a no-show. Ties go to
   * the earlier call, then to the earlier no-show, so the order is deterministic.
   */
  private nextTimeout(): { readonly record: TicketRecord; readonly atMs: Millis } | null {
    const v = this.virtual;
    if (v === null) return null;
    let best: TicketRecord | undefined;
    let bestAt = Infinity;
    for (const record of this.outstanding) {
      const calledAt = record.lastCalledAtMs ?? record.issuedAtMs;
      const at =
        record.state === 'CALLED'
          ? calledAt + v.callTimeoutMs
          : calledAt + v.callTimeoutMs + v.recallTimeoutMs;
      if (at < bestAt) {
        bestAt = at;
        best = record;
      }
    }
    for (const record of this.noShows) {
      const at = (record.noShowAtMs ?? record.issuedAtMs) + v.reactivationWindowMs;
      if (at < bestAt) {
        bestAt = at;
        best = record;
      }
    }
    return best === undefined ? null : { record: best, atMs: bestAt };
  }

  /**
   * Applies the timeouts due before (`strict`) or at `nowMs`, one at a time in chronological
   * order. Transitions are stamped with the time at which they were due, not with `nowMs`.
   */
  private applyTimeouts(nowMs: Millis, strict: boolean): void {
    const v = this.virtual;
    if (v === null) return;
    for (;;) {
      const next = this.nextTimeout();
      if (next === null || next.atMs > nowMs || (strict && next.atMs === nowMs)) return;
      const { record, atMs } = next;
      switch (record.state) {
        case 'CALLED':
          record.state = 'RECALLED';
          this.counters.recalls++;
          this.emit({ type: 'RECALLED', ticketId: record.id, atMs });
          break;
        case 'RECALLED':
          this.remove(this.outstanding, record);
          record.state = 'NO_SHOW';
          record.noShows++;
          record.noShowAtMs = atMs;
          this.counters.noShows++;
          this.emit({ type: 'NO_SHOW', ticketId: record.id, atMs });
          if (record.reactivations >= v.maxReactivations) this.expire(record, atMs);
          else this.noShows.push(record);
          break;
        case 'NO_SHOW':
          this.remove(this.noShows, record);
          this.expire(record, atMs);
          break;
        case 'QUEUED':
        case 'PREPARE':
        case 'ADMITTED':
        case 'EXPIRED':
          throw new QueueError(`ticket ${record.id} has a timeout in state ${record.state}`);
      }
    }
  }
}
