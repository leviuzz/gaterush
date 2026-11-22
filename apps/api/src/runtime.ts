import { and, asc, desc, eq, gt, sql } from 'drizzle-orm';
import { CheckpointDay } from '@gateflow/operations';
import type {
  Applied,
  Command,
  CommandRecord,
  CommandResult,
  DayConfig,
} from '@gateflow/operations';
import type { CheckpointMode, Policy } from '@gateflow/queue-core';
import { arrivalClassification } from '@gateflow/sim-metrics';
import { GENESIS_HASH, chainHash, sha256 } from './chain';
import type { ChainEvent } from './chain';
import type { Db, Tx } from './db/client';
import {
  admission,
  airport,
  checkpoint,
  checkpointTimer,
  displayBoard,
  partyPass,
  queueCommand,
  queueEvent,
  queueToken,
} from './db/schema';
import type { CheckpointSettings } from './db/schema';
import { serviceDayOf } from './time';
import type { Clock } from './time';

/** An error with its HTTP status and a stable code for clients. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** A checkpoint with what its commands need. */
export interface CheckpointRow {
  readonly id: string;
  readonly airportId: string;
  readonly name: string;
  readonly ticketPrefix: string;
  readonly lockKey: number;
  readonly dayStartsAt: string;
  readonly settings: CheckpointSettings;
  readonly timeZone: string;
  /** IATA code of the airport, matched with boarding passes. */
  readonly iata: string;
}

/** What `build` receives: the open day, under the checkpoint's lock. */
export interface BuildContext {
  readonly tx: Tx;
  readonly checkpoint: CheckpointRow;
  readonly day: CheckpointDay;
  readonly atMs: number;
}

export interface CommandRequest {
  readonly checkpointId: string;
  readonly idempotencyKey: string;
  readonly requestHash: string;
  readonly actor: string;
  /**
   * Builds the command once the day is current (e.g. finds the ticket of a number), or gives null
   * when there is nothing to apply (a boarding pass scanned again finds its ticket).
   */
  readonly build: (context: BuildContext) => Promise<Command | null> | Command | null;
}

export interface Executed {
  /** What the command did; null when `build` found nothing to apply. */
  readonly result: CommandResult | null;
  readonly seq: number;
  /** True when the idempotency key was known: the first answer, applied once. */
  readonly replayed: boolean;
  readonly checkpoint: CheckpointRow;
}

/** The day of a checkpoint held in memory, in step with the log up to `seq`. */
interface Memory {
  day: CheckpointDay | null;
  seq: number;
  hash: string;
  eventSeq: number;
  lastAtMs: number;
}

function toRecord(row: { seq: number; atMs: number; command: unknown }): CommandRecord {
  return { seq: row.seq, atMs: row.atMs, command: row.command as Command };
}

/**
 * The configuration of a day from the checkpoint's settings: recorded in the day's log. The day
 * opens in the mode the previous day ended in (S17): an emergency goes on across midnight.
 */
export function dayConfigOf(
  cp: CheckpointRow,
  serviceDay: string,
  mode: CheckpointMode = 'NORMAL',
): DayConfig {
  const policy = cp.settings.policy as Policy;
  return {
    checkpointId: cp.id,
    serviceDay,
    ticketPrefix: cp.ticketPrefix,
    policy,
    classification: arrivalClassification([policy]),
    lanesOpen: cp.settings.lanesOpen,
    ratePerLanePerHour: cp.settings.ratePerLanePerHour,
    processEstimateMs: cp.settings.processEstimateMs,
    ...(mode === 'NORMAL' ? {} : { mode }),
  };
}

export async function loadCheckpoint(db: Db | Tx, checkpointId: string): Promise<CheckpointRow> {
  const rows = await db
    .select({
      id: checkpoint.id,
      airportId: checkpoint.airportId,
      name: checkpoint.name,
      ticketPrefix: checkpoint.ticketPrefix,
      lockKey: checkpoint.lockKey,
      dayStartsAt: checkpoint.dayStartsAt,
      settings: checkpoint.settings,
      timeZone: airport.timeZone,
      iata: airport.iata,
    })
    .from(checkpoint)
    .innerJoin(airport, eq(airport.id, checkpoint.airportId))
    .where(eq(checkpoint.id, checkpointId));
  const row = rows[0];
  if (row === undefined) throw new ApiError(404, 'UNKNOWN_CHECKPOINT', 'no such checkpoint');
  return row;
}

/**
 * The single writer of every checkpoint (ADR-042). A command runs in one transaction that holds
 * the checkpoint's advisory lock: it brings the day in memory up to the log (commands written by
 * another server included), applies the command to the queue and writes the command, its events,
 * the tickets it changed and any admission, chained to the previous command by a hash. If
 * anything fails, the transaction is rolled back and the day in memory is dropped: the next
 * command rebuilds it from the log.
 */
export class Runtime {
  private readonly memory = new Map<string, Memory>();
  /** Told the sequence number of each command committed, after its transaction (S16). */
  onCommitted: ((checkpointId: string, seq: number) => void) | undefined;

  constructor(
    private readonly db: Db,
    private readonly clock: Clock,
  ) {}

  async execute(request: CommandRequest): Promise<Executed> {
    let executed: Executed;
    try {
      executed = await this.db.transaction((tx) => this.run(tx, request));
    } catch (error) {
      this.memory.delete(request.checkpointId);
      throw error;
    }
    if (!executed.replayed) this.onCommitted?.(request.checkpointId, executed.seq);
    return executed;
  }

  /** Forgets every day held in memory (as after a restart). */
  forget(): void {
    this.memory.clear();
  }

  private async run(tx: Tx, request: CommandRequest): Promise<Executed> {
    const cp = await loadCheckpoint(tx, request.checkpointId);
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${cp.lockKey})`);
    const known = await tx
      .select({
        seq: queueCommand.seq,
        result: queueCommand.result,
        hash: queueCommand.requestHash,
      })
      .from(queueCommand)
      .where(
        and(
          eq(queueCommand.checkpointId, cp.id),
          eq(queueCommand.idempotencyKey, request.idempotencyKey),
        ),
      );
    const previous = known[0];
    if (previous !== undefined) {
      if (previous.hash !== request.requestHash) {
        throw new ApiError(
          409,
          'IDEMPOTENCY_CONFLICT',
          'this Idempotency-Key was used for another request',
        );
      }
      return {
        result: previous.result as CommandResult,
        seq: previous.seq,
        replayed: true,
        checkpoint: cp,
      };
    }
    const memory = await this.sync(tx, cp);
    // The log never goes back in time, even if this server's clock does.
    const atMs = Math.max(this.clock.now(), memory.lastAtMs);
    const serviceDay = serviceDayOf(atMs, cp.timeZone, cp.dayStartsAt);
    let day = memory.day;
    if (day?.config.serviceDay !== serviceDay) {
      const record: CommandRecord = {
        seq: memory.seq + 1,
        atMs,
        command: { type: 'OPEN_DAY', config: dayConfigOf(cp, serviceDay, day?.mode) },
      };
      const opened = CheckpointDay.open(record);
      day = opened.day;
      memory.day = day;
      await this.write(tx, cp, memory, day, record, opened.applied, {
        idempotencyKey: `open-day:${serviceDay}`,
        requestHash: sha256(`open-day:${serviceDay}`),
        actor: 'system',
      });
    }
    const command = await request.build({ tx, checkpoint: cp, day, atMs });
    if (command === null) return { result: null, seq: memory.seq, replayed: false, checkpoint: cp };
    const record: CommandRecord = { seq: memory.seq + 1, atMs, command };
    const applied = day.apply(record);
    await this.write(tx, cp, memory, day, record, applied, request);
    return { result: applied.result, seq: record.seq, replayed: false, checkpoint: cp };
  }

  /** Brings the checkpoint's day in memory in step with its log. */
  private async sync(tx: Tx, cp: CheckpointRow): Promise<Memory> {
    const heads = await tx
      .select({
        seq: queueCommand.seq,
        hash: queueCommand.hash,
        serviceDay: queueCommand.serviceDay,
        atMs: queueCommand.atMs,
      })
      .from(queueCommand)
      .where(eq(queueCommand.checkpointId, cp.id))
      .orderBy(desc(queueCommand.seq))
      .limit(1);
    const head = heads[0];
    const headSeq = head?.seq ?? 0;
    const known = this.memory.get(cp.id);
    if (known !== undefined && known.seq === headSeq) return known;
    const eventSeq = async () => {
      const rows = await tx
        .select({ seq: sql<string | null>`max(${queueEvent.seq})` })
        .from(queueEvent)
        .where(eq(queueEvent.checkpointId, cp.id));
      return Number(rows[0]?.seq ?? 0);
    };
    // Commands another server wrote on the same day: apply them.
    if (known?.day && head !== undefined && known.seq < headSeq) {
      const missing = await tx
        .select({
          seq: queueCommand.seq,
          atMs: queueCommand.atMs,
          command: queueCommand.command,
          serviceDay: queueCommand.serviceDay,
        })
        .from(queueCommand)
        .where(and(eq(queueCommand.checkpointId, cp.id), gt(queueCommand.seq, known.seq)))
        .orderBy(asc(queueCommand.seq));
      const sameDay = known.day.config.serviceDay;
      if (missing.every((row) => row.serviceDay === sameDay)) {
        for (const row of missing) known.day.apply(toRecord(row));
        known.seq = headSeq;
        known.hash = head.hash;
        known.lastAtMs = head.atMs;
        known.eventSeq = await eventSeq();
        return known;
      }
    }
    // Otherwise rebuild the latest day from its log, from OPEN_DAY.
    const memory: Memory = {
      day: null,
      seq: headSeq,
      hash: head?.hash ?? GENESIS_HASH,
      eventSeq: await eventSeq(),
      lastAtMs: head?.atMs ?? 0,
    };
    if (head !== undefined) {
      const rows = await tx
        .select({ seq: queueCommand.seq, atMs: queueCommand.atMs, command: queueCommand.command })
        .from(queueCommand)
        .where(
          and(eq(queueCommand.checkpointId, cp.id), eq(queueCommand.serviceDay, head.serviceDay)),
        )
        .orderBy(asc(queueCommand.seq));
      memory.day = CheckpointDay.replay(rows.map(toRecord));
    }
    this.memory.set(cp.id, memory);
    return memory;
  }

  /** Writes a command, its events, the tickets it changed and any admission. */
  private async write(
    tx: Tx,
    cp: CheckpointRow,
    memory: Memory,
    day: CheckpointDay,
    record: CommandRecord,
    applied: Applied,
    meta: { readonly idempotencyKey: string; readonly requestHash: string; readonly actor: string },
  ): Promise<void> {
    const events: ChainEvent[] = applied.events.map((event, i) => ({
      seq: memory.eventSeq + 1 + i,
      type: event.type,
      atMs: event.atMs,
      ticketId: 'ticketId' in event ? event.ticketId : null,
      payload: event,
    }));
    const serviceDay = day.config.serviceDay;
    const hash = chainHash(memory.hash, {
      checkpointId: cp.id,
      seq: record.seq,
      serviceDay,
      type: record.command.type,
      atMs: record.atMs,
      command: record.command,
      result: applied.result,
      idempotencyKey: meta.idempotencyKey,
      requestHash: meta.requestHash,
      actor: meta.actor,
      events,
    });
    await tx.insert(queueCommand).values({
      checkpointId: cp.id,
      seq: record.seq,
      serviceDay,
      type: record.command.type,
      atMs: record.atMs,
      command: record.command,
      result: applied.result,
      idempotencyKey: meta.idempotencyKey,
      requestHash: meta.requestHash,
      actor: meta.actor,
      prevHash: memory.hash,
      hash,
    });
    if (events.length > 0) {
      await tx.insert(queueEvent).values(
        events.map((e) => ({
          checkpointId: cp.id,
          seq: e.seq,
          commandSeq: record.seq,
          type: e.type,
          atMs: e.atMs,
          ticketId: e.ticketId,
          payload: e.payload,
        })),
      );
    }
    const result = applied.result;
    const issued = result.type === 'TICKET_ISSUED' ? result.ticket.ticketId : null;
    if (result.type === 'TICKET_ISSUED') {
      const t = result.ticket;
      await tx.insert(queueToken).values({
        id: t.ticketId,
        checkpointId: cp.id,
        serviceDay,
        number: t.number,
        opaqueRef: result.opaqueRef,
        source: t.source,
        flightId: t.flightId,
        segment: t.segment,
        partySize: t.partySize,
        state: day.ticket(t.ticketId)?.state ?? t.state,
        riskClass: t.riskClass,
        priority: t.priority,
        overridden: t.overridden,
        calls: t.calls,
        issuedAtMs: t.issuedAtMs,
        firstCalledAtMs: t.firstCalledAtMs,
        lastCalledAtMs: t.lastCalledAtMs,
        admittedAtMs: t.admittedAtMs,
        updatedSeq: record.seq,
        dedupKey: record.command.type === 'ISSUE_TICKET' ? record.command.dedupKey : null,
      });
    }
    const touched = new Set(
      events.flatMap((e) => (e.ticketId === null || e.ticketId === issued ? [] : [e.ticketId])),
    );
    for (const ticketId of touched) {
      const t = day.ticket(ticketId);
      if (t === undefined) continue;
      await tx
        .update(queueToken)
        .set({
          state: t.state,
          riskClass: t.riskClass,
          priority: t.priority,
          overridden: t.overridden,
          calls: t.calls,
          partySize: t.partySize,
          firstCalledAtMs: t.firstCalledAtMs,
          lastCalledAtMs: t.lastCalledAtMs,
          admittedAtMs: t.admittedAtMs,
          updatedSeq: record.seq,
        })
        .where(eq(queueToken.id, ticketId));
    }
    // A pass that joined a party: its rescans find the party's ticket (S15).
    const command = record.command;
    if (
      command.type === 'ADD_TO_PARTY' &&
      command.dedupKey !== null &&
      result.type === 'ACTED' &&
      result.outcome === 'DONE'
    ) {
      await tx.insert(partyPass).values({
        checkpointId: cp.id,
        dedupKey: command.dedupKey,
        ticketId: command.ticketId,
        commandSeq: record.seq,
        atMs: record.atMs,
      });
    }
    for (const event of applied.events) {
      if (event.type !== 'ADMITTED' || record.command.type !== 'PRESENT') continue;
      await tx.insert(admission).values({
        tokenId: event.ticketId,
        checkpointId: cp.id,
        atMs: event.atMs,
        method: record.command.method,
        commandSeq: record.seq,
      });
    }
    // When the day's next timeout is due, for the scheduler (S15).
    const timer = { serviceDay, nextDueMs: day.nextDueMs(), updatedSeq: record.seq };
    await tx
      .insert(checkpointTimer)
      .values({ checkpointId: cp.id, ...timer })
      .onConflictDoUpdate({ target: checkpointTimer.checkpointId, set: timer });
    // What the displays show, at this command (S16).
    const board = { serviceDay, seq: record.seq, atMs: record.atMs, board: day.board() };
    await tx
      .insert(displayBoard)
      .values({ checkpointId: cp.id, ...board })
      .onConflictDoUpdate({ target: displayBoard.checkpointId, set: board });
    memory.seq = record.seq;
    memory.hash = hash;
    memory.eventSeq += events.length;
    memory.lastAtMs = record.atMs;
  }
}
