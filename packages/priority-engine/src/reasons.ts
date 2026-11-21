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
] as const;

export type ReasonCode = (typeof REASON_CODES)[number];
