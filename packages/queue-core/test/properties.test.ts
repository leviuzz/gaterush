import fc from 'fast-check';
import { MS_PER_MINUTE, RISK_CLASSES } from '@gateflow/domain';
import type { KnownDeadline, RiskClass } from '@gateflow/domain';
import type {
  CheckpointEstimates,
  ConstrainedEdfSelection,
  SelectionParams,
} from '@gateflow/priority-engine';
import { describe, expect, it } from 'vitest';
import { CheckpointQueue, PRIORITY_V0_POLICY, classificationOf } from '../src';
import type { Policy, QueueEvent, QueueStats, TicketState, VirtualQueue } from '../src';
import { ACTIONS, TRANSITIONS, act, statesAfter } from './staff-actions';
import type { Action } from './staff-actions';

const MIN = MS_PER_MINUTE;
const RUNS = { numRuns: 1000 };
const CLASSIFICATION = classificationOf(PRIORITY_V0_POLICY)!;
/** 60 pax/h: every position in the queue is one minute of wait, so deadlines bite quickly. */
const EST: CheckpointEstimates = { throughputPerHour: 60, processMs: 30_000, responseMs: 60_000 };

const selectionArb: fc.Arbitrary<SelectionParams> = fc.oneof(
  { weight: 1, arbitrary: fc.constant({ kind: 'fifo' } as const) },
  {
    weight: 1,
    arbitrary: fc.record({
      kind: fc.constant('flight-call' as const),
      callWindowMs: fc.integer({ min: 0, max: 30 * MIN }),
      announcementIntervalMs: fc.integer({ min: 1, max: 10 * MIN }),
    }),
  },
  {
    weight: 3,
    arbitrary: fc.integer({ min: 1, max: 10 }).chain((n) =>
      fc.record({
        kind: fc.constant('constrained-edf' as const),
        capWindowCalls: fc.constant(n),
        capMaxPriorityCalls: fc.integer({ min: 0, max: n }),
        maxOvertakes: fc.integer({ min: 0, max: 8 }),
        attentionThresholdMs: fc.constant(15 * MIN),
        safetyBufferMs: fc.integer({ min: 0, max: 5 * MIN }),
        feasibilityMarginMs: fc.integer({ min: 0, max: 5 * MIN }),
        allowRuleBasedDeadline: fc.boolean(),
        eligibleSegments: fc.constant(['DEPARTING', 'TRANSFER'] as const),
        latePresentationCutoffMs: fc.option(fc.integer({ min: 0, max: 40 * MIN }), {
          nil: null,
        }),
        fastTrack: fc.boolean(),
        maxDeadlineAgeMs: fc.option(fc.integer({ min: 0, max: 10 * MIN }), { nil: null }),
        hysteresisMs: fc.oneof(fc.constant(0), fc.integer({ min: 0, max: 3 * MIN })),
      }),
    ),
  },
);

const queueArb: fc.Arbitrary<VirtualQueue> = fc.record({
  kind: fc.constant('virtual' as const),
  callAheadSeconds: fc.constant(60),
  responseEstimateSeconds: fc.constant(60),
  prepareWindowSize: fc.integer({ min: 0, max: 5 }),
  callTimeoutMs: fc.integer({ min: 1, max: 4 * MIN }),
  recallTimeoutMs: fc.integer({ min: 0, max: 3 * MIN }),
  reactivationWindowMs: fc.integer({ min: 0, max: 10 * MIN }),
  maxReactivations: fc.integer({ min: 0, max: 2 }),
  reactivationPosition: fc.constantFrom('ORIGINAL' as const, 'BACK' as const),
});

const policyArb: fc.Arbitrary<Policy> = fc.record({
  id: fc.constant('p'),
  version: fc.constant('0'),
  title: fc.constant('property policy'),
  selection: selectionArb,
  queue: queueArb,
});

type Op =
  | {
      readonly kind: 'issue';
      readonly deadlineMin: number | null;
      readonly dt: number;
      readonly partySize: number;
      readonly transfer: boolean;
    }
  | { readonly kind: 'call'; readonly dt: number }
  /** The flight feed sends a new deadline for one of three flights (maybe confirmed long ago). */
  | {
      readonly kind: 'update';
      readonly flight: number;
      readonly deadlineMin: number;
      readonly observedAgoMin: number | null;
      readonly dt: number;
    }
  /** A random ticket presents (often too early or unknown to the access point). */
  | { readonly kind: 'present'; readonly pick: number; readonly dt: number }
  /** A called (or no-show) passenger presents. */
  | { readonly kind: 'respond'; readonly pick: number; readonly dt: number }
  | { readonly kind: 'advance'; readonly dt: number }
  /**
   * A staff action of the live product (S15) on a ticket: one whose state allows it when
   * `targeted` (and there is one), any ticket otherwise.
   */
  | {
      readonly kind: 'staff';
      readonly action: Action;
      readonly pick: number;
      readonly targeted: boolean;
      readonly dt: number;
    };

// Weighted so that queues grow, deadlines become tight and called passengers respond: otherwise
// priority commitments, the cap and the overtake guard would almost never be exercised.
const opArb: fc.Arbitrary<Op> = fc.oneof(
  {
    weight: 5,
    arbitrary: fc.record({
      kind: fc.constant('issue' as const),
      deadlineMin: fc.option(fc.integer({ min: 0, max: 30 }), { nil: null, freq: 8 }),
      dt: fc.integer({ min: 0, max: 30_000 }),
      partySize: fc.oneof(
        { weight: 4, arbitrary: fc.constant(1) },
        { weight: 1, arbitrary: fc.integer({ min: 2, max: 5 }) },
      ),
      transfer: fc.boolean(),
    }),
  },
  {
    weight: 3,
    arbitrary: fc.record({
      kind: fc.constant('call' as const),
      dt: fc.integer({ min: 0, max: MIN }),
    }),
  },
  {
    weight: 1,
    arbitrary: fc.record({
      kind: fc.constant('present' as const),
      pick: fc.nat(),
      dt: fc.integer({ min: 0, max: MIN }),
    }),
  },
  {
    weight: 2,
    arbitrary: fc.record({
      kind: fc.constant('respond' as const),
      pick: fc.nat(),
      dt: fc.integer({ min: 0, max: 4 * MIN }),
    }),
  },
  {
    weight: 1,
    arbitrary: fc.record({
      kind: fc.constant('advance' as const),
      dt: fc.integer({ min: 0, max: 6 * MIN }),
    }),
  },
  {
    weight: 2,
    arbitrary: fc.record({
      kind: fc.constant('staff' as const),
      action: fc.constantFrom(...ACTIONS),
      pick: fc.nat(),
      targeted: fc.boolean(),
      dt: fc.integer({ min: 0, max: MIN }),
    }),
  },
  {
    weight: 1,
    arbitrary: fc.record({
      kind: fc.constant('update' as const),
      flight: fc.integer({ min: 0, max: 2 }),
      deadlineMin: fc.integer({ min: 0, max: 30 }),
      observedAgoMin: fc.option(fc.integer({ min: 0, max: 20 }), { nil: null }),
      dt: fc.integer({ min: 0, max: MIN }),
    }),
  },
);

// size 'max': fast-check's default size would keep the sequences to a handful of operations.
const opsArb = fc.array(opArb, { maxLength: 80, size: 'max' });

interface Trace {
  readonly events: QueueEvent[];
  readonly snapshots: string[];
  readonly stats: QueueStats;
  /** Staff actions that changed a ticket, by action. */
  readonly done: Readonly<Record<Action, number>>;
}

/** Runs `ops` and checks the invariants after every operation. */
function run(policy: Policy, ops: readonly Op[]): Trace {
  const events: QueueEvent[] = [];
  const q = new CheckpointQueue(policy, CLASSIFICATION, { listener: (e) => events.push(e) });
  const ids: string[] = [];
  const snapshots: string[] = [];
  const classHistory = new Map<string, RiskClass[]>();
  const windowSize = policy.queue.kind === 'virtual' ? policy.queue.prepareWindowSize : 0;
  const backOnReactivation =
    policy.queue.kind === 'virtual' && policy.queue.reactivationPosition === 'BACK';
  const fastTrack = policy.selection.kind === 'constrained-edf' && policy.selection.fastTrack;
  /** Independent model of the prepare window: ids in call order, and which are fast-tracked. */
  const modelWindow: string[] = [];
  const modelFast = new Set<string>();
  // Independent model of overtakes, rebuilt from the events: when a ticket is committed, every
  // ticket still waiting with a lower FIFO key is overtaken once.
  const queuedKeys = new Map<string, number>();
  const overtaken = new Map<string, number>();
  /** One flag per person committed: whether by priority. */
  const personFlags: boolean[] = [];
  const done = Object.fromEntries(ACTIONS.map((a) => [a, 0])) as Record<Action, number>;
  let seen = 0;
  let now = 0;
  for (const op of ops) {
    now += op.dt;
    const before = q.prepareWindow().map((t) => t.id);
    let calledId: string | null = null;
    switch (op.kind) {
      case 'issue': {
        const id = `t${ids.length}`;
        ids.push(id);
        const deadline: KnownDeadline =
          op.deadlineMin === null
            ? { atMs: null, source: 'NONE' }
            : { atMs: now + op.deadlineMin * MIN, source: 'FEED' };
        // Departure 20 minutes after boarding closes; presented now.
        const departure = deadline.atMs === null ? null : deadline.atMs + 20 * MIN;
        q.issue(
          {
            id,
            segment: op.transfer ? 'TRANSFER' : 'DEPARTING',
            deadline,
            walkEstimateMs: 0,
            partySize: op.partySize,
            scheduledDepartureMs: departure,
            flightId: `F${ids.length % 3}`,
          },
          now,
          EST,
        );
        break;
      }
      case 'update':
        q.updateFlight(
          `F${op.flight}`,
          {
            deadline: {
              atMs: now + op.deadlineMin * MIN,
              source: 'FEED',
              ...(op.observedAgoMin === null
                ? {}
                : { observedAtMs: now - op.observedAgoMin * MIN }),
            },
          },
          now,
          EST,
        );
        break;
      case 'call':
        calledId = q.callNext(now, EST)?.id ?? null;
        break;
      case 'present':
        if (ids.length > 0) {
          const outcome = q.present(ids[op.pick % ids.length]!, now, EST);
          expect(outcome).not.toBe('UNKNOWN_TICKET');
        }
        break;
      case 'respond': {
        q.advance(now);
        const called = ids.filter((id) =>
          ['CALLED', 'RECALLED', 'NO_SHOW'].includes(q.ticket(id)!.state),
        );
        if (called.length > 0) {
          const id = called[op.pick % called.length]!;
          const state = q.ticket(id)!.state;
          // advance(now) has applied every timeout due at `now`, so the outcome is determined.
          expect(q.present(id, now, EST)).toBe(state === 'NO_SHOW' ? 'REACTIVATED' : 'ADMITTED');
        }
        break;
      }
      case 'advance':
        q.advance(now);
        break;
      case 'staff': {
        // Timeouts due by now first, so that the ticket's state is the one the action meets.
        q.advance(now);
        const allowed = ids.filter((t) => TRANSITIONS[q.ticket(t)!.state][op.action] !== undefined);
        const pool = op.targeted && allowed.length > 0 ? allowed : ids;
        if (pool.length === 0) break;
        const id = pool[op.pick % pool.length]!;
        const state = q.ticket(id)!.state;
        const reported = events.length;
        const snapshot = JSON.stringify([ids.map((t) => q.ticket(t)), q.stats()]);
        const outcome = act(q, op.action, id, now, EST);
        const target = TRANSITIONS[state][op.action];
        if (target === undefined) {
          // Refused: nothing changed and nothing was reported.
          expect(outcome).toBe('NOT_ALLOWED');
          expect(events.length).toBe(reported);
          expect(JSON.stringify([ids.map((t) => q.ticket(t)), q.stats()])).toBe(snapshot);
        } else {
          expect(outcome).toBe('DONE');
          expect(statesAfter(target)).toContain(q.ticket(id)!.state);
          done[op.action]++;
        }
        break;
      }
    }
    const after = q.prepareWindow().map((t) => t.id);

    // Window: never above M; a committed ticket leaves only by being called or taken out by
    // staff (zero churn), and the remaining tickets keep their order. New tickets are appended at
    // the end, except fast-track priority commitments, which go ahead of every ticket that is not
    // fast-tracked.
    expect(after.length).toBeLessThanOrEqual(windowSize);
    const byStaff = (id: string) => ['REVIEW', 'CANCELLED'].includes(q.ticket(id)!.state);
    const remaining = (
      calledId !== null && before[0] === calledId ? before.slice(1) : before
    ).filter((id) => !byStaff(id));
    expect(after.filter((id) => remaining.includes(id))).toEqual(remaining);
    const fastInWindow = after.filter((id) => q.ticket(id)!.fastTracked);
    expect(after.slice(0, fastInWindow.length)).toEqual(fastInWindow);
    if (!fastTrack) expect(after.slice(0, remaining.length)).toEqual(remaining);

    for (; seen < events.length; seen++) {
      const e = events[seen]!;
      if (e.type === 'ISSUED' || e.type === 'REACTIVATED' || e.type === 'RELEASED') {
        // Back from a review, a ticket waits at its place again and keeps its overtakes.
        queuedKeys.set(e.ticketId, q.ticket(e.ticketId)!.fifoKey);
        if (e.type === 'ISSUED' || (e.type === 'REACTIVATED' && backOnReactivation)) {
          overtaken.set(e.ticketId, 0);
        }
      } else if (e.type === 'REVIEW' || e.type === 'CANCELLED') {
        // Out of the order of calls: nobody can overtake it there.
        queuedKeys.delete(e.ticketId);
        const at = modelWindow.indexOf(e.ticketId);
        if (at >= 0) modelWindow.splice(at, 1);
        modelFast.delete(e.ticketId);
      } else if (e.type === 'COMMITTED') {
        const key = queuedKeys.get(e.ticketId)!;
        const size = q.ticket(e.ticketId)!.partySize;
        queuedKeys.delete(e.ticketId);
        // The event names the tickets it passes and the people on them.
        const passed = [...queuedKeys].filter(([, k]) => k < key).map(([id]) => id);
        expect(e.passedTickets).toBe(passed.length);
        expect(e.passedPeople).toBe(passed.reduce((sum, id) => sum + q.ticket(id)!.partySize, 0));
        expect(e.fastTrack).toBe(fastTrack && e.priority);
        if (e.assessment !== null) expect(e.assessment.ticketId).toBe(e.ticketId);
        for (const [id, k] of queuedKeys) {
          if (k < key) overtaken.set(id, (overtaken.get(id) ?? 0) + size);
        }
        for (let p = 0; p < size; p++) personFlags.push(e.priority);
        if (windowSize > 0) {
          if (fastTrack && e.priority) {
            // A fast-track commitment passes every window ticket that is not fast-tracked.
            const at = modelWindow.filter((id) => modelFast.has(id)).length;
            for (const id of modelWindow.slice(at)) {
              overtaken.set(id, (overtaken.get(id) ?? 0) + size);
            }
            modelWindow.splice(at, 0, e.ticketId);
            modelFast.add(e.ticketId);
          } else {
            modelWindow.push(e.ticketId);
          }
        }
      } else if (e.type === 'CALLED' && windowSize > 0) {
        expect(modelWindow[0]).toBe(e.ticketId);
        modelWindow.shift();
        modelFast.delete(e.ticketId);
      }
    }

    // Every ticket is in exactly one state, and the counters agree with the states and the model.
    const counts = new Map<TicketState, number>();
    for (const id of ids) {
      const t = q.ticket(id)!;
      counts.set(t.state, (counts.get(t.state) ?? 0) + 1);
      expect(t.overtakenCount).toBe(overtaken.get(id) ?? 0);
    }
    expect(counts.get('QUEUED') ?? 0).toBe(q.waitingCount);
    expect(counts.get('PREPARE') ?? 0).toBe(q.windowCount);
    expect((counts.get('CALLED') ?? 0) + (counts.get('RECALLED') ?? 0)).toBe(q.outstandingCount);
    expect(counts.get('NO_SHOW') ?? 0).toBe(q.noShowCount);
    expect(counts.get('ADMITTED') ?? 0).toBe(q.stats().admissions);
    snapshots.push(JSON.stringify([ids.map((id) => q.ticket(id)), q.stats()]));

    // Independent record of each ticket's classes, observed after every operation (an operation
    // assesses a waiting ticket at most once).
    for (const id of ids) {
      const riskClass = q.ticket(id)!.riskClass;
      if (riskClass === null) continue;
      const history = classHistory.get(id) ?? [];
      if (history[history.length - 1] !== riskClass) history.push(riskClass);
      classHistory.set(id, history);
    }
  }

  // Events are reported in chronological order.
  for (let i = 1; i < events.length; i++) {
    expect(events[i]!.atMs).toBeGreaterThanOrEqual(events[i - 1]!.atMs);
  }

  // Class changes and reversals of direction agree with the observed classes, counted once.
  let changes = 0;
  let reversals = 0;
  for (const id of ids) {
    const rank = (classHistory.get(id) ?? []).map((c) => RISK_CLASSES.indexOf(c));
    let expectedReversals = 0;
    for (let i = 2; i < rank.length; i++) {
      if (Math.sign(rank[i]! - rank[i - 1]!) !== Math.sign(rank[i - 1]! - rank[i - 2]!)) {
        expectedReversals++;
      }
    }
    const t = q.ticket(id)!;
    expect(t.classChanges).toBe(Math.max(0, rank.length - 1));
    expect(t.classReversals).toBe(expectedReversals);
    changes += t.classChanges;
    reversals += t.classReversals;
  }
  expect([q.stats().classChanges, q.stats().classReversals]).toEqual([changes, reversals]);

  // Single admission per ticket.
  const admissions = new Map<string, number>();
  for (const e of events) {
    if (e.type === 'ADMITTED') admissions.set(e.ticketId, (admissions.get(e.ticketId) ?? 0) + 1);
  }
  for (const count of admissions.values()) expect(count).toBe(1);

  // Fairness bounds over the sequence of commitments (constrained EDF only).
  if (policy.selection.kind === 'constrained-edf') {
    const selection: ConstrainedEdfSelection = policy.selection;
    for (const count of overtaken.values()) {
      expect(count).toBeLessThanOrEqual(selection.maxOvertakes);
    }
    // The cap counts people: every window of N people committed holds at most k by priority.
    for (let start = 0; start + selection.capWindowCalls <= personFlags.length; start++) {
      const window = personFlags.slice(start, start + selection.capWindowCalls);
      expect(window.filter(Boolean).length).toBeLessThanOrEqual(selection.capMaxPriorityCalls);
    }
  }
  return { events, snapshots, stats: q.stats(), done };
}

describe('queue state machine properties', () => {
  it('keeps the prepare window churn-free, states consistent, admissions unique and fairness bounds', () => {
    fc.assert(
      fc.property(policyArb, opsArb, (policy, ops) => {
        run(policy, ops);
      }),
      RUNS,
    );
  });

  it('is deterministic: the same operations give the same events and states', () => {
    fc.assert(
      fc.property(policyArb, opsArb, (policy, ops) => {
        expect(run(policy, ops)).toEqual(run(policy, ops));
      }),
      { numRuns: 300 },
    );
  });

  it('never admits a ticket that was not called, and only terminal states are final', () => {
    fc.assert(
      fc.property(policyArb, opsArb, (policy, ops) => {
        const { events } = run(policy, ops);
        const lastState = new Map<string, QueueEvent['type']>();
        for (const e of events) {
          const previous = lastState.get(e.ticketId);
          if (e.type === 'ADMITTED') expect(['CALLED', 'RECALLED']).toContain(previous);
          if (previous === 'ADMITTED' || previous === 'EXPIRED' || previous === 'CANCELLED') {
            throw new Error(`event ${e.type} after terminal ${previous} for ${e.ticketId}`);
          }
          if (e.type !== 'COMMITTED') lastState.set(e.ticketId, e.type);
        }
      }),
      RUNS,
    );
  });

  it('exercises priority commitments, the cap, the overtake guard, reactivations and staff', () => {
    // Guards against vacuous properties: the generated scenarios must reach the limits above.
    const samples = fc.sample(fc.tuple(policyArb, opsArb), { numRuns: 500, seed: 20261121 });
    const hits = {
      priority: 0,
      cap: 0,
      guard: 0,
      reactivations: 0,
      expirations: 0,
      admissions: 0,
      fastTrackPasses: 0,
      classChanges: 0,
      classReversals: 0,
    };
    /** Runs in which each staff action changed a ticket at least once (S15). */
    const staffHits = Object.fromEntries(ACTIONS.map((a) => [a, 0])) as Record<Action, number>;
    for (const [policy, ops] of samples) {
      const { stats, events, done } = run(policy, ops);
      for (const action of ACTIONS) if (done[action] > 0) staffHits[action]++;
      const windowSize = policy.queue.kind === 'virtual' ? policy.queue.prepareWindowSize : 0;
      const fastTrack = policy.selection.kind === 'constrained-edf' && policy.selection.fastTrack;
      // A fast-track commitment while the window was not empty passed somebody.
      let inWindow = 0;
      let passed = false;
      for (const e of events) {
        if (e.type === 'COMMITTED' && windowSize > 0) {
          if (fastTrack && e.priority && inWindow > 0) passed = true;
          inWindow++;
        } else if (e.type === 'CALLED' && windowSize > 0) inWindow--;
      }
      if (passed) hits.fastTrackPasses++;
      const guardIsTrivial =
        policy.selection.kind === 'constrained-edf' && policy.selection.maxOvertakes === 0;
      if (stats.priorityCommitments > 0) hits.priority++;
      if (stats.capReached > 0) hits.cap++;
      if (stats.overtakeGuard > 0 && !guardIsTrivial) hits.guard++;
      if (stats.reactivations > 0) hits.reactivations++;
      if (stats.expirations > 0) hits.expirations++;
      if (stats.admissions > 0) hits.admissions++;
      if (stats.classChanges > 0) hits.classChanges++;
      if (stats.classReversals > 0) hits.classReversals++;
    }

    // Thresholds at about half of the counts observed with this seed.
    expect(hits.priority).toBeGreaterThanOrEqual(60);
    expect(hits.cap).toBeGreaterThanOrEqual(30);
    expect(hits.guard).toBeGreaterThanOrEqual(10);
    expect(hits.reactivations).toBeGreaterThanOrEqual(80);
    expect(hits.expirations).toBeGreaterThanOrEqual(150);
    expect(hits.admissions).toBeGreaterThanOrEqual(150);
    expect(hits.fastTrackPasses).toBeGreaterThanOrEqual(15);
    expect(hits.classChanges).toBeGreaterThanOrEqual(50);
    expect(hits.classReversals).toBeGreaterThanOrEqual(10);
    // Each staff action changes tickets in many runs (observed: recall 57, no-show 73,
    // reactivate 20, hold 158, release 31, reject 25, cancel 177, a party growing 165).
    const thresholds: Record<Action, number> = {
      recall: 35,
      noShow: 35,
      reactivate: 12,
      hold: 85,
      release: 14,
      reject: 15,
      cancel: 100,
      grow: 80,
    };
    for (const action of ACTIONS) {
      expect(staffHits[action], action).toBeGreaterThanOrEqual(thresholds[action]);
    }
  });
});
