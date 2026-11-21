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
