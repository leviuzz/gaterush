import { MS_PER_HOUR, MS_PER_MINUTE } from '@gateflow/domain';
import { exp, labelCode, streamFor } from '@gateflow/sim-kernel';
import type { RandomSource } from '@gateflow/sim-kernel';
import { BUCKET_MS, ForecastError, HORIZONS_MIN, SPAN_MS, quantile } from './base';
import type { Band } from './base';
import { UNCALIBRATED, levelsAt, validateCalibration } from './calibration';
import type { Calibration, Levels } from './calibration';

/*
 * GateFlow Predict, a preview (S21, ADR-054): from the live state of a checkpoint, what the next 90
 * minutes may bring. Arrivals come from simulated days of the checkpoint's scenario, scaled by the
 * arrivals of the last hour as GateFlow's simulated lane recommendations do (S8), the scaling
 * fading over the next minutes: on simulated days the last hour says little about the hours after
 * it. The queue is a Monte Carlo of its flow: the people not yet admitted, served by the lanes at
 * their rate, with a random variation per minute. The lanes follow the scenario's plan, keeping
 * today's difference from it (an extra lane, a lane out of service). Every band reads the paths at
 * three quantile levels: the 10th, 50th and 90th percentile, or levels calibrated on simulated
 * days (S21.3). The same inputs give the same forecast.
 */

/** Paths drawn from each simulated day of the profile (each with its own service draws). */
export const PATHS_PER_DAY = 4;
/** The seed of the service draws: a forecast never depends on anything else at random. */
export const FORECAST_SEED = 20_261_122;
/**
 * How fast the scaling by the last hour fades (minutes): `t` minutes ahead the arrivals are scaled
 * by 1 + (scale - 1) e^(-t/15). Chosen on simulated days apart from the reports' (ADR-054).
 */
export const SCALE_FADE_MIN = 15;
/** How far ahead the wait of a party is followed, at most: 12 hours. */
const MAX_WAIT_MIN = 12 * 60;

/** From `fromMs` on, the plan opens `lanes` lanes. */
export interface PlannedLanes {
  readonly fromMs: number;
  readonly lanes: number;
}

/**
 * What a forecast knows of a checkpoint's days from its scenario (S21): the people taking a number
 * in each bucket of simulated days, one row per day, and the lane plan. Times are milliseconds
 * since the start of the scenario's day (local midnight).
 */
export interface CheckpointProfile {
  /** Start of the first bucket (may be before midnight). */
  readonly startMs: number;
  readonly bucketMs: number;
  /** People arriving in each bucket, for each simulated day; every row has the same length. */
  readonly days: readonly (readonly number[])[];
  /**
   * The lanes the plan opens over the day, sorted by `fromMs`; the first entry also applies
   * before it. Empty: no plan, the lanes open now stay open.
   */
  readonly lanePlan: readonly PlannedLanes[];
  /**
   * The lanes and staff the checkpoint has beyond its plan (S8), for recommendations (S22); null
   * when the scenario gives none.
   */
  readonly staffing: CheckpointStaffing | null;
}

/** What a checkpoint has beyond its lane plan (S8): the room for extra lanes. */
export interface CheckpointStaffing {
  /** Lanes the checkpoint physically has. */
  readonly lanesAvailable: number;
  /** Extra lanes beyond the plan that staff on call can open at the same time. */
  readonly maxExtraLanes: number;
  /** The estimate of the time from a decision to a lane screening. */
  readonly openDelayMs: number;
  /** An extra lane stays open at least this long. */
  readonly minOpenMs: number;
}

/** What a forecast reads of a checkpoint now: what the live system knows. */
export interface LiveState {
  /** Now, in milliseconds since the start of the day (the profile's clock). */
  readonly nowMs: number;
  /** People who took a number in the last hour (each party once). */
  readonly arrivalsLastHour: number;
  /** People not yet admitted: waiting, announced, called. */
  readonly backlog: number;
  readonly lanesOpen: number;
  readonly ratePerLanePerHour: number;
  /**
   * Lanes opened (or closed, when negative) from `fromMs` on, beyond what the plan and today's
   * difference from it give (S22: what a recommendation would change). None: no change.
   */
  readonly laneChange?: { readonly fromMs: number; readonly lanes: number };
}

/** Arrivals in a 5-minute bucket from now. */
export interface ForecastBucket {
  /** Minutes from now to the bucket's start. */
  readonly fromMin: number;
  readonly arrivals: Band;
}

export interface ForecastHorizon {
  readonly minutes: number;
  /** People arriving in the 5 minutes before the horizon. */
  readonly arrivals: Band;
  /** People not yet admitted at the horizon. */
  readonly backlog: Band;
  /** The wait of a party arriving at the horizon: until the lanes have served the people ahead. */
  readonly waitMs: Band;
}

export interface Forecast {
  readonly nowMs: number;
  /** Arrivals of the last hour the profile expects, on average. */
  readonly expectedLastHour: number;
  /**
   * Seen against expected, as S8's rule has it: (seen + 5) / (expected + 5), within 0.5 and 2. It
   * applies now and fades ({@link SCALE_FADE_MIN}).
   */
  readonly scale: number;
  readonly paths: number;
  /** The capacity now: the lanes open, at their rate. */
  readonly capacityPerHour: number;
  /** The lanes the paths assume at each horizon: the plan's, with today's difference from it. */
  readonly lanesAt: readonly { readonly minutes: number; readonly lanes: number }[];
  /** True when the bands read the paths at calibrated levels (S21.3). */
  readonly calibrated: boolean;
  readonly buckets: readonly ForecastBucket[];
  readonly horizons: readonly ForecastHorizon[];
}

function validateProfile(profile: CheckpointProfile): void {
  if (!Number.isSafeInteger(profile.startMs)) throw new ForecastError('startMs is not an integer');
  if (!Number.isSafeInteger(profile.bucketMs) || profile.bucketMs < MS_PER_MINUTE) {
    throw new ForecastError('a bucket is a whole number of milliseconds, a minute at least');
  }
  if (profile.bucketMs % MS_PER_MINUTE !== 0) {
    throw new ForecastError('a bucket is a whole number of minutes');
  }
  const first = profile.days[0];
  if (first === undefined) throw new ForecastError('a profile has at least one day');
  for (const day of profile.days) {
    if (day.length !== first.length) throw new ForecastError('every day has the same buckets');
    for (const people of day) {
      if (!Number.isFinite(people) || people < 0) {
        throw new ForecastError('arrivals are finite and not negative');
      }
    }
  }
  let previous = -Infinity;
  for (const entry of profile.lanePlan) {
    if (!Number.isSafeInteger(entry.fromMs) || entry.fromMs <= previous) {
      throw new ForecastError('the lane plan is sorted by time, one entry per instant');
    }
    if (!Number.isSafeInteger(entry.lanes) || entry.lanes < 0) {
      throw new ForecastError('the plan opens a whole number of lanes');
    }
    previous = entry.fromMs;
  }
}

function validateState(state: LiveState): void {
  if (!Number.isSafeInteger(state.nowMs)) throw new ForecastError('now is not an integer');
  if (!Number.isFinite(state.arrivalsLastHour) || state.arrivalsLastHour < 0) {
    throw new ForecastError('the arrivals of the last hour are not negative');
  }
  if (!Number.isFinite(state.backlog) || state.backlog < 0) {
    throw new ForecastError('the people not yet admitted are not negative');
  }
  if (!Number.isSafeInteger(state.lanesOpen) || state.lanesOpen < 1) {
    throw new ForecastError('at least one lane is open');
  }
  if (!Number.isFinite(state.ratePerLanePerHour) || state.ratePerLanePerHour <= 0) {
    throw new ForecastError('the rate per lane is positive');
  }
  const change = state.laneChange;
  if (
    change !== undefined &&
    (!Number.isSafeInteger(change.fromMs) || !Number.isSafeInteger(change.lanes))
  ) {
    throw new ForecastError('a change of lanes is a whole number of lanes from a time');
  }
}

/** People per minute in the minute that starts at `t`, on one day of the profile. */
function perMinute(profile: CheckpointProfile, day: readonly number[], t: number): number {
  const bucket = Math.floor((t - profile.startMs) / profile.bucketMs);
  return (day[bucket] ?? 0) / (profile.bucketMs / MS_PER_MINUTE);
}

/** Arrivals the profile expects, on average, in the hour before `nowMs`. */
export function expectedLastHour(profile: CheckpointProfile, nowMs: number): number {
  let total = 0;
  for (const day of profile.days) {
    for (let t = nowMs - MS_PER_HOUR; t < nowMs; t += MS_PER_MINUTE) {
      total += perMinute(profile, day, t);
    }
  }
  return total / profile.days.length;
}

/** The lanes the plan opens at `t`; null without a plan. */
export function plannedLanesAt(plan: readonly PlannedLanes[], t: number): number | null {
  let lanes: number | null = plan[0]?.lanes ?? null;
  for (const entry of plan) {
    if (entry.fromMs > t) break;
    lanes = entry.lanes;
  }
  return lanes;
}

/** GateFlow's scaling of a forecast by what it sees (S8): between 0.5 and 2. */
export function arrivalScale(seen: number, expected: number): number {
  return Math.min(2, Math.max(0.5, (seen + 5) / (expected + 5)));
}

/**
 * A Poisson count with mean `mean` (Knuth's method, the kernel's exact exponential): the people
 * the lanes serve in a minute.
 */
function poisson(rng: RandomSource, mean: number): number {
  if (mean <= 0) return 0;
  const limit = exp(-mean);
  let k = 0;
  let product = rng.nextFloat();
  while (product > limit) {
    k++;
    product *= rng.nextFloat();
  }
  return k;
}

/** A band of sorted values, read at `levels` (the 10th, 50th and 90th percentiles by default). */
export function bandAt(sorted: readonly number[], levels: Levels = UNCALIBRATED): Band {
  return {
    p10: quantile(sorted, levels.p10),
    p50: quantile(sorted, levels.p50),
    p90: quantile(sorted, levels.p90),
  };
}

/** The band of values: their 10th, 50th and 90th percentiles. */
export function bandOf(values: readonly number[]): Band {
  return bandAt([...values].sort((a, b) => a - b));
}

/** The paths of a forecast at a horizon, each sorted. */
export interface HorizonPaths {
  readonly minutes: number;
  /** People arriving in the 5 minutes before the horizon. */
  readonly arrivals: readonly number[];
  /** People not yet admitted at the horizon. */
  readonly backlog: readonly number[];
  /** The wait of a party arriving at the horizon. */
  readonly waitMs: readonly number[];
}

/** Every path of a forecast, sorted: what its bands read (S21.3). */
export interface ForecastPaths {
  readonly nowMs: number;
  readonly expectedLastHour: number;
  readonly scale: number;
  readonly paths: number;
  readonly capacityPerHour: number;
  readonly lanesAt: readonly { readonly minutes: number; readonly lanes: number }[];
  /** People arriving in each 5-minute bucket from now. */
  readonly buckets: readonly (readonly number[])[];
  /** Every 5 minutes from now to 90: the paths at the end of each bucket (S22). */
  readonly steps: readonly HorizonPaths[];
  /** The steps at 15, 30, 60 and 90 minutes. */
  readonly horizons: readonly HorizonPaths[];
}

const ascending = (a: number, b: number) => a - b;

/**
 * The paths of the next 90 minutes of a checkpoint from its live state: arrivals per 5-minute
 * bucket, and at 15, 30, 60 and 90 minutes the arrivals, the people not yet admitted and the wait
 * of a party arriving then.
 */
export function forecastPaths(profile: CheckpointProfile, state: LiveState): ForecastPaths {
  validateProfile(profile);
  validateState(state);
  const expected = expectedLastHour(profile, state.nowMs);
  const scale = arrivalScale(state.arrivalsLastHour, expected);
  const plannedNow = plannedLanesAt(profile.lanePlan, state.nowMs);
  /** The lanes at `t`: the plan's, with the difference between the lanes open now and the plan. */
  const change = state.laneChange;
  const lanesAt = (t: number): number => {
    const planned = plannedLanesAt(profile.lanePlan, t);
    const base =
      planned === null || plannedNow === null
        ? state.lanesOpen
        : state.lanesOpen + planned - plannedNow;
    return Math.max(1, base + (change !== undefined && t >= change.fromMs ? change.lanes : 0));
  };
  const capacityAt = (t: number): number => (lanesAt(t) * state.ratePerLanePerHour) / 60;
  /** Minutes until the lanes from `t` have served `people`, at their expected capacity. */
  const waitFrom = (people: number, t: number): number => {
    let left = people;
    for (let m = 0; m < MAX_WAIT_MIN; m++) {
      const capacity = capacityAt(t + m * MS_PER_MINUTE);
      if (capacity >= left) return m + left / capacity;
      left -= capacity;
    }
    return MAX_WAIT_MIN;
  };
  const minutes = SPAN_MS / MS_PER_MINUTE;
  const bucketMinutes = BUCKET_MS / MS_PER_MINUTE;
  const buckets = minutes / bucketMinutes;
  const arrivalsByBucket: number[][] = Array.from({ length: buckets }, () => []);
  /** The minutes of every 5-minute step: the horizons are some of them. */
  const stepMinutes = Array.from({ length: buckets }, (_, i) => (i + 1) * bucketMinutes);
  const backlogAt = new Map<number, number[]>(stepMinutes.map((m) => [m, []]));
  const waitAt = new Map<number, number[]>(stepMinutes.map((m) => [m, []]));
  const capacities = Array.from({ length: minutes }, (_, m) =>
    capacityAt(state.nowMs + m * MS_PER_MINUTE),
  );
  /** The scaling `m` minutes ahead: the last hour's, fading. */
  const scales = Array.from(
    { length: minutes },
    (_, m) => 1 + (scale - 1) * exp(-m / SCALE_FADE_MIN),
  );
  const label = labelCode('forecast.service');
  profile.days.forEach((day, d) => {
    for (let r = 0; r < PATHS_PER_DAY; r++) {
      const rng = streamFor(FORECAST_SEED, [label, d, r]);
      let backlog = state.backlog;
      let inBucket = 0;
      for (let m = 0; m < minutes; m++) {
        const arriving =
          perMinute(profile, day, state.nowMs + m * MS_PER_MINUTE) * (scales[m] ?? 1);
        inBucket += arriving;
        backlog = Math.max(0, backlog + arriving - poisson(rng, capacities[m] ?? 0));
        if ((m + 1) % bucketMinutes === 0) {
          arrivalsByBucket[(m + 1) / bucketMinutes - 1]?.push(inBucket);
          inBucket = 0;
        }
        const horizon = m + 1;
        const at = backlogAt.get(horizon);
        if (at !== undefined) {
          at.push(backlog);
          const t = state.nowMs + horizon * MS_PER_MINUTE;
          waitAt.get(horizon)?.push(waitFrom(backlog, t) * MS_PER_MINUTE);
        }
      }
    }
  });
  const sortedBuckets = arrivalsByBucket.map((values) => values.sort(ascending));
  const steps = stepMinutes.map((m) => ({
    minutes: m,
    arrivals: sortedBuckets[m / bucketMinutes - 1] ?? [0],
    backlog: (backlogAt.get(m) ?? [0]).sort(ascending),
    waitMs: (waitAt.get(m) ?? [0]).sort(ascending),
  }));
  return {
    nowMs: state.nowMs,
    expectedLastHour: expected,
    scale,
    paths: profile.days.length * PATHS_PER_DAY,
    capacityPerHour: state.lanesOpen * state.ratePerLanePerHour,
    lanesAt: HORIZONS_MIN.map((h) => ({
      minutes: h,
      lanes: lanesAt(state.nowMs + h * MS_PER_MINUTE),
    })),
    buckets: sortedBuckets,
    steps,
    horizons: HORIZONS_MIN.map(
      (h) =>
        steps[h / bucketMinutes - 1] ?? { minutes: h, arrivals: [0], backlog: [0], waitMs: [0] },
    ),
  };
}

/** The bands of a forecast's paths, at the calibration's levels or at the 10th, 50th and 90th. */
export function bandsOf(paths: ForecastPaths, calibration?: Calibration): Forecast {
  if (calibration !== undefined) validateCalibration(calibration);
  const bucketMinutes = BUCKET_MS / MS_PER_MINUTE;
  return {
    nowMs: paths.nowMs,
    expectedLastHour: paths.expectedLastHour,
    scale: paths.scale,
    paths: paths.paths,
    capacityPerHour: paths.capacityPerHour,
    lanesAt: paths.lanesAt,
    calibrated: calibration !== undefined,
    buckets: paths.buckets.map((sorted, i) => ({
      fromMin: i * bucketMinutes,
      arrivals: bandAt(sorted, levelsAt(calibration, 'arrivals', (i + 1) * bucketMinutes)),
    })),
    horizons: paths.horizons.map((h) => ({
      minutes: h.minutes,
      arrivals: bandAt(h.arrivals, levelsAt(calibration, 'arrivals', h.minutes)),
      backlog: bandAt(h.backlog, levelsAt(calibration, 'backlog', h.minutes)),
      waitMs: bandAt(h.waitMs, levelsAt(calibration, 'wait', h.minutes)),
    })),
  };
}

/**
 * Forecasts the next 90 minutes of a checkpoint from its live state: arrivals per 5-minute bucket,
 * and at 15, 30, 60 and 90 minutes the arrivals, the people not yet admitted and the wait of a
 * party arriving then, each as a band over the paths; calibrated when a calibration is given.
 */
export function forecastFrom(
  profile: CheckpointProfile,
  state: LiveState,
  calibration?: Calibration,
): Forecast {
  return bandsOf(forecastPaths(profile, state), calibration);
}
