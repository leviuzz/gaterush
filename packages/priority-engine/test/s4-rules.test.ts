import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { EngineInputError, assessTicket, journeyEstimates, selectNext } from '../src';
import type { CheckpointEstimates, ConstrainedEdfSelection } from '../src';
import { EDF, MIN, input, ticket } from './fixtures';

/** 180 people per hour (one every 20 s); R = 3 min through the queue, 90 s through the fast track. */
const CP: CheckpointEstimates = {
  throughputPerHour: 180,
  processMs: 0,
  responseMs: 3 * MIN,
  fastTrackResponseMs: 90_000,
};

const FAST: ConstrainedEdfSelection = { ...EDF, feasibilityMarginMs: 0, fastTrack: true };
const SLOW: ConstrainedEdfSelection = { ...FAST, fastTrack: false };

describe('fast-track journey estimates (ADR-027)', () => {
  it('uses the fast-track response time and no window drain for a boosted call', () => {
    const t = ticket(0, { walkEstimateMs: 5 * MIN });
    // Ten people committed ahead: 200 s to call them.
    expect(journeyEstimates(t, 0, CP, SLOW, 10)).toEqual({
      queueJourneyMs: 8 * MIN,
      boostJourneyMs: 8 * MIN,
      boostDrainMs: 200_000,
    });
    expect(journeyEstimates(t, 0, CP, FAST, 10)).toEqual({
      queueJourneyMs: 8 * MIN,
      boostJourneyMs: 90_000 + 5 * MIN,
      boostDrainMs: 0,
    });
  });

  it('shortens the response of a passenger who has just been at the access point', () => {
    const fresh = ticket(0, { lastSeenAtMs: -30_000 });
    expect(journeyEstimates(fresh, 0, CP, FAST, 0).boostJourneyMs).toBe(30_000);
    // Long gone: the full fast-track estimate.
    const old = ticket(0, { lastSeenAtMs: -10 * MIN });
    expect(journeyEstimates(old, 0, CP, FAST, 0).boostJourneyMs).toBe(90_000);
    // A clock skew never yields a negative response.
    const future = ticket(0, { lastSeenAtMs: 60_000 });
    expect(journeyEstimates(future, 0, CP, FAST, 0).boostJourneyMs).toBe(0);
    // Without the fast track the age is ignored.
    expect(journeyEstimates(fresh, 0, CP, SLOW, 0).boostJourneyMs).toBe(3 * MIN);
  });

  it('falls back to R when no fast-track estimate is given', () => {
    const withoutFast: CheckpointEstimates = {
      throughputPerHour: CP.throughputPerHour,
      processMs: CP.processMs,
      responseMs: CP.responseMs,
    };
    expect(journeyEstimates(ticket(0), 0, withoutFast, FAST, 0).boostJourneyMs).toBe(3 * MIN);
  });
});

describe('classification and selection under the fast track', () => {
  // Deadline 7 minutes away, walk 2 minutes, 10 people committed ahead (200 s to call them).
  const tight = ticket(5, { deadline: { atMs: 7 * MIN, source: 'RULE' }, walkEstimateMs: 2 * MIN });

  it('turns a ticket that the window makes hopeless into an URGENT one', () => {
    // Through the queue: 7 min - (3 + 2) min - 200 s < 0, so CRITICAL.
    expect(assessTicket(tight, 30, 0, CP, SLOW, 10).riskClass).toBe('CRITICAL');
    // Fast track: 7 min - (1.5 + 2) min - 0 > 0, and the FIFO margin is negative: URGENT.
    const fast = assessTicket(tight, 30, 0, CP, FAST, 10);
    expect(fast.riskClass).toBe('URGENT');
    expect(fast.feasibilitySlackMs).toBe(7 * MIN - 90_000 - 2 * MIN);
    expect(fast.slackFifoMs).toBe(7 * MIN - 5 * MIN - EDF.safetyBufferMs - 600_000);
  });

  it('boosts it, and refuses when a committed person has no room left under K', () => {
    const waiting = [
      ticket(0),
      ticket(1),
      ticket(2),
      { ...tight, fifoKey: 3, id: 'tight', partySize: 2 },
    ];
    const base = { checkpoint: CP, aheadOfWaiting: 10, selection: FAST };
    expect(selectNext(input(waiting, base))).toMatchObject({
      ticketId: 'tight',
      priorityCall: true,
      reasons: ['URGENT_FEASIBLE'],
    });
    // A committed person at K - 1: a party of two would push them past K.
    const full = { ...base, aheadMaxOvertakenCount: EDF.maxOvertakes - 1 };
    expect(selectNext(input(waiting, full))).toMatchObject({
      ticketId: 't0',
      priorityCall: false,
      reasons: ['OVERTAKE_ROOM_EXHAUSTED'],
    });
    // A single passenger still fits.
    const single = waiting.map((t) => (t.id === 'tight' ? { ...t, partySize: 1 } : t));
    expect(selectNext(input(single, full))?.ticketId).toBe('tight');
    // Without the fast track the committed people are not passed, so their counts do not matter:
    // a ticket that is URGENT and feasible through the queue is still boosted.
    const looser = waiting.map((t) =>
      t.id === 'tight' ? { ...t, deadline: { atMs: 12 * MIN, source: 'RULE' as const } } : t,
    );
    expect(selectNext(input(looser, { ...full, selection: SLOW }))).toMatchObject({
      ticketId: 'tight',
      priorityCall: true,
    });
  });

  it('boosts an URGENT head of the waiting list only under the fast track', () => {
    // Alone in the waiting list, 2 minutes from its deadline: through the queue (R = 3 min) it is
    // late even when called next, through the fast track (1.5 min) it makes it.
    const head = ticket(0, { id: 'head', deadline: { atMs: 2 * MIN, source: 'RULE' } });
    for (const aheadOfWaiting of [0, 3]) {
      expect(
        selectNext(input([head], { checkpoint: CP, aheadOfWaiting, selection: FAST })),
      ).toMatchObject({ ticketId: 'head', priorityCall: true, reasons: ['URGENT_FEASIBLE'] });
      expect(
        selectNext(input([head], { checkpoint: CP, aheadOfWaiting, selection: SLOW }))
          ?.priorityCall,
      ).toBe(false);
    }
  });

  it('rejects invalid fast-track inputs', () => {
    expect(() => selectNext(input([ticket(0)], { aheadMaxOvertakenCount: -1 }))).toThrow(
      EngineInputError,
    );
    expect(() =>
      selectNext(input([ticket(0)], { checkpoint: { ...CP, fastTrackResponseMs: 4 * MIN } })),
    ).toThrow(/must not exceed responseMs/);
    expect(() =>
      selectNext(
        input([ticket(0)], {
          selection: { ...FAST, fastTrack: 'yes' as unknown as boolean },
        }),
      ),
    ).toThrow(/fastTrack must be a boolean/);
    expect(() => selectNext(input([ticket(0, { lastSeenAtMs: 0.5 })]))).toThrow(EngineInputError);
  });
});

describe('coverage of the fast-track properties', () => {
  it('random cases reach fast-track boosts and room refusals', () => {
    let boosts = 0;
    let refusals = 0;
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 20 }),
        fc.integer({ min: 0, max: 20 }),
        fc.integer({ min: 1, max: 3 }),
        (position, committedMax, size) => {
          const waiting = Array.from({ length: position + 2 }, (_, i) =>
            ticket(i, {
              id: `t${i}`,
              ...(i === position + 1
                ? { deadline: { atMs: 7 * MIN, source: 'RULE' as const }, partySize: size }
                : {}),
            }),
          );
          const selection = selectNext(
            input(waiting, {
              checkpoint: CP,
              aheadOfWaiting: 3,
              aheadMaxOvertakenCount: committedMax,
              selection: FAST,
            }),
          );
          if (selection?.priorityCall === true) boosts++;
          if (selection?.reasons.includes('OVERTAKE_ROOM_EXHAUSTED') === true) refusals++;
        },
      ),
      { numRuns: 300, seed: 7 },
    );
    expect(boosts).toBeGreaterThan(30);
    expect(refusals).toBeGreaterThan(30);
  });
});
