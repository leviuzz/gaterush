import { readFileSync } from 'node:fs';
import { validatePopulation } from '@gateflow/sim-model';
import { describe, expect, it } from 'vitest';
import {
  ScenarioValidationError,
  canonicalJson,
  collectAssumptions,
  generatePopulation,
  generateSchedule,
  parseScenario,
  parseScenarioText,
} from '../src';
import type { Scenario } from '../src';

const scenarioFile = (name: string) =>
  readFileSync(new URL(`../../../scenarios/${name}.yaml`, import.meta.url), 'utf8');

const DEMO_TEXT = scenarioFile('single-checkpoint-demo');
const demo = parseScenarioText(DEMO_TEXT);

function withChange(mutate: (draft: Record<string, unknown>) => void): unknown {
  const draft = structuredClone(demo) as unknown as Record<string, unknown>;
  mutate(draft);
  return draft;
}

function issuesOf(data: unknown): readonly string[] {
  try {
    parseScenario(data);
  } catch (error) {
    if (error instanceof ScenarioValidationError) return error.issues;
    throw error;
  }
  return [];
}

describe('scenario files', () => {
  it.each([
    'single-checkpoint-demo',
    'single-checkpoint-moderate',
    'single-checkpoint-staffed',
    'single-checkpoint-strategic',
    'single-checkpoint-disrupted',
    'single-checkpoint-feed-stress',
  ])('%s is valid', (name) => {
    const scenario = parseScenarioText(scenarioFile(name));
    expect(scenario.id).toBe(name);
    expect(scenario.dataClassification).toBe('SYNTHETIC');
  });
});

describe('single-checkpoint-staffed', () => {
  it('has the passengers of the demo scenario and only a different lane schedule', () => {
    const staffed = parseScenarioText(scenarioFile('single-checkpoint-staffed'));
    const a = generatePopulation(staffed, 3);
    const b = generatePopulation(demo, 3);
    expect(a.passengers).toEqual(b.passengers);
    expect(a.flights).toEqual(b.flights);
    const schedule = a.checkpoint.laneSchedule;
    const laneHours = schedule.reduce((sum, entry, i) => {
      const until = schedule[i + 1]?.fromMs ?? 24 * 3_600_000;
      return sum + (entry.lanes * (until - entry.fromMs)) / 3_600_000;
    }, 0);
    expect(laneHours).toBe(93);
    expect(Math.max(...schedule.map((e) => e.lanes))).toBe(6);
  });
});

describe('parseScenario validation', () => {
  it('rejects unknown keys (strict schema)', () => {
    const issues = issuesOf(withChange((d) => (d.extra = 1)));
    expect(issues.join('\n')).toMatch(/extra/);
  });

  it('requires a source label on every parameter', () => {
    const issues = issuesOf(
      withChange((d) => {
        (d.checkpoint as { laneSchedule: unknown }).laneSchedule = {
          value: [{ from: '00:00', lanes: 5 }],
        };
      }),
    );
    expect(issues.join('\n')).toMatch(/checkpoint\.laneSchedule\.source/);
  });

  it('validates lane schedules: HH:MM times from 00:00, strictly increasing, 1 to 64 lanes', () => {
    const scheduleIssues = (value: unknown) =>
      issuesOf(
        withChange((d) => {
          (d.checkpoint as { laneSchedule: unknown }).laneSchedule = { value, source: 'SYNTHETIC' };
        }),
      ).join('\n');
    expect(
      scheduleIssues([
        { from: '00:00', lanes: 2 },
        { from: '05:30', lanes: 6 },
      ]),
    ).toBe('');
    expect(scheduleIssues([{ from: '04:00', lanes: 2 }])).toMatch(/must start at 00:00/);
    expect(
      scheduleIssues([
        { from: '00:00', lanes: 2 },
        { from: '06:00', lanes: 6 },
        { from: '06:00', lanes: 4 },
      ]),
    ).toMatch(/strictly increasing/);
    expect(
      scheduleIssues([
        { from: '00:00', lanes: 2 },
        { from: '24:00', lanes: 6 },
      ]),
    ).toMatch(/HH:MM/);
    expect(scheduleIssues([{ from: '00:00', lanes: 0 }])).toMatch(/lanes/);
    expect(scheduleIssues([])).not.toBe('');
  });

  it('validates the call response parameters', () => {
    const responseIssues = (change: Record<string, number>) =>
      issuesOf(
        withChange((d) => {
          const p = d.passengers as { callResponse: { value: Record<string, number> } };
          Object.assign(p.callResponse.value, change);
        }),
      ).join('\n');
    expect(responseIssues({ medianSeconds: 0 })).toBe('');
    expect(responseIssues({ medianSeconds: -1 })).toMatch(/medianSeconds/);
    expect(responseIssues({ absentProbability: 1.5 })).toMatch(/absentProbability/);
    expect(responseIssues({ absentExtraMedianMinutes: 0 })).toMatch(/absentExtraMedianMinutes/);
  });

  it('explains how to migrate scenarios of schema versions 1 to 3', () => {
    const v1 = issuesOf(withChange((d) => (d.schemaVersion = 1)));
    expect(v1).toHaveLength(1);
    expect(v1[0]).toMatch(/migrated to version 4.*laneSchedule.*callResponse.*groups.*disruptions/);
    const v2 = issuesOf(withChange((d) => (d.schemaVersion = 2)));
    expect(v2).toHaveLength(1);
    expect(v2[0]).toMatch(
      /migrated to version 4.*groups.*assistedShare.*strategicLateArrival.*disruptions/,
    );
    const v3 = issuesOf(withChange((d) => (d.schemaVersion = 3)));
    expect(v3).toHaveLength(1);
    expect(v3[0]).toMatch(/migrated to version 4.*disruptions.*flightDelays.*feedOutages/);
  });

  it('validates groups and strategic late arrivals', () => {
    const passengersIssues = (mutate: (p: Record<string, { value: unknown }>) => void) =>
      issuesOf(
        withChange((d) => {
          mutate(d.passengers as Record<string, { value: unknown }>);
        }),
      ).join('\n');
    expect(
      passengersIssues((p) => {
        p.groups!.value = {
          partySizes: [
            { size: 2, share: 1 },
            { size: 2, share: 1 },
          ],
        };
      }),
    ).toMatch(/each party size may appear only once/);
    expect(
      passengersIssues((p) => {
        p.groups!.value = { partySizes: [{ size: 0, share: 1 }] };
      }),
    ).toMatch(/size/);
    expect(
      passengersIssues((p) => {
        p.strategicLateArrival!.value = {
          share: 0.1,
          minMinutesBeforeStd: 10,
          maxMinutesBeforeStd: 30,
        };
      }),
    ).toMatch(/must arrive before boarding closes/);
    expect(
      passengersIssues((p) => {
        p.strategicLateArrival!.value = {
          share: 0.1,
          minMinutesBeforeStd: 30,
          maxMinutesBeforeStd: 25,
        };
      }),
    ).toMatch(/maxMinutesBeforeStd/);
    expect(
      passengersIssues((p) => {
        p.assistedShare!.value = 1.5;
      }),
    ).toMatch(/assistedShare/);
  });

  it('rejects passengers arriving after boarding closes', () => {
    const issues = issuesOf(
      withChange((d) => {
        const ops = d.operations as { boardingCloseMinutesBeforeStd: { value: number } };
        ops.boardingCloseMinutesBeforeStd.value = 30;
      }),
    );
    expect(issues.join('\n')).toMatch(/must arrive before boarding closes/);
  });

  it('rejects duplicate hours and invalid load factors', () => {
    expect(
      issuesOf(
        withChange((d) => {
          const s = d.schedule as { departuresPerHour: { value: { hour: number }[] } };
          s.departuresPerHour.value[1]!.hour = 6;
        }),
      ).join('\n'),
    ).toMatch(/each hour may appear only once/);
    expect(
      issuesOf(
        withChange((d) => {
          const p = d.passengers as { loadFactor: { value: { min: number } } };
          p.loadFactor.value.min = 0.99;
        }),
      ).join('\n'),
    ).toMatch(/min <= mode <= max/);
  });

  it('reports YAML syntax errors and duplicate keys as validation errors', () => {
    expect(() => parseScenarioText('a: [1, 2')).toThrow(ScenarioValidationError);
    expect(() => parseScenarioText('a: 1\na: 2\n')).toThrow(ScenarioValidationError);
  });

  it('accepts JSON input', () => {
    expect(parseScenarioText(JSON.stringify(demo), 'json')).toEqual(demo);
  });
});

describe('canonicalJson', () => {
  it('does not depend on key order and preserves array order', () => {
    expect(canonicalJson({ b: 1, a: [3, 1, { d: 2, c: null }] })).toBe(
      '{"a":[3,1,{"c":null,"d":2}],"b":1}',
    );
    expect(canonicalJson({ a: 1, b: 2 })).toBe(canonicalJson({ b: 2, a: 1 }));
  });

  it('gives the same string for the same scenario written with a different key order', () => {
    const reverseKeys = (value: unknown): unknown => {
      if (Array.isArray(value)) return value.map(reverseKeys);
      if (typeof value === 'object' && value !== null) {
        return Object.fromEntries(
          Object.entries(value)
            .reverse()
            .map(([k, v]) => [k, reverseKeys(v)]),
        );
      }
      return value;
    };
    const reordered = reverseKeys(demo);
    expect(JSON.stringify(reordered)).not.toBe(JSON.stringify(demo));
    expect(canonicalJson(reordered)).toBe(canonicalJson(demo));
  });

  it('rejects values JSON cannot represent faithfully', () => {
    expect(() => canonicalJson(Number.NaN)).toThrow(TypeError);
    expect(() => canonicalJson({ a: Infinity })).toThrow(TypeError);
    expect(() => canonicalJson(undefined)).toThrow(TypeError);
    expect(canonicalJson({ a: undefined, b: 1 })).toBe('{"b":1}');
  });
});

describe('collectAssumptions', () => {
  it('lists every labelled parameter with its source', () => {
    const assumptions = collectAssumptions(demo);
    expect(assumptions.map((a) => a.path)).toEqual([
      'checkpoint.laneSchedule',
      'checkpoint.serviceTimeMeanSeconds',
      'checkpoint.serviceTimeCv',
      'schedule.departuresPerHour',
      'schedule.aircraftMix',
      'schedule.gateZones',
      'passengers.loadFactor',
      'passengers.transferShare',
      'passengers.showUp.departing',
      'passengers.showUp.transfer',
      'passengers.walkSpeedSigma',
      'passengers.callResponse',
      'passengers.groups',
      'passengers.assistedShare',
      'passengers.strategicLateArrival',
      'operations.boardingCloseMinutesBeforeStd',
      'operations.deadlineKnowledge',
      'disruptions.flightDelays',
      'disruptions.gateChanges',
      'disruptions.laneOutages',
      'disruptions.feedOutages',
    ]);
    expect(assumptions.every((a) => a.source === 'SYNTHETIC')).toBe(true);
  });

  it('leaves no model number outside a labelled parameter', () => {
    // Every numeric leaf must be inside a labelled parameter, except structural fields.
    const structural = new Set(['schemaVersion', 'schedule.generatorSeed']);
    const unlabelled: string[] = [];
    const visit = (node: unknown, path: string[], insideParam: boolean): void => {
      if (typeof node === 'number' && !insideParam && !structural.has(path.join('.'))) {
        unlabelled.push(path.join('.'));
      }
      if (typeof node !== 'object' || node === null) return;
      const isParam = !Array.isArray(node) && 'source' in node && 'value' in node;
      for (const [key, child] of Object.entries(node)) {
        visit(child, [...path, key], insideParam || isParam);
      }
    };
    visit(demo, [], false);
    expect(unlabelled).toEqual([]);
  });
});

describe('generateSchedule', () => {
  const schedule = generateSchedule(demo);

  it('builds the design day from the hourly profile', () => {
    expect(schedule).toHaveLength(40);
    expect(schedule.map((f) => f.index)).toEqual(schedule.map((_, i) => i));
    expect(schedule[0]?.id).toBe('F001');
    for (let i = 1; i < schedule.length; i++) {
      expect(schedule[i]!.stdMs).toBeGreaterThanOrEqual(schedule[i - 1]!.stdMs);
    }
    // 5 departures between 06:00 and 07:00, at 06:06, 06:18, 06:30, 06:42, 06:54
    expect(schedule.slice(0, 5).map((f) => f.stdMs / 60_000 - 360)).toEqual([6, 18, 30, 42, 54]);
  });

  it('sets the deadline from the closing rule, known to the system as RULE', () => {
    for (const flight of schedule) {
      expect(flight.boardingCloseMs).toBe(flight.stdMs - 20 * 60_000);
      expect(flight.knownDeadline).toEqual({ atMs: flight.boardingCloseMs, source: 'RULE' });
    }
  });

  it('does not depend on the replication seed', () => {
    const a = generatePopulation(demo, 1).flights;
    const b = generatePopulation(demo, 2).flights;
    expect(a).toEqual(b);
  });
});

describe('generatePopulation', () => {
  const population = generatePopulation(demo, 7);

  it('is deterministic for a given seed and changes with the seed', () => {
    expect(generatePopulation(demo, 7)).toEqual(population);
    const other = generatePopulation(demo, 8);
    expect(other.passengers.map((p) => p.arrivalMs)).not.toEqual(
      population.passengers.map((p) => p.arrivalMs),
    );
  });

  it('produces a population the checkpoint model accepts', () => {
    expect(() => {
      validatePopulation(population);
    }).not.toThrow();
    expect(population.checkpoint).toEqual({
      laneSchedule: [{ fromMs: 0, lanes: 6 }],
      serviceRatePerLanePerHour: 90,
      processEstimateMs: 40_000,
    });
  });

  it('respects the load factor bounds per flight', () => {
    const schedule = generateSchedule(demo);
    const counts = new Map<number, number>();
    for (const p of population.passengers)
      counts.set(p.flightIndex, (counts.get(p.flightIndex) ?? 0) + p.partySize);
    for (const flight of schedule) {
      const count = counts.get(flight.index) ?? 0;
      expect(count).toBeGreaterThanOrEqual(Math.round(flight.seats * 0.6));
      expect(count).toBeLessThanOrEqual(Math.round(flight.seats * 0.98));
    }
  });

  it('makes every passenger arrive within the show-up bounds, before boarding closes', () => {
    const violations = population.passengers.filter((p) => {
      const flight = population.flights[p.flightIndex]!;
      const earliness = (flight.stdMs - p.arrivalMs) / 60_000;
      const [min, max] = p.segment === 'TRANSFER' ? [24, 180] : [25, 240];
      return (
        earliness < min ||
        earliness > max ||
        p.arrivalMs >= flight.boardingCloseMs ||
        p.serviceMs < 1
      );
    });
    expect(violations).toEqual([]);
  });

  it('draws about 5% connecting passengers and uses the zone walking time as estimate', () => {
    let transfers = 0;
    let total = 0;
    for (let seed = 1; seed <= 5; seed++) {
      for (const p of generatePopulation(demo, seed).passengers) {
        total++;
        if (p.segment === 'TRANSFER') transfers++;
      }
    }
    expect(transfers / total).toBeGreaterThan(0.04);
    expect(transfers / total).toBeLessThan(0.06);
    const zones = new Map(demo.schedule.gateZones.value.map((z) => [z.id, z.walkMinutes * 60_000]));
    const wrongEstimates = population.passengers.filter(
      (p) => p.walkEstimateMs !== zones.get(population.flights[p.flightIndex]!.gateZone),
    );
    expect(wrongEstimates).toEqual([]);
  });

  it('keeps each passenger attribute on its own stream (changing one parameter does not move others)', () => {
    const slowerService: Scenario = {
      ...demo,
      checkpoint: {
        ...demo.checkpoint,
        serviceTimeMeanSeconds: { value: 50, source: 'SYNTHETIC' },
      },
    };
    const changed = generatePopulation(slowerService, 7);
    expect(changed.passengers.map((p) => p.arrivalMs)).toEqual(
      population.passengers.map((p) => p.arrivalMs),
    );
    expect(changed.passengers.map((p) => p.serviceMs)).not.toEqual(
      population.passengers.map((p) => p.serviceMs),
    );
  });

  it('converts the lane schedule to milliseconds since midnight', () => {
    const staffed: Scenario = {
      ...demo,
      checkpoint: {
        ...demo.checkpoint,
        laneSchedule: {
          value: [
            { from: '00:00', lanes: 2 },
            { from: '05:30', lanes: 6 },
            { from: '21:15', lanes: 3 },
          ],
          source: 'SYNTHETIC',
        },
      },
    };
    expect(generatePopulation(staffed, 7).checkpoint.laneSchedule).toEqual([
      { fromMs: 0, lanes: 2 },
      { fromMs: 330 * 60_000, lanes: 6 },
      { fromMs: (21 * 60 + 15) * 60_000, lanes: 3 },
    ]);
  });

  it('draws call responses with the configured median and absences with the configured share', () => {
    const responses: number[] = [];
    let absent = 0;
    for (const p of population.passengers) {
      responses.push(p.callResponseMs);
      if (p.absenceDelayMs > 0) absent++;
    }
    responses.sort((a, b) => a - b);
    const median = responses[Math.floor(responses.length / 2)]!;
    expect(median).toBeGreaterThan(70_000);
    expect(median).toBeLessThan(80_000);
    const share = absent / population.passengers.length;
    expect(share).toBeGreaterThan(0.03);
    expect(share).toBeLessThan(0.05);
  });

  it('adds the call behaviour without moving the attributes of generator 0.1.0', () => {
    const instant: Scenario = {
      ...demo,
      passengers: {
        ...demo.passengers,
        callResponse: {
          value: { ...demo.passengers.callResponse.value, medianSeconds: 0, absentProbability: 0 },
          source: 'SYNTHETIC',
        },
      },
    };
    const changed = generatePopulation(instant, 7);
    expect(changed.passengers.every((p) => p.callResponseMs === 0 && p.absenceDelayMs === 0)).toBe(
      true,
    );
    const strip = (pop: typeof population) =>
      pop.passengers.map((p) => ({ ...p, callResponseMs: 0, absenceDelayMs: 0 }));
    expect(strip(changed)).toEqual(strip(population));
  });

  it('forms parties without moving the attributes of single passengers', () => {
    const singles: Scenario = {
      ...demo,
      passengers: {
        ...demo.passengers,
        groups: { value: { partySizes: [{ size: 1, share: 1 }] }, source: 'SYNTHETIC' },
        assistedShare: { value: 0, source: 'SYNTHETIC' },
      },
    };
    const alone = generatePopulation(singles, 7).passengers;
    const byId = new Map(alone.map((p) => [p.id, p]));
    const grouped = population.passengers;
    expect(grouped.length).toBeLessThan(alone.length);
    expect(grouped.reduce((a, p) => a + p.partySize, 0)).toBe(alone.length);
    for (const party of grouped) {
      const leader = byId.get(party.id)!;
      expect(party.arrivalMs).toBe(leader.arrivalMs);
      expect(party.segment).toBe(leader.segment);
      expect(party.walkMs).toBe(leader.walkMs);
      // The screening time of a party is the sum of its members' screening times.
      const start = alone.indexOf(leader);
      const members = alone.slice(start, start + party.partySize);
      expect(members.every((m) => m.flightIndex === party.flightIndex)).toBe(true);
      expect(party.serviceMs).toBe(members.reduce((a, m) => a + m.serviceMs, 0));
    }
  });

  it('draws parties, assisted passengers and strategic arrivals with the configured shares', () => {
    let parties = 0;
    let groups = 0;
    let people = 0;
    let assisted = 0;
    for (let seed = 1; seed <= 5; seed++) {
      for (const p of generatePopulation(demo, seed).passengers) {
        parties++;
        people += p.partySize;
        if (p.partySize > 1) groups++;
        if (p.path === 'ASSISTED') assisted++;
        expect(p.strategic).toBe(false);
      }
    }
    expect(groups / parties).toBeGreaterThan(0.19);
    expect(groups / parties).toBeLessThan(0.25);
    expect(people / parties).toBeGreaterThan(1.25);
    expect(people / parties).toBeLessThan(1.4);
    expect(assisted / parties).toBeGreaterThan(0.004);
    expect(assisted / parties).toBeLessThan(0.01);

    const strategic = parseScenarioText(scenarioFile('single-checkpoint-strategic'));
    const strategicPopulation = generatePopulation(strategic, 7);
    const late = strategicPopulation.passengers.filter((p) => p.strategic);
    expect(late.length).toBeGreaterThan(0);
    for (const p of late) {
      const flight = strategicPopulation.flights[p.flightIndex]!;
      expect(p.segment).toBe('DEPARTING');
      const earliness = (flight.stdMs - p.arrivalMs) / 60_000;
      expect(earliness).toBeGreaterThanOrEqual(25);
      expect(earliness).toBeLessThanOrEqual(35);
    }
  });
});

describe('disruptions (generator 0.4.0)', () => {
  const MIN = 60_000;
  const disrupted = parseScenarioText(scenarioFile('single-checkpoint-disrupted'));

  it('leaves a scenario without disruptions untouched: no delays, updates or outages', () => {
    for (const seed of [1, 2, 3]) {
      const population = generatePopulation(demo, seed);
      expect(population.laneOutages).toBeUndefined();
      expect(population.feedOutages).toBeUndefined();
      for (const flight of population.flights) {
        expect(Object.keys(flight).sort()).toEqual(
          ['boardingCloseMs', 'gateZone', 'id', 'index', 'knownDeadline', 'stdMs'].sort(),
        );
      }
    }
  });

  it('has the passengers of the demo scenario: disruptions use streams of their own', () => {
    for (const seed of [1, 7]) {
      expect(generatePopulation(disrupted, seed).passengers).toEqual(
        generatePopulation(demo, seed).passengers,
      );
    }
  });

  it('delays a quarter of the flights; the feed announces each delay 10-120 minutes before departure', () => {
    const close = 20 * MIN;
    let flights = 0;
    let delayed = 0;
    for (let seed = 1; seed <= 50; seed++) {
      for (const flight of generatePopulation(disrupted, seed).flights) {
        flights++;
        const delay = flight.delayMs ?? 0;
        expect(flight.boardingCloseMs).toBe(flight.stdMs - close + delay);
        // The day starts with the scheduled deadline.
        expect(flight.knownDeadline).toEqual({ atMs: flight.stdMs - close, source: 'RULE' });
        const deadlineUpdates = (flight.updates ?? []).filter((u) => u.knownDeadline !== undefined);
        if (delay === 0) {
          expect(deadlineUpdates).toHaveLength(0);
          continue;
        }
        delayed++;
        expect(delay).toBeLessThanOrEqual(180 * MIN);
        expect(deadlineUpdates).toHaveLength(1);
        const update = deadlineUpdates[0]!;
        expect(update.knownDeadline).toEqual({ atMs: flight.boardingCloseMs, source: 'RULE' });
        expect(update.atMs).toBeGreaterThanOrEqual(flight.stdMs - 120 * MIN);
        expect(update.atMs).toBeLessThanOrEqual(flight.stdMs - 10 * MIN);
      }
    }
    expect(delayed / flights).toBeGreaterThan(0.2);
    expect(delayed / flights).toBeLessThan(0.3);
  });

  it('changes gates to another zone, reported within 5 minutes', () => {
    let changes = 0;
    for (let seed = 1; seed <= 50; seed++) {
      for (const flight of generatePopulation(disrupted, seed).flights) {
        const change = flight.gateChange;
        if (change === undefined) continue;
        changes++;
        expect(change.gateZone).not.toBe(flight.gateZone);
        expect(change.atMs).toBeGreaterThanOrEqual(flight.stdMs - 70 * MIN);
        expect(change.atMs).toBeLessThanOrEqual(flight.stdMs - 30 * MIN);
        const notice = (flight.updates ?? []).find((u) => u.walkEstimateMs !== undefined);
        expect(notice?.walkEstimateMs).toBe(change.walkEstimateMs);
        expect(notice!.atMs - change.atMs).toBeGreaterThanOrEqual(0);
        expect(notice!.atMs - change.atMs).toBeLessThanOrEqual(5 * MIN);
        const times = (flight.updates ?? []).map((u) => u.atMs);
        expect(times).toEqual([...times].sort((a, b) => a - b));
      }
    }
    expect(changes / (50 * 40)).toBeGreaterThan(0.07);
    expect(changes / (50 * 40)).toBeLessThan(0.13);
  });

  it('draws lane and feed outages as Poisson processes, feed outages merged and sorted', () => {
    let laneOutages = 0;
    let feedOutages = 0;
    for (let seed = 1; seed <= 100; seed++) {
      const population = generatePopulation(disrupted, seed);
      for (const o of population.laneOutages ?? []) {
        laneOutages++;
        expect(o.lanes).toBe(1);
        expect(o.toMs - o.fromMs).toBeGreaterThan(0);
        expect(o.toMs - o.fromMs).toBeLessThanOrEqual(60 * MIN);
      }
      const feed = population.feedOutages ?? [];
      feedOutages += feed.length;
      for (let i = 0; i < feed.length; i++) {
        expect(feed[i]!.toMs).toBeGreaterThan(feed[i]!.fromMs);
        if (i > 0) expect(feed[i]!.fromMs).toBeGreaterThan(feed[i - 1]!.toMs);
      }
    }
    expect(laneOutages / 100).toBeGreaterThan(1.5);
    expect(laneOutages / 100).toBeLessThan(2.5);
    expect(feedOutages / 100).toBeGreaterThan(0.7);
    expect(feedOutages / 100).toBeLessThan(1.3);
  });

  it('the feed stress test differs from the disrupted day only by its feed outages', () => {
    const stress = parseScenarioText(scenarioFile('single-checkpoint-feed-stress'));
    let downMs = 0;
    for (const seed of [1, 2, 3]) {
      const a = generatePopulation(stress, seed);
      const b = generatePopulation(disrupted, seed);
      expect(a.passengers).toEqual(b.passengers);
      expect(a.flights).toEqual(b.flights);
      expect(a.laneOutages).toEqual(b.laneOutages);
      downMs += (a.feedOutages ?? []).reduce((sum, o) => sum + o.toMs - o.fromMs, 0);
    }
    // Several hours a day without the feed.
    expect(downMs / 3).toBeGreaterThan(2 * 60 * MIN);
  });

  it('is deterministic, and the disruptions change from one simulated day to the next', () => {
    expect(generatePopulation(disrupted, 4)).toEqual(generatePopulation(disrupted, 4));
    expect(generatePopulation(disrupted, 4).flights).not.toEqual(
      generatePopulation(disrupted, 5).flights,
    );
  });

  it('knows no deadline at all when there is no flight feed', () => {
    const noFeed = parseScenario(
      withChange((d) => {
        (d.operations as { deadlineKnowledge: { value: string } }).deadlineKnowledge.value = 'NONE';
      }),
    );
    for (const flight of generatePopulation(noFeed, 2).flights) {
      expect(flight.knownDeadline).toEqual({ atMs: null, source: 'NONE' });
    }
    const noFeedDisrupted = parseScenario({
      ...structuredClone(disrupted),
      operations: {
        ...disrupted.operations,
        deadlineKnowledge: { value: 'NONE', source: 'SYNTHETIC' },
      },
    });
    for (const flight of generatePopulation(noFeedDisrupted, 2).flights) {
      expect(flight.knownDeadline.atMs).toBeNull();
      expect((flight.updates ?? []).every((u) => u.knownDeadline === undefined)).toBe(true);
    }
  });

  it('validates the disruption parameters', () => {
    const disruptionIssues = (path: string, change: Record<string, number>) =>
      issuesOf(
        withChange((d) => {
          const all = d.disruptions as Record<string, { value: Record<string, number> }>;
          Object.assign(all[path]!.value, change);
        }),
      ).join('\n');
    expect(disruptionIssues('flightDelays', { share: 1.2 })).toMatch(/share/);
    expect(
      disruptionIssues('flightDelays', {
        noticeMinMinutesBeforeStd: 90,
        noticeMaxMinutesBeforeStd: 30,
      }),
    ).toMatch(/noticeMaxMinutesBeforeStd must not be smaller/);
    expect(disruptionIssues('gateChanges', { minMinutesBeforeStd: 80 })).toMatch(
      /maxMinutesBeforeStd must not be smaller/,
    );
    expect(disruptionIssues('laneOutages', { perDay: -1 })).toMatch(/perDay/);
    expect(disruptionIssues('feedOutages', { maxMinutes: 2000 })).toMatch(/maxMinutes/);
  });
});
