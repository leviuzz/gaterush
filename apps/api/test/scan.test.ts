import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { asc } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { DemoFlightsResponse, DeviceResponse, ScanResponse } from '@gateflow/contracts';
import { encodeBoardingPass } from '@gateflow/bcbp';
import type { LegInput } from '@gateflow/bcbp';
import { parseScenarioText } from '@gateflow/sim-scenarios';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app';
import { addDevice, revokeDevice } from '../src/devices';
import { flight, queueToken, scan } from '../src/db/schema';
import { randomIds } from '../src/ids';
import { designatorOf, iataOf, seedDemo } from '../src/seed';
import { zonedEpoch } from '../src/time';
import { freshDatabase } from './database';

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
const lines: string[] = [];
let flights: (typeof flight.$inferSelect)[];
let kioskToken: string;

beforeAll(async () => {
  database = await freshDatabase({ maxConnections: 12 });
  checkpointId = (
    await seedDemo(database.db, scenario, {
      now: clock.now(),
      ids: randomIds(clock),
      serviceDay: DAY,
    })
  ).checkpointId;
  flights = await database.db.select().from(flight).orderBy(asc(flight.stdMs));
  kioskToken = (
    await addDevice(database.db, randomIds(clock), { checkpointId, kind: 'KIOSK', name: 'Kiosk 1' })
  ).token;
  app = buildApp({ db: database.db, clock, logger: { stream: { write: (l) => lines.push(l) } } });
});

afterAll(async () => {
  await app.close();
  await database.close();
});

/** A flight of the day leaving at least `minutes` from now. */
function later(minutes: number) {
  const f = flights.find((x) => x.stdMs > clock.now() + minutes * MIN);
  if (f === undefined) throw new Error('no such flight');
  return f;
}

let sequence = 0;
/** A boarding pass for a flight of the day, from VCE unless said otherwise. */
function passFor(
  f: typeof flight.$inferSelect,
  overrides: Partial<LegInput> = {},
  pnr = 'QWERTY',
  extraLegs: LegInput[] = [],
): string {
  sequence++;
  const leg: LegInput = {
    pnr,
    from: 'VCE',
    to: 'CDG',
    carrier: f.carrier ?? 'ZZ',
    flightNumber: f.flightNumber ?? '1',
    dayOfYear: 327,
    compartment: 'Y',
    seat: '014C',
    checkInSequence: String(sequence).padStart(4, '0'),
    passengerStatus: '1',
    ...overrides,
  };
  return encodeBoardingPass({
    passengerName: 'SAMPLE/ZEBRA',
    electronicTicket: true,
    legs: [...extraLegs, leg],
  });
}

async function scanPass(bcbp: string, key?: string) {
  const response = await app.inject({
    method: 'POST',
    url: `/v1/checkpoints/${checkpointId}/scans`,
    payload: { bcbp },
    headers: {
      authorization: `Bearer ${kioskToken}`,
      ...(key === undefined ? {} : { 'idempotency-key': key }),
    },
  });
  expect([200, 201], response.body).toContain(response.statusCode);
  return { status: response.statusCode, body: ScanResponse.parse(response.json()) };
}

describe('scanning boarding passes (S13)', () => {
  it('takes scans only from a kiosk of this checkpoint (S14)', async () => {
    const send = (authorization?: string) =>
      app.inject({
        method: 'POST',
        url: `/v1/checkpoints/${checkpointId}/scans`,
        payload: { bcbp: 'M1X' },
        headers: authorization === undefined ? {} : { authorization },
      });
    expect((await send()).statusCode).toBe(401);
    expect((await send('Bearer not-a-token')).statusCode).toBe(401);
    const display = await addDevice(database.db, randomIds(clock), {
      checkpointId,
      kind: 'DISPLAY',
      name: 'Display 1',
    });
    expect((await send(`Bearer ${display.token}`)).statusCode).toBe(403);
    const old = await addDevice(database.db, randomIds(clock), {
      checkpointId,
      kind: 'KIOSK',
      name: 'Old kiosk',
    });
    expect((await send(`Bearer ${old.token}`)).statusCode).toBe(200);
    expect(await revokeDevice(database.db, old.device.id)).toBe(true);
    expect((await send(`Bearer ${old.token}`)).statusCode).toBe(401);
    // A kiosk learns where it is, and lists only the demo flights of today.
    const me = await app.inject({
      url: '/v1/devices/me',
      headers: { authorization: `Bearer ${kioskToken}` },
    });
    // The answers are those of the contracts.
    expect(DeviceResponse.parse(me.json())).toMatchObject({
      device: { kind: 'KIOSK', label: 'Kiosk 1' },
      checkpoint: { id: checkpointId },
      airport: { iata: 'VCE', timeZone: 'Europe/Rome', synthetic: true },
    });
    const demo = await app.inject({
      url: `/v1/checkpoints/${checkpointId}/demo-flights`,
      headers: { authorization: `Bearer ${kioskToken}` },
    });
    const listed = DemoFlightsResponse.parse(demo.json());
    expect(listed.date).toBe(DAY);
    expect(listed.flights.length).toBe(flights.length);
    expect(listed.flights.every((f) => f.carrier === 'ZZ')).toBe(true);
  });

  it('gives the library flights the designators of their boarding passes', () => {
    expect(designatorOf('F001')).toEqual({ carrier: 'ZZ', flightNumber: '1' });
    expect(designatorOf('AZ1462')).toEqual({ carrier: 'AZ', flightNumber: '1462' });
    expect(designatorOf('U2 0045D')).toEqual({ carrier: 'U2', flightNumber: '45D' });
    expect(iataOf('vce-like')).toBe('VCE');
    expect(iataOf('single-checkpoint-demo')).toBe('ZZZ');
    expect(flights.every((f) => f.carrier === 'ZZ' && f.departureDate !== null)).toBe(true);
  });

  it('issues a ticket for a pass, and gives the same ticket when it is scanned again', async () => {
    const pass = passFor(later(90));
    const first = await scanPass(pass);
    expect(first.status).toBe(201);
    expect(first.body).toMatchObject({
      outcome: 'ISSUED',
      reason: null,
      ticket: { source: 'KIOSK', segment: 'DEPARTING', partySize: 1 },
    });
    const again = await scanPass(pass);
    expect(again.status).toBe(200);
    expect(again.body).toMatchObject({ outcome: 'RETRIEVED', reason: null, ref: first.body.ref });
    expect(again.body.ticket?.id).toBe(first.body.ticket?.id);
  });

  it('gives one ticket when one pass is scanned at several kiosks at once', async () => {
    const pass = passFor(later(100));
    const answers = await Promise.all(Array.from({ length: 10 }, () => scanPass(pass)));
    const issued = answers.filter((a) => a.body.outcome === 'ISSUED');
    expect(issued.length).toBe(1);
    expect(answers.filter((a) => a.body.outcome === 'RETRIEVED').length).toBe(9);
    expect(new Set(answers.map((a) => a.body.ticket?.id)).size).toBe(1);
  });

  it("refuses another airport's or another day's pass with a reason, and sends unknown flights to staff", async () => {
    const before = (await database.db.select().from(queueToken)).length;
    const f = later(90);
    const cases = [
      [passFor(f, { from: 'FCO' }), 'REJECTED', 'WRONG_AIRPORT'],
      [passFor(f, { dayOfYear: 330 }), 'REJECTED', 'WRONG_DAY'],
      ['M1NOT/A PASS', 'REJECTED', 'UNREADABLE'],
      [passFor(f, { flightNumber: '9999' }), 'NEEDS_ASSISTANCE', 'UNKNOWN_FLIGHT'],
    ] as const;
    for (const [bcbp, outcome, reason] of cases) {
      const { status, body } = await scanPass(bcbp);
      expect(status).toBe(200);
      expect(body).toEqual({ outcome, reason, ticket: null, ref: null });
    }
    expect((await database.db.select().from(queueToken)).length).toBe(before);
    const reasons = (await database.db.select().from(scan)).map((s) => s.reason);
    expect(reasons).toEqual(
      expect.arrayContaining(['WRONG_AIRPORT', 'WRONG_DAY', 'UNREADABLE', 'UNKNOWN_FLIGHT']),
    );
  });

  it('gives a connecting passenger a transfer ticket for the leg from here', async () => {
    const inbound: LegInput = {
      pnr: 'ZXCVBN',
      from: 'BRI',
      to: 'VCE',
      carrier: 'ZZ',
      flightNumber: '700',
      dayOfYear: 327,
      compartment: 'Y',
      seat: '003A',
      checkInSequence: '0099',
      passengerStatus: '1',
    };
    const { body } = await scanPass(passFor(later(110), {}, 'ZXCVBN', [inbound]));
    expect(body).toMatchObject({ outcome: 'ISSUED', ticket: { segment: 'TRANSFER' } });
  });

  it('sends a passenger already admitted to staff when the pass is scanned again', async () => {
    const pass = passFor(later(120));
    const issued = await scanPass(pass);
    clock.t += MIN;
    for (let i = 0; i < 50; i++) {
      const call = await app.inject({
        method: 'POST',
        url: `/v1/checkpoints/${checkpointId}/calls`,
      });
      const { called } = call.json<{ called: { id: string } | null }>();
      if (called === null || called.id === issued.body.ticket?.id) break;
    }
    const admitted = await app.inject({
      method: 'POST',
      url: `/v1/checkpoints/${checkpointId}/admissions`,
      payload: { ref: issued.body.ref },
    });
    expect(admitted.json()).toMatchObject({ outcome: 'ADMITTED' });
    const { body } = await scanPass(pass);
    expect(body).toMatchObject({ outcome: 'NEEDS_ASSISTANCE', reason: 'ALREADY_ADMITTED' });
  });

  it('keeps no boarding pass, name or booking reference, in the database or in the log', async () => {
    const tables = await database.admin.query<{ tablename: string }>(
      `SELECT tablename FROM pg_tables WHERE schemaname = 'public'`,
    );
    const dump: string[] = [];
    for (const { tablename } of tables.rows) {
      const rows = await database.admin.query(
        `SELECT row_to_json(t)::text AS j FROM "${tablename}" t`,
      );
      for (const row of rows.rows as { j: string }[]) dump.push(row.j);
    }
    const everything = dump.join('\n');
    expect(everything.length).toBeGreaterThan(1000);
    for (const secret of ['QWERTY', 'ZXCVBN', 'ZEBRA', 'SAMPLE/']) {
      expect(everything).not.toContain(secret);
      expect(lines.join('')).not.toContain(secret);
    }
    expect(lines.join('')).toContain('/scans');
  });
});
