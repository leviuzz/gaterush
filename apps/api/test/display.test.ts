import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { asc, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import {
  CallNextResponse,
  DisplayMessage,
  Heartbeat,
  IssueTicketResponse,
  QueueChanged,
} from '@gateflow/contracts';
import type { DisplayCall } from '@gateflow/contracts';
import { parseScenarioText } from '@gateflow/sim-scenarios';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app';
import { addDevice, revokeDevice } from '../src/devices';
import { flight } from '../src/db/schema';
import { randomIds } from '../src/ids';
import { seedDemo } from '../src/seed';
import { zonedEpoch } from '../src/time';
import { freshDatabase } from './database';
import { openSse } from './sse';
import type { SseClient } from './sse';
import { staffCookie } from './staff';

/*
 * The displays' streams (S16): a display follows its checkpoint by server-sent events. It gets
 * the board after every command and each call as it happens; when it reconnects with
 * Last-Event-ID it gets every call it missed; the commands of another server reach it within a
 * second; it never carries a reference or anything personal. Lane stations follow the same
 * changes with staff sessions. On PostgreSQL, over real HTTP.
 */

const read = (name: string) => {
  const file = fileURLToPath(new URL(`../../../scenarios/${name}`, import.meta.url));
  return parseScenarioText(readFileSync(file, 'utf8'), 'yaml', {
    read: (path) => readFileSync(join(dirname(file), path), 'utf8'),
    sha256: (text) => createHash('sha256').update(text).digest('hex'),
  });
};
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
/** A second server on the same database. */
let other: FastifyInstance;
let base: string;
let otherBase: string;
let checkpointId: string;
let elsewhere: string;
let displayToken: string;
let displayId: string;
let kioskToken: string;
let cookie: string;
let flightId: string;
const open: SseClient[] = [];

const STREAMS = { heartbeatMs: 300, pollMs: 100 };

async function listen(server: FastifyInstance): Promise<string> {
  await server.listen({ port: 0, host: '127.0.0.1' });
  return `http://127.0.0.1:${String((server.server.address() as AddressInfo).port)}`;
}

beforeAll(async () => {
  database = await freshDatabase({ maxConnections: 16 });
  const ids = randomIds(clock);
  const vce = await seedDemo(database.db, read('vce-like-peak-day.yaml'), {
    now: clock.now(),
    ids,
    serviceDay: DAY,
  });
  checkpointId = vce.checkpointId;
  const tsf = await seedDemo(database.db, read('tsf-like-peak-day.yaml'), {
    now: clock.now(),
    ids,
    serviceDay: DAY,
  });
  elsewhere = tsf.checkpointId;
  const display = await addDevice(database.db, ids, {
    checkpointId,
    kind: 'DISPLAY',
    name: 'Hall',
  });
  displayToken = display.token;
  displayId = display.device.id;
  kioskToken = (await addDevice(database.db, ids, { checkpointId, kind: 'KIOSK', name: 'Kiosk' }))
    .token;
  const flights = await database.db
    .select()
    .from(flight)
    .where(eq(flight.airportId, vce.airportId))
    .orderBy(asc(flight.stdMs));
  const later = flights.find((f) => f.stdMs > clock.now() + 150 * MIN);
  if (later === undefined) throw new Error('no flight');
  flightId = later.id;
  app = buildApp({ db: database.db, clock, streams: STREAMS });
  other = buildApp({ db: database.db, clock, streams: STREAMS });
  base = await listen(app);
  otherBase = await listen(other);
  cookie = await staffCookie(app, database.db, clock, vce.airportId, 'OPERATOR');
});

afterAll(async () => {
  for (const client of open) client.close();
  await app.close();
  await other.close();
  await database.close();
});

const display = async (headers: Record<string, string> = {}, server = base) => {
  const client = await openSse(`${server}/v1/checkpoints/${checkpointId}/display`, {
    authorization: `Bearer ${displayToken}`,
    ...headers,
  });
  open.push(client);
  return client;
};

/** The next board of a display, and its id. */
const nextBoard = async (client: SseClient, timeoutMs = 5000) => {
  const message = await client.next('board', timeoutMs);
  const body = DisplayMessage.parse(JSON.parse(message.data));
  expect(message.id).toBe(String(body.seq));
  return body;
};

let keys = 0;
async function post(path: string, body?: Record<string, unknown>) {
  const r = await app.inject({
    method: 'POST',
    url: `/v1/checkpoints/${checkpointId}/${path}`,
    headers: { cookie, 'idempotency-key': `display-${String(++keys)}` },
    ...(body === undefined ? {} : { payload: body }),
  });
  expect([200, 201], r.body).toContain(r.statusCode);
  return r.json<unknown>();
}

const issue = async () =>
  IssueTicketResponse.parse(
    await post('tickets', { flightId, segment: 'DEPARTING', reason: 'OTHER' }),
  );
const call = async () => CallNextResponse.parse(await post('calls')).called;

describe('the streams of a checkpoint (S16)', () => {
  it('lets only the displays of the checkpoint follow it, and staff its lane stations', async () => {
    const status = async (url: string, headers: Record<string, string> = {}) => {
      const r = await fetch(url, { headers: { accept: 'text/event-stream', ...headers } });
      await r.body?.cancel();
      return r.status;
    };
    const url = `${base}/v1/checkpoints/${checkpointId}/display`;
    expect(await status(url)).toBe(401);
    expect(await status(url, { authorization: 'Bearer not-a-token' })).toBe(401);
    expect(await status(url, { authorization: `Bearer ${kioskToken}` })).toBe(403);
    expect(
      await status(`${base}/v1/checkpoints/${elsewhere}/display`, {
        authorization: `Bearer ${displayToken}`,
      }),
    ).toBe(403);
    const lane = `${base}/v1/checkpoints/${checkpointId}/stream`;
    expect(await status(lane)).toBe(401);
    expect(await status(lane, { authorization: `Bearer ${displayToken}` })).toBe(401);
  });

  it('sends the board, then each call as it happens', async () => {
    const client = await display();
    expect(client.status).toBe(200);
    const first = await nextBoard(client);
    expect(first.calls).toEqual([]);
    const a = await issue();
    const b = await issue();
    let board = await nextBoard(client);
    while (!board.board.prepare.includes(b.ticket.number)) board = await nextBoard(client);
    expect(board.board.prepare).toContain(a.ticket.number);
    const called = await call();
    let after = await nextBoard(client);
    while (after.calls.length === 0) after = await nextBoard(client);
    expect(after.calls.map((c) => c.number)).toEqual([called?.number]);
    expect(after.board.called[0]).toMatchObject({ number: called?.number, second: false });
    expect(after.board.prepare).not.toContain(called?.number);
    expect(after.seq).toBeGreaterThan(first.seq);
  });

  it('gives a display that reconnects every call it missed, and the same board', async () => {
    const steady = await display();
    let steadyBoard = await nextBoard(steady);
    const away = await display();
    const before = await nextBoard(away);
    away.close();
    // While it is away: tickets, and three calls.
    for (let i = 0; i < 4; i++) await issue();
    const calls: string[] = [];
    for (let i = 0; i < 3; i++) {
      const c = await call();
      if (c !== null) calls.push(c.number);
    }
    expect(calls).toHaveLength(3);
    // The display that stayed sees every call, message by message.
    const seen: DisplayCall[] = [];
    while (seen.length < 3) {
      steadyBoard = await nextBoard(steady);
      seen.push(...steadyBoard.calls);
    }
    expect(seen.map((c) => c.number)).toEqual(calls);
    // The one that comes back, with the id of the last message it had, gets them all at once.
    const back = await display({ 'last-event-id': String(before.seq) });
    const caught = await nextBoard(back);
    expect(caught.calls.map((c) => c.number)).toEqual(calls);
    expect(caught.calls).toEqual(seen);
    expect(caught.board).toEqual(steadyBoard.board);
    expect(caught.seq).toBe(steadyBoard.seq);
    // Without the id, or with one this log never gave, it gets the board alone.
    const fresh = await display();
    expect((await nextBoard(fresh)).calls).toEqual([]);
    const unknown = await display({ 'last-event-id': '99999999' });
    const lost = await nextBoard(unknown);
    expect(lost.calls).toEqual([]);
    expect(lost.board).toEqual(steadyBoard.board);
  });

  it('reaches the displays of another server within a second of a command', async () => {
    const there = await display({}, otherBase);
    const start = await nextBoard(there);
    const called = await call();
    const t0 = Date.now();
    let message = await nextBoard(there, 3000);
    while (message.seq <= start.seq) message = await nextBoard(there, 3000);
    expect(Date.now() - t0).toBeLessThan(1500);
    if (called !== null) expect(message.calls.map((c) => c.number)).toContain(called.number);
  });

  it('says it is alive, and ends when its display is revoked', async () => {
    const client = await display();
    await nextBoard(client);
    const beat = Heartbeat.parse(JSON.parse((await client.next('heartbeat', 2000)).data));
    expect(Date.parse(beat.at)).toBe(clock.now());
    await revokeDevice(database.db, displayId);
    await Promise.race([
      client.ended,
      new Promise((_, reject) =>
        setTimeout(() => {
          reject(new Error('still open'));
        }, 3000),
      ),
    ]);
    const again = await fetch(`${base}/v1/checkpoints/${checkpointId}/display`, {
      headers: { authorization: `Bearer ${displayToken}` },
    });
    expect(again.status).toBe(401);
    // A new display for the next tests.
    const fresh = await addDevice(database.db, randomIds(clock), {
      checkpointId,
      kind: 'DISPLAY',
      name: 'Hall 2',
    });
    displayToken = fresh.token;
    displayId = fresh.device.id;
  });

  it("tells lane stations when the queue changes, while their member's session lasts", async () => {
    const lane = await openSse(`${base}/v1/checkpoints/${checkpointId}/stream`, { cookie });
    open.push(lane);
    expect(lane.status).toBe(200);
    const first = QueueChanged.parse(JSON.parse((await lane.next('changed')).data));
    await issue();
    let next = QueueChanged.parse(JSON.parse((await lane.next('changed')).data));
    while (next.seq <= first.seq) {
      next = QueueChanged.parse(JSON.parse((await lane.next('changed')).data));
    }
    expect(next.seq).toBeGreaterThan(first.seq);
    const out = await app.inject({ method: 'POST', url: '/v1/auth/sign-out', headers: { cookie } });
    expect(out.statusCode).toBe(204);
    await Promise.race([
      lane.ended,
      new Promise((_, reject) =>
        setTimeout(() => {
          reject(new Error('still open'));
        }, 3000),
      ),
    ]);
  });

  it('carries numbers only: no reference, no boarding pass', async () => {
    const client = await display();
    await nextBoard(client);
    cookie = await staffCookie(app, database.db, clock, await airportOf(), 'OPERATOR');
    const issued = await issue();
    await nextBoard(client);
    expect(client.text()).not.toContain(issued.ref);
    expect(client.text()).not.toContain(issued.ticket.id);
  });

  it('shows an empty board on a new service day, until its first call', async () => {
    const client = await display();
    const today = await nextBoard(client);
    expect(today.board.serviceDay).toBe(DAY);
    clock.t += 24 * 60 * MIN;
    let next = await nextBoard(client, 3000);
    while (next.board.serviceDay === DAY) next = await nextBoard(client, 3000);
    expect(next.board).toMatchObject({ serviceDay: '2026-11-24', called: [], prepare: [] });
  });
});

async function airportOf(): Promise<string> {
  const rows = await database.admin.query<{ airport_id: string }>(
    'SELECT airport_id FROM checkpoint WHERE id = $1',
    [checkpointId],
  );
  const id = rows.rows[0]?.airport_id;
  if (id === undefined) throw new Error('no airport');
  return id;
}
