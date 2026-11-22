/**
 * Machine-readable reasons attached to every assessment and selection. They are part of the
 * audit trail, so codes are never renamed or reused with a different meaning.
 */
export const REASON_CODES = [
  // Selection reasons
  /** The policy is plain FIFO. */
  'POLICY_FIFO',
  /** No boost-eligible ticket: the oldest ticket is called. */
  'FIFO',
  /** The boost-eligible ticket with the earliest latest-call time is called. */
  'URGENT_FEASIBLE',
  /** Boost-eligible tickets exist but the priority cap is exhausted: the oldest ticket is called. */
  'CAP_REACHED',
  /** A ticket reached the overtake limit K: the oldest such ticket is called. */
  'OVERTAKE_LIMIT_GUARD',
  /**
   * The most urgent ticket would push an older ticket beyond K overtakes (a group counts as its
   * size): the oldest ticket is called.
   */
  'OVERTAKE_ROOM_EXHAUSTED',
  /** Staff called the passenger's flight because boarding closes soon (baseline A'). */
  'FLIGHT_CALL',
  // Assessment reasons
  /** The deadline comes from an authorised operational feed. */
  'DEADLINE_FROM_FEED',
  /** The deadline comes from an approved rule (e.g. STD minus a closing offset). */
  'DEADLINE_FROM_RULE',
  /** No deadline is known: the ticket is UNVERIFIED and never boosted. */
  'DEADLINE_UNKNOWN',
  /**
   * The deadline was last confirmed by its source longer ago than the policy allows: the ticket is
   * UNVERIFIED and served in FIFO order until fresh data arrives.
   */
  'DEADLINE_STALE',
  /** The class stays more urgent than the margins alone would give, because of the hysteresis. */
  'HYSTERESIS_HOLD',
  /** The policy does not trust rule-based deadlines: the ticket is UNVERIFIED. */
  'RULE_DEADLINE_NOT_ALLOWED',
  /** The passenger's segment is not eligible for automatic boosts. */
  'SEGMENT_NOT_ELIGIBLE',
  /** Not feasible even if called now: escalate to a human, never boosted automatically. */
  'CRITICAL_ESCALATION',
  /** Still feasible, but only by using part of the safety margin. */
  'INSIDE_SAFETY_MARGIN',
  /**
   * A departing passenger who presented at the checkpoint later than the policy allows before the
   * scheduled departure: never boosted automatically (anti-abuse rule).
   */
  'LATE_PRESENTATION',
  /** The policy has a presentation rule but the presentation or departure time is unknown. */
  'PRESENTATION_UNVERIFIED',
  /** A group larger than the priority cap can never be boosted automatically: escalate. */
  'GROUP_EXCEEDS_CAP',
] as const;

export type ReasonCode = (typeof REASON_CODES)[number];

/** A reason code in words, for the people who read a decision: staff, auditors, passengers. */
export interface ReasonDescription {
  /** A few words, e.g. for a badge. */
  readonly title: string;
  /** One sentence. */
  readonly text: string;
}

/**
 * Every reason code in plain words. The texts explain what the engine did, never more: a reader
 * learns why a passenger was called, not how to obtain priority. Changing a text never changes a
 * decision.
 */
export const REASON_DESCRIPTIONS: Readonly<Record<ReasonCode, ReasonDescription>> = {
  POLICY_FIFO: {
    title: 'Arrival order (policy)',
    text: 'Called in order of arrival: this policy never changes the order.',
  },
  FIFO: {
    title: 'Arrival order',
    text: 'Called in order of arrival: nobody waiting needed to be brought forward.',
  },
  URGENT_FEASIBLE: {
    title: 'Brought forward',
    text: 'In order of arrival this passenger would have reached the gate too late; called now, they can still make it.',
  },
  CAP_REACHED: {
    title: 'Priority cap reached',
    text: 'Called in order of arrival: passengers at risk were waiting, but priority calls had reached their cap (at most k people in any N called).',
  },
  OVERTAKE_LIMIT_GUARD: {
    title: 'Fairness bound',
    text: 'Called because K people had already gone ahead of this passenger: nobody is overtaken more than K times.',
  },
  OVERTAKE_ROOM_EXHAUSTED: {
    title: 'Fairness bound protects others',
    text: 'Called in order of arrival: bringing a passenger at risk forward would have put someone who has waited longer beyond K overtakes.',
  },
  FLIGHT_CALL: {
    title: 'Flight called by staff',
    text: "Called by staff with the other passengers of a flight that closes soon (today's practice).",
  },
  DEADLINE_FROM_FEED: {
    title: 'Closing time from the flight feed',
    text: "The time boarding closes comes from the airport's flight feed.",
  },
  DEADLINE_FROM_RULE: {
    title: 'Closing time from a rule',
    text: 'The time boarding closes comes from an approved rule (the scheduled departure minus a fixed time).',
  },
  DEADLINE_UNKNOWN: {
    title: 'Closing time unknown',
    text: 'The time boarding closes is unknown: the passenger is served in order of arrival and never brought forward.',
  },
  DEADLINE_STALE: {
    title: 'Flight data too old',
    text: 'The flight data are too old to be trusted: the passenger is served in order of arrival until fresh data arrive.',
  },
  HYSTERESIS_HOLD: {
    title: 'Class held',
    text: 'The passenger stays in the more urgent class for a few minutes, so that the class does not flap back and forth.',
  },
  RULE_DEADLINE_NOT_ALLOWED: {
    title: 'Rule-based time not trusted',
    text: 'The policy does not trust closing times from a rule: the passenger is served in order of arrival.',
  },
  SEGMENT_NOT_ELIGIBLE: {
    title: 'Not eligible',
    text: 'This kind of passenger is not eligible for automatic priority.',
  },
  CRITICAL_ESCALATION: {
    title: 'Staff alerted',
    text: 'Too late even if called now: staff are alerted, and the system does not bring the passenger forward on its own.',
  },
  INSIDE_SAFETY_MARGIN: {
    title: 'Inside the safety margin',
    text: 'Still in time, but only by using part of the safety margin.',
  },
  LATE_PRESENTATION: {
    title: 'Arrived too late for priority',
    text: 'Arrived at the checkpoint later than the policy allows before departure: never brought forward automatically.',
  },
  PRESENTATION_UNVERIFIED: {
    title: 'Arrival rule not checkable',
    text: 'The arrival time or the departure time is unknown, so the arrival rule cannot be checked: never brought forward automatically.',
  },
  GROUP_EXCEEDS_CAP: {
    title: 'Group larger than the cap',
    text: 'The group is larger than the priority cap: staff are alerted instead of an automatic priority call.',
  },
};

/** The description of a reason code. */
export function describeReason(code: ReasonCode): ReasonDescription {
  return REASON_DESCRIPTIONS[code];
}
