import { readFileSync } from 'node:fs';
import { asc, eq, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import {
  AdmissionResponse,
  AuditVerifyResponse,
  CallNextResponse,
  IssueTicketResponse,
  PublicTicketResponse,
  QueueResponse,
} from '@gateflow/contracts';
import { CheckpointDay } from '@gateflow/operations';
import type { Command } from '@gateflow/operations';
import { parseScenarioText } from '@gateflow/sim-scenarios';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app';
import { admission, flight, queueCommand, queueToken } from '../src/db/schema';
import { randomIds } from '../src/ids';
import { seedDemo } from '../src/seed';
import { zonedEpoch } from '../src/time';
import { API_VERSION } from '../src/version';
import { freshDatabase } from './database';
import { staffCookie } from './staff';

const scenario = parseScenarioText(
  readFileSync(new URL('../../../scenarios/single-checkpoint-demo.yaml', import.meta.url), 'utf8'),
);
const DAY = '2026-11-23';
const MIN = 60_000;

/** A clock the tests move by hand. */
function virtualClock(startMs: number) {
  return {
    t: startMs,
    now() {
      return this.t;
    },
  };
}

let database: Awaited<ReturnType<typeof freshDatabase>>;
let checkpointId: string;
let flights: { id: string; number: string; stdMs: number }[];
const clock = virtualClock(zonedEpoch(DAY, 5 * 60 * MIN, 'Europe/Rome'));
let app: FastifyInstance;
/** The session of a supervisor of the airport (S15): staff requests need one. */
let cookie: string;
let airportId: string;

beforeAll(async () => {
  database = await freshDatabase({ maxConnections: 12 });
  const seeded = await seedDemo(database.db, scenario, {
    now: clock.now(),
    ids: randomIds(clock),
    serviceDay: DAY,
  });
  checkpointId = seeded.checkpointId;
  flights = (await database.db.select().from(flight).orderBy(asc(flight.stdMs))).map((f) => ({
    id: f.id,
    number: f.number,
    stdMs: f.stdMs,
  }));
  app = buildApp({ db: database.db, clock });
  airportId = seeded.airportId;
  cookie = await staffCookie(app, database.db, clock, airportId);
});

afterAll(async () => {
  await app.close();
  await database.close();
});

/** A manual ticket's request for a flight. */
const manual = (flightId: string) =>
  ({ flightId, segment: 'DEPARTING', reason: 'NO_BOARDING_PASS' }) as const;

/** A flight leaving at least `minutes` after now. */
function flightAfter(minutes: number) {
  const f = flights.find((x) => x.stdMs > clock.now() + minutes * MIN);
  if (f === undefined) throw new Error('no flight that late');
  return f;
}

async function post(server: FastifyInstance, path: string, body?: unknown, key?: string) {
  return server.inject({
    method: 'POST',
    url: `/v1/checkpoints/${checkpointId}/${path}`,
    ...(body === undefined ? {} : { payload: body as Record<string, unknown> }),
    headers: { cookie, ...(key === undefined ? {} : { 'idempotency-key': key }) },
  });
}

async function issue(server: FastifyInstance, flightId: string, partySize = 1) {
  const response = await post(server, 'tickets', {
    flightId,
    segment: 'DEPARTING',
    partySize,
    reason: 'NO_BOARDING_PASS',
  });
  expect(response.statusCode, response.body).toBe(201);
  return IssueTicketResponse.parse(response.json());
}

async function callNext(server: FastifyInstance) {
  const response = await post(server, 'calls');
  expect(response.statusCode, response.body).toBe(200);
  return CallNextResponse.parse(response.json()).called;
}

async function verify() {
  const response = await app.inject({
    url: `/v1/checkpoints/${checkpointId}/audit/verify`,
    headers: { cookie },
  });
  return AuditVerifyResponse.parse(response.json());
}

async function commandsCount() {
  const rows = await database.db
    .select({ n: sql<string>`count(*)` })
    .from(queueCommand)
    .where(eq(queueCommand.checkpointId, checkpointId));
  return Number(rows[0]?.n ?? 0);
}

describe('the API (S12)', () => {
  it('issues tickets, calls them, admits the passenger, and shows no personal data', async () => {
    const f = flightAfter(120);
    const a = await issue(app, f.id);
    const b = await issue(app, f.id, 2);
    expect([a.ticket.number, b.ticket.number]).toEqual(['A001', 'A002']);
    expect(a.ref).toMatch(/^[A-Za-z0-9_-]{22}$/);
    clock.t += MIN;
    const called = await callNext(app);
    expect(called?.number).toBe('A001');
    clock.t += MIN;
    const admitted = await post(app, 'admissions', { number: 'A001' });
    expect(AdmissionResponse.parse(admitted.json())).toMatchObject({
      outcome: 'ADMITTED',
      ticket: { number: 'A001', state: 'ADMITTED' },
    });
    const queue = QueueResponse.parse(
      (
        await app.inject({ url: `/v1/checkpoints/${checkpointId}/queue`, headers: { cookie } })
      ).json(),
    );
    expect(queue.serviceDay).toBe(DAY);
    expect(queue.tickets.map((t) => [t.number, t.state])).toEqual([
      ['A001', 'ADMITTED'],
      ['A002', 'PREPARE'],
    ]);
    const page = await app.inject({ url: `/v1/tickets/${b.ref}` });
    expect(Object.keys(PublicTicketResponse.parse(page.json())).sort()).toEqual([
      'checkpoint',
      'number',
      'serviceDay',
      'state',
    ]);
    expect(page.json()).toMatchObject({ number: 'A002', state: 'PREPARE' });
    expect((await app.inject({ url: '/v1/tickets/nothing-like-a-ref' })).statusCode).toBe(404);
  });

  it('gives no double call when 100 "call next" arrive at once', async () => {
    const f = flightAfter(150);
    const issued: string[] = [];
    for (let i = 0; i < 60; i++) issued.push((await issue(app, f.id)).ticket.number);
    clock.t += MIN;
    const before = await commandsCount();
    const answers = await Promise.all(Array.from({ length: 100 }, () => callNext(app)));
    const called = answers.flatMap((t) => (t === null ? [] : [t.number]));
    // Every ticket waiting was called exactly once; the other calls found nobody.
    expect(new Set(called).size).toBe(called.length);
    expect(called.length).toBe(61);
    expect(new Set(called)).toEqual(new Set(['A002', ...issued]));
    expect(await commandsCount()).toBe(before + 100);
    const tokens = await database.db.select().from(queueToken);
    expect(tokens.every((t) => t.calls <= 1)).toBe(true);
    expect((await verify()).intact).toBe(true);
  });

  it('applies a command once for one Idempotency-Key, and refuses the key for another request', async () => {
    const f = flightAfter(150);
    const first = await post(
      app,
      'tickets',
      { flightId: f.id, segment: 'TRANSFER', reason: 'NO_BOARDING_PASS' },
      'kiosk-7:0001',
    );
    const again = await post(
      app,
      'tickets',
      { flightId: f.id, segment: 'TRANSFER', reason: 'NO_BOARDING_PASS' },
      'kiosk-7:0001',
    );
    expect(first.statusCode).toBe(201);
    expect(again.statusCode).toBe(201);
    expect(again.json()).toEqual(first.json());
    expect(again.headers['idempotent-replayed']).toBe('true');
    const other = await post(
      app,
      'tickets',
      { flightId: f.id, segment: 'DEPARTING', reason: 'NO_BOARDING_PASS' },
      'kiosk-7:0001',
    );
    expect(other.statusCode).toBe(409);
    expect(other.json()).toMatchObject({ error: { code: 'IDEMPOTENCY_CONFLICT' } });
    const number = IssueTicketResponse.parse(first.json()).ticket.number;
    const rows = await database.db.select().from(queueToken).where(eq(queueToken.number, number));
    expect(rows.length).toBe(1);
  });

  it('admits a ticket once: the database refuses a second admission', async () => {
    const f = flightAfter(150);
    const t = await issue(app, f.id);
    clock.t += MIN;
    // Call until this ticket is called (the queue may hold others).
    for (let i = 0; i < 100; i++) {
      const called = await callNext(app);
      if (called?.number === t.ticket.number || called === null) break;
    }
    const first = await post(app, 'admissions', { ref: t.ref });
    expect(first.json()).toMatchObject({ outcome: 'ADMITTED' });
    const second = await post(app, 'admissions', { ref: t.ref });
    expect(second.json()).toMatchObject({ outcome: 'ALREADY_ADMITTED' });
    const rows = await database.db
      .select()
      .from(admission)
      .where(eq(admission.tokenId, t.ticket.id));
    expect(rows.length).toBe(1);
    // Even a program that skips the queue's rules cannot admit the ticket twice.
    await expect(
      database.admin.query(
        `INSERT INTO admission (token_id, checkpoint_id, at_ms, method, command_seq)
         VALUES ($1, $2, 0, 'NUMBER', 1)`,
        [t.ticket.id, checkpointId],
      ),
    ).rejects.toThrow(/admission_pkey/);
  });

  it('refuses invalid requests without writing anything', async () => {
    const before = await commandsCount();
    const f = flightAfter(150);
    const cases = [
      await post(app, 'tickets', { ...manual(f.id), name: 'Mario Rossi' }),
      await post(app, 'tickets', { ...manual(f.id), partySize: 50 }),
      await post(app, 'tickets', manual('0193a0b2-7c1d-7e5f-8a9b-0c1d2e3f4a5b')),
      // A manual ticket needs its coded reason (S15).
      await post(app, 'tickets', { flightId: f.id, segment: 'DEPARTING' }),
      await post(app, 'admissions', { number: 'Z999' }),
      await post(app, 'admissions', { number: 'A001', ref: 'x'.repeat(22) }),
    ];
    expect(cases.map((r) => r.statusCode)).toEqual([400, 400, 404, 400, 404, 400]);
    const unknown = await app.inject({
      method: 'POST',
      url: '/v1/checkpoints/0193a0b2-7c1d-7e5f-8a9b-0c1d2e3f4a5b/calls',
      headers: { cookie },
    });
    expect(unknown.statusCode).toBe(404);
    expect(await commandsCount()).toBe(before);
  });

  it('gives the same queue after a restart, and with two servers on one database', async () => {
    const f = flightAfter(150);
    const other = buildApp({ db: database.db, clock });
    // The second server starts from the log; the first one catches up with what it wrote.
    const x = await issue(other, f.id);
    const y = await issue(app, f.id);
    expect(Number(y.ticket.number.slice(1))).toBe(Number(x.ticket.number.slice(1)) + 1);
    clock.t += MIN;
    const calledByOther = await callNext(other);
    const calledByFirst = await callNext(app);
    expect(calledByOther?.number).not.toBe(calledByFirst?.number);
    await other.close();
    // The current state of every ticket is what the log gives when the day is replayed.
    const rows = await database.db
      .select()
      .from(queueCommand)
      .where(eq(queueCommand.checkpointId, checkpointId))
      .orderBy(asc(queueCommand.seq));
    const replayed = CheckpointDay.replay(
      rows.map((r) => ({ seq: r.seq, atMs: r.atMs, command: r.command as Command })),
    );
    const tokens = await database.db.select().from(queueToken);
    const byId = new Map(tokens.map((t) => [t.id, t]));
    for (const t of replayed.tickets()) {
      expect(byId.get(t.ticketId)).toMatchObject({
        number: t.number,
        state: t.state,
        calls: t.calls,
        priority: t.priority,
      });
    }
    expect(replayed.tickets().length).toBe(tokens.length);
    expect((await verify()).intact).toBe(true);
  });

  it('finds tampering with the log', async () => {
    const intact = await verify();
    expect(intact).toMatchObject({ intact: true, firstBrokenSeq: null });
    expect(intact.commands).toBe(await commandsCount());
    // An administrator disables the protection and changes an event: the chain breaks there.
    const event = await database.admin.query(
      `SELECT seq, command_seq FROM queue_event WHERE type = 'CALLED' ORDER BY seq LIMIT 1`,
    );
    const { seq, command_seq: commandSeq } = event.rows[0] as { seq: string; command_seq: string };
    await database.admin.query(`ALTER TABLE queue_event DISABLE TRIGGER queue_event_append_only`);
    await database.admin.query(
      `UPDATE queue_event SET payload = jsonb_set(payload, '{atMs}', '0') WHERE seq = $1`,
      [seq],
    );
    await database.admin.query(`ALTER TABLE queue_event ENABLE TRIGGER queue_event_append_only`);
    expect(await verify()).toMatchObject({ intact: false, firstBrokenSeq: Number(commandSeq) });
  });

  it('opens a new service day after the day ends, with numbers from A001 again', async () => {
    clock.t = zonedEpoch('2026-11-24', 3 * 60 * MIN + 5 * MIN, 'Europe/Rome');
    // A session lasts a shift: the next day's staff sign in again.
    const expired = await app.inject({ url: '/v1/auth/me', headers: { cookie } });
    expect(expired.statusCode).toBe(401);
    cookie = await staffCookie(app, database.db, clock, airportId);
    const rows = await database.db.select().from(flight).where(eq(flight.serviceDate, DAY));
    const late = rows.sort((a, b) => b.stdMs - a.stdMs)[0]!;
    const t = await issue(app, late.id);
    expect(t.ticket.number).toBe('A001');
    const queue = QueueResponse.parse(
      (
        await app.inject({ url: `/v1/checkpoints/${checkpointId}/queue`, headers: { cookie } })
      ).json(),
    );
    expect(queue.serviceDay).toBe('2026-11-24');
    expect(queue.tickets.map((x) => x.number)).toEqual(['A001']);
    const opened = await database.db
      .select()
      .from(queueCommand)
      .where(eq(queueCommand.type, 'OPEN_DAY'));
    expect(opened.map((r) => r.serviceDay)).toEqual([DAY, '2026-11-24']);
  });

  it('keeps no client address and no ticket reference in its log', async () => {
    const lines: string[] = [];
    const logged = buildApp({
      db: database.db,
      clock,
      logger: { stream: { write: (l) => lines.push(l) } },
    });
    const [token] = await database.db.select().from(queueToken).limit(1);
    const ref = token!.opaqueRef;
    await logged.inject({ url: `/v1/tickets/${ref}`, remoteAddress: '203.0.113.7' });
    // The passenger's page carries the same reference (S14).
    await logged.inject({ url: `/t/${ref}?lang=it`, remoteAddress: '203.0.113.7' });
    await logged.inject({
      method: 'POST',
      url: `/v1/checkpoints/${checkpointId}/calls`,
      remoteAddress: '203.0.113.7',
    });
    await logged.close();
    const text = lines.join('');
    expect(text).toContain('/v1/tickets/:ref');
    expect(text).toContain('/t/:ref?lang=it');
    expect(text).toContain('/calls');
    expect(text).not.toContain(ref);
    expect(text).not.toContain('203.0.113.7');
    expect(text).not.toMatch(/remoteAddress|flightId|partySize/);
  });

  it('describes itself: health and OpenAPI', async () => {
    expect((await app.inject({ url: '/v1/health' })).json()).toEqual({
      status: 'ok',
      version: API_VERSION,
    });
    const doc = (await app.inject({ url: '/v1/openapi.json' })).json<{ openapi: string }>();
    expect(doc.openapi).toBe('3.1.0');
    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
      version: string;
    };
    expect(API_VERSION).toBe(pkg.version);
  });
});
