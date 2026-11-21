import { readFileSync } from 'node:fs';
import {
  PRIORITY_V2_POLICY,
  PRIORITY_V3_POLICY,
  VIRTUAL_FIFO_POLICY,
  classificationOf,
} from '@gateflow/queue-core';
import type { Policy } from '@gateflow/queue-core';
import { simulateCheckpoint } from '@gateflow/sim-model';
import type { Population, RunResult } from '@gateflow/sim-model';
import { generatePopulation, parseScenarioText } from '@gateflow/sim-scenarios';
import type { Scenario } from '@gateflow/sim-scenarios';
import { describe, expect, it } from 'vitest';

/**
 * Acceptance criterion of slice S5: with the flight feed absent, GateFlow (policy B) produces
 * exactly the outcomes of the same virtual queue served in arrival order (policy A of the
 * comparison, ADR-015): it degrades to FIFO, passenger by passenger.
 */
const load = (name: string): Scenario =>
  parseScenarioText(
    readFileSync(new URL(`../../../scenarios/${name}.yaml`, import.meta.url), 'utf8'),
  );
const SCENARIOS = [load('single-checkpoint-demo'), load('single-checkpoint-disrupted')];
const SEEDS = [1, 2, 3];
const OPTIONS = { classification: classificationOf(PRIORITY_V3_POLICY)! };
const MINUTE = 60_000;

/** Outcomes without the selection reasons, which explain the decisions but are not part of them. */
function decisions(run: RunResult): Record<string, unknown>[] {
  return run.outcomes.map((o) =>
    Object.fromEntries(Object.entries(o).filter(([key]) => key !== 'selectionReasons')),
  );
}

function withoutFeed(scenario: Scenario): Scenario {
  const knowledge = scenario.operations.deadlineKnowledge;
  return {
    ...scenario,
    operations: { ...scenario.operations, deadlineKnowledge: { ...knowledge, value: 'NONE' } },
  };
}

/** The same day with the feed down from more than `maxAgeMs` before the first event onwards. */
function feedDownAllDay(population: Population, maxAgeMs: number): Population {
  const times = [
    ...population.passengers.map((p) => p.arrivalMs),
    ...population.flights.flatMap((f) => (f.updates ?? []).map((u) => u.atMs)),
    ...(population.laneOutages ?? []).map((o) => o.fromMs),
    0,
  ];
  const firstMs = times.reduce((min, t) => Math.min(min, t), Infinity);
  return {
    ...population,
    feedOutages: [{ fromMs: firstMs - maxAgeMs - 1, toMs: 48 * 60 * MINUTE }],
  };
}

const run = (population: Population, policy: Policy) =>
  simulateCheckpoint(population, policy, OPTIONS);

describe('acceptance of S5: without the flight feed, GateFlow degrades exactly to FIFO', () => {
  it.each(SCENARIOS.flatMap((s) => SEEDS.map((seed) => [s.id, seed, s] as const)))(
    '%s, seed %i: no deadline knowledge at all',
    (_id, seed, scenario) => {
      const population = generatePopulation(withoutFeed(scenario), seed);
      expect(population.flights.every((f) => f.knownDeadline.source === 'NONE')).toBe(true);
      const fifo = decisions(run(population, VIRTUAL_FIFO_POLICY));
      for (const policy of [PRIORITY_V2_POLICY, PRIORITY_V3_POLICY]) {
        const b = run(population, policy);
        expect(b.stats.priorityCalls).toBe(0);
        expect(decisions(b)).toEqual(fifo);
      }
    },
  );

  it.each(SCENARIOS.flatMap((s) => SEEDS.map((seed) => [s.id, seed, s] as const)))(
    '%s, seed %i: the feed down all day (priority-v3)',
    (_id, seed, scenario) => {
      const selection = PRIORITY_V3_POLICY.selection;
      const maxAge = selection.kind === 'constrained-edf' ? selection.maxDeadlineAgeMs : null;
      if (maxAge === null) throw new Error('priority-v3 must have a maximum data age');
      const live = generatePopulation(scenario, seed);
      // With the feed, GateFlow does prioritise on these days.
      expect(run(live, PRIORITY_V3_POLICY).stats.priorityCalls).toBeGreaterThan(0);
      const down = feedDownAllDay(live, maxAge);
      const b = run(down, PRIORITY_V3_POLICY);
      expect(b.stats.priorityCalls).toBe(0);
      expect(decisions(b)).toEqual(decisions(run(down, VIRTUAL_FIFO_POLICY)));
    },
  );
});
