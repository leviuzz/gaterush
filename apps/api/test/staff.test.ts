import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { asc, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { MeResponse, ROUTES, StaffMemberResponse } from '@gateflow/contracts';
import { parseScenarioText } from '@gateflow/sim-scenarios';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app';
import { flight, queueCommand, staffSession, staffUser } from '../src/db/schema';
import { randomIds } from '../src/ids';
import { seedDemo } from '../src/seed';
import { SESSION_MS, addStaff, disableStaff, resetPassword } from '../src/staff';
import { zonedEpoch } from '../src/time';
import { freshDatabase } from './database';
import { staffCookie } from './staff';

/*
 * Staff sign in (S15): every staff route needs a session of the right role at the checkpoint; a
 * session is a cookie the page cannot read, refused from another site; passwords and tokens are
 * never stored; failures are slowed down; a disabled member is out at once.
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
const lines: string[] = [];
let checkpointId: string;
let airportId: string;
/** A checkpoint of another airport. */
let elsewhere: { checkpointId: string; airportId: string };
let flightId: string;

beforeAll(async () => {
  database = await freshDatabase({ maxConnections: 12 });
  const ids = randomIds(clock);
  const vce = await seedDemo(database.db, read('vce-like-peak-day.yaml'), {
    now: clock.now(),
    ids,
    serviceDay: DAY,
  });
  checkpointId = vce.checkpointId;
  airportId = vce.airportId;
  const tsf = await seedDemo(database.db, read('tsf-like-peak-day.yaml'), {
    now: clock.now(),
    ids,
    serviceDay: DAY,
  });
  elsewhere = { checkpointId: tsf.checkpointId, airportId: tsf.airportId };
  const flights = await database.db
    .select()
    .from(flight)
    .where(eq(flight.airportId, airportId))
    .orderBy(asc(flight.stdMs));
  const later = flights.find((f) => f.stdMs > clock.now() + 150 * MIN);
  if (later === undefined) throw new Error('no flight');
  flightId = later.id;
  // With the digital twin (S18), so that every staff route of the contracts is there.
  app = buildApp({
    db: database.db,
    clock,
    logger: { stream: { write: (l) => lines.push(l) } },
    twin: { library: [] },
  });
});

afterAll(async () => {
  await app.close();
  await database.close();
});

const TICKET = '0193a0b2-7c1d-7e5f-8a9b-0c1d2e3f4a5b';

/**
 * Every staff route of the contracts, with its role, on the test's checkpoint. With `answered`,
 * only the routes that answer and end: a stream stays open (its rights are checked over HTTP in
 * display.test.ts).
 */
const staffRoutes = (answered = false) =>
  ROUTES.filter((r) => r.staff !== undefined && !(answered && r.stream === true)).map((r) => ({
    method: r.method.toUpperCase() as 'GET' | 'POST',
    url: r.path
      .replace('{checkpointId}', checkpointId)
      .replace('{ticketId}', TICKET)
      .replace('{runId}', TICKET)
      .replace('{scenarioId}', TICKET),
    role: r.staff,
  }));

async function signIn(login: string, password: string, headers: Record<string, string> = {}) {
  return app.inject({
    method: 'POST',
    url: '/v1/auth/sign-in',
    payload: { login, password },
    headers,
  });
}

describe('staff sign in (S15)', () => {
  it('refuses every staff route without a session', async () => {
    for (const route of staffRoutes()) {
      const r = await app.inject({ method: route.method, url: route.url });
      expect(r.statusCode, `${route.method} ${route.url}`).toBe(401);
      expect(r.json()).toMatchObject({ error: { code: 'SIGN_IN_REQUIRED' } });
    }
  });

  it('lets each role do what its role allows, at its checkpoints only', async () => {
    const operator = await staffCookie(app, database.db, clock, airportId, 'OPERATOR');
    const supervisor = await staffCookie(app, database.db, clock, airportId, 'SUPERVISOR');
    for (const route of staffRoutes(true)) {
      const r = await app.inject({
        method: route.method,
        url: route.url,
        headers: { cookie: operator },
      });
      // Allowed to an operator: past the check, a fake ticket or a missing body; not a 401/403.
      if (route.role === 'OPERATOR')
        expect([200, 201, 400, 404], route.url).toContain(r.statusCode);
      else expect(r.statusCode, route.url).toBe(403);
    }
    const cancel = await app.inject({
      method: 'POST',
      url: `/v1/checkpoints/${checkpointId}/tickets/${TICKET}/cancel`,
      headers: { cookie: supervisor },
    });
    expect(cancel.statusCode).toBe(404);
    // A member of another airport, or of another checkpoint of this airport, may not.
    const foreign = await staffCookie(app, database.db, clock, elsewhere.airportId, 'ADMIN');
    const other = await staffCookie(app, database.db, clock, airportId, 'ADMIN', [TICKET]);
    for (const cookie of [foreign, other]) {
      const r = await app.inject({
        method: 'POST',
        url: `/v1/checkpoints/${checkpointId}/calls`,
        headers: { cookie },
      });
      expect(r.statusCode).toBe(403);
    }
    // The log says who acted.
    const issued = await app.inject({
      method: 'POST',
      url: `/v1/checkpoints/${checkpointId}/tickets`,
      payload: { flightId, segment: 'DEPARTING', reason: 'ASSISTANCE' },
      headers: { cookie: operator },
    });
    expect(issued.statusCode, issued.body).toBe(201);
    const me = StaffMemberResponse.parse(
      (await app.inject({ url: '/v1/auth/me', headers: { cookie: operator } })).json(),
    );
    const [last] = await database.db
      .select()
      .from(queueCommand)
      .where(eq(queueCommand.type, 'ISSUE_TICKET'));
    expect(last?.actor).toBe(`staff:${me.member.id}`);
  });

  it('refuses a staff request sent by a page of another site', async () => {
    const cookie = await staffCookie(app, database.db, clock, airportId, 'SUPERVISOR');
    const r = await app.inject({
      method: 'POST',
      url: `/v1/checkpoints/${checkpointId}/calls`,
      headers: { cookie, origin: 'https://elsewhere.example' },
    });
    expect(r.statusCode).toBe(403);
    expect(r.json()).toMatchObject({ error: { code: 'CROSS_ORIGIN' } });
    const same = await app.inject({
      method: 'POST',
      url: `/v1/checkpoints/${checkpointId}/calls`,
      headers: { cookie, origin: 'http://localhost:80', host: 'localhost:80' },
    });
    expect(same.statusCode).toBe(200);
  });

  it('gives a session in a cookie the page cannot read, and never the token or the password', async () => {
    const { member, password } = await addStaff(database.db, randomIds(clock), {
      airportId,
      login: 'lane.one',
      role: 'OPERATOR',
      checkpointIds: [checkpointId],
    });
    const r = await signIn('lane.one', password);
    expect(r.statusCode).toBe(200);
    expect(StaffMemberResponse.parse(r.json())).toEqual({
      member: { id: member.id, login: 'lane.one', role: 'OPERATOR', checkpoints: [checkpointId] },
    });
    const cookie = r.cookies.find((c) => c.name === 'gateflow_session');
    expect(cookie).toMatchObject({ httpOnly: true, sameSite: 'Strict', path: '/' });
    expect(cookie?.maxAge).toBe(SESSION_MS / 1000);
    const token = cookie?.value ?? '';
    expect(token.length).toBeGreaterThanOrEqual(43);
    expect(r.body).not.toContain(token);
    // Over TLS (behind a proxy), the cookie is Secure.
    const tls = await signIn('lane.one', password, { 'x-forwarded-proto': 'https' });
    expect(tls.cookies.find((c) => c.name === 'gateflow_session')?.secure).toBe(true);
    // Neither the password nor a token is stored, or logged.
    const [user] = await database.db.select().from(staffUser).where(eq(staffUser.id, member.id));
    expect(user?.passwordHash).toMatch(/^scrypt\$32768\$8\$3\$/);
    const dump = JSON.stringify([
      await database.db.select().from(staffUser),
      await database.db.select().from(staffSession),
      lines,
    ]);
    for (const secret of [password, token]) expect(dump).not.toContain(secret);
  });

  it('answers a wrong password as an unknown login, and slows down repeated failures', async () => {
    const { password } = await addStaff(database.db, randomIds(clock), {
      airportId,
      login: 'lane.two',
      role: 'OPERATOR',
      checkpointIds: null,
    });
    const wrong = await signIn('lane.two', 'not-the-password');
    const unknown = await signIn('nobody.here', 'whatever');
    expect(wrong.statusCode).toBe(401);
    expect(unknown.statusCode).toBe(401);
    expect(wrong.json()).toEqual(unknown.json());
    for (let i = 0; i < 9; i++) expect((await signIn('lane.two', 'again')).statusCode).toBe(401);
    // Ten failures in a quarter of an hour: even the right password waits.
    expect((await signIn('lane.two', password)).statusCode).toBe(429);
    clock.t += 16 * MIN;
    expect((await signIn('lane.two', password)).statusCode).toBe(200);
  });

  it('ends sessions on sign-out, after a shift, on a new password and when disabled', async () => {
    const cookieOf = async (login: string, password: string) => {
      const r = await signIn(login, password);
      expect(r.statusCode).toBe(200);
      return `gateflow_session=${r.cookies.find((c) => c.name === 'gateflow_session')?.value ?? ''}`;
    };
    /** Who the session belongs to: a login, or null once it ended. */
    const me = async (cookie: string) =>
      MeResponse.parse((await app.inject({ url: '/v1/auth/me', headers: { cookie } })).json())
        .member?.login ?? null;
    const { password } = await addStaff(database.db, randomIds(clock), {
      airportId,
      login: 'lane.three',
      role: 'SUPERVISOR',
      checkpointIds: null,
    });
    const first = await cookieOf('lane.three', password);
    expect(await me(first)).toBe('lane.three');
    const out = await app.inject({
      method: 'POST',
      url: '/v1/auth/sign-out',
      headers: { cookie: first },
    });
    expect(out.statusCode).toBe(204);
    expect(await me(first)).toBeNull();
    const second = await cookieOf('lane.three', password);
    const start = clock.t;
    clock.t = start + SESSION_MS + 1;
    expect(await me(second)).toBeNull();
    clock.t = start;
    const third = await cookieOf('lane.three', password);
    const renewed = await resetPassword(database.db, 'lane.three');
    expect(await me(third)).toBeNull();
    expect((await signIn('lane.three', password)).statusCode).toBe(401);
    const fourth = await cookieOf('lane.three', renewed ?? '');
    expect(await disableStaff(database.db, 'lane.three')).toBe(true);
    expect(await me(fourth)).toBeNull();
    expect((await signIn('lane.three', renewed ?? '')).statusCode).toBe(401);
  });

  it('refuses logins that are not plain identifiers', async () => {
    for (const login of ['ab', 'Mario Rossi', 'mario@example.com', '-start', 'x'.repeat(64)]) {
      await expect(
        addStaff(database.db, randomIds(clock), {
          airportId,
          login,
          role: 'OPERATOR',
          checkpointIds: null,
        }),
      ).rejects.toThrow(/login/);
    }
  });
});
