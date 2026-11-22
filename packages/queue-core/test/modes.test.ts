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
 * The modes of a checkpoint (S17), set by its supervisor: FIFO_ONLY puts the oldest ticket in the
 * prepare window whatever the policy; PAUSED and EMERGENCY call nobody; an emergency stops the
 * call timers, which start again where they stopped; on resuming, a reset announces the window
 * again in order of arrival.
 */

const MIN = MS_PER_MINUTE;
const CLASSIFICATION = classificationOf(PRIORITY_V0_POLICY)!;
/** One person per minute. */
const EST: CheckpointEstimates = { throughputPerHour: 60, processMs: 0, responseMs: 0 };
const T1 = 3 * MIN;
const T2 = 2 * MIN;

function ticket(id: string, deadlineMin: number | null = null): TicketInput {
  return {
    id,
    segment: 'DEPARTING',
    deadline:
      deadlineMin === null
        ? { atMs: null, source: 'NONE' }
        : { atMs: deadlineMin * MIN, source: 'FEED' },
    walkEstimateMs: 0,
  };
}

/** A priority policy with a window of 2, the test's timeouts and one reactivation. */
const POLICY: Policy = {
  id: 'test',
  version: '0',
  title: 'test',
  selection: { ...PRIORITY_V0_SELECTION, safetyBufferMs: 0, feasibilityMarginMs: 0 },
  queue: {
    ...DEFAULT_VIRTUAL_QUEUE,
    prepareWindowSize: 2,
    callTimeoutMs: T1,
    recallTimeoutMs: T2,
    reactivationWindowMs: 10 * MIN,
    maxReactivations: 1,
  },
};

function queue(events: QueueEvent[] = []) {
  return new CheckpointQueue(POLICY, CLASSIFICATION, { listener: (e) => events.push(e) });
}

/** Tickets with time enough, then e that must be called within 2 minutes (as in queue.test). */
function withUrgent(q: CheckpointQueue, early = ['a', 'b', 'c', 'd']): void {
  for (const id of early) q.issue(ticket(id, 600), 0, EST);
  q.issue(ticket('e', 2), 0, EST);
}

describe('the modes of a checkpoint (S17)', () => {
  it('starts NORMAL, and refuses a change to the same mode or a reset that resumes nothing', () => {
    const events: QueueEvent[] = [];
    const q = queue(events);
    expect(q.mode).toBe('NORMAL');
    expect(q.setMode('NORMAL', 0, EST)).toBe('NOT_ALLOWED');
    expect(q.setMode('FIFO_ONLY', 0, EST, true)).toBe('NOT_ALLOWED');
    expect(q.setMode('PAUSED', 0, EST)).toBe('DONE');
    expect(q.setMode('EMERGENCY', 0, EST, true)).toBe('NOT_ALLOWED');
    expect(events).toEqual([
      { type: 'MODE_CHANGED', atMs: 0, mode: 'PAUSED', previous: 'NORMAL', reset: false },
    ]);
    expect(() => q.setMode('CLOSED' as 'PAUSED', 0, EST)).toThrow(/unknown mode/);
  });

  it('puts the oldest ticket in the window in FIFO_ONLY, whatever the policy', () => {
    const normal = queue();
    withUrgent(normal);
    normal.callNext(0, EST);
    // Under the policy e jumps ahead of c and d (queue.test).
    expect(normal.prepareWindow().map((t) => t.id)).toEqual(['b', 'e']);
    const events: QueueEvent[] = [];
    const fifo = queue(events);
    fifo.setMode('FIFO_ONLY', 0, EST);
    // One more ticket with time enough, so that e is still at risk when NORMAL comes back.
    withUrgent(fifo, ['a', 'b', 'c', 'd', 'f']);
    fifo.callNext(0, EST);
    expect(fifo.prepareWindow().map((t) => t.id)).toEqual(['b', 'c']);
    expect(fifo.ticket('e')?.priorityCommitment).toBe(false);
    expect(fifo.ticket('c')?.overtakenCount).toBe(0);
    const committed = events.filter((e) => e.type === 'COMMITTED');
    expect(committed.every((e) => !e.priority && e.passedTickets === 0)).toBe(true);
    // Back to NORMAL, the policy decides again: e jumps d and f.
    fifo.setMode('NORMAL', 0, EST);
    fifo.callNext(0, EST);
    expect(fifo.prepareWindow().map((t) => t.id)).toEqual(['c', 'e']);
    expect(fifo.ticket('e')?.priorityCommitment).toBe(true);
  });

  it('calls nobody while paused, and lets the timers of those called run', () => {
    const q = queue();
    for (const id of ['a', 'b', 'c']) q.issue(ticket(id), 0, EST);
    expect(q.callNext(0, EST)?.id).toBe('a');
    expect(q.setMode('PAUSED', MIN, EST)).toBe('DONE');
    expect(q.callNext(2 * MIN, EST)).toBeNull();
    // A second call is a call: none while paused.
    expect(q.recall('a', 2 * MIN, EST)).toBe('NOT_ALLOWED');
    // a's timers run: a second call at T1, a no-show at T1 + T2.
    expect(q.nextDueMs()).toBe(T1);
    q.advance(T1 + T2);
    expect(q.ticket('a')?.state).toBe('NO_SHOW');
    // The access point goes on: a, back, waits at its place for the window, full with b and c.
    expect(q.present('a', T1 + T2 + MIN, EST)).toBe('REACTIVATED');
    expect(q.prepareWindow().map((t) => t.id)).toEqual(['b', 'c']);
    expect(q.setMode('NORMAL', 7 * MIN, EST)).toBe('DONE');
    expect(q.callNext(7 * MIN, EST)?.id).toBe('b');
    expect(q.prepareWindow().map((t) => t.id)).toEqual(['c', 'a']);
  });

  it('stops the call timers in an emergency, and starts them again where they stopped', () => {
    const events: QueueEvent[] = [];
    const q = queue(events);
    for (const id of ['a', 'b', 'c', 'd']) q.issue(ticket(id), 0, EST);
    q.callNext(0, EST); // a, its second call due at 3:00
    q.callNext(2 * MIN, EST); // b, due at 5:00
    q.advance(T1); // a: second call at 3:00, no-show due at 5:00
    expect(q.ticket('a')?.state).toBe('RECALLED');
    // The emergency at 4:00: one minute left to a, one to b.
    expect(q.setMode('EMERGENCY', 4 * MIN, EST)).toBe('DONE');
    expect(q.nextDueMs()).toBeNull();
    expect(q.callNext(5 * MIN, EST)).toBeNull();
    q.advance(30 * MIN);
    expect([q.ticket('a')?.state, q.ticket('b')?.state]).toEqual(['RECALLED', 'CALLED']);
    // Staff mark b absent during the emergency: its window to come back starts at the end.
    expect(q.markNoShow('b', 31 * MIN, EST)).toBe('DONE');
    // The end of the emergency at 40:00, after 36 minutes: a's no-show is due at 41:00.
    expect(q.setMode('NORMAL', 40 * MIN, EST)).toBe('DONE');
    expect(q.nextDueMs()).toBe(41 * MIN);
    q.advance(41 * MIN);
    expect(q.ticket('a')?.state).toBe('NO_SHOW');
    // b's 10 minutes start at 40:00: it may come back until 50:00.
    q.advance(49 * MIN);
    expect(q.ticket('b')?.state).toBe('NO_SHOW');
    q.advance(50 * MIN);
    expect(q.ticket('b')?.state).toBe('EXPIRED');
    // a was a no-show at 41:00 (its due time), not before.
    expect(events.find((e) => e.type === 'NO_SHOW' && e.ticketId === 'a')?.atMs).toBe(41 * MIN);
  });

  it('announces the window again in order of arrival on a reset, or keeps it', () => {
    const events: QueueEvent[] = [];
    const q = queue(events);
    withUrgent(q);
    q.callNext(0, EST);
    expect(q.prepareWindow().map((t) => t.id)).toEqual(['b', 'e']);
    q.setMode('EMERGENCY', MIN, EST);
    // Carrying on keeps the window as announced.
    const kept = queue();
    withUrgent(kept);
    kept.callNext(0, EST);
    kept.setMode('PAUSED', MIN, EST);
    kept.setMode('NORMAL', 2 * MIN, EST);
    expect(kept.prepareWindow().map((t) => t.id)).toEqual(['b', 'e']);
    // A reset: b and e go back to waiting at their place; the window is b, c, as they came.
    const before = events.length;
    expect(q.setMode('NORMAL', 2 * MIN, EST, true)).toBe('DONE');
    expect(q.mode).toBe('NORMAL');
    expect(q.prepareWindow().map((t) => t.id)).toEqual(['b', 'c']);
    expect(q.ticket('e')).toMatchObject({ state: 'QUEUED', priorityCommitment: false });
    expect(
      events
        .slice(before)
        .map((e) => (e.type === 'MODE_CHANGED' ? e.type : `${e.type} ${e.ticketId}`)),
    ).toEqual(['MODE_CHANGED', 'UNCOMMITTED b', 'UNCOMMITTED e', 'COMMITTED b', 'COMMITTED c']);
    // A reset into FIFO_ONLY keeps the order of arrival afterwards too.
    const fifo = queue();
    withUrgent(fifo);
    fifo.setMode('PAUSED', 0, EST);
    expect(fifo.setMode('FIFO_ONLY', MIN, EST, true)).toBe('DONE');
    fifo.callNext(MIN, EST);
    expect(fifo.prepareWindow().map((t) => t.id)).toEqual(['b', 'c']);
  });
});
