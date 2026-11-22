import { describe, expect, it } from 'vitest';
import {
  LANE_ADVICE,
  LIBRARY_CALIBRATION,
  adviseLanes,
  laneChangePossible,
  roomForLanes,
} from '../src';
import type { CheckpointProfile, CheckpointStaffing, LiveState } from '../src';

const MIN = 60_000;

/** A day with `perMinute` people arriving every minute, the same on 20 simulated days. */
const profile = (
  perMinute: number,
  lanePlan: CheckpointProfile['lanePlan'],
  staffing: CheckpointStaffing | null,
): CheckpointProfile => ({
  startMs: 0,
  bucketMs: 5 * MIN,
  days: Array.from({ length: 20 }, () => Array.from({ length: 288 }, () => perMinute * 5)),
  lanePlan,
  staffing,
});

const staffing: CheckpointStaffing = {
  lanesAvailable: 4,
  maxExtraLanes: 2,
  openDelayMs: 10 * MIN,
  minOpenMs: 30 * MIN,
};

/** One lane of 60 an hour (one a minute), the plan's; the last hour as expected. */
const state = (perMinute: number, overrides: Partial<LiveState> = {}): LiveState => ({
  nowMs: 8 * 60 * MIN,
  arrivalsLastHour: perMinute * 60,
  backlog: 0,
  lanesOpen: 1,
  ratePerLanePerHour: 60,
  ...overrides,
});

describe("GateFlow's recommendation of lanes (S22)", () => {
  it('opens the fewest lanes that keep the wait within 10 minutes, saying when and how much', () => {
    // 1.5 a minute for 1 a minute: the queue grows by half a person a minute.
    const p = profile(1.5, [{ fromMs: 0, lanes: 1 }], staffing);
    const advice = adviseLanes(p, state(1.5), { calibration: LIBRARY_CALIBRATION });
    expect(advice).not.toBeNull();
    if (advice === null) return;
    expect(advice).toMatchObject({ action: 'OPEN', lanes: 1, reason: 'WAIT_ABOVE_TARGET' });
    expect(advice.lanesOpen).toBe(1);
    // The wait first passes 10 minutes after about 20 minutes: the lead time.
    expect(advice.leadMinutes).toBeGreaterThanOrEqual(15);
    expect(advice.leadMinutes).toBeLessThanOrEqual(30);
    // The longest wait as things are: at the end of the hour, about 30 minutes; with a second
    // lane from 10 minutes on, the queue drains: the benefit.
    expect(advice.atMinutes).toBe(60);
    expect(advice.peakWithoutMs).toBeGreaterThan(20 * MIN);
    expect(advice.peakWithMs).toBeLessThanOrEqual(LANE_ADVICE.targetWaitMs);
    expect(advice.with.p50).toBeLessThan(advice.without.p50);
    for (const band of [advice.without, advice.with]) {
      expect(band.p10).toBeLessThanOrEqual(band.p50);
      expect(band.p50).toBeLessThanOrEqual(band.p90);
    }
  });

  it('opens up to the room it has, counting the time staff need to open a lane', () => {
    // 2.5 a minute for 1: one lane more is not enough, two are the most the staff allow.
    const p = profile(2.5, [{ fromMs: 0, lanes: 1 }], staffing);
    expect(roomForLanes(p, state(2.5))).toBe(2);
    expect(adviseLanes(p, state(2.5))?.lanes).toBe(2);
    // Lanes beyond the plan take staff on call; below it, the plan's staff are on duty: back to
    // the plan and two more, within the four lanes the checkpoint has.
    expect(roomForLanes(p, state(2.5, { lanesOpen: 2 }))).toBe(1);
    const planOfThree = profile(2.5, [{ fromMs: 0, lanes: 3 }], staffing);
    expect(roomForLanes(planOfThree, state(2.5, { lanesOpen: 1 }))).toBe(3);
    expect(roomForLanes(planOfThree, state(2.5, { lanesOpen: 4 }))).toBe(0);
    // A queue already long: the lanes come in 10 minutes, the wait passes 10 minutes before.
    const late = adviseLanes(p, state(2.5, { backlog: 30 }));
    expect(late?.leadMinutes).toBe(5);
    const sooner = adviseLanes(
      { ...p, staffing: { ...staffing, openDelayMs: 0 } },
      state(2.5, { backlog: 30 }),
    );
    expect(sooner?.peakWithMs).toBeLessThan(late?.peakWithMs ?? 0);
  });

  it('recommends nothing when the lanes keep up, or when no lane can be opened', () => {
    const calm = profile(0.5, [{ fromMs: 0, lanes: 1 }], staffing);
    expect(adviseLanes(calm, state(0.5))).toBeNull();
    // A queue forecast, but nothing to open: no staffing known, or every lane open.
    const busy = profile(1.5, [{ fromMs: 0, lanes: 1 }], null);
    expect(roomForLanes(busy, state(1.5))).toBe(0);
    expect(adviseLanes(busy, state(1.5))).toBeNull();
    const full = profile(6, [{ fromMs: 0, lanes: 4 }], staffing);
    expect(adviseLanes(full, state(6, { lanesOpen: 4 }))).toBeNull();
    // Neither a lane to open nor one to close: a review needs no forecast at all.
    expect(laneChangePossible(busy, state(1.5))).toBe(false);
    expect(laneChangePossible(full, state(6, { lanesOpen: 4 }))).toBe(false);
    expect(laneChangePossible(calm, state(0.5))).toBe(true);
    // Every lane open, one beyond the plan: a lane to close, once open its 30 minutes.
    const two = { ...busy, staffing: { ...staffing, lanesAvailable: 2 } };
    const beyond = state(1.5, { lanesOpen: 2 });
    expect(roomForLanes(two, beyond)).toBe(0);
    expect(laneChangePossible(two, beyond, beyond.nowMs - 10 * MIN)).toBe(false);
    expect(laneChangePossible(two, beyond, beyond.nowMs - 45 * MIN)).toBe(true);
  });

  it('closes a lane beyond the plan that the next hour does not need, once open long enough', () => {
    // Two lanes planned, three open; half a person a minute: two lanes are plenty.
    const p = profile(0.5, [{ fromMs: 0, lanes: 2 }], staffing);
    const s = state(0.5, { lanesOpen: 3 });
    const advice = adviseLanes(p, s, { lanesChangedAtMs: s.nowMs - 45 * MIN });
    expect(advice).toMatchObject({
      action: 'CLOSE',
      lanes: 1,
      reason: 'WAIT_LOW_WITH_FEWER_LANES',
      leadMinutes: 0,
      lanesOpen: 3,
    });
    expect(advice?.peakWithMs).toBeLessThan(LANE_ADVICE.closeBelowWaitMs);
    // Opened 10 minutes ago: it stays its 30 minutes.
    expect(adviseLanes(p, s, { lanesChangedAtMs: s.nowMs - 10 * MIN })).toBeNull();
    // The plan's own lanes are never closed by a recommendation.
    expect(adviseLanes(p, state(0.5, { lanesOpen: 2 }))).toBeNull();
  });
});
