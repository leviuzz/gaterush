import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  ScenarioValidationError,
  canonicalJson,
  composeScenario,
  generatePopulation,
  mergeScenarioParts,
  parseAirport,
  parseScenario,
  parseScenarioText,
  planLanes,
} from '../src';
import type { Scenario, ScenarioFiles } from '../src';

const root = new URL('../../../', import.meta.url);
const sha = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');
const filesFor = (dir: string): ScenarioFiles => ({
  read: (path) => readFileSync(new URL(path, new URL(dir, root)), 'utf8'),
  sha256: sha,
});
const loadDay = (id: string) =>
  parseScenarioText(
    readFileSync(new URL(`scenarios/${id}.yaml`, root), 'utf8'),
    'yaml',
    filesFor('scenarios/'),
  );

function issuesOf(run: () => unknown): readonly string[] {
  try {
    run();
  } catch (error) {
    if (error instanceof ScenarioValidationError) return error.issues;
    throw error;
  }
  return [];
}

const LIBRARY = [
  ['vce-like-normal-day', 'vce-like', 'departures'],
  ['vce-like-peak-day', 'vce-like', 'departures'],
  ['vce-like-disrupted-day', 'vce-like', 'departures'],
  ['tsf-like-peak-day', 'tsf-like', 'departures'],
  ['mx-like-transfer-hub', 'mx-like-hub', 'transfer'],
] as const;

describe('airport configurations', () => {
  const fixture = JSON.parse(
    readFileSync(new URL('fixtures/s7-library-populations.json', import.meta.url), 'utf8'),
  ) as Record<string, string[]>;

  it.each(LIBRARY)(
    '%s takes its parameters from %s/%s and simulates the passengers of S7',
    (id, airport, checkpoint) => {
      const scenario = loadDay(id);
      expect(scenario.airport).toMatchObject({ id: airport, checkpoint });
      expect(scenario.airport?.file).toBe(`../airports/${airport}.yaml`);
      expect(scenario.airport?.sha256).toBe(
        sha(readFileSync(new URL(`airports/${airport}.yaml`, root), 'utf8')),
      );
      expect(scenario.dataSources.map((s) => s.id)).toEqual(
        expect.arrayContaining(['gateflow-synthetic', 'library-flights']),
      );
      // Same passengers as the self-contained S7 files (fingerprints taken before the change).
      expect([1, 2].map((seed) => sha(canonicalJson(generatePopulation(scenario, seed))))).toEqual(
        fixture[id],
      );
    },
  );

  it.each(LIBRARY)(
    '%s: the lane plan of the day is the one the rule of its checkpoint gives',
    (id) => {
      const scenario = loadDay(id);
      const { lanePlanRule, lanesAvailable, laneSchedule } = scenario.checkpoint;
      if (lanePlanRule === undefined || lanesAvailable === undefined) {
        throw new Error('expected a lane plan rule and the lanes available');
      }
      expect(planLanes(scenario, lanePlanRule.value, lanesAvailable.value)).toEqual(
        laneSchedule.value,
      );
    },
    120_000,
  );

  it('plans the lanes from the rule when a day gives no schedule', () => {
    const text = readFileSync(new URL('scenarios/mx-like-transfer-hub.yaml', root), 'utf8');
    const withoutPlan = text.replace(/^checkpoint:\n(?: .*\n|\n)*?(?=^schedule:)/m, '');
    expect(withoutPlan).not.toContain('laneSchedule');
    const planned = parseScenarioText(withoutPlan, 'yaml', filesFor('scenarios/'));
    const given = loadDay('mx-like-transfer-hub');
    expect(planned.checkpoint.laneSchedule.value).toEqual(given.checkpoint.laneSchedule.value);
    expect(planned.checkpoint.laneSchedule.note).toMatch(/^Planned by checkpoint.lanePlanRule/);
  }, 60_000);

  it('merges parts: objects key by key, parameters, arrays and values as a whole', () => {
    expect(
      mergeScenarioParts(
        { a: { x: 1, y: [1, 2] }, p: { value: { m: 1, n: 2 }, source: 'SYNTHETIC', note: 'n' } },
        { a: { y: [3] }, p: { value: { m: 5 }, source: 'MEASURED' } },
      ),
    ).toEqual({ a: { x: 1, y: [3] }, p: { value: { m: 5 }, source: 'MEASURED' } });
  });

  it('rejects unknown checkpoints, unreadable or invalid airport files, and loose scenarios', () => {
    const text = readFileSync(new URL('scenarios/tsf-like-peak-day.yaml', root), 'utf8');
    expect(
      issuesOf(() =>
        parseScenarioText(
          text.replace('checkpoint: departures', 'checkpoint: arrivals'),
          'yaml',
          filesFor('scenarios/'),
        ),
      ),
    ).toEqual([
      'extends.checkpoint: airport tsf-like has no checkpoint "arrivals" (known: departures)',
    ]);
    expect(
      issuesOf(() =>
        parseScenarioText(
          text.replace('../airports/tsf-like.yaml', '../airports/none.yaml'),
          'yaml',
          filesFor('scenarios/'),
        ),
      )[0],
    ).toMatch(/^extends.airport: cannot read \.\.\/airports\/none\.yaml/);
    const broken: ScenarioFiles = {
      read: (path) =>
        path.endsWith('.yaml') && path.includes('airports')
          ? 'schemaVersion: 1\nkind: airport\nid: X\n'
          : filesFor('scenarios/').read(path),
      sha256: sha,
    };
    const issues = issuesOf(() => parseScenarioText(text, 'yaml', broken));
    expect(issues[0]).toMatch(/^airport \.\.\/airports\/tsf-like\.yaml, id: /);
    expect(issuesOf(() => parseScenarioText(text))).toEqual([
      'extends: the scenario extends an airport configuration; load it from its file',
    ]);
    const airportText = readFileSync(new URL('airports/tsf-like.yaml', root), 'utf8');
    expect(issuesOf(() => parseScenarioText(airportText))).toEqual([
      'kind: this is an airport configuration, not a scenario; simulate one of the scenarios that extend it',
    ]);
  });

  it('checks the lanes against what the checkpoint has', () => {
    const scenario = loadDay('tsf-like-peak-day');
    const tooMany = {
      ...scenario,
      checkpoint: {
        ...scenario.checkpoint,
        laneSchedule: { value: [{ from: '00:00', lanes: 6 }], source: 'SYNTHETIC' },
      },
    } satisfies Scenario;
    expect(issuesOf(() => parseScenario(tooMany))).toEqual([
      'checkpoint.laneSchedule.value.0.lanes: 6 lanes planned, but the checkpoint has 5',
    ]);
    const neither = Object.fromEntries(
      Object.entries(scenario.checkpoint).filter(
        ([key]) => key !== 'laneSchedule' && key !== 'lanePlanRule',
      ),
    );
    expect(issuesOf(() => parseScenario({ ...scenario, checkpoint: neither }))).toEqual([
      'checkpoint.laneSchedule: give checkpoint.laneSchedule, or checkpoint.lanePlanRule to plan it',
    ]);
  });

  it('composes airport defaults, then the checkpoint, then the day', () => {
    const airport = parseAirport({
      schemaVersion: 1,
      kind: 'airport',
      id: 'test-airport',
      name: 'Test',
      description: 'Test airport',
      dataClassification: 'SYNTHETIC',
      timeZone: 'Europe/Rome',
      dataSources: [
        { id: 'a', title: 'A', kind: 'SYNTHETIC', provider: 'GateFlow', licence: 'Ours.' },
      ],
      defaults: { passengers: { transferShare: { value: 0.1, source: 'SYNTHETIC' } } },
      checkpoints: [
        {
          id: 'main',
          title: 'Main',
          kind: 'DEPARTURE_SECURITY',
          scenario: { passengers: { transferShare: { value: 0.2, source: 'SYNTHETIC' } } },
        },
      ],
    });
    const composed = composeScenario(
      airport,
      {
        extends: { airport: 'x.yaml', checkpoint: 'main' },
        id: 'day',
        dataSources: [
          { id: 'b', title: 'B', kind: 'SYNTHETIC', provider: 'GateFlow', licence: 'Ours.' },
        ],
        passengers: { loadFactor: { value: 1, source: 'SYNTHETIC' } },
      },
      { file: 'x.yaml', sha256: 'ab'.repeat(32) },
    );
    expect(composed).toEqual({
      schemaVersion: 5,
      dataClassification: 'SYNTHETIC',
      timeZone: 'Europe/Rome',
      checkpoint: { id: 'main', kind: 'DEPARTURE_SECURITY' },
      id: 'day',
      passengers: {
        transferShare: { value: 0.2, source: 'SYNTHETIC' },
        loadFactor: { value: 1, source: 'SYNTHETIC' },
      },
      dataSources: [
        { id: 'a', title: 'A', kind: 'SYNTHETIC', provider: 'GateFlow', licence: 'Ours.' },
        { id: 'b', title: 'B', kind: 'SYNTHETIC', provider: 'GateFlow', licence: 'Ours.' },
      ],
      airport: {
        id: 'test-airport',
        name: 'Test',
        checkpoint: 'main',
        file: 'x.yaml',
        sha256: 'ab'.repeat(32),
      },
    });
  });
});
