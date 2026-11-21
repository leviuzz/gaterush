import fc from 'fast-check';
import { MS_PER_MINUTE } from '@gateflow/domain';
import type { KnownDeadline } from '@gateflow/domain';
import type {
  CheckpointEstimates,
  ConstrainedEdfSelection,
  SelectionParams,
} from '@gateflow/priority-engine';
import { describe, expect, it } from 'vitest';
import { CheckpointQueue, PRIORITY_V0_POLICY, classificationOf } from '../src';
import type { Policy, QueueEvent, QueueStats, TicketState, VirtualQueue } from '../src';

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
  /** A random ticket presents (often too early or unknown to the access point). */
  | { readonly kind: 'present'; readonly pick: number; readonly dt: number }
  /** A called (or no-show) passenger presents. */
  | { readonly kind: 'respond'; readonly pick: number; readonly dt: number }
  | { readonly kind: 'advance'; readonly dt: number };

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
);

// size 'max': fast-check's default size would keep the sequences to a handful of operations.
const opsArb = fc.array(opArb, { maxLength: 80, size: 'max' });

interface Trace {
  readonly events: QueueEvent[];
  readonly snapshots: string[];
  readonly stats: QueueStats;
}

/** Runs `ops` and checks the invariants after every operation. */
function run(policy: Policy, ops: readonly Op[]): Trace {
  const events: QueueEvent[] = [];
  const q = new CheckpointQueue(policy, CLASSIFICATION, { listener: (e) => events.push(e) });
  const ids: string[] = [];
  const snapshots: string[] = [];
  const windowSize = policy.queue.kind === 'virtual' ? policy.queue.prepareWindowSize : 0;
  const backOnReactivation =
    policy.queue.kind === 'virtual' && policy.queue.reactivationPosition === 'BACK';
  // Independent model of overtakes, rebuilt from the events: when a ticket is committed, every
  // ticket still waiting with a lower FIFO key is overtaken once.
  const queuedKeys = new Map<string, number>();
  const overtaken = new Map<string, number>();
  /** One flag per person committed: whether by priority. */
  const personFlags: boolean[] = [];
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
          },
          now,
          EST,
        );
        break;
      }
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
    }
    const after = q.prepareWindow().map((t) => t.id);

    // Window: never above M; a committed ticket leaves only by being called (zero churn), and the
    // remaining tickets keep their order, with new ones appended at the end.
    expect(after.length).toBeLessThanOrEqual(windowSize);
    const expectedPrefix = calledId !== null && before[0] === calledId ? before.slice(1) : before;
    expect(after.slice(0, expectedPrefix.length)).toEqual(expectedPrefix);

    for (; seen < events.length; seen++) {
      const e = events[seen]!;
      if (e.type === 'ISSUED' || e.type === 'REACTIVATED') {
        queuedKeys.set(e.ticketId, q.ticket(e.ticketId)!.fifoKey);
        if (e.type === 'ISSUED' || backOnReactivation) overtaken.set(e.ticketId, 0);
      } else if (e.type === 'COMMITTED') {
        const key = queuedKeys.get(e.ticketId)!;
        const size = q.ticket(e.ticketId)!.partySize;
        queuedKeys.delete(e.ticketId);
        for (const [id, k] of queuedKeys) {
          if (k < key) overtaken.set(id, (overtaken.get(id) ?? 0) + size);
        }
        for (let p = 0; p < size; p++) personFlags.push(e.priority);
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
  }

  // Events are reported in chronological order.
  for (let i = 1; i < events.length; i++) {
    expect(events[i]!.atMs).toBeGreaterThanOrEqual(events[i - 1]!.atMs);
  }

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
  return { events, snapshots, stats: q.stats() };
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
          if (previous === 'ADMITTED' || previous === 'EXPIRED') {
            throw new Error(`event ${e.type} after terminal ${previous} for ${e.ticketId}`);
          }
          if (e.type !== 'COMMITTED') lastState.set(e.ticketId, e.type);
        }
      }),
      RUNS,
    );
  });

  it('exercises priority commitments, the cap, the overtake guard and reactivations', () => {
    // Guards against vacuous properties: the generated scenarios must reach the limits above.
    const samples = fc.sample(fc.tuple(policyArb, opsArb), { numRuns: 500, seed: 20261121 });
    const hits = { priority: 0, cap: 0, guard: 0, reactivations: 0, expirations: 0, admissions: 0 };
    for (const [policy, ops] of samples) {
      const { stats } = run(policy, ops);
      const guardIsTrivial =
        policy.selection.kind === 'constrained-edf' && policy.selection.maxOvertakes === 0;
      if (stats.priorityCommitments > 0) hits.priority++;
      if (stats.capReached > 0) hits.cap++;
      if (stats.overtakeGuard > 0 && !guardIsTrivial) hits.guard++;
      if (stats.reactivations > 0) hits.reactivations++;
      if (stats.expirations > 0) hits.expirations++;
      if (stats.admissions > 0) hits.admissions++;
    }
    for (const count of Object.values(hits)) expect(count).toBeGreaterThanOrEqual(25);
  });
});
