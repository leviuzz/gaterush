import { and, asc, desc, eq, inArray, lt, sql } from 'drizzle-orm';
import type { TwinCall, TwinResponse, TwinRun } from '@gateflow/contracts';
import type { CommandResult } from '@gateflow/operations';
import type { Policy } from '@gateflow/queue-core';
import { canonicalJson, generateSchedule } from '@gateflow/sim-scenarios';
import type { Scenario } from '@gateflow/sim-scenarios';
import { TwinError, TwinScript, checkStep, twinDay, twinSettings } from '@gateflow/twin';
import type { TwinDay, TwinDivergence, TwinStep } from '@gateflow/twin';
import { sha256 } from './chain';
import type { Db } from './db/client';
import { checkpoint, flight, queueEvent, queueToken, twinRun } from './db/schema';
import type { Ids } from './ids';
import { policyHash, summaryOf } from './policies';
import { ApiError } from './runtime';
import type { Runtime } from './runtime';
import { designatorOf } from './seed';
import { saveScenario } from './simulations';
import { boardOf, displayMessageOf } from './streams';
import { localDate, serviceDayOf, systemClock, zonedEpoch } from './time';
import type { Clock } from './time';

/*
 * The digital twin in the API (S18, ADR-051): a scenario's simulated day played to a checkpoint
 * of its own, at an accelerated virtual time, through the commands staff and kiosks send, under
 * the checkpoint's writer, in its hash-chained log. Every answer is checked against the simulator's
 * on the spot: the first that differs stops the run, and says where.
 */

/** The prefix of the twin's ticket numbers: T001, T002... */
export const TWIN_PREFIX = 'T';

/** How often a run writes its progress, and how long a run may stay silent before it is cut off. */
export const TWIN_SAVE_MS = 1_000;
export const TWIN_SILENT_MS = 60_000;

const MS_PER_DAY = 86_400_000;
const two = (n: number) => String(n).padStart(2, '0');
const iso = (ms: number) => new Date(ms).toISOString();

export type TwinRunState = TwinRun['state'];

export interface StartTwin {
  readonly airportId: string;
  readonly timeZone: string;
  readonly scenario: Scenario;
  readonly seed: number;
  readonly policy: Policy;
  /** Virtual time per real time; null: as fast as the server goes. */
  readonly speed: number | null;
  /** The last operation to play, in the day's time (ms since midnight); the whole day if absent. */
  readonly untilMs?: number;
  /** The virtual service day: today at the airport when absent, or the next day that fits. */
  readonly serviceDay?: string;
  /** Who starts it: `staff:<id>`, or `cli`. */
  readonly createdBy: string;
}

/** A run playing on this server. */
interface Playing {
  readonly runId: string;
  readonly checkpointId: string;
  readonly script: TwinScript;
  speed: number | null;
  /** The pacing: the virtual clock read `virtualMs` at the real time `realMs`. */
  anchor: { realMs: number; virtualMs: number };
  /** The next step to play, and the virtual time of the last one played. */
  next: number;
  virtualMs: number;
  applied: number;
  matched: number;
  state: TwinRunState;
  divergence: TwinRun['divergence'];
  error: string | null;
  stopping: boolean;
  /** Ends a wait of the pacing at once (a stop, a new speed). */
  wake: (() => void) | null;
  /** When the progress was last written (real time). */
  savedAt: number;
  done: Promise<void>;
}

/** The ticket number of a ticket id of a checkpoint, for a person to read. */
async function numberOf(db: Db, ticketId: string): Promise<string> {
  const rows = await db
    .select({ number: queueToken.number })
    .from(queueToken)
    .where(eq(queueToken.id, ticketId));
  return rows[0]?.number ?? ticketId;
}

/** The days a twin's virtual day may fall on: today at the airport, then the next ones. */
function datesFrom(nowMs: number, timeZone: string): string[] {
  const dates: string[] = [];
  for (let i = 0; i < 3; i++) {
    const d = localDate(nowMs + i * MS_PER_DAY, timeZone);
    dates.push(`${String(d.year)}-${two(d.month)}-${two(d.day)}`);
  }
  return dates;
}

/**
 * The virtual day of a twin: a local date whose midnight starts it, such that every operation it
 * plays falls on that service day. On the day the clocks go forward a late scenario would cross
 * midnight: the next date is taken.
 */
export function virtualDayOf(
  day: TwinDay,
  timeZone: string,
  dates: readonly string[],
  untilMs?: number,
): { readonly serviceDay: string; readonly originMs: number } {
  const lastMs = Math.min(day.endMs, untilMs ?? Infinity);
  const selection = day.policy.selection;
  for (const date of dates) {
    const originMs = zonedEpoch(date, 0, timeZone);
    const fits =
      serviceDayOf(originMs + day.startMs, timeZone, '00:00') === date &&
      serviceDayOf(originMs + lastMs, timeZone, '00:00') === date;
    // The flight-call practice rounds the clock to its interval: a midnight must be a multiple.
    const rounds =
      selection.kind !== 'flight-call' || originMs % selection.announcementIntervalMs === 0;
    if (fits && rounds) return { serviceDay: date, originMs };
  }
  throw new ApiError(
    400,
    'TWIN_DAY_DOES_NOT_FIT',
    'the simulated day does not fit in one service day of the airport',
  );
}

/** The run of the twin, as the contract gives it. */
function runOf(
  row: typeof twinRun.$inferSelect,
  checkpointName: string,
  policy: Policy,
  playing: Playing | undefined,
  nowMs: number,
): TwinRun {
  return {
    id: row.id,
    checkpointId: row.checkpointId,
    checkpoint: checkpointName,
    scenarioId: row.scenarioId,
    seed: row.seed,
    policy: summaryOf(policy),
    serviceDay: row.serviceDay,
    // A run playing on this server: its progress in memory, fresher than the row's.
    state: playing === undefined ? (row.state as TwinRunState) : playing.state,
    speed: playing === undefined ? row.speed : playing.speed,
    virtualNow: iso(playing === undefined ? row.virtualMs : virtualNowOf(playing, nowMs)),
    from: iso(row.fromMs),
    to: iso(row.toMs),
    applied: playing === undefined ? row.applied : playing.applied,
    steps: row.steps,
    matchedCalls: playing === undefined ? row.matchedCalls : playing.matched,
    expectedCalls: row.expectedCalls,
    divergence:
      playing === undefined ? (row.divergence as TwinRun['divergence']) : playing.divergence,
    error: playing === undefined ? row.error : playing.error,
    startedAt: iso(row.createdAtMs),
    endedAt: row.endedAtMs === null ? null : iso(row.endedAtMs),
  };
}

/** Where a playing run is in its virtual day: between the last step played and the next one. */
function virtualNowOf(run: Playing, nowMs: number): number {
  const nextMs = run.script.steps[run.next]?.atMs ?? run.virtualMs;
  if (run.speed === null || run.state !== 'RUNNING') return run.virtualMs;
  const paced = run.anchor.virtualMs + (nowMs - run.anchor.realMs) * run.speed;
  return Math.max(run.virtualMs, Math.min(nextMs, paced));
}

/**
 * The runs of the twin on this server: each plays in the background, one step after the other,
 * paced by the real clock at its speed.
 */
export class TwinRunner {
  private readonly playing = new Map<string, Playing>();

  constructor(
    private readonly db: Db,
    private readonly runtime: Runtime,
    private readonly ids: Ids,
    /** The time of records (the server's clock). */
    private readonly clock: Clock,
    private readonly onError: (error: unknown) => void,
    /** The real time of the pacing. */
    private readonly realClock: Clock = systemClock,
  ) {}

  /**
   * Starts a run: plans the simulated day, opens a twin checkpoint for it and plays it in the
   * background. Returns the run's id.
   */
  async start(options: StartTwin): Promise<string> {
    let day: TwinDay;
    try {
      day = twinDay(options.scenario, options.seed, options.policy);
    } catch (error) {
      if (error instanceof TwinError) throw new ApiError(400, 'TWIN_NOT_PLAYABLE', error.message);
      throw error;
    }
    const nowMs = this.clock.now();
    const dates =
      options.serviceDay === undefined ? datesFrom(nowMs, options.timeZone) : [options.serviceDay];
    const { serviceDay, originMs } = virtualDayOf(day, options.timeZone, dates, options.untilMs);
    const script = new TwinScript(day, {
      originMs,
      ids: {
        ticketId: () => this.ids.uuid(),
        opaqueRef: () => this.ids.opaqueRef(),
        flightId: () => this.ids.uuid(),
      },
      ...(options.untilMs === undefined ? {} : { untilMs: options.untilMs }),
    });
    // The walk to each flight's gate, as the airport's schedule gives it.
    const walks = new Map(generateSchedule(options.scenario).map((f) => [f.id, f.walkEstimateMs]));
    const runId = this.ids.uuid();
    const checkpointId = this.ids.uuid();
    // The scenario, saved at the airport: the twin checkpoint's forecasts read it (S21).
    const { row: saved } = await saveScenario(this.db, this.ids, {
      airportId: options.airportId,
      scenario: options.scenario,
      by: options.createdBy,
      nowMs,
    });
    // The virtual clock starts at the first command: the night before it is empty.
    const firstMs = script.steps.find((s) => s.command !== null)?.atMs ?? originMs;
    await this.db.transaction(async (tx) => {
      // A run whose server stopped long ago no longer holds the airport (one run at a time).
      await tx
        .update(twinRun)
        .set({ state: 'STOPPED', error: 'interrupted: its server stopped', endedAtMs: nowMs })
        .where(
          and(
            eq(twinRun.airportId, options.airportId),
            eq(twinRun.state, 'RUNNING'),
            lt(twinRun.updatedAtMs, nowMs - TWIN_SILENT_MS),
          ),
        );
      const counted = await tx
        .select({ runs: sql<number>`count(*)::int` })
        .from(twinRun)
        .where(eq(twinRun.airportId, options.airportId));
      const n = (counted[0]?.runs ?? 0) + 1;
      await tx.insert(checkpoint).values({
        id: checkpointId,
        airportId: options.airportId,
        code: `twin-${String(n)}`,
        name: `Twin ${String(n)}: ${options.scenario.title}, seed ${String(options.seed)}`,
        ticketPrefix: TWIN_PREFIX,
        dayStartsAt: '00:00',
        settings: { ...twinSettings(day), twin: { runId, serviceDay }, scenarioHash: saved.hash },
      });
      try {
        await tx.insert(twinRun).values({
          id: runId,
          airportId: options.airportId,
          checkpointId,
          scenarioId: options.scenario.id,
          // The scenario's hash, as the simulator's command line writes it in its manifests.
          scenarioHash: `sha256:${sha256(canonicalJson(options.scenario))}`,
          seed: options.seed,
          policyHash: policyHash(options.policy),
          serviceDay,
          originMs,
          untilMs: options.untilMs ?? null,
          fromMs: firstMs,
          toMs: script.steps.at(-1)?.atMs ?? firstMs,
          virtualMs: firstMs,
          steps: script.steps.length,
          expectedCalls: script.expectedCalls().length,
          createdBy: options.createdBy,
          createdAtMs: nowMs,
          state: 'RUNNING',
          speed: options.speed,
          updatedAtMs: nowMs,
        });
      } catch (error) {
        if (String((error as { cause?: { code?: string } }).cause?.code) === '23505') {
          throw new ApiError(409, 'TWIN_RUNNING', 'a run of the twin is playing at this airport');
        }
        throw error;
      }
      // The flights of the virtual day: the run's own, SIMULATED, seen by its checkpoint only.
      for (let i = 0; i < script.flights.length; i += 500) {
        await tx.insert(flight).values(
          script.flights.slice(i, i + 500).map((f) => {
            const designator = designatorOf(f.simId);
            const departure = localDate(f.stdMs, options.timeZone);
            const known = day.population.flights.find((g) => g.id === f.simId)?.knownDeadline;
            return {
              id: f.id,
              airportId: options.airportId,
              serviceDate: serviceDay,
              number: f.simId,
              carrier: designator?.carrier ?? null,
              flightNumber: designator?.flightNumber ?? null,
              departureDate: `${String(departure.year)}-${two(departure.month)}-${two(departure.day)}`,
              stdMs: f.stdMs,
              boardingCloseMs: f.boardingCloseMs,
              deadlineSource: known?.source ?? 'NONE',
              observedAtMs: null,
              gateZone: f.gateZone,
              walkEstimateMs: walks.get(f.simId) ?? 0,
              environment: 'SIMULATED',
              twinRunId: runId,
            };
          }),
        );
      }
    });
    const run: Playing = {
      runId,
      checkpointId,
      script,
      speed: options.speed,
      anchor: { realMs: this.realClock.now(), virtualMs: firstMs },
      next: 0,
      virtualMs: firstMs,
      applied: 0,
      matched: 0,
      state: 'RUNNING',
      divergence: null,
      error: null,
      stopping: false,
      wake: null,
      savedAt: this.realClock.now(),
      done: Promise.resolve(),
    };
    this.playing.set(runId, run);
    run.done = this.play(run);
    return runId;
  }

  /** Changes the speed of a run playing on this server; false if it does not play here. */
  setSpeed(runId: string, speed: number | null): boolean {
    const run = this.playing.get(runId);
    if (run === undefined) return false;
    const now = this.realClock.now();
    run.anchor = { realMs: now, virtualMs: virtualNowOf(run, now) };
    run.speed = speed;
    run.wake?.();
    return true;
  }

  /** Stops a run playing on this server, and waits for it; false if it does not play here. */
  async stop(runId: string): Promise<boolean> {
    const run = this.playing.get(runId);
    if (run === undefined) return false;
    run.stopping = true;
    run.wake?.();
    await run.done;
    return true;
  }

  /** Waits for a run playing on this server to end. */
  async wait(runId: string): Promise<void> {
    await this.playing.get(runId)?.done;
  }

  /** Stops every run of this server (the server stops). */
  async close(): Promise<void> {
    await Promise.all([...this.playing.keys()].map((id) => this.stop(id)));
  }

  /** The run as the contract gives it, live when it plays on this server. */
  async view(runId: string): Promise<TwinRun | null> {
    const rows = await this.db
      .select({ run: twinRun, name: checkpoint.name, settings: checkpoint.settings })
      .from(twinRun)
      .innerJoin(checkpoint, eq(checkpoint.id, twinRun.checkpointId))
      .where(eq(twinRun.id, runId));
    const row = rows[0];
    if (row === undefined) return null;
    return runOf(
      row.run,
      row.name,
      row.settings.policy as Policy,
      this.playing.get(runId),
      this.realClock.now(),
    );
  }

  /** Plays the steps one after the other, paced at the run's speed, checking every answer. */
  private async play(run: Playing): Promise<void> {
    const steps = run.script.steps;
    try {
      while (run.next < steps.length && !run.stopping) {
        const step = steps[run.next] as TwinStep;
        if (!(await this.pace(run, step.atMs))) break;
        if (step.command !== null) {
          const result = await this.send(run, step);
          const divergence = checkStep(step, result);
          if (divergence !== null) {
            run.divergence = await this.described(divergence, step, result);
            run.state = 'DIVERGED';
            break;
          }
          if (result.type === 'CALLED' && result.ticket !== null) run.matched++;
        }
        run.applied++;
        run.next++;
        run.virtualMs = step.atMs;
        await this.progress(run);
      }
      if (run.state === 'RUNNING') run.state = run.stopping ? 'STOPPED' : 'FINISHED';
    } catch (error) {
      run.state = 'FAILED';
      run.error = error instanceof Error ? error.message : String(error);
      this.onError(error);
    }
    try {
      await this.save(run, true);
    } catch (error) {
      this.onError(error);
    }
    this.playing.delete(run.runId);
  }

  /** Sends a step's command at its virtual time, as the twin's simulated passengers and staff. */
  private async send(run: Playing, step: TwinStep): Promise<CommandResult> {
    const key = `twin:${run.runId}:${String(step.index)}`;
    const command = step.command;
    if (command === null) throw new Error('a step without a command is not sent');
    const executed = await this.runtime.execute({
      checkpointId: run.checkpointId,
      idempotencyKey: key,
      requestHash: sha256(key),
      actor: 'system:twin',
      atMs: step.atMs,
      build: () => command,
    });
    if (executed.result === null) throw new Error(`step ${String(step.index)} had no answer`);
    return executed.result;
  }

  /**
   * Waits until the real time of a step at the run's speed: at once when as fast as possible.
   * False when the run is to stop instead.
   */
  private async pace(run: Playing, atMs: number): Promise<boolean> {
    for (;;) {
      if (run.stopping) return false;
      if (run.speed === null) return true;
      const due = run.anchor.realMs + (atMs - run.anchor.virtualMs) / run.speed;
      const wait = due - this.realClock.now();
      if (wait <= 0) return true;
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, Math.min(wait, TWIN_SAVE_MS));
        run.wake = () => {
          clearTimeout(timer);
          resolve();
        };
      });
      run.wake = null;
      // A long wait at a low speed: the progress shows the virtual clock moving.
      await this.progress(run);
    }
  }

  /** Writes a run's progress, once a second at most. */
  private async progress(run: Playing): Promise<void> {
    if (this.realClock.now() - run.savedAt < TWIN_SAVE_MS) return;
    await this.save(run, false);
    run.savedAt = this.realClock.now();
  }

  /** The divergence for a person: ticket numbers rather than ids. */
  private async described(
    divergence: TwinDivergence,
    step: TwinStep,
    result: CommandResult,
  ): Promise<NonNullable<TwinRun['divergence']>> {
    let expected = divergence.expected;
    let actual = divergence.actual;
    if (step.expect.type === 'CALLED' && step.expect.ticketId !== null) {
      expected = await numberOf(this.db, step.expect.ticketId);
    }
    if (result.type === 'CALLED') actual = result.ticket?.number ?? 'nobody';
    return { at: iso(divergence.atMs), operation: divergence.operation, expected, actual };
  }

  /** Writes a run's progress; at its end, its state and when it ended. */
  private async save(run: Playing, ended: boolean): Promise<void> {
    const nowMs = this.clock.now();
    await this.db
      .update(twinRun)
      .set({
        state: ended ? run.state : 'RUNNING',
        speed: run.speed,
        applied: run.applied,
        matchedCalls: run.matched,
        virtualMs: virtualNowOf(run, this.realClock.now()),
        divergence: run.divergence,
        error: run.error,
        updatedAtMs: nowMs,
        ...(ended ? { endedAtMs: nowMs } : {}),
      })
      .where(eq(twinRun.id, run.runId));
  }
}

/** The latest calls of a twin's day, the latest first, with the engine's reasons for each ticket. */
async function latestCalls(db: Db, checkpointId: string, limit: number): Promise<TwinCall[]> {
  const called = await db
    .select({ ticketId: queueEvent.ticketId, atMs: queueEvent.atMs, number: queueToken.number })
    .from(queueEvent)
    .innerJoin(queueToken, eq(queueToken.id, queueEvent.ticketId))
    .where(and(eq(queueEvent.checkpointId, checkpointId), eq(queueEvent.type, 'CALLED')))
    .orderBy(desc(queueEvent.seq))
    .limit(limit);
  const ids = called.flatMap((c) => (c.ticketId === null ? [] : [c.ticketId]));
  const commitments =
    ids.length === 0
      ? []
      : await db
          .select({ ticketId: queueEvent.ticketId, payload: queueEvent.payload })
          .from(queueEvent)
          .where(
            and(
              eq(queueEvent.checkpointId, checkpointId),
              eq(queueEvent.type, 'COMMITTED'),
              inArray(queueEvent.ticketId, ids),
            ),
          )
          .orderBy(queueEvent.seq);
  const why = new Map<string, { priority: boolean; reasons: string[] }>();
  for (const c of commitments) {
    if (c.ticketId === null) continue;
    const payload = c.payload as { priority?: boolean; reasons?: string[] };
    why.set(c.ticketId, { priority: payload.priority === true, reasons: payload.reasons ?? [] });
  }
  return called.map((c) => ({
    number: c.number,
    at: iso(c.atMs),
    priority: why.get(c.ticketId ?? '')?.priority ?? false,
    reasons: why.get(c.ticketId ?? '')?.reasons ?? [],
  }));
}

/** The twin of an airport: its latest run, and what its checkpoint shows now. */
export async function twinOf(
  db: Db,
  runner: TwinRunner,
  airportId: string,
  nowMs: number,
): Promise<TwinResponse> {
  const latest = await db
    .select({ id: twinRun.id, checkpointId: twinRun.checkpointId, serviceDay: twinRun.serviceDay })
    .from(twinRun)
    .where(eq(twinRun.airportId, airportId))
    .orderBy(desc(twinRun.seq))
    .limit(1);
  const row = latest[0];
  const none = { issued: 0, waiting: 0, called: 0, admitted: 0 };
  if (row === undefined) return { run: null, board: null, calls: [], counts: none };
  const run = await runner.view(row.id);
  const boardRow = await boardOf(db, row.checkpointId);
  const board =
    boardRow === undefined ? null : displayMessageOf(boardRow, [], row.serviceDay, nowMs).board;
  const states = await db
    .select({ state: queueToken.state, n: sql<number>`count(*)::int` })
    .from(queueToken)
    .where(eq(queueToken.checkpointId, row.checkpointId))
    .groupBy(queueToken.state);
  const count = (...wanted: string[]) =>
    states.filter((s) => wanted.includes(s.state)).reduce((sum, s) => sum + s.n, 0);
  return {
    run,
    board,
    calls: await latestCalls(db, row.checkpointId, 12),
    counts: {
      issued: states.reduce((sum, s) => sum + s.n, 0),
      waiting: count('QUEUED', 'PREPARE', 'REVIEW'),
      called: count('CALLED', 'RECALLED', 'NO_SHOW'),
      admitted: count('ADMITTED'),
    },
  };
}

/** The flights of a twin's checkpoint, for its lane station and console: its run's own. */
export async function twinFlightsOf(db: Db, runId: string) {
  return db.select().from(flight).where(eq(flight.twinRunId, runId)).orderBy(asc(flight.stdMs));
}

/** The numbers a twin's checkpoint called, in order: what its displays showed. */
export async function liveCallNumbers(db: Db, checkpointId: string): Promise<string[]> {
  const rows = await db
    .select({ number: queueToken.number })
    .from(queueEvent)
    .innerJoin(queueToken, eq(queueToken.id, queueEvent.ticketId))
    .where(and(eq(queueEvent.checkpointId, checkpointId), eq(queueEvent.type, 'CALLED')))
    .orderBy(asc(queueEvent.seq));
  return rows.map((r) => r.number);
}
