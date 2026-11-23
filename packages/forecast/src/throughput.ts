import { ForecastError } from './base';

/*
 * The lanes' throughput measured from the day itself (S22.5): what the console can know of a day
 * slower (or faster) than its settings say, from what the log records. In a minute that starts
 * with enough people not yet admitted for every open lane, the people admitted show what the lanes
 * screen; in a quiet minute they show only who came. The measure keeps the busy minutes of the last
 * window, and says nothing until it has enough of them.
 */

/** One minute of the window, as the log gives it. */
export interface ThroughputMinute {
  /** People not yet admitted at the minute's start: waiting, announced or called. */
  readonly backlog: number;
  /** Lanes open at the minute's start. */
  readonly lanes: number;
  /** People admitted to screening during the minute. */
  readonly admitted: number;
}

/** When the minutes of a window measure the lanes. */
export interface ThroughputRule {
  /** The window, in minutes, before now. */
  readonly windowMinutes: number;
  /** A minute is busy when at least this many people per open lane were not yet admitted. */
  readonly busyPeoplePerLane: number;
  /** The fewest busy minutes, and people admitted in them, that make a measure. */
  readonly minBusyMinutes: number;
  readonly minPeople: number;
}

export interface MeasuredThroughput {
  /** People screened per lane per hour in the busy minutes; null: too few of them. */
  readonly ratePerLanePerHour: number | null;
  readonly busyMinutes: number;
  /** People admitted in the busy minutes. */
  readonly people: number;
}

function requireCount(value: number, what: string, min: number): void {
  if (!Number.isSafeInteger(value) || value < min) {
    throw new ForecastError(`${what} must be an integer of at least ${String(min)}`);
  }
}

/** Checks a rule of the measure. */
export function validateThroughputRule(rule: ThroughputRule): void {
  requireCount(rule.windowMinutes, 'the window of the throughput', 1);
  if (!Number.isFinite(rule.busyPeoplePerLane) || rule.busyPeoplePerLane <= 0) {
    throw new ForecastError('the people per lane of a busy minute must be positive');
  }
  requireCount(rule.minBusyMinutes, 'the busy minutes of a measure', 1);
  requireCount(rule.minPeople, 'the people of a measure', 1);
}

/**
 * The rate a console's forecast reads: the measured one when there is a measure, kept within half
 * and one and a half times the settings' (a guard against a window that says nothing true), else
 * the settings'.
 */
export function consoleRate(
  measured: MeasuredThroughput,
  settingsRatePerLanePerHour: number,
): number {
  const rate = measured.ratePerLanePerHour;
  if (rate === null) return settingsRatePerLanePerHour;
  return Math.min(
    1.5 * settingsRatePerLanePerHour,
    Math.max(0.5 * settingsRatePerLanePerHour, rate),
  );
}

/** The lanes' throughput over the minutes of a window (oldest first; their order does not matter). */
export function measureThroughput(
  minutes: readonly ThroughputMinute[],
  rule: ThroughputRule,
): MeasuredThroughput {
  validateThroughputRule(rule);
  let busyMinutes = 0;
  let laneMinutes = 0;
  let people = 0;
  for (const m of minutes) {
    if (m.lanes < 1 || m.backlog < rule.busyPeoplePerLane * m.lanes) continue;
    busyMinutes++;
    laneMinutes += m.lanes;
    people += m.admitted;
  }
  const enough = busyMinutes >= rule.minBusyMinutes && people >= rule.minPeople;
  return {
    ratePerLanePerHour: enough ? (people * 60) / laneMinutes : null,
    busyMinutes,
    people,
  };
}
