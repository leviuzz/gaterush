import fc from 'fast-check';
import type { KnownDeadline } from '@gateflow/domain';
import {
  CheckpointQueue,
  FIFO_POLICY,
  PRIORITY_V3_POLICY,
  VIRTUAL_FIFO_POLICY,
  classificationOf,
  withLaneMode,
} from '@gateflow/queue-core';
import type { Policy, QueueEvent } from '@gateflow/queue-core';
import { describe, expect, it } from 'vitest';
import { CheckpointDay, OperationError, estimatesOf } from '../src';
import type { Command, CommandRecord, DayConfig, IssueTicket } from '../src';

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
    steps.forEach((step, i) => {
      t += gaps[i] ?? 0;
      if (step.kind === 'issue') {
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
        if (step.action === 'QUEUE' || step.action === 'REJECT') {
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

describe('the log of a day', () => {
  it('rebuilds the same day: the same results, events and tickets', () => {
    fc.assert(
      fc.property(dayArb, (records) => {
        const first = run(records);
        const again = CheckpointDay.replay(records);
        expect(again.tickets()).toEqual(first.day.tickets());
        expect(again.prepareWindow()).toEqual(first.day.prepareWindow());
        expect(again.lastSeq).toBe(records.length);
        expect(again.nextDueMs()).toBe(first.day.nextDueMs());
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
          }
        }
        expect(applied.slice(1).flatMap((a) => a.events)).toEqual(events);
      }),
      { numRuns: 200 },
    );
  });
});
