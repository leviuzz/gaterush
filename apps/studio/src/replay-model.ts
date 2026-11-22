import type { Policy } from '@gateflow/queue-core';
import {
  buildTimeline,
  commitmentIndexes,
  daySpan,
  eventIndexAt,
  eventsByParty,
  knownDeadlines,
  missedByClosing,
  pairParties,
  screeningsByLane,
  stateAt,
  summariseDay,
} from '@gateflow/sim-trace';
import type {
  DaySummary,
  PartyPair,
  Screening,
  Timeline,
  TraceDocument,
  TracedRun,
} from '@gateflow/sim-trace';
import { policyName } from './policies';

const MINUTE = 60_000;

/** One policy's day, with every view the replay needs. */
export interface RunView {
  readonly policy: Policy;
  readonly name: string;
  readonly run: TracedRun;
  readonly physical: boolean;
  readonly timeline: Timeline;
  readonly screenings: readonly (readonly Screening[])[];
  /** People who missed their flight, at the time boarding closed. */
  readonly missed: readonly (readonly [number, number])[];
  readonly byParty: readonly (readonly number[])[];
  /** Event indexes of the commitments (every decision of who is called next). */
  readonly commitments: readonly number[];
  /** Times of the commitments, for searching. */
  readonly commitmentTimes: Float64Array;
  readonly known: ReadonlyMap<number, number | null>;
}

/** The series of the charts, sampled every minute of the day. */
export interface Samples {
  readonly times: readonly number[];
  readonly standing: readonly [readonly number[], readonly number[]];
  readonly missed: readonly [readonly number[], readonly number[]];
  readonly lanes: readonly [readonly number[], readonly number[]];
}

export interface ReplayModel {
  readonly doc: TraceDocument;
  readonly reference: RunView;
  readonly candidate: RunView;
  readonly pairs: readonly PartyPair[];
  readonly summary: DaySummary;
  readonly span: { readonly fromMs: number; readonly toMs: number };
  /** Lanes drawn for both policies: the most either has open or in use. */
  readonly lanes: number;
  /** Most people in any stage at any time, for bars on one scale. */
  readonly peak: number;
  /** Flights saved and lost by the candidate, when boarding closed. */
  readonly saved: readonly (readonly [number, number])[];
  readonly harmed: readonly (readonly [number, number])[];
  readonly samples: Samples;
  /** When the reference's queue was longest: where the replay opens. */
  readonly busiestMs: number;
  readonly lanesDiffer: boolean;
}

function runView(doc: TraceDocument, index: 0 | 1): RunView {
  const run = doc.runs[index];
  const policy = doc.manifest.policies[index];
  const physical = policy.queue.kind === 'physical';
  const commitments = commitmentIndexes(run);
  return {
    policy,
    name: policyName(policy.id),
    run,
    physical,
    timeline: buildTimeline(doc.day, run, physical),
    screenings: screeningsByLane(run),
    missed: missedByClosing(doc.day, run),
    byParty: eventsByParty(doc.day, run),
    commitments,
    commitmentTimes: Float64Array.from(commitments, (k) => run.events[k]?.atMs ?? 0),
    known: knownDeadlines(doc.day, run),
  };
}

/** People counted in sorted `steps` up to each of the sorted `times`. */
function cumulative(steps: readonly (readonly [number, number])[], times: readonly number[]) {
  const out: number[] = [];
  let i = 0;
  let total = 0;
  for (const t of times) {
    while (i < steps.length && (steps[i]?.[0] ?? Infinity) <= t) {
      total += steps[i]?.[1] ?? 0;
      i++;
    }
    out.push(total);
  }
  return out;
}

export function replayModel(doc: TraceDocument): ReplayModel {
  const reference = runView(doc, 0);
  const candidate = runView(doc, 1);
  const pairs = pairParties(doc);
  const span = daySpan(doc);
  const times: number[] = [];
  const first = Math.floor(span.fromMs / MINUTE) * MINUTE;
  for (let t = first; t <= span.toMs + MINUTE; t += MINUTE) times.push(t);
  const views = [reference, candidate] as const;
  const standing = views.map((v) => times.map((t) => stateAt(v.timeline, t).standing));
  const lanes = views.map((v) => times.map((t) => stateAt(v.timeline, t).lanesOpen));
  let peak = 1;
  let lanesDrawn = 1;
  for (const v of views) {
    const tl = v.timeline;
    for (let k = 0; k < tl.times.length; k++) {
      const parts = [tl.waiting[k], tl.called[k], tl.absent[k], tl.atLanes[k]];
      for (const part of parts) peak = Math.max(peak, part ?? 0);
      lanesDrawn = Math.max(lanesDrawn, tl.lanesOpen[k] ?? 0);
    }
    lanesDrawn = Math.max(lanesDrawn, v.screenings.length);
  }
  const closing = (category: PartyPair['category']) =>
    pairs
      .filter((p) => p.category === category)
      .map((p): [number, number] => {
        const passenger = doc.day.passengers[p.party];
        const flight = passenger === undefined ? undefined : doc.day.flights[passenger.flightIndex];
        return [flight?.boardingCloseMs ?? 0, passenger?.partySize ?? 0];
      })
      .sort((a, b) => a[0] - b[0]);
  let busiestMs = times[0] ?? 0;
  let busiest = -1;
  standing[0]?.forEach((value, i) => {
    if (value > busiest) {
      busiest = value;
      busiestMs = times[i] ?? busiestMs;
    }
  });
  const lanesDiffer = (lanes[0] ?? []).some((v, i) => v !== (lanes[1] ?? [])[i]);
  return {
    doc,
    reference,
    candidate,
    pairs,
    summary: summariseDay(doc, pairs),
    span,
    lanes: lanesDrawn,
    peak,
    saved: closing('SAVED'),
    harmed: closing('HARMED'),
    samples: {
      times,
      standing: [standing[0] ?? [], standing[1] ?? []],
      missed: [cumulative(reference.missed, times), cumulative(candidate.missed, times)],
      lanes: [lanes[0] ?? [], lanes[1] ?? []],
    },
    busiestMs,
    lanesDiffer,
  };
}

/** Event indexes of the last `count` commitments at or before `atMs` (latest first). */
export function latestCommitments(
  view: RunView,
  atMs: number,
  count: number,
  onlyPriority: boolean,
): number[] {
  let lo = 0;
  let hi = view.commitmentTimes.length - 1;
  let last = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if ((view.commitmentTimes[mid] ?? Infinity) <= atMs) {
      last = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  const out: number[] = [];
  for (let i = last; i >= 0 && out.length < count; i--) {
    const k = view.commitments[i] as number;
    const event = view.run.events[k];
    if (
      !onlyPriority ||
      (event?.type === 'QUEUE' && event.event.type === 'COMMITTED' && event.event.priority)
    ) {
      out.push(k);
    }
  }
  return out;
}

/** Whether a party was called by priority in the commitment being served at `atMs`. */
export function priorityAt(view: RunView, party: number, atMs: number): boolean {
  let priority = false;
  for (const k of view.byParty[party] ?? []) {
    const event = view.run.events[k];
    if (event === undefined || event.atMs > atMs) break;
    if (event.type === 'QUEUE' && event.event.type === 'COMMITTED') priority = event.event.priority;
  }
  return priority;
}

export { eventIndexAt };
