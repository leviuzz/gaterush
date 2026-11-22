import { FIFO_MANUAL_POLICY, LANE_MODES, withLaneMode } from '@gateflow/queue-core';
import type { Policy, PredictiveLanes, QueueEvent, ReactiveLanes } from '@gateflow/queue-core';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { PopulationError, simulateCheckpoint } from '../src';
import type {
  ArrivalForecast,
  DayEvent,
  LaneStaffing,
  Population,
  RunResult,
  TapeEntry,
} from '../src';
import {
  FIFO,
  MINUTE,
  OPTIONS,
  checkpoint,
  decisions,
  edfWith,
  flight,
  passenger,
  playTape,
  withCallBehaviour,
  withPersonalDeadlines,
  mmcPopulation,
  spreadSlack,
} from './helpers';

const REACTIVE = LANE_MODES.reactive?.lanes as ReactiveLanes;
const PREDICT = LANE_MODES.predict?.lanes as PredictiveLanes;

function withLanes(policy: Policy, lanes: ReactiveLanes | PredictiveLanes): Policy {
  return { ...policy, id: `${policy.id}@${lanes.kind}`, lanes };
}

const reactive = (overrides: Partial<ReactiveLanes> = {}) =>
  withLanes(FIFO, { ...REACTIVE, ...overrides });
const predict = (overrides: Partial<PredictiveLanes> = {}) =>
  withLanes(FIFO, { ...PREDICT, ...overrides });

function staffing(overrides: Partial<LaneStaffing> = {}): LaneStaffing {
  return {
    lanesAvailable: 2,
    maxExtraLanes: 1,
    openDelayEstimateMs: 5 * MINUTE,
    minOpenMs: 0,
    openDelaysMs: [5 * MINUTE],
    follows: [true],
    ...overrides,
  };
}

/** One lane, one minute per person, `n` people arriving at once. */
function rush(n: number, staff: LaneStaffing = staffing()): Population {
  return {
    checkpoint: checkpoint(1, 60),
    flights: [flight(0)],
    passengers: Array.from({ length: n }, (_, i) => passenger(i, 0, MINUTE)),
    staffing: staff,
  };
}

/** Two people a minute from minute 10 to minute 40 at one lane of one per minute, forecast exactly. */
function ramp(staff: LaneStaffing = staffing()): Population {
  const passengers = Array.from({ length: 60 }, (_, i) =>
    passenger(i, (10 + Math.floor(i / 2)) * MINUTE, MINUTE),
  );
  const forecast: ArrivalForecast = {
    startMs: 0,
    peoplePerMinute: Array.from({ length: 60 }, (_, m) => (m >= 10 && m < 40 ? 2 : 0)),
  };
  return {
    checkpoint: checkpoint(1, 60),
    flights: [flight(0)],
    passengers,
    staffing: staff,
    forecast,
  };
}

const startsMin = (run: RunResult) => run.outcomes.map((o) => o.serviceStartMs / MINUTE);
const meanWaitMin = (run: RunResult) =>
  run.outcomes.reduce((a, o) => a + o.waitMs, 0) / run.outcomes.length / MINUTE;

describe('extra lanes opened by a supervisor (S8, reactive)', () => {
  it('opens a lane when the queue shows a long wait and closes it when the queue is short', () => {
    // 30 people at 0 on one lane: the queue shows 29 minutes at the first look (0). The lane is
    // ready 5 minutes later; at 10 the queue shows 6.5 minutes (no decision); at 15 it shows 1.5
    // minutes, below 2: the extra lane closes after its passenger.
    const run = simulateCheckpoint(rush(30), reactive(), OPTIONS);
    expect(startsMin(run)).toEqual([
      0, 1, 2, 3, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13, 14, 14, 15, 15,
      16, 17, 18,
    ]);
    expect(run.stats).toMatchObject({
      laneDecisions: 2,
      laneDecisionsFollowed: 2,
      lanesOpened: 1,
      lanesClosed: 1,
      maxOpenLanes: 2,
      // Open from 5 to 15; the closing lane then finishes its passenger (staffed until 16).
      extraLaneMs: 10 * MINUTE,
      staffedLaneMs: 19 * MINUTE + 11 * MINUTE,
    });
    const plain = simulateCheckpoint(rush(30), FIFO, OPTIONS);
    expect(startsMin(plain)).toEqual(Array.from({ length: 30 }, (_, i) => i));
    expect(plain.stats).toMatchObject({ extraLaneMs: 0, laneDecisions: 0, maxOpenLanes: 1 });
  });

  it('waits for the cooldown and counts lanes decided but not yet open', () => {
    // A queue that stays long, staff for one extra lane that takes 20 minutes to open: one
    // decision only (the lane still to come takes the staff), then nothing more to open.
    const slow = staffing({ openDelaysMs: [20 * MINUTE], maxExtraLanes: 1, lanesAvailable: 4 });
    const run = simulateCheckpoint(rush(80, slow), reactive(), OPTIONS);
    expect(run.stats.laneDecisions).toBeGreaterThanOrEqual(1);
    expect(run.stats.lanesOpened).toBe(1);
    expect(run.stats.maxOpenLanes).toBe(2);
    // With staff for three, a decision every 10 minutes (cooldown) while the queue stays long.
    const more = staffing({ openDelaysMs: [20 * MINUTE], maxExtraLanes: 3, lanesAvailable: 4 });
    const busy = simulateCheckpoint(rush(80, more), reactive(), OPTIONS);
    expect(busy.stats.lanesOpened).toBe(3);
    expect(busy.stats.maxOpenLanes).toBe(4);
    const opened = startsMin(busy);
    // Lanes open at 20, 30 and 40 minutes (decided at 0, 10 and 20).
    expect(opened.filter((t) => t === 20)).toHaveLength(2);
    expect(opened.filter((t) => t === 30)).toHaveLength(3);
    expect(opened.filter((t) => t === 40)).toHaveLength(4);
  });

  it('keeps an extra lane open for the minimum time', () => {
    const run = simulateCheckpoint(
      rush(30, staffing({ minOpenMs: 30 * MINUTE })),
      reactive(),
      OPTIONS,
    );
    // The queue is short at 15, but the lane opened at 5 stays until everybody is screened.
    expect(run.stats.lanesClosed).toBe(0);
    expect(run.stats.lanesOpened).toBe(1);
    expect(run.stats.extraLaneMs).toBe(run.stats.lastServiceEndMs - 5 * MINUTE);
  });

  it('never opens more lanes than the checkpoint has or the staff can open', () => {
    // The plan already uses every lane: the supervisor has nowhere to open one.
    const full = simulateCheckpoint(
      rush(30, staffing({ lanesAvailable: 1, maxExtraLanes: 3 })),
      reactive(),
      OPTIONS,
    );
    expect(startsMin(full)).toEqual(Array.from({ length: 30 }, (_, i) => i));
    expect(full.stats).toMatchObject({ laneDecisions: 0, lanesOpened: 0, maxOpenLanes: 1 });
    // No staff on call: the same.
    const none = simulateCheckpoint(rush(30, staffing({ maxExtraLanes: 0 })), reactive(), OPTIONS);
    expect(decisions(none)).toEqual(decisions(simulateCheckpoint(rush(30), FIFO, OPTIONS)));
  });

  it('gives the staff back when the plan itself needs the lane', () => {
    const population: Population = {
      ...rush(40),
      checkpoint: {
        ...checkpoint(1, 60),
        laneSchedule: [
          { fromMs: 0, lanes: 1 },
          { fromMs: 8 * MINUTE, lanes: 2 },
        ],
        serviceRatePerLanePerHour: 60,
      },
    };
    const run = simulateCheckpoint(population, reactive(), OPTIONS);
    // The extra lane opens at 5; from 8 the plan has two lanes: the extra staff go back.
    expect(run.stats.maxOpenLanes).toBe(2);
    expect(run.stats.extraLaneMs).toBe(3 * MINUTE);
  });
});

describe("extra lanes recommended by GateFlow's forecast (S8, predict)", () => {
  it('opens before the queue builds, where a supervisor waits for the queue', () => {
    const population = ramp();
    const plain = simulateCheckpoint(population, FIFO, OPTIONS);
    const late = simulateCheckpoint(population, reactive(), OPTIONS);
    const early = simulateCheckpoint(population, predict(), OPTIONS);
    // The forecast shows the wave at the first look (0): a lane ready at 5, before anyone comes.
    // It closes once the wave is over: two decisions, both followed.
    expect(early.stats).toMatchObject({
      laneDecisions: 2,
      laneDecisionsFollowed: 2,
      lanesOpened: 1,
      lanesClosed: 1,
    });
    expect(startsMin(early).slice(0, 4)).toEqual([10, 10, 11, 11]);
    expect(meanWaitMin(early)).toBeLessThan(meanWaitMin(late));
    expect(meanWaitMin(late)).toBeLessThan(meanWaitMin(plain));
    expect(late.stats.lanesOpened).toBe(1);
  });

  it('changes nothing when the duty manager does not follow the recommendation', () => {
    const population = ramp(staffing({ follows: [false] }));
    const ignored = simulateCheckpoint(population, predict(), OPTIONS);
    expect(decisions(ignored)).toEqual(decisions(simulateCheckpoint(population, FIFO, OPTIONS)));
    expect(ignored.stats.laneDecisions).toBeGreaterThan(0);
    expect(ignored.stats).toMatchObject({ laneDecisionsFollowed: 0, lanesOpened: 0 });
  });

  it('closes the extra lane once the projection is short without it', () => {
    const run = simulateCheckpoint(ramp(), predict(), OPTIONS);
    expect(run.stats.lanesClosed).toBe(1);
    expect(run.stats.extraLaneMs).toBeLessThan(run.stats.lastServiceEndMs - 5 * MINUTE);
  });

  it('needs a forecast', () => {
    const { forecast: _unused, ...withoutForecast } = ramp();
    expect(_unused).toBeDefined();
    expect(() => simulateCheckpoint(withoutForecast, predict(), OPTIONS)).toThrow(PopulationError);
  });
});

describe('lane management: equivalences and inputs (S8)', () => {
  it('without staff on call, a policy that manages lanes runs exactly as without', () => {
    const population = withCallBehaviour(
      withPersonalDeadlines(mmcPopulation(2, 0.95, MINUTE, 300, 4), spreadSlack),
    );
    for (const base of [FIFO, edfWith(), FIFO_MANUAL_POLICY]) {
      const plain = simulateCheckpoint(population, base, OPTIONS);
      for (const mode of ['reactive', 'predict'] as const) {
        const managed = withLaneMode(base, mode);
        const run = simulateCheckpoint(
          { ...population, forecast: { startMs: 0, peoplePerMinute: [] } },
          managed,
          OPTIONS,
        );
        expect(decisions(run)).toEqual(decisions(plain));
        expect(run.stats).toEqual({ ...plain.stats });
      }
    }
  });

  it('staff on call change nothing for a policy that does not manage lanes', () => {
    const population = rush(30);
    const { staffing: _unused, ...plain } = population;
    expect(_unused).toBeDefined();
    expect(simulateCheckpoint(population, FIFO, OPTIONS)).toEqual(
      simulateCheckpoint(plain, FIFO, OPTIONS),
    );
  });

  it('rejects staff data that the model cannot use', () => {
    const bad: [Partial<LaneStaffing>, RegExp][] = [
      [{ lanesAvailable: 0 }, /lanesAvailable/],
      [{ maxExtraLanes: -1 }, /maxExtraLanes/],
      [{ openDelaysMs: [] }, /at least one open delay/],
      [{ openDelaysMs: [1.5] }, /openDelaysMs/],
      [{ follows: [] }, /at least one open delay and one follow/],
    ];
    for (const [overrides, message] of bad) {
      expect(() => simulateCheckpoint(rush(3, staffing(overrides)), reactive(), OPTIONS)).toThrow(
        message,
      );
    }
    expect(() =>
      simulateCheckpoint(
        { ...rush(3), checkpoint: { ...checkpoint(3, 180) } },
        reactive(),
        OPTIONS,
      ),
    ).toThrow(/the plan opens 3 lanes but the checkpoint has 2/);
    expect(() =>
      simulateCheckpoint(
        { ...ramp(), forecast: { startMs: 0, peoplePerMinute: [-1] } },
        predict(),
        OPTIONS,
      ),
    ).toThrow(/forecast.peoplePerMinute/);
  });
});

describe('lane management: properties (S8)', () => {
  const staffArb = fc.record({
    lanesAvailable: fc.integer({ min: 1, max: 5 }),
    maxExtraLanes: fc.integer({ min: 0, max: 4 }),
    openDelayEstimateMs: fc.integer({ min: 0, max: 20 }).map((m) => m * MINUTE),
    minOpenMs: fc.integer({ min: 0, max: 40 }).map((m) => m * MINUTE),
    openDelaysMs: fc.array(fc.integer({ min: 0, max: 30 * MINUTE }), {
      minLength: 1,
      maxLength: 5,
    }),
    follows: fc.array(fc.boolean(), { minLength: 1, maxLength: 5 }),
  });

  it('serves everybody, never opens more lanes than allowed and accounts for the lanes', () => {
    fc.assert(
      fc.property(
        staffArb,
        fc.integer({ min: 1, max: 3 }),
        fc.array(fc.integer({ min: 0, max: 90 }), { minLength: 1, maxLength: 120 }),
        fc.constantFrom('reactive', 'predict'),
        fc.integer({ min: 1, max: 4 }),
        (staff, planned, arrivals, mode, ratePerMin) => {
          const lanesAvailable = Math.max(staff.lanesAvailable, planned);
          const population: Population = {
            checkpoint: {
              laneSchedule: [{ fromMs: 0, lanes: planned }],
              serviceRatePerLanePerHour: 60,
              processEstimateMs: MINUTE,
            },
            flights: [flight(0)],
            passengers: arrivals
              .sort((a, b) => a - b)
              .map((m, i) => passenger(i, m * MINUTE, MINUTE)),
            staffing: { ...staff, lanesAvailable },
            forecast: {
              startMs: 0,
              peoplePerMinute: Array.from({ length: 100 }, () => ratePerMin / 2),
            },
          };
          const policy = mode === 'reactive' ? reactive() : predict();
          const run = simulateCheckpoint(population, policy, OPTIONS);
          const { stats } = run;
          // The day observer (S11) changes nothing and accounts for every decision and lane.
          const events: DayEvent[] = [];
          const observed = simulateCheckpoint(population, policy, {
            ...OPTIONS,
            observer: (e) => events.push(e),
          });
          expect(observed).toEqual(run);
          // The tape (S18) too, and played on a new queue it follows the extra lanes.
          const tape: TapeEntry[] = [];
          const queueEvents: QueueEvent[] = [];
          const taped = simulateCheckpoint(population, policy, {
            ...OPTIONS,
            listener: (e) => queueEvents.push(e),
            recorder: (e) => tape.push(e),
          });
          expect(taped).toEqual(run);
          expect(playTape(population, policy, tape, OPTIONS.classification)).toEqual(queueEvents);
          // The lanes of the tape are those the observer saw open, at each change of their number.
          const opened: { atMs: number; lanes: number }[] = [];
          for (const e of events) {
            if (e.type === 'LANES' && opened.at(-1)?.lanes !== e.open) {
              opened.push({ atMs: e.atMs, lanes: e.open });
            }
          }
          expect(
            tape.flatMap((e) => (e.type === 'LANES' ? [{ atMs: e.atMs, lanes: e.lanes }] : [])),
          ).toEqual(opened);
          const decided = events.filter((e) => e.type === 'LANE_DECISION');
          expect(decided.length).toBe(stats.laneDecisions);
          expect(decided.filter((e) => e.followed).length).toBe(stats.laneDecisionsFollowed);
          expect(
            decided.every((e) => e.by === (mode === 'reactive' ? 'SUPERVISOR' : 'GATEFLOW')),
          ).toBe(true);
          const lanes = events.filter((e) => e.type === 'LANES');
          let extraMs = 0;
          lanes.forEach((e, i) => {
            const from = Math.max(e.atMs, stats.firstArrivalMs);
            const to = Math.min(lanes[i + 1]?.atMs ?? Infinity, stats.lastServiceEndMs);
            if (to > from) extraMs += e.extra * (to - from);
          });
          expect(extraMs).toBe(stats.extraLaneMs);
          expect(run.outcomes.every((o) => o.serviceEndMs >= o.serviceStartMs)).toBe(true);
          expect(stats.maxOpenLanes).toBeLessThanOrEqual(lanesAvailable);
          expect(stats.maxOpenLanes).toBeLessThanOrEqual(planned + staff.maxExtraLanes);
          expect(run.outcomes.every((o) => o.laneIndex < lanesAvailable)).toBe(true);
          expect(stats.laneDecisionsFollowed).toBeLessThanOrEqual(stats.laneDecisions);
          expect(stats.lanesClosed).toBeLessThanOrEqual(stats.lanesOpened);
          expect(stats.extraLaneMs).toBeGreaterThanOrEqual(0);
          expect(stats.extraLaneMs).toBeLessThanOrEqual(
            staff.maxExtraLanes * Math.max(0, stats.lastServiceEndMs - stats.firstArrivalMs),
          );
          if (stats.lanesOpened === 0) expect(stats.extraLaneMs).toBe(0);
          // Without staff on call, exactly the run of the plan.
          if (staff.maxExtraLanes === 0 || lanesAvailable === planned) {
            expect(decisions(run)).toEqual(
              decisions(simulateCheckpoint(population, FIFO, OPTIONS)),
            );
          }
        },
      ),
      { numRuns: 200 },
    );
  });
});
