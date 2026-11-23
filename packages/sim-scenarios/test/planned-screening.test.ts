import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { generatePopulation, parseScenario, parseScenarioText, withLaneSchedule } from '../src';
import type { LanePlanRule, Scenario, ScenarioInput } from '../src';

/*
 * The screening time of the plan (S22.4, ADR-059): what the plan and GateFlow's settings assume
 * of the screening may differ from the day's. GateFlow's estimates come from the plan's, each
 * passenger's screening from the day's; without it, both are the day's, as before.
 */

const demo = parseScenarioText(
  readFileSync(new URL('../../../scenarios/single-checkpoint-demo.yaml', import.meta.url), 'utf8'),
);
const planned = demo.checkpoint.serviceTimeMeanSeconds.value;

/** The demo whose day screens at `seconds` a person, its plan assuming `assumed` (if given). */
function day(seconds: number, assumed?: number): Scenario {
  return parseScenario({
    ...demo,
    checkpoint: {
      ...demo.checkpoint,
      serviceTimeMeanSeconds: { ...demo.checkpoint.serviceTimeMeanSeconds, value: seconds },
      ...(assumed === undefined
        ? {}
        : { plannedServiceTimeMeanSeconds: { value: assumed, source: 'SYNTHETIC' as const } }),
    },
  });
}

describe('the screening time of the plan (S22.4, ADR-059)', () => {
  it("gives GateFlow the plan's screening time and each passenger the day's", () => {
    const slower = generatePopulation(day(planned + 6, planned), 7);
    const known = generatePopulation(day(planned + 6), 7);
    // The day is the same day: every passenger screens as on a day known to be slower.
    expect(slower.passengers).toEqual(known.passengers);
    expect(slower.flights).toEqual(known.flights);
    // GateFlow's estimates are the plan's.
    expect(slower.checkpoint.serviceRatePerLanePerHour).toBe(3600 / planned);
    expect(slower.checkpoint.processEstimateMs).toBe(planned * 1000);
    expect(known.checkpoint.serviceRatePerLanePerHour).toBe(3600 / (planned + 6));
    // A plan that assumes the day's screening is a scenario without it, day for day.
    expect(generatePopulation(day(planned, planned), 7)).toEqual(generatePopulation(demo, 7));
  });

  it('plans the lanes on the screening time of the plan', () => {
    const rule: LanePlanRule = {
      utilisation: 0.9,
      intervalMinutes: 60,
      minLanes: 1,
      maxLanes: 12,
      planningDays: 3,
    };
    const unplanned = (scenario: Scenario): ScenarioInput => {
      const checkpoint: ScenarioInput['checkpoint'] = {
        ...scenario.checkpoint,
        lanesAvailable: { value: 12, source: 'SYNTHETIC' },
        lanePlanRule: { value: rule, source: 'SYNTHETIC' },
      };
      delete checkpoint.laneSchedule;
      return { ...scenario, checkpoint };
    };
    const plan = (scenario: Scenario) =>
      withLaneSchedule(unplanned(scenario)).checkpoint.laneSchedule.value;
    const asPlanned = plan(day(planned));
    // A day half again as slow as planned keeps the plan made for the plan's screening time...
    expect(plan(day(planned * 1.5, planned))).toEqual(asPlanned);
    // ...where a checkpoint known to screen that slowly plans more lanes.
    const known = plan(day(planned * 1.5));
    expect(known).not.toEqual(asPlanned);
    const most = (lanes: readonly { lanes: number }[]) => Math.max(...lanes.map((e) => e.lanes));
    expect(most(known)).toBeGreaterThan(most(asPlanned));
  });
});
