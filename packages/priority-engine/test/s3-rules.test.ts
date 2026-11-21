import { describe, expect, it } from 'vitest';
import { EngineInputError, assessQueue, assessTicket, capAllows, selectNext } from '../src';
import type { FlightCallSelection, WaitingTicket } from '../src';
import { CHECKPOINT, EDF, MIN, input, ticket } from './fixtures';

/** 30 relaxed tickets ahead of `t` (10 minutes of FIFO wait at 180 people per hour). */
function behind30(t: WaitingTicket): WaitingTicket[] {
  return [...Array.from({ length: 30 }, (_, i) => ticket(i)), { ...t, fifoKey: 30, id: 't30' }];
}

describe('feasibility margin (CRITICAL without the safety margin)', () => {
  // D = 3 min, B = 5 min: L = -2 min, so slackNow = -2 min (inside the safety margin), FIFO wait
  // 10 min. With F = 0 the ticket can still make it if selected now (3 min to spare).
  const tight = behind30(ticket(30, { deadline: { atMs: 3 * MIN, source: 'FEED' } }));

  it('boosts a ticket that can make it only by using part of the margin when F < B', () => {
    const selection = selectNext(input(tight, { selection: { ...EDF, feasibilityMarginMs: 0 } }));
    expect(selection).toMatchObject({ ticketId: 't30', priorityCall: true });
    expect(selection?.assessment).toMatchObject({
      riskClass: 'URGENT',
      slackNowMs: -2 * MIN,
      feasibilitySlackMs: 3 * MIN,
    });
    expect(selection?.assessment?.reasons).toContain('INSIDE_SAFETY_MARGIN');
  });

  it('escalates the same ticket as CRITICAL when F = B (engines 0.1-0.2)', () => {
    const selection = selectNext(input(tight));
    expect(selection?.ticketId).toBe('t0');
    const assessed = assessQueue({ nowMs: 0, checkpoint: CHECKPOINT, waiting: tight }, EDF)[30];
    expect(assessed).toMatchObject({ riskClass: 'CRITICAL', feasibilitySlackMs: -2 * MIN });
  });
});

describe('presentation rule for departing passengers', () => {
  // Urgent at position 30: D = 12 min, L = 7 min, FIFO wait 10 min. STD = 32 min; with a cutoff of
  // 45 min the passenger must have presented by -13 min.
  const policy = { ...EDF, latePresentationCutoffMs: 45 * MIN };
  const urgent = (overrides: Partial<WaitingTicket>) =>
    behind30({
      ...ticket(30, { deadline: { atMs: 12 * MIN, source: 'FEED' } }),
      scheduledDepartureMs: 32 * MIN,
      ...overrides,
    });

  it('boosts a passenger who presented exactly at the cutoff', () => {
    const selection = selectNext(
      input(urgent({ presentedAtMs: -13 * MIN }), { selection: policy }),
    );
    expect(selection).toMatchObject({ ticketId: 't30', priorityCall: true });
  });

  it('does not boost a passenger who presented one minute later, nor one with unknown times', () => {
    for (const [overrides, reason] of [
      [{ presentedAtMs: -12 * MIN }, 'LATE_PRESENTATION'],
      [{}, 'PRESENTATION_UNVERIFIED'],
      [{ presentedAtMs: -60 * MIN, scheduledDepartureMs: null }, 'PRESENTATION_UNVERIFIED'],
    ] as const) {
      const waiting = urgent(overrides);
      const selection = selectNext(input(waiting, { selection: policy }));
      expect(selection?.ticketId).toBe('t0');
      expect(selection?.urgentCandidates).toBe(0);
      const assessed = assessQueue({ nowMs: 0, checkpoint: CHECKPOINT, waiting }, policy)[30];
      expect(assessed).toMatchObject({ riskClass: 'URGENT', boostEligible: false });
      expect(assessed?.reasons).toContain(reason);
    }
  });

  it('exempts transfers and applies no rule without a cutoff', () => {
    const late = { presentedAtMs: -5 * MIN };
    expect(
      selectNext(input(urgent({ ...late, segment: 'TRANSFER' }), { selection: policy }))?.ticketId,
    ).toBe('t30');
    expect(selectNext(input(urgent(late)))?.ticketId).toBe('t30');
  });
});

describe('groups are counted per person', () => {
  it('counts the people of a group in the FIFO wait of the tickets behind it', () => {
    const waiting = [
      ticket(0, { partySize: 4 }),
      ticket(1),
      ticket(2, { partySize: 2 }),
      ticket(3),
    ];
    const assessed = assessQueue({ nowMs: 0, checkpoint: CHECKPOINT, waiting }, EDF);
    expect(assessed.map((a) => a.aheadInFifo)).toEqual([0, 4, 5, 7]);
    expect(assessed[3]?.fifoWaitEstimateMs).toBe(7 * 20_000);
  });

  // An urgent group of three behind 10 relaxed people: FIFO wait 200 s, D = 7 min, L = 2 min.
  const withGroup = (size: number, overtaken = 0) => [
    ticket(0, { overtakenCount: overtaken }),
    ...Array.from({ length: 9 }, (_, i) => ticket(i + 1)),
    ticket(10, { deadline: { atMs: 7 * MIN, source: 'FEED' }, partySize: size }),
  ];

  it('lets a group jump only when the cap has room for all of its people', () => {
    expect(selectNext(input(withGroup(3)))).toMatchObject({ ticketId: 't10', priorityCall: true });
    // One person called by priority among the last N - 3 = 7: 1 + 3 > k = 3.
    expect(selectNext(input(withGroup(3), { recentPriorityCalls: [true] }))).toMatchObject({
      ticketId: 't0',
      reasons: ['CAP_REACHED'],
    });
    // The same person called eight people ago is outside the last 7: room for three.
    const old = [true, ...Array<boolean>(7).fill(false)];
    expect(selectNext(input(withGroup(3), { recentPriorityCalls: old }))?.ticketId).toBe('t10');
    expect(capAllows(old, EDF, 3)).toBe(true);
    expect(capAllows([true], EDF, 3)).toBe(false);
  });

  it('never boosts a group larger than the cap, and boosts the next urgent ticket instead', () => {
    const group = withGroup(4);
    const alone = selectNext(input(group));
    expect(alone).toMatchObject({ ticketId: 't0', priorityCall: false, urgentCandidates: 1 });
    const withSingle = [
      ...group,
      ...Array.from({ length: 4 }, (_, i) => ticket(11 + i)),
      ticket(15, { deadline: { atMs: 9 * MIN, source: 'FEED' } }),
    ];
    expect(selectNext(input(withSingle))).toMatchObject({ ticketId: 't15', priorityCall: true });
  });

  it('flags an urgent group larger than the cap for staff when it is called in FIFO order', () => {
    // 10 committed people ahead: the group at the head is URGENT (feasible with F = 0).
    const selection = selectNext(
      input([ticket(0, { deadline: { atMs: 7 * MIN, source: 'FEED' }, partySize: 4 })], {
        aheadOfWaiting: 10,
        selection: { ...EDF, feasibilityMarginMs: 0 },
      }),
    );
    expect(selection?.assessment?.riskClass).toBe('URGENT');
    expect(selection?.assessment?.reasons).toContain('GROUP_EXCEEDS_CAP');
  });

  it('keeps every older ticket within K overtakes, counting the people who jump', () => {
    // t0 has been overtaken by 13 people (K = 15): a group of 3 would bring it to 16.
    expect(selectNext(input(withGroup(3, 13)))).toMatchObject({
      ticketId: 't0',
      reasons: ['OVERTAKE_ROOM_EXHAUSTED'],
    });
    expect(selectNext(input(withGroup(2, 13)))?.ticketId).toBe('t10');
  });
});

describe('overtake guard with tickets put back at their original place', () => {
  it('calls the oldest ticket when calling the one at the limit would push it beyond K', () => {
    // t0 was put back ahead (reactivated no-show, overtaken by nobody); t1, a group of two, has
    // reached K = 1. Calling t1 would overtake t0 by two people.
    const policy = { ...EDF, maxOvertakes: 1 };
    const waiting = [ticket(0), ticket(1, { partySize: 2, overtakenCount: 1 })];
    expect(selectNext(input(waiting, { selection: policy }))).toMatchObject({
      ticketId: 't0',
      reasons: ['OVERTAKE_LIMIT_GUARD'],
    });
    // A single passenger at the limit can still be called: t0 would reach exactly K.
    const single = [ticket(0), ticket(1, { overtakenCount: 1 })];
    expect(selectNext(input(single, { selection: policy }))?.ticketId).toBe('t1');
  });
});

describe('flight calls (baseline A)', () => {
  const call: FlightCallSelection = {
    kind: 'flight-call',
    callWindowMs: 20 * MIN,
    announcementIntervalMs: 5 * MIN,
  };
  const waiting = [
    ticket(0, { deadline: { atMs: 600 * MIN, source: 'RULE' } }),
    ticket(1, { deadline: { atMs: 30 * MIN, source: 'RULE' } }),
    ticket(2, { deadline: { atMs: 25 * MIN, source: 'FEED' } }),
    ticket(3, { deadline: { atMs: null, source: 'NONE' } }),
  ];
  const at = (nowMin: number, list = waiting) =>
    selectNext(input(list, { nowMs: nowMin * MIN, selection: call }));

  it('calls the flights closing within the window of the latest announcement, earliest first', () => {
    // At 4 min the latest announcement was at 0: nothing closes by 20 min.
    expect(at(4)).toMatchObject({ ticketId: 't0', reasons: ['FIFO'], priorityCall: false });
    // At 7 min (announcement at 5) the flight closing at 25 min is called.
    expect(at(7)).toMatchObject({
      ticketId: 't2',
      reasons: ['FLIGHT_CALL'],
      priorityCall: true,
      positionInFifo: 2,
      urgentCandidates: 1,
    });
    // At 10 min both flights are called; the one closing first goes first.
    expect(at(10)).toMatchObject({ ticketId: 't2', urgentCandidates: 2 });
  });

  it('breaks ties by FIFO order and does not count a call of the head as a jump', () => {
    // An older ticket (lower FIFO key) of a flight closing at the same time as t2.
    const tie = [
      ...waiting,
      ticket(-1, { id: 'older', deadline: { atMs: 25 * MIN, source: 'RULE' } }),
    ];
    expect(at(7, tie)).toMatchObject({ ticketId: 'older', priorityCall: false, positionInFifo: 0 });
  });

  it('rejects invalid parameters', () => {
    expect(() =>
      selectNext(input(waiting, { selection: { ...call, announcementIntervalMs: 0 } })),
    ).toThrow(EngineInputError);
    expect(() => selectNext(input(waiting, { selection: { ...call, callWindowMs: -1 } }))).toThrow(
      EngineInputError,
    );
  });
});

describe('validation of the new fields', () => {
  it('rejects invalid party sizes, times and parameters', () => {
    expect(() => selectNext(input([ticket(0, { partySize: 0 })]))).toThrow(EngineInputError);
    expect(() => selectNext(input([ticket(0, { partySize: 1.5 })]))).toThrow(EngineInputError);
    expect(() => selectNext(input([ticket(0, { presentedAtMs: 0.5 })]))).toThrow(EngineInputError);
    expect(() =>
      selectNext(input([ticket(0)], { selection: { ...EDF, feasibilityMarginMs: -1 } })),
    ).toThrow(EngineInputError);
    expect(() =>
      selectNext(input([ticket(0)], { selection: { ...EDF, latePresentationCutoffMs: -5 } })),
    ).toThrow(EngineInputError);
    expect(() =>
      assessTicket(ticket(0), 0, 0, CHECKPOINT, { ...EDF, latePresentationCutoffMs: 0 }),
    ).not.toThrow();
  });
});
