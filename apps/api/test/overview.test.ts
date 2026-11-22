import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { and, asc, eq, gt, inArray } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import {
  OverviewResponse,
  OverviewVerifyResponse,
  TwinOptionsResponse,
  TwinRun,
} from '@gateflow/contracts';
import { parseScenarioText } from '@gateflow/sim-scenarios';
import type { Scenario } from '@gateflow/sim-scenarios';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app';
import { flight, queueToken } from '../src/db/schema';
import { randomIds } from '../src/ids';
import { seedDemo } from '../src/seed';
import { zonedEpoch } from '../src/time';
import { freshDatabase } from './database';
import { staffCookie } from './staff';

/*
 * The operations overview on PostgreSQL (S20, ADR-053). The acceptance of S20: the live figures
 * equal those recomputed from the log. A twin plays a disrupted morning to its checkpoint
 * (thousands of commands, priority calls, classes that change without an event); the figures
 * read from the current state equal those of the log's replay, and every ticket too. A current
 * state tampered with is caught.
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
const MIN = 60_000;
const clock = {
  t: zonedEpoch(DAY, 6 * 60 * MIN, 'Europe/Rome'),
  now() {
    return this.t;
  },
};

let database: Awaited<ReturnType<typeof freshDatabase>>;
let app: FastifyInstance;
let airportId: string;
let checkpointId: string;
let supervisor: string;
let twinCheckpointId: string;

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
  // A twin plays the disrupted morning's peak to a checkpoint of its own.
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
      until: '06:45',
    },
  });
  expect(started.statusCode, started.body).toBe(201);
  const run = TwinRun.parse(started.json());
  await app.twin?.wait(run.id);
  twinCheckpointId = run.checkpointId;
});

afterAll(async () => {
  await app.close();
  await database.close();
});

const overview = async (cp: string, cookie = supervisor) => {
  const r = await app.inject({ url: `/v1/checkpoints/${cp}/overview`, headers: { cookie } });
  expect(r.statusCode, r.body).toBe(200);
  return OverviewResponse.parse(r.json());
};

const verify = async (cp: string) => {
  const r = await app.inject({
    url: `/v1/checkpoints/${cp}/overview/verify`,
    headers: { cookie: supervisor },
  });
  expect(r.statusCode, r.body).toBe(200);
  return OverviewVerifyResponse.parse(r.json());
};

describe('the operations overview (S20)', () => {
  it("equals the figures recomputed from the log, after a twin's disrupted morning", async () => {
    const o = await overview(twinCheckpointId);
    // The twin's virtual time: its latest command, before 06:45 of its day, in the peak.
    expect(Date.parse(o.at)).toBeLessThanOrEqual(
      zonedEpoch(DAY, (6 * 60 + 45) * MIN, 'Europe/Rome'),
    );
    expect(o.tickets.waiting.people + o.tickets.prepare.people).toBeGreaterThan(0);
    expect(o.seq).toBeGreaterThan(1000);
    expect(o.tickets.admitted.people).toBeGreaterThan(500);
    expect(o.waits.day?.people).toBe(o.tickets.admitted.people);
    expect(o.fairness.priorityCommitments).toBeGreaterThan(0);
    expect(o.fairness.passedPeople).toBeGreaterThan(0);
    expect(o.fairness.overtakeBound).toBe(30);
    expect(o.fairness.mostOvertaken).toBeLessThanOrEqual(30);
    expect(o.dataQuality.flights).toBeGreaterThan(0);
    // Written only with the tickets of their events, the current state of this morning would put
    // 15 tickets at risk instead of 20, and say wrongly who was overtaken (ADR-053).
    expect(o.atRisk.ATTENTION.tickets).toBeGreaterThan(0);
    const check = await verify(twinCheckpointId);
    expect(check).toMatchObject({ intact: true, differences: [] });
    expect(check.commands).toBe(o.seq);
    // Tickets the engine changed without an event of their own are in the current state too.
    const overtaken = await database.db
      .select({ id: queueToken.id })
      .from(queueToken)
      .where(and(eq(queueToken.checkpointId, twinCheckpointId), gt(queueToken.overtaken, 0)));
    expect(overtaken.length).toBeGreaterThan(0);
  });

  it('catches a current state that is not the log', async () => {
    const [row] = await database.db
      .select()
      .from(queueToken)
      .where(
        and(
          eq(queueToken.checkpointId, twinCheckpointId),
          inArray(queueToken.state, ['QUEUED', 'PREPARE']),
        ),
      )
      .orderBy(asc(queueToken.issuedAtMs))
      .limit(1);
    if (row === undefined) throw new Error('nobody waits or is announced');
    const other = row.riskClass === 'CRITICAL' ? 'NORMAL' : 'CRITICAL';
    await database.admin.query(
      'UPDATE queue_token SET risk_class = $1, overtaken = overtaken + 7 WHERE id = $2',
      [other, row.id],
    );
    const check = await verify(twinCheckpointId);
    expect(check.intact).toBe(false);
    expect(check.differences).toEqual(
      expect.arrayContaining([
        {
          what: `ticket ${row.number} riskClass`,
          live: JSON.stringify(other),
          log: JSON.stringify(row.riskClass),
        },
        {
          what: `ticket ${row.number} overtaken`,
          live: String(row.overtaken + 7),
          log: String(row.overtaken),
        },
      ]),
    );
    // The figures that read it differ too.
    expect(check.differences.some((d) => d.what.startsWith('atRisk.'))).toBe(true);
    await database.admin.query(
      'UPDATE queue_token SET risk_class = $1, overtaken = $2 WHERE id = $3',
      [row.riskClass, row.overtaken, row.id],
    );
    expect((await verify(twinCheckpointId)).intact).toBe(true);
  });

  it('counts the waits of a day of staff per person, as the simulator', async () => {
    const [later] = await database.db
      .select()
      .from(flight)
      .where(and(eq(flight.airportId, airportId), gt(flight.stdMs, clock.now() + 150 * MIN)))
      .orderBy(asc(flight.stdMs))
      .limit(1);
    if (later === undefined) throw new Error('no flight');
    // Nothing yet today: no figure, and nothing to check.
    const empty = await overview(checkpointId);
    expect(empty).toMatchObject({ seq: 0, waits: { lastHour: null, day: null }, waitingNow: null });
    expect((await verify(checkpointId)).intact).toBe(true);
    const ticket = async (partySize: number) => {
      const r = await app.inject({
        method: 'POST',
        url: `/v1/checkpoints/${checkpointId}/tickets`,
        headers: { cookie: supervisor },
        payload: { flightId: later.id, segment: 'DEPARTING', partySize, reason: 'ASSISTANCE' },
      });
      expect(r.statusCode, r.body).toBe(201);
    };
    const start = clock.t;
    await ticket(2);
    await ticket(1);
    clock.t += 5 * MIN;
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/v1/checkpoints/${checkpointId}/calls`,
          headers: { cookie: supervisor },
        })
      ).statusCode,
    ).toBe(200);
    // Within the call's timeout.
    clock.t += 3 * MIN;
    const admitted = await app.inject({
      method: 'POST',
      url: `/v1/checkpoints/${checkpointId}/admissions`,
      headers: { cookie: supervisor },
      payload: { number: 'A001' },
    });
    expect(admitted.statusCode, admitted.body).toBe(200);
    expect(admitted.json()).toMatchObject({ outcome: 'ADMITTED' });
    const o = await overview(checkpointId);
    // A family of two waited 8 minutes from the issue; the other waits, for 8 minutes so far.
    expect(o.waits.day).toEqual({ people: 2, p50Ms: 8 * MIN, p90Ms: 8 * MIN, maxMs: 8 * MIN });
    expect(o.waits.lastHour).toEqual(o.waits.day);
    expect(o.waitingNow).toEqual({ people: 1, p50Ms: 8 * MIN, p90Ms: 8 * MIN, maxMs: 8 * MIN });
    expect(o.tickets.admitted).toEqual({ tickets: 1, people: 2 });
    expect(o.at).toBe(new Date(start + 8 * MIN).toISOString());
    expect((await verify(checkpointId)).intact).toBe(true);
    // An hour later the family's wait is out of the last hour, still in the day's.
    clock.t += 61 * MIN;
    const later2 = await overview(checkpointId);
    expect(later2.waits.lastHour).toBeNull();
    expect(later2.waits.day?.people).toBe(2);
  });

  it('is for supervisors and administrators', async () => {
    for (const role of ['OPERATOR', 'ANALYST'] as const) {
      const cookie = await staffCookie(app, database.db, clock, airportId, role);
      for (const path of ['overview', 'overview/verify']) {
        const r = await app.inject({
          url: `/v1/checkpoints/${checkpointId}/${path}`,
          headers: { cookie },
        });
        expect(r.statusCode, `${role} ${path}`).toBe(403);
      }
    }
    const admin = await staffCookie(app, database.db, clock, airportId, 'ADMIN');
    expect((await overview(checkpointId, admin)).checkpointId).toBe(checkpointId);
  });
});
