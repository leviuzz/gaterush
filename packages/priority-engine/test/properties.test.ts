import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { KnownDeadline, Segment } from '@gateflow/domain';
import type {
  ConstrainedEdfSelection,
  EngineInput,
  FlightCallSelection,
  WaitingTicket,
} from '../src';
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

const policyArb: fc.Arbitrary<ConstrainedEdfSelection> = fc
  .integer({ min: 1, max: 12 })
  .chain((n) =>
    fc.record({
      kind: fc.constant('constrained-edf' as const),
      capWindowCalls: fc.constant(n),
      capMaxPriorityCalls: fc.integer({ min: 0, max: n }),
      maxOvertakes: fc.integer({ min: 0, max: 20 }),
      attentionThresholdMs: fc.integer({ min: 0, max: 30 * MIN }),
      safetyBufferMs: fc.integer({ min: 0, max: 10 * MIN }),
      feasibilityMarginMs: fc.integer({ min: 0, max: 10 * MIN }),
      allowRuleBasedDeadline: fc.boolean(),
      eligibleSegments: fc.subarray<Segment>(['DEPARTING', 'TRANSFER']),
      latePresentationCutoffMs: fc.option(fc.integer({ min: 0, max: 90 * MIN }), { nil: null }),
    }),
  );

/** Mostly single passengers, some groups (up to 5 people). */
const partySizeArb = fc.oneof(
  { weight: 6, arbitrary: fc.constant(1) },
  { weight: 3, arbitrary: fc.integer({ min: 2, max: 5 }) },
);

/** Tickets without the optional fields, as written by engine 0.2 callers. */
function plain(t: WaitingTicket): WaitingTicket {
  return {
    id: t.id,
    fifoKey: t.fifoKey,
    segment: t.segment,
    deadline: t.deadline,
    walkEstimateMs: t.walkEstimateMs,
    overtakenCount: t.overtakenCount,
  };
}

function people(t: WaitingTicket): number {
  return t.partySize ?? 1;
}

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
          partySize: partySizeArb,
          presentedAtMs: fc.integer({ min: -240 * MIN, max: 60 * MIN }),
          scheduledDepartureMs: fc.option(fc.integer({ min: -30 * MIN, max: 260 * MIN }), {
            nil: null,
          }),
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
    aheadOfWaiting: fc.integer({ min: 0, max: 20 }),
    selection: fc.constant(policy),
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

  it('P2 assesses every waiting ticket exactly once, in FIFO order, after the committed tickets', () => {
    fc.assert(
      fc.property(inputArb, (inp) => {
        const assessments = assessQueue(inp, inp.selection as ConstrainedEdfSelection);
        expect(assessments.map((a) => a.ticketId)).toEqual(byFifo(inp.waiting).map((t) => t.id));
        let ahead = inp.aheadOfWaiting ?? 0;
        byFifo(inp.waiting).forEach((t, i) => {
          expect(assessments[i]!.aheadInFifo).toBe(ahead);
          ahead += people(t);
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
        const policy = inp.selection as ConstrainedEdfSelection;
        const ordered = byFifo(inp.waiting);
        const index = ordered.findIndex((t) => t.overtakenCount >= policy.maxOvertakes);
        const selection = selectNext(inp);
        if (index >= 0) {
          // The ticket at the limit, unless calling it would push an older ticket beyond K.
          const olderMax = Math.max(0, ...ordered.slice(0, index).map((t) => t.overtakenCount));
          const expected = olderMax + people(ordered[index]!) > policy.maxOvertakes ? 0 : index;
          expect(selection?.ticketId).toBe(ordered[expected]!.id);
          expect(selection?.reasons).toEqual(['OVERTAKE_LIMIT_GUARD']);
        }
      }),
      RUNS,
    );
  });

  it('P6 never exceeds the cap within a single decision, counting people', () => {
    fc.assert(
      fc.property(inputArb, (inp) => {
        const policy = inp.selection as ConstrainedEdfSelection;
        const selection = selectNext(inp);
        if (!selection?.priorityCall) return;
        const size = people(byFifo(inp.waiting)[selection.positionInFifo]!);
        // Independent check: after appending `size` priority flags, the last N flags hold at most k.
        const flags = [...inp.recentPriorityCalls, ...Array<boolean>(size).fill(true)];
        const lastWindow = flags.slice(Math.max(0, flags.length - policy.capWindowCalls));
        expect(lastWindow.filter(Boolean).length).toBeLessThanOrEqual(policy.capMaxPriorityCalls);
        expect(size).toBeLessThanOrEqual(policy.capMaxPriorityCalls);
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
            selection: {
              ...policy,
              feasibilityMarginMs: policy.safetyBufferMs,
              latePresentationCutoffMs: null,
            },
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
        const policy = { ...(inp.selection as ConstrainedEdfSelection), capMaxPriorityCalls: 0 };
        const waiting = inp.waiting.map((t) => ({ ...t, overtakenCount: 0 }));
        fc.pre(policy.maxOvertakes > 0);
        const selection = selectNext({ ...inp, selection: policy, waiting });
        if (waiting.length > 0) expect(selection?.ticketId).toBe(byFifo(waiting)[0]!.id);
      }),
      RUNS,
    );
  });

  it('P8 is monotone: an earlier (still feasible) deadline never stops a selected ticket from being selected', () => {
    fc.assert(
      fc.property(inputArb, fc.integer({ min: 1, max: 60 * MIN }), (inp, delta) => {
        const policy = inp.selection as ConstrainedEdfSelection;
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
        const offset = inp.aheadOfWaiting ?? 0;
        const ahead = ordered
          .slice(0, selection.positionInFifo)
          .reduce((sum, t) => sum + people(t), offset);
        const after = assessTicket(earlier, ahead, inp.nowMs, inp.checkpoint, policy, offset);
        // Only meaningful while the ticket stays feasible (CRITICAL tickets are escalated instead).
        fc.pre(after.feasibilitySlackMs === null || after.feasibilitySlackMs >= 0);
        const waiting = inp.waiting.map((t) => (t.id === chosen.id ? earlier : t));
        expect(selectNext({ ...inp, waiting })?.ticketId).toBe(chosen.id);
      }),
      RUNS,
    );
  });

  it('P10 computes the margins from their definitions (independent oracle)', () => {
    fc.assert(
      fc.property(inputArb, (inp) => {
        const policy = inp.selection as ConstrainedEdfSelection;
        const offset = inp.aheadOfWaiting ?? 0;
        const hour = 3_600_000;
        const wait = (people: number) =>
          Math.floor((people * hour) / inp.checkpoint.throughputPerHour);
        const ordered = byFifo(inp.waiting);
        let ahead = offset;
        assessQueue(inp, policy).forEach((a, i) => {
          const t = ordered[i]!;
          const aheadOfThis = ahead;
          ahead += people(t);
          if (a.latestCallMs === null) return;
          const journey =
            inp.checkpoint.responseMs + inp.checkpoint.processMs * people(t) + t.walkEstimateMs;
          const latest = t.deadline.atMs! - (journey + policy.safetyBufferMs);
          const feasibility =
            t.deadline.atMs! - (journey + policy.feasibilityMarginMs) - inp.nowMs - wait(offset);
          expect(a.latestCallMs).toBe(latest);
          expect(a.slackFifoMs).toBe(latest - inp.nowMs - wait(aheadOfThis));
          expect(a.slackNowMs).toBe(latest - inp.nowMs - wait(offset));
          expect(a.feasibilitySlackMs).toBe(feasibility);
          expect(a.riskClass === 'CRITICAL').toBe(feasibility < 0);
        });
      }),
      RUNS,
    );
  });

  it('P11 selection and assessment agree on which tickets are boost-eligible URGENT', () => {
    fc.assert(
      fc.property(inputArb, (inp) => {
        const selection = selectNext(inp);
        if (selection === null) return;
        const eligible = assessQueue(inp, inp.selection as ConstrainedEdfSelection).filter(
          (a) => a.boostEligible,
        );
        expect(selection.urgentCandidates).toBe(eligible.length);
        if (selection.priorityCall) {
          expect(eligible.map((a) => a.ticketId)).toContain(selection.ticketId);
        }
      }),
      RUNS,
    );
  });

  it('P9 over a sequence of calls: every window of N people has at most k called by priority and no ticket is overtaken by more than K people', () => {
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
              selection: policy,
            });
            if (selection === null) break;
            const size = people(waiting.find((t) => t.id === selection.ticketId)!);
            waiting = waiting
              .filter((t) => t.id !== selection.ticketId)
              .map((t) =>
                t.fifoKey < selection.fifoKey
                  ? { ...t, overtakenCount: t.overtakenCount + size }
                  : t,
              );
            for (let p = 0; p < size; p++) calls.push(selection.priorityCall);
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

  it('P12 never boosts a departing passenger who presented after the cutoff, nor a group larger than the cap', () => {
    fc.assert(
      fc.property(inputArb, (inp) => {
        const policy = inp.selection as ConstrainedEdfSelection;
        const selection = selectNext(inp);
        if (!selection?.priorityCall) return;
        const t = byFifo(inp.waiting)[selection.positionInFifo]!;
        expect(people(t)).toBeLessThanOrEqual(policy.capMaxPriorityCalls);
        const cutoff = policy.latePresentationCutoffMs;
        if (cutoff !== null && t.segment === 'DEPARTING') {
          expect(t.scheduledDepartureMs).not.toBeNull();
          expect(t.presentedAtMs!).toBeLessThanOrEqual(t.scheduledDepartureMs! - cutoff);
        }
      }),
      RUNS,
    );
  });

  it('P13 tickets without the optional fields behave as single passengers with no presentation rule', () => {
    fc.assert(
      fc.property(inputArb, (inp) => {
        const policy = {
          ...(inp.selection as ConstrainedEdfSelection),
          latePresentationCutoffMs: null,
        };
        const withDefaults = inp.waiting.map((t) => ({
          ...plain(t),
          partySize: 1,
          presentedAtMs: t.presentedAtMs,
          scheduledDepartureMs: t.scheduledDepartureMs,
        }));
        expect(selectNext({ ...inp, selection: policy, waiting: inp.waiting.map(plain) })).toEqual(
          selectNext({ ...inp, selection: policy, waiting: withDefaults }),
        );
      }),
      RUNS,
    );
  });

  it('P14 flight calls take the earliest closing flight among the called ones, else FIFO (oracle)', () => {
    const flightCallArb: fc.Arbitrary<FlightCallSelection> = fc.record({
      kind: fc.constant('flight-call' as const),
      callWindowMs: fc.integer({ min: 0, max: 60 * MIN }),
      announcementIntervalMs: fc.integer({ min: 1, max: 15 * MIN }),
    });
    fc.assert(
      fc.property(
        inputArb,
        flightCallArb,
        fc.integer({ min: -60 * MIN, max: 240 * MIN }),
        (inp, call, now) => {
          const selection = selectNext({ ...inp, nowMs: now, selection: call });
          const ordered = byFifo(inp.waiting);
          if (ordered.length === 0) {
            expect(selection).toBeNull();
            return;
          }
          const announcement =
            Math.floor(now / call.announcementIntervalMs) * call.announcementIntervalMs;
          const called = ordered.filter(
            (t) => t.deadline.atMs !== null && t.deadline.atMs - announcement <= call.callWindowMs,
          );
          const expected = called.reduce<WaitingTicket | undefined>(
            (best, t) => (best === undefined || t.deadline.atMs! < best.deadline.atMs! ? t : best),
            undefined,
          );
          expect(selection?.ticketId).toBe((expected ?? ordered[0]!).id);
          expect(selection?.urgentCandidates).toBe(called.length);
          expect(selection?.reasons).toEqual([expected === undefined ? 'FIFO' : 'FLIGHT_CALL']);
        },
      ),
      RUNS,
    );
  });
});
