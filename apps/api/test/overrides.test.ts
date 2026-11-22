import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { and, asc, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import {
  AuditVerifyResponse,
  IssueTicketResponse,
  OverrideResponse,
  QueueResponse,
  SetLanesResponse,
} from '@gateflow/contracts';
import type { Ticket } from '@gateflow/contracts';
import { parseScenarioText } from '@gateflow/sim-scenarios';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app';
import { checkpoint, flight, queueCommand, queueEvent } from '../src/db/schema';
import type { CheckpointSettings } from '../src/db/schema';
import { randomIds } from '../src/ids';
import { seedDemo } from '../src/seed';
import { boardOf } from '../src/streams';
import { zonedEpoch } from '../src/time';
import { freshDatabase } from './database';
import { staffCookie } from './staff';

/*
 * A supervisor's overrides and the lanes open (S17), on PostgreSQL: a boost puts a waiting ticket
 * in the prepare window at once, after the numbers announced; a call now calls it at once; each
 * with a coded reason, in the log with who made it, and never in FIFO_ONLY or an emergency. The
 * lanes open change the engine's estimates for the rest of the service day.
 */

const file = fileURLToPath(new URL('../../../scenarios/vce-like-peak-day.yaml', import.meta.url));
const scenario = parseScenarioText(readFileSync(file, 'utf8'), 'yaml', {
  read: (path) => readFileSync(join(dirname(file), path), 'utf8'),
  sha256: (text) => createHash('sha256').update(text).digest('hex'),
});
const DAY = '2026-11-23';
const MIN = 60_000;
const clock = {
  t: zonedEpoch(DAY, 6 * 60 * MIN, 'Europe/Rome'),
  now() {
    return this.t;
  },
};

let database: Awaited<ReturnType<typeof freshDatabase>>;
let checkpointId: string;
let airportId: string;
let app: FastifyInstance;
let flights: (typeof flight.$inferSelect)[];
let settings: CheckpointSettings;
let supervisor: string;
let operator: string;

beforeAll(async () => {
  database = await freshDatabase({ maxConnections: 12 });
  const seeded = await seedDemo(database.db, scenario, {
    now: clock.now(),
    ids: randomIds(clock),
    serviceDay: DAY,
  });
  checkpointId = seeded.checkpointId;
  airportId = seeded.airportId;
  flights = await database.db.select().from(flight).orderBy(asc(flight.stdMs));
  const [row] = await database.db.select().from(checkpoint).where(eq(checkpoint.id, checkpointId));
  settings = row?.settings as CheckpointSettings;
  app = buildApp({ db: database.db, clock });
  supervisor = await staffCookie(app, database.db, clock, airportId, 'SUPERVISOR');
  operator = await staffCookie(app, database.db, clock, airportId, 'OPERATOR');
});

afterAll(async () => {
  await app.close();
  await database.close();
});

let keys = 0;
async function post(path: string, body?: unknown, cookie = supervisor) {
  return app.inject({
    method: 'POST',
    url: `/v1/checkpoints/${checkpointId}/${path}`,
    headers: { cookie, 'idempotency-key': `overrides-${String(++keys)}` },
    ...(body === undefined ? {} : { payload: body as Record<string, unknown> }),
  });
}

async function issue(): Promise<Ticket> {
  const f = flights.find((x) => x.stdMs > clock.now() + 150 * MIN);
  const r = await post('tickets', { flightId: f?.id, segment: 'DEPARTING', reason: 'OTHER' });
  expect(r.statusCode, r.body).toBe(201);
  return IssueTicketResponse.parse(r.json()).ticket;
}

async function override(path: 'boost' | 'call-now', ticketId: string, reason = 'FLIGHT_CLOSING') {
  const r = await post(`tickets/${ticketId}/${path}`, { reason });
  expect(r.statusCode, r.body).toBe(200);
  return OverrideResponse.parse(r.json());
}

async function queueNow() {
  const r = await app.inject({
    method: 'GET',
    url: `/v1/checkpoints/${checkpointId}/queue`,
    headers: { cookie: operator },
  });
  return QueueResponse.parse(r.json());
}

const windowSize = () =>
  (settings.policy as { queue: { prepareWindowSize: number } }).queue.prepareWindowSize;

describe("a supervisor's overrides (S17)", () => {
  let waiting: Ticket[] = [];

  beforeAll(async () => {
    // A full window, and three tickets waiting behind it.
    for (let i = 0; i < windowSize() + 3; i++) await issue();
    waiting = (await queueNow()).tickets.filter((t) => t.state === 'QUEUED');
    expect(waiting.length).toBe(3);
  });

  it('are for supervisors, with a coded reason', async () => {
    const id = waiting[2]?.id ?? '';
    expect((await post(`tickets/${id}/boost`, { reason: 'OTHER' }, operator)).statusCode).toBe(403);
    expect((await post(`tickets/${id}/boost`, {})).statusCode).toBe(400);
    expect((await post(`tickets/${id}/boost`, { reason: 'he asked nicely' })).statusCode).toBe(400);
    expect((await post(`tickets/${id}/call-now`, { reason: 'OTHER', note: 'x' })).statusCode).toBe(
      400,
    );
    expect(
      (await post('tickets/0193a0b2-7c1d-7e5f-8a9b-0c1d2e3f4a5b/boost', { reason: 'OTHER' }))
        .statusCode,
    ).toBe(404);
  });

  it('boosts a waiting ticket into the window at once, after the numbers announced', async () => {
    const last = waiting[2]!;
    const before = (await boardOf(database.db, checkpointId))?.board.prepare ?? [];
    const answer = await override('boost', last.id, 'AIRLINE_REQUEST');
    expect(answer).toMatchObject({
      override: 'BOOST',
      reason: 'AIRLINE_REQUEST',
      outcome: 'DONE',
      ticket: { number: last.number, state: 'PREPARE', overridden: true, priority: false },
    });
    // The displays show it after the numbers already announced, which keep their places.
    const after = (await boardOf(database.db, checkpointId))?.board.prepare ?? [];
    expect(after).toEqual([...before, last.number]);
    // In the log, with who and why; the event says whom it passed.
    const [command] = await database.db
      .select()
      .from(queueCommand)
      .where(and(eq(queueCommand.checkpointId, checkpointId), eq(queueCommand.type, 'OVERRIDE')));
    expect(command?.actor).toMatch(/^staff:/);
    expect(command?.command).toMatchObject({ override: 'BOOST', reason: 'AIRLINE_REQUEST' });
    const [event] = await database.db
      .select()
      .from(queueEvent)
      .where(and(eq(queueEvent.checkpointId, checkpointId), eq(queueEvent.type, 'OVERRIDDEN')));
    expect(event?.payload).toMatchObject({ passedTickets: 2, passedPeople: 2 });
    const ticket = (await queueNow()).tickets.find((t) => t.id === last.id);
    expect(ticket?.overridden).toBe(true);
  });

  it('calls a ticket at once', async () => {
    const first = waiting[0]!;
    const answer = await override('call-now', first.id, 'ASSISTANCE');
    expect(answer).toMatchObject({ outcome: 'DONE', ticket: { state: 'CALLED', calls: 1 } });
    const board = (await boardOf(database.db, checkpointId))?.board;
    expect(board?.called[0]?.number).toBe(first.number);
  });

  it('follows the modes: none in FIFO_ONLY, no call now while paused', async () => {
    const id = waiting[1]!.id;
    expect((await post('mode', { mode: 'FIFO_ONLY' })).statusCode).toBe(200);
    expect((await override('boost', id)).outcome).toBe('NOT_ALLOWED');
    expect((await override('call-now', id)).outcome).toBe('NOT_ALLOWED');
    expect((await post('mode', { mode: 'PAUSED' })).statusCode).toBe(200);
    expect((await override('call-now', id)).outcome).toBe('NOT_ALLOWED');
    expect((await override('boost', id)).outcome).toBe('DONE');
    expect((await post('mode', { mode: 'NORMAL' })).statusCode).toBe(200);
    // A ticket announced already cannot be boosted.
    expect((await override('boost', id)).outcome).toBe('NOT_ALLOWED');
    // Refused overrides are in the log too.
    const overrides = await database.db
      .select()
      .from(queueCommand)
      .where(and(eq(queueCommand.checkpointId, checkpointId), eq(queueCommand.type, 'OVERRIDE')));
    expect(overrides.length).toBe(7);
  });
});

describe('the lanes open (S17)', () => {
  it('are set by a supervisor, for the rest of the service day', async () => {
    const open = settings.lanesOpen;
    expect((await queueNow()).lanesOpen).toBe(open);
    expect((await post('lanes', { lanesOpen: open + 2 }, operator)).statusCode).toBe(403);
    expect((await post('lanes', { lanesOpen: 0 })).statusCode).toBe(400);
    expect((await post('lanes', { lanesOpen: 2.5 })).statusCode).toBe(400);
    const r = await post('lanes', { lanesOpen: open + 2 });
    expect(r.statusCode, r.body).toBe(200);
    expect(SetLanesResponse.parse(r.json())).toEqual({ lanesOpen: open + 2, previous: open });
    expect((await queueNow()).lanesOpen).toBe(open + 2);
    // The next service day opens with the checkpoint's own number.
    clock.t = zonedEpoch('2026-11-24', 6 * 60 * MIN, 'Europe/Rome');
    supervisor = await staffCookie(app, database.db, clock, airportId, 'SUPERVISOR');
    operator = await staffCookie(app, database.db, clock, airportId, 'OPERATOR');
    expect((await queueNow()).lanesOpen).toBe(open);
    expect((await post('mode', { mode: 'PAUSED' })).statusCode).toBe(200);
    expect((await queueNow()).lanesOpen).toBe(open);
    const verified = await app.inject({
      method: 'GET',
      url: `/v1/checkpoints/${checkpointId}/audit/verify`,
      headers: { cookie: supervisor },
    });
    expect(AuditVerifyResponse.parse(verified.json()).intact).toBe(true);
  });
});
