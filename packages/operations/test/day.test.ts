import fc from 'fast-check';
import type { KnownDeadline } from '@gateflow/domain';
import {
  CHECKPOINT_MODES,
  CheckpointQueue,
  FIFO_POLICY,
  PRIORITY_V3_POLICY,
  VIRTUAL_FIFO_POLICY,
  classificationOf,
  withLaneMode,
} from '@gateflow/queue-core';
import type { CheckpointMode, Policy, QueueEvent } from '@gateflow/queue-core';
import { describe, expect, it } from 'vitest';
import { CheckpointDay, OperationError, estimatesOf } from '../src';
import type { AddToParty, Command, CommandRecord, DayConfig, IssueTicket } from '../src';

const MIN = 60_000;
/** A service day starting at 05:00 UTC on 2026-11-23, in epoch milliseconds. */
const DAY_START = Date.UTC(2026, 10, 23, 5, 0, 0);
const CLASSIFICATION = classificationOf(PRIORITY_V3_POLICY)!;

function config(
  policy: Policy = PRIORITY_V3_POLICY,
  overrides: Partial<DayConfig> = {},
): DayConfig {
  return {
    checkpointId: 'cp-1',
    serviceDay: '2026-11-23',
    ticketPrefix: 'A',
    policy,
    classification: CLASSIFICATION,
    lanesOpen: 2,
    ratePerLanePerHour: 150,
    processEstimateMs: 24_000,
    ...overrides,
  };
}

function issue(n: number, overrides: Partial<IssueTicket> = {}): IssueTicket {
  return {
    type: 'ISSUE_TICKET',
    ticketId: `t-${n}`,
    opaqueRef: `ref-${n}-0123456789abcdef`,
    source: 'STAFF',
    flightId: `F${n % 3}`,
    segment: 'DEPARTING',
    partySize: 1,
    deadline: { atMs: DAY_START + 90 * MIN, source: 'FEED' },
    walkEstimateMs: 5 * MIN,
    scheduledDepartureMs: DAY_START + 110 * MIN,
    dedupKey: null,
    ...overrides,
  };
}

/** A log: the day's commands with consecutive sequence numbers and the given times. */
function log(commands: readonly Command[], times?: readonly number[]): CommandRecord[] {
  return commands.map((command, i) => ({
    seq: i + 1,
    atMs: times?.[i] ?? DAY_START + i * 10_000,
    command,
  }));
}

function run(records: readonly CommandRecord[]) {
  const [first, ...rest] = records;
  const { day, applied } = CheckpointDay.open(first!);
  return { day, applied: [applied, ...rest.map((r) => day.apply(r))] };
}

describe('a checkpoint day', () => {
  it('issues numbered tickets, calls them and admits the passenger', () => {
    const { day, applied } = run(
      log([
        { type: 'OPEN_DAY', config: config() },
        issue(1),
        issue(2, { partySize: 3 }),
        { type: 'CALL_NEXT' },
        { type: 'PRESENT', ticketId: 't-1', method: 'NUMBER' },
        { type: 'PRESENT', ticketId: 't-1', method: 'REF' },
      ]),
    );
    expect(applied.map((a) => a.result.type)).toEqual([
      'DAY_OPENED',
      'TICKET_ISSUED',
      'TICKET_ISSUED',
      'CALLED',
      'PRESENTED',
      'PRESENTED',
    ]);
    const tickets = day.tickets();
    expect(tickets.map((t) => t.number)).toEqual(['A001', 'A002']);
    expect(tickets[1]?.partySize).toBe(3);
    const called = applied[3]!.result;
    expect(called.type === 'CALLED' && called.ticket?.number).toBe('A001');
    const presented = applied
      .slice(4)
      .map((a) => (a.result.type === 'PRESENTED' ? a.result.outcome : ''));
    expect(presented).toEqual(['ADMITTED', 'ALREADY_ADMITTED']);
    expect(day.ticketByNumber('A001')?.state).toBe('ADMITTED');
    expect(day.ticketByRef('ref-2-0123456789abcdef')?.number).toBe('A002');
    expect(applied[0]!.events).toEqual([
      { type: 'DAY_OPENED', atMs: DAY_START, serviceDay: '2026-11-23' },
    ]);
    // The issue of a ticket also commits it to the prepare window.
    expect(applied[1]!.events.map((e) => e.type)).toEqual(['ISSUED', 'COMMITTED']);
    expect(applied[4]!.events.map((e) => e.type)).toEqual(['ADMITTED']);
  });

  it('applies the timeouts that are due before a command', () => {
    const policy = PRIORITY_V3_POLICY;
    const queue = policy.queue.kind === 'virtual' ? policy.queue : undefined;
    const t1 = queue!.callTimeoutMs;
    const t2 = queue!.recallTimeoutMs;
    const start = DAY_START;
    const { applied } = run(
      log(
        [
          { type: 'OPEN_DAY', config: config(policy) },
          issue(1),
          { type: 'CALL_NEXT' },
          issue(2),
          issue(3),
        ],
        [start, start, start, start + t1 + 1, start + t1 + t2 + 1],
      ),
    );
    expect(applied[3]!.events.map((e) => e.type)).toEqual(['RECALLED', 'ISSUED', 'COMMITTED']);
    expect(applied[4]!.events[0]).toEqual({
      type: 'NO_SHOW',
      ticketId: 't-1',
      atMs: start + t1 + t2,
    });
  });

  it('refuses commands out of order, back in time, or on unknown tickets', () => {
    const records = log([{ type: 'OPEN_DAY', config: config() }, issue(1)]);
    const { day } = run(records);
    const code = (f: () => unknown) => {
      try {
        f();
      } catch (error) {
        return error instanceof OperationError ? error.code : 'other';
      }
      return 'none';
    };
    expect(
      code(() => day.apply({ seq: 4, atMs: DAY_START + MIN, command: { type: 'CALL_NEXT' } })),
    ).toBe('OUT_OF_ORDER');
    expect(code(() => day.apply({ seq: 3, atMs: DAY_START, command: { type: 'CALL_NEXT' } }))).toBe(
      'OUT_OF_ORDER',
    );
    expect(
      code(() =>
        day.apply({
          seq: 3,
          atMs: DAY_START + MIN,
          command: { type: 'PRESENT', ticketId: 'nobody', method: 'NUMBER' },
        }),
      ),
    ).toBe('UNKNOWN_TICKET');
    const at = DAY_START + MIN;
    const bad: IssueTicket[] = [
      issue(1),
      issue(9, { opaqueRef: 'ref-1-0123456789abcdef' }),
      issue(9, { opaqueRef: 'short' }),
      issue(9, { partySize: 0 }),
      issue(9, { partySize: 21 }),
      issue(9, { deadline: { atMs: 1.5, source: 'FEED' } }),
      issue(9, { deadline: { atMs: 5, source: 'NONE' } as unknown as KnownDeadline }),
      issue(9, { dedupKey: 'not-a-hash' }),
    ];
    for (const command of bad) {
      expect(code(() => day.apply({ seq: 3, atMs: at, command }))).toBe('INVALID_COMMAND');
    }
    expect(code(() => run(log([issue(1)])))).toBe('OUT_OF_ORDER');
    expect(code(() => run(log([{ type: 'OPEN_DAY', config: config(FIFO_POLICY) }])))).toBe(
      'INVALID_COMMAND',
    );
    expect(
      code(() =>
        run(
          log([{ type: 'OPEN_DAY', config: config(withLaneMode(PRIORITY_V3_POLICY, 'reactive')) }]),
        ),
      ),
    ).toBe('INVALID_COMMAND');
    expect(
      code(() =>
        run(
          log([{ type: 'OPEN_DAY', config: config(PRIORITY_V3_POLICY, { ticketPrefix: 'a1' }) }]),
        ),
      ),
    ).toBe('INVALID_COMMAND');
  });
});

describe('the modes of the checkpoint (S17)', () => {
  const code = (f: () => unknown) => {
    try {
      f();
    } catch (error) {
      return error instanceof OperationError ? error.code : 'other';
    }
    return 'none';
  };

  it('pauses the calls, and stops the kiosks too in an emergency', () => {
    const { day, applied } = run(
      log([
        { type: 'OPEN_DAY', config: config() },
        issue(1),
        issue(2),
        { type: 'SET_MODE', mode: 'PAUSED', reset: false },
        { type: 'CALL_NEXT' },
        // Paused, the kiosks go on issuing.
        issue(3),
        { type: 'SET_MODE', mode: 'PAUSED', reset: false },
        { type: 'SET_MODE', mode: 'EMERGENCY', reset: false },
      ]),
    );
    expect(applied[3]!.result).toEqual({
      type: 'MODE_SET',
      outcome: 'DONE',
      mode: 'PAUSED',
      previous: 'NORMAL',
      reset: false,
    });
    expect(applied[3]!.events).toEqual([
      {
        type: 'MODE_CHANGED',
        atMs: DAY_START + 30_000,
        mode: 'PAUSED',
        previous: 'NORMAL',
        reset: false,
      },
    ]);
    // Nobody is called while paused.
    expect(applied[4]!.result).toEqual({ type: 'CALLED', ticket: null });
    expect(applied[5]!.result.type).toBe('TICKET_ISSUED');
    // The same mode again changes nothing.
    expect(applied[6]!.result).toMatchObject({ outcome: 'NOT_ALLOWED', mode: 'PAUSED' });
    expect(applied[6]!.events).toEqual([]);
    expect(day.mode).toBe('EMERGENCY');
    expect(day.board().mode).toBe('EMERGENCY');
    // In an emergency, no ticket is issued and no party grows: the log never has them.
    const at = DAY_START + 10 * MIN;
    expect(code(() => day.apply({ seq: 9, atMs: at, command: issue(4) }))).toBe('EMERGENCY');
    expect(
      code(() =>
        day.apply({
          seq: 9,
          atMs: at,
          command: { type: 'ADD_TO_PARTY', ticketId: 't-1', people: 1, dedupKey: null },
        }),
      ),
    ).toBe('EMERGENCY');
    // The emergency ends with the window announced again in order of arrival.
    const resumed = day.apply({
      seq: 9,
      atMs: at,
      command: { type: 'SET_MODE', mode: 'NORMAL', reset: true },
    });
    expect(resumed.result).toMatchObject({ outcome: 'DONE', mode: 'NORMAL', reset: true });
    expect(resumed.events.map((e) => e.type)).toEqual([
      'MODE_CHANGED',
      'UNCOMMITTED',
      'UNCOMMITTED',
      'UNCOMMITTED',
      'COMMITTED',
      'COMMITTED',
      'COMMITTED',
    ]);
    expect(day.prepareWindow().map((t) => t.number)).toEqual(['A001', 'A002', 'A003']);
  });

  it('opens a day in the mode the previous day ended in', () => {
    const { day, applied } = run(
      log([{ type: 'OPEN_DAY', config: config(PRIORITY_V3_POLICY, { mode: 'EMERGENCY' }) }]),
    );
    expect(applied[0]!.events).toEqual([
      { type: 'DAY_OPENED', atMs: DAY_START, serviceDay: '2026-11-23' },
      {
        type: 'MODE_CHANGED',
        atMs: DAY_START,
        mode: 'EMERGENCY',
        previous: 'NORMAL',
        reset: false,
      },
    ]);
    expect(day.mode).toBe('EMERGENCY');
    expect(code(() => day.apply({ seq: 2, atMs: DAY_START, command: issue(1) }))).toBe('EMERGENCY');
    // A day that opens NORMAL has no change of mode.
    const normal = run(
      log([{ type: 'OPEN_DAY', config: config(PRIORITY_V3_POLICY, { mode: 'NORMAL' }) }]),
    );
    expect(normal.applied[0]!.events.map((e) => e.type)).toEqual(['DAY_OPENED']);
    expect(normal.day.mode).toBe('NORMAL');
  });

  it('refuses an unknown mode, and a change that does not say whether it resets', () => {
    const { day } = run(log([{ type: 'OPEN_DAY', config: config() }]));
    const bad = [
      { type: 'SET_MODE', mode: 'CLOSED', reset: false },
      { type: 'SET_MODE', mode: 'PAUSED' },
      { type: 'SET_MODE', mode: 'PAUSED', reset: 'yes' },
    ] as unknown as Command[];
    for (const command of bad) {
      expect(code(() => day.apply({ seq: 2, atMs: DAY_START, command }))).toBe('INVALID_COMMAND');
    }
    const unknown = config(PRIORITY_V3_POLICY, { mode: 'CLOSED' as CheckpointMode });
    expect(code(() => run(log([{ type: 'OPEN_DAY', config: unknown }])))).toBe('INVALID_COMMAND');
  });
});

/** Random days: tickets with deadlines close enough for priority calls, calls and presentations. */
const dayArb = fc
  .tuple(
    fc.constantFrom(PRIORITY_V3_POLICY, VIRTUAL_FIFO_POLICY),
    fc.array(
      fc.oneof(
        {
          weight: 4,
          arbitrary: fc.record({
            kind: fc.constant('issue' as const),
            deadlineMin: fc.integer({ min: 5, max: 120 }),
            source: fc.constantFrom('FEED', 'RULE', 'NONE'),
            partySize: fc.integer({ min: 1, max: 4 }),
            transfer: fc.boolean(),
          }),
        },
        { weight: 3, arbitrary: fc.record({ kind: fc.constant('call' as const) }) },
        {
          weight: 3,
          arbitrary: fc.record({ kind: fc.constant('present' as const), pick: fc.nat() }),
        },
        // The scheduler's timeouts and the staff's actions (S15).
        { weight: 2, arbitrary: fc.record({ kind: fc.constant('advance' as const) }) },
        // The supervisor's modes (S17).
        {
          weight: 1,
          arbitrary: fc.record({
            kind: fc.constant('mode' as const),
            mode: fc.constantFrom(...CHECKPOINT_MODES),
            reset: fc.boolean(),
          }),
        },
        {
          weight: 3,
          arbitrary: fc.record({
            kind: fc.constant('staff' as const),
            action: fc.constantFrom(
              'RECALL',
              'MARK_NO_SHOW',
              'REACTIVATE',
              'HOLD',
              'CANCEL',
              'QUEUE',
              'REJECT',
              'GROW',
            ),
            pick: fc.nat(),
          }),
        },
      ),
      { minLength: 1, maxLength: 80 },
    ),
    fc.array(fc.integer({ min: 0, max: 4 * MIN }), { minLength: 80, maxLength: 80 }),
  )
  .map(([policy, steps, gaps]) => {
    const commands: Command[] = [{ type: 'OPEN_DAY', config: config(policy) }];
    const times = [DAY_START];
    let issued = 0;
    let t = DAY_START;
    // The mode, as the queue changes it: in an emergency, no ticket is issued, no party grows.
    let mode: CheckpointMode = 'NORMAL';
    const stopped = (m: CheckpointMode) => m === 'PAUSED' || m === 'EMERGENCY';
    steps.forEach((step, i) => {
      t += gaps[i] ?? 0;
      if (step.kind === 'mode') {
        const allowed = step.reset ? stopped(mode) && !stopped(step.mode) : step.mode !== mode;
        if (allowed) mode = step.mode;
        commands.push({ type: 'SET_MODE', mode: step.mode, reset: step.reset });
      } else if (step.kind === 'issue') {
        if (mode === 'EMERGENCY') return;
        issued++;
        const atMs = t + step.deadlineMin * MIN;
        commands.push(
          issue(issued, {
            partySize: step.partySize,
            segment: step.transfer ? 'TRANSFER' : 'DEPARTING',
            deadline:
              step.source === 'NONE'
                ? { atMs: null, source: 'NONE' }
                : { atMs, source: step.source },
            scheduledDepartureMs: atMs + 20 * MIN,
          }),
        );
      } else if (step.kind === 'call') {
        commands.push({ type: 'CALL_NEXT' });
      } else if (step.kind === 'advance') {
        commands.push({ type: 'ADVANCE' });
      } else if (step.kind === 'staff') {
        if (issued === 0) return;
        const ticketId = `t-${(step.pick % issued) + 1}`;
        if (step.action === 'GROW') {
          if (mode === 'EMERGENCY') return;
          commands.push({ type: 'ADD_TO_PARTY', ticketId, people: 1, dedupKey: null });
        } else if (step.action === 'QUEUE' || step.action === 'REJECT') {
          commands.push({
            type: 'RESOLVE_REVIEW',
            ticketId,
            decision: step.action === 'QUEUE' ? 'QUEUE' : 'CANCEL',
          });
        } else {
          commands.push({ type: step.action, ticketId });
        }
      } else {
        if (issued === 0) return;
        commands.push({
          type: 'PRESENT',
          ticketId: `t-${(step.pick % issued) + 1}`,
          method: 'NUMBER',
        });
      }
      times.push(t);
    });
    return log(commands, times);
  });

describe('infants in a party (ADR-046)', () => {
  const KEY = (n: number) => String(n).padStart(64, 'a');
  const join = (n: number, infant?: 'WITH_INFANT' | 'INFANT'): AddToParty => ({
    type: 'ADD_TO_PARTY',
    ticketId: 't-1',
    people: infant === 'WITH_INFANT' ? 2 : 1,
    ...(infant === undefined ? {} : { infant }),
    dedupKey: KEY(n),
  });
  const sizes = (applied: ReturnType<typeof run>['applied']) =>
    applied.flatMap((a) =>
      a.result.type === 'ACTED' || a.result.type === 'TICKET_ISSUED'
        ? [a.result.ticket.partySize]
        : [],
    );

  it("counts each infant once, from an adult's pass or from its own, in any order", () => {
    const kiosk = { source: 'KIOSK' as const, dedupKey: KEY(0) };
    const { day, applied } = run(
      log([
        { type: 'OPEN_DAY', config: config() },
        // An adult with an infant: two people.
        issue(1, { ...kiosk, partySize: 2, infant: 'WITH_INFANT' }),
        // That infant's own pass: counted already.
        join(1, 'INFANT'),
        // Another infant's own pass: one more.
        join(2, 'INFANT'),
        // Its adult, whose pass declares it: the adult only.
        join(3, 'WITH_INFANT'),
        // An adult with an infant whose own pass has not come: two more.
        join(4, 'WITH_INFANT'),
        join(5),
      ]),
    );
    expect(sizes(applied)).toEqual([2, 2, 3, 4, 6, 7]);
    // Joining without growing reports nothing.
    expect(applied[2]!.events).toEqual([]);
    expect(applied[2]!.result).toMatchObject({ outcome: 'DONE' });
    // The log rebuilds the count of every party.
    const records = log([
      { type: 'OPEN_DAY', config: config() },
      issue(1, { ...kiosk, partySize: 2, infant: 'WITH_INFANT' }),
      join(1, 'INFANT'),
      join(2, 'INFANT'),
      join(3, 'WITH_INFANT'),
    ]);
    const replayed = CheckpointDay.replay(records);
    expect(replayed.ticket('t-1')?.partySize).toBe(4);
    expect(replayed.partyGrowth('t-1', 1, 'INFANT')).toBe(1);
    expect(day.partyGrowth('t-1', 1, 'INFANT')).toBe(0);
    // The infant's own pass first, then its adult's.
    const reversed = run(
      log([
        { type: 'OPEN_DAY', config: config() },
        issue(1, { ...kiosk, infant: 'INFANT' }),
        join(1, 'WITH_INFANT'),
      ]),
    );
    expect(sizes(reversed.applied)).toEqual([1, 2]);
  });

  it('refuses an adult with an infant counted as one, an unknown infant and a party over 20', () => {
    const refuse = (commands: Command[]) => {
      const records = log([{ type: 'OPEN_DAY', config: config() }, ...commands]);
      expect(() => CheckpointDay.replay(records)).toThrow(OperationError);
    };
    refuse([issue(1, { infant: 'WITH_INFANT' })]);
    refuse([issue(1), { ...join(1, 'WITH_INFANT'), people: 1 }]);
    refuse([issue(1), { ...join(1), infant: 'TODDLER' as 'INFANT' }]);
    refuse([issue(1, { partySize: 19 }), join(1, 'WITH_INFANT')]);
    // An infant counted already joins a full party while it waits, and nobody once it is called.
    const outcomes = (applied: ReturnType<typeof run>['applied']) =>
      applied.flatMap((a) => (a.result.type === 'ACTED' ? [a.result.outcome] : []));
    const full = run(
      log([
        { type: 'OPEN_DAY', config: config() },
        issue(1, { partySize: 20, infant: 'WITH_INFANT' }),
        join(1, 'INFANT'),
      ]),
    );
    expect(sizes(full.applied)).toEqual([20, 20]);
    expect(outcomes(full.applied)).toEqual(['DONE']);
    const called = run(
      log([
        { type: 'OPEN_DAY', config: config() },
        issue(1, { partySize: 2, infant: 'WITH_INFANT' }),
        { type: 'CALL_NEXT' },
        join(1, 'INFANT'),
      ]),
    );
    expect(outcomes(called.applied)).toEqual(['NOT_ALLOWED']);
    // Refused, the pass leaves the count as it was: the infant is still the adult's.
    expect(called.day.partyGrowth('t-1', 1, 'INFANT')).toBe(0);
  });
});

describe('the log of a day', () => {
  it('rebuilds the same day: the same results, events and tickets', () => {
    fc.assert(
      fc.property(dayArb, (records) => {
        const first = run(records);
        const again = CheckpointDay.replay(records);
        expect(again.tickets()).toEqual(first.day.tickets());
        expect(again.prepareWindow()).toEqual(first.day.prepareWindow());
        expect(again.board()).toEqual(first.day.board());
        // The board shows the tickets called, the latest first, and the window in call order.
        const board = first.day.board();
        const called = first.day
          .tickets()
          .filter((t) => t.state === 'CALLED' || t.state === 'RECALLED');
        expect(board.called.map((c) => c.number).sort()).toEqual(
          called.map((t) => t.number).sort(),
        );
        for (const c of board.called) {
          const t = called.find((x) => x.number === c.number);
          expect(c.second).toBe(t?.state === 'RECALLED');
          expect(c.calledAtMs).toBe(t?.lastCalledAtMs);
        }
        const times = board.called.map((c) => c.calledAtMs);
        expect(times).toEqual([...times].sort((a, b) => b - a));
        expect(board.prepare).toEqual(first.day.prepareWindow().map((t) => t.number));
        expect(again.lastSeq).toBe(records.length);
        expect(again.nextDueMs()).toBe(first.day.nextDueMs());
        expect(again.mode).toBe(first.day.mode);
        expect(board.mode).toBe(first.day.mode);
        // Replaying one more time from scratch gives the same events, command by command.
        const third = run(records);
        expect(third.applied).toEqual(first.applied);
      }),
      { numRuns: 200 },
    );
  });

  it("gives the events of the simulator's own queue, driven with the same inputs", () => {
    fc.assert(
      fc.property(dayArb, (records) => {
        const { applied } = run(records);
        const open = records[0]!.command;
        if (open.type !== 'OPEN_DAY') throw new Error('no day');
        const events: QueueEvent[] = [];
        const queue = new CheckpointQueue(open.config.policy, open.config.classification, {
          listener: (e) => events.push(e),
        });
        const estimates = estimatesOf(open.config);
        for (const { command, atMs } of records.slice(1)) {
          if (command.type === 'ISSUE_TICKET') {
            queue.issue(
              {
                id: command.ticketId,
                segment: command.segment,
                deadline: command.deadline,
                walkEstimateMs: command.walkEstimateMs,
                partySize: command.partySize,
                presentedAtMs: atMs,
                scheduledDepartureMs: command.scheduledDepartureMs,
                flightId: command.flightId,
              },
              atMs,
              estimates,
            );
          } else if (command.type === 'CALL_NEXT') {
            queue.callNext(atMs, estimates);
          } else if (command.type === 'PRESENT') {
            queue.present(command.ticketId, atMs, estimates);
          } else if (command.type === 'ADVANCE') {
            queue.advance(atMs);
          } else if (command.type === 'RECALL') {
            queue.recall(command.ticketId, atMs, estimates);
          } else if (command.type === 'MARK_NO_SHOW') {
            queue.markNoShow(command.ticketId, atMs, estimates);
          } else if (command.type === 'REACTIVATE') {
            queue.reactivate(command.ticketId, atMs, estimates);
          } else if (command.type === 'HOLD') {
            queue.hold(command.ticketId, atMs, estimates);
          } else if (command.type === 'CANCEL') {
            queue.cancel(command.ticketId, atMs, estimates);
          } else if (command.type === 'RESOLVE_REVIEW') {
            queue.resolve(command.ticketId, command.decision, atMs, estimates);
          } else if (command.type === 'ADD_TO_PARTY') {
            queue.grow(command.ticketId, command.people, atMs, estimates);
          } else if (command.type === 'SET_MODE') {
            queue.setMode(command.mode, atMs, estimates, command.reset);
          }
        }
        expect(applied.slice(1).flatMap((a) => a.events)).toEqual(events);
      }),
      { numRuns: 200 },
    );
  });
});
