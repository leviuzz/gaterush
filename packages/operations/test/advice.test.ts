import fc from 'fast-check';
import { PRIORITY_V3_POLICY, classificationOf } from '@gateflow/queue-core';
import { describe, expect, it } from 'vitest';
import { ADVICE_RULES, CheckpointDay, OperationError, advicesOfLog } from '../src';
import type {
  AdviceDecision,
  AdviceDeclineReason,
  Command,
  CommandRecord,
  DayConfig,
  IssueTicket,
  LaneAdviceRecord,
} from '../src';

/*
 * GateFlow's recommendations of lanes in a day (S22): the acceptance of the slice asks for the
 * cooldown and the deduplication to be tested; the day keeps them, with postponing, declining
 * with a reason, expiry and the outcome, and never touches the queue.
 */

const MIN = 60_000;
const DAY_START = Date.UTC(2026, 10, 23, 5, 0, 0);

const config: DayConfig = {
  checkpointId: 'cp-1',
  serviceDay: '2026-11-23',
  ticketPrefix: 'A',
  policy: PRIORITY_V3_POLICY,
  classification: classificationOf(PRIORITY_V3_POLICY)!,
  lanesOpen: 2,
  ratePerLanePerHour: 150,
  processEstimateMs: 24_000,
};

const advice: LaneAdviceRecord = {
  action: 'OPEN',
  lanes: 1,
  reason: 'WAIT_ABOVE_TARGET',
  lanesOpen: 2,
  leadMinutes: 20,
  atMinutes: 45,
  waitWithout: { p10: 12, p50: 18, p90: 25 },
  waitWith: { p10: 4, p50: 7, p90: 11 },
  peakWithoutMinutes: 18,
  peakWithMinutes: 8,
  forecast: 'forecast 0.3.0, the scenario library',
};

const advise = (adviceId: string, overrides: Partial<LaneAdviceRecord> = {}): Command => ({
  type: 'ADVISE_LANES',
  adviceId,
  advice: { ...advice, ...overrides },
});

const decide = (
  adviceId: string,
  decision: AdviceDecision,
  reason: AdviceDeclineReason | null = null,
): Command => ({ type: 'DECIDE_ADVICE', adviceId, decision, reason });

/** A day opened at 05:00, then each command at its minute. */
function dayOf(steps: readonly (readonly [number, Command])[]) {
  const { day } = CheckpointDay.open({
    seq: 1,
    atMs: DAY_START,
    command: { type: 'OPEN_DAY', config },
  });
  let seq = 1;
  // A refused command does not take a place in the log.
  const apply = (minute: number, command: Command) => {
    const applied = day.apply({ seq: seq + 1, atMs: DAY_START + minute * MIN, command });
    seq++;
    return applied;
  };
  for (const [minute, command] of steps) apply(minute, command);
  return { day, apply };
}

const refused = (fn: () => unknown, message: RegExp) => {
  expect(fn).toThrow(OperationError);
  expect(fn).toThrow(message);
};

describe('the recommendations of a day (S22)', () => {
  it('makes one at a time, and none within 15 minutes of the previous one', () => {
    const { day, apply } = dayOf([[10, advise('a1')]]);
    expect(day.advices()[0]).toMatchObject({ adviceId: 'a1', status: 'OPEN', decision: null });
    // Deduplication: none while one is open.
    expect(day.canAdvise(DAY_START + 12 * MIN)).toBe(false);
    refused(() => apply(12, advise('a2')), /open/);
    apply(13, decide('a1', 'ACCEPT'));
    expect(day.advices()[0]).toMatchObject({
      status: 'ACCEPTED',
      decision: { decision: 'ACCEPT' },
    });
    // Cooldown: 15 minutes from the previous one.
    refused(() => apply(24, advise('a2')), /too soon/);
    apply(25, advise('a2'));
    expect(day.advices().map((a) => a.status)).toEqual(['ACCEPTED', 'OPEN']);
    // An id is never reused, and a decided one is not decided again.
    refused(() => apply(26, decide('a1', 'DECLINE', 'NOT_NEEDED')), /accepted/);
  });

  it('asks again no sooner than 10 minutes after a postponement', () => {
    const { day, apply } = dayOf([
      [0, advise('a1')],
      [14, decide('a1', 'POSTPONE')],
    ]);
    expect(day.advices()[0]?.status).toBe('POSTPONED');
    // The cooldown ends at 15, the postponement at 24.
    expect(day.canAdvise(DAY_START + 20 * MIN)).toBe(false);
    refused(() => apply(20, advise('a2')), /too soon/);
    expect(day.canAdvise(DAY_START + 24 * MIN)).toBe(true);
    apply(24, advise('a2'));
  });

  it('is declined with a coded reason only, and expires when nobody decides', () => {
    const { day, apply } = dayOf([[0, advise('a1')]]);
    refused(() => apply(1, decide('a1', 'DECLINE')), /reason/);
    refused(() => apply(1, decide('a1', 'ACCEPT', 'NO_STAFF')), /only a decline/);
    refused(
      () => apply(1, { type: 'DECIDE_ADVICE', adviceId: 'a1', decision: 'MAYBE' } as never),
      /unknown decision/,
    );
    refused(() => apply(1, decide('nope', 'ACCEPT')), /no such/);
    // Not decided within 15 minutes: expired, and a new one may follow at once.
    expect(day.advices(DAY_START + 15 * MIN)[0]?.status).toBe('EXPIRED');
    refused(() => apply(16, decide('a1', 'ACCEPT')), /expired/);
    apply(16, advise('a2'));
    apply(17, decide('a2', 'DECLINE', 'NO_STAFF'));
    expect(day.advices()[1]).toMatchObject({
      status: 'DECLINED',
      decision: { decision: 'DECLINE', reason: 'NO_STAFF', atMs: DAY_START + 17 * MIN },
    });
  });

  it('records the outcome once, 15 minutes after the time it spoke of', () => {
    const { day, apply } = dayOf([[0, advise('a1', { atMinutes: 30 })]]);
    expect(day.advices()[0]?.outcomeDueMs).toBe(DAY_START + 45 * MIN);
    const outcome = (admitted: number, waitMinutes: number | null): Command => ({
      type: 'RECORD_OUTCOME',
      adviceId: 'a1',
      outcome: { lanesOpen: 3, backlog: 12, waitMinutes, admitted },
    });
    refused(() => apply(44, outcome(40, 6.5)), /not due/);
    refused(() => apply(45, outcome(0, 6.5)), /needs people admitted/);
    apply(45, outcome(40, 6.5));
    expect(day.advices()[0]?.outcome).toEqual({
      lanesOpen: 3,
      backlog: 12,
      waitMinutes: 6.5,
      admitted: 40,
    });
    refused(() => apply(46, outcome(40, 6.5)), /already/);
  });

  it('makes none while calls are paused or in an emergency: the forecast assumes lanes screen', () => {
    const { day, apply } = dayOf([[1, { type: 'SET_MODE', mode: 'PAUSED', reset: false }]]);
    expect(day.canAdvise(DAY_START + 2 * MIN)).toBe(false);
    refused(() => apply(2, advise('a1')), /paused/);
    apply(3, { type: 'SET_MODE', mode: 'EMERGENCY', reset: false });
    refused(() => apply(4, advise('a1')), /emergency/);
    apply(5, { type: 'SET_MODE', mode: 'NORMAL', reset: true });
    expect(day.canAdvise(DAY_START + 6 * MIN)).toBe(true);
    apply(6, advise('a1'));
    // Paused again: the open one may still be decided.
    apply(7, { type: 'SET_MODE', mode: 'PAUSED', reset: false });
    apply(8, decide('a1', 'POSTPONE'));
    expect(day.advices()[0]?.status).toBe('POSTPONED');
  });

  it('refuses a recommendation without what the alert must say', () => {
    const { apply } = dayOf([]);
    refused(() => apply(1, advise('a1', { lanes: 0 })), /at least one lane/);
    refused(() => apply(1, advise('a1', { action: 'CLOSE', lanes: 2 })), /one lane/);
    refused(() => apply(1, advise('a1', { leadMinutes: -1 })), /lead time/);
    refused(
      () => apply(1, advise('a1', { waitWithout: { p10: 9, p50: 8, p90: 10 } })),
      /not ordered/,
    );
    refused(() => apply(1, advise('a1', { forecast: '' })), /forecast/);
    refused(() => apply(1, advise('a1', { reason: 'HUNCH' } as never)), /reason/);
  });

  it('never touches the queue: the same tickets and board with recommendations or without', () => {
    const issue = (n: number): IssueTicket => ({
      type: 'ISSUE_TICKET',
      ticketId: `t-${n}`,
      opaqueRef: `ref-${n}-0123456789abcdef`,
      source: 'STAFF',
      flightId: 'F1',
      segment: 'DEPARTING',
      partySize: 1,
      deadline: { atMs: DAY_START + 40 * MIN, source: 'FEED' },
      walkEstimateMs: 5 * MIN,
      scheduledDepartureMs: DAY_START + 60 * MIN,
      dedupKey: null,
    });
    const queue: [number, Command][] = [
      [1, issue(1)],
      [2, issue(2)],
      [3, { type: 'CALL_NEXT' }],
      [9, { type: 'ADVANCE' }],
      [12, { type: 'CALL_NEXT' }],
      [20, { type: 'ADVANCE' }],
    ];
    const plain = dayOf(queue).day;
    const advised = dayOf(
      [
        ...queue,
        [5, advise('a1')] as [number, Command],
        [8, decide('a1', 'POSTPONE')] as [number, Command],
        [21, advise('a2')] as [number, Command],
      ].sort((a, b) => a[0] - b[0]),
    ).day;
    expect(advised.tickets()).toEqual(plain.tickets());
    expect(advised.board()).toEqual(plain.board());
    expect(advised.nextDueMs()).toEqual(plain.nextDueMs());
    expect(advised.advices().map((a) => a.status)).toEqual(['POSTPONED', 'OPEN']);
    // The log's recommendations alone give the same.
    const records = [
      [5, advise('a1')],
      [8, decide('a1', 'POSTPONE')],
      [21, advise('a2')],
    ].map(([minute, command]) => ({
      atMs: DAY_START + (minute as number) * MIN,
      command: command as Command,
    }));
    expect(advicesOfLog(records, advised.lastAtMs)).toEqual(advised.advices());
  });

  it('never holds two open recommendations, nor two within the cooldown, whatever is sent', () => {
    const step = fc.record({
      gap: fc.integer({ min: 0, max: 20 * MIN }),
      command: fc.oneof(
        fc.constant({ kind: 'advise' as const }),
        fc.record({
          kind: fc.constant('decide' as const),
          decision: fc.constantFrom<AdviceDecision>('ACCEPT', 'POSTPONE', 'DECLINE'),
          reason: fc.constantFrom<AdviceDeclineReason | null>(null, 'NO_STAFF', 'NOT_NEEDED'),
          back: fc.nat({ max: 2 }),
        }),
      ),
    });
    fc.assert(
      fc.property(fc.array(step, { maxLength: 60 }), (steps) => {
        const { day } = CheckpointDay.open({
          seq: 1,
          atMs: DAY_START,
          command: { type: 'OPEN_DAY', config },
        });
        let seq = 1;
        let atMs = DAY_START;
        let ids = 0;
        for (const s of steps) {
          atMs += s.gap;
          const known = day.advices(atMs);
          const command: Command =
            s.command.kind === 'advise'
              ? advise(`a${String(++ids)}`)
              : decide(
                  known[known.length - 1 - s.command.back]?.adviceId ?? 'none',
                  s.command.decision,
                  s.command.reason,
                );
          const allowed = day.canAdvise(atMs);
          const record: CommandRecord = { seq: seq + 1, atMs, command };
          try {
            day.apply(record);
            seq++;
            if (command.type === 'ADVISE_LANES') expect(allowed).toBe(true);
          } catch (error) {
            if (!(error instanceof OperationError)) throw error;
            // The day may have moved its time: it is rebuilt from its log in the API; here the
            // command simply did not happen.
            if (command.type === 'ADVISE_LANES' && allowed) throw error;
          }
          const all = day.advices(atMs);
          // Deduplication: at most one open.
          expect(all.filter((a) => a.status === 'OPEN').length).toBeLessThanOrEqual(1);
          // Cooldown and postponement between consecutive recommendations.
          for (let i = 1; i < all.length; i++) {
            const before = all[i - 1]!;
            const after = all[i]!;
            expect(after.issuedAtMs - before.issuedAtMs).toBeGreaterThanOrEqual(
              ADVICE_RULES.cooldownMs,
            );
            if (before.decision?.decision === 'POSTPONE') {
              expect(after.issuedAtMs - before.decision.atMs).toBeGreaterThanOrEqual(
                ADVICE_RULES.postponeMs,
              );
            }
            if (before.decision !== null) {
              expect(before.decision.atMs).toBeLessThan(
                before.issuedAtMs + ADVICE_RULES.validForMs,
              );
            }
          }
        }
      }),
      { numRuns: 300, seed: 20261122 },
    );
  });
});
