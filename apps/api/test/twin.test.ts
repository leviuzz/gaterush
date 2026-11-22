import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { count, eq, max } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import {
  AuditResponse,
  CheckpointResponse,
  FlightsResponse,
  TwinDisplayResponse,
  TwinOptionsResponse,
  TwinResponse,
  TwinRun,
} from '@gateflow/contracts';
import type { Policy } from '@gateflow/queue-core';
import { parseScenarioText } from '@gateflow/sim-scenarios';
import type { Scenario } from '@gateflow/sim-scenarios';
import { expectedCallNumbers, simulatedCalls, twinDay } from '@gateflow/twin';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app';
import { sha256 } from '../src/chain';
import {
  airport,
  checkpointTimer,
  flight,
  organization,
  policyVersion,
  queueCommand,
  queueToken,
  twinRun,
} from '../src/db/schema';
import { randomIds } from '../src/ids';
import { Runtime } from '../src/runtime';
import { seedDemo } from '../src/seed';
import { zonedEpoch } from '../src/time';
import { TWIN_PREFIX, liveCallNumbers } from '../src/twin';
import { freshDatabase } from './database';
import { staffCookie } from './staff';

/*
 * The digital twin through the API, on PostgreSQL (S18, ADR-051). The acceptance of S18: a
 * scenario's simulated day, played to a twin checkpoint at its virtual time through the commands
 * staff and kiosks send, calls the same numbers in the same order as the offline simulator, call
 * by call and over the day. Twin checkpoints are closed to staff and kiosks, and to the timer
 * scheduler; the routes are for administrators of synthetic airports only.
 */

function scenarioOf(name: string): Scenario {
  const file = fileURLToPath(new URL(`../../../scenarios/${name}`, import.meta.url));
  return parseScenarioText(readFileSync(file, 'utf8'), 'yaml', {
    read: (path) => readFileSync(join(dirname(file), path), 'utf8'),
    sha256: (text) => createHash('sha256').update(text).digest('hex'),
  });
}

/** Feed messages and outages, lanes changing, tickets issued again: every kind of operation. */
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
let airportId: string;
let demoCheckpointId: string;
let app: FastifyInstance;
let admin: string;
let policies: TwinOptionsResponse['policies'];

beforeAll(async () => {
  database = await freshDatabase({ maxConnections: 12 });
  const seeded = await seedDemo(database.db, scenario, {
    now: clock.now(),
    ids: randomIds(clock),
    serviceDay: DAY,
  });
  airportId = seeded.airportId;
  demoCheckpointId = seeded.checkpointId;
  app = buildApp({ db: database.db, clock, twin: { library: [scenario] } });
  admin = await staffCookie(app, database.db, clock, airportId, 'ADMIN');
  const options = await app.inject({ url: '/v1/twin/options', headers: { cookie: admin } });
  expect(options.statusCode).toBe(200);
  policies = TwinOptionsResponse.parse(options.json()).policies;
});

afterAll(async () => {
  await app.close();
  await database.close();
});

const policyOf = (id: string) => {
  const found = policies.find((p) => p.policyId === id);
  if (found === undefined) throw new Error(`no policy ${id}`);
  return found;
};

async function start(body: Record<string, unknown>, cookie = admin) {
  return app.inject({
    method: 'POST',
    url: '/v1/twin/runs',
    headers: { cookie },
    payload: { scenarioId: scenario.id, seed: 1, speed: null, ...body },
  });
}

/** The policy content of a published version, as the twin plays it. */
async function contentOf(versionId: string): Promise<Policy> {
  const [row] = await database.db
    .select({ content: policyVersion.content })
    .from(policyVersion)
    .where(eq(policyVersion.id, versionId));
  return row?.content as Policy;
}

describe('the digital twin through the API (S18)', () => {
  it("plays a day to a twin checkpoint: the simulator's numbers, in its order", async () => {
    const version = policyOf('priority-v3');
    const started = await start({ policyVersionId: version.id, until: '12:00' });
    expect(started.statusCode).toBe(201);
    const run = TwinRun.parse(started.json());
    expect(run).toMatchObject({ state: 'RUNNING', serviceDay: DAY, seed: 1 });
    const t0 = Date.now();
    await app.twin?.wait(run.id);
    const elapsed = Date.now() - t0;
    const done = TwinResponse.parse(
      (await app.inject({ url: '/v1/twin', headers: { cookie: admin } })).json(),
    );
    const ended = done.run;
    expect(ended).toMatchObject({ id: run.id, state: 'FINISHED', divergence: null, error: null });
    expect(ended?.applied).toBe(ended?.steps);
    expect(ended?.matchedCalls).toBe(ended?.expectedCalls);
    expect(ended?.expectedCalls).toBeGreaterThan(1000);
    // Over the day: the numbers the displays showed, in order, are the simulator's.
    const policy = await contentOf(version.id);
    const day = twinDay(scenario, 1, policy);
    const untilMs = 12 * 60 * MIN;
    const expected = expectedCallNumbers(day, TWIN_PREFIX, untilMs);
    expect(expected.length).toBe(simulatedCalls(day).filter((c) => c.atMs <= untilMs).length);
    expect(await liveCallNumbers(database.db, run.checkpointId)).toEqual(expected);
    // Every kind of operation reached the live system: the feed, the lanes, the calls...
    const types = await database.db
      .select({ type: queueCommand.type, n: count() })
      .from(queueCommand)
      .where(eq(queueCommand.checkpointId, run.checkpointId))
      .groupBy(queueCommand.type);
    const n = (type: string) => types.find((t) => t.type === type)?.n ?? 0;
    expect(n('OPEN_DAY')).toBe(1);
    expect(n('UPDATE_FLIGHT')).toBeGreaterThan(10);
    expect(n('ADVANCE')).toBeGreaterThan(0);
    expect(n('PRESENT')).toBeGreaterThan(1000);
    // ...from the twin, never from a boarding pass.
    const sources = await database.db
      .selectDistinct({ source: queueToken.source })
      .from(queueToken)
      .where(eq(queueToken.checkpointId, run.checkpointId));
    expect(sources).toEqual([{ source: 'TWIN' }]);
    // The chain of hashes of the twin's log holds, and its audit names the twin.
    const verify = await app.inject({
      url: `/v1/checkpoints/${run.checkpointId}/audit/verify`,
      headers: { cookie: admin },
    });
    expect(verify.json()).toMatchObject({ intact: true, firstBrokenSeq: null });
    const audit = AuditResponse.parse(
      (
        await app.inject({
          url: `/v1/checkpoints/${run.checkpointId}/audit`,
          headers: { cookie: admin },
        })
      ).json(),
    );
    expect(audit.serviceDay).toBe(DAY);
    expect(audit.entries.length).toBeGreaterThan(0);
    for (const entry of audit.entries) {
      if (entry.command !== 'OPEN_DAY') expect(entry.by).toEqual({ kind: 'SYSTEM', label: 'twin' });
    }
    // What the twin's screens show: its virtual day, its board, its flights.
    expect(done.board?.serviceDay).toBe(DAY);
    expect(done.counts.issued).toBeGreaterThan(1000);
    expect(done.counts.admitted).toBeGreaterThan(1000);
    expect(done.calls.length).toBe(12);
    expect(done.calls.some((c) => c.reasons.length > 0)).toBe(true);
    const cp = CheckpointResponse.parse(
      (
        await app.inject({
          url: `/v1/checkpoints/${run.checkpointId}`,
          headers: { cookie: admin },
        })
      ).json(),
    );
    expect(cp.checkpoint.twin).toEqual({ runId: run.id, serviceDay: DAY });
    expect(cp.checkpoint.ticketPrefix).toBe('T');
    const flights = FlightsResponse.parse(
      (
        await app.inject({
          url: `/v1/checkpoints/${run.checkpointId}/flights`,
          headers: { cookie: admin },
        })
      ).json(),
    );
    expect(flights.flights.length).toBe(day.population.flights.length);
    // How fast the live system took it, for the record.
    process.stdout.write(
      `twin: ${String(ended?.steps)} operations in ${String(elapsed)} ms (${(((ended?.steps ?? 0) * 1000) / elapsed).toFixed(0)}/s)\n`,
    );
  });

  it('keeps staff, kiosks and the timer scheduler off a twin checkpoint', async () => {
    const [run] = await database.db.select().from(twinRun).limit(1);
    if (run === undefined) throw new Error('no run');
    const supervisor = await staffCookie(app, database.db, clock, airportId, 'SUPERVISOR');
    const call = await app.inject({
      method: 'POST',
      url: `/v1/checkpoints/${run.checkpointId}/calls`,
      headers: { cookie: supervisor },
    });
    expect(call.statusCode).toBe(409);
    expect(call.json()).toMatchObject({ error: { code: 'TWIN_CHECKPOINT' } });
    const activate = await app.inject({
      method: 'POST',
      url: `/v1/checkpoints/${run.checkpointId}/policy/activations`,
      headers: { cookie: admin },
      payload: { versionId: policyOf('virtual-fifo').id },
    });
    expect(activate.statusCode).toBe(409);
    // Its timeouts are due by the server's clock, which is far past the virtual day: the
    // scheduler leaves them to the twin.
    await database.db
      .update(checkpointTimer)
      .set({ nextDueMs: 1 })
      .where(eq(checkpointTimer.checkpointId, run.checkpointId));
    const before = await database.db
      .select({ n: count() })
      .from(queueCommand)
      .where(eq(queueCommand.checkpointId, run.checkpointId));
    await app.timers.tick();
    const after = await database.db
      .select({ n: count() })
      .from(queueCommand)
      .where(eq(queueCommand.checkpointId, run.checkpointId));
    expect(after).toEqual(before);
    // A real checkpoint takes no time of its own.
    const runtime = new Runtime(database.db, clock);
    await expect(
      runtime.execute({
        checkpointId: demoCheckpointId,
        idempotencyKey: 'virtual',
        requestHash: sha256('virtual'),
        actor: 'test',
        atMs: clock.now(),
        build: () => ({ type: 'CALL_NEXT' }),
      }),
    ).rejects.toMatchObject({ code: 'NOT_A_TWIN' });
    // A command of the twin outside its virtual day, or back in time, is refused.
    await expect(
      runtime.execute({
        checkpointId: run.checkpointId,
        idempotencyKey: 'tomorrow',
        requestHash: sha256('tomorrow'),
        actor: 'test',
        atMs: zonedEpoch('2026-11-24', 60 * MIN, 'Europe/Rome'),
        build: () => ({ type: 'CALL_NEXT' }),
      }),
    ).rejects.toMatchObject({ code: 'OUTSIDE_TWIN_DAY' });
    await expect(
      runtime.execute({
        checkpointId: run.checkpointId,
        idempotencyKey: 'past',
        requestHash: sha256('past'),
        actor: 'test',
        atMs: run.originMs,
        build: () => ({ type: 'CALL_NEXT' }),
      }),
    ).rejects.toMatchObject({ code: 'OUT_OF_ORDER' });
  });

  it('is for administrators of a synthetic airport, on a server with the twin', async () => {
    const operator = await staffCookie(app, database.db, clock, airportId, 'OPERATOR');
    const supervisor = await staffCookie(app, database.db, clock, airportId, 'SUPERVISOR');
    for (const cookie of [operator, supervisor]) {
      expect((await app.inject({ url: '/v1/twin', headers: { cookie } })).statusCode).toBe(403);
      expect(
        (await start({ policyVersionId: policyOf('priority-v3').id }, cookie)).statusCode,
      ).toBe(403);
    }
    expect((await app.inject({ url: '/v1/twin' })).statusCode).toBe(401);
    // An airport whose data are not synthetic: never a twin.
    const orgId = randomIds(clock).uuid();
    await database.db.insert(organization).values({ id: orgId, name: 'Real', country: 'IT' });
    const realId = randomIds(clock).uuid();
    await database.db.insert(airport).values({
      id: realId,
      orgId,
      code: 'real-airport',
      name: 'A real airport',
      timeZone: 'Europe/Rome',
      iata: 'ZZZ',
      dataClassification: 'AIRPORT_PROVIDED',
    });
    const realAdmin = await staffCookie(app, database.db, clock, realId, 'ADMIN');
    const refused = await app.inject({ url: '/v1/twin', headers: { cookie: realAdmin } });
    expect(refused.statusCode).toBe(403);
    expect(refused.json()).toMatchObject({ error: { code: 'NOT_SYNTHETIC' } });
    // A server without the twin has none of its routes.
    const plain = buildApp({ db: database.db, clock });
    expect((await plain.inject({ url: '/v1/twin', headers: { cookie: admin } })).statusCode).toBe(
      404,
    );
    expect(plain.twin).toBeNull();
    await plain.close();
    // Unknown scenarios and policies, and bad requests.
    expect(
      (await start({ policyVersionId: policyOf('priority-v3').id, scenarioId: 'x' })).statusCode,
    ).toBe(404);
    expect((await start({ policyVersionId: realId })).statusCode).toBe(404);
    expect(
      (await start({ policyVersionId: policyOf('priority-v3').id, speed: 0 })).statusCode,
    ).toBe(400);
    expect(
      (await start({ policyVersionId: policyOf('priority-v3').id, until: '25:00' })).statusCode,
    ).toBe(400);
  });

  it('plays one run at a time per airport, at the speed asked, until stopped', async () => {
    const version = policyOf('virtual-fifo');
    // A run whose server stopped long ago does not hold the airport.
    const [first] = await database.db.select().from(twinRun).limit(1);
    if (first === undefined) throw new Error('no run');
    await database.db
      .update(twinRun)
      .set({ state: 'RUNNING', updatedAtMs: clock.now() - 2 * 60 * MIN, endedAtMs: null })
      .where(eq(twinRun.id, first.id));
    const slow = TwinRun.parse((await start({ policyVersionId: version.id, speed: 60 })).json());
    expect(slow.state).toBe('RUNNING');
    const [cut] = await database.db.select().from(twinRun).where(eq(twinRun.id, first.id));
    expect(cut).toMatchObject({ state: 'STOPPED', error: 'interrupted: its server stopped' });
    // One at a time.
    const second = await start({ policyVersionId: version.id });
    expect(second.statusCode).toBe(409);
    expect(second.json()).toMatchObject({ error: { code: 'TWIN_RUNNING' } });
    // At 60 times real time, a minute of the day takes a second.
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const playing = TwinResponse.parse(
      (await app.inject({ url: '/v1/twin', headers: { cookie: admin } })).json(),
    ).run;
    expect(playing?.state).toBe('RUNNING');
    const moved = Date.parse(playing?.virtualNow ?? '') - Date.parse(playing?.from ?? '');
    expect(moved).toBeGreaterThan(30_000);
    expect(moved).toBeLessThan(5 * MIN);
    // Faster, then stopped: the day stays as far as it went.
    const faster = await app.inject({
      method: 'POST',
      url: `/v1/twin/runs/${slow.id}/speed`,
      headers: { cookie: admin },
      payload: { speed: 1000 },
    });
    expect(TwinRun.parse(faster.json()).speed).toBe(1000);
    const stopped = TwinRun.parse(
      (
        await app.inject({
          method: 'POST',
          url: `/v1/twin/runs/${slow.id}/stop`,
          headers: { cookie: admin },
        })
      ).json(),
    );
    expect(stopped.state).toBe('STOPPED');
    expect(stopped.applied).toBeLessThan(stopped.steps);
    expect(stopped.endedAt).not.toBeNull();
    // A stopped run takes no new speed; another run can start.
    const late = await app.inject({
      method: 'POST',
      url: `/v1/twin/runs/${slow.id}/speed`,
      headers: { cookie: admin },
      payload: { speed: 10 },
    });
    expect(late.statusCode).toBe(409);
    // A display for the twin's checkpoint: its token, once.
    const display = TwinDisplayResponse.parse(
      (
        await app.inject({
          method: 'POST',
          url: `/v1/twin/runs/${slow.id}/display`,
          headers: { cookie: admin },
        })
      ).json(),
    );
    expect(display.checkpointId).toBe(slow.checkpointId);
    const me = await app.inject({
      url: '/v1/devices/me',
      headers: { authorization: `Bearer ${display.token}` },
    });
    expect(me.json()).toMatchObject({ device: { kind: 'DISPLAY' } });
  });

  it('stops at the first answer that is not the simulator’s, and says which', async () => {
    const version = policyOf('priority-v3');
    const run = TwinRun.parse((await start({ policyVersionId: version.id, speed: 300 })).json());
    // Wait for the first calls.
    for (let i = 0; i < 100; i++) {
      const [row] = await database.db
        .select({ matched: twinRun.matchedCalls })
        .from(twinRun)
        .where(eq(twinRun.id, run.id));
      if ((row?.matched ?? 0) > 3) break;
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    // A passenger the simulator never had, whose flight closes soon, as a second server of a system
    // gone wrong would issue: the engine calls it ahead of the simulator's next one.
    const intruder = new Runtime(database.db, clock);
    const [aFlight] = await database.db
      .select({ id: flight.id })
      .from(flight)
      .where(eq(flight.twinRunId, run.id))
      .limit(1);
    let issued = false;
    for (let attempt = 0; attempt < 20 && !issued; attempt++) {
      const [latest] = await database.db
        .select({ atMs: max(queueCommand.atMs) })
        .from(queueCommand)
        .where(eq(queueCommand.checkpointId, run.checkpointId));
      const atMs = Number(latest?.atMs);
      try {
        await intruder.execute({
          checkpointId: run.checkpointId,
          idempotencyKey: `intruder-${String(attempt)}`,
          requestHash: sha256(`intruder-${String(attempt)}`),
          actor: 'test',
          atMs,
          build: () => ({
            type: 'ISSUE_TICKET',
            ticketId: randomIds(clock).uuid(),
            opaqueRef: randomIds(clock).opaqueRef(),
            source: 'TWIN',
            flightId: aFlight?.id ?? '',
            segment: 'DEPARTING',
            partySize: 1,
            deadline: { atMs: atMs + 12 * MIN, source: 'FEED' },
            walkEstimateMs: 5 * MIN,
            scheduledDepartureMs: atMs + 30 * MIN,
            dedupKey: null,
          }),
        });
        issued = true;
      } catch (error) {
        // The twin moved on meanwhile: at its new latest time.
        if ((error as { code?: string }).code !== 'OUT_OF_ORDER') throw error;
      }
    }
    expect(issued).toBe(true);
    await app.twin?.wait(run.id);
    const ended = TwinResponse.parse(
      (await app.inject({ url: '/v1/twin', headers: { cookie: admin } })).json(),
    ).run;
    expect(ended?.state).toBe('DIVERGED');
    expect(ended?.divergence?.operation).toBe('CALL_NEXT');
    expect(ended?.divergence?.expected).toMatch(/^T\d{3,}$/);
    expect(ended?.divergence?.actual).toMatch(/^T\d{3,}$/);
    expect(ended?.divergence?.expected).not.toBe(ended?.divergence?.actual);
    expect(ended?.applied).toBeLessThan(ended?.steps ?? 0);
    expect(ended?.endedAt).not.toBeNull();
  });
});
