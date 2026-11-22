import { BUCKET_MS } from '@gateflow/forecast';
import type { CheckpointProfile, CheckpointStaffing, PlannedLanes } from '@gateflow/forecast';
import type { Population } from '@gateflow/sim-model';
import { FORECAST_DAYS, FORECAST_FIRST_SEED, generatePopulation } from '@gateflow/sim-scenarios';
import type { Scenario } from '@gateflow/sim-scenarios';

/*
 * What GateFlow's forecasts know of a scenario (S21, ADR-054): the arrivals of its simulated days
 * in 5-minute buckets, its lane plan and its staff on call. The API, the backtest and the
 * simulated console (S22.3) read the same profile.
 */

/** The people of the parties taking a number (assisted ones take none) per 5-minute bucket. */
export function arrivalsByBucket(population: Population): Map<number, number> {
  const day = new Map<number, number>();
  for (const p of population.passengers) {
    if (p.path !== 'QUEUE') continue;
    const bucket = Math.floor(p.arrivalMs / BUCKET_MS);
    day.set(bucket, (day.get(bucket) ?? 0) + p.partySize);
  }
  return day;
}

/** What a profile keeps of a day's population besides its arrivals: the lanes and the staff. */
export interface CheckpointPlan {
  readonly lanePlan: readonly PlannedLanes[];
  readonly staffing: CheckpointStaffing | null;
}

/** The lane plan and the staffing beyond it (S8) of a simulated day: the scenario's. */
export function planOf(population: Population): CheckpointPlan {
  const staffing = population.staffing;
  return {
    lanePlan: population.checkpoint.laneSchedule.map((e) => ({ fromMs: e.fromMs, lanes: e.lanes })),
    staffing:
      staffing === undefined
        ? null
        : {
            lanesAvailable: staffing.lanesAvailable,
            maxExtraLanes: staffing.maxExtraLanes,
            openDelayMs: staffing.openDelayEstimateMs,
            minOpenMs: staffing.minOpenMs,
          },
  };
}

/**
 * A profile from the arrivals of simulated days ({@link arrivalsByBucket}), the lane plan and the
 * staffing beyond it.
 */
export function profileOf(
  days: readonly ReadonlyMap<number, number>[],
  plan: CheckpointPlan,
): CheckpointProfile {
  const buckets = days.flatMap((day) => [...day.keys()]);
  const lanePlan = plan.lanePlan.map((e) => ({ fromMs: e.fromMs, lanes: e.lanes }));
  if (buckets.length === 0) {
    return {
      startMs: 0,
      bucketMs: BUCKET_MS,
      days: days.map(() => []),
      lanePlan,
      staffing: plan.staffing,
    };
  }
  const first = Math.min(...buckets);
  const last = Math.max(...buckets);
  return {
    startMs: first * BUCKET_MS,
    bucketMs: BUCKET_MS,
    days: days.map((day) => {
      const row: number[] = [];
      for (let b = first; b <= last; b++) row.push(day.get(b) ?? 0);
      return row;
    }),
    lanePlan,
    staffing: plan.staffing,
  };
}

/**
 * What forecasts know of a scenario's days: the people taking a number in 5-minute buckets, on
 * the days the S8 forecast learns from (seeds from {@link FORECAST_FIRST_SEED}, never a day of
 * the reports or of a backtest), and the scenario's lane plan and staff on call, the same every
 * day.
 */
export function checkpointProfile(scenario: Scenario, days = FORECAST_DAYS): CheckpointProfile {
  if (!Number.isSafeInteger(days) || days < 1) {
    throw new RangeError(`days must be a positive integer, got ${days}`);
  }
  const counts: Map<number, number>[] = [];
  let plan: CheckpointPlan = { lanePlan: [], staffing: null };
  for (let i = 0; i < days; i++) {
    const population = generatePopulation(scenario, FORECAST_FIRST_SEED + i);
    counts.push(arrivalsByBucket(population));
    plan = planOf(population);
  }
  return profileOf(counts, plan);
}
