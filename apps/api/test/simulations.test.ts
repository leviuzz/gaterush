import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import {
  AddSimulationScenarioResponse,
  SimulationRun,
  SimulationScenariosResponse,
  SimulationsResponse,
} from '@gateflow/contracts';
import { findPolicyPreset } from '@gateflow/queue-core';
import type { Policy } from '@gateflow/queue-core';
import {
  DEFAULT_BOOTSTRAP,
  applyScenarioSettings,
  arrivalClassification,
  buildResults,
  fingerprintMaterial,
  recommendedComparisons,
  renderReport,
  runExperiment,
  stringifyResults,
} from '@gateflow/sim-metrics';
import type { ExperimentConfig, ResultsDocument } from '@gateflow/sim-metrics';
import { canonicalJson, parseScenarioText } from '@gateflow/sim-scenarios';
import type { Scenario } from '@gateflow/sim-scenarios';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app';
import { simRun } from '../src/db/schema';
import { randomIds } from '../src/ids';
import { seedDemo } from '../src/seed';
import { REPORT_CSP } from '../src/simulation-routes';
import { API_GENERATOR } from '../src/simulations';
import { BUILD_COMMIT } from '../src/version';
import { freshDatabase } from './database';
import { staffCookie } from './staff';

/*
 * Simulations through the API, on PostgreSQL (S19, ADR-052). The acceptance of S19: a run asked
 * with `POST /v1/simulations` gives the results the CLI gives for the same experiment, and is
 * reproducible from its manifest: computed again, it gives the same results, and says so.
 */

function scenarioOf(name: string): Scenario {
  const file = fileURLToPath(new URL(`../../../scenarios/${name}`, import.meta.url));
  return parseScenarioText(readFileSync(file, 'utf8'), 'yaml', {
    read: (path) => readFileSync(join(dirname(file), path), 'utf8'),
    sha256: (text) => createHash('sha256').update(text).digest('hex'),
  });
}

const sha256 = (text: string) => createHash('sha256').update(text).digest('hex');
const demo = scenarioOf('single-checkpoint-demo.yaml');
const disrupted = scenarioOf('single-checkpoint-disrupted.yaml');
const hashOf = (scenario: Scenario) => `sha256:${sha256(canonicalJson(scenario))}`;

let database: Awaited<ReturnType<typeof freshDatabase>>;
let app: FastifyInstance;
let airportId: string;
let checkpointId: string;
let otherAirportId: string;
let analyst: string;
let admin: string;
let now = Date.parse('2026-11-23T08:00:00Z');
const clock = { now: () => now };

beforeAll(async () => {
  database = await freshDatabase();
  const ids = randomIds(clock);
  const seeded = await seedDemo(database.db, demo, { now, ids, serviceDay: '2026-11-23' });
  airportId = seeded.airportId;
  checkpointId = seeded.checkpointId;
  otherAirportId = (await seedDemo(database.db, scenarioOf('tsf-like-peak-day.yaml'), { now, ids }))
    .airportId;
  app = buildApp({
    db: database.db,
    clock,
    simulations: { threads: 'here', runs: 'manual', heartbeatMs: 20 },
  });
  analyst = await staffCookie(app, database.db, clock, airportId, 'ANALYST');
  admin = await staffCookie(app, database.db, clock, airportId, 'ADMIN');
});

afterAll(async () => {
  await app.close();
  await database.close();
});

const runner = () => {
  const simulations = app.simulations;
  if (simulations === null) throw new Error('the server runs no simulations');
  return simulations;
};

const post = (url: string, payload: unknown, cookie = analyst) =>
  app.inject({ method: 'POST', url, payload: payload as object, headers: { cookie } });
const get = (url: string, cookie = analyst) =>
  app.inject({ method: 'GET', url, headers: { cookie } });

async function ask(payload: unknown, cookie = analyst): Promise<SimulationRun> {
  const r = await post('/v1/simulations', payload, cookie);
  expect(r.statusCode, r.body).toBe(201);
  return SimulationRun.parse(r.json());
}

async function runOf(id: string): Promise<SimulationRun> {
  const r = await get(`/v1/simulations/${id}`);
  expect(r.statusCode, r.body).toBe(200);
  return SimulationRun.parse(r.json());
}

/** Runs what waits, in order, until nothing does. */
async function drain(): Promise<void> {
  while ((await runner().runNext()) !== null) {
    // the next one
  }
}

const preset = (id: string): Policy => {
  const policy = findPolicyPreset(id);
  if (policy === undefined) throw new Error(`no preset ${id}`);
  return policy;
};

/** The experiment of `gateflow-sim run --seeds 1-3 --policies fifo,priority-v3`, resampled less. */
function cliExperiment(scenario: Scenario): ExperimentConfig {
  const policies = applyScenarioSettings([preset('fifo'), preset('priority-v3')], scenario);
  return {
    scenario,
    seeds: [1, 2, 3],
    policies,
    baselinePolicyId: 'fifo',
    comparisons: recommendedComparisons(policies, 'fifo'),
    classification: arrivalClassification(policies),
    bootstrap: { ...DEFAULT_BOOTSTRAP, resamples: 200 },
  };
}

const SETTINGS = {
  scenarioHash: hashOf(demo),
  seeds: '1-3',
  policies: ['fifo', 'priority-v3'],
  bootstrapResamples: 200,
};

describe('scenarios for simulations (S19)', () => {
  it('saves a scenario once, named by its hash, and gives it back as a file the CLI runs', async () => {
    // The seed saved the demo's.
    const listed = SimulationScenariosResponse.parse(
      (await get('/v1/simulation-scenarios')).json(),
    );
    expect(listed.scenarios.map((s) => [s.hash, s.createdBy])).toEqual([[hashOf(demo), 'system']]);
    const first = await post('/v1/simulation-scenarios', { scenario: disrupted });
    expect(first.statusCode, first.body).toBe(201);
    const saved = AddSimulationScenarioResponse.parse(first.json());
    expect(saved.scenario).toMatchObject({
      hash: hashOf(disrupted),
      scenarioId: disrupted.id,
      dataClassification: 'SYNTHETIC',
      createdBy: expect.stringMatching(/^analyst-/) as unknown,
    });
    // The same content, every key in another order: the same scenario.
    const reversed = (value: unknown): unknown =>
      Array.isArray(value)
        ? value.map(reversed)
        : typeof value === 'object' && value !== null
          ? Object.fromEntries(
              Object.entries(value)
                .reverse()
                .map(([k, v]) => [k, reversed(v)]),
            )
          : value;
    const again = await post('/v1/simulation-scenarios', { scenario: reversed(disrupted) });
    expect(again.statusCode).toBe(200);
    expect(AddSimulationScenarioResponse.parse(again.json())).toEqual({
      ...saved,
      created: false,
    });
    const file = await get(`/v1/simulation-scenarios/${saved.scenario.id}/file`);
    expect(file.statusCode).toBe(200);
    expect(file.headers['content-type']).toBe('application/json; charset=utf-8');
    expect(hashOf(parseScenarioText(file.body, 'json'))).toBe(hashOf(disrupted));
    // Another airport sees nothing of it.
    const elsewhere = await staffCookie(app, database.db, clock, otherAirportId, 'ANALYST');
    expect(
      (await get(`/v1/simulation-scenarios/${saved.scenario.id}/file`, elsewhere)).statusCode,
    ).toBe(404);
  });

  it('refuses what the simulator would not read, and never changes a scenario saved', async () => {
    const bad = await post('/v1/simulation-scenarios', { scenario: { ...demo, schemaVersion: 4 } });
    expect(bad.statusCode).toBe(400);
    expect(bad.json()).toMatchObject({ error: { code: 'INVALID_SCENARIO' } });
    expect((await post('/v1/simulation-scenarios', { scenario: 'x' })).statusCode).toBe(400);
    await expect(database.admin.query(`UPDATE sim_scenario SET title = 'other'`)).rejects.toThrow(
      /append-only/,
    );
    await expect(database.admin.query(`DELETE FROM sim_scenario`)).rejects.toThrow(/append-only/);
  });
});

describe('a simulation through the API (S19)', () => {
  let first: SimulationRun;
  let results: string;

  it('waits its turn, then gives the results of the CLI, kept as written', async () => {
    first = await ask({ settings: SETTINGS, label: 'Peak, v3 against the queue of today' });
    expect(first).toMatchObject({
      state: 'QUEUED',
      label: 'Peak, v3 against the queue of today',
      seeds: { count: 3, ranges: '1-3' },
      policies: ['fifo', 'priority-v3'],
      baselinePolicyId: 'fifo',
      days: { done: 0, total: 3 },
      results: null,
      expected: null,
    });
    expect(await runner().runNext()).toBe(first.id);
    first = await runOf(first.id);
    expect(first).toMatchObject({ state: 'DONE', days: { done: 3, total: 3 }, error: null });
    const file = await get(`/v1/simulations/${first.id}/results`);
    expect(file.statusCode).toBe(200);
    expect(file.headers['content-type']).toBe('application/json; charset=utf-8');
    results = file.body;
    // What the CLI writes for the same experiment, naming the API as its generator.
    const generated = {
      generator: API_GENERATOR,
      commit: BUILD_COMMIT,
      scenarioHash: hashOf(demo),
    };
    expect(results).toBe(
      stringifyResults(buildResults(runExperiment(cliExperiment(demo)), generated)),
    );
    // The CLI's own file differs only by its generator and revision: the same fingerprint.
    const cli = stringifyResults(
      buildResults(runExperiment(cliExperiment(demo)), {
        generator: { name: 'gateflow-sim', version: '1.0.0' },
        commit: 'abc',
        scenarioHash: hashOf(demo),
      }),
    );
    expect(first.results).toEqual({
      sha256: sha256(results),
      bytes: Buffer.byteLength(results),
      fingerprint: sha256(fingerprintMaterial(cli)),
    });
    const doc = JSON.parse(results) as ResultsDocument;
    expect(doc.disclaimer).toMatch(/^SIMULATED RESULTS/);
    expect(doc.manifest.generator).toEqual(API_GENERATOR);
  });

  it('gives its report in Markdown and as a page with no script', async () => {
    const md = await get(`/v1/simulations/${first.id}/report`);
    expect(md.statusCode).toBe(200);
    expect(md.headers['content-type']).toBe('text/markdown; charset=utf-8');
    expect(md.body).toBe(renderReport(JSON.parse(results) as ResultsDocument));
    const html = await get(`/v1/simulations/${first.id}/report.html`);
    expect(html.statusCode).toBe(200);
    expect(html.headers['content-type']).toBe('text/html; charset=utf-8');
    expect(html.headers['content-security-policy']).toBe(REPORT_CSP);
    expect(html.body).toContain('<svg');
    expect(html.body).not.toContain('<script');
  });

  it('is reproducible from its manifest: computed again, the same results, and it says so', async () => {
    const again = SimulationRun.parse(
      (await post(`/v1/simulations/${first.id}/reproduce`, undefined)).json(),
    );
    expect(again).toMatchObject({
      state: 'QUEUED',
      label: first.label,
      expected: { fingerprint: first.results?.fingerprint, reproduces: first.id, matches: null },
    });
    await drain();
    const done = await runOf(again.id);
    expect(done).toMatchObject({ state: 'DONE', expected: { matches: true } });
    // Byte for byte: the same server, the same revision.
    expect((await get(`/v1/simulations/${again.id}/results`)).body).toBe(results);

    // From the manifest of a file, as an analyst sends it: the CLI's, with its fingerprint.
    const cli = stringifyResults(
      buildResults(runExperiment(cliExperiment(demo)), {
        generator: { name: 'gateflow-sim', version: '1.0.0' },
        commit: 'abc',
        scenarioHash: hashOf(demo),
      }),
    );
    const manifest = (JSON.parse(cli) as ResultsDocument).manifest;
    const fromFile = await ask({
      manifest,
      expectedFingerprint: sha256(fingerprintMaterial(cli)),
    });
    const wrong = await ask({ manifest, expectedFingerprint: '0'.repeat(64) });
    await drain();
    expect((await runOf(fromFile.id)).expected?.matches).toBe(true);
    expect((await runOf(wrong.id)).expected?.matches).toBe(false);
    expect((await get(`/v1/simulations/${fromFile.id}/results`)).body).toBe(results);
  });

  it('lists the simulations of the airport, the latest first', async () => {
    const listed = SimulationsResponse.parse((await get('/v1/simulations')).json());
    expect(listed.runs.length).toBeGreaterThanOrEqual(4);
    expect(listed.runs.at(-1)?.id).toBe(first.id);
    expect(listed.runs.every((r) => r.scenario.hash === hashOf(demo))).toBe(true);
    // An administrator sees them too; another airport does not.
    expect(SimulationsResponse.parse((await get('/v1/simulations', admin)).json()).runs).toEqual(
      listed.runs,
    );
    const elsewhere = await staffCookie(app, database.db, clock, otherAirportId, 'ADMIN');
    const theirs = SimulationsResponse.parse((await get('/v1/simulations', elsewhere)).json());
    expect(theirs.runs).toEqual([]);
    expect((await get(`/v1/simulations/${first.id}`, elsewhere)).statusCode).toBe(404);
    expect((await get(`/v1/simulations/${first.id}/results`, elsewhere)).statusCode).toBe(404);
  });
});

describe('what a simulation may not be (S19)', () => {
  const refused = async (payload: unknown, status: number, code: string) => {
    const r = await post('/v1/simulations', payload);
    expect(r.statusCode, r.body).toBe(status);
    expect(r.json()).toMatchObject({ error: { code } });
  };

  it('refuses settings or manifests the tools would not run', async () => {
    await refused(
      { settings: { ...SETTINGS, scenarioHash: `sha256:${'0'.repeat(64)}` } },
      404,
      'UNKNOWN_SCENARIO',
    );
    await refused(
      { settings: { ...SETTINGS, policies: ['fifo', 'magic'] } },
      400,
      'INVALID_SIMULATION',
    );
    await refused(
      { settings: { ...SETTINGS, policies: ['fifo', 'fifo'] } },
      400,
      'INVALID_SIMULATION',
    );
    await refused(
      { settings: { ...SETTINGS, baseline: 'virtual-fifo' } },
      400,
      'INVALID_SIMULATION',
    );
    await refused({ settings: { ...SETTINGS, seeds: '1-1001' } }, 400, 'INVALID_SIMULATION');
    await refused({ settings: { ...SETTINGS, seeds: 'all' } }, 400, 'INVALID_REQUEST');
    await refused(
      { settings: { ...SETTINGS, policies: Array.from({ length: 9 }, (_, i) => `p${i}`) } },
      400,
      'INVALID_REQUEST',
    );
    await refused(
      {
        settings: {
          ...SETTINGS,
          comparisons: [{ candidateId: 'priority-v3', referenceId: 'priority-v3' }],
        },
      },
      400,
      'INVALID_SIMULATION',
    );
    const { manifest } = JSON.parse(
      (await get(`/v1/simulations/${(await latestDone()).id}/results`)).body,
    ) as ResultsDocument;
    await refused(
      {
        manifest: {
          ...manifest,
          classification: { ...manifest.classification, safetyBufferMs: 1 },
        },
      },
      400,
      'INVALID_SIMULATION',
    );
    await refused(
      { manifest: { ...manifest, seeds: { ranges: '1,2,3', count: 3 } } },
      400,
      'INVALID_SIMULATION',
    );
    await refused({ settings: SETTINGS, extra: true }, 400, 'INVALID_REQUEST');
  });

  it('gives results, a report or a reproduction only once done', async () => {
    const waiting = await ask({ settings: SETTINGS });
    for (const path of ['results', 'report', 'report.html']) {
      const r = await get(`/v1/simulations/${waiting.id}/${path}`);
      expect(r.statusCode).toBe(409);
      expect(r.json()).toMatchObject({ error: { code: 'SIMULATION_NOT_DONE' } });
    }
    expect((await post(`/v1/simulations/${waiting.id}/reproduce`, undefined)).statusCode).toBe(409);
    expect((await post(`/v1/simulations/${waiting.id}/cancel`, undefined)).statusCode).toBe(200);
    expect((await get('/v1/simulations/not-a-run')).statusCode).toBe(404);
  });

  it('keeps at most 20 simulations of an airport waiting', async () => {
    const asked: SimulationRun[] = [];
    for (let i = 0; i < 20; i++) asked.push(await ask({ settings: SETTINGS }));
    await refused({ settings: SETTINGS }, 409, 'TOO_MANY_SIMULATIONS');
    for (const run of asked) {
      expect((await post(`/v1/simulations/${run.id}/cancel`, undefined)).statusCode).toBe(200);
    }
    expect(await runner().runNext()).toBeNull();
  });
});

async function latestDone(): Promise<SimulationRun> {
  const listed = SimulationsResponse.parse((await get('/v1/simulations')).json());
  const done = listed.runs.find((r) => r.state === 'DONE');
  if (done === undefined) throw new Error('no simulation done');
  return done;
}

describe('who may simulate (S19)', () => {
  it('is for analysts and administrators, and gives an analyst nothing of a live checkpoint', async () => {
    const done = await latestDone();
    for (const role of ['OPERATOR', 'SUPERVISOR'] as const) {
      const cookie = await staffCookie(app, database.db, clock, airportId, role);
      for (const url of [
        '/v1/simulations',
        '/v1/simulation-scenarios',
        `/v1/simulations/${done.id}/results`,
      ]) {
        const r = await get(url, cookie);
        expect(r.statusCode, `${role} ${url}`).toBe(403);
      }
      expect((await post('/v1/simulations', { settings: SETTINGS }, cookie)).statusCode).toBe(403);
    }
    expect((await get(`/v1/simulations/${done.id}/report`, admin)).statusCode).toBe(200);
    // An analyst has no live role.
    for (const [method, url] of [
      ['GET', `/v1/checkpoints/${checkpointId}`],
      ['GET', `/v1/checkpoints/${checkpointId}/queue`],
      ['POST', `/v1/checkpoints/${checkpointId}/calls`],
      ['GET', `/v1/checkpoints/${checkpointId}/audit`],
    ] as const) {
      const r = await app.inject({ method, url, headers: { cookie: analyst } });
      expect(r.statusCode, url).toBe(403);
    }
    // Nor from a page of another site.
    const r = await app.inject({
      method: 'POST',
      url: '/v1/simulations',
      payload: { settings: SETTINGS },
      headers: { cookie: analyst, origin: 'https://elsewhere.example' },
    });
    expect(r.statusCode).toBe(403);
    expect((await get('/v1/simulations', '')).statusCode).toBe(401);
  });
});

describe('the runner of simulations (S19)', () => {
  it('stops a run cancelled while it simulates, and keeps nothing of it', async () => {
    const run = await ask({ settings: { ...SETTINGS, seeds: '1-60', policies: ['fifo'] } });
    const running = runner().runNext();
    // Once it simulates, cancel it.
    for (let i = 0; i < 200 && (await runOf(run.id)).state === 'QUEUED'; i++) {
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    expect((await runOf(run.id)).state).toBe('RUNNING');
    const cancelled = await post(`/v1/simulations/${run.id}/cancel`, undefined);
    expect(cancelled.statusCode).toBe(200);
    expect(await running).toBe(run.id);
    const ended = await runOf(run.id);
    expect(ended).toMatchObject({ state: 'CANCELLED', results: null });
    expect(ended.days.done).toBeLessThan(60);
    const again = await post(`/v1/simulations/${run.id}/cancel`, undefined);
    expect(again.statusCode).toBe(409);
    expect(again.json()).toMatchObject({ error: { code: 'SIMULATION_ENDED' } });
  });

  it('puts back in the queue a run whose server went quiet, and simulates it', async () => {
    const run = await ask({ settings: SETTINGS });
    // Another server took it, then said nothing for more than a minute.
    await database.db
      .update(simRun)
      .set({
        state: 'RUNNING',
        runner: 'api:gone',
        startedAtMs: now,
        updatedAtMs: now,
        daysDone: 2,
      })
      .where(eq(simRun.id, run.id));
    expect(await runner().runNext()).toBeNull();
    now += 61_000;
    expect(await runner().runNext()).toBe(run.id);
    const done = await runOf(run.id);
    expect(done.state).toBe('DONE');
    expect(done.results?.fingerprint).toBe((await latestDone()).results?.fingerprint);
  });

  it('puts its run back in the queue when its server stops', async () => {
    const other = buildApp({
      db: database.db,
      clock,
      simulations: { threads: 'here', runs: 'manual', heartbeatMs: 20 },
    });
    const run = await ask({ settings: { ...SETTINGS, seeds: '1-60', policies: ['fifo'] } });
    const simulations = other.simulations;
    if (simulations === null) throw new Error('no runner');
    const running = simulations.runNext();
    for (let i = 0; i < 200 && (await runOf(run.id)).state === 'QUEUED'; i++) {
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    await other.close();
    await running;
    expect((await runOf(run.id)).state).toBe('QUEUED');
    // Any server may take it now; here, nobody needs it.
    expect((await post(`/v1/simulations/${run.id}/cancel`, undefined)).statusCode).toBe(200);
  });
});
