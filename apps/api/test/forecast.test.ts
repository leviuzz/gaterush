import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import {
  ForecastResponse,
  OverviewResponse,
  TwinOptionsResponse,
  TwinRun,
} from '@gateflow/contracts';
import {
  FORECAST_VERSION,
  LIBRARY_CALIBRATION,
  LIBRARY_CALIBRATION_SOURCE,
  forecastFrom,
} from '@gateflow/forecast';
import { PRIORITY_V3_POLICY } from '@gateflow/queue-core';
import {
  SimulatedDay,
  applyScenarioSettings,
  arrivalClassification,
  checkpointProfile,
  planBacktest,
} from '@gateflow/sim-metrics';
import { parseScenarioText } from '@gateflow/sim-scenarios';
import type { Scenario } from '@gateflow/sim-scenarios';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app';
import { checkpoint, twinRun } from '../src/db/schema';
import { profileOfScenario } from '../src/forecast';
import { randomIds } from '../src/ids';
import { seedDemo } from '../src/seed';
import { scenarioHashOf } from '../src/simulations';
import { zonedEpoch } from '../src/time';
import { freshDatabase } from './database';
import { staffCookie } from './staff';

/*
 * GateFlow Predict on PostgreSQL (S21, ADR-054). The acceptance: the forecast of a twin's
 * checkpoint reads, at its virtual time, exactly what the backtest gives a forecast of the same
 * simulated day at that time (the arrivals of the last hour, the people not yet admitted, the
 * lanes): the backtest measures the forecasts the console shows.
 */

function scenarioOf(name: string): Scenario {
  const file = fileURLToPath(new URL(`../../../scenarios/${name}`, import.meta.url));
  return parseScenarioText(readFileSync(file, 'utf8'), 'yaml', {
    read: (path) => readFileSync(join(dirname(file), path), 'utf8'),
    sha256: (text) => createHash('sha256').update(text).digest('hex'),
  });
}

const scenario = scenarioOf('single-checkpoint-disrupted.yaml');
const DAY = '2026-11-23';
const TZ = 'Europe/Rome';
const MIN = 60_000;
const clock = {
  t: zonedEpoch(DAY, 6 * 60 * MIN, TZ),
  now() {
    return this.t;
  },
};

let database: Awaited<ReturnType<typeof freshDatabase>>;
let app: FastifyInstance;
let airportId: string;
let checkpointId: string;
let supervisor: string;
let run: TwinRun;

beforeAll(async () => {
  database = await freshDatabase({ maxConnections: 12 });
  const seeded = await seedDemo(database.db, scenario, {
    now: clock.now(),
    ids: randomIds(clock),
    serviceDay: DAY,
  });
  airportId = seeded.airportId;
  checkpointId = seeded.checkpointId;
  app = buildApp({ db: database.db, clock, twin: { library: [scenario] } });
  supervisor = await staffCookie(app, database.db, clock, airportId, 'SUPERVISOR');
  // A twin plays the disrupted morning to 06:40, in its peak, to a checkpoint of its own.
  const admin = await staffCookie(app, database.db, clock, airportId, 'ADMIN');
  const options = TwinOptionsResponse.parse(
    (await app.inject({ url: '/v1/twin/options', headers: { cookie: admin } })).json(),
  );
  const v3 = options.policies.find((p) => p.policyId === 'priority-v3');
  const started = await app.inject({
    method: 'POST',
    url: '/v1/twin/runs',
    headers: { cookie: admin },
    payload: {
      scenarioId: scenario.id,
      seed: 1,
      speed: null,
      policyVersionId: v3?.id,
      until: '06:40',
    },
  });
  expect(started.statusCode, started.body).toBe(201);
  run = TwinRun.parse(started.json());
  await app.twin?.wait(run.id);
});

afterAll(async () => {
  await app.close();
  await database.close();
});

const forecast = async (cp: string, cookie = supervisor) => {
  const r = await app.inject({ url: `/v1/checkpoints/${cp}/forecast`, headers: { cookie } });
  expect(r.statusCode, r.body).toBe(200);
  return ForecastResponse.parse(r.json());
};

const tenth = (x: number) => Math.round(x * 10) / 10;

describe('the forecast of a checkpoint (S21)', () => {
  it('reads what the backtest reads of the same simulated day, at the same time', async () => {
    const f = await forecast(run.checkpointId);
    // The twin's virtual time, in its scenario's clock.
    const midnight = zonedEpoch(f.serviceDay, 0, TZ);
    const t = Date.parse(f.at) - midnight;
    expect(t).toBeLessThanOrEqual((6 * 60 + 40) * MIN);
    expect(t).toBeGreaterThan(6 * 60 * MIN);
    // The same day of the simulator, watched as the backtest watches it.
    const [policy] = applyScenarioSettings([PRIORITY_V3_POLICY], scenario);
    if (policy === undefined) throw new Error('no policy');
    const job = planBacktest(scenario, policy, arrivalClassification([policy]));
    const state = SimulatedDay.run(job, 1).stateAt(t);
    expect(f.state).toMatchObject({
      arrivalsLastHour: state.arrivalsLastHour,
      backlog: state.backlog,
      lanesOpen: state.lanesOpen,
      ratePerLanePerHour: state.ratePerLanePerHour,
    });
    // The peak: people arrive and wait.
    expect(f.state.arrivalsLastHour).toBeGreaterThan(100);
    expect(f.state.backlog).toBeGreaterThan(0);
    // The overview of the same moment counts the same people not yet admitted.
    const o = OverviewResponse.parse(
      (
        await app.inject({
          url: `/v1/checkpoints/${run.checkpointId}/overview`,
          headers: { cookie: supervisor },
        })
      ).json(),
    );
    expect(o.at).toBe(f.at);
    expect(f.state.backlog).toBe(
      o.tickets.waiting.people + o.tickets.prepare.people + o.tickets.called.people,
    );
    // The bands are the pure forecast's, from the scenario's profile and calibrated on the
    // library (S21.3), to a tenth.
    const pure = forecastFrom(job.profile, state, LIBRARY_CALIBRATION);
    expect(f.horizons.map((h) => h.minutes)).toEqual([15, 30, 60, 90]);
    for (const [i, h] of f.horizons.entries()) {
      const p = pure.horizons[i];
      if (p === undefined) throw new Error('no horizon');
      expect(h.backlog).toEqual({
        p10: tenth(p.backlog.p10),
        p50: tenth(p.backlog.p50),
        p90: tenth(p.backlog.p90),
      });
      expect(h.waitMinutes).toEqual({
        p10: tenth(p.waitMs.p10 / MIN),
        p50: tenth(p.waitMs.p50 / MIN),
        p90: tenth(p.waitMs.p90 / MIN),
      });
      // The calibration moves the edges only: the median is the paths'.
      const raw = forecastFrom(job.profile, state).horizons[i];
      expect(h.waitMinutes.p50).toBe(tenth((raw?.waitMs.p50 ?? NaN) / MIN));
      expect(h.arrivals.p50).toBe(tenth(p.arrivals.p50));
      expect(h.lanes).toBe(pure.lanesAt[i]?.lanes);
      expect(Date.parse(h.at) - Date.parse(f.at)).toBe(h.minutes * MIN);
    }
    expect(f.buckets).toHaveLength(18);
    expect(f.model).toMatchObject({
      version: FORECAST_VERSION,
      paths: 200,
      days: 50,
      calibration: LIBRARY_CALIBRATION_SOURCE,
      scenario: {
        id: scenario.id,
        hash: scenarioHashOf(scenario),
        dataClassification: 'SYNTHETIC',
      },
    });
    // The twin's run names the same scenario its checkpoint's forecasts read.
    const [twin] = await database.db
      .select({ hash: twinRun.scenarioHash })
      .from(twinRun)
      .where(eq(twinRun.id, run.id));
    expect(twin?.hash).toBe(f.model.scenario.hash);
  });

  it('computes the profile of a scenario once, as the backtest does', async () => {
    const profile = await profileOfScenario(scenario);
    expect(profile).toEqual(checkpointProfile(scenario));
    // A second forecast of the same scenario reads the profile kept in memory.
    const started = Date.now();
    await forecast(checkpointId);
    expect(Date.now() - started).toBeLessThan(2_000);
  });

  it('forecasts a quiet checkpoint from the arrivals expected, and needs a scenario', async () => {
    // The seeded checkpoint has no ticket yet: the forecast is the scenario's day.
    const f = await forecast(checkpointId);
    expect(f.state).toMatchObject({ arrivalsLastHour: 0, backlog: 0, scale: 0.5 });
    expect(f.state.expectedLastHour).toBeGreaterThan(0);
    expect(f.horizons.every((h) => h.arrivals.p50 > 0)).toBe(true);
    // A checkpoint that names no scenario has no forecast.
    const [row] = await database.db
      .select({ settings: checkpoint.settings })
      .from(checkpoint)
      .where(eq(checkpoint.id, checkpointId));
    if (row === undefined) throw new Error('no checkpoint');
    const { scenarioHash, ...rest } = row.settings;
    expect(scenarioHash).toBe(scenarioHashOf(scenario));
    await database.db
      .update(checkpoint)
      .set({ settings: rest })
      .where(eq(checkpoint.id, checkpointId));
    const none = await app.inject({
      url: `/v1/checkpoints/${checkpointId}/forecast`,
      headers: { cookie: supervisor },
    });
    expect(none.statusCode).toBe(409);
    expect(none.json()).toMatchObject({ error: { code: 'NO_SCENARIO' } });
    // Seeding again gives it back its scenario, and changes nothing else.
    await seedDemo(database.db, scenario, {
      now: clock.now(),
      ids: randomIds(clock),
      serviceDay: DAY,
    });
    const [again] = await database.db
      .select({ settings: checkpoint.settings })
      .from(checkpoint)
      .where(eq(checkpoint.id, checkpointId));
    expect(again?.settings).toEqual(row.settings);
  });

  it('is for supervisors and administrators', async () => {
    for (const role of ['OPERATOR', 'ANALYST'] as const) {
      const cookie = await staffCookie(app, database.db, clock, airportId, role);
      const r = await app.inject({
        url: `/v1/checkpoints/${checkpointId}/forecast`,
        headers: { cookie },
      });
      expect(r.statusCode, role).toBe(403);
    }
    const admin = await staffCookie(app, database.db, clock, airportId, 'ADMIN');
    expect((await forecast(checkpointId, admin)).checkpointId).toBe(checkpointId);
  });
});
