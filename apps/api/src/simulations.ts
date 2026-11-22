import { randomUUID } from 'node:crypto';
import { and, desc, eq, inArray, lt, sql } from 'drizzle-orm';
import type { SimulationManifest, SimulationRun, SimulationSettings } from '@gateflow/contracts';
import type { ClassificationParams } from '@gateflow/priority-engine';
import { findPolicyPreset } from '@gateflow/queue-core';
import type { Policy } from '@gateflow/queue-core';
import {
  DEFAULT_BOOTSTRAP,
  ExperimentConfigError,
  applyScenarioSettings,
  arrivalClassification,
  experimentFromManifest,
  formatSeedRanges,
  parseSeedRanges,
  recommendedComparisons,
  resolveComparisons,
} from '@gateflow/sim-metrics';
import type {
  BootstrapSettings,
  ExperimentConfig,
  ExperimentManifest,
  ExperimentPlan,
  PolicyComparison,
  SeedResult,
} from '@gateflow/sim-metrics';
import { ScenarioValidationError, canonicalJson, parseScenario } from '@gateflow/sim-scenarios';
import type { Scenario } from '@gateflow/sim-scenarios';
import { sha256 } from './chain';
import type { Db } from './db/client';
import { simRun, simScenario, staffUser } from './db/schema';
import type { Ids } from './ids';
import { ApiError } from './runtime';
import { SimulationAborted, inThisThread, onWorkerThreads } from './sim-tasks';
import type { FinishedResults, SimExecutor, SimTask, SimTaskResult } from './sim-tasks';
import type { Clock } from './time';
import { API_VERSION, BUILD_COMMIT } from './version';

/*
 * Simulations through the API (S19, ADR-052). An analyst saves scenarios and asks for runs; the
 * servers simulate the runs that wait, one at a time each, on worker threads, and keep the results
 * document exactly as written, with its fingerprint. The same experiment gives the same results
 * as the CLI's and the Studio's: a run is reproducible from its manifest, and says so.
 */

/** The limits of the simulations of an airport. */
export const SIMULATION_LIMITS = {
  /** Simulated days of a run. */
  maxDays: 1000,
  maxPolicies: 8,
  maxResamples: 10_000,
  /** Runs of an airport waiting or running at once. */
  maxWaiting: 20,
  /** Runs listed, the latest first. */
  listed: 100,
} as const;

/** The generator results of the API record. */
export const API_GENERATOR = { name: 'gateflow-api', version: API_VERSION } as const;

export type SimScenarioRow = typeof simScenario.$inferSelect;
export type SimRunRow = typeof simRun.$inferSelect;

/**
 * What lists and views read of a scenario: everything but its content, which carries the flight
 * list (hundreds of kilobytes).
 */
const scenarioSummary = {
  id: simScenario.id,
  airportId: simScenario.airportId,
  hash: simScenario.hash,
  scenarioId: simScenario.scenarioId,
  title: simScenario.title,
  dataClassification: simScenario.dataClassification,
  createdAtMs: simScenario.createdAtMs,
  createdBy: simScenario.createdBy,
};
export type SimScenarioSummary = Omit<SimScenarioRow, 'content'>;

/** What lists and views read of a run: everything but its results file (megabytes), and its size. */
const runSummary = {
  id: simRun.id,
  seq: simRun.seq,
  airportId: simRun.airportId,
  scenarioRef: simRun.scenarioRef,
  label: simRun.label,
  request: simRun.request,
  state: simRun.state,
  daysTotal: simRun.daysTotal,
  daysDone: simRun.daysDone,
  resultsHash: simRun.resultsHash,
  resultsBytes: sql<number | null>`octet_length(${simRun.results})`,
  fingerprint: simRun.fingerprint,
  reproduces: simRun.reproduces,
  expectedFingerprint: simRun.expectedFingerprint,
  matches: simRun.matches,
  error: simRun.error,
  createdBy: simRun.createdBy,
  createdAtMs: simRun.createdAtMs,
  startedAtMs: simRun.startedAtMs,
  endedAtMs: simRun.endedAtMs,
  updatedAtMs: simRun.updatedAtMs,
  runner: simRun.runner,
};
export type SimRunSummary = Omit<SimRunRow, 'results'> & { readonly resultsBytes: number | null };

/** A run with its scenario, as lists and views read them. */
export interface FoundRun {
  readonly row: SimRunSummary;
  readonly scenario: SimScenarioSummary;
}

/** What a run simulates on its scenario: the experiment of its manifest, as stored. */
export interface RunSpec {
  readonly seeds: string;
  readonly policies: readonly Policy[];
  readonly baselinePolicyId: string;
  readonly comparisons: readonly PolicyComparison[];
  readonly classification: ClassificationParams;
  readonly bootstrap: BootstrapSettings;
}

/** The scenario as a JSON file the CLI runs (`gateflow-sim run --scenario <file>.json`). */
export function scenarioFile(scenario: Scenario): string {
  return `${JSON.stringify(scenario, null, 2)}\n`;
}

/** A scenario's name in results: the SHA-256 of its canonical JSON. */
export function scenarioHashOf(scenario: Scenario): string {
  return `sha256:${sha256(canonicalJson(scenario))}`;
}

function invalidScenario(error: unknown): never {
  if (error instanceof ScenarioValidationError) {
    throw new ApiError(400, 'INVALID_SCENARIO', error.issues.slice(0, 10).join('; '));
  }
  throw error;
}

/**
 * Saves a scenario for an airport's simulations: checked as the simulator reads it, kept as the
 * file of its canonical content, named by its hash. The same scenario is saved once.
 */
export async function saveScenario(
  db: Db,
  ids: Ids,
  input: {
    readonly airportId: string;
    readonly scenario: unknown;
    readonly by: string;
    readonly nowMs: number;
  },
): Promise<{ readonly row: SimScenarioRow; readonly created: boolean }> {
  let scenario: Scenario;
  try {
    scenario = parseScenario(input.scenario);
  } catch (error) {
    invalidScenario(error);
  }
  const hash = scenarioHashOf(scenario);
  const content = scenarioFile(scenario);
  // What is kept must read back as the same scenario: the runs read it from there.
  let again: Scenario;
  try {
    again = parseScenario(JSON.parse(content));
  } catch (error) {
    invalidScenario(error);
  }
  if (scenarioHashOf(again) !== hash) {
    throw new ApiError(400, 'INVALID_SCENARIO', 'the scenario does not read back the same');
  }
  const inserted = await db
    .insert(simScenario)
    .values({
      id: ids.uuid(),
      airportId: input.airportId,
      hash,
      scenarioId: scenario.id,
      title: scenario.title,
      dataClassification: scenario.dataClassification,
      content,
      createdAtMs: input.nowMs,
      createdBy: input.by,
    })
    .onConflictDoNothing()
    .returning();
  const row = inserted[0];
  if (row !== undefined) return { row, created: true };
  const [existing] = await db
    .select()
    .from(simScenario)
    .where(and(eq(simScenario.airportId, input.airportId), eq(simScenario.hash, hash)));
  if (existing === undefined) throw new Error('a scenario was neither saved nor found');
  return { row: existing, created: false };
}

/** The scenario of a saved row. */
export function scenarioOfRow(row: SimScenarioRow): Scenario {
  return parseScenario(JSON.parse(row.content));
}

export async function scenarioByHash(
  db: Db,
  airportId: string,
  hash: string,
): Promise<SimScenarioRow> {
  const [row] = await db
    .select()
    .from(simScenario)
    .where(and(eq(simScenario.airportId, airportId), eq(simScenario.hash, hash)));
  if (row === undefined) {
    throw new ApiError(
      404,
      'UNKNOWN_SCENARIO',
      'no scenario of this hash is saved at the airport: save it first',
    );
  }
  return row;
}

function invalid(error: unknown): never {
  if (error instanceof ExperimentConfigError || error instanceof ScenarioValidationError) {
    throw new ApiError(400, 'INVALID_SIMULATION', error.message);
  }
  throw error;
}

function specOf(config: ExperimentConfig): RunSpec {
  return {
    seeds: formatSeedRanges(config.seeds),
    policies: config.policies,
    baselinePolicyId: config.baselinePolicyId,
    comparisons: resolveComparisons(config),
    classification: config.classification,
    bootstrap: config.bootstrap,
  };
}

/**
 * The experiment of settings, as the CLI makes it from its command line: the presets configured
 * by the scenario's settings, the status quo, the recommended comparisons unless given, the
 * classification of the first priority policy and the default bootstrap.
 */
export function specOfSettings(settings: SimulationSettings, scenario: Scenario): RunSpec {
  try {
    const seeds = parseSeedRanges(settings.seeds, SIMULATION_LIMITS.maxDays);
    if (new Set(settings.policies).size !== settings.policies.length) {
      throw new ExperimentConfigError('each policy can be chosen once');
    }
    const presets = settings.policies.map((id) => {
      const policy = findPolicyPreset(id);
      if (policy === undefined) throw new ExperimentConfigError(`unknown policy ${id}`);
      return policy;
    });
    let policies: Policy[];
    try {
      policies = applyScenarioSettings(presets, scenario);
    } catch (error) {
      throw new ExperimentConfigError(
        `the settings of the scenario make a policy invalid: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    const baselinePolicyId = settings.baseline ?? (policies[0] as Policy).id;
    const config: ExperimentConfig = {
      scenario,
      seeds,
      policies,
      baselinePolicyId,
      comparisons:
        settings.comparisons ??
        (policies.some((p) => p.id === baselinePolicyId)
          ? recommendedComparisons(policies, baselinePolicyId)
          : []),
      classification: arrivalClassification(policies),
      bootstrap: {
        ...DEFAULT_BOOTSTRAP,
        resamples: settings.bootstrapResamples ?? DEFAULT_BOOTSTRAP.resamples,
      },
    };
    return specOf(config);
  } catch (error) {
    invalid(error);
  }
}

/** The experiment of a manifest, checked as GateFlow's tools make them. */
export function specOfManifest(manifest: SimulationManifest, scenario: Scenario): RunSpec {
  try {
    const config = experimentFromManifest(
      manifest as unknown as ExperimentManifest,
      scenario,
      SIMULATION_LIMITS,
    );
    return specOf(config);
  } catch (error) {
    invalid(error);
  }
}

/** The experiment a run simulates. */
export function configOf(spec: RunSpec, scenario: Scenario): ExperimentConfig {
  return {
    scenario,
    seeds: parseSeedRanges(spec.seeds, Number.MAX_SAFE_INTEGER),
    policies: spec.policies,
    baselinePolicyId: spec.baselinePolicyId,
    comparisons: spec.comparisons,
    classification: spec.classification,
    bootstrap: spec.bootstrap,
  };
}

/** Runs of an airport that have not ended. */
const WAITING = ['QUEUED', 'RUNNING'] as const;

/**
 * Asks for a run: it waits its turn. An airport has at most {@link SIMULATION_LIMITS.maxWaiting}
 * runs waiting or running; the count and the insert hold the airport's lock of simulations.
 */
export async function createRun(
  db: Db,
  ids: Ids,
  input: {
    readonly airportId: string;
    readonly scenario: SimScenarioSummary;
    readonly spec: RunSpec;
    readonly label: string | null;
    readonly expected: { readonly fingerprint: string; readonly reproduces: string | null } | null;
    readonly by: string;
    readonly nowMs: number;
  },
): Promise<SimRunSummary> {
  const days = parseSeedRanges(input.spec.seeds, SIMULATION_LIMITS.maxDays).length;
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtextextended(${`sim-run:${input.airportId}`}, 0))`,
    );
    const [counted] = await tx
      .select({ runs: sql<number>`count(*)::int` })
      .from(simRun)
      .where(and(eq(simRun.airportId, input.airportId), inArray(simRun.state, WAITING)));
    if ((counted?.runs ?? 0) >= SIMULATION_LIMITS.maxWaiting) {
      throw new ApiError(
        409,
        'TOO_MANY_SIMULATIONS',
        `at most ${SIMULATION_LIMITS.maxWaiting} simulations of an airport wait at once`,
      );
    }
    const [row] = await tx
      .insert(simRun)
      .values({
        id: ids.uuid(),
        airportId: input.airportId,
        scenarioRef: input.scenario.id,
        label: input.label,
        request: input.spec,
        state: 'QUEUED',
        daysTotal: days,
        reproduces: input.expected?.reproduces ?? null,
        expectedFingerprint: input.expected?.fingerprint ?? null,
        createdBy: input.by,
        createdAtMs: input.nowMs,
        updatedAtMs: input.nowMs,
      })
      .returning();
    if (row === undefined) throw new Error('a simulation was not added');
    return { ...row, resultsBytes: null };
  });
}

const iso = (ms: number | null): string | null => (ms === null ? null : new Date(ms).toISOString());

/** Who did something, as people read it: a member's login, or `cli` and `system`. */
export async function namesOf(db: Db, actors: readonly string[]): Promise<Map<string, string>> {
  const ids = [
    ...new Set(actors.flatMap((a) => (a.startsWith('staff:') ? [a.slice('staff:'.length)] : []))),
  ];
  const names = new Map<string, string>();
  if (ids.length > 0) {
    const rows = await db
      .select({ id: staffUser.id, login: staffUser.login })
      .from(staffUser)
      .where(inArray(staffUser.id, ids));
    for (const row of rows) names.set(`staff:${row.id}`, row.login);
  }
  return names;
}

/** A run as the API answers it. */
export function runView(
  row: SimRunSummary,
  scenario: SimScenarioSummary,
  names: ReadonlyMap<string, string>,
): SimulationRun {
  const spec = row.request as RunSpec;
  const seeds = parseSeedRanges(spec.seeds, Number.MAX_SAFE_INTEGER);
  return {
    id: row.id,
    label: row.label,
    state: row.state as SimulationRun['state'],
    scenario: {
      id: scenario.id,
      hash: scenario.hash,
      scenarioId: scenario.scenarioId,
      title: scenario.title,
      dataClassification: scenario.dataClassification,
    },
    seeds: { count: seeds.length, ranges: spec.seeds },
    policies: spec.policies.map((p) => p.id),
    baselinePolicyId: spec.baselinePolicyId,
    days: { done: row.daysDone, total: row.daysTotal },
    createdAt: new Date(row.createdAtMs).toISOString(),
    createdBy: names.get(row.createdBy) ?? row.createdBy,
    startedAt: iso(row.startedAtMs),
    endedAt: iso(row.endedAtMs),
    error: row.error,
    results:
      row.resultsBytes === null || row.resultsHash === null || row.fingerprint === null
        ? null
        : { sha256: row.resultsHash, bytes: row.resultsBytes, fingerprint: row.fingerprint },
    expected:
      row.expectedFingerprint === null
        ? null
        : {
            fingerprint: row.expectedFingerprint,
            reproduces: row.reproduces,
            matches: row.matches,
          },
  };
}

/** The runs of an airport with their scenarios, the latest first (or one run). */
export async function runsOf(db: Db, airportId: string, runId?: string): Promise<FoundRun[]> {
  const rows = await db
    .select({ row: runSummary, scenario: scenarioSummary })
    .from(simRun)
    .innerJoin(simScenario, eq(simScenario.id, simRun.scenarioRef))
    .where(
      runId === undefined
        ? eq(simRun.airportId, airportId)
        : and(eq(simRun.airportId, airportId), eq(simRun.id, runId)),
    )
    .orderBy(desc(simRun.seq))
    .limit(SIMULATION_LIMITS.listed);
  return rows;
}

/** One run of an airport, or a 404. */
export async function runOf(db: Db, airportId: string, runId: string): Promise<FoundRun> {
  if (!/^[0-9a-f-]{36}$/.test(runId)) {
    throw new ApiError(404, 'UNKNOWN_SIMULATION', 'no such simulation at this airport');
  }
  const [found] = await runsOf(db, airportId, runId);
  if (found === undefined) {
    throw new ApiError(404, 'UNKNOWN_SIMULATION', 'no such simulation at this airport');
  }
  return found;
}

/** The results file of a run that is done, as written; a 409 otherwise. */
export async function resultsOf(db: Db, found: FoundRun): Promise<string> {
  const [row] =
    found.row.state === 'DONE'
      ? await db.select({ results: simRun.results }).from(simRun).where(eq(simRun.id, found.row.id))
      : [];
  const results = row?.results ?? null;
  if (results === null) {
    throw new ApiError(409, 'SIMULATION_NOT_DONE', 'the simulation is not done');
  }
  return results;
}

/** The scenarios of an airport, the latest first, without their content. */
export async function scenariosOf(db: Db, airportId: string): Promise<SimScenarioSummary[]> {
  return db
    .select(scenarioSummary)
    .from(simScenario)
    .where(eq(simScenario.airportId, airportId))
    .orderBy(desc(simScenario.createdAtMs), desc(simScenario.id));
}

/** A saved scenario of an airport, whole, or a 404. */
export async function scenarioById(db: Db, airportId: string, id: string): Promise<SimScenarioRow> {
  const [row] = /^[0-9a-f-]{36}$/.test(id)
    ? await db
        .select()
        .from(simScenario)
        .where(and(eq(simScenario.id, id), eq(simScenario.airportId, airportId)))
    : [];
  if (row === undefined) {
    throw new ApiError(404, 'UNKNOWN_SCENARIO', 'no such scenario at this airport');
  }
  return row;
}

/** Cancels a run that waits or runs: the server simulating it stops at its next heartbeat. */
export async function cancelRun(
  db: Db,
  airportId: string,
  runId: string,
  nowMs: number,
): Promise<void> {
  await runOf(db, airportId, runId);
  const cancelled = await db
    .update(simRun)
    .set({ state: 'CANCELLED', runner: null, endedAtMs: nowMs, updatedAtMs: nowMs })
    .where(
      and(eq(simRun.id, runId), eq(simRun.airportId, airportId), inArray(simRun.state, WAITING)),
    )
    .returning({ id: simRun.id });
  if (cancelled.length === 0) {
    throw new ApiError(409, 'SIMULATION_ENDED', 'the simulation has ended already');
  }
}

/** Where a server simulates. */
export type SimulationThreads =
  | { readonly workers: number; readonly script: URL }
  /** In the server's thread, between requests: for tests, which run from source. */
  | 'here';

export interface SimulationRunnerOptions {
  readonly threads: SimulationThreads;
  /** How often the server says it is at its run, and learns of a cancellation (2 s). */
  readonly heartbeatMs?: number;
  /** A running run nobody has spoken of for this long waits again, for any server (60 s). */
  readonly staleMs?: number;
  /** How often a server looks for runs waiting, with `start()` (1 s). */
  readonly pollMs?: number;
  /** What to do with an error of the runner itself (the database...): log it. */
  readonly onError?: (error: unknown) => void;
}

/** At most how often the progress of a run is written. */
const PROGRESS_MS = 1000;

const unwrap = <K extends SimTaskResult['kind']>(
  result: SimTaskResult | undefined,
  kind: K,
): Extract<SimTaskResult, { kind: K }> => {
  if (result?.kind !== kind) throw new Error(`a simulation task gave no ${kind}`);
  return result as Extract<SimTaskResult, { kind: K }>;
};

/**
 * The server's simulations: it takes the oldest run that waits (`FOR UPDATE SKIP LOCKED`, so that
 * servers never take the same), simulates it, and writes the results. While it runs, a heartbeat
 * says the server is at it, and learns of a cancellation; a run whose server went quiet waits
 * again. The results do not depend on which server simulated them, nor on how many threads.
 */
export class SimulationRunner {
  /** The name of this server in the runs it takes. */
  readonly name = `api:${randomUUID()}`;
  private readonly executor: SimExecutor;
  private readonly heartbeatMs: number;
  private readonly staleMs: number;
  private readonly pollMs: number;
  private readonly onError: (error: unknown) => void;
  private current: Promise<string | null> | null = null;
  private abort: AbortController | null = null;
  private currentRunId: string | null = null;
  private timer: ReturnType<typeof setInterval> | undefined;
  private stopped = false;

  constructor(
    private readonly db: Db,
    private readonly clock: Clock,
    options: SimulationRunnerOptions,
  ) {
    this.executor =
      options.threads === 'here'
        ? inThisThread
        : onWorkerThreads(options.threads.script, options.threads.workers);
    this.heartbeatMs = options.heartbeatMs ?? 2000;
    this.staleMs = options.staleMs ?? 60_000;
    this.pollMs = options.pollMs ?? 1000;
    this.onError =
      options.onError ??
      (() => {
        // Errors of the runner are the server's to log; without a logger, the next poll retries.
      });
  }

  /** Looks for runs waiting every `pollMs`, while the server listens. */
  start(): void {
    if (this.timer !== undefined) return;
    this.timer = setInterval(() => {
      this.runNext().catch(this.onError);
    }, this.pollMs);
    this.timer.unref();
  }

  /** Looks for a run at once (a run was asked for): with `start()` only. */
  wake(): void {
    if (this.timer === undefined || this.stopped) return;
    setImmediate(() => {
      this.runNext().catch(this.onError);
    });
  }

  /** Stops the run under way when it is `runId` (cancelled here). */
  cancelled(runId: string): void {
    if (this.currentRunId === runId) this.abort?.abort();
  }

  /**
   * Takes the oldest run that waits and simulates it to the end; null when none waits, or while
   * this server is at a run already. Runs whose server went quiet wait again first.
   */
  runNext(): Promise<string | null> {
    if (this.stopped) return Promise.resolve(null);
    if (this.current !== null) return Promise.resolve(null);
    const work = this.takeAndRun().finally(() => {
      this.current = null;
    });
    this.current = work;
    return work;
  }

  /** Stops: the run under way waits again, for another server (or this one, restarted). */
  async stop(): Promise<void> {
    this.stopped = true;
    if (this.timer !== undefined) clearInterval(this.timer);
    this.timer = undefined;
    this.abort?.abort();
    await this.current?.catch(() => undefined);
  }

  private async takeAndRun(): Promise<string | null> {
    const now = this.clock.now();
    await this.db
      .update(simRun)
      .set({ state: 'QUEUED', runner: null, startedAtMs: null, daysDone: 0, updatedAtMs: now })
      .where(and(eq(simRun.state, 'RUNNING'), lt(simRun.updatedAtMs, now - this.staleMs)));
    const taken = await this.db.execute<{ id: string }>(sql`
      UPDATE sim_run
      SET state = 'RUNNING', runner = ${this.name}, started_at_ms = ${now},
          updated_at_ms = ${now}, days_done = 0
      WHERE id = (
        SELECT id FROM sim_run WHERE state = 'QUEUED' ORDER BY seq LIMIT 1 FOR UPDATE SKIP LOCKED
      )
      RETURNING id`);
    const id = taken.rows[0]?.id;
    if (id === undefined) return null;
    const [found] = await this.db
      .select({ row: simRun, scenario: simScenario })
      .from(simRun)
      .innerJoin(simScenario, eq(simScenario.id, simRun.scenarioRef))
      .where(eq(simRun.id, id));
    if (found === undefined) return null;
    await this.simulate(found.row, found.scenario);
    return id;
  }

  /** Writes to the run if this server still has it; false when it does not (cancelled, taken). */
  private async mine(id: string, set: Partial<typeof simRun.$inferInsert>): Promise<boolean> {
    const updated = await this.db
      .update(simRun)
      .set({ ...set, updatedAtMs: this.clock.now() })
      .where(and(eq(simRun.id, id), eq(simRun.state, 'RUNNING'), eq(simRun.runner, this.name)))
      .returning({ id: simRun.id });
    return updated.length > 0;
  }

  private async simulate(row: SimRunRow, scenarioRow: SimScenarioRow): Promise<void> {
    const abort = new AbortController();
    this.abort = abort;
    this.currentRunId = row.id;
    // Stopped while it took the run: put it back at once.
    if (this.stopped) abort.abort();
    const heartbeat = setInterval(() => {
      void this.mine(row.id, {}).then(
        (still) => {
          if (!still) abort.abort();
        },
        () => undefined,
      );
    }, this.heartbeatMs);
    heartbeat.unref();
    try {
      const results = await this.compute(row, scenarioRow, abort.signal);
      const now = this.clock.now();
      await this.mine(row.id, {
        state: 'DONE',
        daysDone: row.daysTotal,
        results: results.text,
        resultsHash: results.sha256,
        fingerprint: results.fingerprint,
        matches:
          row.expectedFingerprint === null ? null : row.expectedFingerprint === results.fingerprint,
        endedAtMs: now,
        runner: null,
      });
    } catch (error) {
      if (abort.signal.aborted || error instanceof SimulationAborted) {
        // Cancelled or taken: nothing to write. Stopped here: it waits again.
        if (this.stopped) {
          await this.mine(row.id, {
            state: 'QUEUED',
            runner: null,
            startedAtMs: null,
            daysDone: 0,
          }).catch(() => false);
        }
        return;
      }
      await this.mine(row.id, {
        state: 'FAILED',
        error: error instanceof Error ? error.message : String(error),
        endedAtMs: this.clock.now(),
        runner: null,
      }).catch(() => false);
    } finally {
      clearInterval(heartbeat);
      this.abort = null;
      this.currentRunId = null;
    }
  }

  private async compute(
    row: SimRunRow,
    scenarioRow: SimScenarioRow,
    signal: AbortSignal,
  ): Promise<FinishedResults> {
    const config = configOf(row.request as RunSpec, scenarioOfRow(scenarioRow));
    const one = async (task: SimTask) => (await this.executor.run([task], signal))[0];
    const { plan } = unwrap(await one({ kind: 'plan', config }), 'plan');
    const days = await this.days(row.id, plan, signal);
    const { results } = unwrap(
      await one({
        kind: 'finish',
        config,
        days,
        input: { generator: API_GENERATOR, commit: BUILD_COMMIT, scenarioHash: scenarioRow.hash },
      }),
      'finish',
    );
    return results;
  }

  private async days(id: string, plan: ExperimentPlan, signal: AbortSignal) {
    let written = Date.now();
    let pending: Promise<boolean> | null = null;
    const results = await this.executor.run(
      plan.seeds.map((seed): SimTask => ({ kind: 'day', job: plan.job, seed })),
      signal,
      (done) => {
        const now = Date.now();
        if (now - written < PROGRESS_MS || pending !== null) return;
        written = now;
        pending = this.mine(id, { daysDone: done })
          .catch(() => true)
          .finally(() => {
            pending = null;
          });
      },
    );
    return results.map((r): SeedResult => unwrap(r, 'day').day);
  }
}
