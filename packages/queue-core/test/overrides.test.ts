import { MS_PER_MINUTE } from '@gateflow/domain';
import type { CheckpointEstimates } from '@gateflow/priority-engine';
import { describe, expect, it } from 'vitest';
import {
  CheckpointQueue,
  DEFAULT_VIRTUAL_QUEUE,
  PRIORITY_V0_POLICY,
  PRIORITY_V0_SELECTION,
  classificationOf,
} from '../src';
import type { Policy, QueueEvent, TicketInput } from '../src';

/*
 * A supervisor's overrides (S17), with a coded reason: a boost puts a waiting ticket in the
 * prepare window at once, after the tickets already announced; a call now calls a ticket at once.
 * Neither is the engine's decision: they count neither in its cap nor in its overtakes, but apart.
 * The lanes open change the estimates: the waiting tickets are assessed again at once.
 */

const MIN = MS_PER_MINUTE;
const CLASSIFICATION = classificationOf(PRIORITY_V0_POLICY)!;
/** One person per minute. */
const EST: CheckpointEstimates = { throughputPerHour: 60, processMs: 0, responseMs: 0 };

function ticket(id: string, partySize = 1, deadlineMin: number | null = null): TicketInput {
  return {
    id,
    segment: 'DEPARTING',
    deadline:
      deadlineMin === null
        ? { atMs: null, source: 'NONE' }
        : { atMs: deadlineMin * MIN, source: 'FEED' },
    walkEstimateMs: 0,
    partySize,
  };
}

function policy(prepareWindowSize = 2): Policy {
  return {
    id: 'test',
    version: '0',
    title: 'test',
    selection: { ...PRIORITY_V0_SELECTION, safetyBufferMs: 0, feasibilityMarginMs: 0 },
    queue: { ...DEFAULT_VIRTUAL_QUEUE, prepareWindowSize },
  };
}

function queue(events: QueueEvent[] = [], prepareWindowSize = 2) {
  return new CheckpointQueue(policy(prepareWindowSize), CLASSIFICATION, {
    listener: (e) => events.push(e),
  });
}

/** a, b in the window; c, d (two people), e waiting. */
function five(q: CheckpointQueue): void {
  q.issue(ticket('a'), 0, EST);
  q.issue(ticket('b'), 0, EST);
  q.issue(ticket('c'), 0, EST);
  q.issue(ticket('d', 2), 0, EST);
  q.issue(ticket('e'), 0, EST);
}

const windowOf = (q: CheckpointQueue) => q.prepareWindow().map((t) => t.id);

describe("a supervisor's overrides (S17)", () => {
  it('boosts a waiting ticket into the window at once, after the numbers announced', () => {
    const events: QueueEvent[] = [];
    const q = queue(events);
    five(q);
    expect(windowOf(q)).toEqual(['a', 'b']);
    const before = events.length;
    expect(q.override('e', 'BOOST', 'FLIGHT_CLOSING', MIN, EST)).toBe('DONE');
    // Nobody announced loses a place: the window holds one more.
    expect(windowOf(q)).toEqual(['a', 'b', 'e']);
    expect(q.ticket('e')).toMatchObject({ state: 'PREPARE', overridden: true });
    expect(events.slice(before)).toEqual([
      {
        type: 'OVERRIDDEN',
        ticketId: 'e',
        atMs: MIN,
        override: 'BOOST',
        reason: 'FLIGHT_CLOSING',
        // c and d, three people, were to be called before e.
        passedTickets: 2,
        passedPeople: 3,
      },
    ]);
    // Counted apart: not a priority call of the engine, nobody overtaken by its count.
    expect(q.stats()).toMatchObject({
      boosts: 1,
      callsNow: 0,
      overridePeople: 1,
      priorityCommitments: 0,
    });
    expect([q.ticket('c')?.overtakenCount, q.ticket('d')?.overtakenCount]).toEqual([0, 0]);
    // The window goes back to its size by calls: a and b, then e, then the order of arrival.
    expect(q.callNext(2 * MIN, EST)?.id).toBe('a');
    expect(windowOf(q)).toEqual(['b', 'e']);
    expect(q.callNext(3 * MIN, EST)?.id).toBe('b');
    expect(windowOf(q)).toEqual(['e', 'c']);
    expect(q.callNext(4 * MIN, EST)?.id).toBe('e');
  });

  it('calls a ticket now, waiting or announced', () => {
    const events: QueueEvent[] = [];
    const q = queue(events);
    five(q);
    let before = events.length;
    expect(q.override('d', 'CALL_NOW', 'ASSISTANCE', MIN, EST)).toBe('DONE');
    expect(q.ticket('d')).toMatchObject({ state: 'CALLED', calls: 1, lastCalledAtMs: MIN });
    // The window and c were to be called before d.
    expect(events.slice(before).map((e) => e.type)).toEqual(['OVERRIDDEN', 'CALLED']);
    expect(events[before]).toMatchObject({ passedTickets: 3, passedPeople: 3 });
    expect(windowOf(q)).toEqual(['a', 'b']);
    // Announced: it leaves the window, which takes the next ticket.
    before = events.length;
    expect(q.override('b', 'CALL_NOW', 'AIRLINE_REQUEST', 2 * MIN, EST)).toBe('DONE');
    expect(events[before]).toMatchObject({ passedTickets: 1, passedPeople: 1 });
    expect(windowOf(q)).toEqual(['a', 'c']);
    expect(q.stats()).toMatchObject({ callsNow: 2, overridePeople: 3, calls: 2, commitments: 3 });
    // Its call timers run as any call's: a second call after the call timeout.
    const due = q.nextDueMs();
    expect(due).not.toBeNull();
    q.advance(due!);
    expect(q.ticket('d')?.state).toBe('RECALLED');
  });

  it('follows the modes, and refuses tickets in other states', () => {
    const q = queue();
    five(q);
    // Announced already, or called: a boost has nothing to do.
    expect(q.override('a', 'BOOST', 'OTHER', 0, EST)).toBe('NOT_ALLOWED');
    q.callNext(0, EST);
    expect(q.override('a', 'CALL_NOW', 'OTHER', 0, EST)).toBe('NOT_ALLOWED');
    expect(q.override('zz', 'BOOST', 'OTHER', 0, EST)).toBe('UNKNOWN_TICKET');
    // In FIFO_ONLY the order is the order of arrival.
    q.setMode('FIFO_ONLY', 0, EST);
    expect(q.override('e', 'BOOST', 'OTHER', 0, EST)).toBe('NOT_ALLOWED');
    expect(q.override('e', 'CALL_NOW', 'OTHER', 0, EST)).toBe('NOT_ALLOWED');
    // Paused: a boost prepares the window, but nobody is called.
    q.setMode('PAUSED', 0, EST);
    expect(q.override('e', 'CALL_NOW', 'OTHER', 0, EST)).toBe('NOT_ALLOWED');
    expect(q.override('e', 'BOOST', 'OTHER', 0, EST)).toBe('DONE');
    // In an emergency, nothing moves.
    q.setMode('EMERGENCY', 0, EST);
    expect(q.override('d', 'BOOST', 'OTHER', 0, EST)).toBe('NOT_ALLOWED');
    expect(q.override('d', 'CALL_NOW', 'OTHER', 0, EST)).toBe('NOT_ALLOWED');
    expect(q.stats()).toMatchObject({ boosts: 1, callsNow: 0 });
    // A command read back from a log is not trusted to carry known values.
    expect(() => q.override('d', 'SKIP' as 'BOOST', 'OTHER', 0, EST)).toThrow(/unknown override/);
    expect(() => q.override('d', 'BOOST', 'VIP' as 'OTHER', 0, EST)).toThrow(/unknown reason/);
  });

  it('calls a boosted ticket first when the queue has no window', () => {
    const q = queue([], 0);
    five(q);
    expect(windowOf(q)).toEqual([]);
    expect(q.override('d', 'BOOST', 'OPERATIONAL', 0, EST)).toBe('DONE');
    expect(windowOf(q)).toEqual(['d']);
    expect(q.callNext(MIN, EST)?.id).toBe('d');
    expect(q.callNext(2 * MIN, EST)?.id).toBe('a');
  });

  it('puts a boosted ticket back at its place when the supervisor resets the window', () => {
    const q = queue();
    five(q);
    q.override('e', 'BOOST', 'OTHER', 0, EST);
    q.setMode('PAUSED', 0, EST);
    q.setMode('NORMAL', MIN, EST, true);
    expect(windowOf(q)).toEqual(['a', 'b']);
    expect(q.ticket('e')).toMatchObject({ state: 'QUEUED', overridden: true });
  });

  it('assesses the waiting tickets with new estimates at its next decision', () => {
    const q = queue();
    for (const id of ['a', 'b', 'c', 'd', 'e', 'f']) q.issue(ticket(id, 1, 600), 0, EST);
    // g must be called within 9 minutes: with one person a minute its turn comes in time; with a
    // tenth of the capacity, it does not.
    q.issue(ticket('g', 1, 9), 0, EST);
    const before = q.ticket('g')!.riskClass;
    // The lanes close (S18): the classes follow at the next decision, as in the simulator.
    q.issue(ticket('h', 1, 600), MIN, { ...EST, throughputPerHour: 6 });
    expect(q.ticket('g')!.riskClass).not.toBe(before);
    expect(q.stats().classChanges).toBeGreaterThan(0);
    expect(windowOf(q)).toEqual(['a', 'b']);
  });
});
