import { MS_PER_MINUTE } from '@gateflow/domain';
import type { CheckpointEstimates } from '@gateflow/priority-engine';
import { describe, expect, it } from 'vitest';
import {
  CheckpointQueue,
  DEFAULT_VIRTUAL_QUEUE,
  FIFO_POLICY,
  PRIORITY_V0_POLICY,
  TICKET_STATES,
  VIRTUAL_FIFO_POLICY,
  classificationOf,
} from '../src';
import type { Policy, QueueEvent, TicketInput, TicketState, VirtualQueue } from '../src';
import { ACTIONS, TRANSITIONS, act as actWith } from './staff-actions';
import type { Action } from './staff-actions';

/*
 * The staff actions of the live product (S15): every state against every action. An action the
 * state does not allow is refused and changes nothing; the others make exactly the transitions of
 * the ticket's state machine (kickoff 2.8).
 */

const MIN = MS_PER_MINUTE;
const CLASSIFICATION = classificationOf(PRIORITY_V0_POLICY)!;
const EST: CheckpointEstimates = { throughputPerHour: 60, processMs: 0, responseMs: 0 };
/** T1 and T2 of the tests: a second call after 3 minutes, a no-show 2 minutes later. */
const T1 = 3 * MIN;
const T2 = 2 * MIN;

function ticket(id: string): TicketInput {
  return { id, segment: 'DEPARTING', deadline: { atMs: null, source: 'NONE' }, walkEstimateMs: 0 };
}

const act = (q: CheckpointQueue, action: Action, id: string, now: number) =>
  actWith(q, action, id, now, EST);

function virtual(overrides: Partial<VirtualQueue> = {}): Policy {
  return {
    id: 'test',
    version: '0',
    title: 'test',
    selection: VIRTUAL_FIFO_POLICY.selection,
    queue: {
      ...DEFAULT_VIRTUAL_QUEUE,
      prepareWindowSize: 0,
      callTimeoutMs: T1,
      recallTimeoutMs: T2,
      reactivationWindowMs: 10 * MIN,
      maxReactivations: 1,
      ...overrides,
    },
  };
}

/**
 * A queue with ticket `t` in `state` at the returned time, and `u` behind it (QUEUED, or in the
 * prepare window for a ticket in PREPARE).
 */
function inState(state: TicketState, events: QueueEvent[]): { q: CheckpointQueue; now: number } {
  const window = state === 'PREPARE' ? 2 : 0;
  const q = new CheckpointQueue(virtual({ prepareWindowSize: window }), CLASSIFICATION, {
    listener: (e) => events.push(e),
  });
  q.issue(ticket('t'), 0, EST);
  q.issue(ticket('u'), 0, EST);
  let now = 0;
  const call = () => {
    now += MIN;
    expect(q.callNext(now, EST)?.id).toBe('t');
  };
  switch (state) {
    case 'QUEUED':
    case 'PREPARE':
      break;
    case 'CALLED':
      call();
      break;
    case 'RECALLED':
      call();
      now += T1;
      q.advance(now);
      break;
    case 'NO_SHOW':
      call();
      now += T1 + T2;
      q.advance(now);
      break;
    case 'EXPIRED':
      call();
      now += T1 + T2 + 10 * MIN;
      q.advance(now);
      break;
    case 'ADMITTED':
      call();
      now += MIN;
      expect(q.present('t', now, EST)).toBe('ADMITTED');
      break;
    case 'REVIEW':
      expect(q.hold('t', now, EST)).toBe('DONE');
      break;
    case 'CANCELLED':
      expect(q.cancel('t', now, EST)).toBe('DONE');
      break;
  }
  expect(q.ticket('t')?.state).toBe(state);
  return { q, now: now + 1000 };
}

describe('staff actions on the ticket state machine (S15)', () => {
  it.each(TICKET_STATES)(
    '%s: each action is allowed or refused as the state machine says',
    (state) => {
      for (const action of ACTIONS) {
        const events: QueueEvent[] = [];
        const { q, now } = inState(state, events);
        const before = JSON.stringify([q.ticket('t'), q.ticket('u'), q.stats()]);
        const seen = events.length;
        const outcome = act(q, action, 't', now);
        const target = TRANSITIONS[state][action];
        if (target === undefined) {
          expect(outcome, `${action} on ${state}`).toBe('NOT_ALLOWED');
          // Refused: nothing changed, nothing reported.
          expect(JSON.stringify([q.ticket('t'), q.ticket('u'), q.stats()])).toBe(before);
          expect(events.length).toBe(seen);
        } else {
          expect(outcome, `${action} on ${state}`).toBe('DONE');
          expect(q.ticket('t')?.state, `${action} on ${state}`).toBe(target);
          expect(events.length).toBeGreaterThan(seen);
        }
      }
    },
  );

  it('refuses unknown tickets', () => {
    const q = new CheckpointQueue(virtual(), CLASSIFICATION);
    for (const action of ACTIONS) expect(act(q, action, 'nobody', 0)).toBe('UNKNOWN_TICKET');
  });

  it('counts the no-show timeout from the second call, by staff or by the first timeout', () => {
    const q = new CheckpointQueue(virtual(), CLASSIFICATION);
    q.issue(ticket('a'), 0, EST);
    q.issue(ticket('b'), 0, EST);
    expect(q.callNext(0, EST)?.id).toBe('a');
    expect(q.callNext(0, EST)?.id).toBe('b');
    // Staff call `a` again after 30 seconds: its no-show is due T2 later, before `b`'s recall.
    const recalled = 30_000;
    expect(q.recall('a', recalled, EST)).toBe('DONE');
    expect(q.nextDueMs()).toBe(recalled + T2);
    q.advance(recalled + T2);
    expect(q.ticket('a')?.state).toBe('NO_SHOW');
    expect(q.ticket('b')?.state).toBe('CALLED');
    // `b` is called again by the first timeout, at T1: its no-show is due at T1 + T2.
    q.advance(T1);
    expect(q.ticket('b')?.state).toBe('RECALLED');
    expect(q.nextDueMs()).toBe(T1 + T2);
    // A staff recall of `b` moves its no-show later; `a` expires 10 minutes after its no-show.
    expect(q.recall('b', T1 + MIN, EST)).toBe('DONE');
    expect(q.nextDueMs()).toBe(Math.min(T1 + MIN + T2, recalled + T2 + 10 * MIN));
  });

  it('marks a no-show at once, and expires it when no reactivation is left', () => {
    const events: QueueEvent[] = [];
    const q = new CheckpointQueue(virtual({ maxReactivations: 0 }), CLASSIFICATION, {
      listener: (e) => events.push(e),
    });
    q.issue(ticket('a'), 0, EST);
    q.callNext(0, EST);
    expect(q.markNoShow('a', 30_000, EST)).toBe('DONE');
    expect(q.ticket('a')?.state).toBe('EXPIRED');
    expect(events.map((e) => e.type)).toEqual([
      'ISSUED',
      'COMMITTED',
      'CALLED',
      'NO_SHOW',
      'EXPIRED',
    ]);
    expect(q.nextDueMs()).toBeNull();
  });

  it('keeps the place of a ticket under review', () => {
    const q = new CheckpointQueue(virtual(), CLASSIFICATION);
    for (const id of ['a', 'b', 'c']) q.issue(ticket(id), 0, EST);
    expect(q.hold('a', MIN, EST)).toBe('DONE');
    expect(q.waitingCount).toBe(2);
    expect(q.present('a', MIN, EST)).toBe('UNDER_REVIEW');
    expect(q.callNext(2 * MIN, EST)?.id).toBe('b');
    expect(q.resolve('a', 'QUEUE', 3 * MIN, EST)).toBe('DONE');
    // Back at its place: ahead of `c`, which came after it.
    expect(q.callNext(4 * MIN, EST)?.id).toBe('a');
    expect(q.callNext(5 * MIN, EST)?.id).toBe('c');
  });

  it('refills the prepare window when staff take a ticket out of it, and never churns it', () => {
    const q = new CheckpointQueue(virtual({ prepareWindowSize: 2 }), CLASSIFICATION);
    for (const id of ['a', 'b', 'c', 'd']) q.issue(ticket(id), 0, EST);
    expect(q.prepareWindow().map((t) => t.id)).toEqual(['a', 'b']);
    expect(q.hold('a', MIN, EST)).toBe('DONE');
    expect(q.prepareWindow().map((t) => t.id)).toEqual(['b', 'c']);
    expect(q.cancel('b', MIN, EST)).toBe('DONE');
    expect(q.prepareWindow().map((t) => t.id)).toEqual(['c', 'd']);
    // Back from review, `a` waits at its place: the window keeps what it announced.
    expect(q.resolve('a', 'QUEUE', 2 * MIN, EST)).toBe('DONE');
    expect(q.prepareWindow().map((t) => t.id)).toEqual(['c', 'd']);
    expect(q.ticket('a')?.state).toBe('QUEUED');
    expect(q.present('b', 2 * MIN, EST)).toBe('CANCELLED');
  });

  it('brings a no-show back as the policy says, within its window only', () => {
    for (const position of ['ORIGINAL', 'BACK'] as const) {
      const q = new CheckpointQueue(virtual({ reactivationPosition: position }), CLASSIFICATION);
      for (const id of ['a', 'b', 'c']) q.issue(ticket(id), 0, EST);
      q.callNext(0, EST);
      q.advance(T1 + T2);
      expect(q.ticket('a')?.state).toBe('NO_SHOW');
      expect(q.reactivate('a', T1 + T2 + MIN, EST)).toBe('DONE');
      expect(q.callNext(T1 + T2 + 2 * MIN, EST)?.id).toBe(position === 'ORIGINAL' ? 'a' : 'b');
    }
    const late = new CheckpointQueue(virtual(), CLASSIFICATION);
    late.issue(ticket('a'), 0, EST);
    late.callNext(0, EST);
    // The window of reactivation closes 10 minutes after the no-show.
    expect(late.reactivate('a', T1 + T2 + 10 * MIN + 1, EST)).toBe('NOT_ALLOWED');
    expect(late.ticket('a')?.state).toBe('EXPIRED');
  });

  it('lets a party grow while it waits, and calls it as one (S15)', () => {
    const events: QueueEvent[] = [];
    const q = new CheckpointQueue(virtual(), CLASSIFICATION, { listener: (e) => events.push(e) });
    q.issue(ticket('family'), 0, EST);
    expect(q.grow('family', 2, MIN, EST)).toBe('DONE');
    expect(q.grow('family', 1, MIN, EST)).toBe('DONE');
    expect(q.ticket('family')?.partySize).toBe(4);
    expect(q.waitingPeople).toBe(4);
    expect(events.at(-1)).toEqual({
      type: 'PARTY_GROWN',
      ticketId: 'family',
      atMs: MIN,
      partySize: 4,
    });
    expect(() => q.grow('family', -1, MIN, EST)).toThrow(/whole number/);
    // Nobody more (an infant counted already, ADR-046): allowed while it waits, and silent.
    const before = events.length;
    expect(q.grow('family', 0, MIN, EST)).toBe('DONE');
    expect(events.length).toBe(before);
    expect(q.ticket('family')?.partySize).toBe(4);
    expect(q.callNext(2 * MIN, EST)?.partySize).toBe(4);
    expect(q.grow('family', 0, 2 * MIN, EST)).toBe('NOT_ALLOWED');
    // Once called, the party is what it is.
    expect(q.grow('family', 1, 2 * MIN, EST)).toBe('NOT_ALLOWED');
  });

  it('has no calls to answer in a physical queue', () => {
    const q = new CheckpointQueue(FIFO_POLICY, CLASSIFICATION);
    q.issue(ticket('a'), 0, EST);
    expect(q.markNoShow('a', MIN, EST)).toBe('NOT_ALLOWED');
    expect(q.recall('a', MIN, EST)).toBe('NOT_ALLOWED');
    expect(q.hold('a', MIN, EST)).toBe('DONE');
    expect(q.resolve('a', 'QUEUE', MIN, EST)).toBe('DONE');
    expect(q.callNext(2 * MIN, EST)?.id).toBe('a');
  });
});
