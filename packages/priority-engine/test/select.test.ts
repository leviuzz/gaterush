import { describe, expect, it } from 'vitest';
import {
  EngineInputError,
  FIFO_POLICY,
  findPolicyPreset,
  priorityCallsInWindow,
  selectNext,
} from '../src';
import { EDF, MIN, input, ticket } from './fixtures';

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
      input([ticket(5), ticket(2), ticket(9)], { policy: FIFO_POLICY.params }),
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
      selectNext(input([ticket(1)], { policy: { ...EDF, capMaxPriorityCalls: 11 } })),
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

describe('presets', () => {
  it('exposes the FIFO and priority-v0 presets', () => {
    expect(findPolicyPreset('fifo')?.params.kind).toBe('fifo');
    expect(findPolicyPreset('priority-v0')?.params.kind).toBe('constrained-edf');
    expect(findPolicyPreset('nope')).toBeUndefined();
  });
});
