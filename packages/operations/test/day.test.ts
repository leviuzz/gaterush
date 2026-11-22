import fc from 'fast-check';
import type { KnownDeadline } from '@gateflow/domain';
import {
  CHECKPOINT_MODES,
  CheckpointQueue,
  FIFO_POLICY,
  OVERRIDES,
  OVERRIDE_REASONS,
  PRIORITY_V3_POLICY,
  VIRTUAL_FIFO_POLICY,
  classificationOf,
  withLaneMode,
} from '@gateflow/queue-core';
import type { CheckpointMode, Policy, QueueEvent } from '@gateflow/queue-core';
import { describe, expect, it } from 'vitest';
import { CheckpointDay, OperationError, callCountsOf, estimatesOf, overviewOf } from '../src';
import type {
  AddToParty,
  Command,
  CommandRecord,
  DayConfig,
  IssueTicket,
  OverviewInput,
  OverviewTicket,
  TicketSummary,
} from '../src';

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

  it("records a supervisor's overrides with their reason, and the lanes open", () => {
    const { day, applied } = run(
      log([
        { type: 'OPEN_DAY', config: config() },
        issue(1),
        issue(2),
        issue(3),
        { type: 'OVERRIDE', ticketId: 't-3', override: 'CALL_NOW', reason: 'FLIGHT_CLOSING' },
        { type: 'SET_MODE', mode: 'FIFO_ONLY', reset: false },
        { type: 'OVERRIDE', ticketId: 't-2', override: 'BOOST', reason: 'OTHER' },
        { type: 'SET_LANES', lanesOpen: 4 },
      ]),
    );
    expect(applied[4]!.result).toMatchObject({
      type: 'OVERRIDDEN',
      override: 'CALL_NOW',
      reason: 'FLIGHT_CLOSING',
      outcome: 'DONE',
      ticket: { number: 'A003', state: 'CALLED', overridden: true, priority: false },
    });
    expect(applied[4]!.events.map((e) => e.type)).toEqual(['OVERRIDDEN', 'CALLED']);
    // In FIFO_ONLY the order is the order of arrival: refused, and still in the log.
    expect(applied[6]!.result).toMatchObject({ outcome: 'NOT_ALLOWED' });
    expect(applied[6]!.events).toEqual([]);
    expect(applied[7]!.result).toEqual({ type: 'LANES_SET', lanesOpen: 4, previous: 2 });
    expect(day.lanesOpen).toBe(4);
    expect(day.ticket('t-1')?.overridden).toBe(false);
    const at = DAY_START + 2 * MIN;
    const code = (command: Command) => {
      try {
        day.apply({ seq: 9, atMs: at, command });
      } catch (error) {
        return error instanceof OperationError ? error.code : 'other';
      }
      return 'none';
    };
    expect(code({ type: 'SET_LANES', lanesOpen: 0 })).toBe('INVALID_COMMAND');
    expect(code({ type: 'SET_LANES', lanesOpen: 2.5 })).toBe('INVALID_COMMAND');
    expect(code({ type: 'OVERRIDE', ticketId: 'nobody', override: 'BOOST', reason: 'OTHER' })).toBe(
      'UNKNOWN_TICKET',
    );
    expect(
      code({
        type: 'OVERRIDE',
        ticketId: 't-1',
        override: 'BOOST',
        reason: 'VIP',
      } as unknown as Command),
    ).toBe('INVALID_COMMAND');
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

describe('what the digital twin needs (S18)', () => {
  it("gives a flight's tickets what the feed now knows, in every mode", () => {
    const { day, applied } = run(
      log([
        { type: 'OPEN_DAY', config: config() },
        issue(1),
        issue(2),
        issue(4),
        { type: 'CALL_NEXT' },
        { type: 'PRESENT', ticketId: 't-1', method: 'REF' },
        { type: 'SET_MODE', mode: 'EMERGENCY', reset: false },
        {
          type: 'UPDATE_FLIGHT',
          flightId: 'F1',
          deadline: { atMs: DAY_START + 30 * MIN, source: 'FEED' },
        },
        { type: 'UPDATE_FLIGHT', flightId: 'F2', walkEstimateMs: 8 * MIN },
        { type: 'UPDATE_FLIGHT', flightId: 'nobody', walkEstimateMs: 0 },
      ]),
    );
    // t-1 (flight F1) was admitted: only t-4 takes the delay; no event, the log keeps the command.
    expect(applied[7]!.result).toEqual({ type: 'FLIGHT_UPDATED', flightId: 'F1', tickets: 1 });
    expect(applied[7]!.events).toEqual([]);
    expect(applied[8]!.result).toEqual({ type: 'FLIGHT_UPDATED', flightId: 'F2', tickets: 1 });
    expect(applied[9]!.result).toEqual({ type: 'FLIGHT_UPDATED', flightId: 'nobody', tickets: 0 });
    const code = (command: Command) => {
      try {
        day.apply({ seq: 11, atMs: DAY_START + 2 * MIN, command });
      } catch (error) {
        return error instanceof OperationError ? error.code : 'other';
      }
      return 'none';
    };
    const bad = [
      { type: 'UPDATE_FLIGHT', flightId: '', walkEstimateMs: 0 },
      { type: 'UPDATE_FLIGHT', flightId: 'F1' },
      { type: 'UPDATE_FLIGHT', flightId: 'F1', walkEstimateMs: -1 },
      { type: 'UPDATE_FLIGHT', flightId: 'F1', walkEstimateMs: 1.5 },
      { type: 'UPDATE_FLIGHT', flightId: 'F1', deadline: { atMs: 5, source: 'NONE' } },
      { type: 'UPDATE_FLIGHT', flightId: 'F1', deadline: { atMs: null, source: 'FEED' } },
      { type: 'UPDATE_FLIGHT', flightId: 'F1', deadline: { atMs: 5, source: 'GUESS' } },
    ] as unknown as Command[];
    for (const command of bad) expect(code(command)).toBe('INVALID_COMMAND');
  });

  it('keeps the first presentation of a ticket issued again, never later than the issue', () => {
    const earlier = DAY_START - 20 * MIN;
    const { day } = run(
      log([{ type: 'OPEN_DAY', config: config() }, issue(1, { presentedAtMs: earlier }), issue(2)]),
    );
    expect(day.presentedAtMs('t-1')).toBe(earlier);
    expect(day.presentedAtMs('t-2')).toBe(DAY_START + 20_000);
    expect(day.presentedAtMs('nobody')).toBeUndefined();
    const code = (command: Command) => {
      try {
        day.apply({ seq: 4, atMs: DAY_START + MIN, command });
      } catch (error) {
        return error instanceof OperationError ? error.code : 'other';
      }
      return 'none';
    };
    expect(code(issue(3, { presentedAtMs: DAY_START + MIN + 1 }))).toBe('INVALID_COMMAND');
    expect(code(issue(3, { presentedAtMs: -1 }))).toBe('INVALID_COMMAND');
    expect(code(issue(3, { presentedAtMs: 0.5 }))).toBe('INVALID_COMMAND');
    expect(code(issue(3, { source: 'TWIN', presentedAtMs: DAY_START + MIN }))).toBe('none');
    expect(day.ticket('t-3')?.source).toBe('TWIN');
  });

  it('changes the estimates with the lanes, and the classes at the next decision only', () => {
    // Twelve families fill the prepare window (ten) and wait ahead of a flight closing in 40
    // minutes: in time with six lanes, at risk with one.
    const crowd = Array.from({ length: 12 }, (_, i) =>
      issue(i + 1, { deadline: { atMs: DAY_START + 300 * MIN, source: 'FEED' }, partySize: 4 }),
    );
    const late = issue(13, { deadline: { atMs: DAY_START + 40 * MIN, source: 'FEED' } });
    const { day, applied } = run(
      log(
        [
          { type: 'OPEN_DAY', config: config(PRIORITY_V3_POLICY, { lanesOpen: 6 }) },
          ...crowd,
          late,
          { type: 'SET_LANES', lanesOpen: 1 },
        ],
        Array.from({ length: 15 }, () => DAY_START),
      ),
    );
    expect(day.ticket('t-13')).toMatchObject({ state: 'QUEUED', riskClass: 'NORMAL' });
    // The lanes changed: no event, and the class of the waiting ticket as at its last decision.
    expect(applied[14]!.result).toEqual({ type: 'LANES_SET', lanesOpen: 1, previous: 6 });
    expect(applied[14]!.events).toEqual([]);
    expect(day.ticket('t-13')?.riskClass).toBe('NORMAL');
    // The next decision sees one lane.
    day.apply({ seq: 16, atMs: DAY_START + MIN, command: issue(14) });
    expect(day.ticket('t-13')?.riskClass).toBe('ATTENTION');
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
            // A ticket issued again keeps an earlier first presentation (S18).
            earlierMin: fc.option(fc.integer({ min: 0, max: 60 }), { freq: 4 }),
          }),
        },
        { weight: 3, arbitrary: fc.record({ kind: fc.constant('call' as const) }) },
        {
          weight: 3,
          arbitrary: fc.record({ kind: fc.constant('present' as const), pick: fc.nat() }),
        },
        // The scheduler's timeouts and the staff's actions (S15).
        { weight: 2, arbitrary: fc.record({ kind: fc.constant('advance' as const) }) },
        // The supervisor's modes, overrides and lanes (S17).
        {
          weight: 1,
          arbitrary: fc.record({
            kind: fc.constant('mode' as const),
            mode: fc.constantFrom(...CHECKPOINT_MODES),
            reset: fc.boolean(),
          }),
        },
        {
          weight: 1,
          arbitrary: fc.record({
            kind: fc.constant('override' as const),
            override: fc.constantFrom(...OVERRIDES),
            reason: fc.constantFrom(...OVERRIDE_REASONS),
            pick: fc.nat(),
          }),
        },
        {
          weight: 1,
          arbitrary: fc.record({
            kind: fc.constant('lanes' as const),
            lanesOpen: fc.integer({ min: 1, max: 4 }),
          }),
        },
        // The flight feed (S18).
        {
          weight: 1,
          arbitrary: fc.record({
            kind: fc.constant('flight' as const),
            flight: fc.integer({ min: 0, max: 2 }),
            deadlineMin: fc.option(fc.integer({ min: 5, max: 120 })),
            walkMin: fc.option(fc.integer({ min: 0, max: 15 })),
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
      if (step.kind === 'override') {
        if (issued === 0) return;
        commands.push({
          type: 'OVERRIDE',
          ticketId: `t-${(step.pick % issued) + 1}`,
          override: step.override,
          reason: step.reason,
        });
      } else if (step.kind === 'lanes') {
        commands.push({ type: 'SET_LANES', lanesOpen: step.lanesOpen });
      } else if (step.kind === 'flight') {
        if (step.deadlineMin === null && step.walkMin === null) return;
        commands.push({
          type: 'UPDATE_FLIGHT',
          flightId: `F${String(step.flight)}`,
          ...(step.deadlineMin === null
            ? {}
            : { deadline: { atMs: t + step.deadlineMin * MIN, source: 'FEED' as const } }),
          ...(step.walkMin === null ? {} : { walkEstimateMs: step.walkMin * MIN }),
        });
      } else if (step.kind === 'mode') {
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
            ...(step.earlierMin === null ? {} : { presentedAtMs: t - step.earlierMin * MIN }),
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
        expect(again.lanesOpen).toBe(first.day.lanesOpen);
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
        let estimates = estimatesOf(open.config);
        for (const { command, atMs } of records.slice(1)) {
          if (command.type === 'ISSUE_TICKET') {
            queue.issue(
              {
                id: command.ticketId,
                segment: command.segment,
                deadline: command.deadline,
                walkEstimateMs: command.walkEstimateMs,
                partySize: command.partySize,
                presentedAtMs: command.presentedAtMs ?? atMs,
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
          } else if (command.type === 'OVERRIDE') {
            queue.override(command.ticketId, command.override, command.reason, atMs, estimates);
          } else if (command.type === 'SET_LANES') {
            // The estimates follow; the queue is not touched, as in the simulator (S18).
            estimates = estimatesOf({ ...open.config, lanesOpen: command.lanesOpen });
          } else if (command.type === 'UPDATE_FLIGHT') {
            queue.updateFlight(
              command.flightId,
              {
                ...(command.deadline === undefined ? {} : { deadline: command.deadline }),
                ...(command.walkEstimateMs === undefined
                  ? {}
                  : { walkEstimateMs: command.walkEstimateMs }),
              },
              atMs,
              estimates,
            );
          }
        }
        expect(applied.slice(1).flatMap((a) => a.events)).toEqual(events);
      }),
      { numRuns: 200 },
    );
  });
});

describe('what the current state needs from each command (S20)', () => {
  /** The tickets each command names: those of its events, and those it changed without one. */
  const named = (applied: { events: readonly object[]; changed: readonly string[] }) =>
    new Set([
      ...applied.events.flatMap((e) =>
        'ticketId' in e && typeof e.ticketId === 'string' ? [e.ticketId] : [],
      ),
      ...applied.changed,
    ]);

  it('names every ticket whose summary changed: a store of those stays equal to the day', () => {
    let silent = 0;
    fc.assert(
      fc.property(dayArb, (records) => {
        const [first, ...rest] = records;
        const { day } = CheckpointDay.open(first!);
        const store = new Map<string, TicketSummary>();
        for (const record of rest) {
          const applied = day.apply(record);
          silent += applied.changed.length;
          for (const id of named(applied)) {
            const ticket = day.ticket(id);
            if (ticket !== undefined) store.set(id, ticket);
          }
          // After every command: nothing the store lacks, nothing out of date.
          expect(store).toEqual(new Map(day.tickets().map((t) => [t.ticketId, t])));
        }
      }),
      { numRuns: 200 },
    );
    // The random days do change tickets without an event: the property is not empty.
    expect(silent).toBeGreaterThan(0);
  });

  it('names a waiting ticket whose class a decision changed, and the people who overtook one', () => {
    const crowd = Array.from({ length: 12 }, (_, i) =>
      issue(i + 1, { deadline: { atMs: DAY_START + 300 * MIN, source: 'FEED' }, partySize: 4 }),
    );
    const { day } = run(
      log(
        [
          { type: 'OPEN_DAY', config: config(PRIORITY_V3_POLICY, { lanesOpen: 6 }) },
          ...crowd,
          issue(13, { deadline: { atMs: DAY_START + 40 * MIN, source: 'FEED' } }),
          { type: 'SET_LANES', lanesOpen: 1 },
        ],
        Array.from({ length: 15 }, () => DAY_START),
      ),
    );
    expect(day.ticket('t-13')?.riskClass).toBe('NORMAL');
    // The next decision sees one lane: t-13 is now at risk, with no event of its own.
    const next = day.apply({ seq: 16, atMs: DAY_START + MIN, command: issue(14) });
    expect(day.ticket('t-13')?.riskClass).toBe('ATTENTION');
    expect(next.events.some((e) => 'ticketId' in e && e.ticketId === 't-13')).toBe(false);
    expect(next.changed).toContain('t-13');
    // Presented first, every ticket says when; nobody has overtaken anybody yet.
    expect(day.ticket('t-14')).toMatchObject({ presentedAtMs: DAY_START + MIN, overtaken: 0 });
  });
});

describe('the figures of a day (S20)', () => {
  const ticket = (overrides: Partial<OverviewTicket>): OverviewTicket => ({
    state: 'QUEUED',
    partySize: 1,
    riskClass: 'NORMAL',
    presentedAtMs: DAY_START,
    admittedAtMs: null,
    overtaken: 0,
    ...overrides,
  });
  const input = (overrides: Partial<OverviewInput>): OverviewInput => ({
    nowMs: DAY_START + 120 * MIN,
    mode: 'NORMAL',
    lanesOpen: 3,
    tickets: [],
    calls: { commitments: 0, priorityCommitments: 0, passedPeople: 0, overrides: 0 },
    overtakeBound: 30,
    maxDeadlineAgeMs: 30 * MIN,
    flights: [],
    ...overrides,
  });

  it('counts waits per person, from the first presentation to the admission, as the simulator', () => {
    const now = DAY_START + 120 * MIN;
    const admitted = (waitMin: number, atMin: number, partySize = 1) =>
      ticket({
        state: 'ADMITTED',
        partySize,
        presentedAtMs: DAY_START + (atMin - waitMin) * MIN,
        admittedAtMs: DAY_START + atMin * MIN,
      });
    const o = overviewOf(
      input({
        nowMs: now,
        tickets: [
          admitted(10, 30), // over an hour ago: the day's only
          admitted(20, 70, 3), // in the last hour, a family of three
          admitted(40, 110),
          ticket({ presentedAtMs: now - 25 * MIN, partySize: 2 }),
          ticket({ state: 'CALLED', presentedAtMs: now - 5 * MIN }),
        ],
      }),
    );
    // The day: 10, 20, 20, 20, 40 minutes; type 7 quantiles.
    expect(o.waits.day).toEqual({ people: 5, p50Ms: 20 * MIN, p90Ms: 32 * MIN, maxMs: 40 * MIN });
    // The last hour: 20, 20, 20, 40.
    expect(o.waits.lastHour).toEqual({
      people: 4,
      p50Ms: 20 * MIN,
      p90Ms: 34 * MIN,
      maxMs: 40 * MIN,
    });
    // Waiting now, so far: 25, 25 and 5 minutes.
    expect(o.waitingNow).toEqual({ people: 3, p50Ms: 25 * MIN, p90Ms: 25 * MIN, maxMs: 25 * MIN });
    expect(o.tickets.waiting).toEqual({ tickets: 1, people: 2 });
    expect(o.tickets.called).toEqual({ tickets: 1, people: 1 });
    expect(o.tickets.admitted).toEqual({ tickets: 3, people: 5 });
    expect(overviewOf(input({})).waits).toEqual({ lastHour: null, day: null });
  });

  it('shows who is at risk, the fairness of the calls, the data and the alerts', () => {
    const now = DAY_START + 120 * MIN;
    const o = overviewOf(
      input({
        nowMs: now,
        mode: 'PAUSED',
        tickets: [
          ticket({ riskClass: 'CRITICAL', partySize: 2, overtaken: 4 }),
          ticket({ state: 'PREPARE', riskClass: 'URGENT', overtaken: 9 }),
          ticket({ riskClass: 'ATTENTION' }),
          ticket({ riskClass: 'UNVERIFIED', partySize: 3 }),
          // Called: no longer waiting for its call, so not "at risk"; overtaken still counts.
          ticket({ state: 'CALLED', riskClass: 'CRITICAL', overtaken: 12 }),
          ticket({ state: 'REVIEW' }),
          // Admitted: out of play.
          ticket({ state: 'ADMITTED', overtaken: 40, admittedAtMs: now - MIN }),
        ],
        calls: { commitments: 20, priorityCommitments: 3, passedPeople: 11, overrides: 1 },
        flights: [
          { source: 'FEED', observedAtMs: now - 31 * MIN },
          { source: 'FEED', observedAtMs: now - 29 * MIN },
          { source: 'FEED', observedAtMs: null },
          { source: 'RULE', observedAtMs: null },
          { source: 'NONE', observedAtMs: null },
        ],
      }),
    );
    expect(o.atRisk).toEqual({
      ATTENTION: { tickets: 1, people: 1 },
      URGENT: { tickets: 1, people: 1 },
      CRITICAL: { tickets: 1, people: 2 },
    });
    expect(o.fairness).toEqual({
      commitments: 20,
      priorityCommitments: 3,
      passedPeople: 11,
      overrides: 1,
      mostOvertaken: 12,
      overtakeBound: 30,
    });
    expect(o.dataQuality).toEqual({
      flights: 5,
      feed: 3,
      rule: 1,
      none: 1,
      staleAfterMs: 30 * MIN,
      stale: 1,
      unverified: { tickets: 1, people: 3 },
    });
    expect(o.alerts).toEqual([
      { code: 'CRITICAL_WAITING', severity: 'CRITICAL', count: 1 },
      { code: 'CALLS_PAUSED', severity: 'WARNING', count: null },
      { code: 'REVIEWS_PENDING', severity: 'WARNING', count: 1 },
      { code: 'STALE_FLIGHT_DATA', severity: 'WARNING', count: 1 },
    ]);
    // Without a stale-data rule, no flight is stale.
    expect(overviewOf(input({ maxDeadlineAgeMs: null })).dataQuality.stale).toBeNull();
    expect(overviewOf(input({ mode: 'EMERGENCY' })).alerts).toEqual([
      { code: 'EMERGENCY', severity: 'CRITICAL', count: null },
    ]);
  });

  it('counts the commitments and overrides of a day from its events', () => {
    fc.assert(
      fc.property(dayArb, (records) => {
        const { day, applied } = run(records);
        const calls = callCountsOf(applied.flatMap((a) => a.events));
        const events = applied.flatMap((a) => a.events);
        expect(calls.commitments).toBe(events.filter((e) => e.type === 'COMMITTED').length);
        expect(calls.overrides).toBe(events.filter((e) => e.type === 'OVERRIDDEN').length);
        // Every ticket that jumped the order counts at least one priority commitment.
        const prioritized = day.tickets().filter((t) => t.priority).length;
        expect(calls.priorityCommitments).toBeGreaterThanOrEqual(prioritized);
      }),
      { numRuns: 100 },
    );
  });
});
