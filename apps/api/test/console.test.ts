import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { and, asc, desc, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import {
  ActivatePolicyResponse,
  AuditResponse,
  IssueTicketResponse,
  PolicyStatusResponse,
  PublishPolicyResponse,
} from '@gateflow/contracts';
import type { DayConfig } from '@gateflow/operations';
import { FIFO_POLICY, VIRTUAL_FIFO_POLICY } from '@gateflow/queue-core';
import { parseScenarioText } from '@gateflow/sim-scenarios';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app';
import { checkpoint, flight, policyActivation, queueCommand } from '../src/db/schema';
import type { CheckpointSettings } from '../src/db/schema';
import { randomIds } from '../src/ids';
import { seedDemo } from '../src/seed';
import { zonedEpoch } from '../src/time';
import { freshDatabase } from './database';
import { staffCookie } from './staff';

/*
 * What the supervisor's console reads and an administrator decides (S17, ADR-050), on PostgreSQL:
 * versions of a policy, immutable and named by their hash; an activation that applies from the
 * next service day, never to a day already open; the audit view of a day's log, with who, what,
 * when and why, and nothing that identifies a passenger or opens their ticket.
 */

const file = fileURLToPath(new URL('../../../scenarios/vce-like-peak-day.yaml', import.meta.url));
const scenario = parseScenarioText(readFileSync(file, 'utf8'), 'yaml', {
  read: (path) => readFileSync(join(dirname(file), path), 'utf8'),
  sha256: (text) => createHash('sha256').update(text).digest('hex'),
});
const DAY = '2026-11-23';
const NEXT = '2026-11-24';
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
let admin: string;
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
  app = buildApp({ db: database.db, clock });
  await signIn();
});

afterAll(async () => {
  await app.close();
  await database.close();
});

/** Sessions of the members, again after the clock moved a day. */
async function signIn() {
  admin = await staffCookie(app, database.db, clock, airportId, 'ADMIN');
  supervisor = await staffCookie(app, database.db, clock, airportId, 'SUPERVISOR');
  operator = await staffCookie(app, database.db, clock, airportId, 'OPERATOR');
}

let keys = 0;
async function post(path: string, body: unknown, cookie: string) {
  return app.inject({
    method: 'POST',
    url: `/v1/checkpoints/${checkpointId}/${path}`,
    headers: { cookie, 'idempotency-key': `console-${String(++keys)}` },
    payload: body as Record<string, unknown>,
  });
}

async function get(path: string, cookie = supervisor) {
  return app.inject({ url: `/v1/checkpoints/${checkpointId}/${path}`, headers: { cookie } });
}

const status = async () => PolicyStatusResponse.parse((await get('policy')).json());

async function issue() {
  const f = flights.find((x) => x.stdMs > clock.now() + 150 * MIN);
  const r = await post(
    'tickets',
    { flightId: f?.id ?? flights.at(-1)?.id, segment: 'DEPARTING', reason: 'ASSISTANCE' },
    supervisor,
  );
  expect(r.statusCode, r.body).toBe(201);
  return IssueTicketResponse.parse(r.json());
}

/** The policy a service day opened with, as its log records it. */
async function openedWith(serviceDay: string) {
  const [row] = await database.db
    .select({ command: queueCommand.command })
    .from(queueCommand)
    .where(
      and(
        eq(queueCommand.checkpointId, checkpointId),
        eq(queueCommand.serviceDay, serviceDay),
        eq(queueCommand.type, 'OPEN_DAY'),
      ),
    );
  return (row?.command as { config: DayConfig } | undefined)?.config.policy;
}

describe('versioned policies (S17)', () => {
  it("shows today's policy among the airport's versions, published by GateFlow", async () => {
    const s = await status();
    expect(s.today).toMatchObject({ serviceDay: DAY, policy: { policyId: 'priority-v3' } });
    expect(s.next.serviceDay).toBe(NEXT);
    expect(s.versions.map((v) => v.policyId).sort()).toEqual(['priority-v3', 'virtual-fifo']);
    expect(s.versions.every((v) => v.createdBy === 'GateFlow')).toBe(true);
    // Today's policy is one of them, by its hash.
    expect(s.versions.map((v) => v.hash)).toContain(s.today.policy.hash);
    expect((await get('policy', operator)).statusCode).toBe(403);
  });

  it('lets administrators only publish a version, once per content', async () => {
    const policy = { ...VIRTUAL_FIFO_POLICY, id: 'virtual-fifo-small', title: 'Small window' };
    const small = { ...policy, queue: { ...VIRTUAL_FIFO_POLICY.queue, prepareWindowSize: 4 } };
    expect((await post('policy/versions', { policy: small }, supervisor)).statusCode).toBe(403);
    // A physical queue, or something that is not a policy, never runs a live checkpoint.
    expect((await post('policy/versions', { policy: FIFO_POLICY }, admin)).statusCode).toBe(400);
    const broken = { id: 'x', version: '1', title: 'x', selection: 'none' };
    expect((await post('policy/versions', { policy: broken }, admin)).statusCode).toBe(400);
    const first = await post('policy/versions', { policy: small }, admin);
    expect(first.statusCode, first.body).toBe(201);
    const published = PublishPolicyResponse.parse(first.json());
    expect(published.created).toBe(true);
    const again = await post('policy/versions', { policy: small }, admin);
    expect(again.statusCode).toBe(200);
    expect(PublishPolicyResponse.parse(again.json())).toEqual({ ...published, created: false });
    expect((await status()).versions).toHaveLength(3);
  });

  it('activates a version from the next service day: the day under way keeps its own', async () => {
    await issue();
    expect((await openedWith(DAY))?.id).toBe('priority-v3');
    const fifo = (await status()).versions.find((v) => v.policyId === 'virtual-fifo');
    expect((await post('policy/activations', { versionId: fifo?.id }, supervisor)).statusCode).toBe(
      403,
    );
    expect(
      (
        await post(
          'policy/activations',
          { versionId: '0193a0b2-7c1d-7e5f-8a9b-0c1d2e3f4a5b' },
          admin,
        )
      ).statusCode,
    ).toBe(404);
    const r = await post('policy/activations', { versionId: fifo?.id }, admin);
    expect(r.statusCode, r.body).toBe(200);
    expect(ActivatePolicyResponse.parse(r.json())).toMatchObject({
      fromServiceDay: NEXT,
      policy: { policyId: 'virtual-fifo', hash: fifo?.hash },
    });
    const s = await status();
    expect(s.today.policy.policyId).toBe('priority-v3');
    expect(s.next.policy.policyId).toBe('virtual-fifo');
    expect(s.activations[0]).toMatchObject({ fromServiceDay: NEXT, versionId: fifo?.id });
    // Today's commands still run priority v3; the next day opens with the version activated.
    await issue();
    clock.t = zonedEpoch(NEXT, 6 * 60 * MIN, 'Europe/Rome');
    await signIn();
    await issue();
    expect((await openedWith(NEXT))?.id).toBe('virtual-fifo');
    expect((await status()).today.policy.hash).toBe(fifo?.hash);
  });

  it('never activates a version for a day already open, whatever a server clock says', async () => {
    // A server whose clock is a day late: for it, the next day is the one already open.
    const late = clock.t;
    clock.t -= 24 * 60 * MIN;
    const v3 = (await status()).versions.find((v) => v.policyId === 'priority-v3');
    const r = await post('policy/activations', { versionId: v3?.id }, admin);
    clock.t = late;
    expect(r.statusCode, r.body).toBe(200);
    expect(ActivatePolicyResponse.parse(r.json()).fromServiceDay).toBe('2026-11-25');
    const [latest] = await database.db
      .select()
      .from(policyActivation)
      .where(eq(policyActivation.checkpointId, checkpointId))
      .orderBy(desc(policyActivation.seq));
    expect(latest?.fromServiceDay).toBe('2026-11-25');
    expect((await openedWith(NEXT))?.id).toBe('virtual-fifo');
    // The day after opens with it, though that server wrote it with an earlier time.
    expect((await status()).next.policy.policyId).toBe('priority-v3');
  });
});

describe('the audit view (S17)', () => {
  it("reads a day's log: who, what, when and why, the latest first", async () => {
    clock.t += MIN;
    const issued = await issue();
    const number = issued.ticket.number;
    expect(
      (
        await post(
          `tickets/${issued.ticket.id}/call-now`,
          { reason: 'AIRLINE_REQUEST' },
          supervisor,
        )
      ).statusCode,
    ).toBe(200);
    expect((await post('mode', { mode: 'PAUSED' }, supervisor)).statusCode).toBe(200);
    expect((await post('lanes', { lanesOpen: 5 }, supervisor)).statusCode).toBe(200);
    const page = await get('audit');
    expect(page.statusCode, page.body).toBe(200);
    const audit = AuditResponse.parse(page.json());
    expect(audit.serviceDay).toBe(NEXT);
    const [lanes, mode, callNow] = audit.entries;
    expect(lanes).toMatchObject({
      command: 'SET_LANES',
      by: { kind: 'STAFF' },
      outcome: 'DONE',
      detail: { lanesOpen: 5 },
    });
    expect(mode).toMatchObject({
      command: 'SET_MODE',
      outcome: 'DONE',
      detail: { mode: 'PAUSED', previous: 'NORMAL', reset: false },
    });
    expect(callNow).toMatchObject({
      command: 'OVERRIDE',
      ticket: number,
      outcome: 'DONE',
      reason: 'AIRLINE_REQUEST',
      detail: { override: 'CALL_NOW' },
      events: [
        { type: 'OVERRIDDEN', ticket: number },
        { type: 'CALLED', ticket: number },
      ],
    });
    expect(callNow?.by.label).toMatch(/^supervisor-/);
    const opening = audit.entries.find((e) => e.command === 'OPEN_DAY');
    const [cp] = await database.db.select().from(checkpoint).where(eq(checkpoint.id, checkpointId));
    const lanesOpen = (cp?.settings as CheckpointSettings).lanesOpen;
    expect(opening).toMatchObject({ by: { kind: 'SYSTEM' }, detail: { lanesOpen } });
    expect(opening?.detail.policy).toMatch(/^virtual-fifo /);
    // The ticket's own history.
    const own = AuditResponse.parse((await get(`audit?number=${number}`)).json());
    expect(own.entries.map((e) => e.command)).toEqual(['OVERRIDE', 'ISSUE_TICKET']);
    expect(own.entries[1]).toMatchObject({ reason: 'ASSISTANCE', detail: { source: 'STAFF' } });
    // Nothing that opens the passenger's page.
    expect(page.body).not.toContain(issued.ref);
    // Another day; pages.
    const before = AuditResponse.parse((await get(`audit?day=${DAY}&limit=2`)).json());
    expect(before.entries).toHaveLength(2);
    expect(before.more).toBe(true);
    const older = AuditResponse.parse(
      (await get(`audit?day=${DAY}&limit=2&before=${String(before.entries[1]?.seq)}`)).json(),
    );
    expect(older.entries[0]?.seq).toBeLessThan(before.entries[1]?.seq ?? 0);
    expect((await get('audit?number=Z999')).json()).toMatchObject({ entries: [], more: false });
    expect((await get('audit?day=yesterday')).statusCode).toBe(400);
    expect((await get('audit', operator)).statusCode).toBe(403);
  });
});
