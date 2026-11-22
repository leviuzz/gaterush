import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { and, asc, eq, inArray } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import {
  AdviceDecisionResponse,
  AdviceResponse,
  AuditResponse,
  AuditVerifyResponse,
  ForecastResponse,
  OverviewVerifyResponse,
  TwinOptionsResponse,
  TwinResponse,
  TwinRun,
} from '@gateflow/contracts';
import type { Advice } from '@gateflow/contracts';
import {
  FORECAST_VERSION,
  LIBRARY_CALIBRATION,
  LIBRARY_CALIBRATION_SOURCE,
  adviseLanes,
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
import { adviceRecordOf } from '../src/advice';
import { buildApp } from '../src/app';
import { flight, queueCommand, queueToken } from '../src/db/schema';
import { randomIds } from '../src/ids';
import { seedDemo } from '../src/seed';
import { zonedEpoch } from '../src/time';
import { freshDatabase } from './database';
import { staffCookie } from './staff';

/*
 * GateFlow's recommendations of lanes on PostgreSQL (S22, ADR-056). The acceptance: cooldown and
 * deduplication tested, every alert with a reason, a lead time, an interval and the expected
 * benefit. On a live checkpoint, GateFlow recommends once the lanes are too few, not again while
 * one is open nor within the cooldown or a postponement, the supervisor decides, the outcome is
 * recorded, and the log stays intact. On a twin's checkpoint, the recommendations of its virtual
 * morning are those the rule gives on the same simulated day at the same times, and the twin's
 * calls stay the simulator's.
 */

function scenarioOf(name: string): Scenario {
  const file = fileURLToPath(new URL(`../../../scenarios/${name}`, import.meta.url));
  return parseScenarioText(readFileSync(file, 'utf8'), 'yaml', {
    read: (path) => readFileSync(join(dirname(file), path), 'utf8'),
    sha256: (text) => createHash('sha256').update(text).digest('hex'),
  });
}

/** A TSF-like peak day: staff on call for one lane beyond the plan, a morning that needs it. */
const scenario = scenarioOf('tsf-like-peak-day.yaml');
const DAY = '2026-11-23';
const TZ = 'Europe/Rome';
const MIN = 60_000;
const at = (hh: number, mm: number) => zonedEpoch(DAY, (hh * 60 + mm) * MIN, TZ);
const clock = {
  t: at(4, 15),
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
  // A twin plays the morning to 05:30 to a checkpoint of its own.
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
      until: '05:30',
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

let keys = 0;
const post = (cp: string, path: string, body: unknown, cookie = supervisor, key?: string) =>
  app.inject({
    method: 'POST',
    url: `/v1/checkpoints/${cp}/${path}`,
    headers: { cookie, 'idempotency-key': key ?? `advice-${String(++keys)}` },
    payload: body as Record<string, unknown>,
  });

const get = async (cp: string, path: string, cookie = supervisor) => {
  const r = await app.inject({ url: `/v1/checkpoints/${cp}/${path}`, headers: { cookie } });
  expect(r.statusCode, r.body).toBe(200);
  return r.json<unknown>();
};

const advice = async (cp: string) => AdviceResponse.parse(await get(cp, 'advice'));

/** The recommendations commands of a checkpoint's log. */
const adviceCommands = (cp: string) =>
  database.db
    .select({ type: queueCommand.type, atMs: queueCommand.atMs, actor: queueCommand.actor })
    .from(queueCommand)
    .where(
      and(
        eq(queueCommand.checkpointId, cp),
        inArray(queueCommand.type, ['ADVISE_LANES', 'DECIDE_ADVICE', 'RECORD_OUTCOME']),
      ),
    )
    .orderBy(asc(queueCommand.seq));

/** Everything an alert must say (the acceptance of S22). */
function expectComplete(a: Advice) {
  expect(['WAIT_ABOVE_TARGET', 'WAIT_LOW_WITH_FEWER_LANES']).toContain(a.reason);
  expect(a.leadMinutes).toBeGreaterThanOrEqual(0);
  expect(Date.parse(a.crossesAt) - Date.parse(a.at)).toBe(a.leadMinutes * MIN);
  // The interval and the benefit speak of a step of the hour ahead.
  const benefit = Date.parse(a.benefitAt) - Date.parse(a.at);
  expect(benefit % (5 * MIN)).toBe(0);
  expect(benefit).toBeLessThanOrEqual(60 * MIN);
  for (const band of [a.waitWithout, a.waitWith]) {
    expect(band.p10).toBeLessThanOrEqual(band.p50);
    expect(band.p50).toBeLessThanOrEqual(band.p90);
  }
  if (a.action === 'OPEN') {
    expect(a.waitWith.p50).toBeLessThan(a.waitWithout.p50);
    expect(a.peakWithMinutes).toBeLessThan(a.peakWithoutMinutes);
  }
  expect(a.forecast).toBe(
    `forecast ${FORECAST_VERSION}, calibrated on ${LIBRARY_CALIBRATION_SOURCE}`,
  );
  expect(Date.parse(a.validUntil) - Date.parse(a.at)).toBe(15 * MIN);
  expect(Date.parse(a.outcomeDue) - Date.parse(a.benefitAt)).toBe(15 * MIN);
}

/** The record of an advice as the API answers it, to compare with the pure rule's. */
const recordOf = (a: Advice) => ({
  action: a.action,
  lanes: a.lanes,
  reason: a.reason,
  lanesOpen: a.lanesOpen,
  leadMinutes: a.leadMinutes,
  atMinutes: (Date.parse(a.benefitAt) - Date.parse(a.at)) / MIN,
  waitWithout: a.waitWithout,
  waitWith: a.waitWith,
  peakWithoutMinutes: a.peakWithoutMinutes,
  peakWithMinutes: a.peakWithMinutes,
  forecast: a.forecast,
});

describe("GateFlow's recommendations of lanes (S22)", () => {
  it('recommends on a live checkpoint once the lanes are too few, once, with all an alert says', async () => {
    // Twenty people take a number at 04:15; nobody is reviewed yet.
    const flights = await database.db
      .select()
      .from(flight)
      .where(eq(flight.airportId, airportId))
      .orderBy(asc(flight.stdMs));
    const f = flights.find((x) => x.stdMs > clock.now() + 150 * MIN);
    for (let i = 0; i < 20; i++) {
      const r = await post(checkpointId, 'tickets', {
        flightId: f?.id,
        segment: 'DEPARTING',
        reason: 'ASSISTANCE',
      });
      expect(r.statusCode, r.body).toBe(201);
    }
    expect((await advice(checkpointId)).advices).toEqual([]);
    // The supervisor runs two lanes where the plan has five: GateFlow reviews them at once.
    const lanes = await post(checkpointId, 'lanes', { lanesOpen: 2 });
    expect(lanes.statusCode, lanes.body).toBe(200);
    const day = await advice(checkpointId);
    expect(day.rule).toEqual({
      targetWaitMinutes: 10,
      closeBelowMinutes: 2,
      reviewEveryMinutes: 5,
      cooldownMinutes: 15,
      postponeMinutes: 10,
      validForMinutes: 15,
    });
    expect(day.advices).toHaveLength(1);
    const first = day.advices[0];
    if (first === undefined) throw new Error('no recommendation');
    expect(first).toMatchObject({
      action: 'OPEN',
      reason: 'WAIT_ABOVE_TARGET',
      lanesOpen: 2,
      status: 'OPEN',
      decision: null,
      outcome: null,
    });
    expect(Date.parse(first.at)).toBe(at(4, 15));
    // Back to the plan and one more, at most: the four lanes beyond the two open.
    expect(first.lanes).toBeGreaterThanOrEqual(1);
    expect(first.lanes).toBeLessThanOrEqual(4);
    expectComplete(first);
    // Exactly the rule's, on what the forecast of the same moment reads.
    const forecast = ForecastResponse.parse(await get(checkpointId, 'forecast'));
    expect(forecast.at).toBe(first.at);
    const midnight = zonedEpoch(DAY, 0, TZ);
    const expected = adviseLanes(
      checkpointProfile(scenario),
      {
        nowMs: Date.parse(forecast.at) - midnight,
        arrivalsLastHour: forecast.state.arrivalsLastHour,
        backlog: forecast.state.backlog,
        lanesOpen: forecast.state.lanesOpen,
        ratePerLanePerHour: forecast.state.ratePerLanePerHour,
      },
      { calibration: LIBRARY_CALIBRATION, lanesChangedAtMs: at(4, 15) - midnight },
    );
    if (expected === null) throw new Error('the rule recommends nothing');
    expect(recordOf(first)).toEqual(adviceRecordOf(expected));
    // In the log, by GateFlow, and in the audit view.
    expect(await adviceCommands(checkpointId)).toEqual([
      { type: 'ADVISE_LANES', atMs: at(4, 15), actor: 'system:advisor' },
    ]);
    const audit = AuditResponse.parse(await get(checkpointId, 'audit'));
    expect(audit.entries[0]).toMatchObject({
      command: 'ADVISE_LANES',
      by: { kind: 'SYSTEM', label: 'GateFlow' },
      outcome: 'OPEN',
      detail: { action: 'OPEN', lanes: first.lanes, lanesOpen: 2, leadMinutes: first.leadMinutes },
    });
  });

  it('does not repeat one while it is open, nor within the cooldown or a postponement', async () => {
    // The same 5 minutes: not reviewed again. The next 5: reviewed, but one is open.
    expect(await app.advisor.tick()).toBe(0);
    clock.t = at(4, 20);
    expect(await app.advisor.tick()).toBe(0);
    expect(await adviceCommands(checkpointId)).toHaveLength(1);
    const [first] = (await advice(checkpointId)).advices;
    if (first === undefined) throw new Error('no recommendation');
    // The decision: by a supervisor, with a coded reason only to decline.
    const decide = (body: unknown, id = first.id, cookie = supervisor, key?: string) =>
      post(checkpointId, `advice/${id}/decision`, body, cookie, key);
    const operator = await staffCookie(app, database.db, clock, airportId, 'OPERATOR');
    expect((await decide({ decision: 'ACCEPT' }, first.id, operator)).statusCode).toBe(403);
    const noReason = await decide({ decision: 'DECLINE' });
    expect(noReason.statusCode).toBe(400);
    expect(noReason.json()).toMatchObject({ error: { code: 'INVALID_REQUEST' } });
    expect((await decide({ decision: 'ACCEPT', reason: 'NO_STAFF' })).statusCode).toBe(400);
    expect((await decide({ decision: 'MAYBE' })).statusCode).toBe(400);
    const unknown = await decide({ decision: 'ACCEPT' }, '0190a0b0-0000-7000-8000-000000000000');
    expect(unknown.statusCode).toBe(404);
    expect(unknown.json()).toMatchObject({ error: { code: 'UNKNOWN_ADVICE' } });
    clock.t = at(4, 21);
    const postponed = await decide({ decision: 'POSTPONE' }, first.id, supervisor, 'postpone-1');
    expect(postponed.statusCode, postponed.body).toBe(200);
    const decided = AdviceDecisionResponse.parse(postponed.json()).advice;
    expect(decided).toMatchObject({
      id: first.id,
      status: 'POSTPONED',
      decision: { decision: 'POSTPONE', reason: null, at: new Date(at(4, 21)).toISOString() },
    });
    // The same request again is the same answer, applied once.
    const again = await decide({ decision: 'POSTPONE' }, first.id, supervisor, 'postpone-1');
    expect(again.headers['idempotent-replayed']).toBe('true');
    expect(AdviceDecisionResponse.parse(again.json()).advice).toEqual(decided);
    const twice = await decide({ decision: 'ACCEPT' });
    expect(twice.statusCode).toBe(409);
    expect(twice.json()).toMatchObject({ error: { code: 'ADVICE_NOT_OPEN' } });
    // The cooldown ends at 04:30, the postponement at 04:31: the review of 04:30 makes none,
    // and the next is that of 04:35.
    for (const [hh, mm] of [
      [4, 25],
      [4, 30],
      [4, 31],
    ] as const) {
      clock.t = at(hh, mm);
      expect(await app.advisor.tick(), `${String(hh)}:${String(mm)}`).toBe(0);
    }
    clock.t = at(4, 35);
    expect(await app.advisor.tick()).toBe(1);
    const second = (await advice(checkpointId)).advices[0];
    if (second === undefined) throw new Error('no second recommendation');
    expect(second).toMatchObject({ status: 'OPEN', action: 'OPEN', lanesOpen: 2 });
    expect(Date.parse(second.at)).toBe(at(4, 35));
    expectComplete(second);
    // Declined, with a reason: the supervisor has nobody to open a lane.
    clock.t = at(4, 36);
    const declined = await decide({ decision: 'DECLINE', reason: 'NO_STAFF' }, second.id);
    expect(declined.statusCode, declined.body).toBe(200);
    expect(AdviceDecisionResponse.parse(declined.json()).advice).toMatchObject({
      status: 'DECLINED',
      decision: { decision: 'DECLINE', reason: 'NO_STAFF' },
    });
    // The next, 15 minutes after the second, is left alone: it expires.
    clock.t = at(4, 50);
    expect(await app.advisor.tick()).toBe(1);
    const third = (await advice(checkpointId)).advices[0];
    clock.t = at(5, 5);
    expect((await advice(checkpointId)).advices[0]).toMatchObject({
      id: third?.id,
      status: 'EXPIRED',
      decision: null,
    });
    const late = await decide({ decision: 'ACCEPT' }, third?.id);
    expect(late.statusCode).toBe(409);
    expect(late.json()).toMatchObject({ error: { code: 'ADVICE_NOT_OPEN' } });
    // Never two open, never two within 15 minutes.
    const all = (await advice(checkpointId)).advices.slice().reverse();
    for (let i = 1; i < all.length; i++) {
      const gap = Date.parse(all[i]?.at ?? '') - Date.parse(all[i - 1]?.at ?? '');
      expect(gap).toBeGreaterThanOrEqual(15 * MIN);
    }
    expect(all.filter((a) => a.status === 'OPEN').length).toBeLessThanOrEqual(1);
  });

  it('records what happened, and leaves the queue and the log as they were', async () => {
    const [first] = (await advice(checkpointId)).advices.slice().reverse();
    if (first === undefined) throw new Error('no recommendation');
    // Not before it is due.
    clock.t = Date.parse(first.outcomeDue) - MIN;
    await app.advisor.tick();
    expect((await advice(checkpointId)).advices.at(-1)?.outcome).toBeNull();
    clock.t = Date.parse(first.outcomeDue) + MIN;
    await app.advisor.tick();
    const recorded = (await advice(checkpointId)).advices.at(-1);
    // Two lanes still, the twenty people not admitted: nobody was admitted in those 15 minutes.
    expect(recorded?.outcome).toEqual({
      lanesOpen: 2,
      backlog: 20,
      waitMinutes: null,
      admitted: 0,
    });
    // Recorded once, by GateFlow.
    await app.advisor.tick();
    const outcomes = (await adviceCommands(checkpointId)).filter(
      (c) => c.type === 'RECORD_OUTCOME',
    );
    expect(outcomes.length).toBeGreaterThanOrEqual(1);
    expect(outcomes.every((c) => c.actor === 'system:advisor')).toBe(true);
    // The queue as it was: the twenty tickets waiting, the chain of hashes intact, the overview
    // what the log's replay gives.
    const tickets = await database.db
      .select({ state: queueToken.state })
      .from(queueToken)
      .where(eq(queueToken.checkpointId, checkpointId));
    expect(tickets).toHaveLength(20);
    expect(tickets.every((t) => t.state === 'QUEUED' || t.state === 'PREPARE')).toBe(true);
    const chain = AuditVerifyResponse.parse(await get(checkpointId, 'audit/verify'));
    expect(chain.intact).toBe(true);
    const replayed = OverviewVerifyResponse.parse(await get(checkpointId, 'overview/verify'));
    expect(replayed).toMatchObject({ intact: true, differences: [] });
  });

  it("recommends on a twin's checkpoint at its virtual time what the rule gives on its day", async () => {
    const day = await advice(run.checkpointId);
    expect(day.advices.length).toBeGreaterThanOrEqual(2);
    const all = day.advices.slice().reverse();
    // The same simulated day, as the backtest watches it, and the lanes the twin set.
    const [policy] = applyScenarioSettings([PRIORITY_V3_POLICY], scenario);
    if (policy === undefined) throw new Error('no policy');
    const job = planBacktest(scenario, policy, arrivalClassification([policy]));
    const simulated = SimulatedDay.run(job, 1);
    const midnight = zonedEpoch(day.serviceDay, 0, TZ);
    const lanes = await database.db
      .select({ atMs: queueCommand.atMs })
      .from(queueCommand)
      .where(
        and(eq(queueCommand.checkpointId, run.checkpointId), eq(queueCommand.type, 'SET_LANES')),
      )
      .orderBy(asc(queueCommand.seq));
    for (const a of all) {
      expectComplete(a);
      const t = Date.parse(a.at);
      // Reviewed at the first virtual time of a slot of 5 minutes.
      const changed = lanes.filter((l) => l.atMs <= t).at(-1)?.atMs ?? null;
      const expected = adviseLanes(job.profile, simulated.stateAt(t - midnight), {
        calibration: LIBRARY_CALIBRATION,
        lanesChangedAtMs: changed === null ? null : changed - midnight,
      });
      if (expected === null) throw new Error(`the rule recommends nothing at ${a.at}`);
      expect(recordOf(a), a.at).toEqual(adviceRecordOf(expected));
      // Nobody decides on a twin's checkpoint: each expires.
      expect(a.decision).toBeNull();
    }
    for (let i = 1; i < all.length; i++) {
      expect(
        Date.parse(all[i]?.at ?? '') - Date.parse(all[i - 1]?.at ?? ''),
      ).toBeGreaterThanOrEqual(15 * MIN);
    }
    // The outcomes due by the end of the morning, with the people admitted in their 15 minutes.
    const due = all.filter((a) => Date.parse(a.outcomeDue) <= Date.parse(day.at));
    expect(due.length).toBeGreaterThan(0);
    for (const a of due) {
      expect(a.outcome, a.at).not.toBeNull();
      expect(a.outcome?.admitted).toBeGreaterThan(0);
      const to = Date.parse(a.outcomeDue);
      const admitted = await database.db
        .select({
          people: queueToken.partySize,
          presented: queueToken.presentedAtMs,
          admitted: queueToken.admittedAtMs,
        })
        .from(queueToken)
        .where(eq(queueToken.checkpointId, run.checkpointId));
      const window = admitted.filter(
        (r) => r.admitted !== null && r.admitted >= to - 15 * MIN && r.admitted < to,
      );
      expect(a.outcome?.admitted).toBe(window.reduce((n, r) => n + r.people, 0));
    }
    // Nobody may decide for the twin.
    const open = all.find((a) => a.status === 'OPEN') ?? all[0];
    const refused = await post(run.checkpointId, `advice/${open?.id ?? ''}/decision`, {
      decision: 'ACCEPT',
    });
    expect(refused.statusCode).toBe(409);
    expect(refused.json()).toMatchObject({ error: { code: 'TWIN_CHECKPOINT' } });
    // The twin's calls are still the simulator's, and its log is intact.
    const admin = await staffCookie(app, database.db, clock, airportId, 'ADMIN');
    const twin = TwinResponse.parse(
      (await app.inject({ url: '/v1/twin', headers: { cookie: admin } })).json(),
    ).run;
    expect(twin).toMatchObject({ id: run.id, state: 'FINISHED', divergence: null, error: null });
    expect(twin?.matchedCalls).toBe(twin?.expectedCalls);
    expect(twin?.expectedCalls).toBeGreaterThan(300);
    const chain = AuditVerifyResponse.parse(await get(run.checkpointId, 'audit/verify'));
    expect(chain.intact).toBe(true);
    const replayed = OverviewVerifyResponse.parse(await get(run.checkpointId, 'overview/verify'));
    expect(replayed).toMatchObject({ intact: true, differences: [] });
  });

  it('is for supervisors and administrators', async () => {
    for (const role of ['OPERATOR', 'ANALYST'] as const) {
      const cookie = await staffCookie(app, database.db, clock, airportId, role);
      const r = await app.inject({
        url: `/v1/checkpoints/${checkpointId}/advice`,
        headers: { cookie },
      });
      expect(r.statusCode, role).toBe(403);
    }
    const admin = await staffCookie(app, database.db, clock, airportId, 'ADMIN');
    expect(AdviceResponse.parse(await get(checkpointId, 'advice', admin)).checkpointId).toBe(
      checkpointId,
    );
  });
});
