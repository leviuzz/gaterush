import { PRIORITY_V0_POLICY, VIRTUAL_FIFO_POLICY } from '@gateflow/queue-core';
import { describe, expect, it } from 'vitest';
import { PopulationError, firstCallDelayMs, simulateCheckpoint } from '../src';
import type { Population, RunResult } from '../src';
import {
  FIFO,
  INSTANT_QUEUE,
  MINUTE,
  OPTIONS,
  checkpoint,
  edfWith,
  flight,
  mmcPopulation,
  passenger,
  policy,
  spreadSlack,
  virtualFifo,
  withCallBehaviour,
  withPersonalDeadlines,
} from './helpers';

const SECOND = 1000;

function fingerprint(run: RunResult) {
  return run.outcomes.map((o) => [o.serviceStartMs, o.serviceEndMs, o.missed]);
}

describe('physical queue: hand-computed cases', () => {
  it('serves a two-lane FIFO queue exactly as computed by hand', () => {
    const population: Population = {
      checkpoint: checkpoint(2, 720),
      flights: [flight(0, 8_500)],
      passengers: [
        passenger(0, 0, 5_000),
        passenger(1, 0, 3_000),
        passenger(2, 0, 4_000),
        passenger(3, 1_000, 1_000),
        passenger(4, 1_000, 2_000, { walkMs: 1_000 }),
      ],
    };
    const run = simulateCheckpoint(population, FIFO, OPTIONS);
    expect(run.outcomes.map((o) => o.waitMs)).toEqual([0, 0, 3_000, 4_000, 5_000]);
    expect(run.outcomes.map((o) => o.standingMs)).toEqual([0, 0, 3_000, 4_000, 5_000]);
    expect(run.outcomes.map((o) => o.laneIndex)).toEqual([0, 1, 1, 0, 0]);
    expect(run.outcomes.map((o) => o.serviceEndMs)).toEqual([5_000, 3_000, 7_000, 6_000, 8_000]);
    // Passenger 4 reaches the gate at 9 000 ms, after boarding closed at 8 500 ms.
    expect(run.outcomes.map((o) => o.missed)).toEqual([false, false, false, false, true]);
    expect(run.stats).toMatchObject({
      calls: 5,
      priorityCalls: 0,
      busyMs: 15_000,
      staffedLaneMs: 16_000,
      idleLaneWithDemandMs: 0,
      firstArrivalMs: 0,
      lastServiceEndMs: 8_000,
      waitingAreaMs: 12_000,
      standingAreaMs: 12_000,
      maxWaiting: 3,
      recalls: 0,
      noShows: 0,
    });
  });

  it('follows the lane schedule: closing lanes finish their passenger, new lanes start at once', () => {
    const population: Population = {
      checkpoint: {
        laneSchedule: [
          { fromMs: 0, lanes: 2 },
          { fromMs: 100 * SECOND, lanes: 1 },
          { fromMs: 200 * SECOND, lanes: 3 },
        ],
        serviceRatePerLanePerHour: 24,
        processEstimateMs: 150 * SECOND,
      },
      flights: [flight(0)],
      passengers: [0, 1, 2, 3].map((i) => passenger(i, 0, 150 * SECOND)),
    };
    const run = simulateCheckpoint(population, FIFO, OPTIONS);
    // p0 and p1 start at 0; lane 1 closes at 100 s but finishes p1 at 150 s. p2 takes lane 0 at
    // 150 s; p3 waits until lanes 1 and 2 open at 200 s.
    expect(run.outcomes.map((o) => [o.serviceStartMs / SECOND, o.laneIndex])).toEqual([
      [0, 0],
      [0, 1],
      [150, 0],
      [200, 1],
    ]);
    // Staffed lane time: 2 lanes to 150 s (the closing one still screening), 1 to 200 s, 3 to 350 s.
    expect(run.stats.staffedLaneMs).toBe((2 * 150 + 1 * 50 + 3 * 150) * SECOND);
    expect(run.stats.lastServiceEndMs).toBe(350 * SECOND);
    expect(run.stats.busyMs).toBe(600 * SECOND);
  });

  it('a lane closing at the instant its passenger finishes takes nobody else', () => {
    const population: Population = {
      checkpoint: {
        laneSchedule: [
          { fromMs: 0, lanes: 2 },
          { fromMs: MINUTE, lanes: 1 },
        ],
        serviceRatePerLanePerHour: 60,
        processEstimateMs: MINUTE,
      },
      flights: [flight(0)],
      passengers: [0, 1, 2, 3].map((i) => passenger(i, 0, MINUTE)),
    };
    const expected = [
      [0, 0],
      [0, 1],
      [1, 0],
      [2, 0],
    ];
    const starts = (run: RunResult) =>
      run.outcomes.map((o) => [o.serviceStartMs / MINUTE, o.laneIndex]);
    expect(starts(simulateCheckpoint(population, FIFO, OPTIONS))).toEqual(expected);
    // Same with a virtual queue whose call-ahead keeps p2 and p3 waiting at the lanes: when lane 1
    // finishes p1 at the instant it closes, p3 must not start on it.
    const callAhead = virtualFifo({ callAheadSeconds: 300 });
    expect(starts(simulateCheckpoint(population, callAhead, OPTIONS))).toEqual(expected);
  });

  it('lets an urgent passenger overtake and catch a flight that FIFO would miss', () => {
    // One lane, one passenger per minute. Passenger 3 needs to be called by 140 s to make it.
    const population: Population = {
      checkpoint: checkpoint(1, 60, MINUTE),
      flights: [flight(0), flight(1, 200_000)],
      passengers: [
        passenger(0, 0, MINUTE),
        passenger(1, 0, MINUTE),
        passenger(2, 0, MINUTE),
        passenger(3, 0, MINUTE, { flightIndex: 1 }),
      ],
    };
    const edf = simulateCheckpoint(population, edfWith({ safetyBufferMs: 0 }), OPTIONS);
    const fifo = simulateCheckpoint(population, FIFO, OPTIONS);

    expect(fifo.outcomes[3]?.serviceStartMs).toBe(3 * MINUTE);
    expect(fifo.outcomes[3]?.missed).toBe(true);

    expect(edf.outcomes[3]).toMatchObject({
      firstCalledAtMs: MINUTE,
      serviceStartMs: MINUTE,
      missed: false,
      priorityCall: true,
      selectionReasons: ['URGENT_FEASIBLE'],
    });
    expect(edf.outcomes[1]?.overtakenCount).toBe(1);
    expect(edf.outcomes[2]?.overtakenCount).toBe(1);
    expect(edf.outcomes[1]?.waitMs).toBe(2 * MINUTE);
    expect(edf.stats.priorityCalls).toBe(1);
  });

  it('classifies passengers on arrival with the same parameters for every policy', () => {
    const population = mmcPopulation(2, 0.9, 60_000, 200, 4);
    const fifo = simulateCheckpoint(population, FIFO, OPTIONS);
    expect(fifo.outcomes.every((o) => o.classAtArrival === 'UNVERIFIED')).toBe(true);
  });
});

describe('virtual queue: hand-computed call mechanics', () => {
  // One lane, 60 s of screening each, three passengers arriving together who answer in 30 s once
  // they have walked away.
  const threeAtOnce: Population = {
    checkpoint: checkpoint(1, 60, MINUTE),
    flights: [flight(0)],
    passengers: [0, 1, 2].map((i) => passenger(i, 0, MINUTE, { callResponseMs: 30 * SECOND })),
  };

  it('answers a call at once when it comes before the passenger had time to walk away', () => {
    const run = simulateCheckpoint(threeAtOnce, virtualFifo(), OPTIONS);
    // p0 is called on arrival and is still at the access point; p1 and p2 have walked away.
    expect(run.outcomes.map((o) => o.firstCalledAtMs / SECOND)).toEqual([0, 60, 150]);
    expect(run.outcomes.map((o) => o.serviceStartMs / SECOND)).toEqual([0, 90, 180]);
  });

  it('without call-ahead, the lane idles while each called passenger walks back', () => {
    const run = simulateCheckpoint(threeAtOnce, virtualFifo(), OPTIONS);
    expect(run.outcomes.map((o) => o.callWaitMs / SECOND)).toEqual([0, 60, 150]);
    expect(run.outcomes.map((o) => o.standingMs)).toEqual([0, 0, 0]);
    // Idle 60-90 s (p1 walking, p2 waiting: one lane could be used) and 150-180 s (p2 walking).
    expect(run.stats.idleLaneWithDemandMs).toBe(60 * SECOND);
    expect(run.stats.lastServiceEndMs).toBe(240 * SECOND);
    expect(run.stats.standingAreaMs).toBe(0);
  });

  it('a call-ahead buffer hides the response time at the cost of a short queue at the lanes', () => {
    // 60 s of call-ahead at 60 passengers per hour keeps one extra passenger in the pipeline.
    const run = simulateCheckpoint(threeAtOnce, virtualFifo({ callAheadSeconds: 60 }), OPTIONS);
    expect(run.outcomes.map((o) => o.firstCalledAtMs / SECOND)).toEqual([0, 0, 60]);
    expect(run.outcomes.map((o) => o.serviceStartMs / SECOND)).toEqual([0, 60, 120]);
    expect(run.outcomes.map((o) => o.standingMs / SECOND)).toEqual([0, 60, 30]);
    expect(run.stats.idleLaneWithDemandMs).toBe(0);
    expect(run.stats.lastServiceEndMs).toBe(180 * SECOND);
    expect(run.stats.standingAreaMs).toBe(90 * SECOND);
    expect(run.stats.maxStanding).toBe(1);
  });

  it('counts idle lanes only as far as the passengers on their way could use them', () => {
    // Three lanes busy until 600 s; p3 is called then and walks back for 30 s: one lane is lost
    // for 30 s, not three.
    const population: Population = {
      checkpoint: checkpoint(3, 180, MINUTE),
      flights: [flight(0)],
      passengers: [
        ...[0, 1, 2].map((i) => passenger(i, 0, 10 * MINUTE)),
        passenger(3, 0, MINUTE, { callResponseMs: 30 * SECOND }),
      ],
    };
    const run = simulateCheckpoint(population, virtualFifo(), OPTIONS);
    expect(run.outcomes[3]?.serviceStartMs).toBe(630 * SECOND);
    expect(run.stats.idleLaneWithDemandMs).toBe(30 * SECOND);
  });

  it('a passenger called before walking away cannot miss the call', () => {
    // Called on arrival: the 6-minute absence does not apply.
    const population: Population = {
      checkpoint: checkpoint(1, 60, MINUTE),
      flights: [flight(0)],
      passengers: [
        passenger(0, 0, MINUTE, { callResponseMs: 30 * SECOND, absenceDelayMs: 6 * MINUTE }),
      ],
    };
    const run = simulateCheckpoint(population, virtualFifo(), OPTIONS);
    expect(run.outcomes[0]).toMatchObject({ serviceStartMs: 0, calls: 1, noShows: 0 });
  });

  it('computes the first-call delay from the time since the ticket', () => {
    const pax = passenger(0, 0, MINUTE, { callResponseMs: MINUTE, absenceDelayMs: 5 * MINUTE });
    expect(firstCallDelayMs(pax, 0)).toBe(0);
    expect(firstCallDelayMs(pax, 30 * SECOND)).toBe(30 * SECOND);
    expect(firstCallDelayMs(pax, MINUTE)).toBe(6 * MINUTE);
    expect(firstCallDelayMs(pax, 60 * MINUTE)).toBe(6 * MINUTE);
  });

  /** A first passenger screened for 10 minutes, so that the others are called after walking away. */
  const blocker = passenger(0, 0, 10 * MINUTE);

  it('recalls a late passenger, marks a no-show, reactivates them at their original place', () => {
    // T1 = 3 min, T2 = 2 min. p1, called at 600 s, presents 30 s + 6 min later, after becoming a
    // no-show at 900 s; p2 is called then and screened 930-990 s.
    const population: Population = {
      checkpoint: checkpoint(1, 60, MINUTE),
      flights: [flight(0)],
      passengers: [
        blocker,
        passenger(1, 0, MINUTE, { callResponseMs: 30 * SECOND, absenceDelayMs: 6 * MINUTE }),
        passenger(2, 0, MINUTE, { callResponseMs: 30 * SECOND }),
      ],
    };
    const run = simulateCheckpoint(population, virtualFifo(), OPTIONS);
    expect(run.outcomes[2]).toMatchObject({
      firstCalledAtMs: 900 * SECOND,
      serviceStartMs: 930 * SECOND,
    });
    // p1 rescans at 990 s, is reactivated, called again at once and screened 990-1050 s.
    expect(run.outcomes[1]).toMatchObject({
      firstCalledAtMs: 600 * SECOND,
      serviceStartMs: 990 * SECOND,
      calls: 2,
      noShows: 1,
      reactivations: 1,
      reissuedTickets: 0,
    });
    expect(run.stats).toMatchObject({ calls: 4, recalls: 1, noShows: 1, reactivations: 1 });
    expect(run.stats.idleLaneWithDemandMs).toBe(330 * SECOND);
  });

  it('counts a passenger presenting exactly at a deadline as on time', () => {
    // Called at 600 s. T1 + T2 = 5 min; the no-show can be reactivated until 5 + 15 = 20 min.
    const presentingAfter = (delayMs: number) =>
      simulateCheckpoint(
        {
          checkpoint: checkpoint(1, 60, MINUTE),
          flights: [flight(0)],
          passengers: [
            blocker,
            passenger(1, 0, MINUTE, { callResponseMs: MINUTE, absenceDelayMs: delayMs - MINUTE }),
          ],
        },
        virtualFifo(),
        OPTIONS,
      ).outcomes[1]!;
    expect(presentingAfter(5 * MINUTE)).toMatchObject({ calls: 1, noShows: 0 });
    expect(presentingAfter(5 * MINUTE + 1)).toMatchObject({
      calls: 2,
      noShows: 1,
      reactivations: 1,
    });
    expect(presentingAfter(20 * MINUTE)).toMatchObject({
      noShows: 1,
      reactivations: 1,
      reissuedTickets: 0,
    });
    expect(presentingAfter(20 * MINUTE + 1)).toMatchObject({
      noShows: 1,
      reactivations: 0,
      reissuedTickets: 1,
    });
  });

  it('gives a new ticket, at the back of the queue, to a passenger whose ticket expired', () => {
    // p1 is a no-show at 900 s, expires at 1800 s and rescans at 600 + 30 + 1500 = 2130 s.
    const population: Population = {
      checkpoint: checkpoint(1, 60, MINUTE),
      flights: [flight(0)],
      passengers: [
        blocker,
        passenger(1, 0, MINUTE, { callResponseMs: 30 * SECOND, absenceDelayMs: 25 * MINUTE }),
        passenger(2, 0, MINUTE, { callResponseMs: 30 * SECOND }),
      ],
    };
    const run = simulateCheckpoint(population, virtualFifo(), OPTIONS);
    expect(run.outcomes[1]).toMatchObject({
      serviceStartMs: 2130 * SECOND,
      calls: 2,
      noShows: 1,
      reactivations: 0,
      reissuedTickets: 1,
    });
    expect(run.stats.reissuedTickets).toBe(1);
  });
});

describe('simulateCheckpoint: invariants', () => {
  const population = mmcPopulation(3, 0.95, 60_000, 3_000, 11);
  // Heavy load, so that many passengers wait long enough to walk away and some miss their call.
  const virtualPopulation = withCallBehaviour(
    withPersonalDeadlines(mmcPopulation(3, 0.97, 60_000, 3_000, 12), spreadSlack),
  );
  const policies = [FIFO, edfWith(), VIRTUAL_FIFO_POLICY, PRIORITY_V0_POLICY];

  it('serves every passenger exactly once, never before arrival or call', () => {
    for (const p of policies) {
      const run = simulateCheckpoint(virtualPopulation, p, OPTIONS);
      expect(run.outcomes).toHaveLength(virtualPopulation.passengers.length);
      const inconsistent = run.outcomes.filter((o, i) => {
        const pax = virtualPopulation.passengers[i]!;
        return (
          o.firstCalledAtMs < pax.arrivalMs ||
          o.serviceStartMs < o.firstCalledAtMs ||
          o.serviceEndMs !== o.serviceStartMs + pax.serviceMs ||
          o.waitMs !== o.serviceStartMs - pax.arrivalMs ||
          o.standingMs < 0 ||
          o.standingMs > o.waitMs
        );
      });
      expect(inconsistent).toEqual([]);
      const sum = (f: (o: (typeof run.outcomes)[number]) => number) =>
        run.outcomes.reduce((a, o) => a + f(o), 0);
      expect(run.stats.calls).toBe(sum((o) => o.calls));
      expect(run.stats.noShows).toBe(sum((o) => o.noShows));
      expect(run.stats.reactivations).toBe(sum((o) => o.reactivations));
      expect(run.stats.reissuedTickets).toBe(sum((o) => o.reissuedTickets));
      expect(run.stats.standingAreaMs).toBe(sum((o) => o.standingMs));
      expect(run.stats.staffedLaneMs).toBeGreaterThanOrEqual(run.stats.busyMs);
    }
  });

  it('exercises recalls, no-shows, reactivations and new tickets with the default call mechanics', () => {
    const run = simulateCheckpoint(virtualPopulation, PRIORITY_V0_POLICY, OPTIONS);
    expect(run.stats.recalls).toBeGreaterThan(0);
    expect(run.stats.noShows).toBeGreaterThan(0);
    expect(run.stats.reactivations).toBeGreaterThan(0);
    expect(run.stats.reissuedTickets).toBeGreaterThan(0);
    expect(run.stats.priorityCalls).toBeGreaterThan(0);
  });

  it('is deterministic', () => {
    for (const p of [edfWith(), PRIORITY_V0_POLICY]) {
      expect(simulateCheckpoint(virtualPopulation, p, OPTIONS)).toEqual(
        simulateCheckpoint(virtualPopulation, p, OPTIONS),
      );
    }
  });

  it("satisfies Little's law exactly: the waiting area equals the sum of the waits", () => {
    const run = simulateCheckpoint(population, FIFO, OPTIONS);
    const totalWait = run.outcomes.reduce((sum, o) => sum + o.waitMs, 0);
    expect(run.stats.waitingAreaMs).toBe(totalWait);
    const horizon = run.stats.lastServiceEndMs - run.stats.firstArrivalMs;
    const timeAverageQueue = run.stats.waitingAreaMs / horizon;
    const lambda = population.passengers.length / horizon;
    const meanWait = totalWait / population.passengers.length;
    expect(Math.abs(timeAverageQueue - lambda * meanWait) / timeAverageQueue).toBeLessThan(1e-12);
  });

  it('counts the time to the first call as virtual waiting when nobody misses a call', () => {
    const attentive = {
      ...virtualPopulation,
      passengers: virtualPopulation.passengers.map((p) => ({ ...p, absenceDelayMs: 0 })),
    };
    const run = simulateCheckpoint(attentive, VIRTUAL_FIFO_POLICY, OPTIONS);
    expect(run.stats.noShows).toBe(0);
    expect(run.stats.waitingAreaMs).toBe(run.outcomes.reduce((a, o) => a + o.callWaitMs, 0));
  });

  it('never lets more lanes than available serve at the same time', () => {
    const run = simulateCheckpoint(virtualPopulation, PRIORITY_V0_POLICY, OPTIONS);
    const events = run.outcomes.flatMap((o) => [
      [o.serviceStartMs, 1],
      [o.serviceEndMs, -1],
    ]);
    events.sort((a, b) => a[0]! - b[0]! || a[1]! - b[1]!);
    let busy = 0;
    let maxBusy = 0;
    for (const [, delta] of events) {
      busy += delta!;
      maxBusy = Math.max(maxBusy, busy);
    }
    expect(maxBusy).toBeLessThanOrEqual(3);
  });
});

describe('simulateCheckpoint: equivalences', () => {
  const urgent = withPersonalDeadlines(mmcPopulation(2, 0.97, 60_000, 2_000, 21), spreadSlack);

  it('a virtual queue answered instantly reproduces the physical queue passenger by passenger', () => {
    // With no response time, no call-ahead and no prepare window, the call mechanics vanish.
    const physicalEdf = policy(edfWith().selection, { kind: 'physical' });
    for (const [physical, instant] of [
      [FIFO, virtualFifo()],
      [physicalEdf, edfWith()],
    ] as const) {
      const a = simulateCheckpoint(urgent, physical, OPTIONS);
      const b = simulateCheckpoint(urgent, instant, OPTIONS);
      expect(fingerprint(b)).toEqual(fingerprint(a));
      expect(b.outcomes.map((o) => o.overtakenCount)).toEqual(
        a.outcomes.map((o) => o.overtakenCount),
      );
      // Only the standing queue differs: everybody waiting stands in the physical queue, nobody
      // in the virtual one.
      expect(b.stats.standingAreaMs).toBe(0);
      expect({ ...b.stats, standingAreaMs: 0, maxStanding: 0 }).toEqual({
        ...a.stats,
        standingAreaMs: 0,
        maxStanding: 0,
      });
    }
  });

  it('priority with a zero cap reproduces FIFO passenger by passenger, with or without call mechanics', () => {
    for (const [fifo, queue] of [
      [FIFO, { kind: 'physical' } as const],
      [VIRTUAL_FIFO_POLICY, VIRTUAL_FIFO_POLICY.queue],
    ] as const) {
      const population = queue.kind === 'virtual' ? withCallBehaviour(urgent) : urgent;
      const base = simulateCheckpoint(population, fifo, OPTIONS);
      const withCap = simulateCheckpoint(population, edfWith({}, queue), OPTIONS);
      const zeroCap = simulateCheckpoint(
        population,
        edfWith({ capMaxPriorityCalls: 0 }, queue),
        OPTIONS,
      );
      expect(withCap.stats.priorityCalls).toBeGreaterThan(0); // the scenario does create urgency
      expect(zeroCap.stats.capReachedCalls).toBeGreaterThan(0);
      expect(fingerprint(zeroCap)).toEqual(fingerprint(base));
    }
  });

  it('with unknown deadlines every policy behaves as FIFO', () => {
    const population = mmcPopulation(4, 0.95, 60_000, 2_000, 5);
    expect(fingerprint(simulateCheckpoint(population, edfWith(), OPTIONS))).toEqual(
      fingerprint(simulateCheckpoint(population, FIFO, OPTIONS)),
    );
    const calling = withCallBehaviour(population);
    expect(fingerprint(simulateCheckpoint(calling, PRIORITY_V0_POLICY, OPTIONS))).toEqual(
      fingerprint(simulateCheckpoint(calling, VIRTUAL_FIFO_POLICY, OPTIONS)),
    );
  });

  it('with a single lane and instant calls, the total work and the makespan do not depend on the policy', () => {
    const population = withPersonalDeadlines(mmcPopulation(1, 0.9, 60_000, 1_500, 8), spreadSlack);
    const fifo = simulateCheckpoint(population, FIFO, OPTIONS);
    const edf = simulateCheckpoint(population, edfWith(), OPTIONS);
    expect(edf.stats.priorityCalls).toBeGreaterThan(0);
    expect(edf.stats.busyMs).toBe(fifo.stats.busyMs);
    expect(edf.stats.lastServiceEndMs).toBe(fifo.stats.lastServiceEndMs);
  });
});

describe('simulateCheckpoint: input validation', () => {
  const ok: Population = {
    checkpoint: checkpoint(1, 60),
    flights: [flight(0)],
    passengers: [passenger(0, 0, 1_000)],
  };
  const rejects = (population: Population) => {
    expect(() => simulateCheckpoint(population, FIFO, OPTIONS)).toThrow(PopulationError);
  };

  it('rejects inconsistent populations', () => {
    rejects({ ...ok, checkpoint: checkpoint(0, 60) });
    rejects({ ...ok, passengers: [passenger(0, 0, 1_000, { flightIndex: 3 })] });
    rejects({ ...ok, passengers: [passenger(1, 0, 1_000)] });
    rejects({ ...ok, passengers: [passenger(0, 0.5, 1_000)] });
    rejects({ ...ok, passengers: [passenger(0, 0, 1_000, { id: 'p#2' })] });
    rejects({ ...ok, passengers: [passenger(0, 0, 1_000, { callResponseMs: -1 })] });
    rejects({ ...ok, passengers: [passenger(0, 0, 1_000, { absenceDelayMs: 0.5 })] });
  });

  it('rejects invalid lane schedules', () => {
    const withSchedule = (laneSchedule: Population['checkpoint']['laneSchedule']) => ({
      ...ok,
      checkpoint: { ...ok.checkpoint, laneSchedule },
    });
    rejects(withSchedule([]));
    rejects(withSchedule([{ fromMs: 10, lanes: 1 }]));
    rejects(
      withSchedule([
        { fromMs: 0, lanes: 1 },
        { fromMs: 0, lanes: 2 },
      ]),
    );
    rejects(
      withSchedule([
        { fromMs: 0, lanes: 1 },
        { fromMs: 5, lanes: 0 },
      ]),
    );
    rejects({ ...ok, checkpoint: { ...ok.checkpoint, serviceRatePerLanePerHour: 0 } });
  });

  it('handles an empty population', () => {
    const run = simulateCheckpoint(
      { checkpoint: checkpoint(1, 60), flights: [], passengers: [] },
      edfWith(),
      OPTIONS,
    );
    expect(run.outcomes).toEqual([]);
    expect(run.stats.calls).toBe(0);
  });

  it('keeps the instant queue free of call-ahead and prepare window', () => {
    expect(INSTANT_QUEUE).toMatchObject({ callAheadSeconds: 0, prepareWindowSize: 0 });
  });
});
