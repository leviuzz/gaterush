import type { RiskClass } from '@gateflow/domain';
import type { PassengerOutcome, Population, RunResult } from '@gateflow/sim-model';
import { describe, expect, it } from 'vitest';
import { comparisonDayMetrics, policyDayMetrics } from '../src';

const MIN = 60_000;

function outcome(
  waitMin: number,
  missed: boolean,
  options: { priority?: boolean; overtaken?: number; cls?: RiskClass } = {},
): PassengerOutcome {
  return {
    calledAtMs: waitMin * MIN,
    serviceEndMs: waitMin * MIN + 1,
    gateArrivalMs: waitMin * MIN + 2,
    waitMs: waitMin * MIN,
    missed,
    priorityCall: options.priority ?? false,
    overtakenCount: options.overtaken ?? 0,
    selectionReasons: ['FIFO'],
    classAtArrival: options.cls ?? 'NORMAL',
    laneIndex: 0,
  };
}

function run(outcomes: PassengerOutcome[], extra: Partial<RunResult['stats']> = {}): RunResult {
  return {
    policyId: 'x',
    outcomes,
    stats: {
      calls: outcomes.length,
      priorityCalls: outcomes.filter((o) => o.priorityCall).length,
      capReachedCalls: 0,
      overtakeGuardCalls: 0,
      firstArrivalMs: 0,
      lastServiceEndMs: 100 * MIN,
      busyMs: 50 * MIN,
      waitingAreaMs: 200 * MIN,
      maxWaiting: 7,
      ...extra,
    },
  };
}

const population: Population = {
  checkpoint: { lanes: 1, estimates: { throughputPerHour: 60, processMs: 0, responseMs: 0 } },
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
  })),
};

const baseline = run([
  outcome(10, true, { cls: 'URGENT' }),
  outcome(2, false),
  outcome(30, true, { cls: 'URGENT' }),
  outcome(4, false, { cls: 'CRITICAL' }),
]);

const candidate = run([
  outcome(1, false, { priority: true, cls: 'URGENT' }),
  outcome(3, false, { overtaken: 1 }),
  outcome(31, true, { overtaken: 2, cls: 'URGENT' }),
  outcome(12, true, { overtaken: 1, cls: 'CRITICAL' }),
]);

describe('policyDayMetrics', () => {
  it('counts misses by segment and summarises waits', () => {
    const m = policyDayMetrics(population, baseline);
    expect(m).toMatchObject({
      passengers: 4,
      missed: 2,
      missedDeparting: 2,
      missedTransfer: 0,
      missedPer1000: 500,
      waitMeanMin: 11.5,
      waitP50Min: 7,
      waitMaxMin: 30,
      prioritized: 0,
      urgentOnArrival: 2,
      criticalOnArrival: 1,
      laneUtilization: 0.5,
      meanQueueLength: 2,
      maxQueueLength: 7,
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
});

describe('comparisonDayMetrics', () => {
  it('pairs passengers: saved, harmed, net and the at-risk cohort', () => {
    const c = comparisonDayMetrics(baseline, candidate);
    expect(c).toMatchObject({
      saved: 1, // p0
      harmed: 1, // p3
      net: 0,
      atRiskCohort: 2, // p0 and p2 were URGENT on arrival under the baseline
      atRiskReachedBaseline: 0,
      atRiskReachedCandidate: 1,
      nonPrioritized: 3,
      nonPriorityExtraWaitMaxMin: 8, // p3: 12 - 4
    });
    // Extra waits of p1, p2, p3: 1, 1, 8 minutes
    expect(c.nonPriorityExtraWaitMeanMin).toBeCloseTo(10 / 3, 12);
    expect(c.nonPriorityDelayedOver5MinShare).toBeCloseTo(1 / 3, 12);
    expect(c.waitMeanDeltaMin).toBeCloseTo((-9 + 1 + 1 + 8) / 4, 12);
  });

  it('rejects runs of different sizes', () => {
    expect(() => comparisonDayMetrics(baseline, run([outcome(1, false)]))).toThrow(RangeError);
  });
});
