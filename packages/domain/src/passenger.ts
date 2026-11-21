import type { Millis } from './time';

/** Passenger segment, i.e. why the passenger is crossing the checkpoint. */
export const SEGMENTS = ['DEPARTING', 'TRANSFER'] as const;
export type Segment = (typeof SEGMENTS)[number];

/**
 * Risk class assigned by the priority engine (see ARCHITECTURE.md, "Priority engine").
 *
 * - `UNVERIFIED`: the deadline is unknown or not trusted; the ticket is served in FIFO order.
 * - `NORMAL` / `ATTENTION`: the passenger makes it if served in FIFO order.
 * - `URGENT`: at risk if served in FIFO order, still feasible if called now.
 * - `CRITICAL`: not feasible even if called now; escalated to a human, never boosted automatically.
 */
export const RISK_CLASSES = ['UNVERIFIED', 'NORMAL', 'ATTENTION', 'URGENT', 'CRITICAL'] as const;
export type RiskClass = (typeof RISK_CLASSES)[number];

/**
 * Where the system's knowledge of a passenger's deadline comes from.
 *
 * - `FEED`: an authorised operational feed (e.g. AODB boarding-close time).
 * - `RULE`: an approved rule applied to the schedule (e.g. STD minus a closing offset).
 * - `NONE`: no deadline is known.
 */
export const DEADLINE_SOURCES = ['FEED', 'RULE', 'NONE'] as const;
export type DeadlineSource = (typeof DEADLINE_SOURCES)[number];

/** A deadline as known by the system (which may differ from the ground truth). */
export interface KnownDeadline {
  /** Cut-off instant, or `null` when the source is `NONE`. */
  readonly atMs: Millis | null;
  readonly source: DeadlineSource;
}
