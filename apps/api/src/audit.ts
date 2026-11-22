import { and, asc, desc, eq, inArray, lt, or, sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import type { AuditEntry, AuditResponse } from '@gateflow/contracts';
import type { Command, CommandResult } from '@gateflow/operations';
import type { Db } from './db/client';
import { device, queueCommand, queueEvent, queueToken, staffUser } from './db/schema';
import { policyHash } from './policies';
import type { CheckpointRow } from './runtime';

/*
 * The audit view of a checkpoint (S17, ADR-050): its log for one service day, the latest command
 * first, as people read it. Who (a member's login, a kiosk's name, or GateFlow itself), what (the
 * command, its outcome and the tickets its events changed), when, and why (the coded reason of an
 * override or a manual ticket). Only what a supervisor may see: never a ticket's reference, never
 * the HMAC of a boarding pass. The chain of hashes is checked by `/audit/verify`.
 */

/** The most entries of one page. */
export const AUDIT_PAGE = 50;

const iso = (ms: number) => new Date(ms).toISOString();

/** The outcome of a command, in one word. */
function outcomeOf(result: CommandResult): string | null {
  switch (result.type) {
    case 'DAY_OPENED':
      return 'OPENED';
    case 'TICKET_ISSUED':
      return 'ISSUED';
    case 'CALLED':
      return result.ticket === null ? 'NOBODY_WAITING' : 'CALLED';
    case 'PRESENTED':
      return result.outcome;
    case 'ADVANCED':
      return null;
    case 'ACTED':
    case 'MODE_SET':
    case 'OVERRIDDEN':
      return result.outcome;
    case 'LANES_SET':
    case 'FLIGHT_UPDATED':
      return 'DONE';
    // GateFlow's recommendations (S22): what it advised, what was decided, the outcome.
    case 'ADVISED':
      return result.advice.advice.action;
    case 'ADVICE_DECIDED':
      return result.advice.decision?.decision ?? null;
    case 'OUTCOME_RECORDED':
      return 'RECORDED';
  }
}

/** The ticket a command names, by its id: the one it acts on, or the one it issued. */
function ticketIdOf(command: Command, result: CommandResult): string | null {
  if ('ticketId' in command) return command.ticketId;
  if (result.type === 'CALLED') return result.ticket?.ticketId ?? null;
  return null;
}

/** What else a command carries that people need to read it: coded values only. */
function detailOf(command: Command, result: CommandResult): AuditEntry['detail'] {
  switch (command.type) {
    case 'OPEN_DAY':
      return {
        policy: `${command.config.policy.id} ${command.config.policy.version} (${policyHash(command.config.policy).slice(0, 12)})`,
        lanesOpen: command.config.lanesOpen,
        ...(command.config.mode === undefined ? {} : { mode: command.config.mode }),
      };
    case 'SET_MODE':
      return {
        mode: command.mode,
        reset: command.reset,
        ...(result.type === 'MODE_SET' ? { previous: result.previous } : {}),
      };
    case 'SET_LANES':
      return {
        lanesOpen: command.lanesOpen,
        ...(result.type === 'LANES_SET' ? { previousLanes: result.previous } : {}),
      };
    case 'OVERRIDE':
      return { override: command.override };
    case 'UPDATE_FLIGHT':
      return result.type === 'FLIGHT_UPDATED' ? { tickets: result.tickets } : {};
    case 'ISSUE_TICKET':
      return { source: command.source, partySize: command.partySize };
    case 'PRESENT':
      return { method: command.method };
    case 'ADD_TO_PARTY':
      return { people: command.people };
    case 'RESOLVE_REVIEW':
      return { decision: command.decision };
    case 'ADVISE_LANES':
      return {
        action: command.advice.action,
        lanes: command.advice.lanes,
        lanesOpen: command.advice.lanesOpen,
        leadMinutes: command.advice.leadMinutes,
      };
    case 'DECIDE_ADVICE':
      return { decision: command.decision };
    case 'RECORD_OUTCOME':
      return { lanesOpen: command.outcome.lanesOpen };
    case 'CALL_NEXT':
    case 'ADVANCE':
    case 'RECALL':
    case 'MARK_NO_SHOW':
    case 'REACTIVATE':
    case 'HOLD':
    case 'CANCEL':
      return {};
  }
}

/** The coded reason of a command: an override's, or a manual ticket's. */
function reasonOf(command: Command): string | null {
  if (command.type === 'OVERRIDE') return command.reason;
  if (command.type === 'ISSUE_TICKET') return command.reason ?? null;
  if (command.type === 'DECIDE_ADVICE') return command.reason;
  return null;
}

/**
 * A page of a checkpoint's log for a service day, the latest first: before the command `before`
 * if given, and only the commands about the ticket numbered `number` if given.
 */
export async function auditOf(
  db: Db,
  cp: CheckpointRow,
  serviceDay: string,
  options: { readonly number?: string; readonly before?: number; readonly limit?: number },
): Promise<AuditResponse> {
  const limit = Math.min(options.limit ?? AUDIT_PAGE, AUDIT_PAGE);
  const where: (SQL | undefined)[] = [
    eq(queueCommand.checkpointId, cp.id),
    eq(queueCommand.serviceDay, serviceDay),
    options.before === undefined ? undefined : lt(queueCommand.seq, options.before),
  ];
  if (options.number !== undefined) {
    const [token] = await db
      .select({ id: queueToken.id })
      .from(queueToken)
      .where(
        and(
          eq(queueToken.checkpointId, cp.id),
          eq(queueToken.serviceDay, serviceDay),
          eq(queueToken.number, options.number),
        ),
      );
    if (token === undefined) return { checkpointId: cp.id, serviceDay, entries: [], more: false };
    // The commands that name the ticket, and those whose events changed it.
    const touching = db
      .select({ seq: queueEvent.commandSeq })
      .from(queueEvent)
      .where(and(eq(queueEvent.checkpointId, cp.id), eq(queueEvent.ticketId, token.id)));
    where.push(
      or(
        inArray(queueCommand.seq, touching),
        sql`${queueCommand.command} ->> 'ticketId' = ${token.id}`,
      ),
    );
  }
  const rows = await db
    .select({
      seq: queueCommand.seq,
      atMs: queueCommand.atMs,
      type: queueCommand.type,
      command: queueCommand.command,
      result: queueCommand.result,
      actor: queueCommand.actor,
    })
    .from(queueCommand)
    .where(and(...where))
    .orderBy(desc(queueCommand.seq))
    .limit(limit + 1);
  const page = rows.slice(0, limit);
  const seqs = page.map((r) => r.seq);
  const events =
    seqs.length === 0
      ? []
      : await db
          .select({
            commandSeq: queueEvent.commandSeq,
            type: queueEvent.type,
            ticketId: queueEvent.ticketId,
          })
          .from(queueEvent)
          .where(and(eq(queueEvent.checkpointId, cp.id), inArray(queueEvent.commandSeq, seqs)))
          .orderBy(asc(queueEvent.seq));
  // The numbers of every ticket the page names, and the names of whoever acted.
  const ticketIds = new Set<string>();
  for (const e of events) if (e.ticketId !== null) ticketIds.add(e.ticketId);
  for (const r of page) {
    const id = ticketIdOf(r.command as Command, r.result as CommandResult);
    if (id !== null) ticketIds.add(id);
  }
  const numbers = new Map<string, string>();
  if (ticketIds.size > 0) {
    const tokens = await db
      .select({ id: queueToken.id, number: queueToken.number })
      .from(queueToken)
      .where(inArray(queueToken.id, [...ticketIds]));
    for (const t of tokens) numbers.set(t.id, t.number);
  }
  const staffIds = new Set<string>();
  const deviceIds = new Set<string>();
  for (const r of page) {
    if (r.actor.startsWith('staff:')) staffIds.add(r.actor.slice('staff:'.length));
    if (r.actor.startsWith('kiosk:')) deviceIds.add(r.actor.slice('kiosk:'.length));
  }
  const names = new Map<string, string>();
  if (staffIds.size > 0) {
    const members = await db
      .select({ id: staffUser.id, login: staffUser.login })
      .from(staffUser)
      .where(inArray(staffUser.id, [...staffIds]));
    for (const m of members) names.set(`staff:${m.id}`, m.login);
  }
  if (deviceIds.size > 0) {
    const devices = await db
      .select({ id: device.id, name: device.name })
      .from(device)
      .where(inArray(device.id, [...deviceIds]));
    for (const d of devices) names.set(`kiosk:${d.id}`, d.name);
  }
  const byOf = (actor: string): AuditEntry['by'] => {
    if (actor.startsWith('staff:')) return { kind: 'STAFF', label: names.get(actor) ?? '' };
    if (actor.startsWith('kiosk:')) return { kind: 'DEVICE', label: names.get(actor) ?? '' };
    if (actor === 'system:timer') return { kind: 'SYSTEM', label: 'timer' };
    // The digital twin (S18): its simulated passengers and staff.
    if (actor === 'system:twin') return { kind: 'SYSTEM', label: 'twin' };
    // GateFlow itself: the day it opens, its recommendations of lanes and their outcomes (S22).
    return { kind: 'SYSTEM', label: 'GateFlow' };
  };
  const entries: AuditEntry[] = page.map((r) => {
    const command = r.command as Command;
    const result = r.result as CommandResult;
    const ticketId = ticketIdOf(command, result);
    return {
      seq: r.seq,
      at: iso(r.atMs),
      command: r.type,
      by: byOf(r.actor),
      ticket: ticketId === null ? null : (numbers.get(ticketId) ?? null),
      outcome: outcomeOf(result),
      reason: reasonOf(command),
      detail: detailOf(command, result),
      events: events
        .filter((e) => e.commandSeq === r.seq)
        .map((e) => ({
          type: e.type,
          ticket: e.ticketId === null ? null : (numbers.get(e.ticketId) ?? null),
        })),
    };
  });
  return { checkpointId: cp.id, serviceDay, entries, more: rows.length > limit };
}
