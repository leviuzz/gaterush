import { and, eq } from 'drizzle-orm';
import type { ForecastResponse } from '@gateflow/contracts';
import {
  FORECAST_VERSION,
  LIBRARY_CALIBRATION,
  LIBRARY_CALIBRATION_SOURCE,
  forecastFrom,
} from '@gateflow/forecast';
import type { Band, CheckpointProfile, LiveState } from '@gateflow/forecast';
import { arrivalsByBucket, planOf, profileOf } from '@gateflow/sim-metrics';
import type { CheckpointPlan } from '@gateflow/sim-metrics';
import {
  FORECAST_DAYS,
  FORECAST_FIRST_SEED,
  generatePopulation,
  parseScenario,
} from '@gateflow/sim-scenarios';
import type { Scenario } from '@gateflow/sim-scenarios';
import type { Db } from './db/client';
import { simScenario } from './db/schema';
import { liveFigures } from './overview';
import type { CheckpointRow } from './runtime';
import { ApiError, serviceDayNow } from './runtime';
import { zonedEpoch } from './time';

/*
 * GateFlow Predict, a preview (S21, ADR-054): what the next 90 minutes may bring at a checkpoint.
 * The forecast reads what the live system knows now, in one snapshot of the database (the people
 * who took a number in the last hour, the people not yet admitted, the lanes open), and the
 * scenario the checkpoint is configured with: its simulated days and its lane plan. The bands
 * are calibrated on the scenario library (S21.3). Every number it gives is SIMULATED.
 */

const HOUR_MS = 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;
/** Profiles kept in memory, the most recently used. */
const PROFILES_KEPT = 16;

export interface ProfileEntry {
  readonly scenario: Scenario;
  readonly hash: string;
  readonly profile: CheckpointProfile;
}

/**
 * The profile of a scenario, as {@link checkpointProfile} gives it, one simulated day at a time so
 * that requests get in between: a scenario takes a second or two.
 */
export async function profileOfScenario(scenario: Scenario): Promise<CheckpointProfile> {
  const days: Map<number, number>[] = [];
  let plan: CheckpointPlan = { lanePlan: [], staffing: null };
  for (let i = 0; i < FORECAST_DAYS; i++) {
    const population = generatePopulation(scenario, FORECAST_FIRST_SEED + i);
    days.push(arrivalsByBucket(population));
    plan = planOf(population);
    await new Promise<void>((resolve) => {
      setImmediate(resolve);
    });
  }
  return profileOf(days, plan);
}

/** The profiles of the scenarios forecasts read, computed once each (per process). */
export class ProfileCache {
  private readonly entries = new Map<string, Promise<ProfileEntry>>();

  /** The profile of the airport's scenario `hash`; null when the airport has no such scenario. */
  async get(db: Db, airportId: string, hash: string): Promise<ProfileEntry | null> {
    const key = `${airportId}:${hash}`;
    let entry = this.entries.get(key);
    if (entry === undefined) {
      const [row] = await db
        .select({ content: simScenario.content })
        .from(simScenario)
        .where(and(eq(simScenario.airportId, airportId), eq(simScenario.hash, hash)));
      if (row === undefined) return null;
      const scenario = parseScenario(JSON.parse(row.content));
      entry = profileOfScenario(scenario).then((profile) => ({ scenario, hash, profile }));
      this.entries.set(key, entry);
      // A computation that fails is not kept: the next request tries again.
      entry.catch(() => this.entries.delete(key));
      while (this.entries.size > PROFILES_KEPT) {
        const oldest = this.entries.keys().next().value;
        if (oldest === undefined) break;
        this.entries.delete(oldest);
      }
    } else {
      // The most recently used goes last.
      this.entries.delete(key);
      this.entries.set(key, entry);
    }
    return entry;
  }
}

const tenth = (value: number) => Math.round(value * 10) / 10;
const bandOf = (band: Band, scale = 1) => ({
  p10: tenth(band.p10 / scale),
  p50: tenth(band.p50 / scale),
  p90: tenth(band.p90 / scale),
});

/** What a forecast reads of a checkpoint now, in the scenario's clock, and what it needs. */
export interface LiveForecastInput {
  readonly entry: ProfileEntry;
  readonly serviceDay: string;
  /** Now (epoch ms): the server's time, a twin's virtual time. */
  readonly at: number;
  /** The local midnight of the service day (epoch ms): the scenario's clock starts there. */
  readonly midnight: number;
  readonly state: LiveState;
  /** The current state's tickets and figures, read in the same snapshot. */
  readonly live: Awaited<ReturnType<typeof liveFigures>>;
}

/** The scenario's profile of a checkpoint, or 409 NO_SCENARIO. */
export async function profileOfCheckpoint(
  db: Db,
  profiles: ProfileCache,
  cp: CheckpointRow,
): Promise<ProfileEntry> {
  const hash = cp.settings.scenarioHash;
  if (hash === undefined) {
    throw new ApiError(409, 'NO_SCENARIO', 'the checkpoint names no scenario to forecast from');
  }
  const entry = await profiles.get(db, cp.airportId, hash);
  if (entry === null) {
    throw new ApiError(409, 'NO_SCENARIO', 'the scenario of the checkpoint is not saved');
  }
  return entry;
}

/**
 * What the live system knows of a checkpoint now, as a forecast reads it (S21): the people who
 * took a number in the hour before, the people not yet admitted, the lanes open; in one snapshot.
 */
export async function liveForecastInput(
  db: Db,
  profiles: ProfileCache,
  cp: CheckpointRow,
  nowMs: number,
): Promise<LiveForecastInput> {
  const entry = await profileOfCheckpoint(db, profiles, cp);
  const serviceDay = serviceDayNow(cp, nowMs);
  const live = await db.transaction(async (tx) => liveFigures(tx, cp, serviceDay, nowMs), {
    isolationLevel: 'repeatable read',
    accessMode: 'read only',
  });
  const at = live.overview.nowMs;
  // The people who took a number in the hour before now, each party once (a ticket issued again
  // after an expiry keeps its first presentation), as the backtest counts them.
  let arrivalsLastHour = 0;
  for (const r of live.rows) {
    if (
      r.issuedAtMs === r.presentedAtMs &&
      r.presentedAtMs >= at - HOUR_MS &&
      r.presentedAtMs < at
    ) {
      arrivalsLastHour += r.partySize;
    }
  }
  const { waiting, prepare, called } = live.overview.tickets;
  // The scenario's clock: milliseconds since the local midnight of the service day.
  const midnight = zonedEpoch(serviceDay, 0, cp.timeZone);
  return {
    entry,
    serviceDay,
    at,
    midnight,
    live,
    state: {
      nowMs: at - midnight,
      arrivalsLastHour,
      backlog: waiting.people + prepare.people + called.people,
      lanesOpen: live.overview.lanesOpen,
      ratePerLanePerHour: cp.settings.ratePerLanePerHour,
    },
  };
}

/** The forecast of a checkpoint from its current state (S21). */
export async function liveForecast(
  db: Db,
  profiles: ProfileCache,
  cp: CheckpointRow,
  nowMs: number,
): Promise<ForecastResponse> {
  const { entry, serviceDay, at, state } = await liveForecastInput(db, profiles, cp, nowMs);
  const { arrivalsLastHour, backlog } = state;
  // The bands' edges read the paths at the levels calibrated on the scenario library (S21.3).
  const forecast = forecastFrom(entry.profile, state, LIBRARY_CALIBRATION);
  const live = { overview: { lanesOpen: state.lanesOpen } };
  return {
    checkpointId: cp.id,
    serviceDay,
    at: new Date(at).toISOString(),
    model: {
      version: FORECAST_VERSION,
      paths: forecast.paths,
      days: entry.profile.days.length,
      calibration: LIBRARY_CALIBRATION_SOURCE,
      scenario: {
        id: entry.scenario.id,
        title: entry.scenario.title,
        hash: entry.hash,
        dataClassification: entry.scenario.dataClassification,
      },
    },
    state: {
      arrivalsLastHour,
      expectedLastHour: tenth(forecast.expectedLastHour),
      scale: Math.round(forecast.scale * 1000) / 1000,
      backlog,
      lanesOpen: live.overview.lanesOpen,
      ratePerLanePerHour: cp.settings.ratePerLanePerHour,
    },
    buckets: forecast.buckets.map((b) => ({ fromMin: b.fromMin, arrivals: bandOf(b.arrivals) })),
    horizons: forecast.horizons.map((h, i) => ({
      minutes: h.minutes,
      at: new Date(at + h.minutes * MINUTE_MS).toISOString(),
      lanes: forecast.lanesAt[i]?.lanes ?? live.overview.lanesOpen,
      arrivals: bandOf(h.arrivals),
      backlog: bandOf(h.backlog),
      waitMinutes: bandOf(h.waitMs, MINUTE_MS),
    })),
  };
}
