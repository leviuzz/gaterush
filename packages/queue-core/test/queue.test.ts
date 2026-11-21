import { MS_PER_MINUTE } from '@gateflow/domain';
import type { CheckpointEstimates } from '@gateflow/priority-engine';
import { describe, expect, it } from 'vitest';
import {
  CheckpointQueue,
  DEFAULT_VIRTUAL_QUEUE,
  FIFO_MANUAL_POLICY,
  FIFO_POLICY,
  LANE_MODES,
  POLICY_PRESETS,
  PRIORITY_V0_POLICY,
  PRIORITY_V0_SELECTION,
  QueueError,
  VIRTUAL_FIFO_POLICY,
  callAheadTarget,
  classificationOf,
  fastTrackResponseEstimateMs,
  findPolicyPreset,
  responseEstimateMs,
  validatePolicy,
  withLaneMode,
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
      { ...PRIORITY_V0_SELECTION, safetyBufferMs: 0, feasibilityMarginMs: 0 },
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

  it('calls a fast-track priority commitment ahead of the window, which it overtakes', () => {
    const policy = virtual(
      { prepareWindowSize: 2 },
      { ...PRIORITY_V0_SELECTION, safetyBufferMs: 0, feasibilityMarginMs: 0, fastTrack: true },
    );
    const q = new CheckpointQueue(policy, CLASSIFICATION);
    for (const id of ['a', 'b', 'c', 'd']) q.issue(ticket(id, 600), 0, EST);
    q.issue(ticket('e', 2), 0, EST);
    expect(q.callNext(0, EST)?.id).toBe('a');
    // e goes ahead of b (committed) and of the waiting c and d, all overtaken once.
    expect(q.prepareWindow().map((t) => t.id)).toEqual(['e', 'b']);
    expect(q.ticket('e')).toMatchObject({ priorityCommitment: true, fastTracked: true });
    expect(['b', 'c', 'd'].map((id) => q.ticket(id)?.overtakenCount)).toEqual([1, 1, 1]);
    expect(q.callNext(0, EST)?.id).toBe('e');
  });

  it('keeps fast-track commitments in their own order and respects K in the window', () => {
    const selection = {
      ...PRIORITY_V0_SELECTION,
      safetyBufferMs: 0,
      feasibilityMarginMs: 0,
      maxOvertakes: 1,
      fastTrack: true,
    };
    const q = new CheckpointQueue(virtual({ prepareWindowSize: 3 }, selection), CLASSIFICATION);
    for (const id of ['a', 'b', 'c']) q.issue(ticket(id, 600), 0, EST);
    q.issue(ticket('x', 1.5), 0, EST);
    q.issue(ticket('y', 1.8), 0, EST);
    // x (the head of the waiting list) goes ahead of b and c, which are overtaken once (K = 1).
    expect(q.callNext(0, EST)?.id).toBe('a');
    expect(q.prepareWindow().map((t) => t.id)).toEqual(['x', 'b', 'c']);
    expect(['b', 'c'].map((id) => q.ticket(id)?.overtakenCount)).toEqual([1, 1]);
    // y is URGENT too, but passing b and c would exceed K: it is committed in FIFO order.
    expect(q.callNext(0, EST)?.id).toBe('x');
    expect(q.prepareWindow().map((t) => t.id)).toEqual(['b', 'c', 'y']);
    expect(q.ticket('y')).toMatchObject({
      fastTracked: false,
      selectionReasons: ['OVERTAKE_ROOM_EXHAUSTED'],
    });

    // Two fast-track commitments in a row keep their own order, both ahead of the window.
    const q2 = new CheckpointQueue(
      virtual({ prepareWindowSize: 3 }, { ...selection, maxOvertakes: 5 }),
      CLASSIFICATION,
    );
    q2.issue(ticket('a', 600), 0, EST);
    q2.issue(ticket('x', 0.5), 0, EST);
    q2.issue(ticket('y', 0.6), 0, EST);
    expect(q2.prepareWindow().map((t) => t.id)).toEqual(['x', 'y', 'a']);
    expect(q2.ticket('a')?.overtakenCount).toBe(2);
    expect(q2.ticket('x')?.overtakenCount).toBe(0);
  });

  it('remembers when the passenger was last at the access point', () => {
    const q = new CheckpointQueue(virtual(), CLASSIFICATION);
    q.issue(ticket('a'), 5 * MIN, EST);
    expect(q.ticket('a')?.lastSeenAtMs).toBe(5 * MIN);
    q.callNext(5 * MIN, EST);
    q.advance(10 * MIN); // second call at 8 min, no-show at 10 min
    expect(q.present('a', 12 * MIN, EST)).toBe('REACTIVATED');
    expect(q.ticket('a')?.lastSeenAtMs).toBe(12 * MIN);
  });

  it('fast-tracks an urgent ticket at the head of the waiting list past the window', () => {
    const policy = virtual(
      { prepareWindowSize: 2 },
      { ...PRIORITY_V0_SELECTION, safetyBufferMs: 0, feasibilityMarginMs: 0, fastTrack: true },
    );
    const q = new CheckpointQueue(policy, CLASSIFICATION);
    for (const id of ['a', 'b']) q.issue(ticket(id, 600), 0, EST);
    q.issue(ticket('x', 0.5), 0, EST);
    // x is alone in the waiting list behind b: 1 minute in FIFO order, too late; 0 by fast track.
    expect(q.callNext(0, EST)?.id).toBe('a');
    expect(q.prepareWindow().map((t) => t.id)).toEqual(['x', 'b']);
    expect(q.ticket('x')).toMatchObject({
      fastTracked: true,
      selectionReasons: ['URGENT_FEASIBLE'],
    });
    expect(q.ticket('b')?.overtakenCount).toBe(1);
    // Without the fast track the head is simply committed in FIFO order.
    const slow = new CheckpointQueue(
      virtual({ prepareWindowSize: 2 }, {
        ...policy.selection,
        fastTrack: false,
      } as typeof policy.selection),
      CLASSIFICATION,
    );
    for (const id of ['a', 'b']) slow.issue(ticket(id, 600), 0, EST);
    slow.issue(ticket('x', 0.5), 0, EST);
    slow.callNext(0, EST);
    expect(slow.prepareWindow().map((t) => t.id)).toEqual(['b', 'x']);
  });

  it('classifies a new ticket against the window and the waiting list ahead of it', () => {
    const q = new CheckpointQueue(virtual({ prepareWindowSize: 3 }), CLASSIFICATION);
    for (let i = 0; i < 10; i++) q.issue(ticket(`t${i}`, 600), 0, EST);
    // 10 people ahead at 1 per minute: L = 12 - 5 (buffer) = 7 min < 10 min FIFO wait.
    expect(q.issue(ticket('late', 12), 0, EST).classAtIssue).toBe('URGENT');
  });
});

describe('groups', () => {
  it('counts the people of the window and of the waiting list when classifying a new ticket', () => {
    // Window of 2 tickets holding 5 people, 3 more waiting: 8 people ahead at one per minute.
    const q = new CheckpointQueue(virtual({ prepareWindowSize: 2 }), CLASSIFICATION);
    q.issue({ ...ticket('a', 600), partySize: 4 }, 0, EST);
    q.issue(ticket('b', 600), 0, EST);
    q.issue({ ...ticket('c', 600), partySize: 3 }, 0, EST);
    expect(q.windowPeople).toBe(5);
    expect(q.waitingPeople).toBe(3);
    // L = 12 - 5 = 7 min < 8 min of FIFO wait: URGENT; selected now it waits 5 min only.
    expect(q.issue(ticket('late', 12), 0, EST).classAtIssue).toBe('URGENT');
  });

  it('counts the people of the groups still in the window when committing the next ticket', () => {
    // Window of two groups of three; once the first is called, three people stay ahead. u must be
    // called within 3 minutes: behind them and x it would wait 4 (URGENT); counting tickets
    // instead of people it would wait only 2 and stay in FIFO order.
    const policy = virtual(
      { prepareWindowSize: 2 },
      { ...PRIORITY_V0_SELECTION, safetyBufferMs: 0, feasibilityMarginMs: 0 },
    );
    const q = new CheckpointQueue(policy, CLASSIFICATION);
    q.issue({ ...ticket('g1', 600), partySize: 3 }, 0, EST);
    q.issue({ ...ticket('g2', 600), partySize: 3 }, 0, EST);
    q.issue(ticket('x', 600), 0, EST);
    q.issue(ticket('u', 3), 0, EST);
    expect(q.callNext(0, EST)?.id).toBe('g1');
    expect(q.prepareWindow().map((t) => t.id)).toEqual(['g2', 'u']);
  });

  it('keeps the first presentation time for the presentation rule', () => {
    // Departure at 60 min, cutoff 45 min: presenting at 0 is in time, at 30 min it is late.
    const policy = virtual(
      {},
      {
        ...PRIORITY_V0_SELECTION,
        safetyBufferMs: 0,
        feasibilityMarginMs: 0,
        latePresentationCutoffMs: 45 * MIN,
      },
    );
    const urgentAt30 = (presentedAtMs: number | undefined) => {
      const q = new CheckpointQueue(policy, CLASSIFICATION);
      for (const id of ['a', 'b', 'c', 'd', 'e']) q.issue(ticket(id, 600), 30 * MIN, EST);
      q.issue(
        {
          ...ticket('u', 33),
          scheduledDepartureMs: 60 * MIN,
          ...(presentedAtMs === undefined ? {} : { presentedAtMs }),
        },
        30 * MIN,
        EST,
      );
      return q.callNext(30 * MIN, EST)?.id;
    };
    expect(urgentAt30(0)).toBe('u');
    expect(urgentAt30(undefined)).toBe('a');
  });

  it('counts every person of a group that jumps as an overtake of each older ticket', () => {
    const policy = virtual(
      {},
      { ...PRIORITY_V0_SELECTION, safetyBufferMs: 0, feasibilityMarginMs: 0 },
    );
    const q = new CheckpointQueue(policy, CLASSIFICATION);
    for (const id of ['a', 'b', 'c', 'd']) q.issue(ticket(id, 600), 0, EST);
    q.issue({ ...ticket('family', 3), partySize: 3 }, 0, EST);
    expect(q.callNext(0, EST)?.id).toBe('family');
    expect(['a', 'b', 'c', 'd'].map((id) => q.ticket(id)?.overtakenCount)).toEqual([3, 3, 3, 3]);
    expect(q.stats()).toMatchObject({ priorityCommitments: 1, priorityPeople: 3 });
    expect(q.outstandingPeople).toBe(3);
  });
});

describe('flight knowledge and risk classes (S5)', () => {
  const edf = virtual(
    {},
    { ...PRIORITY_V0_SELECTION, safetyBufferMs: 0, feasibilityMarginMs: 0, hysteresisMs: 2 * MIN },
  );
  const onFlight = (id: string, deadlineMin: number, flightId: string): TicketInput => ({
    ...ticket(id, deadlineMin),
    flightId,
  });

  it('updates the knowledge of every live ticket of a flight, and only those', () => {
    const q = new CheckpointQueue(edf, CLASSIFICATION);
    q.issue(onFlight('a', 600, 'F1'), 0, EST);
    q.issue(onFlight('b', 600, 'F1'), 0, EST);
    q.issue(onFlight('c', 600, 'F2'), 0, EST);
    q.callNext(0, EST);
    q.present('a', 0, EST); // admitted: its knowledge no longer matters
    q.updateFlight(
      'F1',
      { deadline: { atMs: 650 * MIN, source: 'FEED' }, walkEstimateMs: MIN },
      1,
      EST,
    );
    expect(q.ticket('b')).toMatchObject({ deadline: { atMs: 650 * MIN }, walkEstimateMs: MIN });
    expect(q.ticket('a')?.deadline.atMs).toBe(600 * MIN);
    expect(q.ticket('c')?.deadline.atMs).toBe(600 * MIN);
    // Unknown flights are ignored; invalid knowledge is rejected; time never goes back.
    q.updateFlight('F9', { walkEstimateMs: MIN }, 2, EST);
    expect(() => {
      q.updateFlight('F1', { walkEstimateMs: -1 }, 2, EST);
    }).toThrow(QueueError);
    expect(() => {
      q.updateFlight('F1', {}, 0, EST);
    }).toThrow(QueueError);
  });

  it('stops boosting a flight whose deadline went stale, and resumes when it is fresh again', () => {
    const stalePolicy = virtual(
      {},
      {
        ...PRIORITY_V0_SELECTION,
        safetyBufferMs: 0,
        feasibilityMarginMs: 0,
        maxDeadlineAgeMs: 5 * MIN,
      },
    );
    const run = (observedAtMs: number | undefined) => {
      const q = new CheckpointQueue(stalePolicy, CLASSIFICATION);
      for (const id of ['a', 'b', 'c']) q.issue(onFlight(id, 600, 'F1'), 10 * MIN, EST);
      q.issue(onFlight('late', 12, 'F2'), 10 * MIN, EST);
      q.updateFlight(
        'F2',
        {
          deadline: {
            atMs: 12 * MIN,
            source: 'FEED',
            ...(observedAtMs === undefined ? {} : { observedAtMs }),
          },
        },
        10 * MIN,
        EST,
      );
      return q.callNext(10 * MIN, EST)?.id;
    };
    // 3 people ahead at one per minute, deadline 2 minutes away: URGENT when the data is fresh.
    expect(run(undefined)).toBe('late');
    expect(run(9 * MIN)).toBe('late');
    expect(run(4 * MIN)).toBe('a'); // confirmed 6 minutes ago: stale, FIFO
  });

  it('records the class of each waiting ticket and counts its changes, with hysteresis', () => {
    // No boosts (cap 0), so x keeps waiting while the queue ahead of it is called.
    const track = (hysteresisMs: number) => {
      const q = new CheckpointQueue(
        virtual(
          {},
          {
            ...PRIORITY_V0_SELECTION,
            safetyBufferMs: 0,
            feasibilityMarginMs: 0,
            capMaxPriorityCalls: 0,
            hysteresisMs,
          },
        ),
        CLASSIFICATION,
      );
      for (const id of ['a', 'b', 'c', 'd']) q.issue(onFlight(id, 600, 'F1'), 0, EST);
      // x: 4 people ahead (4 minutes), deadline 3.5 minutes away: URGENT at once.
      q.issue(onFlight('x', 3.5, 'F2'), 0, EST);
      const classes = [q.ticket('x')?.riskClass];
      for (let i = 0; i < 3; i++) {
        q.callNext(0, EST); // one person less ahead: the FIFO margin grows by a minute
        classes.push(q.ticket('x')?.riskClass);
      }
      return { classes, changes: q.ticket('x')?.classChanges, total: q.stats().classChanges };
    };
    // Margins -0.5, +0.5, +1.5, +2.5 min. With h = 2 min x leaves URGENT only at +2.5 min.
    expect(track(2 * MIN)).toMatchObject({
      classes: ['URGENT', 'URGENT', 'URGENT', 'ATTENTION'],
      changes: 1,
    });
    // Without hysteresis it is ATTENTION as soon as the margin is positive.
    expect(track(0)).toMatchObject({
      classes: ['URGENT', 'ATTENTION', 'ATTENTION', 'ATTENTION'],
      changes: 1,
    });
    // Policies that do not classify keep no class.
    const fifo = new CheckpointQueue(virtual(), CLASSIFICATION);
    fifo.issue(ticket('y', 5), 0, EST);
    expect(fifo.ticket('y')).toMatchObject({ riskClass: null, classChanges: 0 });
  });

  it('counts reversals of direction (flapping), which the hysteresis suppresses', () => {
    // The feed moves x's deadline back and forth by a minute around the URGENT threshold; every
    // new ticket triggers an assessment.
    const flap = (hysteresisMs: number) => {
      const q = new CheckpointQueue(
        virtual(
          {},
          {
            ...PRIORITY_V0_SELECTION,
            safetyBufferMs: 0,
            feasibilityMarginMs: 0,
            capMaxPriorityCalls: 0,
            hysteresisMs,
          },
        ),
        CLASSIFICATION,
      );
      for (const id of ['a', 'b', 'c', 'd']) q.issue(onFlight(id, 600, 'F1'), 0, EST);
      // 4 people ahead (4 minutes), deadline 4.5 minutes away: ATTENTION.
      q.issue(onFlight('x', 4.5, 'F2'), 0, EST);
      const classes = [q.ticket('x')?.riskClass];
      [3.5, 4.5, 3.5].forEach((deadlineMin, i) => {
        q.updateFlight('F2', { deadline: { atMs: deadlineMin * MIN, source: 'FEED' } }, 0, EST);
        q.issue(onFlight(`n${i}`, 600, 'F1'), 0, EST);
        classes.push(q.ticket('x')?.riskClass);
      });
      const x = q.ticket('x');
      const stats = q.stats();
      return {
        classes,
        changes: x?.classChanges,
        reversals: x?.classReversals,
        total: [stats.classChanges, stats.classReversals],
      };
    };
    expect(flap(0)).toEqual({
      classes: ['ATTENTION', 'URGENT', 'ATTENTION', 'URGENT'],
      changes: 3,
      reversals: 2,
      total: [3, 2],
    });
    // With h = 2 minutes a margin of +0.5 minutes does not take x out of URGENT.
    expect(flap(2 * MIN)).toEqual({
      classes: ['ATTENTION', 'URGENT', 'URGENT', 'URGENT'],
      changes: 1,
      reversals: 0,
      total: [1, 0],
    });
  });
});

describe('lane modes (S8)', () => {
  it('adds a lane mode to a policy without changing its calls', () => {
    const reactive = withLaneMode(FIFO_MANUAL_POLICY, 'reactive');
    expect(reactive).toEqual({
      ...FIFO_MANUAL_POLICY,
      id: 'fifo-manual@reactive',
      title: `${FIFO_MANUAL_POLICY.title}, with extra lanes opened by a supervisor when the queue is long (today)`,
      lanes: LANE_MODES.reactive?.lanes,
    });
    expect(findPolicyPreset('fifo-manual@reactive')).toEqual(reactive);
    expect(findPolicyPreset('priority-v3@predict')).toMatchObject({
      id: 'priority-v3@predict',
      selection: findPolicyPreset('priority-v3')?.selection,
      lanes: { kind: 'predict', horizonMs: 45 * MIN, targetWaitMs: 10 * MIN },
    });
    expect(findPolicyPreset('fifo@nowhere')).toBeUndefined();
    expect(findPolicyPreset('nobody@reactive')).toBeUndefined();
    expect(() => withLaneMode(FIFO_POLICY, 'nowhere')).toThrow(/unknown lane mode "nowhere"/);
    expect(() => withLaneMode(reactive, 'predict')).toThrow(/already manages lanes/);
  });

  it('validates lane management', () => {
    const reactive = LANE_MODES.reactive?.lanes;
    const predict = LANE_MODES.predict?.lanes;
    if (reactive?.kind !== 'reactive' || predict?.kind !== 'predict') {
      throw new Error('expected both lane modes');
    }
    const invalid: [Policy['lanes'], RegExp][] = [
      [{ ...reactive, reviewIntervalMs: 30_000 }, /reviewIntervalMs/],
      [{ ...reactive, closeWhenWaitMs: reactive.openWhenWaitMs }, /below lanes.openWhenWaitMs/],
      [{ ...reactive, cooldownMs: -1 }, /cooldownMs/],
      [{ ...predict, horizonMs: 0 }, /horizonMs/],
      [{ ...predict, targetWaitMs: predict.closeWhenWaitMs }, /below lanes.targetWaitMs/],
      [{ ...predict, kind: 'hunch' } as unknown as Policy['lanes'], /unknown lane management/],
    ];
    for (const [lanes, message] of invalid) {
      expect(() => {
        validatePolicy({ ...FIFO_POLICY, lanes });
      }).toThrow(message);
    }
    expect(() => {
      validatePolicy({ ...FIFO_POLICY, lanes: predict });
    }).not.toThrow();
  });
});

describe('policies and helpers', () => {
  it('exposes the presets', () => {
    expect(findPolicyPreset('fifo')?.queue.kind).toBe('physical');
    expect(findPolicyPreset('virtual-fifo')?.selection.kind).toBe('fifo');
    expect(findPolicyPreset('priority-v0')?.selection.kind).toBe('constrained-edf');
    expect(findPolicyPreset('fifo-manual')).toMatchObject({
      selection: { kind: 'flight-call' },
      queue: { kind: 'physical' },
    });
    expect(findPolicyPreset('priority-v1')?.selection).toMatchObject({
      capWindowCalls: 20,
      capMaxPriorityCalls: 10,
      maxOvertakes: 30,
      feasibilityMarginMs: 0,
      latePresentationCutoffMs: null,
    });
    // The strict variant differs from v1 only by the late-presentation rule.
    expect(findPolicyPreset('priority-v1-strict')?.selection).toEqual({
      ...findPolicyPreset('priority-v1')?.selection,
      latePresentationCutoffMs: 45 * MIN,
    });
    expect(POLICY_PRESETS.map((p) => p.id)).toEqual([
      'fifo',
      'fifo-manual',
      'virtual-fifo',
      'priority-v0',
      'priority-v1',
      'priority-v1-strict',
      'priority-v2',
      'priority-v3',
    ]);
    // v3 differs from v2 only by the S5 data-quality rules (ADR-029, ADR-034).
    expect(findPolicyPreset('priority-v3')?.selection).toEqual({
      ...findPolicyPreset('priority-v2')?.selection,
      maxDeadlineAgeMs: 60 * MIN,
      hysteresisMs: 3 * MIN,
    });
    // v2 differs from v1 only by the fast track.
    expect(findPolicyPreset('priority-v2')?.selection).toEqual({
      ...findPolicyPreset('priority-v1')?.selection,
      fastTrack: true,
    });
    expect(classificationOf(findPolicyPreset('priority-v2')!)?.fastTrack).toBe(true);
    for (const policy of POLICY_PRESETS) {
      expect(() => {
        validatePolicy(policy);
      }).not.toThrow();
    }
    expect(classificationOf(findPolicyPreset('fifo-manual')!)).toBeNull();
    expect(findPolicyPreset('nope')).toBeUndefined();
    expect(classificationOf(FIFO_POLICY)).toBeNull();
  });

  it('computes the engine response estimate and the call-ahead target', () => {
    expect(responseEstimateMs(FIFO_POLICY.queue)).toBe(0);
    expect(responseEstimateMs(DEFAULT_VIRTUAL_QUEUE)).toBe(180_000); // max(90 s, 180 s)
    expect(fastTrackResponseEstimateMs(DEFAULT_VIRTUAL_QUEUE)).toBe(90_000); // walk back only
    expect(fastTrackResponseEstimateMs(FIFO_POLICY.queue)).toBe(0);
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
