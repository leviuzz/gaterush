import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { KnownDeadline, Segment } from '@gateflow/domain';
import type {
  ConstrainedEdfSelection,
  EngineInput,
  FlightCallSelection,
  WaitingTicket,
} from '../src';
import { RISK_CLASSES } from '@gateflow/domain';
import type { RiskClass } from '@gateflow/domain';
import { assessQueue, assessTicket, priorityCallsInWindow, selectNext } from '../src';
import type { CheckpointEstimates } from '../src';
import { MIN } from './fixtures';

const RUNS = { numRuns: 1000 };

const segmentArb = fc.constantFrom<Segment>('DEPARTING', 'TRANSFER');

const deadlineArb: fc.Arbitrary<KnownDeadline> = fc.oneof(
  fc.constant<KnownDeadline>({ atMs: null, source: 'NONE' }),
  fc.record({
    atMs: fc.integer({ min: -30 * MIN, max: 240 * MIN }),
    source: fc.constantFrom<'FEED' | 'RULE'>('FEED', 'RULE'),
  }),
  // Confirmed some time ago (possibly stale under a maximum data age).
  fc.record({
    atMs: fc.integer({ min: -30 * MIN, max: 240 * MIN }),
    source: fc.constantFrom<'FEED' | 'RULE'>('FEED', 'RULE'),
    observedAtMs: fc.integer({ min: -60 * MIN, max: 60 * MIN }),
  }),
);

const lastClassArb: fc.Arbitrary<RiskClass | undefined> = fc.option(
  fc.constantFrom(...RISK_CLASSES),
  { nil: undefined },
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
      fastTrack: fc.boolean(),
      maxDeadlineAgeMs: fc.option(fc.integer({ min: 0, max: 30 * MIN }), { nil: null }),
      hysteresisMs: fc.oneof(fc.constant(0), fc.integer({ min: 0, max: 5 * MIN })),
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
          lastSeenAtMs: fc.integer({ min: -60 * MIN, max: 60 * MIN }),
          lastRiskClass: lastClassArb,
        }),
      ),
    ),
  );
}

const checkpointArb: fc.Arbitrary<CheckpointEstimates> = fc
  .integer({ min: 0, max: 3 * MIN })
  .chain((responseMs) =>
    fc.record({
      throughputPerHour: fc.integer({ min: 30, max: 2000 }),
      processMs: fc.integer({ min: 0, max: 3 * MIN }),
      responseMs: fc.constant(responseMs),
      fastTrackResponseMs: fc.integer({ min: 0, max: responseMs }),
    }),
  );

const inputArb: fc.Arbitrary<EngineInput> = policyArb.chain((policy) =>
  fc.record({
    nowMs: fc.integer({ min: 0, max: 60 * MIN }),
    checkpoint: checkpointArb,
    waiting: ticketsArb(policy.maxOvertakes),
    recentPriorityCalls: fc.array(fc.boolean(), { maxLength: 15 }),
    aheadOfWaiting: fc.integer({ min: 0, max: 20 }),
    aheadMaxOvertakenCount: fc.integer({ min: 0, max: policy.maxOvertakes + 2 }),
    selection: fc.constant(policy),
  }),
);

/** The response time of a boosted call, from its definition (ADR-027). */
function boostResponse(
  t: WaitingTicket,
  inp: Pick<EngineInput, 'nowMs' | 'checkpoint'>,
  policy: ConstrainedEdfSelection,
): number {
  if (!policy.fastTrack) return inp.checkpoint.responseMs;
  const base = inp.checkpoint.fastTrackResponseMs ?? inp.checkpoint.responseMs;
  if (t.lastSeenAtMs === undefined) return base;
  return Math.min(base, Math.max(0, inp.nowMs - t.lastSeenAtMs));
}

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
        // Only meaningful while the ticket does not become CRITICAL: CRITICAL tickets are escalated
        // instead, and a ticket that was CRITICAL stays so until its feasibility margin exceeds the
        // hysteresis h, however feasible it is (ADR-030; the case below, found in CI).
        fc.pre(after.riskClass !== 'CRITICAL');
        const waiting = inp.waiting.map((t) => (t.id === chosen.id ? earlier : t));
        expect(selectNext({ ...inp, waiting })?.ticketId).toBe(chosen.id);
      }),
      RUNS,
    );
  });

  it('P8 stops at a ticket the hysteresis keeps CRITICAL, however feasible (CI, seed 1735679738)', () => {
    // The shrunk counterexample of P8 before its precondition named the hysteresis: a ticket last
    // CRITICAL whose feasibility margin equals h is URGENT and selected; a deadline 1 ms earlier
    // leaves it feasible (margin h - 1) but CRITICAL, escalated to staff, and the FIFO head goes.
    const ticket = (
      id: string,
      fifoKey: number,
      partySize: number,
      atMs: number | null,
      extra: Partial<WaitingTicket> = {},
    ): WaitingTicket => ({
      id,
      fifoKey,
      segment: 'DEPARTING',
      deadline: atMs === null ? { atMs: null, source: 'NONE' } : { atMs, source: 'FEED' },
      walkEstimateMs: 0,
      overtakenCount: 0,
      partySize,
      presentedAtMs: 0,
      scheduledDepartureMs: null,
      lastSeenAtMs: 0,
      ...extra,
    });
    const policy: ConstrainedEdfSelection = {
      kind: 'constrained-edf',
      capWindowCalls: 12,
      capMaxPriorityCalls: 12,
      maxOvertakes: 14,
      attentionThresholdMs: 9,
      safetyBufferMs: 195_749,
      feasibilityMarginMs: 29_745,
      allowRuleBasedDeadline: false,
      eligibleSegments: ['DEPARTING', 'TRANSFER'],
      latePresentationCutoffMs: 3_653_266,
      fastTrack: false,
      maxDeadlineAgeMs: 1_681_399,
      hysteresisMs: 165_736,
    };
    const critical = (atMs: number) =>
      ticket('t9991', 9991, 2, atMs, {
        deadline: { atMs, source: 'FEED', observedAtMs: 0 },
        scheduledDepartureMs: 3_653_266,
        lastRiskClass: 'CRITICAL',
      });
    const input = (atMs: number): EngineInput => ({
      nowMs: 0,
      checkpoint: {
        throughputPerHour: 30,
        processMs: 0,
        responseMs: 104_491,
        fastTrackResponseMs: 0,
      },
      waiting: [
        ticket('t15389', 15389, 1, 0),
        ticket('t26721', 26721, 2, null),
        ticket('t5030', 5030, 2, null),
        critical(atMs),
        ticket('t11775', 11775, 1, null),
        ticket('t90833', 90833, 1, 0),
        ticket('t95288', 95288, 1, 0),
        ticket('t12468', 12468, 2, 0),
        ticket('t19869', 19869, 2, 0),
        ticket('t8139', 8139, 1, null),
      ],
      recentPriorityCalls: [],
      aheadOfWaiting: 0,
      aheadMaxOvertakenCount: 0,
      selection: policy,
    });
    const at = (atMs: number) =>
      assessTicket(critical(atMs), 3, 0, input(atMs).checkpoint, policy, 0);
    expect([at(299_972).riskClass, at(299_972).feasibilitySlackMs]).toEqual(['URGENT', 165_736]);
    expect(selectNext(input(299_972))?.ticketId).toBe('t9991');
    expect([at(299_971).riskClass, at(299_971).feasibilitySlackMs]).toEqual(['CRITICAL', 165_735]);
    expect(selectNext(input(299_971))?.ticketId).toBe('t5030');
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
          // Stale under the policy's maximum data age: UNVERIFIED, like an unknown deadline.
          const maxAge = policy.maxDeadlineAgeMs;
          const observed = t.deadline.observedAtMs;
          const stale = maxAge !== null && observed !== undefined && inp.nowMs - observed > maxAge;
          if (stale && t.deadline.atMs !== null) expect(a.riskClass).toBe('UNVERIFIED');
          if (a.latestCallMs === null) return;
          expect(stale).toBe(false);
          const tail = inp.checkpoint.processMs * people(t) + t.walkEstimateMs;
          const queueJourney = inp.checkpoint.responseMs + tail;
          const boostJourney = boostResponse(t, inp, policy) + tail;
          // Under the fast track a boosted call is made next: no time to call the committed ones.
          const drain = policy.fastTrack ? 0 : wait(offset);
          const latest = t.deadline.atMs! - (boostJourney + policy.safetyBufferMs);
          const feasibility =
            t.deadline.atMs! - (boostJourney + policy.feasibilityMarginMs) - inp.nowMs - drain;
          expect(a.latestCallMs).toBe(latest);
          expect(a.slackFifoMs).toBe(
            t.deadline.atMs! -
              (queueJourney + policy.safetyBufferMs) -
              inp.nowMs -
              wait(aheadOfThis),
          );
          expect(a.slackNowMs).toBe(latest - inp.nowMs - drain);
          expect(a.feasibilitySlackMs).toBe(feasibility);
          // Independent statement of the hysteresis: a threshold already crossed moves by h.
          const rank = ['NORMAL', 'ATTENTION', 'URGENT', 'CRITICAL'].indexOf(t.lastRiskClass ?? '');
          const h = policy.hysteresisMs;
          const slackFifo = a.slackFifoMs!;
          const expected =
            feasibility < (rank >= 3 ? h : 0)
              ? 'CRITICAL'
              : slackFifo < (rank >= 2 ? h : 0)
                ? 'URGENT'
                : slackFifo < policy.attentionThresholdMs + (rank >= 1 ? h : 0)
                  ? 'ATTENTION'
                  : 'NORMAL';
          expect(a.riskClass).toBe(expected);
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

  it('P15 under the fast track a priority call never pushes a committed person beyond K', () => {
    fc.assert(
      fc.property(inputArb, (inp) => {
        const policy = inp.selection as ConstrainedEdfSelection;
        const selection = selectNext(inp);
        if (!selection?.priorityCall || !policy.fastTrack) return;
        const size = people(byFifo(inp.waiting)[selection.positionInFifo]!);
        expect((inp.aheadMaxOvertakenCount ?? 0) + size).toBeLessThanOrEqual(policy.maxOvertakes);
      }),
      RUNS,
    );
  });

  it('P16 the fast track never makes a ticket less feasible, and leaves the FIFO margin unchanged', () => {
    fc.assert(
      fc.property(inputArb, (inp) => {
        const policy = inp.selection as ConstrainedEdfSelection;
        const on = assessQueue(inp, { ...policy, fastTrack: true });
        const off = assessQueue(inp, { ...policy, fastTrack: false });
        on.forEach((a, i) => {
          const b = off[i]!;
          expect(a.slackFifoMs).toBe(b.slackFifoMs);
          if (a.feasibilitySlackMs !== null) {
            expect(a.feasibilitySlackMs).toBeGreaterThanOrEqual(b.feasibilitySlackMs!);
          }
          // A ticket feasible without the fast track stays feasible with it.
          if (b.riskClass !== 'CRITICAL') expect(a.riskClass).not.toBe('CRITICAL');
        });
      }),
      RUNS,
    );
  });

  it('P17 without the fast track, the S4 inputs are ignored (S3 behaviour)', () => {
    fc.assert(
      fc.property(inputArb, (inp) => {
        const policy = { ...(inp.selection as ConstrainedEdfSelection), fastTrack: false };
        const s3Input: EngineInput = {
          nowMs: inp.nowMs,
          checkpoint: {
            throughputPerHour: inp.checkpoint.throughputPerHour,
            processMs: inp.checkpoint.processMs,
            responseMs: inp.checkpoint.responseMs,
          },
          waiting: inp.waiting.map((t) => {
            const copy = { ...t };
            delete copy.lastSeenAtMs;
            return copy;
          }),
          recentPriorityCalls: inp.recentPriorityCalls,
          selection: policy,
          ...(inp.aheadOfWaiting === undefined ? {} : { aheadOfWaiting: inp.aheadOfWaiting }),
        };
        expect(selectNext({ ...inp, selection: policy })).toEqual(selectNext(s3Input));
      }),
      RUNS,
    );
  });

  it('P18 never boosts a ticket whose deadline is stale under the maximum data age', () => {
    fc.assert(
      fc.property(inputArb, (inp) => {
        const policy = inp.selection as ConstrainedEdfSelection;
        const selection = selectNext(inp);
        if (!selection?.priorityCall || policy.maxDeadlineAgeMs === null) return;
        const t = byFifo(inp.waiting)[selection.positionInFifo]!;
        const observed = t.deadline.observedAtMs;
        if (observed !== undefined) {
          expect(inp.nowMs - observed).toBeLessThanOrEqual(policy.maxDeadlineAgeMs);
        }
      }),
      RUNS,
    );
  });

  it('P19 hysteresis only holds a class: never less urgent than the margins, never beyond the previous class', () => {
    const rank = (c: RiskClass) => ['NORMAL', 'ATTENTION', 'URGENT', 'CRITICAL'].indexOf(c);
    fc.assert(
      fc.property(inputArb, (inp) => {
        const policy = inp.selection as ConstrainedEdfSelection;
        const withH = assessQueue(inp, policy);
        const raw = assessQueue(
          { ...inp, waiting: inp.waiting.map((t) => ({ ...t, lastRiskClass: undefined })) },
          policy,
        );
        const ordered = byFifo(inp.waiting);
        withH.forEach((a, i) => {
          const b = raw[i]!;
          if (a.riskClass === 'UNVERIFIED' || b.riskClass === 'UNVERIFIED') {
            expect(a.riskClass).toBe(b.riskClass);
            return;
          }
          expect(rank(a.riskClass)).toBeGreaterThanOrEqual(rank(b.riskClass));
          const last = ordered[i]!.lastRiskClass;
          if (a.riskClass !== b.riskClass) {
            expect(last).toBeDefined();
            expect(rank(a.riskClass)).toBeLessThanOrEqual(rank(last!));
            expect(a.reasons).toContain('HYSTERESIS_HOLD');
          }
        });
        // Without hysteresis the previous class does not matter at all.
        const noH = { ...policy, hysteresisMs: 0 };
        expect(assessQueue(inp, noH).map((a) => a.riskClass)).toEqual(
          assessQueue(
            { ...inp, waiting: inp.waiting.map((t) => ({ ...t, lastRiskClass: undefined })) },
            noH,
          ).map((a) => a.riskClass),
        );
      }),
      RUNS,
    );
  });

  it('P20 limits flapping: margins oscillating within h around a threshold change the class at most once', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 5 * MIN }),
        fc.array(fc.double({ min: -0.99, max: 0.99, noNaN: true }), {
          minLength: 2,
          maxLength: 40,
        }),
        fc.constantFrom(0, 15 * MIN),
        (h, swings, threshold) => {
          // A ticket whose FIFO margin oscillates around the threshold (URGENT/ATTENTION at 0, or
          // ATTENTION/NORMAL at the attention threshold) by strictly less than h.
          const policy: ConstrainedEdfSelection = {
            kind: 'constrained-edf',
            capWindowCalls: 10,
            capMaxPriorityCalls: 3,
            maxOvertakes: 15,
            attentionThresholdMs: 15 * MIN,
            safetyBufferMs: 0,
            feasibilityMarginMs: 0,
            allowRuleBasedDeadline: true,
            eligibleSegments: ['DEPARTING', 'TRANSFER'],
            latePresentationCutoffMs: null,
            fastTrack: false,
            maxDeadlineAgeMs: null,
            hysteresisMs: h,
          };
          const checkpoint = { throughputPerHour: 60, processMs: 0, responseMs: 0 };
          const changes = (hysteresisMs: number) => {
            let last: RiskClass | undefined;
            let count = 0;
            for (const swing of swings) {
              // Twenty people ahead (20 minutes of FIFO wait), so that the ticket stays feasible;
              // the deadline sets the FIFO margin.
              const margin = threshold + Math.trunc(swing * h);
              const ticket: WaitingTicket = {
                id: 't',
                fifoKey: 1,
                segment: 'DEPARTING',
                deadline: { atMs: 20 * MIN + margin + 1_000_000, source: 'FEED' },
                walkEstimateMs: 0,
                overtakenCount: 0,
                ...(last === undefined ? {} : { lastRiskClass: last }),
              };
              const a = assessTicket(
                ticket,
                20,
                1_000_000,
                checkpoint,
                { ...policy, hysteresisMs },
                0,
              );
              if (last !== undefined && a.riskClass !== last) count++;
              last = a.riskClass;
            }
            return count;
          };
          expect(changes(h)).toBeLessThanOrEqual(1);
          // Without hysteresis every crossing of the threshold is a change.
          let crossings = 0;
          for (let i = 1; i < swings.length; i++) {
            const before = threshold + Math.trunc(swings[i - 1]! * h) < threshold;
            const now = threshold + Math.trunc(swings[i]! * h) < threshold;
            if (before !== now) crossings++;
          }
          expect(changes(0)).toBe(crossings);
        },
      ),
      RUNS,
    );
  });
});
