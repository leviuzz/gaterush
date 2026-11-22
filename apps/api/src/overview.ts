import { and, asc, between, eq, isNull, sql } from 'drizzle-orm';
import type { OverviewResponse, OverviewVerifyResponse } from '@gateflow/contracts';
import type { DeadlineSource } from '@gateflow/domain';
import type { CheckpointMode } from '@gateflow/queue-core';
import { CheckpointDay, callCountsOf, overviewOf } from '@gateflow/operations';
import type {
  CallCounts,
  Command,
  CommandRecord,
  DayConfig,
  DayLogEvent,
  Overview,
  OverviewFlight,
  OverviewTicket,
  TicketSummary,
} from '@gateflow/operations';
import type { Db } from './db/client';
import { displayBoard, flight, queueCommand, queueEvent, queueToken } from './db/schema';
import type { CheckpointRow } from './runtime';
import { serviceDayNow } from './runtime';

/*
 * The operations overview (S20, ADR-053): the figures of a checkpoint's service day, read from the
 * current state the API keeps with every command, and their check: the same figures recomputed
 * from a replay of the day's log, in the same snapshot of the database, with every ticket of the
 * current state compared with the replay's.
 */

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

/** At most this many differences are listed by a check. */
const MAX_DIFFERENCES = 20;
/** A replay lets requests in every this many commands. */
const REPLAY_SLICE = 500;

/** The day's configuration, from its first command: the policy and the stale-data rule. */
async function dayConfigOf(tx: Tx, cp: CheckpointRow, serviceDay: string) {
  const [open] = await tx
    .select({ command: queueCommand.command })
    .from(queueCommand)
    .where(
      and(
        eq(queueCommand.checkpointId, cp.id),
        eq(queueCommand.serviceDay, serviceDay),
        eq(queueCommand.type, 'OPEN_DAY'),
      ),
    );
  const command = open?.command as Command | undefined;
  return command?.type === 'OPEN_DAY' ? command.config : null;
}

/** The bound K and the stale-data rule of a day. */
function rulesOf(config: DayConfig | null) {
  const selection = config?.policy.selection;
  return {
    overtakeBound: selection?.kind === 'constrained-edf' ? selection.maxOvertakes : null,
    maxDeadlineAgeMs: config?.classification.maxDeadlineAgeMs ?? null,
  };
}

/** The flights of the service day: the airport's, or a twin's run's own. */
async function flightsOf(tx: Tx, cp: CheckpointRow, serviceDay: string): Promise<OverviewFlight[]> {
  const rows =
    cp.settings.twin !== undefined
      ? await tx.select().from(flight).where(eq(flight.twinRunId, cp.settings.twin.runId))
      : await tx
          .select()
          .from(flight)
          .where(
            and(
              eq(flight.airportId, cp.airportId),
              eq(flight.serviceDate, serviceDay),
              isNull(flight.twinRunId),
            ),
          );
  return rows.map((f) => ({
    source: f.deadlineSource as DeadlineSource,
    observedAtMs: f.observedAtMs,
  }));
}

/**
 * The mode of the checkpoint, from the board written with its latest command (S17): NORMAL before
 * its first. A new day opens in the mode the previous one ended in.
 */
async function modeIn(tx: Tx, checkpointId: string): Promise<CheckpointMode> {
  const [row] = await tx
    .select({ board: displayBoard.board })
    .from(displayBoard)
    .where(eq(displayBoard.checkpointId, checkpointId));
  return (row?.board as { readonly mode?: CheckpointMode } | undefined)?.mode ?? 'NORMAL';
}

/** The day's commands: the first and the latest (what the figures reflect), and its time. */
async function headOf(tx: Tx, cp: CheckpointRow, serviceDay: string) {
  const [head] = await tx
    .select({
      first: sql<string | null>`min(${queueCommand.seq})`,
      seq: sql<string | null>`max(${queueCommand.seq})`,
      atMs: sql<string | null>`max(${queueCommand.atMs})`,
    })
    .from(queueCommand)
    .where(and(eq(queueCommand.checkpointId, cp.id), eq(queueCommand.serviceDay, serviceDay)));
  return {
    first: Number(head?.first ?? 0),
    seq: Number(head?.seq ?? 0),
    atMs: head?.atMs === null ? null : Number(head?.atMs),
  };
}

/** Now, for the figures: the server's time; a twin's virtual time, its latest command's. */
function nowOf(cp: CheckpointRow, nowMs: number, head: { atMs: number | null }): number {
  return cp.settings.twin !== undefined && head.atMs !== null ? head.atMs : nowMs;
}

/** The engine's commitments and the overrides of the day, from the events of its commands. */
async function liveCalls(
  tx: Tx,
  cp: CheckpointRow,
  day: { readonly first: number; readonly seq: number },
): Promise<CallCounts> {
  const [row] = await tx
    .select({
      commitments: sql<string>`count(*) FILTER (WHERE ${queueEvent.type} = 'COMMITTED')`,
      priority: sql<string>`count(*) FILTER (WHERE ${queueEvent.type} = 'COMMITTED' AND (${queueEvent.payload}->>'priority')::boolean)`,
      passed: sql<string>`coalesce(sum((${queueEvent.payload}->>'passedPeople')::int) FILTER (WHERE ${queueEvent.type} = 'COMMITTED'), 0)`,
      overrides: sql<string>`count(*) FILTER (WHERE ${queueEvent.type} = 'OVERRIDDEN')`,
    })
    .from(queueEvent)
    .where(
      and(eq(queueEvent.checkpointId, cp.id), between(queueEvent.commandSeq, day.first, day.seq)),
    );
  return {
    commitments: Number(row?.commitments ?? 0),
    priorityCommitments: Number(row?.priority ?? 0),
    passedPeople: Number(row?.passed ?? 0),
    overrides: Number(row?.overrides ?? 0),
  };
}

type TokenRow = typeof queueToken.$inferSelect;

const ticketOfRow = (r: TokenRow): OverviewTicket => ({
  state: r.state as OverviewTicket['state'],
  partySize: r.partySize,
  riskClass: r.riskClass,
  presentedAtMs: r.presentedAtMs,
  admittedAtMs: r.admittedAtMs,
  overtaken: r.overtaken,
});

const ticketOfSummary = (t: TicketSummary): OverviewTicket => ({
  state: t.state,
  partySize: t.partySize,
  riskClass: t.riskClass,
  presentedAtMs: t.presentedAtMs,
  admittedAtMs: t.admittedAtMs,
  overtaken: t.overtaken,
});

/** The figures as the API answers them. */
function responseOf(
  cp: CheckpointRow,
  serviceDay: string,
  seq: number,
  overview: Overview,
): OverviewResponse {
  const { nowMs, ...figures } = overview;
  return {
    checkpointId: cp.id,
    serviceDay,
    at: new Date(nowMs).toISOString(),
    seq,
    ...figures,
    alerts: [...figures.alerts],
  };
}

/** The current state's figures, in one snapshot of the database. */
async function liveFigures(tx: Tx, cp: CheckpointRow, serviceDay: string, nowMs: number) {
  const head = await headOf(tx, cp, serviceDay);
  const config = await dayConfigOf(tx, cp, serviceDay);
  const rows = await tx
    .select()
    .from(queueToken)
    .where(and(eq(queueToken.checkpointId, cp.id), eq(queueToken.serviceDay, serviceDay)))
    .orderBy(asc(queueToken.issuedAtMs), asc(queueToken.number));
  const lanes = await tx
    .select({ command: queueCommand.command })
    .from(queueCommand)
    .where(
      and(
        eq(queueCommand.checkpointId, cp.id),
        eq(queueCommand.serviceDay, serviceDay),
        eq(queueCommand.type, 'SET_LANES'),
      ),
    )
    .orderBy(sql`${queueCommand.seq} DESC`)
    .limit(1);
  const setLanes = lanes[0]?.command as Command | undefined;
  const overview = overviewOf({
    nowMs: nowOf(cp, nowMs, head),
    mode: await modeIn(tx, cp.id),
    lanesOpen:
      setLanes?.type === 'SET_LANES'
        ? setLanes.lanesOpen
        : (config?.lanesOpen ?? cp.settings.lanesOpen),
    tickets: rows.map(ticketOfRow),
    calls: await liveCalls(tx, cp, head),
    ...rulesOf(config),
    flights: await flightsOf(tx, cp, serviceDay),
  });
  return { head, rows, overview };
}

/** The figures of a checkpoint's service day, from its current state (S20). */
export async function liveOverview(
  db: Db,
  cp: CheckpointRow,
  nowMs: number,
): Promise<OverviewResponse> {
  const serviceDay = serviceDayNow(cp, nowMs);
  return db.transaction(
    async (tx) => {
      const { head, overview } = await liveFigures(tx, cp, serviceDay, nowMs);
      return responseOf(cp, serviceDay, head.seq, overview);
    },
    { isolationLevel: 'repeatable read', accessMode: 'read only' },
  );
}

/** Every leaf of a value, by its path: what two answers are compared on. */
function leaves(value: unknown, path: string, into: Map<string, string>): Map<string, string> {
  if (value !== null && typeof value === 'object') {
    for (const [key, inner] of Object.entries(value)) {
      leaves(inner, path === '' ? key : `${path}.${key}`, into);
    }
  } else {
    into.set(path, value === undefined ? 'undefined' : JSON.stringify(value));
  }
  return into;
}

/** What a ticket's row and the replay's ticket must agree on. */
const TICKET_FIELDS = [
  'number',
  'state',
  'source',
  'flightId',
  'segment',
  'partySize',
  'riskClass',
  'priority',
  'overridden',
  'calls',
  'issuedAtMs',
  'presentedAtMs',
  'overtaken',
  'firstCalledAtMs',
  'lastCalledAtMs',
  'admittedAtMs',
] as const satisfies readonly (keyof TicketSummary & keyof TokenRow)[];

/**
 * Checks the figures against the log (S20): replays the service day's commands, in the same
 * snapshot as the current state, and compares every figure and every ticket. The replay lets
 * other requests in as it goes.
 */
export async function verifyOverview(
  db: Db,
  cp: CheckpointRow,
  nowMs: number,
): Promise<OverviewVerifyResponse> {
  const serviceDay = serviceDayNow(cp, nowMs);
  return db.transaction(
    async (tx) => {
      const live = await liveFigures(tx, cp, serviceDay, nowMs);
      const commands = await tx
        .select({ seq: queueCommand.seq, atMs: queueCommand.atMs, command: queueCommand.command })
        .from(queueCommand)
        .where(and(eq(queueCommand.checkpointId, cp.id), eq(queueCommand.serviceDay, serviceDay)))
        .orderBy(asc(queueCommand.seq));
      const differences: { what: string; live: string; log: string }[] = [];
      const differ = (what: string, a: string, b: string) => {
        if (differences.length < MAX_DIFFERENCES) differences.push({ what, live: a, log: b });
      };
      const records: CommandRecord[] = commands.map((c) => ({
        seq: c.seq,
        atMs: c.atMs,
        command: c.command as Command,
      }));
      const [first, ...rest] = records;
      if (first === undefined) {
        // No day yet: nothing to replay, and the current state must hold no ticket of it.
        if (live.rows.length > 0) differ('tickets', String(live.rows.length), '0');
        return {
          checkpointId: cp.id,
          serviceDay,
          at: new Date(live.overview.nowMs).toISOString(),
          commands: 0,
          intact: differences.length === 0,
          differences,
        };
      }
      const opened = CheckpointDay.open(first);
      const day = opened.day;
      const events: DayLogEvent[] = [...opened.applied.events];
      for (const [i, record] of rest.entries()) {
        events.push(...day.apply(record).events);
        if ((i + 1) % REPLAY_SLICE === 0) {
          await new Promise<void>((resolve) => {
            setImmediate(resolve);
          });
        }
      }
      const replayed = overviewOf({
        nowMs: live.overview.nowMs,
        mode: day.mode,
        lanesOpen: day.lanesOpen,
        tickets: day.tickets().map(ticketOfSummary),
        calls: callCountsOf(events),
        ...rulesOf(day.config),
        flights: await flightsOf(tx, cp, serviceDay),
      });
      // Every figure.
      const fromLog = leaves(replayed, '', new Map());
      const fromState = leaves(live.overview, '', new Map());
      for (const path of new Set([...fromState.keys(), ...fromLog.keys()])) {
        const a = fromState.get(path) ?? 'absent';
        const b = fromLog.get(path) ?? 'absent';
        if (a !== b) differ(path, a, b);
      }
      // Every ticket.
      const rows = new Map(live.rows.map((r) => [r.id, r]));
      for (const ticket of day.tickets()) {
        const row = rows.get(ticket.ticketId);
        rows.delete(ticket.ticketId);
        if (row === undefined) {
          differ(`ticket ${ticket.number}`, 'absent', ticket.state);
          continue;
        }
        for (const field of TICKET_FIELDS) {
          const a = JSON.stringify(row[field]);
          const b = JSON.stringify(ticket[field]);
          if (a !== b) differ(`ticket ${ticket.number} ${field}`, a, b);
        }
      }
      for (const row of rows.values()) differ(`ticket ${row.number}`, row.state, 'absent');
      return {
        checkpointId: cp.id,
        serviceDay,
        at: new Date(live.overview.nowMs).toISOString(),
        commands: records.length,
        intact: differences.length === 0,
        differences,
      };
    },
    { isolationLevel: 'repeatable read', accessMode: 'read only' },
  );
}
