import { describe, expect, it } from 'vitest';
import { PopulationError, simulateCheckpoint } from '../src';
import type { Population, RunResult } from '../src';
import {
  CLASSIFICATION,
  EDF,
  FIFO,
  checkpoint,
  edfWith,
  flight,
  mmcPopulation,
  passenger,
  spreadSlack,
  withPersonalDeadlines,
} from './helpers';

const OPTIONS = { classification: CLASSIFICATION };

function fingerprint(run: RunResult) {
  return run.outcomes.map((o) => [o.calledAtMs, o.serviceEndMs, o.laneIndex, o.missed]);
}

describe('simulateCheckpoint: hand-computed cases', () => {
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
    expect(run.outcomes.map((o) => o.laneIndex)).toEqual([0, 1, 1, 0, 0]);
    expect(run.outcomes.map((o) => o.serviceEndMs)).toEqual([5_000, 3_000, 7_000, 6_000, 8_000]);
    // Passenger 4 reaches the gate at 9 000 ms, after boarding closed at 8 500 ms.
    expect(run.outcomes.map((o) => o.missed)).toEqual([false, false, false, false, true]);
    expect(run.stats).toMatchObject({
      calls: 5,
      priorityCalls: 0,
      busyMs: 15_000,
      firstArrivalMs: 0,
      lastServiceEndMs: 8_000,
      waitingAreaMs: 12_000,
      maxWaiting: 3,
    });
  });

  it('lets an urgent passenger overtake and catch a flight that FIFO would miss', () => {
    // One lane, one passenger per minute. Passenger 3 needs to be called by 140 s to make it.
    const minute = 60_000;
    const population: Population = {
      checkpoint: checkpoint(1, 60, minute),
      flights: [flight(0), flight(1, 200_000)],
      passengers: [
        passenger(0, 0, minute),
        passenger(1, 0, minute),
        passenger(2, 0, minute),
        passenger(3, 0, minute, { flightIndex: 1 }),
      ],
    };
    const policy = edfWith({ safetyBufferMs: 0 });
    const fifo = simulateCheckpoint(population, FIFO, OPTIONS);
    const edf = simulateCheckpoint(population, policy, OPTIONS);

    expect(fifo.outcomes[3]?.calledAtMs).toBe(3 * minute);
    expect(fifo.outcomes[3]?.missed).toBe(true);

    expect(edf.outcomes[3]).toMatchObject({
      calledAtMs: minute,
      missed: false,
      priorityCall: true,
      selectionReasons: ['URGENT_FEASIBLE'],
    });
    expect(edf.outcomes[1]?.overtakenCount).toBe(1);
    expect(edf.outcomes[2]?.overtakenCount).toBe(1);
    expect(edf.outcomes[1]?.waitMs).toBe(2 * minute);
    expect(edf.stats.priorityCalls).toBe(1);
  });

  it('classifies passengers on arrival with the same parameters for every policy', () => {
    const population = mmcPopulation(2, 0.9, 60_000, 200, 4);
    const fifo = simulateCheckpoint(population, FIFO, OPTIONS);
    expect(fifo.outcomes.every((o) => o.classAtArrival === 'UNVERIFIED')).toBe(true);
  });
});

describe('simulateCheckpoint: invariants', () => {
  const population = mmcPopulation(3, 0.95, 60_000, 3_000, 11);

  it('serves every passenger exactly once (conservation)', () => {
    for (const policy of [FIFO, EDF]) {
      const run = simulateCheckpoint(population, policy, OPTIONS);
      expect(run.outcomes).toHaveLength(population.passengers.length);
      expect(run.stats.calls).toBe(population.passengers.length);
      const inconsistent = run.outcomes.filter((o, i) => {
        const p = population.passengers[i]!;
        return o.calledAtMs < p.arrivalMs || o.serviceEndMs !== o.calledAtMs + p.serviceMs;
      });
      expect(inconsistent).toEqual([]);
    }
  });

  it('is deterministic', () => {
    expect(simulateCheckpoint(population, EDF, OPTIONS)).toEqual(
      simulateCheckpoint(population, EDF, OPTIONS),
    );
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

  it('never lets more lanes than available serve at the same time', () => {
    const run = simulateCheckpoint(population, EDF, OPTIONS);
    const events = run.outcomes.flatMap((o) => [
      [o.calledAtMs, 1],
      [o.serviceEndMs, -1],
    ]);
    events.sort((a, b) => a[0]! - b[0]! || a[1]! - b[1]!);
    let busy = 0;
    let maxBusy = 0;
    for (const [, delta] of events) {
      busy += delta!;
      maxBusy = Math.max(maxBusy, busy);
    }
    expect(maxBusy).toBeLessThanOrEqual(population.checkpoint.lanes);
  });
});

describe('simulateCheckpoint: equivalences', () => {
  it('priority with a zero cap reproduces FIFO passenger by passenger', () => {
    // Deadlines known and tight enough to create urgent passengers.
    const population = withPersonalDeadlines(
      mmcPopulation(2, 0.97, 60_000, 2_000, 21),
      spreadSlack,
    );
    const fifo = simulateCheckpoint(population, FIFO, OPTIONS);
    const withCap = simulateCheckpoint(population, EDF, OPTIONS);
    const zeroCap = simulateCheckpoint(population, edfWith({ capMaxPriorityCalls: 0 }), OPTIONS);
    expect(withCap.stats.priorityCalls).toBeGreaterThan(0); // the scenario does create urgency
    expect(zeroCap.stats.capReachedCalls).toBeGreaterThan(0);
    expect(fingerprint(zeroCap)).toEqual(fingerprint(fifo));
  });

  it('with unknown deadlines every policy behaves as FIFO', () => {
    const population = mmcPopulation(4, 0.95, 60_000, 2_000, 5);
    expect(fingerprint(simulateCheckpoint(population, EDF, OPTIONS))).toEqual(
      fingerprint(simulateCheckpoint(population, FIFO, OPTIONS)),
    );
  });

  it('with a single lane, the total work and the makespan do not depend on the policy', () => {
    const population = withPersonalDeadlines(mmcPopulation(1, 0.9, 60_000, 1_500, 8), spreadSlack);
    const fifo = simulateCheckpoint(population, FIFO, OPTIONS);
    const edf = simulateCheckpoint(population, EDF, OPTIONS);
    expect(edf.stats.priorityCalls).toBeGreaterThan(0);
    expect(edf.stats.busyMs).toBe(fifo.stats.busyMs);
    expect(edf.stats.lastServiceEndMs).toBe(fifo.stats.lastServiceEndMs);
  });
});

describe('simulateCheckpoint: input validation', () => {
  it('rejects inconsistent populations', () => {
    const ok: Population = {
      checkpoint: checkpoint(1, 60),
      flights: [flight(0)],
      passengers: [passenger(0, 0, 1_000)],
    };
    expect(() =>
      simulateCheckpoint({ ...ok, checkpoint: checkpoint(0, 60) }, FIFO, OPTIONS),
    ).toThrow(PopulationError);
    expect(() =>
      simulateCheckpoint(
        { ...ok, passengers: [passenger(0, 0, 1_000, { flightIndex: 3 })] },
        FIFO,
        OPTIONS,
      ),
    ).toThrow(PopulationError);
    expect(() =>
      simulateCheckpoint({ ...ok, passengers: [passenger(1, 0, 1_000)] }, FIFO, OPTIONS),
    ).toThrow(PopulationError);
    expect(() =>
      simulateCheckpoint({ ...ok, passengers: [passenger(0, 0.5, 1_000)] }, FIFO, OPTIONS),
    ).toThrow(PopulationError);
  });

  it('handles an empty population', () => {
    const run = simulateCheckpoint(
      { checkpoint: checkpoint(1, 60), flights: [], passengers: [] },
      EDF,
      OPTIONS,
    );
    expect(run.outcomes).toEqual([]);
    expect(run.stats.calls).toBe(0);
  });
});
