import type { RiskClass } from '@gateflow/domain';
import type { PassengerOutcome, Population, RunResult } from '@gateflow/sim-model';
import { describe, expect, it } from 'vitest';
import { comparisonDayMetrics, policyDayMetrics } from '../src';

const MIN = 60_000;

function outcome(
  waitMin: number,
  missed: boolean,
  options: { priority?: boolean; overtaken?: number; cls?: RiskClass; standingMin?: number } = {},
): PassengerOutcome {
  return {
    firstCalledAtMs: waitMin * MIN,
    serviceStartMs: waitMin * MIN,
    serviceEndMs: waitMin * MIN + 1,
    gateArrivalMs: waitMin * MIN + 2,
    waitMs: waitMin * MIN,
    callWaitMs: waitMin * MIN,
    standingMs: (options.standingMin ?? waitMin) * MIN,
    missed,
    priorityCall: options.priority ?? false,
    overtakenCount: options.overtaken ?? 0,
    selectionReasons: ['FIFO'],
    classAtArrival: options.cls ?? 'NORMAL',
    laneIndex: 0,
    calls: 1,
    noShows: 0,
    reactivations: 0,
    reissuedTickets: 0,
  };
}

function run(outcomes: PassengerOutcome[], extra: Partial<RunResult['stats']> = {}): RunResult {
  return {
    policyId: 'x',
    outcomes,
    stats: {
      calls: outcomes.length,
      commitments: outcomes.length,
      priorityCalls: outcomes.filter((o) => o.priorityCall).length,
      capReachedCalls: 0,
      overtakeGuardCalls: 0,
      recalls: 0,
      noShows: 0,
      reactivations: 0,
      reissuedTickets: 0,
      firstArrivalMs: 0,
      lastServiceEndMs: 100 * MIN,
      busyMs: 50 * MIN,
      staffedLaneMs: 100 * MIN,
      idleLaneWithDemandMs: 0,
      waitingAreaMs: 200 * MIN,
      maxWaiting: 7,
      standingAreaMs: 46 * MIN,
      maxStanding: 3,
      ...extra,
    },
  };
}

const population: Population = {
  checkpoint: {
    laneSchedule: [{ fromMs: 0, lanes: 1 }],
    serviceRatePerLanePerHour: 60,
    processEstimateMs: 0,
  },
  flights: [
    {
      index: 0,
      id: 'F0',
      stdMs: 0,
      boardingCloseMs: 0,
      knownDeadline: { atMs: 0, source: 'RULE' },
      gateZone: 'A',
    },
  ],
  passengers: ['DEPARTING', 'TRANSFER', 'DEPARTING', 'TRANSFER'].map((segment, index) => ({
    index,
    id: `p${index}`,
    flightIndex: 0,
    segment: segment as 'DEPARTING' | 'TRANSFER',
    arrivalMs: 0,
    serviceMs: 1,
    walkMs: 0,
    walkEstimateMs: 0,
    callResponseMs: 0,
    absenceDelayMs: 0,
    partySize: 1,
    path: 'QUEUE' as const,
    strategic: false,
  })),
};

const reference = run([
  outcome(10, true, { cls: 'URGENT' }),
  outcome(2, false),
  outcome(30, true, { cls: 'URGENT' }),
  outcome(4, false, { cls: 'CRITICAL' }),
]);

const candidate = run([
  outcome(1, false, { priority: true, cls: 'URGENT', standingMin: 0 }),
  outcome(3, false, { overtaken: 1, standingMin: 1 }),
  outcome(31, true, { overtaken: 2, cls: 'URGENT', standingMin: 2 }),
  outcome(12, true, { overtaken: 1, cls: 'CRITICAL', standingMin: 3 }),
]);

describe('policyDayMetrics', () => {
  it('counts misses by segment and summarises waits and standing times', () => {
    const m = policyDayMetrics(population, reference);
    expect(m).toMatchObject({
      passengers: 4,
      missed: 2,
      missedDeparting: 2,
      missedTransfer: 0,
      missedPer1000: 500,
      waitMeanMin: 11.5,
      waitP50Min: 7,
      waitMaxMin: 30,
      standingMeanMin: 11.5,
      standingMaxMin: 30,
      prioritized: 0,
      urgentOnArrival: 2,
      criticalOnArrival: 1,
      laneUtilization: 0.5,
      staffedLaneHours: 100 / 60,
      meanQueueLength: 2,
      maxQueueLength: 7,
      meanStandingQueue: 0.46,
      maxStandingQueue: 3,
    });
  });

  it('counts priority calls and overtakes', () => {
    const m = policyDayMetrics(population, candidate);
    expect(m).toMatchObject({
      prioritized: 1,
      priorityCallShare: 0.25,
      passengersOvertaken: 3,
      maxOvertakes: 2,
      missedTransfer: 1,
    });
  });

  it('reports call mechanics as shares of calls and of staffed lane time', () => {
    const m = policyDayMetrics(
      population,
      run(reference.outcomes.slice(), {
        calls: 5,
        recalls: 2,
        noShows: 1,
        reactivations: 1,
        reissuedTickets: 0,
        idleLaneWithDemandMs: 10 * MIN,
      }),
    );
    expect(m).toMatchObject({
      calls: 5,
      recalls: 2,
      recallShare: 0.4,
      noShows: 1,
      noShowShare: 0.2,
      reactivations: 1,
      reissuedTickets: 0,
      idleLaneWithDemandMin: 10,
      idleLaneWithDemandShare: 0.1,
    });
  });

  it('returns zeros instead of NaN for an empty day', () => {
    const empty = policyDayMetrics(
      { ...population, passengers: [] },
      run([], { calls: 0, staffedLaneMs: 0, lastServiceEndMs: 0, busyMs: 0 }),
    );
    expect(Object.values(empty).every((v) => Number.isFinite(v))).toBe(true);
  });
});

describe('comparisonDayMetrics', () => {
  it('pairs passengers: saved, harmed, net and the at-risk cohort', () => {
    const c = comparisonDayMetrics(population, reference, candidate);
    expect(c).toMatchObject({
      saved: 1, // p0
      harmed: 1, // p3
      net: 0,
      atRiskCohort: 2, // p0 and p2 were URGENT on arrival under the reference
      atRiskReachedReference: 0,
      atRiskReachedCandidate: 1,
      nonPrioritized: 3,
      nonPriorityExtraWaitMaxMin: 8, // p3: 12 - 4
    });
    // Extra waits of p1, p2, p3: 1, 1, 8 minutes
    expect(c.nonPriorityExtraWaitMeanMin).toBeCloseTo(10 / 3, 12);
    expect(c.nonPriorityDelayedOver5MinShare).toBeCloseTo(1 / 3, 12);
    expect(c.waitMeanDeltaMin).toBeCloseTo((-9 + 1 + 1 + 8) / 4, 12);
    // Standing: 0 + 1 + 2 + 3 with the candidate against 10 + 2 + 30 + 4 with the reference.
    expect(c.standingMeanDeltaMin).toBeCloseTo((6 - 46) / 4, 12);
  });

  it('rejects runs of different sizes', () => {
    expect(() => comparisonDayMetrics(population, reference, run([outcome(1, false)]))).toThrow(
      RangeError,
    );
  });

  it('counts people, not parties', () => {
    // p0 becomes a family of three: its miss, its wait and its saving count three times.
    const families: Population = {
      ...population,
      passengers: population.passengers.map((p, i) => (i === 0 ? { ...p, partySize: 3 } : p)),
    };
    const c = comparisonDayMetrics(families, reference, candidate);
    expect(c).toMatchObject({ saved: 3, harmed: 1, net: 2, atRiskCohort: 4 });
    expect(c.waitMeanDeltaMin).toBeCloseTo((3 * -9 + 1 + 1 + 8) / 6, 12);
    const m = policyDayMetrics(families, reference);
    expect(m).toMatchObject({ passengers: 6, missed: 4, parties: 4, groups: 1, peopleInGroups: 3 });
    expect(m.waitMeanMin).toBeCloseTo((3 * 10 + 2 + 30 + 4) / 6, 12);
  });
});

describe('groups, assisted passengers and strategic arrivals', () => {
  it('reports them separately, in people', () => {
    const mixed: Population = {
      ...population,
      passengers: population.passengers.map((p, i) => {
        if (i === 0) return { ...p, partySize: 2, strategic: true };
        if (i === 3) return { ...p, path: 'ASSISTED' as const };
        return p;
      }),
    };
    const m = policyDayMetrics(mixed, candidate);
    expect(m).toMatchObject({
      groups: 1,
      peopleInGroups: 2,
      groupsPrioritized: 1,
      assistedPeople: 1,
      assistedWaitMeanMin: 12,
      assistedMissed: 1,
      strategicPeople: 2,
      strategicPrioritized: 2,
      strategicMissed: 0,
    });
  });
});
