import { and, asc, eq, gt, lte } from 'drizzle-orm';
import { GENESIS_HASH, chainHash } from './chain';
import type { ChainEvent } from './chain';
import type { Db } from './db/client';
import { queueCommand, queueEvent } from './db/schema';

const PAGE = 500;

export interface ChainCheck {
  readonly commands: number;
  readonly events: number;
  readonly intact: boolean;
  readonly firstBrokenSeq: number | null;
  readonly headHash: string | null;
}

/**
 * Recomputes the chain of hashes of a checkpoint's log, command by command, with every event of
 * each command. Any row changed, removed or inserted since it was written breaks the chain at the
 * first command it touches.
 */
export async function verifyChain(db: Db, checkpointId: string): Promise<ChainCheck> {
  let previous = GENESIS_HASH;
  let commands = 0;
  let events = 0;
  let firstBrokenSeq: number | null = null;
  let headHash: string | null = null;
  let after = 0;
  for (;;) {
    const rows = await db
      .select()
      .from(queueCommand)
      .where(and(eq(queueCommand.checkpointId, checkpointId), gt(queueCommand.seq, after)))
      .orderBy(asc(queueCommand.seq))
      .limit(PAGE);
    const last = rows[rows.length - 1];
    if (last === undefined) break;
    const eventRows = await db
      .select()
      .from(queueEvent)
      .where(
        and(
          eq(queueEvent.checkpointId, checkpointId),
          gt(queueEvent.commandSeq, after),
          lte(queueEvent.commandSeq, last.seq),
        ),
      )
      .orderBy(asc(queueEvent.seq));
    const byCommand = new Map<number, ChainEvent[]>();
    for (const e of eventRows) {
      const list = byCommand.get(e.commandSeq) ?? [];
      list.push({
        seq: e.seq,
        type: e.type,
        atMs: e.atMs,
        ticketId: e.ticketId,
        payload: e.payload,
      });
      byCommand.set(e.commandSeq, list);
    }
    for (const row of rows) {
      commands++;
      const ownEvents = byCommand.get(row.seq) ?? [];
      events += ownEvents.length;
      const expected = chainHash(previous, {
        checkpointId,
        seq: row.seq,
        serviceDay: row.serviceDay,
        type: row.type,
        atMs: row.atMs,
        command: row.command,
        result: row.result,
        idempotencyKey: row.idempotencyKey,
        requestHash: row.requestHash,
        actor: row.actor,
        events: ownEvents,
      });
      const consistent = row.seq === commands && row.prevHash === previous && row.hash === expected;
      if (!consistent && firstBrokenSeq === null) firstBrokenSeq = row.seq;
      previous = row.hash;
      headHash = row.hash;
    }
    after = last.seq;
  }
  return { commands, events, intact: firstBrokenSeq === null, firstBrokenSeq, headHash };
}
