import type { Millis } from '@gateflow/domain';

/*
 * GateFlow's recommendations of lanes in a checkpoint's day (S22, ADR-056): what GateFlow advised,
 * what the supervisor decided and what then happened, as commands of the day's log. They never
 * touch the queue. The day keeps the rules, whoever sends the commands: no recommendation while one
 * is open (deduplication), none within 15 minutes of the previous one (cooldown), none within 10
 * minutes of a postponement; one not decided within 15 minutes expires; the outcome is recorded
 * once, 15 minutes after the time the recommendation spoke of.
 */

/** The rules of recommendations in a day. */
export const ADVICE_RULES = {
  /** No recommendation within this of the previous one's. */
  cooldownMs: 15 * 60 * 1000,
  /** Postponed: asked again no sooner than this after the decision. */
  postponeMs: 10 * 60 * 1000,
  /** Not decided within this, a recommendation expires. */
  validForMs: 15 * 60 * 1000,
  /** The outcome is recorded this long after the time the recommendation spoke of. */
  outcomeAfterMs: 15 * 60 * 1000,
} as const;

export const ADVICE_DECISIONS = ['ACCEPT', 'POSTPONE', 'DECLINE'] as const;
export type AdviceDecision = (typeof ADVICE_DECISIONS)[number];

/** Why a supervisor declines a recommendation. */
export const ADVICE_DECLINE_REASONS = ['NO_STAFF', 'NOT_NEEDED', 'OTHER'] as const;
export type AdviceDeclineReason = (typeof ADVICE_DECLINE_REASONS)[number];

export const ADVICE_STATUSES = ['OPEN', 'ACCEPTED', 'POSTPONED', 'DECLINED', 'EXPIRED'] as const;
export type AdviceStatus = (typeof ADVICE_STATUSES)[number];

/** A wait as a forecast gives it, in minutes: the median and the interval. */
export interface AdviceBand {
  readonly p10: number;
  readonly p50: number;
  readonly p90: number;
}

/** What GateFlow advised (S22): the action and everything the alert must say. */
export interface LaneAdviceRecord {
  /** OPEN: open `lanes` lanes; CLOSE: close one lane beyond the plan. */
  readonly action: 'OPEN' | 'CLOSE';
  readonly lanes: number;
  readonly reason: 'WAIT_ABOVE_TARGET' | 'WAIT_LOW_WITH_FEWER_LANES';
  /** Lanes open when advised. */
  readonly lanesOpen: number;
  /** Minutes until the wait is forecast above the target (OPEN); 0 to close now (CLOSE). */
  readonly leadMinutes: number;
  /** Minutes from the recommendation to the time its interval and benefit speak of. */
  readonly atMinutes: number;
  /** The wait of a party arriving then (minutes): as things are, and with the change. */
  readonly waitWithout: AdviceBand;
  readonly waitWith: AdviceBand;
  /** The longest median wait over the next hour (minutes), as things are and with the change. */
  readonly peakWithoutMinutes: number;
  readonly peakWithMinutes: number;
  /** The forecast that made it: its version and its calibration. */
  readonly forecast: string;
}

/** What happened at the time a recommendation spoke of. */
export interface AdviceOutcome {
  /** Lanes open then. */
  readonly lanesOpen: number;
  /** People not yet admitted then. */
  readonly backlog: number;
  /** The median wait of the people admitted in the 15 minutes after (minutes); null: none. */
  readonly waitMinutes: number | null;
  /** People admitted in those 15 minutes. */
  readonly admitted: number;
}

/** GateFlow advises lanes (by the system). */
export interface AdviseLanes {
  readonly type: 'ADVISE_LANES';
  readonly adviceId: string;
  readonly advice: LaneAdviceRecord;
}

/** A supervisor decides on the open recommendation. */
export interface DecideAdvice {
  readonly type: 'DECIDE_ADVICE';
  readonly adviceId: string;
  readonly decision: AdviceDecision;
  /** Required to decline; none otherwise. */
  readonly reason: AdviceDeclineReason | null;
}

/** GateFlow records what happened (by the system). */
export interface RecordAdviceOutcome {
  readonly type: 'RECORD_OUTCOME';
  readonly adviceId: string;
  readonly outcome: AdviceOutcome;
}

/** A recommendation of the day, as it stands at a time. */
export interface AdviceSummary {
  readonly adviceId: string;
  readonly issuedAtMs: Millis;
  readonly advice: LaneAdviceRecord;
  readonly status: AdviceStatus;
  /** The decision and its time; null while open or once expired. */
  readonly decision: {
    readonly decision: AdviceDecision;
    readonly reason: AdviceDeclineReason | null;
    readonly atMs: Millis;
  } | null;
  /** When the outcome is due: 15 minutes after the time the recommendation spoke of. */
  readonly outcomeDueMs: Millis;
  readonly outcome: AdviceOutcome | null;
}

/** Thrown for a command the rules refuse; the day turns it into INVALID_COMMAND. */
export class AdviceRuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AdviceRuleError';
  }
}

function refuse(message: string): never {
  throw new AdviceRuleError(message);
}

const finite = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

function validateBand(band: AdviceBand, what: string): void {
  if (!finite(band.p10) || !finite(band.p50) || !finite(band.p90)) refuse(`${what} is not a band`);
  if (band.p10 < 0 || band.p10 > band.p50 || band.p50 > band.p90) {
    refuse(`${what} is not ordered`);
  }
}

function validateAdvice(advice: LaneAdviceRecord): void {
  // A command read back from a log is not trusted to carry known values.
  const action: string = advice.action;
  if (action !== 'OPEN' && action !== 'CLOSE') refuse('unknown action');
  const reason: string = advice.reason;
  if (reason !== 'WAIT_ABOVE_TARGET' && reason !== 'WAIT_LOW_WITH_FEWER_LANES') {
    refuse('unknown reason');
  }
  if (!Number.isSafeInteger(advice.lanes) || advice.lanes < 1) refuse('at least one lane');
  if (advice.action === 'CLOSE' && advice.lanes !== 1) refuse('one lane is closed at a time');
  if (!Number.isSafeInteger(advice.lanesOpen) || advice.lanesOpen < 1) refuse('lanes open');
  if (advice.action === 'CLOSE' && advice.lanesOpen < 2) refuse('the last lane is never closed');
  for (const [value, what] of [
    [advice.leadMinutes, 'the lead time'],
    [advice.atMinutes, 'the time of the benefit'],
    [advice.peakWithoutMinutes, 'the longest wait'],
    [advice.peakWithMinutes, 'the longest wait with the change'],
  ] as const) {
    if (!finite(value) || value < 0) refuse(`${what} is not a duration`);
  }
  validateBand(advice.waitWithout, 'the wait as things are');
  validateBand(advice.waitWith, 'the wait with the change');
  if (typeof advice.forecast !== 'string' || advice.forecast.length === 0) {
    refuse('the forecast that made it is not named');
  }
}

interface Entry {
  readonly adviceId: string;
  readonly issuedAtMs: number;
  readonly advice: LaneAdviceRecord;
  decision: AdviceSummary['decision'];
  outcome: AdviceOutcome | null;
}

/** The recommendations of a day and their rules. */
export class AdviceBook {
  private readonly entries: Entry[] = [];

  private statusAt(entry: Entry, atMs: number): AdviceStatus {
    if (entry.decision !== null) {
      const decided = entry.decision.decision;
      return decided === 'ACCEPT' ? 'ACCEPTED' : decided === 'POSTPONE' ? 'POSTPONED' : 'DECLINED';
    }
    return atMs >= entry.issuedAtMs + ADVICE_RULES.validForMs ? 'EXPIRED' : 'OPEN';
  }

  /** When GateFlow may advise again, after the latest recommendation; 0 before any. */
  nextAllowedMs(atMs: number): number | null {
    const last = this.entries[this.entries.length - 1];
    if (last === undefined) return 0;
    if (this.statusAt(last, atMs) === 'OPEN') return null;
    let allowed = last.issuedAtMs + ADVICE_RULES.cooldownMs;
    if (last.decision?.decision === 'POSTPONE') {
      allowed = Math.max(allowed, last.decision.atMs + ADVICE_RULES.postponeMs);
    }
    return allowed;
  }

  /** Whether GateFlow may advise at `atMs`: none open, and past the cooldown and a postponement. */
  canAdvise(atMs: number): boolean {
    const allowed = this.nextAllowedMs(atMs);
    return allowed !== null && atMs >= allowed;
  }

  advise(command: AdviseLanes, atMs: number): AdviceSummary {
    if (typeof command.adviceId !== 'string' || command.adviceId.length === 0) {
      refuse('a recommendation has an id');
    }
    if (this.entries.some((e) => e.adviceId === command.adviceId)) refuse('the id is taken');
    validateAdvice(command.advice);
    const allowed = this.nextAllowedMs(atMs);
    if (allowed === null) refuse('a recommendation is open: none is made until it is decided');
    if (atMs < allowed) refuse('too soon after the previous recommendation');
    const entry: Entry = {
      adviceId: command.adviceId,
      issuedAtMs: atMs,
      advice: command.advice,
      decision: null,
      outcome: null,
    };
    this.entries.push(entry);
    return this.summaryOf(entry, atMs);
  }

  decide(command: DecideAdvice, atMs: number): AdviceSummary {
    const entry = this.entries.find((e) => e.adviceId === command.adviceId);
    if (entry === undefined) refuse('no such recommendation');
    const decision: string = command.decision;
    if (!(ADVICE_DECISIONS as readonly string[]).includes(decision)) refuse('unknown decision');
    if (command.decision === 'DECLINE') {
      const reason: unknown = command.reason;
      if (!(ADVICE_DECLINE_REASONS as readonly unknown[]).includes(reason)) {
        refuse('a recommendation is declined with a reason');
      }
    } else if (command.reason !== null) {
      refuse('only a decline gives a reason');
    }
    const status = this.statusAt(entry, atMs);
    if (status !== 'OPEN') refuse(`the recommendation is ${status.toLowerCase()}`);
    entry.decision = { decision: command.decision, reason: command.reason, atMs };
    return this.summaryOf(entry, atMs);
  }

  recordOutcome(command: RecordAdviceOutcome, atMs: number): AdviceSummary {
    const entry = this.entries.find((e) => e.adviceId === command.adviceId);
    if (entry === undefined) refuse('no such recommendation');
    if (entry.outcome !== null) refuse('the outcome is recorded already');
    if (atMs < this.outcomeDueMs(entry)) refuse('the outcome is not due yet');
    const o = command.outcome;
    if (!Number.isSafeInteger(o.lanesOpen) || o.lanesOpen < 1) refuse('lanes open');
    if (!finite(o.backlog) || o.backlog < 0) refuse('people not yet admitted');
    if (!Number.isSafeInteger(o.admitted) || o.admitted < 0) refuse('people admitted');
    if (o.waitMinutes !== null && (!finite(o.waitMinutes) || o.waitMinutes < 0)) {
      refuse('the wait is not a duration');
    }
    if ((o.waitMinutes === null) !== (o.admitted === 0)) refuse('a wait needs people admitted');
    entry.outcome = o;
    return this.summaryOf(entry, atMs);
  }

  private outcomeDueMs(entry: Entry): number {
    return entry.issuedAtMs + entry.advice.atMinutes * 60_000 + ADVICE_RULES.outcomeAfterMs;
  }

  private summaryOf(entry: Entry, atMs: number): AdviceSummary {
    return {
      adviceId: entry.adviceId,
      issuedAtMs: entry.issuedAtMs,
      advice: entry.advice,
      status: this.statusAt(entry, atMs),
      decision: entry.decision,
      outcomeDueMs: this.outcomeDueMs(entry),
      outcome: entry.outcome,
    };
  }

  /** The day's recommendations as they stand at `atMs`, in the order they were made. */
  all(atMs: number): AdviceSummary[] {
    return this.entries.map((e) => this.summaryOf(e, atMs));
  }
}

/**
 * The recommendations of a day from the commands of its log, in order: only the recommendations'
 * are read (they never depend on the queue). A command the rules refuse was never in the log.
 */
export function advicesOfLog(
  records: readonly { readonly atMs: number; readonly command: { readonly type: string } }[],
  atMs: number,
): AdviceSummary[] {
  const book = new AdviceBook();
  for (const record of records) {
    const command = record.command;
    if (command.type === 'ADVISE_LANES') book.advise(command as AdviseLanes, record.atMs);
    else if (command.type === 'DECIDE_ADVICE') book.decide(command as DecideAdvice, record.atMs);
    else if (command.type === 'RECORD_OUTCOME') {
      book.recordOutcome(command as RecordAdviceOutcome, record.atMs);
    }
  }
  return book.all(atMs);
}
