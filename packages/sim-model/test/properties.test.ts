import fc from 'fast-check';
import type { KnownDeadline } from '@gateflow/domain';
import type { SelectionParams } from '@gateflow/priority-engine';
import type { Policy, QueueOperation } from '@gateflow/queue-core';
import { describe, expect, it } from 'vitest';
import { simulateCheckpoint } from '../src';
import type { LaneScheduleEntry, Population, RunResult, SimFlight, SimPassenger } from '../src';
import { INSTANT_QUEUE, MINUTE, OPTIONS, policy } from './helpers';

const RUNS = { numRuns: 300 };

const scheduleArb: fc.Arbitrary<LaneScheduleEntry[]> = fc
  .array(
    fc.record({
      gap: fc.integer({ min: 1, max: 20 * MINUTE }),
      lanes: fc.integer({ min: 1, max: 3 }),
    }),
    {
      minLength: 1,
      maxLength: 3,
    },
  )
  .map((rows) => {
    let fromMs = 0;
    return rows.map((row, i) => {
      if (i > 0) fromMs += row.gap;
      return { fromMs, lanes: row.lanes };
    });
  });

// Deadlines close to the arrivals, mostly known from a feed, sometimes from a (possibly wrong)
// rule or unknown, so that urgent passengers, priority calls and the fairness limits occur.
const flightsArb: fc.Arbitrary<SimFlight[]> = fc
  .array(
    fc.record({
      boardingCloseMs: fc.integer({ min: 10 * MINUTE, max: 60 * MINUTE }),
      knowledge: fc.oneof(
        { weight: 3, arbitrary: fc.constant('FEED' as const) },
        { weight: 1, arbitrary: fc.constant('RULE' as const) },
        { weight: 1, arbitrary: fc.constant('NONE' as const) },
      ),
      ruleErrorMs: fc.integer({ min: -10 * MINUTE, max: 10 * MINUTE }),
    }),
    { minLength: 2, maxLength: 4 },
  )
  .map((rows) =>
    rows.map((row, index): SimFlight => {
      const knownDeadline: KnownDeadline =
        row.knowledge === 'NONE'
          ? { atMs: null, source: 'NONE' }
          : {
              atMs: row.boardingCloseMs + (row.knowledge === 'RULE' ? row.ruleErrorMs : 0),
              source: row.knowledge,
            };
      return {
        index,
        id: `F${index}`,
        stdMs: row.boardingCloseMs,
        boardingCloseMs: row.boardingCloseMs,
        knownDeadline,
        gateZone: 'A',
      };
    }),
  );

const passengerRowArb = fc.record({
  // Arrivals in bursts, so that queues (and urgent passengers) form.
  arrivalMs: fc.integer({ min: 0, max: 10 * MINUTE }),
  serviceMs: fc.oneof(fc.constant(0), fc.integer({ min: 1, max: 2 * MINUTE })),
  walkMs: fc.integer({ min: 0, max: 10 * MINUTE }),
  walkEstimateMs: fc.integer({ min: 0, max: 5 * MINUTE }),
  callResponseMs: fc.integer({ min: 0, max: 4 * MINUTE }),
  absenceDelayMs: fc.oneof(fc.constant(0), fc.integer({ min: 1, max: 30 * MINUTE })),
  flightPick: fc.nat(),
  transfer: fc.boolean(),
});

const populationArb: fc.Arbitrary<Population> = fc
  .record({
    schedule: scheduleArb,
    rate: fc.integer({ min: 10, max: 120 }),
    processEstimateMs: fc.integer({ min: 0, max: 90_000 }),
    flights: flightsArb,
    rows: fc.array(passengerRowArb, { minLength: 8, maxLength: 40, size: 'max' }),
  })
  .map(({ schedule, rate, processEstimateMs, flights, rows }) => ({
    checkpoint: { laneSchedule: schedule, serviceRatePerLanePerHour: rate, processEstimateMs },
    flights,
    passengers: rows.map((row, index): SimPassenger => ({
      index,
      id: `p${index}`,
      flightIndex: row.flightPick % flights.length,
      segment: row.transfer ? 'TRANSFER' : 'DEPARTING',
      arrivalMs: row.arrivalMs,
      serviceMs: row.serviceMs,
      walkMs: row.walkMs,
      walkEstimateMs: row.walkEstimateMs,
      callResponseMs: row.callResponseMs,
      absenceDelayMs: row.absenceDelayMs,
    })),
  }));

const selectionArb: fc.Arbitrary<SelectionParams> = fc.oneof(
  { weight: 1, arbitrary: fc.constant({ kind: 'fifo' } as const) },
  {
    weight: 2,
    arbitrary: fc.integer({ min: 1, max: 6 }).chain((n) =>
      fc.record({
        kind: fc.constant('constrained-edf' as const),
        capWindowCalls: fc.constant(n),
        capMaxPriorityCalls: fc.integer({ min: 0, max: n }),
        maxOvertakes: fc.oneof(
          { weight: 1, arbitrary: fc.constant(0) },
          { weight: 4, arbitrary: fc.integer({ min: 1, max: 5 }) },
        ),
        attentionThresholdMs: fc.constant(15 * MINUTE),
        safetyBufferMs: fc.integer({ min: 0, max: 3 * MINUTE }),
        allowRuleBasedDeadline: fc.boolean(),
        eligibleSegments: fc.oneof(
          { weight: 4, arbitrary: fc.constant(['DEPARTING', 'TRANSFER'] as const) },
          { weight: 1, arbitrary: fc.constant(['TRANSFER'] as const) },
        ),
      }),
    ),
  },
);

const queueArb: fc.Arbitrary<QueueOperation> = fc.oneof(
  fc.constant({ kind: 'physical' } as const),
  fc.record({
    kind: fc.constant('virtual' as const),
    callAheadSeconds: fc.integer({ min: 0, max: 180 }),
    responseEstimateSeconds: fc.integer({ min: 0, max: 180 }),
    prepareWindowSize: fc.integer({ min: 0, max: 4 }),
    callTimeoutMs: fc.integer({ min: 1, max: 4 * MINUTE }),
    recallTimeoutMs: fc.integer({ min: 0, max: 3 * MINUTE }),
    reactivationWindowMs: fc.integer({ min: 0, max: 10 * MINUTE }),
    maxReactivations: fc.integer({ min: 0, max: 2 }),
    reactivationPosition: fc.constantFrom('ORIGINAL' as const, 'BACK' as const),
  }),
);

const policyArb: fc.Arbitrary<Policy> = fc
  .tuple(selectionArb, queueArb)
  .map(([selection, queue]) => policy(selection, queue));

/** Open lanes just before and at `t` (a service may start at a lane change on either count). */
function openAround(schedule: readonly LaneScheduleEntry[], t: number): number {
  let before = schedule[0]!.lanes;
  let atT = before;
  for (const entry of schedule) {
    if (entry.fromMs < t) before = entry.lanes;
    if (entry.fromMs <= t) atT = entry.lanes;
  }
  return Math.max(before, atT);
}

function checkRun(population: Population, p: Policy, run: RunResult): void {
  const { passengers, checkpoint } = population;
  expect(run.outcomes).toHaveLength(passengers.length);
  const byLane = new Map<number, [number, number][]>();
  let standing = 0;
  run.outcomes.forEach((o, i) => {
    const pax = passengers[i]!;
    expect(o.firstCalledAtMs).toBeGreaterThanOrEqual(pax.arrivalMs);
    expect(o.serviceStartMs).toBeGreaterThanOrEqual(o.firstCalledAtMs);
    expect(o.serviceEndMs).toBe(o.serviceStartMs + pax.serviceMs);
    expect(o.waitMs).toBe(o.serviceStartMs - pax.arrivalMs);
    expect(o.gateArrivalMs).toBe(o.serviceEndMs + pax.walkMs);
    expect(o.missed).toBe(o.gateArrivalMs > population.flights[pax.flightIndex]!.boardingCloseMs);
    expect(o.laneIndex).toBeLessThan(openAround(checkpoint.laneSchedule, o.serviceStartMs));
    const intervals = byLane.get(o.laneIndex) ?? [];
    intervals.push([o.serviceStartMs, o.serviceEndMs]);
    byLane.set(o.laneIndex, intervals);
    standing += o.standingMs;

    if (p.queue.kind === 'physical') {
      expect(o).toMatchObject({ calls: 1, noShows: 0, reactivations: 0, reissuedTickets: 0 });
      expect(o.standingMs).toBe(o.waitMs);
      expect(o.serviceStartMs).toBe(o.firstCalledAtMs);
    } else {
      // The fate of the first call follows from the passenger's delay alone: later calls are
      // answered at once by a passenger already at the access point.
      const q = p.queue;
      // Independent statement of the rule: called before having walked away, the passenger comes
      // back after the time spent walking away and cannot miss the call.
      const sinceTicket = o.firstCalledAtMs - pax.arrivalMs;
      const delay =
        sinceTicket < pax.callResponseMs ? sinceTicket : pax.callResponseMs + pax.absenceDelayMs;
      const noShowAfter = q.callTimeoutMs + q.recallTimeoutMs;
      if (delay <= noShowAfter) {
        expect(o).toMatchObject({ calls: 1, noShows: 0, reactivations: 0, reissuedTickets: 0 });
      } else if (q.maxReactivations >= 1 && delay <= noShowAfter + q.reactivationWindowMs) {
        expect(o).toMatchObject({ calls: 2, noShows: 1, reactivations: 1, reissuedTickets: 0 });
      } else {
        expect(o).toMatchObject({ calls: 2, noShows: 1, reactivations: 0, reissuedTickets: 1 });
      }
      expect(o.firstCalledAtMs + delay).toBeLessThanOrEqual(o.serviceStartMs);
    }
    if (p.selection.kind === 'constrained-edf') {
      expect(o.overtakenCount).toBeLessThanOrEqual(p.selection.maxOvertakes);
    } else {
      expect(o.overtakenCount).toBe(0);
      expect(o.priorityCall).toBe(false);
    }
  });
  // A lane screens one passenger at a time.
  for (const intervals of byLane.values()) {
    intervals.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    for (let i = 1; i < intervals.length; i++) {
      expect(intervals[i]![0]).toBeGreaterThanOrEqual(intervals[i - 1]![1]);
    }
  }
  expect(run.stats.standingAreaMs).toBe(standing);
  expect(run.stats.staffedLaneMs).toBeGreaterThanOrEqual(run.stats.busyMs);
  // The physical queue is work-conserving: no lane idles while somebody waits.
  if (p.queue.kind === 'physical') expect(run.stats.idleLaneWithDemandMs).toBe(0);
}

describe('checkpoint model properties', () => {
  it('serves everybody once, respects lanes and schedules, and applies the call rules exactly', () => {
    fc.assert(
      fc.property(populationArb, policyArb, (population, p) => {
        checkRun(population, p, simulateCheckpoint(population, p, OPTIONS));
      }),
      RUNS,
    );
  });

  it('is deterministic', () => {
    fc.assert(
      fc.property(populationArb, policyArb, (population, p) => {
        expect(simulateCheckpoint(population, p, OPTIONS)).toEqual(
          simulateCheckpoint(population, p, OPTIONS),
        );
      }),
      { numRuns: 100 },
    );
  });

  it('a virtual queue answered instantly behaves exactly like the physical queue', () => {
    fc.assert(
      fc.property(
        populationArb,
        selectionArb,
        fc.record({
          callTimeoutMs: fc.integer({ min: 1, max: 4 * MINUTE }),
          recallTimeoutMs: fc.integer({ min: 0, max: 3 * MINUTE }),
        }),
        (base, selection, timeouts) => {
          const population = {
            ...base,
            passengers: base.passengers.map((pax) => ({
              ...pax,
              callResponseMs: 0,
              absenceDelayMs: 0,
            })),
          };
          const physical = simulateCheckpoint(
            population,
            policy(selection, { kind: 'physical' }),
            OPTIONS,
          );
          const instant = simulateCheckpoint(
            population,
            policy(selection, { ...INSTANT_QUEUE, ...timeouts }),
            OPTIONS,
          );
          const view = (run: RunResult) =>
            run.outcomes.map((o) => [
              o.serviceStartMs,
              o.serviceEndMs,
              o.overtakenCount,
              o.priorityCall,
            ]);
          expect(view(instant)).toEqual(view(physical));
          expect(instant.stats.waitingAreaMs).toBe(physical.stats.waitingAreaMs);
          expect(instant.stats.staffedLaneMs).toBe(physical.stats.staffedLaneMs);
        },
      ),
      RUNS,
    );
  });

  it('reaches priority calls, the fairness limits, lane closures and every call outcome', () => {
    // Guards against vacuous properties: the generated cases must exercise what they check.
    const samples = fc.sample(fc.tuple(populationArb, policyArb), { numRuns: 300, seed: 20261121 });
    const hits = {
      priority: 0,
      cap: 0,
      guard: 0,
      closingWhileScreening: 0,
      noShows: 0,
      reactivations: 0,
      reissued: 0,
      idleWithDemand: 0,
    };
    for (const [population, p] of samples) {
      const run = simulateCheckpoint(population, p, OPTIONS);
      const s = run.stats;
      if (s.priorityCalls > 0) hits.priority++;
      if (s.capReachedCalls > 0) hits.cap++;
      if (
        s.overtakeGuardCalls > 0 &&
        p.selection.kind === 'constrained-edf' &&
        p.selection.maxOvertakes > 0
      ) {
        hits.guard++;
      }
      const closes = population.checkpoint.laneSchedule.slice(1);
      if (
        run.outcomes.some((o) =>
          closes.some(
            (c) =>
              c.fromMs > o.serviceStartMs && c.fromMs < o.serviceEndMs && c.lanes <= o.laneIndex,
          ),
        )
      ) {
        hits.closingWhileScreening++;
      }
      if (s.noShows > 0) hits.noShows++;
      if (s.reactivations > 0) hits.reactivations++;
      if (s.reissuedTickets > 0) hits.reissued++;
      if (s.idleLaneWithDemandMs > 0) hits.idleWithDemand++;
    }
    // Thresholds at about half of the counts observed with this seed.
    expect(hits.priority).toBeGreaterThanOrEqual(12);
    expect(hits.cap).toBeGreaterThanOrEqual(6);
    expect(hits.guard).toBeGreaterThanOrEqual(6);
    expect(hits.closingWhileScreening).toBeGreaterThanOrEqual(7);
    expect(hits.noShows).toBeGreaterThanOrEqual(30);
    expect(hits.reactivations).toBeGreaterThanOrEqual(12);
    expect(hits.reissued).toBeGreaterThanOrEqual(28);
    expect(hits.idleWithDemand).toBeGreaterThanOrEqual(40);
  });
});
