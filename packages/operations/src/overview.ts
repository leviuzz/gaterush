import type { DeadlineSource, Millis } from '@gateflow/domain';
import type { CheckpointMode, TicketState } from '@gateflow/queue-core';
import type { DayLogEvent } from './commands';

/*
 * The figures of a checkpoint's day (S20, ADR-053): what the duty manager sees at a glance. They
 * are worked out by one function from what any source gives: the current state the API keeps,
 * or a replay of the day's log; the two can then be compared. Waits are counted as the simulator
 * counts them: per person, from the first presentation at the checkpoint to the admission.
 */

/** The window of the latest waits: the last hour. */
export const RECENT_WAITS_MS = 60 * 60 * 1000;

/** What the figures read of a ticket. */
export interface OverviewTicket {
  readonly state: TicketState;
  readonly partySize: number;
  /** At the latest assessment (at issue for policies that do not classify). */
  readonly riskClass: string;
  readonly presentedAtMs: Millis;
  readonly admittedAtMs: Millis | null;
  /** People who overtook it while it waited. */
  readonly overtaken: number;
}

/** What the figures read of a flight of the day: where its closing time comes from. */
export interface OverviewFlight {
  readonly source: DeadlineSource;
  /** When the feed last confirmed it; null when it confirms it continuously, or for a rule. */
  readonly observedAtMs: Millis | null;
}

/** The engine's commitments of the day and the supervisors' overrides. */
export interface CallCounts {
  /** Tickets announced, or called through the fast track, by the engine. */
  readonly commitments: number;
  /** Those that jumped the order of arrival. */
  readonly priorityCommitments: number;
  /** People they passed. */
  readonly passedPeople: number;
  /** A supervisor's boost or call now (S17). */
  readonly overrides: number;
}

export interface OverviewInput {
  readonly nowMs: Millis;
  readonly mode: CheckpointMode;
  readonly lanesOpen: number;
  /** Every ticket of the service day. */
  readonly tickets: readonly OverviewTicket[];
  readonly calls: CallCounts;
  /** The policy's bound K on the people who may overtake a ticket; null without one. */
  readonly overtakeBound: number | null;
  /** The policy's stale-data rule (ADR-029); null without one. */
  readonly maxDeadlineAgeMs: number | null;
  /** The flights of the service day. */
  readonly flights: readonly OverviewFlight[];
}

export interface Group {
  readonly tickets: number;
  readonly people: number;
}

/** Durations per person: their median, 90th percentile and largest. */
export interface Spread {
  readonly people: number;
  readonly p50Ms: number;
  readonly p90Ms: number;
  readonly maxMs: number;
}

export const OVERVIEW_ALERTS = [
  'EMERGENCY',
  'CRITICAL_WAITING',
  'CALLS_PAUSED',
  'REVIEWS_PENDING',
  'STALE_FLIGHT_DATA',
  'FIFO_ONLY',
] as const;
export type OverviewAlertCode = (typeof OVERVIEW_ALERTS)[number];

/**
 * A condition the duty manager should see, worked out from the state (S20): nothing is stored
 * and nothing is decided. The recommendations with a decision come with S22.
 */
export interface OverviewAlert {
  readonly code: OverviewAlertCode;
  readonly severity: 'CRITICAL' | 'WARNING' | 'INFO';
  /** How many tickets or flights, when it counts any. */
  readonly count: number | null;
}

export interface Overview {
  readonly nowMs: Millis;
  readonly mode: CheckpointMode;
  readonly lanesOpen: number;
  readonly tickets: {
    readonly waiting: Group;
    readonly prepare: Group;
    /** Called, or called again, and not yet come. */
    readonly called: Group;
    readonly review: Group;
    readonly noShow: Group;
    readonly admitted: Group;
    readonly expired: Group;
    readonly cancelled: Group;
  };
  /** How long the people waiting now (waiting, announced, called) have waited, so far. */
  readonly waitingNow: Spread | null;
  /** The waits of the people admitted: in the last hour, and over the service day. */
  readonly waits: { readonly lastHour: Spread | null; readonly day: Spread | null };
  /** People waiting or announced whose class says they are at risk. */
  readonly atRisk: { readonly ATTENTION: Group; readonly URGENT: Group; readonly CRITICAL: Group };
  readonly fairness: CallCounts & {
    /** The most people who overtook a ticket still in play. */
    readonly mostOvertaken: number;
    readonly overtakeBound: number | null;
  };
  readonly dataQuality: {
    readonly flights: number;
    readonly feed: number;
    readonly rule: number;
    readonly none: number;
    /** The stale-data rule (ADR-029): how long the feed's word holds; null: no rule. */
    readonly staleAfterMs: number | null;
    /** Flights whose closing time the feed has not confirmed within the rule; null: no rule. */
    readonly stale: number | null;
    /** People waiting or announced whose deadline is not trusted. */
    readonly unverified: Group;
  };
  readonly alerts: readonly OverviewAlert[];
}

/** Counts the engine's commitments and the supervisors' overrides among a day's events. */
export function callCountsOf(events: Iterable<DayLogEvent>): CallCounts {
  let commitments = 0;
  let priorityCommitments = 0;
  let passedPeople = 0;
  let overrides = 0;
  for (const event of events) {
    if (event.type === 'COMMITTED') {
      commitments++;
      if (event.priority) priorityCommitments++;
      passedPeople += event.passedPeople;
    } else if (event.type === 'OVERRIDDEN') {
      overrides++;
    }
  }
  return { commitments, priorityCommitments, passedPeople, overrides };
}

/** The quantile of sorted values, by linear interpolation (Hyndman-Fan type 7, as the simulator). */
function quantile(sorted: readonly number[], q: number): number {
  const position = (sorted.length - 1) * q;
  const below = Math.floor(position);
  const above = Math.ceil(position);
  const low = sorted[below] ?? 0;
  const high = sorted[above] ?? low;
  return low + (high - low) * (position - below);
}

/** The spread of durations, each counted once per person of its ticket. */
function spreadOf(
  durations: readonly { readonly ms: number; readonly people: number }[],
): Spread | null {
  const values: number[] = [];
  for (const d of durations) for (let i = 0; i < d.people; i++) values.push(d.ms);
  if (values.length === 0) return null;
  values.sort((a, b) => a - b);
  return {
    people: values.length,
    p50Ms: Math.round(quantile(values, 0.5)),
    p90Ms: Math.round(quantile(values, 0.9)),
    maxMs: values[values.length - 1] ?? 0,
  };
}

const NONE: Group = { tickets: 0, people: 0 };
const add = (group: Group, people: number): Group => ({
  tickets: group.tickets + 1,
  people: group.people + people,
});

/** The figures of a day, from its tickets, its calls and its flights. */
export function overviewOf(input: OverviewInput): Overview {
  const { nowMs } = input;
  const byState: Record<TicketState, Group> = {
    QUEUED: NONE,
    PREPARE: NONE,
    CALLED: NONE,
    RECALLED: NONE,
    NO_SHOW: NONE,
    ADMITTED: NONE,
    EXPIRED: NONE,
    REVIEW: NONE,
    CANCELLED: NONE,
  };
  const atRisk = { ATTENTION: NONE, URGENT: NONE, CRITICAL: NONE };
  let unverified = NONE;
  let mostOvertaken = 0;
  const waitingAges: { ms: number; people: number }[] = [];
  const waitsDay: { ms: number; people: number }[] = [];
  const waitsRecent: { ms: number; people: number }[] = [];
  for (const t of input.tickets) {
    byState[t.state] = add(byState[t.state], t.partySize);
    const waitingForCall = t.state === 'QUEUED' || t.state === 'PREPARE';
    const waitingNow = waitingForCall || t.state === 'CALLED' || t.state === 'RECALLED';
    const inPlay = t.state !== 'ADMITTED' && t.state !== 'EXPIRED' && t.state !== 'CANCELLED';
    if (waitingNow)
      waitingAges.push({ ms: Math.max(0, nowMs - t.presentedAtMs), people: t.partySize });
    if (inPlay) mostOvertaken = Math.max(mostOvertaken, t.overtaken);
    if (waitingForCall) {
      if (t.riskClass === 'ATTENTION' || t.riskClass === 'URGENT' || t.riskClass === 'CRITICAL') {
        atRisk[t.riskClass] = add(atRisk[t.riskClass], t.partySize);
      }
      if (t.riskClass === 'UNVERIFIED') unverified = add(unverified, t.partySize);
    }
    if (t.state === 'ADMITTED' && t.admittedAtMs !== null) {
      const wait = { ms: Math.max(0, t.admittedAtMs - t.presentedAtMs), people: t.partySize };
      waitsDay.push(wait);
      if (t.admittedAtMs > nowMs - RECENT_WAITS_MS) waitsRecent.push(wait);
    }
  }
  const called: Group = {
    tickets: byState.CALLED.tickets + byState.RECALLED.tickets,
    people: byState.CALLED.people + byState.RECALLED.people,
  };
  const sources = { FEED: 0, RULE: 0, NONE: 0 };
  let stale = 0;
  for (const f of input.flights) {
    sources[f.source]++;
    if (
      input.maxDeadlineAgeMs !== null &&
      f.source === 'FEED' &&
      f.observedAtMs !== null &&
      nowMs - f.observedAtMs > input.maxDeadlineAgeMs
    ) {
      stale++;
    }
  }
  const alerts: OverviewAlert[] = [];
  if (input.mode === 'EMERGENCY')
    alerts.push({ code: 'EMERGENCY', severity: 'CRITICAL', count: null });
  if (atRisk.CRITICAL.tickets > 0) {
    alerts.push({ code: 'CRITICAL_WAITING', severity: 'CRITICAL', count: atRisk.CRITICAL.tickets });
  }
  if (input.mode === 'PAUSED')
    alerts.push({ code: 'CALLS_PAUSED', severity: 'WARNING', count: null });
  if (byState.REVIEW.tickets > 0) {
    alerts.push({ code: 'REVIEWS_PENDING', severity: 'WARNING', count: byState.REVIEW.tickets });
  }
  if (stale > 0) alerts.push({ code: 'STALE_FLIGHT_DATA', severity: 'WARNING', count: stale });
  if (input.mode === 'FIFO_ONLY') alerts.push({ code: 'FIFO_ONLY', severity: 'INFO', count: null });
  return {
    nowMs,
    mode: input.mode,
    lanesOpen: input.lanesOpen,
    tickets: {
      waiting: byState.QUEUED,
      prepare: byState.PREPARE,
      called,
      review: byState.REVIEW,
      noShow: byState.NO_SHOW,
      admitted: byState.ADMITTED,
      expired: byState.EXPIRED,
      cancelled: byState.CANCELLED,
    },
    waitingNow: spreadOf(waitingAges),
    waits: { lastHour: spreadOf(waitsRecent), day: spreadOf(waitsDay) },
    atRisk,
    fairness: { ...input.calls, mostOvertaken, overtakeBound: input.overtakeBound },
    dataQuality: {
      flights: input.flights.length,
      feed: sources.FEED,
      rule: sources.RULE,
      none: sources.NONE,
      staleAfterMs: input.maxDeadlineAgeMs,
      stale: input.maxDeadlineAgeMs === null ? null : stale,
      unverified,
    },
    alerts,
  };
}
