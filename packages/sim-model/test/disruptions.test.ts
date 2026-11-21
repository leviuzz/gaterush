import { DEFAULT_VIRTUAL_QUEUE, PRIORITY_V0_SELECTION } from '@gateflow/queue-core';
import type { QueueEvent } from '@gateflow/queue-core';
import { describe, expect, it } from 'vitest';
import { PopulationError, openLanesAt, simulateCheckpoint, trueWalkMs } from '../src';
import type { FeedOutage, FlightUpdate, Population, RunResult, SimFlight } from '../src';
import {
  FIFO,
  MINUTE,
  OPTIONS,
  checkpoint,
  decisions,
  edfWith,
  flight,
  passenger,
  policy,
  withoutLaneOutages,
} from './helpers';

const SECOND = 1000;
const starts = (run: RunResult) => run.outcomes.map((o) => o.serviceStartMs / SECOND);

describe('lane outages (S5)', () => {
  it('takes lanes out of service; a busy lane finishes its passenger first', () => {
    // Two lanes, one minute per person, six people at 0. One lane is out from 30 s to 150 s:
    // lane 1 finishes p1 at 60 s, then closes; it reopens at 150 s for p4.
    const population: Population = {
      checkpoint: checkpoint(2, 120, MINUTE),
      flights: [flight(0)],
      passengers: Array.from({ length: 6 }, (_, i) => passenger(i, 0, MINUTE)),
      laneOutages: [{ fromMs: 30 * SECOND, toMs: 150 * SECOND, lanes: 1 }],
    };
    const run = simulateCheckpoint(population, FIFO, OPTIONS);
    expect(starts(run)).toEqual([0, 0, 60, 120, 150, 180]);
    expect(run.outcomes.map((o) => o.laneIndex)).toEqual([0, 1, 0, 0, 1, 0]);
    // Without the outage two lanes serve throughout.
    expect(starts(simulateCheckpoint(withoutLaneOutages(population), FIFO, OPTIONS))).toEqual([
      0, 0, 60, 60, 120, 120,
    ]);
  });

  it('combines outages with the planned schedule and always keeps one lane open', () => {
    const spec = {
      ...checkpoint(2, 120),
      laneSchedule: [
        { fromMs: 0, lanes: 2 },
        { fromMs: 100, lanes: 3 },
      ],
    };
    const outages = [
      { fromMs: 50, toMs: 150, lanes: 1 },
      { fromMs: 120, toMs: 200, lanes: 2 },
    ];
    expect([-10, 0, 50, 100, 120, 150, 200].map((t) => openLanesAt(spec, outages, t))).toEqual([
      2, 2, 1, 2, 1, 1, 3,
    ]);
    expect(openLanesAt(spec, [{ fromMs: 0, toMs: 10, lanes: 5 }], 5)).toBe(1);
  });
});

describe('gate changes (S5)', () => {
  // One lane, one minute each; the flight closes at 4 minutes; the walk is one minute.
  const gateChanged = (atMs: number): Population => {
    const base = flight(0, 4 * MINUTE);
    return {
      checkpoint: checkpoint(1, 60, MINUTE),
      flights: [{ ...base, gateChange: { atMs, gateZone: 'B', walkEstimateMs: 3 * MINUTE } }],
      passengers: [0, 1].map((i) =>
        passenger(i, 0, MINUTE, { walkMs: MINUTE, walkEstimateMs: MINUTE }),
      ),
    };
  };

  it('sends passengers who finish screening from the change on to the new gate', () => {
    const run = simulateCheckpoint(gateChanged(90 * SECOND), FIFO, OPTIONS);
    // p0 leaves at 1 min for the old gate; p1 leaves at 2 min and walks 1 x 3/1 = 3 minutes.
    expect(run.outcomes.map((o) => [o.gateArrivalMs / MINUTE, o.missed])).toEqual([
      [2, false],
      [5, true],
    ]);
    // A passenger leaving exactly at the change already walks to the new gate.
    expect(simulateCheckpoint(gateChanged(MINUTE), FIFO, OPTIONS).outcomes[0]?.gateArrivalMs).toBe(
      4 * MINUTE,
    );
  });

  it('scales the walk with the nominal walking times', () => {
    const f = { ...flight(0), gateChange: { atMs: 0, gateZone: 'B', walkEstimateMs: 90_000 } };
    expect(trueWalkMs(passenger(0, 0, 0, { walkMs: 80_000, walkEstimateMs: 60_000 }), f, 0)).toBe(
      120_000,
    );
    expect(trueWalkMs(passenger(0, 0, 0, { walkMs: 80_000, walkEstimateMs: 60_000 }), f, -1)).toBe(
      80_000,
    );
    // Without a nominal walking time of its own the passenger walks the new gate's nominal time.
    expect(trueWalkMs(passenger(0, 0, 0, { walkMs: 80_000 }), f, 0)).toBe(90_000);
  });
});

describe('delay notices and the flight feed (S5)', () => {
  // One lane, one person per minute, instant calls. p0-p2 have a far flight; p3's flight is
  // believed to close at 200 s: called by 140 s it makes it, in FIFO order (180 s) it does not.
  // The truth may be a delay to 400 s, which the feed announces at `noticeMs`.
  const delayed = (noticeMs: number | null, feedOutages?: FeedOutage[]): Population => {
    const base = flight(1, 200 * SECOND);
    const updates: FlightUpdate[] =
      noticeMs === null
        ? []
        : [{ atMs: noticeMs, knownDeadline: { atMs: 400_000, source: 'FEED' } }];
    const late: SimFlight = {
      ...base,
      ...(noticeMs === null ? {} : { boardingCloseMs: 400_000, delayMs: 200_000, updates }),
    };
    return {
      checkpoint: checkpoint(1, 60, MINUTE),
      flights: [flight(0), late],
      passengers: [0, 1, 2]
        .map((i) => passenger(i, 0, MINUTE))
        .concat(passenger(3, 0, MINUTE, { flightIndex: 1 })),
      ...(feedOutages === undefined ? {} : { feedOutages }),
    };
  };
  const edf = edfWith({ safetyBufferMs: 0, feasibilityMarginMs: 0 });
  const p3 = (run: RunResult) => ({
    firstCalledS: (run.outcomes[3]?.firstCalledAtMs ?? 0) / SECOND,
    priority: run.outcomes[3]?.priorityCall,
    missed: run.outcomes[3]?.missed,
    misinformed: run.stats.misinformedPriorityPeople,
  });

  it('uses a delay as soon as it is announced, and counts boosts made before', () => {
    // Announced at 0 (before the arrivals): p3 is not at risk and waits its turn.
    expect(p3(simulateCheckpoint(delayed(0), edf, OPTIONS))).toEqual({
      firstCalledS: 180,
      priority: false,
      missed: false,
      misinformed: 0,
    });
    // Announced after the decision at 60 s: p3 is boosted on outdated knowledge.
    expect(p3(simulateCheckpoint(delayed(10 * MINUTE), edf, OPTIONS))).toEqual({
      firstCalledS: 60,
      priority: true,
      missed: false,
      misinformed: 1,
    });
    // No delay: the same boost, on correct knowledge.
    expect(p3(simulateCheckpoint(delayed(null), edf, OPTIONS))).toMatchObject({
      firstCalledS: 60,
      misinformed: 0,
    });
  });

  it('holds messages sent while the feed is down until it recovers', () => {
    // Sent at 30 s, the feed down from 20 s to 100 s: unknown at 60 s, so p3 is boosted.
    expect(
      p3(
        simulateCheckpoint(delayed(30 * SECOND, [{ fromMs: 20_000, toMs: 100_000 }]), edf, OPTIONS),
      ),
    ).toMatchObject({ firstCalledS: 60, misinformed: 1 });
    // The feed recovers at 60 s, before the lane is freed at the same instant: not boosted.
    expect(
      p3(
        simulateCheckpoint(delayed(30 * SECOND, [{ fromMs: 20_000, toMs: 60_000 }]), edf, OPTIONS),
      ),
    ).toMatchObject({ firstCalledS: 180, priority: false });
    // A message sent at the very instant the feed goes down is held.
    expect(
      p3(
        simulateCheckpoint(delayed(20 * SECOND, [{ fromMs: 20_000, toMs: 100_000 }]), edf, OPTIONS),
      ),
    ).toMatchObject({ firstCalledS: 60, misinformed: 1 });
  });

  it('applies the stale-data rule: no boost on data older than the maximum age (ADR-029)', () => {
    const stale = (maxDeadlineAgeMs: number | null, outage: FeedOutage) =>
      p3(
        simulateCheckpoint(
          delayed(null, [outage]),
          edfWith({ safetyBufferMs: 0, feasibilityMarginMs: 0, maxDeadlineAgeMs }),
          OPTIONS,
        ),
      );
    const longOutage = { fromMs: 10_000, toMs: 200_000 };
    // At 60 s the data is 50 s old. Trusted up to 60 s: boosted. Up to 30 s: FIFO, flight missed.
    expect(stale(60_000, longOutage)).toMatchObject({ firstCalledS: 60, missed: false });
    expect(stale(null, longOutage)).toMatchObject({ firstCalledS: 60, missed: false });
    expect(stale(30_000, longOutage)).toMatchObject({
      firstCalledS: 180,
      priority: false,
      missed: true,
    });
    // The feed recovers at 100 s: at 120 s the data is fresh again and p3 is boosted in time.
    expect(stale(30_000, { fromMs: 10_000, toMs: 100_000 })).toMatchObject({
      firstCalledS: 120,
      priority: true,
      missed: false,
    });
  });

  it('never makes a priority call while the feed has been down longer than the maximum age', () => {
    const outage = { fromMs: 10_000, toMs: 200_000 };
    const maxAge = 30_000;
    const events: QueueEvent[] = [];
    simulateCheckpoint(
      delayed(null, [outage]),
      edfWith({ safetyBufferMs: 0, feasibilityMarginMs: 0, maxDeadlineAgeMs: maxAge }),
      { ...OPTIONS, listener: (e) => events.push(e) },
    );
    const commitments = events.filter((e) => e.type === 'COMMITTED');
    expect(commitments.length).toBe(4);
    for (const e of commitments) {
      if (e.atMs > outage.fromMs + maxAge && e.atMs < outage.toMs) expect(e.priority).toBe(false);
    }
  });

  it('tells the queue the new walk of a gate change once the feed announces it', () => {
    // p2 (third in line, done at 3 min in FIFO order) walks 1 minute to a gate closing at 5 min,
    // but the gate changes to a 2.5-minute walk. Once announced, the engine sees the risk at
    // 1 min and boosts p2, who then makes it.
    const population = (announce: boolean): Population => ({
      checkpoint: checkpoint(1, 60, MINUTE),
      flights: [
        flight(0),
        {
          ...flight(1, 5 * MINUTE),
          gateChange: { atMs: 0, gateZone: 'B', walkEstimateMs: 150 * SECOND },
          ...(announce ? { updates: [{ atMs: 0, walkEstimateMs: 150 * SECOND }] } : {}),
        },
      ],
      passengers: [
        passenger(0, 0, MINUTE, { flightIndex: 0 }),
        passenger(1, 0, MINUTE, { flightIndex: 0 }),
        passenger(2, 0, MINUTE, { flightIndex: 1, walkMs: MINUTE, walkEstimateMs: MINUTE }),
      ],
    });
    const edfRun = (announce: boolean) => simulateCheckpoint(population(announce), edf, OPTIONS);
    // Unannounced: the engine expects a 1-minute walk and p2 waits; it then walks 2.5 minutes.
    expect(edfRun(false).outcomes[2]).toMatchObject({
      priorityCall: false,
      gateArrivalMs: 5.5 * MINUTE,
      missed: true,
    });
    expect(edfRun(true).outcomes[2]).toMatchObject({
      priorityCall: true,
      gateArrivalMs: 4.5 * MINUTE,
      missed: false,
    });
  });
});

describe('boosts on wrong information (S5)', () => {
  it('counts a boost made before a gate change is announced', () => {
    // As above, but p2's gate moves closer (2.5 to 1 minute of walk). Until the feed says so, the
    // engine sees a 2.5-minute walk, finds p2 URGENT at 1 min and boosts it on wrong information.
    const edf = edfWith({ safetyBufferMs: 0, feasibilityMarginMs: 0 });
    const closer = (noticeMs: number): Population => ({
      checkpoint: checkpoint(1, 60, MINUTE),
      flights: [
        flight(0),
        {
          ...flight(1, 5 * MINUTE),
          gateChange: { atMs: 0, gateZone: 'B', walkEstimateMs: MINUTE },
          updates: [{ atMs: noticeMs, walkEstimateMs: MINUTE }],
        },
      ],
      passengers: [
        passenger(0, 0, MINUTE, { flightIndex: 0 }),
        passenger(1, 0, MINUTE, { flightIndex: 0 }),
        passenger(2, 0, MINUTE, {
          flightIndex: 1,
          walkMs: 150 * SECOND,
          walkEstimateMs: 150 * SECOND,
        }),
      ],
    });
    const late = simulateCheckpoint(closer(10 * MINUTE), edf, OPTIONS);
    expect(late.outcomes[2]).toMatchObject({ priorityCall: true, missed: false });
    expect(late.stats.misinformedPriorityPeople).toBe(1);
    // Announced at once: p2 is not at risk (1-minute walk) and is not boosted.
    const early = simulateCheckpoint(closer(0), edf, OPTIONS);
    expect(early.outcomes[2]).toMatchObject({ priorityCall: false, missed: false });
    expect(early.stats.misinformedPriorityPeople).toBe(0);
  });
});

describe('degrading to FIFO without flight data (acceptance criterion of S5)', () => {
  // A congested lane with urgent passengers: priority calls happen when the data is known.
  const congested = (knowledge: 'FEED' | 'NONE', feedOutages?: FeedOutage[]): Population => ({
    checkpoint: checkpoint(2, 120, MINUTE),
    flights: Array.from({ length: 4 }, (_, i) =>
      flight(
        i,
        (20 + 7 * i) * MINUTE,
        knowledge === 'NONE' ? { atMs: null, source: 'NONE' } : undefined,
      ),
    ),
    passengers: Array.from({ length: 60 }, (_, i) =>
      passenger(i, i * 20 * SECOND, MINUTE, {
        flightIndex: (i * 3) % 4,
        callResponseMs: (20 + ((i * 37) % 100)) * SECOND,
        absenceDelayMs: i % 9 === 4 ? 4 * MINUTE : 0,
      }),
    ),
    ...(feedOutages === undefined ? {} : { feedOutages }),
  });
  const queue = { ...DEFAULT_VIRTUAL_QUEUE, prepareWindowSize: 2 };
  const priority = policy(
    {
      ...PRIORITY_V0_SELECTION,
      fastTrack: true,
      maxDeadlineAgeMs: 15 * MINUTE,
      hysteresisMs: 3 * MINUTE,
    },
    queue,
    'priority',
  );
  const fifo = policy({ kind: 'fifo' }, queue, 'virtual-fifo');

  it('gives exactly the outcomes of the same queue in FIFO order', () => {
    const withData = simulateCheckpoint(congested('FEED'), priority, OPTIONS);
    expect(withData.stats.priorityCalls).toBeGreaterThan(0);
    // No flight data at all.
    const none = congested('NONE');
    expect(decisions(simulateCheckpoint(none, priority, OPTIONS))).toEqual(
      decisions(simulateCheckpoint(none, fifo, OPTIONS)),
    );
    // The feed down all day (since before the first arrival by more than the maximum age).
    const down = congested('FEED', [{ fromMs: -16 * MINUTE, toMs: 10 * 60 * MINUTE }]);
    const degraded = simulateCheckpoint(down, priority, OPTIONS);
    expect(degraded.stats.priorityCalls).toBe(0);
    expect(decisions(degraded)).toEqual(decisions(simulateCheckpoint(down, fifo, OPTIONS)));
  });
});

describe('disruption inputs (S5)', () => {
  const base: Population = {
    checkpoint: checkpoint(1, 60),
    flights: [flight(0)],
    passengers: [passenger(0, 0, MINUTE)],
  };
  const withFlight = (patch: Partial<SimFlight>): Population => ({
    ...base,
    flights: [{ ...flight(0), ...patch }],
  });

  it('rejects invalid disruptions', () => {
    const invalid: Population[] = [
      { ...base, laneOutages: [{ fromMs: 10, toMs: 10, lanes: 1 }] },
      { ...base, laneOutages: [{ fromMs: 0, toMs: 10, lanes: 0 }] },
      { ...base, feedOutages: [{ fromMs: 10, toMs: 5 }] },
      {
        ...base,
        feedOutages: [
          { fromMs: 0, toMs: 10 },
          { fromMs: 10, toMs: 20 },
        ],
      },
      withFlight({ delayMs: -1 }),
      withFlight({ gateChange: { atMs: 0.5, gateZone: 'B', walkEstimateMs: 0 } }),
      withFlight({ updates: [{ atMs: 0 }] }),
      withFlight({
        updates: [
          { atMs: 5, walkEstimateMs: 0 },
          { atMs: 4, walkEstimateMs: 0 },
        ],
      }),
      withFlight({ updates: [{ atMs: 0, knownDeadline: { atMs: 5, source: 'NONE' } }] }),
      withFlight({
        updates: [{ atMs: 0, knownDeadline: { atMs: 5, source: 'FEED', observedAtMs: 0 } }],
      }),
      withFlight({ knownDeadline: { atMs: null, source: 'FEED' } }),
      { ...base, flights: [flight(0), { ...flight(1), id: 'F0' }] },
    ];
    for (const population of invalid) {
      expect(() => simulateCheckpoint(population, FIFO, OPTIONS)).toThrow(PopulationError);
    }
  });

  it('starts the day at the first feed event when it comes before the first arrival', () => {
    const early = withFlight({
      boardingCloseMs: 400_000,
      updates: [{ atMs: -60 * MINUTE, knownDeadline: { atMs: 400_000, source: 'FEED' } }],
    });
    const run = simulateCheckpoint(
      { ...early, feedOutages: [{ fromMs: -90 * MINUTE, toMs: -30 * MINUTE }] },
      FIFO,
      OPTIONS,
    );
    expect(run.outcomes[0]).toMatchObject({ serviceStartMs: 0, missed: false });
    expect(run.stats.firstArrivalMs).toBe(0);
  });
});
