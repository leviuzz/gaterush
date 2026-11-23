import { MS_PER_MINUTE } from '@gateflow/domain';
import { generatePopulation } from './generate';
import type { LanePlanRule, Scenario, ScenarioInput } from './schema';

/** Minutes in the service day. */
const DAY_MINUTES = 24 * 60;

function clock(minute: number): string {
  return `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
}

/**
 * Expected screening work per interval of the day, in milliseconds: the screening times of the
 * parties arriving in each interval, averaged over simulated days 1 to `days`. Arrivals before
 * midnight count in the first interval.
 */
export function expectedWorkByInterval(
  scenario: Scenario,
  intervalMinutes: number,
  days: number,
): number[] {
  const intervalMs = intervalMinutes * MS_PER_MINUTE;
  const intervals = Math.ceil(DAY_MINUTES / intervalMinutes);
  const work = new Array<number>(intervals).fill(0);
  for (let seed = 1; seed <= days; seed++) {
    for (const p of generatePopulation(scenario, seed).passengers) {
      const i = Math.max(0, Math.min(intervals - 1, Math.floor(p.arrivalMs / intervalMs)));
      work[i] = (work[i] ?? 0) + p.serviceMs / days;
    }
  }
  return work;
}

/** Most lanes a rule plans: its `maxLanes`, never more than the checkpoint has. */
export function maxPlannedLanes(rule: LanePlanRule, lanesAvailable: number): number {
  return Math.min(lanesAvailable, rule.maxLanes ?? lanesAvailable);
}

/**
 * Plans the lanes of a day with a rule: in every interval, enough lanes to screen the expected
 * arrivals of that interval at the rule's utilisation, at least `minLanes` and at most `maxLanes`
 * (by default the lanes the checkpoint has). Consecutive intervals with the same number of lanes
 * are merged.
 */
export function planLanes(
  scenario: Scenario,
  rule: LanePlanRule,
  lanesAvailable: number,
): { from: string; lanes: number }[] {
  const intervalMs = rule.intervalMinutes * MS_PER_MINUTE;
  const work = expectedWorkByInterval(scenario, rule.intervalMinutes, rule.planningDays);
  const most = maxPlannedLanes(rule, lanesAvailable);
  const plan: { from: string; lanes: number }[] = [];
  work.forEach((w, i) => {
    const lanes = Math.min(
      most,
      Math.max(rule.minLanes, Math.ceil(w / intervalMs / rule.utilisation)),
    );
    if (plan[plan.length - 1]?.lanes !== lanes) {
      plan.push({ from: clock(i * rule.intervalMinutes), lanes });
    }
  });
  return plan;
}

/**
 * The scenario with its lane schedule: the one it gives, else the one its rule plans. The planned
 * schedule carries the source and reference of the rule, and a note saying how it was made.
 */
export function withLaneSchedule(input: ScenarioInput): Scenario {
  const { laneSchedule, lanePlanRule, lanesAvailable } = input.checkpoint;
  if (laneSchedule !== undefined) return input as Scenario;
  if (lanePlanRule === undefined || lanesAvailable === undefined) {
    throw new RangeError('a scenario without a lane schedule needs a lane plan rule and lanes');
  }
  // The population does not depend on the lane schedule: plan with a placeholder, on the screening
  // time the plan assumes (ADR-059).
  const planned = input.checkpoint.plannedServiceTimeMeanSeconds;
  const draft: Scenario = {
    ...input,
    checkpoint: {
      ...input.checkpoint,
      ...(planned === undefined ? {} : { serviceTimeMeanSeconds: planned }),
      laneSchedule: { value: [{ from: '00:00', lanes: 1 }], source: lanePlanRule.source },
    },
  };
  const rule = lanePlanRule.value;
  const value = planLanes(draft, rule, lanesAvailable.value);
  return {
    ...input,
    checkpoint: {
      ...input.checkpoint,
      laneSchedule: {
        value,
        source: lanePlanRule.source,
        ...(lanePlanRule.ref === undefined ? {} : { ref: lanePlanRule.ref }),
        note:
          `Planned by checkpoint.lanePlanRule: every ${String(rule.intervalMinutes)} minutes, lanes for ` +
          `the expected arrivals at ${String(Math.round(rule.utilisation * 100))}% utilisation, ` +
          `${String(rule.minLanes)} to ${String(maxPlannedLanes(rule, lanesAvailable.value))} lanes (average of ` +
          `simulated days 1-${String(rule.planningDays)}).`,
      },
    },
  };
}
