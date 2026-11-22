import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { and, asc, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import {
  AuditVerifyResponse,
  CallNextResponse,
  DisplayMessage,
  IssueTicketResponse,
  KioskStatus,
  QueueResponse,
  SetModeResponse,
} from '@gateflow/contracts';
import type { Ticket } from '@gateflow/contracts';
import { encodeBoardingPass } from '@gateflow/bcbp';
import type { DayConfig } from '@gateflow/operations';
import type { VirtualQueue } from '@gateflow/queue-core';
import { parseScenarioText } from '@gateflow/sim-scenarios';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app';
import { addDevice } from '../src/devices';
import {
  checkpoint,
  checkpointTimer,
  flight,
  queueCommand,
  queueEvent,
  queueToken,
  scan,
} from '../src/db/schema';
import type { CheckpointSettings } from '../src/db/schema';
import { randomIds } from '../src/ids';
import { seedDemo } from '../src/seed';
import { zonedEpoch } from '../src/time';
import { freshDatabase } from './database';
import { openSse } from './sse';
import type { SseClient } from './sse';
import { staffCookie } from './staff';

/*
 * The modes of a checkpoint (S17, ADR-048), set by its supervisor: paused, nobody is called and
 * the kiosks go on; in an emergency, the kiosks scan nothing, staff issue nothing and the call
 * timers stop; on resuming, the window may be announced again in order of arrival. Every change
 * is in the log, with who made it; displays and kiosks learn it at once. On PostgreSQL, with a
 * clock the tests move by hand.
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
let app: FastifyInstance;
let base: string;
let flights: (typeof flight.$inferSelect)[];
let kioskToken: string;
let displayToken: string;
let queue: VirtualQueue;
let airportId: string;
let supervisor: string;
let operator: string;
const open: SseClient[] = [];

beforeAll(async () => {
  database = await freshDatabase({ maxConnections: 12 });
  const ids = randomIds(clock);
  const seeded = await seedDemo(database.db, scenario, { now: clock.now(), ids, serviceDay: DAY });
  checkpointId = seeded.checkpointId;
  airportId = seeded.airportId;
  flights = await database.db.select().from(flight).orderBy(asc(flight.stdMs));
  kioskToken = (await addDevice(database.db, ids, { checkpointId, kind: 'KIOSK', name: 'Kiosk' }))
    .token;
  displayToken = (
    await addDevice(database.db, ids, { checkpointId, kind: 'DISPLAY', name: 'Hall' })
  ).token;
  const [row] = await database.db.select().from(checkpoint).where(eq(checkpoint.id, checkpointId));
  queue = ((row?.settings as CheckpointSettings).policy as { queue: VirtualQueue }).queue;
  app = buildApp({ db: database.db, clock, streams: { heartbeatMs: 300, pollMs: 100 } });
  await app.listen({ port: 0, host: '127.0.0.1' });
  base = `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`;
  supervisor = await staffCookie(app, database.db, clock, seeded.airportId, 'SUPERVISOR');
  operator = await staffCookie(app, database.db, clock, seeded.airportId, 'OPERATOR');
});

afterAll(async () => {
  for (const client of open) client.close();
  await app.close();
  await database.close();
});

function later(minutes: number) {
  const f = flights.find((x) => x.stdMs > clock.now() + minutes * MIN);
  if (f === undefined) throw new Error('no such flight');
  return f;
}

let keys = 0;
async function post(path: string, body?: unknown, cookie = supervisor) {
  return app.inject({
    method: 'POST',
    url: `/v1/checkpoints/${checkpointId}/${path}`,
    headers: { cookie, 'idempotency-key': `modes-${String(++keys)}` },
    ...(body === undefined ? {} : { payload: body as Record<string, unknown> }),
  });
}

async function setMode(mode: string, reset?: boolean, cookie = supervisor) {
  const r = await post('mode', reset === undefined ? { mode } : { mode, reset }, cookie);
  return {
    status: r.statusCode,
    body: r.statusCode === 200 ? SetModeResponse.parse(r.json()) : r.json<unknown>(),
  };
}

async function issue(): Promise<Ticket> {
  const r = await post('tickets', {
    flightId: later(150).id,
    segment: 'DEPARTING',
    reason: 'OTHER',
  });
  expect(r.statusCode, r.body).toBe(201);
  return IssueTicketResponse.parse(r.json()).ticket;
}

async function call() {
  const r = await post('calls', undefined, operator);
  return { status: r.statusCode, body: r.json<{ error?: { code: string } }>() };
}

let sequence = 0;
function pass(): string {
  const f = later(150);
  sequence++;
  return encodeBoardingPass({
    passengerName: 'SAMPLE/MODE',
    electronicTicket: true,
    legs: [
      {
        pnr: 'MODESX',
        from: 'VCE',
        to: 'CDG',
        carrier: f.carrier ?? 'ZZ',
        flightNumber: f.flightNumber ?? '1',
        dayOfYear: 327,
        compartment: 'Y',
        seat: '014C',
        checkInSequence: String(sequence).padStart(4, '0'),
        passengerStatus: '1',
      },
    ],
  });
}

async function scanPass(bcbp: string) {
  return app.inject({
    method: 'POST',
    url: `/v1/checkpoints/${checkpointId}/scans`,
    payload: { bcbp },
    headers: { authorization: `Bearer ${kioskToken}`, 'idempotency-key': `scan-${String(++keys)}` },
  });
}

async function queueNow() {
  const r = await app.inject({
    method: 'GET',
    url: `/v1/checkpoints/${checkpointId}/queue`,
    headers: { cookie: operator },
  });
  return QueueResponse.parse(r.json());
}

async function stateOf(ticketId: string): Promise<string> {
  const rows = await database.db.select().from(queueToken).where(eq(queueToken.id, ticketId));
  return rows[0]?.state ?? 'MISSING';
}

async function nextDue(): Promise<number | null> {
  const rows = await database.db
    .select()
    .from(checkpointTimer)
    .where(eq(checkpointTimer.checkpointId, checkpointId));
  return rows[0]?.nextDueMs ?? null;
}

const stream = async (path: string, token: string) => {
  const client = await openSse(`${base}/v1/checkpoints/${checkpointId}/${path}`, {
    authorization: `Bearer ${token}`,
  });
  open.push(client);
  return client;
};

/** The next status of a kiosk's stream. */
const nextStatus = async (client: SseClient) => {
  const message = await client.next('status', 5000);
  const status = KioskStatus.parse(JSON.parse(message.data));
  expect(message.id).toBe(String(status.seq));
  return status;
};

/** The boards of a display until one in `mode`. */
const boardIn = async (client: SseClient, mode: string) => {
  for (;;) {
    const body = DisplayMessage.parse(JSON.parse((await client.next('board', 5000)).data));
    if (body.board.mode === mode) return body;
  }
};

describe('the modes of a checkpoint (S17)', () => {
  it('are set by a supervisor only, and recorded with who set them', async () => {
    expect((await setMode('PAUSED', false, operator)).status).toBe(403);
    const anonymous = await app.inject({
      method: 'POST',
      url: `/v1/checkpoints/${checkpointId}/mode`,
      payload: { mode: 'PAUSED' },
    });
    expect(anonymous.statusCode).toBe(401);
    expect((await setMode('CLOSED')).status).toBe(400);
    const set = await setMode('FIFO_ONLY');
    expect(set).toEqual({
      status: 200,
      body: { outcome: 'DONE', mode: 'FIFO_ONLY', previous: 'NORMAL', reset: false },
    });
    expect((await queueNow()).mode).toBe('FIFO_ONLY');
    // The same mode again changes nothing, and says so.
    expect((await setMode('FIFO_ONLY')).body).toMatchObject({ outcome: 'NOT_ALLOWED' });
    // A reset resumes from a pause or an emergency only.
    expect((await setMode('NORMAL', true)).body).toMatchObject({
      outcome: 'NOT_ALLOWED',
      mode: 'FIFO_ONLY',
    });
    expect((await setMode('NORMAL')).body).toMatchObject({ outcome: 'DONE', mode: 'NORMAL' });
    const commands = await database.db
      .select()
      .from(queueCommand)
      .where(and(eq(queueCommand.checkpointId, checkpointId), eq(queueCommand.type, 'SET_MODE')))
      .orderBy(asc(queueCommand.seq));
    // What was asked, and what it did.
    expect(commands.map((c) => (c.command as { mode: string }).mode)).toEqual([
      'FIFO_ONLY',
      'FIFO_ONLY',
      'NORMAL',
      'NORMAL',
    ]);
    expect(commands.map((c) => (c.result as { outcome: string }).outcome)).toEqual([
      'DONE',
      'NOT_ALLOWED',
      'NOT_ALLOWED',
      'DONE',
    ]);
    expect(commands.every((c) => c.actor.startsWith('staff:'))).toBe(true);
  });

  it('calls nobody while paused, and lets the kiosks issue numbers', async () => {
    const display = await stream('display', displayToken);
    const kiosk = await stream('kiosk', kioskToken);
    expect((await nextStatus(kiosk)).mode).toBe('NORMAL');
    await issue();
    await issue();
    expect((await setMode('PAUSED')).body).toMatchObject({ outcome: 'DONE', mode: 'PAUSED' });
    const refused = await call();
    expect(refused.status).toBe(409);
    expect(refused.body.error?.code).toBe('CALLS_PAUSED');
    // The kiosks go on, and the display says calls are paused.
    expect((await scanPass(pass())).statusCode).toBe(201);
    expect((await boardIn(display, 'PAUSED')).board.mode).toBe('PAUSED');
    expect((await nextStatus(kiosk)).mode).toBe('PAUSED');
    expect((await queueNow()).mode).toBe('PAUSED');
    expect((await setMode('NORMAL')).body).toMatchObject({ outcome: 'DONE' });
    expect((await call()).status).toBe(200);
    expect((await nextStatus(kiosk)).mode).toBe('NORMAL');
  });

  it('stops kiosks, staff tickets and call timers in an emergency', async () => {
    const kiosk = await stream('kiosk', kioskToken);
    expect((await nextStatus(kiosk)).mode).toBe('NORMAL');
    const mine = await issue();
    // Called, then the emergency: one minute left before the second call.
    let called: string | null = null;
    while (called !== mine.id) {
      const r = await post('calls', undefined, operator);
      called = CallNextResponse.parse(r.json()).called?.id ?? null;
      if (called === null) throw new Error('never called');
    }
    const calledAt = clock.t;
    clock.t = calledAt + queue.callTimeoutMs - MIN;
    expect((await setMode('EMERGENCY')).body).toMatchObject({ outcome: 'DONE', mode: 'EMERGENCY' });
    expect((await nextStatus(kiosk)).mode).toBe('EMERGENCY');
    // The kiosk scans nothing: not even a refusal is recorded.
    const scans = (await database.db.select().from(scan)).length;
    const scanned = await scanPass(pass());
    expect(scanned.statusCode).toBe(409);
    expect(scanned.json<{ error: { code: string } }>().error.code).toBe('EMERGENCY');
    expect((await database.db.select().from(scan)).length).toBe(scans);
    // Staff issue nothing, call nobody.
    const manual = await post('tickets', {
      flightId: later(150).id,
      segment: 'DEPARTING',
      reason: 'OTHER',
    });
    expect(manual.statusCode).toBe(409);
    expect(manual.json<{ error: { code: string } }>().error.code).toBe('EMERGENCY');
    expect((await call()).body.error?.code).toBe('CALLS_PAUSED');
    // The timers stop: half an hour later, the passenger called is still called.
    expect(await nextDue()).toBeNull();
    clock.t += 30 * MIN;
    expect(await app.timers.tick()).toBe(0);
    expect(await stateOf(mine.id)).toBe('CALLED');
    // The end: the minute left starts again now.
    const end = clock.t;
    expect((await setMode('NORMAL')).body).toMatchObject({
      outcome: 'DONE',
      previous: 'EMERGENCY',
    });
    expect(await nextDue()).toBe(end + MIN);
    clock.t = end + MIN;
    expect(await app.timers.tick()).toBe(1);
    expect(await stateOf(mine.id)).toBe('RECALLED');
    expect((await scanPass(pass())).statusCode).toBe(201);
  });

  it('announces the window again in order of arrival when the supervisor resumes so', async () => {
    const before = (await queueNow()).tickets.filter((t) => t.state === 'PREPARE');
    expect(before.length).toBeGreaterThan(0);
    expect((await setMode('PAUSED')).body).toMatchObject({ outcome: 'DONE' });
    expect((await setMode('NORMAL', true)).body).toEqual({
      outcome: 'DONE',
      mode: 'NORMAL',
      previous: 'PAUSED',
      reset: true,
    });
    const head = await database.db
      .select()
      .from(queueCommand)
      .where(eq(queueCommand.checkpointId, checkpointId))
      .orderBy(asc(queueCommand.seq));
    const last = head.at(-1);
    const events = await database.db
      .select()
      .from(queueEvent)
      .where(
        and(eq(queueEvent.checkpointId, checkpointId), eq(queueEvent.commandSeq, last?.seq ?? 0)),
      )
      .orderBy(asc(queueEvent.seq));
    expect(events[0]?.type).toBe('MODE_CHANGED');
    expect(events.filter((e) => e.type === 'UNCOMMITTED').length).toBe(before.length);
    // The window again, as the passengers came.
    const after = (await queueNow()).tickets;
    const waiting = after.filter((t) => t.state === 'QUEUED' || t.state === 'PREPARE');
    const window = waiting.filter((t) => t.state === 'PREPARE');
    expect(window.map((t) => t.number)).toEqual(
      waiting.slice(0, window.length).map((t) => t.number),
    );
  });

  it('keeps an emergency across the start of the next service day', async () => {
    expect((await setMode('EMERGENCY')).body).toMatchObject({ outcome: 'DONE' });
    // The next day: its first command opens it, in an emergency still (the demo's flights are
    // of the first day, which makes no difference to the refusal).
    clock.t = zonedEpoch('2026-11-24', 6 * 60 * MIN, 'Europe/Rome');
    // A new shift: yesterday's sessions have ended.
    supervisor = await staffCookie(app, database.db, clock, airportId, 'SUPERVISOR');
    operator = await staffCookie(app, database.db, clock, airportId, 'OPERATOR');
    const refused = await post('tickets', {
      flightId: flights.at(-1)?.id,
      segment: 'DEPARTING',
      reason: 'OTHER',
    });
    expect(refused.statusCode).toBe(409);
    expect(refused.json<{ error: { code: string } }>().error.code).toBe('EMERGENCY');
    expect((await setMode('NORMAL')).body).toMatchObject({
      outcome: 'DONE',
      previous: 'EMERGENCY',
    });
    const opened = await database.db
      .select()
      .from(queueCommand)
      .where(and(eq(queueCommand.checkpointId, checkpointId), eq(queueCommand.type, 'OPEN_DAY')))
      .orderBy(asc(queueCommand.seq));
    const config = (opened.at(-1)?.command as { config: DayConfig }).config;
    expect(config.serviceDay).toBe('2026-11-24');
    expect(config.mode).toBe('EMERGENCY');
    expect((await queueNow()).mode).toBe('NORMAL');
    // The chain of the log holds every change.
    const verified = await app.inject({
      method: 'GET',
      url: `/v1/checkpoints/${checkpointId}/audit/verify`,
      headers: { cookie: supervisor },
    });
    expect(AuditVerifyResponse.parse(verified.json()).intact).toBe(true);
  });

  it("lets only the checkpoint's kiosks follow its status", async () => {
    const status = async (token?: string) => {
      const r = await fetch(`${base}/v1/checkpoints/${checkpointId}/kiosk`, {
        headers: {
          accept: 'text/event-stream',
          ...(token === undefined ? {} : { authorization: `Bearer ${token}` }),
        },
      });
      await r.body?.cancel();
      return r.status;
    };
    expect(await status()).toBe(401);
    expect(await status(displayToken)).toBe(403);
    expect(await status(kioskToken)).toBe(200);
  });
});
