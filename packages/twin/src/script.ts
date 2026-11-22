import type { KnownDeadline, Millis } from '@gateflow/domain';
import { CheckpointDay } from '@gateflow/operations';
import type {
  Command,
  CommandRecord,
  CommandResult,
  DayConfig,
  DayLogEvent,
} from '@gateflow/operations';
import type { PresentOutcome } from '@gateflow/queue-core';
import type { TapeEntry } from '@gateflow/sim-model';
import { TwinError } from './day';
import type { TwinDay } from './day';

/**
 * The identifiers of the live system, given by its caller: tickets and flights are named by UUIDs
 * there, and a ticket's reference is random. The twin keeps the simulator's names beside them.
 */
export interface TwinIds {
  readonly ticketId: () => string;
  readonly opaqueRef: () => string;
  readonly flightId: () => string;
}

/** A flight of the twin's day, as the live system names it. */
export interface TwinFlight {
  /** The live system's id of the flight. */
  readonly id: string;
  /** The simulator's, e.g. `F012` or `AZ1462`. */
  readonly simId: string;
  readonly stdMs: Millis;
  /** When boarding closes, as known when the day starts (the feed may change it). */
  readonly boardingCloseMs: Millis | null;
  readonly gateZone: string;
}

/** What the live system must answer a step: what the simulator's queue answered. */
export type TwinExpectation =
  | { readonly type: 'TICKET_ISSUED'; readonly ticketId: string }
  | { readonly type: 'FLIGHT_UPDATED' }
  | { readonly type: 'LANES_SET'; readonly lanesOpen: number }
  | { readonly type: 'CALLED'; readonly ticketId: string | null }
  | { readonly type: 'PRESENTED'; readonly outcome: PresentOutcome }
  | { readonly type: 'ADVANCED' };

/**
 * One operation of the tape for the live system: the command to send at its virtual time, or null
 * when there is nothing to send (the lanes the day opens with), and what it must answer.
 */
export interface TwinStep {
  /** Position in the tape. */
  readonly index: number;
  /** Virtual time: the start of the virtual day plus the time of the operation in the run. */
  readonly atMs: Millis;
  readonly entry: TapeEntry;
  readonly command: Command | null;
  readonly expect: TwinExpectation;
}

/** The first answer of the live system that is not the simulator's. */
export interface TwinDivergence {
  readonly index: number;
  readonly atMs: Millis;
  readonly operation: TapeEntry['type'];
  /** What the simulator's queue answered, and what the live system did: ids or outcomes. */
  readonly expected: string;
  readonly actual: string;
}

/**
 * The tape of a day as the live system receives it (S18): every operation becomes the command staff
 * or kiosks send, with the simulator's inputs, at its virtual time `originMs` plus its time in the
 * run. Every instant moves by the origin, every duration stays: the engine decides the same at any
 * origin (queue-core's test of the time of day). Tickets come from the simulator's knowledge, not
 * from a scanned pass; their source is TWIN.
 */
export class TwinScript {
  readonly steps: readonly TwinStep[];
  readonly flights: readonly TwinFlight[];
  /** The live id of each of the simulator's tickets. */
  private readonly tickets = new Map<string, string>();

  constructor(
    readonly day: TwinDay,
    options: {
      /** The start of the virtual day, in epoch milliseconds: a local midnight. */
      readonly originMs: number;
      readonly ids: TwinIds;
      /** The last operation to play, in the run's time; every one when absent. */
      readonly untilMs?: number;
    },
  ) {
    const origin = options.originMs;
    if (!Number.isSafeInteger(origin) || origin < 0) {
      throw new TwinError('the start of the virtual day is a whole number of milliseconds');
    }
    const flights = day.population.flights.map((f) => ({
      id: options.ids.flightId(),
      simId: f.id,
      stdMs: origin + f.stdMs,
      boardingCloseMs: f.knownDeadline.atMs === null ? null : origin + f.knownDeadline.atMs,
      gateZone: f.gateZone,
    }));
    this.flights = flights;
    const flightIds = new Map(flights.map((f) => [f.simId, f.id]));
    const flightOf = (simId: string | undefined): string => {
      const id = simId === undefined ? undefined : flightIds.get(simId);
      if (id === undefined)
        throw new TwinError(`the tape names an unknown flight ${String(simId)}`);
      return id;
    };
    const ticketOf = (simId: string): string => {
      const id = this.tickets.get(simId);
      if (id === undefined) throw new TwinError(`the tape names an unknown ticket ${simId}`);
      return id;
    };
    const moved = (deadline: KnownDeadline): KnownDeadline => ({
      atMs: deadline.atMs === null ? null : origin + deadline.atMs,
      source: deadline.source,
      ...(deadline.observedAtMs === undefined
        ? {}
        : { observedAtMs: origin + deadline.observedAtMs }),
    });
    const until = options.untilMs ?? Infinity;
    let lanes = day.lanesAtStart;
    const steps: TwinStep[] = [];
    day.tape.forEach((entry, index) => {
      if (entry.atMs > until) return;
      const atMs = origin + entry.atMs;
      const step = (command: Command | null, expect: TwinExpectation) => {
        steps.push({ index, atMs, entry, command, expect });
      };
      switch (entry.type) {
        case 'LANES':
          // The day opens with the lanes of the start: nothing to send for them.
          if (entry.lanes === lanes) {
            step(null, { type: 'LANES_SET', lanesOpen: lanes });
            return;
          }
          lanes = entry.lanes;
          step({ type: 'SET_LANES', lanesOpen: lanes }, { type: 'LANES_SET', lanesOpen: lanes });
          return;
        case 'ISSUE': {
          const input = entry.input;
          const ticketId = options.ids.ticketId();
          this.tickets.set(input.id, ticketId);
          const presented = input.presentedAtMs ?? entry.atMs;
          const departure = input.scheduledDepartureMs ?? null;
          step(
            {
              type: 'ISSUE_TICKET',
              ticketId,
              opaqueRef: options.ids.opaqueRef(),
              source: 'TWIN',
              flightId: flightOf(input.flightId),
              segment: input.segment,
              partySize: input.partySize ?? 1,
              deadline: moved(input.deadline),
              walkEstimateMs: input.walkEstimateMs,
              scheduledDepartureMs: departure === null ? null : origin + departure,
              // A ticket issued again keeps the first presentation; a first ticket is presented now.
              ...(presented === entry.atMs ? {} : { presentedAtMs: origin + presented }),
              dedupKey: null,
            },
            { type: 'TICKET_ISSUED', ticketId },
          );
          return;
        }
        case 'UPDATE_FLIGHT':
          step(
            {
              type: 'UPDATE_FLIGHT',
              flightId: flightOf(entry.flightId),
              ...(entry.knowledge.deadline === undefined
                ? {}
                : { deadline: moved(entry.knowledge.deadline) }),
              ...(entry.knowledge.walkEstimateMs === undefined
                ? {}
                : { walkEstimateMs: entry.knowledge.walkEstimateMs }),
            },
            { type: 'FLIGHT_UPDATED' },
          );
          return;
        case 'CALL_NEXT':
          step(
            { type: 'CALL_NEXT' },
            { type: 'CALLED', ticketId: entry.ticketId === null ? null : ticketOf(entry.ticketId) },
          );
          return;
        case 'PRESENT':
          step(
            { type: 'PRESENT', ticketId: ticketOf(entry.ticketId), method: 'REF' },
            { type: 'PRESENTED', outcome: entry.outcome },
          );
          return;
        case 'ADVANCE':
          step({ type: 'ADVANCE' }, { type: 'ADVANCED' });
          return;
      }
    });
    this.steps = steps;
  }

  /** The live id of a ticket of the simulator, once its issue is among the steps. */
  liveTicketId(simTicketId: string): string | undefined {
    return this.tickets.get(simTicketId);
  }

  /** The calls the live system must make, in order: the live ids of the tickets. */
  expectedCalls(): string[] {
    const calls: string[] = [];
    for (const step of this.steps) {
      if (step.expect.type === 'CALLED' && step.expect.ticketId !== null) {
        calls.push(step.expect.ticketId);
      }
    }
    return calls;
  }
}

/** What a result answered, in the terms of an expectation. */
function answered(result: CommandResult): string {
  switch (result.type) {
    case 'TICKET_ISSUED':
      return result.ticket.ticketId;
    case 'CALLED':
      return result.ticket?.ticketId ?? 'nobody';
    case 'PRESENTED':
      return result.outcome;
    case 'LANES_SET':
      return `${String(result.lanesOpen)} lanes`;
    case 'DAY_OPENED':
    case 'ADVANCED':
    case 'ACTED':
    case 'MODE_SET':
    case 'OVERRIDDEN':
    case 'FLIGHT_UPDATED':
    case 'ADVISED':
    case 'ADVICE_DECIDED':
    case 'OUTCOME_RECORDED':
      return result.type;
  }
}

/** Checks the live system's answer to a step: null when it is the simulator's. */
export function checkStep(step: TwinStep, result: CommandResult): TwinDivergence | null {
  const expect = step.expect;
  const matches = (() => {
    switch (expect.type) {
      case 'TICKET_ISSUED':
        return result.type === 'TICKET_ISSUED' && result.ticket.ticketId === expect.ticketId;
      case 'CALLED':
        return result.type === 'CALLED' && (result.ticket?.ticketId ?? null) === expect.ticketId;
      case 'PRESENTED':
        return result.type === 'PRESENTED' && result.outcome === expect.outcome;
      case 'LANES_SET':
        return result.type === 'LANES_SET' && result.lanesOpen === expect.lanesOpen;
      case 'FLIGHT_UPDATED':
      case 'ADVANCED':
        return result.type === expect.type;
    }
  })();
  if (matches) return null;
  const expected = (() => {
    switch (expect.type) {
      case 'TICKET_ISSUED':
        return expect.ticketId;
      case 'CALLED':
        return expect.ticketId ?? 'nobody';
      case 'PRESENTED':
        return expect.outcome;
      case 'LANES_SET':
        return `${String(expect.lanesOpen)} lanes`;
      case 'FLIGHT_UPDATED':
      case 'ADVANCED':
        return expect.type;
    }
  })();
  return {
    index: step.index,
    atMs: step.atMs,
    operation: step.entry.type,
    expected,
    actual: answered(result),
  };
}

/** What a play of the twin gave: the steps applied, and the first divergence if any. */
export interface TwinPlay {
  readonly applied: number;
  readonly calls: number;
  readonly divergence: TwinDivergence | null;
  /** Every event of the live day, in order, the opening of the day included. */
  readonly events: readonly DayLogEvent[];
}

/**
 * Plays the script on an operations day in memory, as the API plays it on the database: the day
 * opens with the first command, and every answer is checked. It stops at the first divergence.
 */
export function playInMemory(script: TwinScript, config: DayConfig): TwinPlay {
  let day: CheckpointDay | null = null;
  let seq = 0;
  let calls = 0;
  let applied = 0;
  const events: DayLogEvent[] = [];
  for (const step of script.steps) {
    if (step.command === null) {
      applied++;
      continue;
    }
    if (day === null) {
      const opened = CheckpointDay.open({
        seq: ++seq,
        atMs: step.atMs,
        command: { type: 'OPEN_DAY', config },
      });
      day = opened.day;
      events.push(...opened.applied.events);
    }
    const record: CommandRecord = { seq: ++seq, atMs: step.atMs, command: step.command };
    const result = day.apply(record);
    events.push(...result.events);
    const divergence = checkStep(step, result.result);
    if (divergence !== null) return { applied, calls, divergence, events };
    applied++;
    if (result.result.type === 'CALLED' && result.result.ticket !== null) calls++;
  }
  return { applied, calls, divergence: null, events };
}
