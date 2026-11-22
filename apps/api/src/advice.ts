import { and, asc, desc, eq, inArray, isNotNull, sql } from 'drizzle-orm';
import type { Advice, AdviceResponse } from '@gateflow/contracts';
import {
  FORECAST_VERSION,
  LANE_ADVICE,
  LIBRARY_CALIBRATION,
  LIBRARY_CALIBRATION_SOURCE,
  adviseLanes,
  laneChangePossible,
} from '@gateflow/forecast';
import type { Band, LaneAdvice } from '@gateflow/forecast';
import { ADVICE_RULES, advicesOfLog } from '@gateflow/operations';
import type { AdviceSummary, Command, LaneAdviceRecord } from '@gateflow/operations';
import { sha256 } from './chain';
import type { Db } from './db/client';
import { checkpoint, queueCommand } from './db/schema';
import type { ProfileCache, ProfileEntry } from './forecast';
import { liveForecastInput, profileOfCheckpoint } from './forecast';
import type { Ids } from './ids';
import { ApiError, loadCheckpoint, serviceDayNow } from './runtime';
import type { CheckpointRow, Runtime } from './runtime';
import { zonedEpoch } from './time';
import type { Clock } from './time';

/*
 * GateFlow's recommendations of lanes in the API (S22, ADR-056). Every 5 minutes of a checkpoint's
 * clock, and when its lanes change, the advisor forecasts the next hour (S21) and, when the rule
 * says so (S8's, `adviseLanes`), records a recommendation in the checkpoint's log; the day itself
 * refuses one that the cooldown or an open one forbids. 15 minutes after the time a recommendation
 * spoke of, it records what happened. A twin's checkpoint is reviewed at its virtual time, by the
 * twin's runner.
 */

const MINUTE_MS = 60_000;
const ADVICE_COMMANDS = ['ADVISE_LANES', 'DECIDE_ADVICE', 'RECORD_OUTCOME'] as const;
/** The background pass: often enough not to miss a 5-minute slot by much. */
const PASS_MS = 30_000;

const tenth = (value: number) => Math.round(value * 10) / 10;
const minutesOf = (band: Band) => ({
  p10: tenth(band.p10 / MINUTE_MS),
  p50: tenth(band.p50 / MINUTE_MS),
  p90: tenth(band.p90 / MINUTE_MS),
});
const iso = (ms: number) => new Date(ms).toISOString();

/** The recommendation as the log records it: minutes, to a tenth. */
export function adviceRecordOf(advice: LaneAdvice): LaneAdviceRecord {
  return {
    action: advice.action,
    lanes: advice.lanes,
    reason: advice.reason,
    lanesOpen: advice.lanesOpen,
    leadMinutes: advice.leadMinutes,
    atMinutes: advice.atMinutes,
    waitWithout: minutesOf(advice.without),
    waitWith: minutesOf(advice.with),
    peakWithoutMinutes: tenth(advice.peakWithoutMs / MINUTE_MS),
    peakWithMinutes: tenth(advice.peakWithMs / MINUTE_MS),
    forecast: `forecast ${FORECAST_VERSION}, calibrated on ${LIBRARY_CALIBRATION_SOURCE}`,
  };
}

/** A recommendation as the API answers it. */
export function adviceOf(summary: AdviceSummary): Advice {
  const a = summary.advice;
  return {
    id: summary.adviceId,
    at: iso(summary.issuedAtMs),
    action: a.action,
    lanes: a.lanes,
    reason: a.reason,
    lanesOpen: a.lanesOpen,
    leadMinutes: a.leadMinutes,
    crossesAt: iso(summary.issuedAtMs + a.leadMinutes * MINUTE_MS),
    benefitAt: iso(summary.issuedAtMs + a.atMinutes * MINUTE_MS),
    waitWithout: a.waitWithout,
    waitWith: a.waitWith,
    peakWithoutMinutes: a.peakWithoutMinutes,
    peakWithMinutes: a.peakWithMinutes,
    forecast: a.forecast,
    status: summary.status,
    validUntil: iso(summary.issuedAtMs + ADVICE_RULES.validForMs),
    decision:
      summary.decision === null
        ? null
        : {
            decision: summary.decision.decision,
            reason: summary.decision.reason,
            at: iso(summary.decision.atMs),
          },
    outcomeDue: iso(summary.outcomeDueMs),
    outcome: summary.outcome,
  };
}

/** The 5-minute slot of a time: a checkpoint is reviewed once in each. */
const slotOf = (ms: number) => Math.floor(ms / LANE_ADVICE.reviewEveryMs);

/** The recommendations, decisions and outcomes of a service day, from its log, in order. */
async function adviceCommandsOf(db: Db, cp: CheckpointRow, serviceDay: string) {
  return db
    .select({ atMs: queueCommand.atMs, command: queueCommand.command })
    .from(queueCommand)
    .where(
      and(
        eq(queueCommand.checkpointId, cp.id),
        eq(queueCommand.serviceDay, serviceDay),
        inArray(queueCommand.type, [...ADVICE_COMMANDS]),
      ),
    )
    .orderBy(asc(queueCommand.seq))
    .then((rows) => rows.map((r) => ({ atMs: r.atMs, command: r.command as Command })));
}

/**
 * The latest command of a service day (its time), the lanes open and when they last changed: the
 * day's latest SET_LANES, else what it opened with.
 */
async function dayHeadOf(db: Db, cp: CheckpointRow, serviceDay: string) {
  const [head] = await db
    .select({ atMs: sql<string | null>`max(${queueCommand.atMs})` })
    .from(queueCommand)
    .where(and(eq(queueCommand.checkpointId, cp.id), eq(queueCommand.serviceDay, serviceDay)));
  const [lanes] = await db
    .select({ type: queueCommand.type, atMs: queueCommand.atMs, command: queueCommand.command })
    .from(queueCommand)
    .where(
      and(
        eq(queueCommand.checkpointId, cp.id),
        eq(queueCommand.serviceDay, serviceDay),
        inArray(queueCommand.type, ['SET_LANES', 'OPEN_DAY']),
      ),
    )
    .orderBy(desc(queueCommand.seq))
    .limit(1);
  const command = lanes?.command as Command | undefined;
  return {
    atMs: head?.atMs === null || head?.atMs === undefined ? null : Number(head.atMs),
    lanesOpen:
      command?.type === 'SET_LANES'
        ? command.lanesOpen
        : command?.type === 'OPEN_DAY'
          ? command.config.lanesOpen
          : cp.settings.lanesOpen,
    lanesChangedAtMs: lanes?.type === 'SET_LANES' ? lanes.atMs : null,
  };
}

/** The day's recommendations of a checkpoint, the latest first (S22). */
export async function adviceResponseOf(
  db: Db,
  cp: CheckpointRow,
  nowMs: number,
): Promise<AdviceResponse> {
  const serviceDay = serviceDayNow(cp, nowMs);
  const head = await dayHeadOf(db, cp, serviceDay);
  // A twin's checkpoint: its virtual time, its latest command's.
  const at = cp.settings.twin !== undefined && head.atMs !== null ? head.atMs : nowMs;
  const advices = advicesOfLog(await adviceCommandsOf(db, cp, serviceDay), at);
  return {
    checkpointId: cp.id,
    serviceDay,
    at: iso(at),
    rule: {
      targetWaitMinutes: LANE_ADVICE.targetWaitMs / MINUTE_MS,
      closeBelowMinutes: LANE_ADVICE.closeBelowWaitMs / MINUTE_MS,
      reviewEveryMinutes: LANE_ADVICE.reviewEveryMs / MINUTE_MS,
      cooldownMinutes: ADVICE_RULES.cooldownMs / MINUTE_MS,
      postponeMinutes: ADVICE_RULES.postponeMs / MINUTE_MS,
      validForMinutes: ADVICE_RULES.validForMs / MINUTE_MS,
    },
    advices: advices.map(adviceOf).reverse(),
  };
}

/** The median of durations, each counted once per person. */
function medianPerPerson(waits: readonly { readonly ms: number; readonly people: number }[]) {
  const values: number[] = [];
  for (const w of waits) for (let i = 0; i < w.people; i++) values.push(w.ms);
  if (values.length === 0) return null;
  values.sort((a, b) => a - b);
  const mid = (values.length - 1) / 2;
  return ((values[Math.floor(mid)] ?? 0) + (values[Math.ceil(mid)] ?? 0)) / 2;
}

/** GateFlow's reviews of the lanes (S22): recommendations and their outcomes, in the log. */
export class LaneAdvisor {
  private timer: ReturnType<typeof setInterval> | undefined;
  private running: Promise<number> | null = null;
  /** The slot each checkpoint was last reviewed in, by this server. */
  private readonly reviewed = new Map<string, number>();
  /** The earliest outcome due at each checkpoint, as this server last read it. */
  private readonly dueAt = new Map<string, number>();

  constructor(
    private readonly db: Db,
    private readonly runtime: Runtime,
    private readonly profiles: ProfileCache,
    private readonly clock: Clock,
    private readonly ids: Ids,
  ) {}

  /** Starts the passes, one every 30 seconds. */
  start(onError: (error: unknown) => void): void {
    this.timer = setInterval(() => {
      this.tick().catch(onError);
    }, PASS_MS);
    this.timer.unref();
  }

  /** Stops the passes and waits for the one running, if any. */
  async stop(): Promise<void> {
    clearInterval(this.timer);
    this.timer = undefined;
    await this.running?.catch(() => undefined);
  }

  /**
   * One pass over the checkpoints with a scenario (a twin's checkpoint is its runner's): a review
   * in each new 5-minute slot, and the outcomes due. Returns the recommendations made.
   */
  async tick(): Promise<number> {
    if (this.running !== null) return 0;
    this.running = this.pass();
    try {
      return await this.running;
    } finally {
      this.running = null;
    }
  }

  private async pass(): Promise<number> {
    const now = this.clock.now();
    const rows = await this.db
      .select({ id: checkpoint.id })
      .from(checkpoint)
      .where(
        and(
          isNotNull(sql`${checkpoint.settings}->>'scenarioHash'`),
          sql`${checkpoint.settings}->'twin' IS NULL`,
        ),
      );
    let made = 0;
    for (const row of rows) {
      if ((await this.atTime(row.id, now)) !== null) made++;
    }
    return made;
  }

  /**
   * What a twin's runner calls after each command of its virtual day (S18): the outcomes due by
   * then, and a review when the command is the first of a new 5-minute slot.
   */
  async atVirtualTime(checkpointId: string, atMs: number): Promise<void> {
    await this.atTime(checkpointId, atMs);
  }

  /** The outcomes due and a review in a new slot; nothing to read when neither is due. */
  private async atTime(checkpointId: string, atMs: number): Promise<AdviceSummary | null> {
    const review = this.reviewed.get(checkpointId) !== slotOf(atMs);
    const due = this.dueAt.get(checkpointId);
    if (!review && (due === undefined || atMs < due)) return null;
    const cp = await loadCheckpoint(this.db, checkpointId);
    await this.outcomes(cp, atMs);
    return review ? this.review(cp, atMs) : null;
  }

  /**
   * Reviews a checkpoint now (a twin's at its virtual time): a recommendation in the log when the
   * rule makes one and the day allows it, else null. A day not open yet is left alone.
   */
  async review(cp: CheckpointRow, nowMs: number): Promise<AdviceSummary | null> {
    if (cp.settings.scenarioHash === undefined) return null;
    this.reviewed.set(cp.id, slotOf(nowMs));
    const serviceDay = serviceDayNow(cp, nowMs);
    const head = await dayHeadOf(this.db, cp, serviceDay);
    if (head.atMs === null) return null;
    let entry: ProfileEntry;
    try {
      entry = await profileOfCheckpoint(this.db, this.profiles, cp);
    } catch (error) {
      if (error instanceof ApiError && error.code === 'NO_SCENARIO') return null;
      throw error;
    }
    // In the scenario's clock: milliseconds since the local midnight of the service day.
    const midnight = zonedEpoch(serviceDay, 0, cp.timeZone);
    const twin = cp.settings.twin !== undefined;
    const lanesChangedAtMs =
      head.lanesChangedAtMs === null ? null : head.lanesChangedAtMs - midnight;
    // No lane to open and none to close: nothing to forecast.
    const local = (twin ? head.atMs : nowMs) - midnight;
    const possible = laneChangePossible(
      entry.profile,
      { nowMs: local, lanesOpen: head.lanesOpen },
      lanesChangedAtMs,
    );
    if (!possible) return null;
    const input = await liveForecastInput(this.db, this.profiles, cp, nowMs);
    const advice = adviseLanes(input.entry.profile, input.state, {
      calibration: LIBRARY_CALIBRATION,
      lanesChangedAtMs,
    });
    if (advice === null) return null;
    const record = adviceRecordOf(advice);
    const key = `advice:${serviceDay}:${String(input.at)}`;
    const executed = await this.runtime.execute({
      checkpointId: cp.id,
      idempotencyKey: key,
      requestHash: sha256(key),
      actor: 'system:advisor',
      // A twin's checkpoint: at the virtual time the forecast read, never before its last command.
      ...(twin ? { atMs: Math.max(input.at, head.atMs) } : {}),
      build: ({ day, atMs }) =>
        day.config.serviceDay === serviceDay && day.canAdvise(atMs)
          ? { type: 'ADVISE_LANES', adviceId: this.ids.uuid(), advice: record }
          : null,
    });
    if (executed.result?.type !== 'ADVISED') return null;
    const made = executed.result.advice;
    const due = this.dueAt.get(cp.id);
    this.dueAt.set(cp.id, Math.min(due ?? Infinity, made.outcomeDueMs));
    return made;
  }

  /**
   * Records the outcomes due: the lanes open, the people not yet admitted, and the median wait
   * of the people admitted in the 15 minutes after the time each recommendation spoke of.
   */
  async outcomes(cp: CheckpointRow, nowMs: number): Promise<number> {
    const serviceDay = serviceDayNow(cp, nowMs);
    const advices = advicesOfLog(await adviceCommandsOf(this.db, cp, serviceDay), nowMs);
    const due = advices.filter((a) => a.outcome === null && a.outcomeDueMs <= nowMs);
    const later = advices.filter((a) => a.outcome === null && a.outcomeDueMs > nowMs);
    if (later.length === 0) this.dueAt.delete(cp.id);
    else this.dueAt.set(cp.id, Math.min(...later.map((a) => a.outcomeDueMs)));
    if (due.length === 0) return 0;
    const input = await liveForecastInput(this.db, this.profiles, cp, nowMs);
    const twin = cp.settings.twin !== undefined;
    let recorded = 0;
    for (const advice of due) {
      const from = advice.outcomeDueMs - ADVICE_RULES.outcomeAfterMs;
      const admitted = input.live.rows
        .filter(
          (r) =>
            r.admittedAtMs !== null &&
            r.admittedAtMs >= from &&
            r.admittedAtMs < advice.outcomeDueMs,
        )
        .map((r) => ({ ms: (r.admittedAtMs ?? 0) - r.presentedAtMs, people: r.partySize }));
      const median = medianPerPerson(admitted);
      const key = `outcome:${advice.adviceId}`;
      const executed = await this.runtime.execute({
        checkpointId: cp.id,
        idempotencyKey: key,
        requestHash: sha256(key),
        actor: 'system:advisor',
        ...(twin ? { atMs: Math.max(nowMs, input.at) } : {}),
        build: ({ day }) =>
          day.config.serviceDay === serviceDay
            ? {
                type: 'RECORD_OUTCOME',
                adviceId: advice.adviceId,
                outcome: {
                  lanesOpen: input.state.lanesOpen,
                  backlog: input.state.backlog,
                  waitMinutes: median === null ? null : tenth(median / MINUTE_MS),
                  admitted: admitted.reduce((n, a) => n + a.people, 0),
                },
              }
            : null,
      });
      if (executed.result?.type === 'OUTCOME_RECORDED') recorded++;
    }
    return recorded;
  }
}
