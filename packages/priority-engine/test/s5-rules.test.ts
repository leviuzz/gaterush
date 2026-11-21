import { describe, expect, it } from 'vitest';
import { EngineInputError, assessTicket, isDeadlineStale, selectNext } from '../src';
import type { CheckpointEstimates, ConstrainedEdfSelection } from '../src';
import { EDF, MIN, input, ticket } from './fixtures';

/** 60 people per hour: each person ahead is one minute of FIFO wait. */
const CP: CheckpointEstimates = { throughputPerHour: 60, processMs: 0, responseMs: 0 };
const NOW = 100 * MIN;

describe('stale-data rule (ADR-029)', () => {
  const policy: ConstrainedEdfSelection = {
    ...EDF,
    safetyBufferMs: 0,
    feasibilityMarginMs: 0,
    maxDeadlineAgeMs: 15 * MIN,
  };
  const deadline = (observedAtMs?: number) => ({
    atMs: NOW + 3 * MIN,
    source: 'FEED' as const,
    ...(observedAtMs === undefined ? {} : { observedAtMs }),
  });

  it('distrusts a deadline confirmed more than the maximum age ago', () => {
    expect(isDeadlineStale(deadline(NOW - 15 * MIN), policy, NOW)).toBe(false);
    expect(isDeadlineStale(deadline(NOW - 15 * MIN - 1), policy, NOW)).toBe(true);
    // Live data (no observation time) is never stale, and without a maximum age nothing is.
    expect(isDeadlineStale(deadline(), policy, NOW)).toBe(false);
    expect(isDeadlineStale(deadline(0), { ...policy, maxDeadlineAgeMs: null }, NOW)).toBe(false);
  });

  it('makes a stale ticket UNVERIFIED and never boosts it', () => {
    // Five people ahead: 5 minutes in FIFO order, 3 minutes to the deadline: URGENT when fresh.
    const stale = ticket(5, { id: 'stale', deadline: deadline(NOW - 20 * MIN) });
    const fresh = ticket(5, { id: 'fresh', deadline: deadline(NOW - 5 * MIN) });
    expect(assessTicket(fresh, 5, NOW, CP, policy).riskClass).toBe('URGENT');
    const a = assessTicket(stale, 5, NOW, CP, policy);
    expect(a.riskClass).toBe('UNVERIFIED');
    expect(a.reasons).toContain('DEADLINE_STALE');
    const others = [0, 1, 2, 3, 4].map((k) => ticket(k));
    expect(
      selectNext(input([...others, fresh], { nowMs: NOW, checkpoint: CP, selection: policy })),
    ).toMatchObject({ ticketId: 'fresh', priorityCall: true });
    expect(
      selectNext(input([...others, stale], { nowMs: NOW, checkpoint: CP, selection: policy })),
    ).toMatchObject({ ticketId: 't0', priorityCall: false });
  });
});

describe('hysteresis (ADR-029)', () => {
  const h = 3 * MIN;
  const policy: ConstrainedEdfSelection = {
    ...EDF,
    safetyBufferMs: 0,
    feasibilityMarginMs: 0,
    hysteresisMs: h,
  };
  /** A ticket with ten people ahead (10 min of FIFO wait) and the given FIFO margin. */
  const withMargin = (
    marginMs: number,
    lastRiskClass?: 'NORMAL' | 'ATTENTION' | 'URGENT' | 'CRITICAL',
  ) =>
    ticket(10, {
      deadline: { atMs: NOW + 10 * MIN + marginMs, source: 'FEED' },
      ...(lastRiskClass === undefined ? {} : { lastRiskClass }),
    });
  const cls = (marginMs: number, last?: 'NORMAL' | 'ATTENTION' | 'URGENT' | 'CRITICAL') =>
    assessTicket(withMargin(marginMs, last), 10, NOW, CP, policy);

  it('escalates at once and de-escalates only past the threshold plus h', () => {
    expect(cls(-1, 'NORMAL').riskClass).toBe('URGENT');
    expect(cls(h - 1, 'URGENT')).toMatchObject({ riskClass: 'URGENT' });
    expect(cls(h - 1, 'URGENT').reasons).toContain('HYSTERESIS_HOLD');
    expect(cls(h, 'URGENT').riskClass).toBe('ATTENTION');
    expect(cls(15 * MIN + h - 1, 'ATTENTION').riskClass).toBe('ATTENTION');
    expect(cls(15 * MIN + h, 'ATTENTION').riskClass).toBe('NORMAL');
    // Without a previous class there is nothing to hold.
    expect(cls(h - 1).riskClass).toBe('ATTENTION');
    expect(cls(h - 1).reasons).not.toContain('HYSTERESIS_HOLD');
  });

  it('keeps a CRITICAL ticket out of boosts until it is feasible by h', () => {
    // Deadline 2 min away with nobody ahead: feasible by 2 min, but it was CRITICAL.
    const t = ticket(0, {
      deadline: { atMs: NOW + 2 * MIN, source: 'FEED' },
      lastRiskClass: 'CRITICAL',
    });
    expect(assessTicket(t, 0, NOW, CP, policy).riskClass).toBe('CRITICAL');
    expect(
      assessTicket({ ...t, deadline: { atMs: NOW + h, source: 'FEED' } }, 0, NOW, CP, policy)
        .riskClass,
    ).not.toBe('CRITICAL');
  });

  it('boosts a ticket held URGENT by the hysteresis', () => {
    const others = Array.from({ length: 10 }, (_, k) => ticket(k));
    const held = { ...withMargin(h - 1, 'URGENT'), id: 'held', fifoKey: 10 };
    expect(
      selectNext(input([...others, held], { nowMs: NOW, checkpoint: CP, selection: policy })),
    ).toMatchObject({ ticketId: 'held', priorityCall: true });
    const fresh = { ...held, lastRiskClass: undefined };
    expect(
      selectNext(input([...others, fresh], { nowMs: NOW, checkpoint: CP, selection: policy }))
        ?.priorityCall,
    ).toBe(false);
  });

  it('rejects invalid parameters and tickets', () => {
    expect(() =>
      selectNext(input([ticket(0)], { selection: { ...policy, hysteresisMs: -1 } })),
    ).toThrow(EngineInputError);
    expect(() =>
      selectNext(
        input([ticket(0)], {
          selection: { ...policy, maxDeadlineAgeMs: '15' as unknown as number },
        }),
      ),
    ).toThrow(/maxDeadlineAgeMs must be a number or null/);
    expect(() =>
      selectNext(input([{ ...ticket(0), lastRiskClass: 'PANIC' as unknown as 'URGENT' }])),
    ).toThrow(/unknown lastRiskClass/);
    expect(() =>
      selectNext(input([ticket(0, { deadline: { atMs: 0, source: 'FEED', observedAtMs: 0.5 } })])),
    ).toThrow(/observedAtMs/);
  });
});
