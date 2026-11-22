import { describeReason } from '@gateflow/priority-engine';
import type { ReasonCode } from '@gateflow/priority-engine';
import type { Policy, QueueEvent } from '@gateflow/queue-core';

/*
 * Every call explained in words, from the commitment event alone: what the engine decided, the
 * figures it decided on and the rules that applied. Nothing here runs the engine again.
 */

const MS_PER_MINUTE = 60_000;
const MINUTES_PER_DAY = 24 * 60;

/** A time of the service day (milliseconds since its midnight) as a clock, e.g. "07:42". */
export function clock(ms: number, options: { readonly seconds?: boolean } = {}): string {
  const totalSeconds = Math.floor(ms / 1000);
  const totalMinutes = Math.floor(totalSeconds / 60);
  const day = Math.floor(totalMinutes / MINUTES_PER_DAY);
  const minuteOfDay = totalMinutes - day * MINUTES_PER_DAY;
  const two = (n: number) => String(n).padStart(2, '0');
  const time =
    `${two(Math.floor(minuteOfDay / 60))}:${two(minuteOfDay % 60)}` +
    (options.seconds === true ? `:${two(totalSeconds - totalMinutes * 60)}` : '');
  if (day === 0) return time;
  return `${time} (${day < 0 ? 'day before' : 'next day'})`;
}

/** A duration in minutes with one decimal, e.g. "12.5 min". */
export function minutes(ms: number): string {
  const value = Math.round((ms / MS_PER_MINUTE) * 10) / 10;
  return `${(value === 0 ? 0 : value).toFixed(1)} min`;
}

/** A margin in minutes with its sign, e.g. "+3.0 min" or "-6.5 min". */
export function signedMinutes(ms: number): string {
  const text = minutes(ms);
  return ms > 0 && !text.startsWith('0.0') ? `+${text}` : text;
}

export interface Fact {
  readonly label: string;
  readonly value: string;
}

export interface ReasonNote {
  readonly code: ReasonCode;
  readonly title: string;
  readonly text: string;
}

/** Why a ticket was called when it was, in words. */
export interface Explanation {
  /** The engine's reason for the call. */
  readonly code: ReasonCode;
  readonly title: string;
  readonly text: string;
  /** True when the call jumped the order of arrival. */
  readonly priority: boolean;
  /** The figures the decision was based on. */
  readonly facts: readonly Fact[];
  /** What the engine noted about the ticket (where the closing time came from, rules applied). */
  readonly notes: readonly ReasonNote[];
}

type Commitment = Extract<QueueEvent, { type: 'COMMITTED' }>;

export interface ExplainContext {
  /** The policy that decided. */
  readonly policy: Policy;
  /** When boarding closes as the system knew it at the decision (`null`: unknown). */
  readonly knownDeadlineMs: number | null;
}

/**
 * Where an estimated arrival at the gate falls against boarding close, e.g. "3.8 min before
 * boarding closes".
 */
export function gateMargin(marginMs: number): string {
  return marginMs >= 0
    ? `${minutes(marginMs)} before boarding closes`
    : `${minutes(-marginMs)} after boarding closes`;
}

function note(code: ReasonCode): ReasonNote {
  return { code, ...describeReason(code) };
}

function passedText(commitment: Commitment): string {
  if (commitment.passedTickets === 0) return 'nobody';
  const tickets = `${commitment.passedTickets} ticket${commitment.passedTickets === 1 ? '' : 's'}`;
  return `${tickets} (${commitment.passedPeople} ${commitment.passedPeople === 1 ? 'person' : 'people'})`;
}

/** Explains a commitment of the queue: why this ticket was called next. */
export function explainCommitment(commitment: Commitment, context: ExplainContext): Explanation {
  const code: ReasonCode = commitment.reasons[0] ?? 'FIFO';
  const { title, text } = describeReason(code);
  const facts: Fact[] = [];
  const { selection } = context.policy;
  if (context.knownDeadlineMs !== null) {
    facts.push({ label: 'Boarding closes (as known)', value: clock(context.knownDeadlineMs) });
  } else if (selection.kind !== 'fifo') {
    facts.push({ label: 'Boarding closes (as known)', value: 'unknown' });
  }
  const a = commitment.assessment;
  // The engine's margins keep a safety margin B: adding it back gives the estimated time at the
  // gate before boarding closes.
  const safetyMs = selection.kind === 'constrained-edf' ? selection.safetyBufferMs : 0;
  if (a !== null) {
    facts.push({ label: 'Risk class', value: a.riskClass });
    facts.push({ label: 'Wait in arrival order (estimate)', value: minutes(a.fifoWaitEstimateMs) });
    if (a.slackFifoMs !== null) {
      facts.push({
        label: 'At the gate in arrival order (estimate)',
        value: gateMargin(a.slackFifoMs + safetyMs),
      });
    }
    if (a.slackNowMs !== null) {
      facts.push({
        label: 'At the gate if called now (estimate)',
        value: gateMargin(a.slackNowMs + safetyMs),
      });
    }
    if (a.latestCallMs !== null) {
      facts.push({ label: 'Latest useful call', value: clock(a.latestCallMs) });
    }
  }
  facts.push({ label: 'Called ahead of', value: passedText(commitment) });
  if (commitment.fastTrack) {
    facts.push({ label: 'Fast track', value: 'called next, then the next free lane' });
  }
  if (selection.kind === 'constrained-edf') {
    if (code === 'CAP_REACHED' || code === 'OVERTAKE_ROOM_EXHAUSTED') {
      facts.push({
        label: 'Passengers at risk waiting',
        value: String(commitment.urgentCandidates),
      });
    }
    if (code === 'CAP_REACHED') {
      facts.push({
        label: 'Priority cap',
        value: `${selection.capMaxPriorityCalls} people in any ${selection.capWindowCalls} called`,
      });
    }
    if (code === 'OVERTAKE_LIMIT_GUARD' || code === 'OVERTAKE_ROOM_EXHAUSTED') {
      facts.push({ label: 'Fairness bound K', value: `${selection.maxOvertakes} people` });
    }
    if (a !== null && (code === 'URGENT_FEASIBLE' || a.slackFifoMs !== null)) {
      facts.push({ label: 'Safety margin wanted', value: minutes(selection.safetyBufferMs) });
    }
  }
  const notes = [...commitment.reasons.slice(1), ...(a?.reasons ?? [])].map(note);
  return { code, title, text, priority: commitment.priority, facts, notes };
}
