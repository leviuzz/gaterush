import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { asc, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import {
  AdmissionResponse,
  CallNextResponse,
  IssueTicketResponse,
  PublicTicketResponse,
  ScanResponse,
} from '@gateflow/contracts';
import { encodeBoardingPass } from '@gateflow/bcbp';
import { CheckpointDay } from '@gateflow/operations';
import type { Command } from '@gateflow/operations';
import { parseScenarioText } from '@gateflow/sim-scenarios';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app';
import { addDevice } from '../src/devices';
import { flight, partyPass, queueCommand, queueToken, scan } from '../src/db/schema';
import { randomIds } from '../src/ids';
import { seedDemo } from '../src/seed';
import { zonedEpoch } from '../src/time';
import { freshDatabase } from './database';
import { staffCookie } from './staff';

/*
 * A party at the kiosk (S15): a family takes one number and scans its other boarding passes onto
 * it, so the queue counts the people it will call. A pass joins only a waiting party of its own
 * flight, and only if it has no number of its own; a companion's rescan finds the family's number,
 * and the lane admits the family by any of its passes.
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
  app = buildApp({ db: database.db, clock });
  cookie = await staffCookie(app, database.db, clock, seeded.airportId);
});

afterAll(async () => {
  await app.close();
  await database.close();
});

/** The flights of the day leaving at least `minutes` from now, earliest first. */
function later(minutes: number, index = 0) {
  const f = flights.filter((x) => x.stdMs > clock.now() + minutes * MIN)[index];
  if (f === undefined) throw new Error('no such flight');
  return f;
}

let keys = 0;
const nextKey = () => `party-${String(++keys)}`;

async function post(path: string, body?: unknown) {
  return app.inject({
    method: 'POST',
    url: `/v1/checkpoints/${checkpointId}/${path}`,
    headers: { cookie, 'idempotency-key': nextKey() },
    ...(body === undefined ? {} : { payload: body as Record<string, unknown> }),
  });
}

let sequence = 0;
function passFor(f: typeof flight.$inferSelect, pnr: string, name = 'SAMPLE/ADA'): string {
  sequence++;
  return encodeBoardingPass({
    passengerName: name,
    electronicTicket: true,
    legs: [
      {
        pnr,
        from: 'VCE',
        to: 'BCN',
        carrier: f.carrier ?? 'ZZ',
        flightNumber: f.flightNumber ?? '1',
        dayOfYear: 327,
        compartment: 'Y',
        seat: `0${String(10 + sequence)}A`,
        checkInSequence: String(sequence).padStart(4, '0'),
        passengerStatus: '1',
      },
    ],
  });
}

/** A scan at the kiosk; with `party`, the pass joins that ticket's party. */
async function scanPass(bcbp: string, party?: string, key = nextKey()) {
  const r = await app.inject({
    method: 'POST',
    url: `/v1/checkpoints/${checkpointId}/scans`,
    payload: party === undefined ? { bcbp } : { bcbp, party },
    headers: { authorization: `Bearer ${kioskToken}`, 'idempotency-key': key },
  });
  expect([200, 201], r.body).toContain(r.statusCode);
  return ScanResponse.parse(r.json());
}

async function sizeOf(ticketId: string): Promise<number> {
  const rows = await database.db.select().from(queueToken).where(eq(queueToken.id, ticketId));
  return rows[0]?.partySize ?? 0;
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

describe('a party at the kiosk (S15)', () => {
  it("adds a family's boarding passes to one number, once each", async () => {
    const f = later(150);
    const [father, mother, child] = [
      passFor(f, 'FAM001', 'SAMPLE/PIETRO'),
      passFor(f, 'FAM001', 'SAMPLE/GIULIA'),
      passFor(f, 'FAM001', 'SAMPLE/NINA'),
    ];
    const first = await scanPass(father);
    expect(first.outcome).toBe('ISSUED');
    const id = first.ticket?.id ?? '';
    const ref = first.ref ?? '';
    const added = await scanPass(mother, ref);
    expect(added).toMatchObject({ outcome: 'ADDED', reason: null, ref });
    expect(added.ticket).toMatchObject({ id, number: first.ticket?.number, partySize: 2 });
    expect((await scanPass(child, ref)).ticket?.partySize).toBe(3);
    // A pass on the number already is found again, not added twice: the father's own as well.
    for (const pass of [mother, father]) {
      const again = await scanPass(pass, ref);
      expect(again).toMatchObject({ outcome: 'RETRIEVED', reason: null, ref });
      expect(again.ticket?.partySize).toBe(3);
    }
    // A request sent twice (the kiosk retries with the same key) adds the pass once.
    const grandma = passFor(f, 'FAM001', 'SAMPLE/ANNA');
    const key = nextKey();
    const once = await scanPass(grandma, ref, key);
    const twice = await scanPass(grandma, ref, key);
    expect(once.ticket?.partySize).toBe(4);
    expect(twice).toEqual(once);
    expect(await sizeOf(id)).toBe(4);
    // The passenger's page says how many people the number is for.
    const page = PublicTicketResponse.parse(
      (await app.inject({ url: `/v1/tickets/${ref}` })).json(),
    );
    expect(page).toMatchObject({ number: first.ticket?.number, partySize: 4 });
  });

  it("finds the family's number when a companion scans alone, and admits the family by any pass", async () => {
    const f = later(150);
    const father = passFor(f, 'FAM002', 'SAMPLE/LUCA');
    const son = passFor(f, 'FAM002', 'SAMPLE/MARCO');
    const first = await scanPass(father);
    await scanPass(son, first.ref ?? '');
    const alone = await scanPass(son);
    expect(alone).toMatchObject({ outcome: 'RETRIEVED', reason: null, ref: first.ref });
    expect(alone.ticket).toMatchObject({ id: first.ticket?.id, partySize: 2 });
    await callUntil(first.ticket?.id ?? '');
    const admitted = await post('admissions', { bcbp: son });
    expect(admitted.statusCode, admitted.body).toBe(200);
    expect(AdmissionResponse.parse(admitted.json())).toMatchObject({
      outcome: 'ADMITTED',
      ticket: { id: first.ticket?.id, partySize: 2 },
    });
  });

  it('refuses a pass of another flight, one with a number of its own, and a party not waiting or full', async () => {
    const f = later(150);
    const party = await scanPass(passFor(f, 'FAM003'));
    const ref = party.ref ?? '';
    const refused = (reason: string, outcome = 'REJECTED') => ({
      outcome,
      reason,
      ticket: null,
      ref: null,
    });
    // Another flight: its own number, with its own deadline.
    expect(await scanPass(passFor(later(150, 3), 'OTHER1'), ref)).toEqual(refused('OTHER_FLIGHT'));
    // A pass with a number of its own keeps it; one held by staff goes to staff.
    const own = passFor(f, 'OWN001');
    const ownTicket = await scanPass(own);
    expect(await scanPass(own, ref)).toEqual(refused('HAS_OWN_NUMBER'));
    const held = passFor(f, 'HELD01');
    const heldTicket = await scanPass(held);
    expect((await post(`tickets/${heldTicket.ticket?.id ?? ''}/review`)).statusCode).toBe(200);
    expect(await scanPass(held, ref)).toEqual(refused('UNDER_REVIEW', 'NEEDS_ASSISTANCE'));
    expect(await sizeOf(party.ticket?.id ?? '')).toBe(1);
    expect(await sizeOf(ownTicket.ticket?.id ?? '')).toBe(1);
    // A pass that cannot be read is refused as at any scan; an unknown number is not found.
    expect(await scanPass('M1NOT A PASS', ref)).toMatchObject({ outcome: 'REJECTED' });
    const unknown = await app.inject({
      method: 'POST',
      url: `/v1/checkpoints/${checkpointId}/scans`,
      payload: { bcbp: passFor(f, 'LOST01'), party: 'AAAAAAAAAAAAAAAAAAAAAA' },
      headers: { authorization: `Bearer ${kioskToken}` },
    });
    expect(unknown.statusCode).toBe(404);
    // Twenty people at most on a ticket.
    const group = await post('tickets', {
      flightId: f.id,
      segment: 'DEPARTING',
      partySize: 19,
      reason: 'GROUP',
    });
    const groupRef = IssueTicketResponse.parse(group.json()).ref;
    expect((await scanPass(passFor(f, 'GRP001'), groupRef)).ticket?.partySize).toBe(20);
    expect(await scanPass(passFor(f, 'GRP002'), groupRef)).toEqual(refused('PARTY_FULL'));
    // Once the number is called, nobody more joins it.
    await callUntil(party.ticket?.id ?? '');
    expect(await scanPass(passFor(f, 'LATE03'), ref)).toEqual(refused('TOO_LATE'));
  });

  it('keeps nothing of the passes it adds, and rebuilds every party from the log', async () => {
    const outcomes = (await database.db.select().from(scan)).map((s) => s.outcome);
    expect(outcomes).toContain('ADDED');
    expect((await database.db.select().from(partyPass)).length).toBe(5);
    // A record, like the scans: nobody changes or removes a pass added.
    for (const statement of [
      `UPDATE party_pass SET at_ms = 0`,
      `DELETE FROM party_pass`,
      `TRUNCATE party_pass`,
    ]) {
      await expect(database.admin.query(statement), statement).rejects.toThrow(/append-only/);
    }
    // One query after the other: the connection takes one at a time.
    const tables: unknown[] = [];
    for (const table of ['queue_command', 'queue_event', 'queue_token', 'scan', 'party_pass']) {
      tables.push((await database.admin.query(`SELECT * FROM ${table}`)).rows);
    }
    const dump = JSON.stringify(tables);
    for (const secret of ['FAM001', 'FAM002', 'SAMPLE/GIULIA', 'GIULIA', 'MARCO']) {
      expect(dump).not.toContain(secret);
    }
    const rows = await database.db
      .select()
      .from(queueCommand)
      .where(eq(queueCommand.checkpointId, checkpointId))
      .orderBy(asc(queueCommand.seq));
    expect(rows.filter((r) => r.type === 'ADD_TO_PARTY').length).toBe(5);
    const day = CheckpointDay.replay(
      rows.map((r) => ({ seq: r.seq, atMs: r.atMs, command: r.command as Command })),
    );
    for (const t of await database.db.select().from(queueToken)) {
      expect(day.ticket(t.id)?.partySize, t.number).toBe(t.partySize);
    }
    const verify = await app.inject({
      url: `/v1/checkpoints/${checkpointId}/audit/verify`,
      headers: { cookie },
    });
    expect(verify.json()).toMatchObject({ intact: true });
  });
});
