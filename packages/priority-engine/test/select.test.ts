import { describe, expect, it } from 'vitest';
import { EngineInputError, assessQueue, priorityCallsInWindow, selectNext } from '../src';
import { CHECKPOINT, EDF, MIN, input, ticket } from './fixtures';

/** A queue of 40 relaxed tickets with one urgent ticket at position 30 (10 min FIFO wait). */
function queueWithUrgentAt30() {
  return Array.from({ length: 40 }, (_, i) =>
    i === 30
      ? ticket(i, { deadline: { atMs: 12 * MIN, source: 'FEED' } }) // L = 7 min, FIFO wait 10 min
      : ticket(i),
  );
}

describe('selectNext', () => {
  it('returns null for an empty queue', () => {
    expect(selectNext(input([]))).toBeNull();
  });

  it('calls the oldest ticket under the FIFO policy', () => {
    const selection = selectNext(
      input([ticket(5), ticket(2), ticket(9)], { selection: { kind: 'fifo' } }),
    );
    expect(selection).toMatchObject({
      ticketId: 't2',
      positionInFifo: 0,
      priorityCall: false,
      reasons: ['POLICY_FIFO'],
      assessment: null,
    });
  });

  it('calls the oldest ticket when nobody is urgent', () => {
    const selection = selectNext(input([ticket(1), ticket(2)]));
    expect(selection?.ticketId).toBe('t1');
    expect(selection?.reasons).toEqual(['FIFO']);
    expect(selection?.urgentCandidates).toBe(0);
  });

  it('boosts an urgent, feasible ticket and counts it as a priority call', () => {
    const selection = selectNext(input(queueWithUrgentAt30()));
    expect(selection).toMatchObject({
      ticketId: 't30',
      positionInFifo: 30,
      priorityCall: true,
      reasons: ['URGENT_FEASIBLE'],
      urgentCandidates: 1,
    });
    expect(selection?.assessment?.riskClass).toBe('URGENT');
  });

  it('respects the cap on priority calls', () => {
    const recent = [false, true, true, true]; // 3 priority calls in the last 9 (N = 10, k = 3)
    const selection = selectNext(input(queueWithUrgentAt30(), { recentPriorityCalls: recent }));
    expect(selection?.ticketId).toBe('t0');
    expect(selection?.reasons).toEqual(['CAP_REACHED']);
    expect(selection?.priorityCall).toBe(false);
  });

  it('frees the cap once old priority calls leave the window', () => {
    const recent = [true, true, true, ...Array<boolean>(7).fill(false)]; // older than N - 1 calls
    const selection = selectNext(input(queueWithUrgentAt30(), { recentPriorityCalls: recent }));
    expect(selection?.ticketId).toBe('t30');
  });

  it('never boosts CRITICAL tickets (escalation instead)', () => {
    const waiting = [
      ticket(0),
      ticket(1),
      ticket(2, { deadline: { atMs: -MIN, source: 'FEED' } }), // already too late
    ];
    const selection = selectNext(input(waiting));
    expect(selection?.ticketId).toBe('t0');
    expect(selection?.reasons).toEqual(['FIFO']);
  });

  it('gives the overtake guard precedence over urgency', () => {
    const waiting = queueWithUrgentAt30().map((t) =>
      t.fifoKey === 3 ? { ...t, overtakenCount: EDF.maxOvertakes } : t,
    );
    const selection = selectNext(input(waiting));
    expect(selection?.ticketId).toBe('t3');
    expect(selection?.reasons).toEqual(['OVERTAKE_LIMIT_GUARD']);
    expect(selection?.priorityCall).toBe(false);
  });

  it('breaks ties on the latest call time by FIFO order', () => {
    const urgent = (k: number) => ticket(k, { deadline: { atMs: 12 * MIN, source: 'FEED' } });
    const waiting = Array.from({ length: 40 }, (_, i) =>
      i === 32 || i === 35 ? urgent(i) : ticket(i),
    );
    expect(selectNext(input(waiting))?.ticketId).toBe('t32');
  });

  it('prefers the earliest latest-call time among urgent tickets', () => {
    const waiting = Array.from({ length: 40 }, (_, i) => {
      if (i === 32) return ticket(i, { deadline: { atMs: 12 * MIN, source: 'FEED' } });
      if (i === 35) return ticket(i, { deadline: { atMs: 11 * MIN, source: 'FEED' } });
      return ticket(i);
    });
    expect(selectNext(input(waiting))?.ticketId).toBe('t35');
  });

  it('rejects invalid inputs', () => {
    expect(() => selectNext(input([ticket(1), ticket(1, { id: 'x' })]))).toThrow(EngineInputError);
    expect(() => selectNext(input([ticket(1, { deadline: { atMs: 5, source: 'NONE' } })]))).toThrow(
      EngineInputError,
    );
    expect(() =>
      selectNext(
        input([ticket(1)], { checkpoint: { throughputPerHour: 0, processMs: 0, responseMs: 0 } }),
      ),
    ).toThrow(EngineInputError);
    expect(() =>
      selectNext(input([ticket(1)], { selection: { ...EDF, capMaxPriorityCalls: 11 } })),
    ).toThrow(EngineInputError);
    expect(() => selectNext(input([ticket(1)], { nowMs: 0.5 }))).toThrow(EngineInputError);
  });
});

describe('priorityCallsInWindow', () => {
  it('counts priority calls among the last N - 1 calls', () => {
    expect(priorityCallsInWindow([], 10)).toBe(0);
    expect(priorityCallsInWindow([true, false, true], 10)).toBe(2);
    expect(priorityCallsInWindow([true, false, true], 3)).toBe(1);
    expect(priorityCallsInWindow([true, true], 1)).toBe(0);
  });
});

describe('aheadOfWaiting', () => {
  it('counts committed tickets ahead of the waiting list in the FIFO wait estimate', () => {
    // 40 relaxed tickets, the one at position 20 has L = 12 min: fine with nobody ahead
    // (20 ahead = 6.7 min) but URGENT when 25 committed tickets are ahead (45 ahead = 15 min).
    const waiting = Array.from({ length: 40 }, (_, i) =>
      i === 20 ? ticket(i, { deadline: { atMs: 17 * MIN, source: 'FEED' } }) : ticket(i),
    );
    expect(selectNext(input(waiting))?.ticketId).toBe('t0');
    const withWindow = selectNext(input(waiting, { aheadOfWaiting: 25 }));
    expect(withWindow?.ticketId).toBe('t20');
    expect(withWindow?.assessment?.aheadInFifo).toBe(45);
    expect(withWindow?.assessment?.fifoWaitEstimateMs).toBe(15 * MIN);
  });

  it('does not boost a ticket that can no longer make it behind the committed tickets', () => {
    // L = 8 min. At position 30 (10 min of FIFO wait) the ticket is URGENT and boosted; with 25
    // committed tickets ahead (8.3 min to call them) it cannot make it even if selected now: it is
    // CRITICAL and escalated instead.
    const waiting = Array.from({ length: 40 }, (_, i) =>
      i === 30 ? ticket(i, { deadline: { atMs: 13 * MIN, source: 'FEED' } }) : ticket(i),
    );
    expect(selectNext(input(waiting))?.ticketId).toBe('t30');
    expect(selectNext(input(waiting, { aheadOfWaiting: 25 }))?.ticketId).toBe('t0');
    const assessed = assessQueue(
      { nowMs: 0, checkpoint: CHECKPOINT, waiting, aheadOfWaiting: 25 },
      EDF,
    );
    expect(assessed[30]).toMatchObject({
      riskClass: 'CRITICAL',
      slackNowMs: 8 * MIN - Math.floor((25 * 60 * MIN) / 180),
    });
  });

  it('rejects negative or fractional offsets', () => {
    expect(() => selectNext(input([ticket(1)], { aheadOfWaiting: -1 }))).toThrow(EngineInputError);
    expect(() => selectNext(input([ticket(1)], { aheadOfWaiting: 1.5 }))).toThrow(EngineInputError);
  });
});
