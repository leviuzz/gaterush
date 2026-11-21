import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { KnownDeadline, Segment } from '@gateflow/domain';
import type { ConstrainedEdfPolicyParams, EngineInput, WaitingTicket } from '../src';
import { assessQueue, assessTicket, priorityCallsInWindow, selectNext } from '../src';
import { MIN } from './fixtures';

const RUNS = { numRuns: 1000 };

const segmentArb = fc.constantFrom<Segment>('DEPARTING', 'TRANSFER');

const deadlineArb: fc.Arbitrary<KnownDeadline> = fc.oneof(
  fc.constant<KnownDeadline>({ atMs: null, source: 'NONE' }),
  fc.record({
    atMs: fc.integer({ min: -30 * MIN, max: 240 * MIN }),
    source: fc.constantFrom<'FEED' | 'RULE'>('FEED', 'RULE'),
  }),
);

const policyArb: fc.Arbitrary<ConstrainedEdfPolicyParams> = fc
  .integer({ min: 1, max: 12 })
  .chain((n) =>
    fc.record({
      kind: fc.constant('constrained-edf' as const),
      capWindowCalls: fc.constant(n),
      capMaxPriorityCalls: fc.integer({ min: 0, max: n }),
      maxOvertakes: fc.integer({ min: 0, max: 20 }),
      attentionThresholdMs: fc.integer({ min: 0, max: 30 * MIN }),
      safetyBufferMs: fc.integer({ min: 0, max: 10 * MIN }),
      allowRuleBasedDeadline: fc.boolean(),
      eligibleSegments: fc.subarray<Segment>(['DEPARTING', 'TRANSFER']),
    }),
  );

function ticketsArb(maxOvertakes: number, maxLength = 30): fc.Arbitrary<WaitingTicket[]> {
  return fc.uniqueArray(fc.integer({ min: 0, max: 100_000 }), { maxLength }).chain((keys) =>
    fc.tuple(
      ...keys.map((key) =>
        fc.record({
          id: fc.constant(`t${key}`),
          fifoKey: fc.constant(key),
          segment: segmentArb,
          deadline: deadlineArb,
          walkEstimateMs: fc.integer({ min: 0, max: 20 * MIN }),
          overtakenCount: fc.integer({ min: 0, max: maxOvertakes }),
        }),
      ),
    ),
  );
}

const checkpointArb = fc.record({
  throughputPerHour: fc.integer({ min: 30, max: 2000 }),
  processMs: fc.integer({ min: 0, max: 3 * MIN }),
  responseMs: fc.integer({ min: 0, max: 3 * MIN }),
});

const inputArb: fc.Arbitrary<EngineInput> = policyArb.chain((policy) =>
  fc.record({
    nowMs: fc.integer({ min: 0, max: 60 * MIN }),
    checkpoint: checkpointArb,
    waiting: ticketsArb(policy.maxOvertakes),
    recentPriorityCalls: fc.array(fc.boolean(), { maxLength: 15 }),
    policy: fc.constant(policy),
  }),
);

function byFifo(waiting: readonly WaitingTicket[]): WaitingTicket[] {
  return [...waiting].sort((a, b) => a.fifoKey - b.fifoKey);
}

describe('priority engine properties', () => {
  it('P1 is deterministic and independent of the order of the waiting list', () => {
    fc.assert(
      fc.property(
        inputArb.chain((inp) =>
          fc.tuple(
            fc.constant(inp),
            fc.shuffledSubarray(inp.waiting as WaitingTicket[], {
              minLength: inp.waiting.length,
              maxLength: inp.waiting.length,
            }),
          ),
        ),
        ([inp, shuffled]) => {
          const a = selectNext(inp);
          expect(selectNext(inp)).toEqual(a);
          expect(selectNext({ ...inp, waiting: shuffled })).toEqual(a);
        },
      ),
      RUNS,
    );
  });

  it('P2 assesses every waiting ticket exactly once, in FIFO order', () => {
    fc.assert(
      fc.property(inputArb, (inp) => {
        const assessments = assessQueue(inp, inp.policy as ConstrainedEdfPolicyParams);
        expect(assessments.map((a) => a.ticketId)).toEqual(byFifo(inp.waiting).map((t) => t.id));
        assessments.forEach((a, i) => {
          expect(a.aheadInFifo).toBe(i);
        });
      }),
      RUNS,
    );
  });

  it('P3 always selects a waiting ticket (null only for an empty queue)', () => {
    fc.assert(
      fc.property(inputArb, (inp) => {
        const selection = selectNext(inp);
        if (inp.waiting.length === 0) {
          expect(selection).toBeNull();
          return;
        }
        expect(selection).not.toBeNull();
        const ordered = byFifo(inp.waiting);
        expect(ordered[selection!.positionInFifo]?.id).toBe(selection!.ticketId);
      }),
      RUNS,
    );
  });

  it('P4 never boosts UNVERIFIED or CRITICAL tickets: priority calls are always URGENT', () => {
    fc.assert(
      fc.property(inputArb, (inp) => {
        const selection = selectNext(inp);
        if (selection === null) return;
        if (selection.priorityCall) {
          expect(selection.assessment?.riskClass).toBe('URGENT');
          expect(selection.assessment?.boostEligible).toBe(true);
          expect(selection.reasons).toEqual(['URGENT_FEASIBLE']);
        }
        const cls = selection.assessment?.riskClass;
        if (cls === 'UNVERIFIED' || cls === 'CRITICAL' || cls === 'NORMAL' || cls === 'ATTENTION') {
          // Such tickets are called only in FIFO order or by the overtake guard.
          expect(
            selection.positionInFifo === 0 || selection.reasons.includes('OVERTAKE_LIMIT_GUARD'),
          ).toBe(true);
        }
      }),
      RUNS,
    );
  });

  it('P5 gives the overtake guard precedence: the oldest ticket at the limit is called', () => {
    fc.assert(
      fc.property(inputArb, (inp) => {
        const policy = inp.policy as ConstrainedEdfPolicyParams;
        const atLimit = byFifo(inp.waiting).find((t) => t.overtakenCount >= policy.maxOvertakes);
        const selection = selectNext(inp);
        if (atLimit !== undefined) {
          expect(selection?.ticketId).toBe(atLimit.id);
          expect(selection?.reasons).toEqual(['OVERTAKE_LIMIT_GUARD']);
        }
      }),
      RUNS,
    );
  });

  it('P6 never exceeds the cap within a single decision', () => {
    fc.assert(
      fc.property(inputArb, (inp) => {
        const policy = inp.policy as ConstrainedEdfPolicyParams;
        const used = priorityCallsInWindow(inp.recentPriorityCalls, policy.capWindowCalls);
        const selection = selectNext(inp);
        if (used >= policy.capMaxPriorityCalls)
          expect(selection?.priorityCall ?? false).toBe(false);
      }),
      RUNS,
    );
  });

  it('P6b boosts an urgent ticket exactly when the cap still has room', () => {
    fc.assert(
      fc.property(
        policyArb.filter((p) => p.maxOvertakes > 0 && p.eligibleSegments.includes('DEPARTING')),
        checkpointArb,
        fc.integer({ min: 1, max: 25 }),
        fc.array(fc.boolean(), { maxLength: 15 }),
        (policy, checkpoint, position, recentPriorityCalls) => {
          // Relaxed tickets everywhere, plus one ticket that is URGENT by construction: its slack
          // if called now is one millisecond short of its FIFO wait.
          const fixed = checkpoint.responseMs + checkpoint.processMs + policy.safetyBufferMs;
          const fifoWait = Math.floor((position * 3_600_000) / checkpoint.throughputPerHour);
          fc.pre(fifoWait >= 1);
          const waiting: WaitingTicket[] = Array.from({ length: position + 3 }, (_, i) => ({
            id: `t${i}`,
            fifoKey: i,
            segment: 'DEPARTING',
            deadline: {
              atMs: i === position ? fixed + fifoWait - 1 : 100_000 * MIN,
              source: 'FEED',
            },
            walkEstimateMs: 0,
            overtakenCount: 0,
          }));
          const used = priorityCallsInWindow(recentPriorityCalls, policy.capWindowCalls);
          const selection = selectNext({
            nowMs: 0,
            checkpoint,
            waiting,
            recentPriorityCalls,
            policy,
          });
          expect(selection?.urgentCandidates).toBe(1);
          expect(selection?.priorityCall).toBe(used < policy.capMaxPriorityCalls);
          expect(selection?.ticketId).toBe(
            used < policy.capMaxPriorityCalls ? `t${position}` : 't0',
          );
        },
      ),
      RUNS,
    );
  });

  it('P7 reduces to FIFO when the cap is zero and nobody reached the overtake limit', () => {
    fc.assert(
      fc.property(inputArb, (inp) => {
        const policy = { ...(inp.policy as ConstrainedEdfPolicyParams), capMaxPriorityCalls: 0 };
        const waiting = inp.waiting.map((t) => ({ ...t, overtakenCount: 0 }));
        fc.pre(policy.maxOvertakes > 0);
        const selection = selectNext({ ...inp, policy, waiting });
        if (waiting.length > 0) expect(selection?.ticketId).toBe(byFifo(waiting)[0]!.id);
      }),
      RUNS,
    );
  });

  it('P8 is monotone: an earlier (still feasible) deadline never stops a selected ticket from being selected', () => {
    fc.assert(
      fc.property(inputArb, fc.integer({ min: 1, max: 60 * MIN }), (inp, delta) => {
        const policy = inp.policy as ConstrainedEdfPolicyParams;
        const selection = selectNext(inp);
        fc.pre(selection !== null);
        const ordered = byFifo(inp.waiting);
        const chosen = ordered[selection.positionInFifo]!;
        const deadlineMs = chosen.deadline.atMs;
        fc.pre(deadlineMs !== null);
        const earlier: WaitingTicket = {
          ...chosen,
          deadline: { ...chosen.deadline, atMs: deadlineMs - delta },
        };
        const after = assessTicket(
          earlier,
          selection.positionInFifo,
          inp.nowMs,
          inp.checkpoint,
          policy,
        );
        // Only meaningful while the ticket stays feasible (CRITICAL tickets are escalated instead).
        fc.pre(after.slackNowMs === null || after.slackNowMs >= 0);
        const waiting = inp.waiting.map((t) => (t.id === chosen.id ? earlier : t));
        expect(selectNext({ ...inp, waiting })?.ticketId).toBe(chosen.id);
      }),
      RUNS,
    );
  });

  it('P9 over a sequence of calls: every window of N calls has at most k priority calls and no ticket is overtaken more than K times', () => {
    const scenarioArb = policyArb.chain((policy) =>
      fc.record({
        policy: fc.constant(policy),
        checkpoint: checkpointArb,
        batches: fc.array(ticketsArb(0, 8), { minLength: 1, maxLength: 12 }),
        stepMs: fc.integer({ min: 0, max: 2 * MIN }),
      }),
    );
    fc.assert(
      fc.property(scenarioArb, ({ policy, checkpoint, batches, stepMs }) => {
        let waiting: WaitingTicket[] = [];
        const calls: boolean[] = [];
        let maxOvertaken = 0;
        let nextKey = 0;
        let now = 0;
        for (const batch of batches) {
          // New arrivals get increasing FIFO keys.
          for (const t of batch) waiting.push({ ...t, id: `n${nextKey}`, fifoKey: nextKey++ });
          // Serve two calls per batch.
          for (let c = 0; c < 2; c++) {
            const selection = selectNext({
              nowMs: now,
              checkpoint,
              waiting,
              recentPriorityCalls: calls,
              policy,
            });
            if (selection === null) break;
            waiting = waiting
              .filter((t) => t.id !== selection.ticketId)
              .map((t) =>
                t.fifoKey < selection.fifoKey ? { ...t, overtakenCount: t.overtakenCount + 1 } : t,
              );
            calls.push(selection.priorityCall);
            for (const t of waiting) maxOvertaken = Math.max(maxOvertaken, t.overtakenCount);
            now += stepMs;
          }
        }
        expect(maxOvertaken).toBeLessThanOrEqual(policy.maxOvertakes);
        for (let start = 0; start + policy.capWindowCalls <= calls.length; start++) {
          const window = calls.slice(start, start + policy.capWindowCalls);
          expect(window.filter(Boolean).length).toBeLessThanOrEqual(policy.capMaxPriorityCalls);
        }
      }),
      RUNS,
    );
  });
});
