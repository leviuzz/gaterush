import { and, desc, eq, gt, inArray, lte, sql } from 'drizzle-orm';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { DisplayCall, DisplayMessage } from '@gateflow/contracts';
import type { Board } from '@gateflow/operations';
import type { CheckpointMode } from '@gateflow/queue-core';
import type { Db } from './db/client';
import { displayBoard, queueEvent, queueToken } from './db/schema';

/*
 * The streams of a checkpoint (S16, ADR-047): displays and lane stations follow its queue by
 * server-sent events. The server that applies a command tells its streams at once; every second
 * the hub also reads the sequence number of each checkpoint followed, so that the streams of every
 * server see the commands of the others. A stream's messages carry the sequence number of the log
 * as their id: a client that reconnects sends it back (`Last-Event-ID`) and misses nothing.
 */

/** How often a stream says it is alive, and checks that its client may still follow it. */
export const HEARTBEAT_MS = 10_000;
/** How often the hub reads the sequence numbers that other servers may have moved. */
export const POLL_MS = 1_000;
/** The most calls a message carries: a display away for long gets the latest ones. */
export const MAX_CALLS = 100;

type Listener = (seq: number) => void;

/** Who follows which checkpoint, on this server. */
export class StreamHub {
  private readonly followers = new Map<string, Set<Listener>>();
  /** The latest sequence number known of each checkpoint followed. */
  private readonly seen = new Map<string, number>();
  private readonly streams = new Set<EventStream>();
  private timer: NodeJS.Timeout | undefined;

  constructor(
    private readonly db: Db,
    private readonly pollMs = POLL_MS,
  ) {}

  /** A command of the checkpoint was committed, at `seq`: its streams send what changed. */
  changed(checkpointId: string, seq: number): void {
    if (seq <= (this.seen.get(checkpointId) ?? 0)) return;
    this.seen.set(checkpointId, seq);
    for (const listener of this.followers.get(checkpointId) ?? []) listener(seq);
  }

  /** Calls `listener` with each new sequence number of the checkpoint, until the stop is called. */
  follow(checkpointId: string, listener: Listener): () => void {
    let set = this.followers.get(checkpointId);
    if (set === undefined) {
      set = new Set();
      this.followers.set(checkpointId, set);
    }
    set.add(listener);
    return () => {
      set.delete(listener);
      if (set.size === 0) {
        this.followers.delete(checkpointId);
        this.seen.delete(checkpointId);
      }
    };
  }

  /** Keeps a stream, to end it when the server stops. */
  keep(stream: EventStream): () => void {
    this.streams.add(stream);
    return () => this.streams.delete(stream);
  }

  /** Reads, every second, the sequence numbers other servers may have moved. */
  start(onError: (error: unknown) => void): void {
    if (this.timer !== undefined) return;
    this.timer = setInterval(() => {
      this.poll().catch(onError);
    }, this.pollMs);
    this.timer.unref();
  }

  /** Stops reading, and ends every stream. */
  stop(): void {
    if (this.timer !== undefined) clearInterval(this.timer);
    this.timer = undefined;
    for (const stream of this.streams) stream.close();
    this.streams.clear();
  }

  /** The latest sequence number of every checkpoint followed. */
  async poll(): Promise<void> {
    const ids = [...this.followers.keys()];
    if (ids.length === 0) return;
    const rows = await this.db
      .select({ checkpointId: displayBoard.checkpointId, seq: displayBoard.seq })
      .from(displayBoard)
      .where(inArray(displayBoard.checkpointId, ids));
    for (const row of rows) this.changed(row.checkpointId, row.seq);
  }
}

/** A response of server-sent events. */
export class EventStream {
  private ended = false;
  private readonly cleanups: (() => void)[] = [];

  constructor(private readonly reply: FastifyReply) {
    reply.hijack();
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      // A proxy in front must pass each message on at once.
      'X-Accel-Buffering': 'no',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
    });
    // How long a client waits before it reconnects.
    reply.raw.write('retry: 3000\n\n');
    reply.raw.on('close', () => {
      this.close();
    });
  }

  get closed(): boolean {
    return this.ended;
  }

  /** Runs `cleanup` when the stream ends, whoever ends it. */
  onClose(cleanup: () => void): void {
    if (this.ended) cleanup();
    else this.cleanups.push(cleanup);
  }

  /** Sends one message: its event name, its data as JSON and, if given, its id. */
  send(event: string, data: unknown, id?: number): void {
    if (this.ended) return;
    const head = id === undefined ? '' : `id: ${String(id)}\n`;
    this.reply.raw.write(`${head}event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  }

  close(): void {
    if (this.ended) return;
    this.ended = true;
    for (const cleanup of this.cleanups.splice(0)) cleanup();
    this.reply.raw.end();
  }
}

/** The `Last-Event-ID` of a reconnection: a sequence number of the log, or null. */
export function lastEventIdOf(request: FastifyRequest): number | null {
  const header = request.headers['last-event-id'];
  const value = Array.isArray(header) ? header[0] : header;
  if (value === undefined || !/^\d{1,15}$/.test(value)) return null;
  return Number(value);
}

/** The board of a checkpoint, as written with its latest command. */
export async function boardOf(db: Db, checkpointId: string) {
  const rows = await db
    .select()
    .from(displayBoard)
    .where(eq(displayBoard.checkpointId, checkpointId));
  const row = rows[0];
  if (row === undefined) return undefined;
  // A board written before S17 has no mode: the checkpoint was NORMAL.
  const board = row.board as Omit<Board, 'mode'> & { readonly mode?: CheckpointMode };
  return { ...row, board: { ...board, mode: board.mode ?? 'NORMAL' } satisfies Board };
}

/**
 * The mode of a checkpoint (S17), as of its latest command: NORMAL before its first. A new service
 * day opens in the mode the previous one ended in, so the latest board's mode holds across days.
 */
export async function modeOf(db: Db, checkpointId: string): Promise<CheckpointMode> {
  return (await boardOf(db, checkpointId))?.board.mode ?? 'NORMAL';
}

const iso = (ms: number) => new Date(ms).toISOString();

/**
 * The calls of a service day after the command `afterSeq` and up to `uptoSeq`, oldest first: the
 * latest `MAX_CALLS` of them.
 */
export async function callsBetween(
  db: Db,
  checkpointId: string,
  serviceDay: string,
  afterSeq: number,
  uptoSeq: number,
): Promise<DisplayCall[]> {
  if (uptoSeq <= afterSeq) return [];
  const rows = await db
    .select({ type: queueEvent.type, atMs: queueEvent.atMs, number: queueToken.number })
    .from(queueEvent)
    .innerJoin(queueToken, eq(queueToken.id, queueEvent.ticketId))
    .where(
      and(
        eq(queueEvent.checkpointId, checkpointId),
        gt(queueEvent.commandSeq, afterSeq),
        lte(queueEvent.commandSeq, uptoSeq),
        inArray(queueEvent.type, ['CALLED', 'RECALLED']),
        eq(queueToken.serviceDay, serviceDay),
      ),
    )
    .orderBy(desc(queueEvent.seq))
    .limit(MAX_CALLS);
  return rows
    .reverse()
    .map((r) => ({ number: r.number, second: r.type === 'RECALLED', at: iso(r.atMs) }));
}

/**
 * A display's message: the board after the command `seq` and the calls given. A board of another
 * service day than `today` is shown empty: yesterday's numbers are not today's.
 */
export function displayMessageOf(
  row: { seq: number; serviceDay: string; atMs: number; board: Board } | undefined,
  calls: DisplayCall[],
  today: string,
  nowMs: number,
): DisplayMessage {
  if (row?.serviceDay !== today) {
    return {
      seq: row?.seq ?? 0,
      board: {
        serviceDay: today,
        called: [],
        prepare: [],
        // The day opens in the mode the previous one ended in (S17).
        mode: row?.board.mode ?? 'NORMAL',
        updatedAt: iso(row?.atMs ?? nowMs),
      },
      calls: [],
    };
  }
  return {
    seq: row.seq,
    board: {
      serviceDay: row.serviceDay,
      called: row.board.called.map((c) => ({
        number: c.number,
        second: c.second,
        at: iso(c.calledAtMs),
      })),
      prepare: [...row.board.prepare],
      mode: row.board.mode,
      updatedAt: iso(row.atMs),
    },
    calls,
  };
}

/** The sequence number of a checkpoint's latest command, 0 before its first. */
export async function seqOf(db: Db, checkpointId: string): Promise<number> {
  const rows = await db
    .select({ seq: sql<string | null>`max(${displayBoard.seq})` })
    .from(displayBoard)
    .where(eq(displayBoard.checkpointId, checkpointId));
  return Number(rows[0]?.seq ?? 0);
}
