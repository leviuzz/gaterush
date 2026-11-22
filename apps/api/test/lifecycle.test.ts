import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { and, asc, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import {
  AdmissionResponse,
  CallNextResponse,
  IssueTicketResponse,
  PublicTicketResponse,
  ScanResponse,
  StaffActionResponse,
} from '@gateflow/contracts';
import type { Ticket } from '@gateflow/contracts';
import { encodeBoardingPass } from '@gateflow/bcbp';
import { CheckpointDay } from '@gateflow/operations';
import type { Command } from '@gateflow/operations';
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
  queueToken,
  scan,
} from '../src/db/schema';
import type { CheckpointSettings } from '../src/db/schema';
import { randomIds } from '../src/ids';
import { seedDemo } from '../src/seed';
import { zonedEpoch } from '../src/time';
import { freshDatabase } from './database';
import { staffCookie } from './staff';

/*
 * The life cycle of a ticket in the live system (S15): the queue's timeouts applied on time by the
 * scheduler, staff actions, a no-show brought back by a rescan, the review, the rule for a pass
 * whose boarding has closed, and the admission by boarding pass. On PostgreSQL, with a clock the
 * tests move by hand.
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
let flights: (typeof flight.$inferSelect)[];
let kioskToken: string;
/** The checkpoint's queue: its timeouts T1, T2 and the window of reactivation. */
let queue: VirtualQueue;
/** A supervisor's session (staff requests need one). */
let cookie: string;

beforeAll(async () => {
  database = await freshDatabase({ maxConnections: 12 });
  const seeded = await seedDemo(database.db, scenario, {
    now: clock.now(),
    ids: randomIds(clock),
    serviceDay: DAY,
  });
  checkpointId = seeded.checkpointId;
  flights = await database.db.select().from(flight).orderBy(asc(flight.stdMs));
  kioskToken = (
    await addDevice(database.db, randomIds(clock), { checkpointId, kind: 'KIOSK', name: 'Kiosk' })
  ).token;
  const [row] = await database.db.select().from(checkpoint).where(eq(checkpoint.id, checkpointId));
  const policy = (row?.settings as CheckpointSettings).policy as { queue: VirtualQueue };
  queue = policy.queue;
  app = buildApp({ db: database.db, clock });
  cookie = await staffCookie(app, database.db, clock, seeded.airportId);
});

afterAll(async () => {
  await app.close();
  await database.close();
});

function later(minutes: number) {
  const f = flights.find((x) => x.stdMs > clock.now() + minutes * MIN);
  if (f === undefined) throw new Error('no such flight');
  return f;
}

let keys = 0;
async function post(path: string, body?: unknown, key = `test-${String(++keys)}`) {
  return app.inject({
    method: 'POST',
    url: `/v1/checkpoints/${checkpointId}/${path}`,
    headers: { cookie, 'idempotency-key': key },
    ...(body === undefined ? {} : { payload: body as Record<string, unknown> }),
  });
}

async function issue(minutesAhead = 150): Promise<{ ticket: Ticket; ref: string }> {
  const f = later(minutesAhead);
  const r = await post('tickets', { flightId: f.id, segment: 'DEPARTING', reason: 'OTHER' });
  expect(r.statusCode, r.body).toBe(201);
  return IssueTicketResponse.parse(r.json());
}

/** Calls until `ticketId` is called (the engine chooses the order). */
async function callUntil(ticketId: string): Promise<void> {
  for (let i = 0; i < 200; i++) {
    const r = CallNextResponse.parse((await post('calls')).json());
    if (r.called?.id === ticketId) return;
    if (r.called === null) break;
  }
  throw new Error(`ticket ${ticketId} was never called`);
}

async function stateOf(ticketId: string): Promise<string> {
  const rows = await database.db.select().from(queueToken).where(eq(queueToken.id, ticketId));
  return rows[0]?.state ?? 'MISSING';
}

async function act(ticketId: string, action: string, body?: unknown, key?: string) {
  const r = await post(`tickets/${ticketId}/${action}`, body, key);
  return {
    status: r.statusCode,
    body: r.statusCode === 200 ? StaffActionResponse.parse(r.json()) : null,
  };
}

async function nextDue(): Promise<number | null> {
  const rows = await database.db
    .select()
    .from(checkpointTimer)
    .where(eq(checkpointTimer.checkpointId, checkpointId));
  return rows[0]?.nextDueMs ?? null;
}

let sequence = 0;
function passFor(f: typeof flight.$inferSelect, pnr: string): string {
  sequence++;
  return encodeBoardingPass({
    passengerName: 'SAMPLE/YOKO',
    electronicTicket: true,
    legs: [
      {
        pnr,
        from: 'VCE',
        to: 'LHR',
        carrier: f.carrier ?? 'ZZ',
        flightNumber: f.flightNumber ?? '1',
        dayOfYear: 327,
        compartment: 'Y',
        seat: '002B',
        checkInSequence: String(sequence).padStart(4, '0'),
        passengerStatus: '1',
      },
    ],
  });
}

async function scanPass(bcbp: string) {
  const r = await app.inject({
    method: 'POST',
    url: `/v1/checkpoints/${checkpointId}/scans`,
    payload: { bcbp },
    headers: { authorization: `Bearer ${kioskToken}`, 'idempotency-key': `scan-${String(++keys)}` },
  });
  expect([200, 201], r.body).toContain(r.statusCode);
  return ScanResponse.parse(r.json());
}

describe('the life cycle of a ticket (S15)', () => {
  it('applies the timeouts on time, with nobody acting: second call, no-show, expiry', async () => {
    const { ticket, ref } = await issue();
    await callUntil(ticket.id);
    const calledAt = clock.now();
    expect(await nextDue()).toBe(calledAt + queue.callTimeoutMs);
    // Nothing is due yet: the scheduler does nothing.
    clock.t = calledAt + queue.callTimeoutMs - 1;
    expect(await app.timers.tick()).toBe(0);
    expect(await stateOf(ticket.id)).toBe('CALLED');
    clock.t = calledAt + queue.callTimeoutMs;
    expect(await app.timers.tick()).toBe(1);
    expect(await stateOf(ticket.id)).toBe('RECALLED');
    // The passenger's page follows.
    const page = PublicTicketResponse.parse(
      (await app.inject({ url: `/v1/tickets/${ref}` })).json(),
    );
    expect(page.state).toBe('RECALLED');
    clock.t = calledAt + queue.callTimeoutMs + queue.recallTimeoutMs;
    await app.timers.tick();
    expect(await stateOf(ticket.id)).toBe('NO_SHOW');
    clock.t += queue.reactivationWindowMs;
    await app.timers.tick();
    expect(await stateOf(ticket.id)).toBe('EXPIRED');
    // Every advance is a command of the log, by the scheduler.
    const advances = await database.db
      .select()
      .from(queueCommand)
      .where(and(eq(queueCommand.checkpointId, checkpointId), eq(queueCommand.type, 'ADVANCE')));
    expect(advances.length).toBeGreaterThanOrEqual(3);
    expect(advances.every((c) => c.actor === 'system:timer')).toBe(true);
  });

  it('applies a timeout once when two servers see it due', async () => {
    const second = buildApp({ db: database.db, clock });
    const { ticket } = await issue();
    await callUntil(ticket.id);
    clock.t += queue.callTimeoutMs;
    const count = async () =>
      (
        await database.db
          .select()
          .from(queueCommand)
          .where(and(eq(queueCommand.checkpointId, checkpointId), eq(queueCommand.type, 'ADVANCE')))
      ).length;
    const before = await count();
    await Promise.all([app.timers.tick(), second.timers.tick(), app.timers.tick()]);
    expect(await count()).toBe(before + 1);
    expect(await stateOf(ticket.id)).toBe('RECALLED');
    await second.close();
  });

  it("lets staff call again, mark a no-show and bring it back, as the ticket's state allows", async () => {
    const { ticket } = await issue();
    // Not called yet: neither a second call nor a no-show.
    expect((await act(ticket.id, 'recall')).body?.outcome).toBe('NOT_ALLOWED');
    expect((await act(ticket.id, 'no-show')).body?.outcome).toBe('NOT_ALLOWED');
    await callUntil(ticket.id);
    clock.t += MIN;
    const recalled = await act(ticket.id, 'recall');
    expect(recalled.body).toMatchObject({ action: 'RECALL', outcome: 'DONE' });
    expect(recalled.body?.ticket.state).toBe('RECALLED');
    // The no-show is due T2 after the staff's second call, not after the first timeout.
    const recalledAt = clock.now();
    clock.t = recalledAt + queue.recallTimeoutMs - 1;
    await app.timers.tick();
    expect(await stateOf(ticket.id)).toBe('RECALLED');
    clock.t = recalledAt + queue.recallTimeoutMs;
    await app.timers.tick();
    expect(await stateOf(ticket.id)).toBe('NO_SHOW');
    // Staff mark another called passenger absent at once.
    const other = await issue();
    await callUntil(other.ticket.id);
    clock.t += 30_000;
    const absent = await act(other.ticket.id, 'no-show');
    expect(absent.body?.ticket.state).toBe('NO_SHOW');
    clock.t += MIN;
    const back = await act(ticket.id, 'reactivate');
    expect(back.body?.outcome).toBe('DONE');
    expect(['QUEUED', 'PREPARE']).toContain(back.body?.ticket.state);
    // Unknown tickets are not found; a repeated key is a replay, applied once.
    expect((await act('0193a0b2-7c1d-7e5f-8a9b-0c1d2e3f4a5b', 'cancel')).status).toBe(404);
    const once = await act(ticket.id, 'cancel', undefined, 'cancel-once');
    const twice = await act(ticket.id, 'cancel', undefined, 'cancel-once');
    expect(once.body?.outcome).toBe('DONE');
    expect(twice.body).toEqual(once.body);
    const third = await issue();
    const reused = await post(`tickets/${third.ticket.id}/cancel`, undefined, 'cancel-once');
    expect(reused.statusCode).toBe(409);
    expect(await stateOf(third.ticket.id)).not.toBe('CANCELLED');
  });

  it('holds a ticket for a review: it keeps its place and is not admitted meanwhile', async () => {
    const { ticket } = await issue();
    const held = await act(ticket.id, 'review');
    expect(held.body?.ticket.state).toBe('REVIEW');
    const present = await post('admissions', { number: ticket.number });
    expect(AdmissionResponse.parse(present.json()).outcome).toBe('UNDER_REVIEW');
    const page = await app.inject({
      url: `/v1/checkpoints/${checkpointId}/queue`,
      headers: { cookie },
    });
    expect(page.statusCode).toBe(200);
    expect((await act(ticket.id, 'resolve', { decision: 'MAYBE' })).status).toBe(400);
    const released = await act(ticket.id, 'resolve', { decision: 'QUEUE' });
    expect(['QUEUED', 'PREPARE']).toContain(released.body?.ticket.state);
    expect((await act(ticket.id, 'resolve', { decision: 'QUEUE' })).body?.outcome).toBe(
      'NOT_ALLOWED',
    );
    await act(ticket.id, 'review');
    const rejected = await act(ticket.id, 'resolve', { decision: 'CANCEL' });
    expect(rejected.body?.ticket.state).toBe('CANCELLED');
  });

  it('brings a no-show back when the passenger scans the pass again, within the window', async () => {
    const f = later(150);
    const pass = passFor(f, 'NOSHOW1');
    const first = await scanPass(pass);
    expect(first.outcome).toBe('ISSUED');
    const id = first.ticket?.id ?? '';
    await callUntil(id);
    clock.t += queue.callTimeoutMs + queue.recallTimeoutMs;
    await app.timers.tick();
    expect(await stateOf(id)).toBe('NO_SHOW');
    const again = await scanPass(pass);
    expect(again.outcome).toBe('REACTIVATED');
    expect(again.ticket?.number).toBe(first.ticket?.number);
    expect(again.ref).toBe(first.ref);
    expect(['QUEUED', 'PREPARE']).toContain(await stateOf(id));
    // Past the window, the expired ticket gives way to a new one.
    await callUntil(id);
    clock.t += queue.callTimeoutMs + queue.recallTimeoutMs + 1;
    const late = await scanPass(pass);
    // One reactivation is allowed (maxReactivations): the second no-show expired at once.
    expect(late.outcome).toBe(queue.maxReactivations > 1 ? 'REACTIVATED' : 'ISSUED');
    if (late.outcome === 'ISSUED') {
      expect(late.ticket?.number).not.toBe(first.ticket?.number);
      // The new ticket keeps the passenger's first presentation, as in the simulator (S18).
      const issues = await database.db
        .select({ command: queueCommand.command, atMs: queueCommand.atMs })
        .from(queueCommand)
        .where(
          and(eq(queueCommand.checkpointId, checkpointId), eq(queueCommand.type, 'ISSUE_TICKET')),
        );
      const issueOf = (ticketId: string | undefined) =>
        issues.find((r) => (r.command as Command & { ticketId?: string }).ticketId === ticketId);
      const firstIssue = issueOf(first.ticket?.id);
      const again = issueOf(late.ticket?.id);
      expect(firstIssue?.command).not.toHaveProperty('presentedAtMs');
      expect(again?.command).toMatchObject({ presentedAtMs: firstIssue?.atMs });
      expect(again!.atMs).toBeGreaterThan(firstIssue!.atMs);
    }
  });

  it('sends to staff a pass whose ticket is under review or cancelled', async () => {
    const f = later(150);
    const reviewed = passFor(f, 'REVIEW1');
    const t1 = await scanPass(reviewed);
    await act(t1.ticket?.id ?? '', 'review');
    expect(await scanPass(reviewed)).toEqual({
      outcome: 'NEEDS_ASSISTANCE',
      reason: 'UNDER_REVIEW',
      ticket: null,
      ref: null,
    });
    const cancelled = passFor(f, 'CANCEL1');
    const t2 = await scanPass(cancelled);
    await act(t2.ticket?.id ?? '', 'cancel');
    expect(await scanPass(cancelled)).toMatchObject({
      outcome: 'NEEDS_ASSISTANCE',
      reason: 'CANCELLED',
    });
  });

  it("sends to staff a pass whose flight's boarding has closed, unless the checkpoint says otherwise", async () => {
    const closed = flights.find(
      (x) => x.boardingCloseMs !== null && x.boardingCloseMs < clock.now() && x.stdMs > clock.now(),
    );
    if (closed === undefined) throw new Error('no flight whose boarding just closed');
    const scanned = await scanPass(passFor(closed, 'LATE01'));
    expect(scanned).toEqual({
      outcome: 'NEEDS_ASSISTANCE',
      reason: 'BOARDING_CLOSED',
      ticket: null,
      ref: null,
    });
    const [row] = await database.db
      .select()
      .from(checkpoint)
      .where(eq(checkpoint.id, checkpointId));
    const settings = row?.settings as CheckpointSettings;
    await database.db
      .update(checkpoint)
      .set({ settings: { ...settings, afterBoardingClose: 'ISSUE' } })
      .where(eq(checkpoint.id, checkpointId));
    const issued = await scanPass(passFor(closed, 'LATE02'));
    expect(issued.outcome).toBe('ISSUED');
    await database.db.update(checkpoint).set({ settings }).where(eq(checkpoint.id, checkpointId));
  });

  it('admits a passenger by the boarding pass of the ticket, and keeps nothing of the pass', async () => {
    const f = later(150);
    const pass = passFor(f, 'PASSIN');
    const scanned = await scanPass(pass);
    await callUntil(scanned.ticket?.id ?? '');
    const admitted = await post('admissions', { bcbp: pass });
    expect(admitted.statusCode, admitted.body).toBe(200);
    const body = AdmissionResponse.parse(admitted.json());
    expect(body.outcome).toBe('ADMITTED');
    expect(body.ticket.id).toBe(scanned.ticket?.id);
    expect(AdmissionResponse.parse((await post('admissions', { bcbp: pass })).json()).outcome).toBe(
      'ALREADY_ADMITTED',
    );
    // A pass with no ticket here is not found.
    expect((await post('admissions', { bcbp: passFor(f, 'NOBODY') })).statusCode).toBe(404);
    // Nothing of the pass in any table: neither its text, nor its booking reference, nor the name.
    // One query at a time: the admin connection is a single client.
    const tables: unknown[] = [];
    for (const table of ['queue_command', 'queue_event', 'queue_token', 'scan', 'admission']) {
      tables.push((await database.admin.query(`SELECT * FROM ${table}`)).rows);
    }
    const dump = JSON.stringify(tables);
    for (const secret of [pass, 'PASSIN', 'SAMPLE/YOKO', 'YOKO'])
      expect(dump).not.toContain(secret);
    expect((await database.db.select().from(scan)).length).toBeGreaterThan(0);
  });

  it('rebuilds the same day from its log, staff actions and timeouts included', async () => {
    const rows = await database.db
      .select()
      .from(queueCommand)
      .where(eq(queueCommand.checkpointId, checkpointId))
      .orderBy(asc(queueCommand.seq));
    const day = CheckpointDay.replay(
      rows.map((r) => ({ seq: r.seq, atMs: r.atMs, command: r.command as Command })),
    );
    const types = new Set(rows.map((r) => r.type));
    for (const type of ['ADVANCE', 'RECALL', 'MARK_NO_SHOW', 'REACTIVATE', 'HOLD', 'CANCEL']) {
      expect(types, type).toContain(type);
    }
    const tokens = await database.db.select().from(queueToken);
    for (const t of tokens) {
      expect(day.ticket(t.id)?.state, t.number).toBe(t.state);
      expect(day.ticket(t.id)?.lastCalledAtMs ?? null).toBe(t.lastCalledAtMs);
    }
    expect(day.nextDueMs()).toBe(await nextDue());
    const verify = await app.inject({
      url: `/v1/checkpoints/${checkpointId}/audit/verify`,
      headers: { cookie },
    });
    expect(verify.json()).toMatchObject({ intact: true });
  });
});
