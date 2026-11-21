import { describe, expect, it } from 'vitest';
import { assessQueue, assessTicket, fifoWaitEstimateMs } from '../src';
import { CHECKPOINT, EDF, MIN, ticket } from './fixtures';

describe('fifoWaitEstimateMs', () => {
  it('is ahead * 1 h / throughput, rounded down', () => {
    expect(fifoWaitEstimateMs(0, 180)).toBe(0);
    expect(fifoWaitEstimateMs(57, 180)).toBe(19 * MIN);
    expect(fifoWaitEstimateMs(1, 7)).toBe(Math.floor(3_600_000 / 7));
  });
});

describe('assessTicket', () => {
  it('reproduces the worked example of the business plan (section 7.3): slack -5 min, URGENT', () => {
    // Cut-off in 28 min, 9 min from access to gate, 5 min buffer, 19 min estimated FIFO wait
    // (57 people ahead at 180 pax/h).
    const t = ticket(57, { deadline: { atMs: 28 * MIN, source: 'FEED' }, walkEstimateMs: 9 * MIN });
    const a = assessTicket(t, 57, 0, CHECKPOINT, { ...EDF, safetyBufferMs: 5 * MIN });
    expect(a.latestCallMs).toBe(14 * MIN);
    expect(a.fifoWaitEstimateMs).toBe(19 * MIN);
    expect(a.slackFifoMs).toBe(-5 * MIN);
    expect(a.slackNowMs).toBe(14 * MIN);
    expect(a.riskClass).toBe('URGENT');
    expect(a.boostEligible).toBe(true);
    expect(a.reasons).toEqual(['DEADLINE_FROM_FEED']);
  });

  it('includes response, process, walk and buffer in the latest call time', () => {
    const t = ticket(1, { deadline: { atMs: 100 * MIN, source: 'RULE' }, walkEstimateMs: 7 * MIN });
    const a = assessTicket(
      t,
      0,
      0,
      { throughputPerHour: 100, processMs: 2 * MIN, responseMs: 3 * MIN },
      { ...EDF, safetyBufferMs: 5 * MIN },
    );
    expect(a.latestCallMs).toBe(83 * MIN);
  });

  it('classifies NORMAL, ATTENTION, URGENT and CRITICAL by slack', () => {
    const params = { ...EDF, safetyBufferMs: 0, attentionThresholdMs: 15 * MIN };
    const at = (deadlineMin: number, ahead: number) =>
      assessTicket(
        ticket(ahead, { deadline: { atMs: deadlineMin * MIN, source: 'RULE' } }),
        ahead,
        0,
        CHECKPOINT,
        params,
      ).riskClass;
    // 30 ahead = 10 min FIFO wait
    expect(at(25, 30)).toBe('NORMAL'); // slackFifo 15 min = threshold
    expect(at(24, 30)).toBe('ATTENTION'); // slackFifo 14 min
    expect(at(10, 30)).toBe('ATTENTION'); // slackFifo 0
    expect(at(9, 30)).toBe('URGENT'); // slackFifo -1 min, slackNow 9 min
    expect(at(0, 30)).toBe('URGENT'); // slackNow exactly 0 is still feasible
    expect(at(-1, 30)).toBe('CRITICAL'); // not feasible even if called now
  });

  it('flags CRITICAL tickets for escalation and never makes them boost-eligible', () => {
    const t = ticket(3, { deadline: { atMs: -MIN, source: 'FEED' } });
    const a = assessTicket(t, 3, 0, CHECKPOINT, EDF);
    expect(a.riskClass).toBe('CRITICAL');
    expect(a.boostEligible).toBe(false);
    expect(a.reasons).toContain('CRITICAL_ESCALATION');
  });

  it('marks unknown deadlines as UNVERIFIED', () => {
    const a = assessTicket(
      ticket(1, { deadline: { atMs: null, source: 'NONE' } }),
      0,
      0,
      CHECKPOINT,
      EDF,
    );
    expect(a.riskClass).toBe('UNVERIFIED');
    expect(a.latestCallMs).toBeNull();
    expect(a.boostEligible).toBe(false);
    expect(a.reasons).toEqual(['DEADLINE_UNKNOWN']);
  });

  it('does not trust rule-based deadlines when the policy forbids them, but trusts feeds', () => {
    const params = { ...EDF, allowRuleBasedDeadline: false };
    const rule = assessTicket(
      ticket(1, { deadline: { atMs: MIN, source: 'RULE' } }),
      40,
      0,
      CHECKPOINT,
      params,
    );
    expect(rule.riskClass).toBe('UNVERIFIED');
    expect(rule.reasons).toEqual(['DEADLINE_FROM_RULE', 'RULE_DEADLINE_NOT_ALLOWED']);
    const feed = assessTicket(
      ticket(1, { deadline: { atMs: 20 * MIN, source: 'FEED' } }),
      90,
      0,
      CHECKPOINT,
      { ...params, safetyBufferMs: 0 },
    );
    expect(feed.riskClass).toBe('URGENT');
  });

  it('keeps the risk class but blocks boosts for ineligible segments', () => {
    const a = assessTicket(
      ticket(1, { segment: 'TRANSFER', deadline: { atMs: 20 * MIN, source: 'FEED' } }),
      90,
      0,
      CHECKPOINT,
      { ...EDF, safetyBufferMs: 0, eligibleSegments: ['DEPARTING'] },
    );
    expect(a.riskClass).toBe('URGENT');
    expect(a.boostEligible).toBe(false);
    expect(a.reasons).toContain('SEGMENT_NOT_ELIGIBLE');
  });
});

describe('assessQueue', () => {
  it('returns one assessment per ticket, in FIFO order, whatever the input order', () => {
    const waiting = [ticket(30), ticket(10), ticket(20)];
    const result = assessQueue({ nowMs: 0, checkpoint: CHECKPOINT, waiting }, EDF);
    expect(result.map((a) => a.ticketId)).toEqual(['t10', 't20', 't30']);
    expect(result.map((a) => a.aheadInFifo)).toEqual([0, 1, 2]);
  });
});
