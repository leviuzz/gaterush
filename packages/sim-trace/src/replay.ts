import type { DayEvent, Population } from '@gateflow/sim-model';
import type { QueueEvent } from '@gateflow/queue-core';
import type { TraceDocument, TracedRun } from './document';

/*
 * Views of a traced day, all computed from its events: the event log is the record, every view a
 * projection of it (the operational product will build its console the same way from its own log).
 */

/** Where a party is during the day. */
export type Stage =
  /** Not at the checkpoint yet. */
  | 'NOT_ARRIVED'
  /** Holds a ticket not yet called: free to wait anywhere (virtual queue) or in line (physical). */
  | 'WAITING'
  /** Called, on the way to the access point. */
  | 'CALLED'
  /** Missed the call (a no-show), not back yet. */
  | 'ABSENT'
  /** Past the access point, or taken there by staff (assisted), waiting for a lane. */
  | 'AT_LANES'
  | 'SCREENING'
  /** Screened: on the way to the gate. */
  | 'DONE';

/** The checkpoint after each event of a run, in people (a group counts as its size). */
export interface Timeline {
  readonly policyId: string;
  /** Physical queue: the people waiting stand in line. */
  readonly physical: boolean;
  /** Time of each event; the state at index k holds from `times[k]` until the next event. */
  readonly times: Float64Array;
  readonly waiting: Int32Array;
  readonly called: Int32Array;
  readonly absent: Int32Array;
  readonly atLanes: Int32Array;
  readonly screening: Int32Array;
  readonly done: Int32Array;
  readonly lanesOpen: Int16Array;
  readonly extraLanes: Int16Array;
}

/** The checkpoint at one moment. */
export interface CheckpointState {
  readonly atMs: number;
  readonly waiting: number;
  readonly called: number;
  readonly absent: number;
  readonly atLanes: number;
  readonly screening: number;
  readonly done: number;
  /** People standing in a queue: in line (physical queue) or at the lanes. */
  readonly standing: number;
  readonly lanesOpen: number;
  readonly extraLanes: number;
}

/** The stage a party moves to on an event of the queue, or `null` when it stays. */
function stageAfterQueueEvent(event: QueueEvent): Stage | null {
  switch (event.type) {
    case 'ISSUED':
    case 'REACTIVATED':
      return 'WAITING';
    case 'CALLED':
      return 'CALLED';
    case 'NO_SHOW':
      return 'ABSENT';
    case 'ADMITTED':
      return 'AT_LANES';
    case 'COMMITTED':
    case 'RECALLED':
    case 'EXPIRED':
      return null;
  }
}

/** Builds the timeline of a run from its events. */
export function buildTimeline(day: Population, run: TracedRun, physical: boolean): Timeline {
  const n = run.events.length;
  const timeline = {
    policyId: run.policyId,
    physical,
    times: new Float64Array(n),
    waiting: new Int32Array(n),
    called: new Int32Array(n),
    absent: new Int32Array(n),
    atLanes: new Int32Array(n),
    screening: new Int32Array(n),
    done: new Int32Array(n),
    lanesOpen: new Int16Array(n),
    extraLanes: new Int16Array(n),
  };
  const stage: Stage[] = day.passengers.map(() => 'NOT_ARRIVED');
  const people: Record<Stage, number> = {
    NOT_ARRIVED: 0,
    WAITING: 0,
    CALLED: 0,
    ABSENT: 0,
    AT_LANES: 0,
    SCREENING: 0,
    DONE: 0,
  };
  for (const p of day.passengers) people.NOT_ARRIVED += p.partySize;
  let lanesOpen = 0;
  let extraLanes = 0;
  const move = (party: number, to: Stage): void => {
    const size = day.passengers[party]?.partySize ?? 0;
    const from = stage[party] ?? 'NOT_ARRIVED';
    people[from] -= size;
    people[to] += size;
    stage[party] = to;
  };
  run.events.forEach((event, k) => {
    switch (event.type) {
      case 'ARRIVED':
        // A queue party takes its ticket at once (the queue's ISSUED event follows).
        if (day.passengers[event.party]?.path === 'ASSISTED') move(event.party, 'AT_LANES');
        break;
      case 'QUEUE': {
        const to = stageAfterQueueEvent(event.event);
        if (to !== null) move(event.party, to);
        break;
      }
      case 'SCREENING_STARTED':
        move(event.party, 'SCREENING');
        break;
      case 'SCREENING_ENDED':
        move(event.party, 'DONE');
        break;
      case 'LANES':
        lanesOpen = event.open;
        extraLanes = event.extra;
        break;
      case 'LANE_DECISION':
      case 'FEED_DOWN':
      case 'FEED_UP':
      case 'FLIGHT_KNOWN':
        break;
    }
    timeline.times[k] = event.atMs;
    timeline.waiting[k] = people.WAITING;
    timeline.called[k] = people.CALLED;
    timeline.absent[k] = people.ABSENT;
    timeline.atLanes[k] = people.AT_LANES;
    timeline.screening[k] = people.SCREENING;
    timeline.done[k] = people.DONE;
    timeline.lanesOpen[k] = lanesOpen;
    timeline.extraLanes[k] = extraLanes;
  });
  return timeline;
}

/** Index of the last event at or before `atMs` (-1 before the first event). */
export function eventIndexAt(timeline: Timeline, atMs: number): number {
  let lo = 0;
  let hi = timeline.times.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if ((timeline.times[mid] ?? Infinity) <= atMs) {
      found = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return found;
}

/** The checkpoint at `atMs`: after every event up to that moment. */
export function stateAt(timeline: Timeline, atMs: number): CheckpointState {
  const k = eventIndexAt(timeline, atMs);
  const at = (values: Int32Array | Int16Array) => (k < 0 ? 0 : (values[k] ?? 0));
  const waiting = at(timeline.waiting);
  const atLanes = at(timeline.atLanes);
  return {
    atMs,
    waiting,
    called: at(timeline.called),
    absent: at(timeline.absent),
    atLanes,
    screening: at(timeline.screening),
    done: at(timeline.done),
    standing: (timeline.physical ? waiting : 0) + atLanes,
    lanesOpen: at(timeline.lanesOpen),
    extraLanes: at(timeline.extraLanes),
  };
}

/**
 * Integral over the day of a count of the timeline (person-milliseconds), from the first event:
 * e.g. the people waiting, to check a replay against the simulator's own statistics.
 */
export function integrate(timeline: Timeline, count: (k: number) => number): number {
  let total = 0;
  for (let k = 0; k + 1 < timeline.times.length; k++) {
    total += count(k) * ((timeline.times[k + 1] ?? 0) - (timeline.times[k] ?? 0));
  }
  return total;
}

/** One screening: a party on a lane from `startMs` to `endMs`. */
export interface Screening {
  readonly party: number;
  readonly lane: number;
  readonly startMs: number;
  readonly endMs: number;
}

/** The screenings of each lane, in time order. */
export function screeningsByLane(run: TracedRun): Screening[][] {
  const started = new Map<number, { lane: number; startMs: number }>();
  const lanes: Screening[][] = [];
  for (const event of run.events) {
    if (event.type === 'SCREENING_STARTED') {
      started.set(event.party, { lane: event.lane, startMs: event.atMs });
    } else if (event.type === 'SCREENING_ENDED') {
      const start = started.get(event.party);
      if (start === undefined)
        throw new RangeError(`party ${event.party} ended an unstarted screening`);
      started.delete(event.party);
      while (lanes.length <= start.lane) lanes.push([]);
      lanes[start.lane]?.push({
        party: event.party,
        lane: start.lane,
        startMs: start.startMs,
        endMs: event.atMs,
      });
    }
  }
  for (const lane of lanes) lane.sort((a, b) => a.startMs - b.startMs);
  return lanes;
}

/** The party being screened on each lane at `atMs` (`null` for an idle lane). */
export function lanesAt(
  byLane: readonly (readonly Screening[])[],
  atMs: number,
): (number | null)[] {
  return byLane.map((lane) => {
    let lo = 0;
    let hi = lane.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const s = lane[mid] as Screening;
      if (s.endMs <= atMs) lo = mid + 1;
      else if (s.startMs > atMs) hi = mid - 1;
      else return s.party;
    }
    return null;
  });
}

/** For each party, the indexes of its events in the run, in order. */
export function eventsByParty(day: Population, run: TracedRun): number[][] {
  const byParty: number[][] = day.passengers.map(() => []);
  run.events.forEach((event, k) => {
    if ('party' in event) byParty[event.party]?.push(k);
  });
  return byParty;
}

/** Indexes of the commitments of a run: every decision of who is called next, in order. */
export function commitmentIndexes(run: TracedRun): number[] {
  const out: number[] = [];
  run.events.forEach((event, k) => {
    if (event.type === 'QUEUE' && event.event.type === 'COMMITTED') out.push(k);
  });
  return out;
}

/**
 * For each commitment, what the system knew of the passenger's flight when it was decided: the
 * time boarding closes (`null` when unknown).
 */
export function knownDeadlines(day: Population, run: TracedRun): Map<number, number | null> {
  const known = day.flights.map((f) => f.knownDeadline.atMs);
  const out = new Map<number, number | null>();
  run.events.forEach((event: DayEvent, k) => {
    if (event.type === 'FLIGHT_KNOWN') {
      known[event.flight] = event.deadlineMs;
    } else if (event.type === 'QUEUE' && event.event.type === 'COMMITTED') {
      const flight = day.passengers[event.party]?.flightIndex ?? -1;
      out.set(k, known[flight] ?? null);
    }
  });
  return out;
}

/** People who missed their flight, counted when boarding closed: `[time, people]`, in time order. */
export function missedByClosing(day: Population, run: TracedRun): [number, number][] {
  const out: [number, number][] = [];
  run.outcomes.forEach((outcome, party) => {
    if (!outcome.missed) return;
    const passenger = day.passengers[party];
    const flight = passenger === undefined ? undefined : day.flights[passenger.flightIndex];
    if (passenger === undefined || flight === undefined) return;
    out.push([flight.boardingCloseMs, passenger.partySize]);
  });
  return out.sort((a, b) => a[0] - b[0]);
}

/** People counted in `steps` (sorted `[time, people]`) at or before `atMs`. */
export function countUntil(steps: readonly (readonly [number, number])[], atMs: number): number {
  let total = 0;
  for (const [t, people] of steps) {
    if (t > atMs) break;
    total += people;
  }
  return total;
}

/** What happened to one party under the reference and under the candidate. */
export type PairCategory =
  /** Missed the flight under the reference, made it under the candidate. */
  | 'SAVED'
  /** Made it under the reference, missed it under the candidate. */
  | 'HARMED'
  | 'BOTH_MISSED'
  | 'BOTH_MADE';

export interface PartyPair {
  readonly party: number;
  readonly category: PairCategory;
  readonly referenceWaitMs: number;
  readonly candidateWaitMs: number;
  /** Candidate minus reference: positive when the candidate made the party wait longer. */
  readonly waitDeltaMs: number;
  /** The candidate called the party out of FIFO order at least once. */
  readonly candidatePriority: boolean;
}

/** The paired outcome of every party: the same passengers, the two policies. */
export function pairParties(doc: TraceDocument): PartyPair[] {
  const [reference, candidate] = doc.runs;
  return doc.day.passengers.map((_, party) => {
    const r = reference.outcomes[party];
    const c = candidate.outcomes[party];
    if (r === undefined || c === undefined) {
      throw new RangeError('the runs of a trace must cover the same passengers');
    }
    const category: PairCategory = r.missed
      ? c.missed
        ? 'BOTH_MISSED'
        : 'SAVED'
      : c.missed
        ? 'HARMED'
        : 'BOTH_MADE';
    return {
      party,
      category,
      referenceWaitMs: r.waitMs,
      candidateWaitMs: c.waitMs,
      waitDeltaMs: c.waitMs - r.waitMs,
      candidatePriority: c.priorityCall,
    };
  });
}

/** The day in numbers, in people: the same as the run's metrics for this day. */
export interface DaySummary {
  readonly parties: number;
  readonly people: number;
  readonly flights: number;
  readonly missedReference: number;
  readonly missedCandidate: number;
  readonly saved: number;
  readonly harmed: number;
  /** People the candidate called out of FIFO order. */
  readonly priorityPeople: number;
}

export function summariseDay(doc: TraceDocument, pairs: readonly PartyPair[]): DaySummary {
  let people = 0;
  let missedReference = 0;
  let missedCandidate = 0;
  let saved = 0;
  let harmed = 0;
  let priorityPeople = 0;
  for (const pair of pairs) {
    const size = doc.day.passengers[pair.party]?.partySize ?? 0;
    people += size;
    if (pair.category === 'SAVED') saved += size;
    if (pair.category === 'HARMED') harmed += size;
    if (pair.category === 'SAVED' || pair.category === 'BOTH_MISSED') missedReference += size;
    if (pair.category === 'HARMED' || pair.category === 'BOTH_MISSED') missedCandidate += size;
    if (pair.candidatePriority) priorityPeople += size;
  }
  return {
    parties: doc.day.passengers.length,
    people,
    flights: doc.day.flights.length,
    missedReference,
    missedCandidate,
    saved,
    harmed,
    priorityPeople,
  };
}

/**
 * The span of the replay: from the first arrival to the last event of either run or the last
 * closing of a flight that somebody missed, whichever comes later.
 */
export function daySpan(doc: TraceDocument): { readonly fromMs: number; readonly toMs: number } {
  let fromMs = Infinity;
  let toMs = -Infinity;
  for (const p of doc.day.passengers) fromMs = Math.min(fromMs, p.arrivalMs);
  for (const run of doc.runs) {
    const last = run.events[run.events.length - 1];
    if (last !== undefined) toMs = Math.max(toMs, last.atMs);
    const missed = missedByClosing(doc.day, run);
    const lastMissed = missed[missed.length - 1];
    if (lastMissed !== undefined) toMs = Math.max(toMs, lastMissed[0]);
  }
  return Number.isFinite(fromMs) && Number.isFinite(toMs)
    ? { fromMs, toMs: Math.max(fromMs, toMs) }
    : { fromMs: 0, toMs: 0 };
}
