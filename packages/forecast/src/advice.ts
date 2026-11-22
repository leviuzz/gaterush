import { MS_PER_MINUTE } from '@gateflow/domain';
import { quantile } from './base';
import type { Band } from './base';
import { levelsAt } from './calibration';
import type { Calibration } from './calibration';
import { bandAt, forecastPaths, plannedLanesAt } from './forecast';
import type { CheckpointProfile, ForecastPaths, HorizonPaths, LiveState } from './forecast';

/*
 * GateFlow's recommendation of lanes (S22, ADR-056): the rule of S8's simulated recommendations
 * (reports slice-8), on the forecast of S21. GateFlow opens when the median wait of a party
 * arriving within the hour is forecast above the target, with the fewest lanes, within the staff
 * on call and the lanes the checkpoint has, that keep it there, counting the time staff need to
 * open a lane; it closes a lane beyond the plan when, with one lane fewer, the median wait stays
 * low over the hour. Every recommendation says why, when (the lead time), the interval of the
 * wait at its longest (the calibrated band) and the expected benefit there and over the hour.
 */

/** When and how GateFlow recommends lanes. */
export interface AdviceRule {
  /** How often GateFlow reviews the lanes. */
  readonly reviewEveryMs: number;
  /** How far ahead it looks. */
  readonly horizonMs: number;
  /** Open when the median wait of a party arriving within the horizon is above this. */
  readonly targetWaitMs: number;
  /** Close a lane beyond the plan when, with one fewer, the median wait stays below this. */
  readonly closeBelowWaitMs: number;
}

/** GateFlow's rule (S22): every 5 minutes, the next hour, open above 10 minutes, close below 2. */
export const LANE_ADVICE: AdviceRule = {
  reviewEveryMs: 5 * MS_PER_MINUTE,
  horizonMs: 60 * MS_PER_MINUTE,
  targetWaitMs: 10 * MS_PER_MINUTE,
  closeBelowWaitMs: 2 * MS_PER_MINUTE,
};

export const ADVICE_ACTIONS = ['OPEN', 'CLOSE'] as const;
export type AdviceAction = (typeof ADVICE_ACTIONS)[number];

export const ADVICE_REASONS = ['WAIT_ABOVE_TARGET', 'WAIT_LOW_WITH_FEWER_LANES'] as const;
export type AdviceReason = (typeof ADVICE_REASONS)[number];

/** A recommendation of lanes: what to do, why, when, and what it is expected to change. */
export interface LaneAdvice {
  readonly action: AdviceAction;
  /** Lanes to open, or to close (always 1). */
  readonly lanes: number;
  readonly reason: AdviceReason;
  /** Lanes open when advised. */
  readonly lanesOpen: number;
  /**
   * The lead time: minutes from now until the wait is first forecast above the target (OPEN); 0
   * for a lane to close now (CLOSE).
   */
  readonly leadMinutes: number;
  /**
   * Minutes from now to the time the interval and the benefit speak of: the longest wait as
   * things are (OPEN), the longest with one lane fewer (CLOSE).
   */
  readonly atMinutes: number;
  /** The wait of a party arriving then, in ms, as things are: the calibrated band. */
  readonly without: Band;
  /** The same with the lanes advised. */
  readonly with: Band;
  /** The longest median wait over the horizon (ms), as things are and with the lanes advised. */
  readonly peakWithoutMs: number;
  readonly peakWithMs: number;
}

/** What the rule needs besides the forecast's inputs. */
export interface AdviceOptions {
  readonly calibration?: Calibration;
  readonly rule?: AdviceRule;
  /** When the lanes open last changed: a lane beyond the plan stays open its minimum first. */
  readonly lanesChangedAtMs?: number | null;
}

const median = (sorted: readonly number[]): number => quantile(sorted, 0.5);

/** The steps of a forecast within the horizon. */
const within = (paths: ForecastPaths, rule: AdviceRule): readonly HorizonPaths[] =>
  paths.steps.filter((s) => s.minutes * MS_PER_MINUTE <= rule.horizonMs);

/** The step of the longest median wait (the first of equal ones). */
const worstOf = (steps: readonly HorizonPaths[]): HorizonPaths | undefined =>
  steps.reduce<HorizonPaths | undefined>(
    (worst, s) => (worst === undefined || median(s.waitMs) > median(worst.waitMs) ? s : worst),
    undefined,
  );

/** The longest median wait over steps. */
const peakOf = (steps: readonly HorizonPaths[]): number =>
  steps.reduce((peak, s) => Math.max(peak, median(s.waitMs)), 0);

/**
 * The lanes GateFlow may still open: the lanes the checkpoint has, and the staff of the plan and
 * on call beyond it (S8's room; below the plan, the plan's staff are on duty). None without what
 * the scenario says of them.
 */
export function roomForLanes(
  profile: CheckpointProfile,
  state: Pick<LiveState, 'nowMs' | 'lanesOpen'>,
): number {
  const staffing = profile.staffing;
  if (staffing === null) return 0;
  const planned = plannedLanesAt(profile.lanePlan, state.nowMs) ?? state.lanesOpen;
  const staffed = planned + staffing.maxExtraLanes;
  return Math.max(0, Math.min(staffing.lanesAvailable, staffed) - state.lanesOpen);
}

/** Whether GateFlow may close a lane now: one beyond the plan, open its minimum, not the last. */
function closableLane(
  profile: CheckpointProfile,
  state: Pick<LiveState, 'nowMs' | 'lanesOpen'>,
  lanesChangedAtMs: number | null,
): boolean {
  const planned = plannedLanesAt(profile.lanePlan, state.nowMs);
  return (
    planned !== null &&
    state.lanesOpen > planned &&
    state.lanesOpen > 1 &&
    (lanesChangedAtMs === null ||
      state.nowMs - lanesChangedAtMs >= (profile.staffing?.minOpenMs ?? 0))
  );
}

/**
 * Whether the rule could recommend anything with these lanes now, whatever the forecast: a lane
 * to open within the room, or one beyond the plan to close. A review that finds neither needs no
 * forecast.
 */
export function laneChangePossible(
  profile: CheckpointProfile,
  state: Pick<LiveState, 'nowMs' | 'lanesOpen'>,
  lanesChangedAtMs: number | null = null,
): boolean {
  return roomForLanes(profile, state) > 0 || closableLane(profile, state, lanesChangedAtMs);
}

/**
 * GateFlow's recommendation now, or null: nothing to change. Opens when the median wait is
 * forecast above the target within the horizon and a lane can be opened; closes a lane beyond the
 * plan when one fewer keeps the median wait low over the horizon.
 */
export function adviseLanes(
  profile: CheckpointProfile,
  state: LiveState,
  options: AdviceOptions = {},
): LaneAdvice | null {
  const rule = options.rule ?? LANE_ADVICE;
  const band = (step: HorizonPaths): Band =>
    bandAt(step.waitMs, levelsAt(options.calibration, 'wait', step.minutes));
  const room = roomForLanes(profile, state);
  const closable = closableLane(profile, state, options.lanesChangedAtMs ?? null);
  // Nothing to open and nothing to close: no forecast needed.
  if (room <= 0 && !closable) return null;
  const base = within(forecastPaths(profile, state), rule);
  const breach = base.find((s) => median(s.waitMs) > rule.targetWaitMs);
  if (breach !== undefined) {
    if (room <= 0) return null;
    const readyAt = state.nowMs + (profile.staffing?.openDelayMs ?? 0);
    const withLanes = (lanes: number) =>
      within(forecastPaths(profile, { ...state, laneChange: { fromMs: readyAt, lanes } }), rule);
    // The fewest lanes that keep the median wait within the target, up to the room.
    let lanes = 1;
    let changed = withLanes(lanes);
    while (lanes < room && peakOf(changed) > rule.targetWaitMs) {
      lanes++;
      changed = withLanes(lanes);
    }
    const worst = worstOf(base) ?? breach;
    const then = changed.find((s) => s.minutes === worst.minutes) ?? worst;
    return {
      action: 'OPEN',
      lanes,
      reason: 'WAIT_ABOVE_TARGET',
      lanesOpen: state.lanesOpen,
      leadMinutes: breach.minutes,
      atMinutes: worst.minutes,
      without: band(worst),
      with: band(then),
      peakWithoutMs: peakOf(base),
      peakWithMs: peakOf(changed),
    };
  }
  // Closing: a lane beyond the plan, open its minimum, not needed over the horizon.
  if (!closable) return null;
  const fewer = within(
    forecastPaths(profile, { ...state, laneChange: { fromMs: state.nowMs, lanes: -1 } }),
    rule,
  );
  const peakFewer = peakOf(fewer);
  if (peakFewer >= rule.closeBelowWaitMs) return null;
  const worst = worstOf(fewer);
  if (worst === undefined) return null;
  const asThey = base.find((s) => s.minutes === worst.minutes) ?? worst;
  return {
    action: 'CLOSE',
    lanes: 1,
    reason: 'WAIT_LOW_WITH_FEWER_LANES',
    lanesOpen: state.lanesOpen,
    leadMinutes: 0,
    atMinutes: worst.minutes,
    without: band(asThey),
    with: band(worst),
    peakWithoutMs: peakOf(base),
    peakWithMs: peakFewer,
  };
}
