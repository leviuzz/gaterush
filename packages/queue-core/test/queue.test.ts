import { MS_PER_MINUTE } from '@gateflow/domain';
import type { CheckpointEstimates } from '@gateflow/priority-engine';
import { describe, expect, it } from 'vitest';
import {
  CheckpointQueue,
  DEFAULT_VIRTUAL_QUEUE,
  FIFO_POLICY,
  PRIORITY_V0_POLICY,
  PRIORITY_V0_SELECTION,
  QueueError,
  VIRTUAL_FIFO_POLICY,
  callAheadTarget,
  classificationOf,
  findPolicyPreset,
  responseEstimateMs,
} from '../src';
import type { Policy, QueueEvent, TicketInput, VirtualQueue } from '../src';

const MIN = MS_PER_MINUTE;
const CLASSIFICATION = classificationOf(PRIORITY_V0_POLICY)!;
/** 60 pax/h: one person per minute. */
const EST: CheckpointEstimates = { throughputPerHour: 60, processMs: 0, responseMs: 0 };

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

function virtual(
  overrides: Partial<VirtualQueue> = {},
  selection = VIRTUAL_FIFO_POLICY.selection,
): Policy {
  return {
    id: 'test',
    version: '0',
    title: 'test',
    selection,
    queue: { ...DEFAULT_VIRTUAL_QUEUE, prepareWindowSize: 0, ...overrides },
  };
}

describe('physical FIFO queue', () => {
  it('calls in issue order and admits once', () => {
    const q = new CheckpointQueue(FIFO_POLICY, CLASSIFICATION);
    for (const id of ['a', 'b', 'c']) q.issue(ticket(id), 0, EST);
    expect(q.windowCount).toBe(0);
    expect(q.callNext(1, EST)?.id).toBe('a');
    expect(q.present('a', 1, EST)).toBe('ADMITTED');
    expect(q.present('a', 2, EST)).toBe('ALREADY_ADMITTED');
    expect(q.present('b', 2, EST)).toBe('NOT_CALLED');
    expect(q.present('zz', 2, EST)).toBe('UNKNOWN_TICKET');
    expect(q.callNext(2, EST)?.id).toBe('b');
    expect(q.callNext(2, EST)?.id).toBe('c');
    expect(q.callNext(2, EST)).toBeNull();
    expect(q.nextDueMs()).toBeNull();
  });

  it('never times out', () => {
    const q = new CheckpointQueue(FIFO_POLICY, CLASSIFICATION);
    q.issue(ticket('a'), 0, EST);
    q.callNext(0, EST);
    q.advance(1_000 * MIN);
    expect(q.ticket('a')?.state).toBe('CALLED');
    expect(q.present('a', 1_000 * MIN, EST)).toBe('ADMITTED');
  });
});

describe('virtual queue: calls, timeouts, no-shows', () => {
  it('recalls after T1, marks a no-show after T1 + T2 and reports the next timeout', () => {
    const q = new CheckpointQueue(virtual(), CLASSIFICATION);
    q.issue(ticket('a'), 0, EST);
    q.callNext(0, EST);
    expect(q.nextDueMs()).toBe(3 * MIN);
    q.advance(3 * MIN);
    expect(q.ticket('a')?.state).toBe('RECALLED');
    expect(q.nextDueMs()).toBe(5 * MIN);
    q.advance(5 * MIN);
    expect(q.ticket('a')?.state).toBe('NO_SHOW');
    expect(q.outstandingCount).toBe(0);
    expect(q.noShowCount).toBe(1);
    expect(q.nextDueMs()).toBe(20 * MIN);
  });

  it('counts a passenger presenting exactly at the deadline as on time', () => {
    const q = new CheckpointQueue(virtual(), CLASSIFICATION);
    q.issue(ticket('a'), 0, EST);
    q.callNext(0, EST);
    expect(q.present('a', 5 * MIN, EST)).toBe('ADMITTED');
  });

  it('reactivates a no-show at its original place, once', () => {
    const q = new CheckpointQueue(virtual(), CLASSIFICATION);
    for (const id of ['a', 'b', 'c']) q.issue(ticket(id), 0, EST);
    q.callNext(0, EST); // a
    q.advance(5 * MIN); // a becomes a no-show
    expect(q.present('a', 6 * MIN, EST)).toBe('REACTIVATED');
    expect(q.ticket('a')).toMatchObject({ state: 'QUEUED', reactivations: 1, noShows: 1 });
    expect(q.callNext(6 * MIN, EST)?.id).toBe('a'); // still ahead of b and c
    q.advance(11 * MIN); // second no-show: no reactivation left, expires at once
    expect(q.ticket('a')?.state).toBe('EXPIRED');
    expect(q.present('a', 12 * MIN, EST)).toBe('EXPIRED');
    expect(q.stats()).toMatchObject({
      calls: 2,
      recalls: 2,
      noShows: 2,
      reactivations: 1,
      expirations: 1,
    });
  });

  it('expires a no-show that comes back after the reactivation window', () => {
    const q = new CheckpointQueue(virtual(), CLASSIFICATION);
    q.issue(ticket('a'), 0, EST);
    q.callNext(0, EST);
    expect(q.present('a', 20 * MIN, EST)).toBe('REACTIVATED'); // exactly at the window end
    q.callNext(20 * MIN, EST);
    const q2 = new CheckpointQueue(virtual(), CLASSIFICATION);
    q2.issue(ticket('b'), 0, EST);
    q2.callNext(0, EST);
    expect(q2.present('b', 20 * MIN + 1, EST)).toBe('EXPIRED');
  });

  it('sends a reactivated ticket to the back when the policy says so', () => {
    const q = new CheckpointQueue(virtual({ reactivationPosition: 'BACK' }), CLASSIFICATION);
    for (const id of ['a', 'b', 'c']) q.issue(ticket(id), 0, EST);
    q.callNext(0, EST); // a
    q.advance(5 * MIN);
    q.present('a', 6 * MIN, EST);
    expect(q.ticket('a')?.fifoKey).toBeGreaterThan(q.ticket('c')!.fifoKey);
    expect([
      q.callNext(7 * MIN, EST)?.id,
      q.callNext(7 * MIN, EST)?.id,
      q.callNext(7 * MIN, EST)?.id,
    ]).toEqual(['b', 'c', 'a']);
  });

  it('applies due timeouts in chronological order', () => {
    const events: QueueEvent[] = [];
    const q = new CheckpointQueue(virtual(), CLASSIFICATION, { listener: (e) => events.push(e) });
    q.issue(ticket('a'), 0, EST);
    q.issue(ticket('b'), 0, EST);
    q.callNext(0, EST);
    q.callNext(1 * MIN, EST);
    q.advance(60 * MIN);
    expect(
      events
        .filter((e) => e.type !== 'ISSUED')
        .map((e) => `${e.type} ${e.ticketId} ${e.atMs / MIN}`),
    ).toEqual([
      'COMMITTED a 0',
      'CALLED a 0',
      'COMMITTED b 1',
      'CALLED b 1',
      'RECALLED a 3',
      'RECALLED b 4',
      'NO_SHOW a 5',
      'NO_SHOW b 6',
      'EXPIRED a 20',
      'EXPIRED b 21',
    ]);
  });

  it('rejects time going backwards', () => {
    const q = new CheckpointQueue(virtual(), CLASSIFICATION);
    q.issue(ticket('a'), 10, EST);
    expect(() => q.callNext(9, EST)).toThrow(QueueError);
    expect(() => {
      q.advance(9);
    }).toThrow(QueueError);
    expect(q.callNext(10, EST)?.id).toBe('a');
  });

  it('reports every transition to the listener, stamped with the time it was due', () => {
    const events: QueueEvent[] = [];
    const q = new CheckpointQueue(virtual(), CLASSIFICATION, { listener: (e) => events.push(e) });
    q.issue(ticket('a'), 0, EST);
    q.callNext(1, EST);
    q.advance(60 * MIN);
    expect(events.map((e) => [e.type, e.atMs])).toEqual([
      ['ISSUED', 0],
      ['COMMITTED', 1],
      ['CALLED', 1],
      ['RECALLED', 1 + 3 * MIN],
      ['NO_SHOW', 1 + 5 * MIN],
      ['EXPIRED', 1 + 20 * MIN],
    ]);
  });
});

describe('prepare window', () => {
  it('fills up to M on issue and calls in window order', () => {
    const q = new CheckpointQueue(virtual({ prepareWindowSize: 2 }), CLASSIFICATION);
    for (const id of ['a', 'b', 'c', 'd']) q.issue(ticket(id), 0, EST);
    expect(q.prepareWindow().map((t) => t.id)).toEqual(['a', 'b']);
    expect(q.waitingCount).toBe(2);
    expect(q.callNext(0, EST)?.id).toBe('a');
    expect(q.prepareWindow().map((t) => t.id)).toEqual(['b', 'c']);
  });

  it('lets an urgent ticket enter the window ahead of older ones, never ahead of committed ones', () => {
    const policy = virtual(
      { prepareWindowSize: 2 },
      { ...PRIORITY_V0_SELECTION, safetyBufferMs: 0 },
    );
    const q = new CheckpointQueue(policy, CLASSIFICATION);
    for (const id of ['a', 'b', 'c', 'd']) q.issue(ticket(id, 600), 0, EST);
    // e must be called within 2 minutes. Once a is called, b (committed) and c, d are ahead of it:
    // 3 minutes in FIFO order (URGENT), 1 minute if committed now (feasible).
    q.issue(ticket('e', 2), 0, EST);
    expect(q.prepareWindow().map((t) => t.id)).toEqual(['a', 'b']);
    expect(q.callNext(0, EST)?.id).toBe('a');
    // The freed slot goes to e, ahead of c and d, which are overtaken once; b keeps its place.
    expect(q.prepareWindow().map((t) => t.id)).toEqual(['b', 'e']);
    expect(q.ticket('e')).toMatchObject({ priorityCommitment: true, everPrioritized: true });
    expect(q.ticket('c')?.overtakenCount).toBe(1);
    expect(q.ticket('d')?.overtakenCount).toBe(1);
  });

  it('classifies a new ticket against the window and the waiting list ahead of it', () => {
    const q = new CheckpointQueue(virtual({ prepareWindowSize: 3 }), CLASSIFICATION);
    for (let i = 0; i < 10; i++) q.issue(ticket(`t${i}`, 600), 0, EST);
    // 10 people ahead at 1 per minute: L = 12 - 5 (buffer) = 7 min < 10 min FIFO wait.
    expect(q.issue(ticket('late', 12), 0, EST).classAtIssue).toBe('URGENT');
  });
});

describe('policies and helpers', () => {
  it('exposes the presets', () => {
    expect(findPolicyPreset('fifo')?.queue.kind).toBe('physical');
    expect(findPolicyPreset('virtual-fifo')?.selection.kind).toBe('fifo');
    expect(findPolicyPreset('priority-v0')?.selection.kind).toBe('constrained-edf');
    expect(findPolicyPreset('nope')).toBeUndefined();
    expect(classificationOf(FIFO_POLICY)).toBeNull();
  });

  it('computes the engine response estimate and the call-ahead target', () => {
    expect(responseEstimateMs(FIFO_POLICY.queue)).toBe(0);
    expect(responseEstimateMs(DEFAULT_VIRTUAL_QUEUE)).toBe(180_000); // max(90 s, 180 s)
    expect(callAheadTarget(FIFO_POLICY.queue, 6, 90)).toBe(0);
    expect(callAheadTarget(DEFAULT_VIRTUAL_QUEUE, 6, 90)).toBe(27); // 180 s x 6 lanes x 90/h
    expect(callAheadTarget(DEFAULT_VIRTUAL_QUEUE, 1, 70)).toBe(4); // ceil(3.5)
    expect(callAheadTarget({ ...DEFAULT_VIRTUAL_QUEUE, callAheadSeconds: 120 }, 1, 80)).toBe(3); // ceil(2.67)
  });

  it('rejects invalid policies and duplicate tickets', () => {
    expect(() => new CheckpointQueue(virtual({ prepareWindowSize: -1 }), CLASSIFICATION)).toThrow(
      QueueError,
    );
    expect(() => new CheckpointQueue(virtual({ callTimeoutMs: 0 }), CLASSIFICATION)).toThrow(
      QueueError,
    );
    expect(
      () =>
        new CheckpointQueue(
          { ...FIFO_POLICY, queue: { kind: 'lol' } as unknown as Policy['queue'] },
          CLASSIFICATION,
        ),
    ).toThrow(QueueError);
    expect(
      () =>
        new CheckpointQueue(
          {
            ...PRIORITY_V0_POLICY,
            selection: { ...PRIORITY_V0_SELECTION, capMaxPriorityCalls: 99 },
          },
          CLASSIFICATION,
        ),
    ).toThrow(QueueError);
    const q = new CheckpointQueue(FIFO_POLICY, CLASSIFICATION);
    q.issue(ticket('a'), 0, EST);
    expect(() => q.issue(ticket('a'), 0, EST)).toThrow(QueueError);
    expect(() => q.issue({ ...ticket('b'), walkEstimateMs: -1 }, 0, EST)).toThrow(QueueError);
    expect(() => q.issue(ticket('c'), 0, { ...EST, throughputPerHour: 0 })).toThrow(QueueError);
    expect(() => q.issue(ticket(''), 0, EST)).toThrow(QueueError);
    // Rejected tickets leave no trace: the next ticket gets the next FIFO key.
    expect(q.issue(ticket('d'), 0, EST).fifoKey).toBe(1);
  });
});
