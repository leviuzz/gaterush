import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { validatePopulation } from '@gateflow/sim-model';
import { describe, expect, it } from 'vitest';
import {
  FLIGHT_COLUMNS,
  ScenarioValidationError,
  designDayRows,
  formatFlightCsv,
  generatePopulation,
  generateSchedule,
  parseFlightCsv,
  parseScenario,
  parseScenarioText,
} from '../src';
import type { FlightRow, Scenario, ScenarioFiles } from '../src';

const demo = parseScenarioText(
  readFileSync(new URL('../../../scenarios/single-checkpoint-demo.yaml', import.meta.url), 'utf8'),
);

/** The demo scenario with its design day given as a flight list. */
function asFlightList(base: Scenario, rows: FlightRow[], extra: Record<string, unknown> = {}) {
  return {
    ...base,
    schedule: {
      kind: 'flight-list',
      generatorSeed: base.schedule.generatorSeed,
      flights: { source: 'gateflow-synthetic', rows },
      gateZones: base.schedule.gateZones,
      ...extra,
    },
  };
}

function issuesOf(run: () => unknown): readonly string[] {
  try {
    run();
  } catch (error) {
    if (error instanceof ScenarioValidationError) return error.issues;
    throw error;
  }
  return [];
}

describe('flight list files (gateflow.flights/1)', () => {
  it('reads quoted fields, comments, blank lines, a byte order mark and CRLF line ends', () => {
    const text =
      '﻿# exported for a test\r\n' +
      'flight,std,aircraft,seats,passengers,gate_zone,destination\r\n' +
      '\r\n' +
      'AB123,06:05,A320,180,,A,"Paris, CDG"\r\n' +
      '  # an indented comment\r\n' +
      'CD456 , 07:40 ,B738,,150,B,"The ""Big"" City"\r\n';
    expect(parseFlightCsv(text)).toEqual([
      {
        flight: 'AB123',
        std: '06:05',
        aircraft: 'A320',
        seats: 180,
        gateZone: 'A',
        destination: 'Paris, CDG',
      },
      {
        flight: 'CD456',
        std: '07:40',
        aircraft: 'B738',
        passengers: 150,
        gateZone: 'B',
        destination: 'The "Big" City',
      },
    ]);
  });

  it('accepts columns in any order, only flight and std being required, and semicolons', () => {
    expect(parseFlightCsv('std;flight\n05:55;X1\n')).toEqual([{ flight: 'X1', std: '05:55' }]);
    expect(parseFlightCsv('STD,Flight,Gate_Zone\n23:59,X2,C\n')).toEqual([
      { flight: 'X2', std: '23:59', gateZone: 'C' },
    ]);
  });

  it('reports every problem with its line number', () => {
    expect(issuesOf(() => parseFlightCsv('flight,when,seats\n'))).toEqual([
      'line 1: unknown column "when" (allowed: flight, std, aircraft, seats, passengers, gate_zone, destination)',
      'line 1: missing column "std"',
    ]);
    expect(issuesOf(() => parseFlightCsv('flight,std,std\n'))).toEqual([
      'line 1: column "std" appears twice',
    ]);
    const text = [
      'flight,std,seats',
      'A1,24:00,180',
      'A2,06:00,1a',
      'A3,06:00',
      'A 4,06:10,180',
      'A5,06:20,0',
    ].join('\n');
    expect(issuesOf(() => parseFlightCsv(text))).toEqual([
      'line 2: std: expected a clock time HH:MM between 00:00 and 23:59',
      'line 3: seats: expected a whole number, got "1a"',
      'line 4: 2 fields, expected 3 as in the header',
      'line 5: flight: flight identifiers must not contain spaces',
      'line 6: seats: Too small: expected number to be >=1',
    ]);
    expect(issuesOf(() => parseFlightCsv('flight,std\n"A1,06:00\n'))).toEqual([
      'line 2: a quoted field is not closed',
    ]);
    expect(issuesOf(() => parseFlightCsv('# nothing\n'))).toEqual(['the flight list is empty']);
    expect(issuesOf(() => parseFlightCsv('flight,std\n'))).toEqual([
      'the flight list has no flights',
    ]);
  });

  it('writes what it reads (round trip), quoting where needed', () => {
    const rows: FlightRow[] = [
      { flight: 'A1', std: '06:00', aircraft: 'A320', seats: 180, gateZone: 'A' },
      { flight: 'B2', std: '06:30', passengers: 12, destination: 'Rome; Fiumicino' },
      { flight: '#3', std: '07:00', aircraft: ' odd ', seats: 50 },
    ];
    const text = formatFlightCsv(rows, ['a comment', 'on two\nlines']);
    expect(text.split('\n').slice(0, 3)).toEqual([
      '# a comment',
      '# on two lines',
      FLIGHT_COLUMNS.join(','),
    ]);
    expect(text).toContain('"Rome; Fiumicino"');
    expect(parseFlightCsv(text)).toEqual(rows);
  });
});

describe('flight list scenarios', () => {
  const rows = designDayRows(demo);

  it('reproduce a synthetic design day exactly: same flights, same passengers', () => {
    expect(rows).toHaveLength(40);
    expect(rows[0]).toEqual({
      flight: 'F001',
      std: '06:06',
      aircraft: generateSchedule(demo)[0]!.aircraftCategory,
      seats: generateSchedule(demo)[0]!.seats,
      gateZone: generateSchedule(demo)[0]!.gateZone,
    });
    const fromList = parseScenario(asFlightList(demo, parseFlightCsv(formatFlightCsv(rows))));
    for (const seed of [1, 2, 7]) {
      expect(generatePopulation(fromList, seed)).toEqual(generatePopulation(demo, seed));
    }
    const disrupted = parseScenarioText(
      readFileSync(
        new URL('../../../scenarios/single-checkpoint-disrupted.yaml', import.meta.url),
        'utf8',
      ),
    );
    const disruptedFromList = parseScenario(asFlightList(disrupted, designDayRows(disrupted)));
    expect(generatePopulation(disruptedFromList, 3)).toEqual(generatePopulation(disrupted, 3));
  });

  it('orders flights by departure, keeps the list order at the same minute, draws missing zones', () => {
    const list = parseScenario(
      asFlightList(demo, [
        { flight: 'LATE', std: '09:00', seats: 100 },
        { flight: 'EARLY-1', std: '06:00', seats: 100, gateZone: 'C' },
        { flight: 'EARLY-2', std: '06:00', seats: 100 },
      ]),
    );
    const flights = generateSchedule(list);
    expect(flights.map((f) => f.id)).toEqual(['EARLY-1', 'EARLY-2', 'LATE']);
    expect(flights.map((f) => f.index)).toEqual([0, 1, 2]);
    expect(flights[0]!.gateZone).toBe('C');
    expect(flights[0]!.walkEstimateMs).toBe(14 * 60_000);
    // The same draws whatever the replication: the design day is fixed.
    expect(generatePopulation(list, 1).flights).toEqual(generatePopulation(list, 2).flights);
    expect(new Set(['A', 'B', 'C'])).toContain(flights[2]!.gateZone);
  });

  it('takes seats from the aircraft type, and fixed passenger counts when the list gives them', () => {
    const list = parseScenario(
      asFlightList(
        demo,
        [
          { flight: 'T1', std: '06:00', aircraft: 'A320', gateZone: 'A' },
          { flight: 'T2', std: '06:10', aircraft: 'A320', seats: 150, gateZone: 'A' },
          { flight: 'T3', std: '06:20', aircraft: 'XYZ', passengers: 42, gateZone: 'B' },
        ],
        { seats: { value: [{ aircraft: 'A320', seats: 186 }], source: 'SYNTHETIC' } },
      ),
    );
    const flights = generateSchedule(list);
    expect(flights.map((f) => f.seats)).toEqual([186, 150, 42]);
    for (const seed of [1, 2, 3]) {
      const people = (flightIndex: number) =>
        generatePopulation(list, seed)
          .passengers.filter((p) => p.flightIndex === flightIndex)
          .reduce((sum, p) => sum + p.partySize, 0);
      expect(people(2)).toBe(42);
      expect(people(0)).toBeLessThanOrEqual(Math.round(186 * 0.98));
      expect(people(0)).toBeGreaterThanOrEqual(Math.round(186 * 0.6));
    }
    expect(designDayRows(list)[2]).toEqual({
      flight: 'T3',
      std: '06:20',
      aircraft: 'XYZ',
      seats: 42,
      passengers: 42,
      gateZone: 'B',
    });
  });

  it('rejects lists the simulator cannot use, naming the flight', () => {
    const issues = issuesOf(() =>
      parseScenario(
        asFlightList(
          demo,
          [
            { flight: 'D1', std: '06:00', seats: 100 },
            { flight: 'D1', std: '07:00', seats: 100 },
            { flight: 'Z1', std: '07:00', seats: 100, gateZone: 'Q' },
            { flight: 'U1', std: '07:10', aircraft: 'B744' },
            { flight: 'N1', std: '07:20' },
            { flight: 'P1', std: '07:30', seats: 100, passengers: 120 },
          ],
          { seats: { value: [{ aircraft: 'A320', seats: 186 }], source: 'SYNTHETIC' } },
        ),
      ),
    );
    expect(issues).toEqual([
      'schedule.flights.rows.1.flight: duplicate flight D1',
      'schedule.flights.rows.2.gateZone: flight Z1: unknown gate zone "Q" (known: A, B, C)',
      'schedule.flights.rows.3: flight U1: no seats for aircraft type "B744" (give seats in the file or add the type to schedule.seats)',
      'schedule.flights.rows.4: flight N1: give passengers, seats or an aircraft type',
      'schedule.flights.rows.5.passengers: flight P1: 120 passengers exceed the 100 seats',
    ]);
    expect(
      issuesOf(() =>
        parseScenario({
          ...asFlightList(demo, rows),
          schedule: {
            ...asFlightList(demo, rows).schedule,
            flights: { source: 'elsewhere', rows },
          },
        }),
      ),
    ).toEqual([
      'schedule.flights.source: unknown data source "elsewhere" (known: gateflow-synthetic)',
    ]);
  });

  it('reads the file a scenario names, with its hash, through the caller', () => {
    const csv = formatFlightCsv(rows);
    const yaml = readFileSync(
      new URL('../../../scenarios/single-checkpoint-demo.yaml', import.meta.url),
      'utf8',
    );
    const schedule = [
      'schedule:',
      '  kind: flight-list',
      '  generatorSeed: 20261121',
      '  flights:',
      '    source: gateflow-synthetic',
      '    file: flights/demo.csv',
      '  gateZones:',
      '    value:',
      '      - { id: A, walkMinutes: 4, share: 0.4 }',
      '      - { id: B, walkMinutes: 8, share: 0.4 }',
      '      - { id: C, walkMinutes: 14, share: 0.2 }',
      '    source: SYNTHETIC',
      '',
    ].join('\n');
    const text = yaml.replace(/^schedule:\n(?: .*\n|\n)*?(?=^passengers:)/m, schedule);
    expect(text).toContain('file: flights/demo.csv');
    const read: string[] = [];
    const files: ScenarioFiles = {
      read: (path) => {
        read.push(path);
        return csv;
      },
      sha256: (content) => (content === csv ? 'ab'.repeat(32) : 'unexpected'),
    };
    const scenario = parseScenarioText(text, 'yaml', files);
    expect(read).toEqual(['flights/demo.csv']);
    expect(scenario.schedule.kind === 'flight-list' && scenario.schedule.flights.sha256).toBe(
      'ab'.repeat(32),
    );
    expect(generatePopulation(scenario, 5)).toEqual(generatePopulation(demo, 5));

    // Without access to files the rows are missing, and the error says why.
    expect(issuesOf(() => parseScenarioText(text))).toEqual([
      'schedule.flights.rows: the flight list flights/demo.csv has not been read; load the scenario from its file',
    ]);
    // Problems of the file come with its name and line numbers.
    const broken: ScenarioFiles = { read: () => 'flight,std\nX,25:00\n', sha256: () => 'x' };
    expect(issuesOf(() => parseScenarioText(text, 'yaml', broken))).toEqual([
      'flight list flights/demo.csv, line 2: std: expected a clock time HH:MM between 00:00 and 23:59',
    ]);
    const missing: ScenarioFiles = {
      read: () => {
        throw new Error('ENOENT');
      },
      sha256: () => 'x',
    };
    expect(issuesOf(() => parseScenarioText(text, 'yaml', missing))).toEqual([
      'schedule.flights.file: cannot read flights/demo.csv: ENOENT',
    ]);
  });
});

describe('scenario library (S7)', () => {
  const library = new URL('../../../scenarios/', import.meta.url);
  const load = (id: string) =>
    parseScenarioText(readFileSync(new URL(`${id}.yaml`, library), 'utf8'), 'yaml', {
      read: (path) => readFileSync(new URL(path, library), 'utf8'),
      sha256: (text) => createHash('sha256').update(text, 'utf8').digest('hex'),
    });

  it('has flight lists that match their generator', () => {
    const script = fileURLToPath(new URL('flights/make-library-flights.mjs', library));
    const check = spawnSync(process.execPath, [script, '--check'], { encoding: 'utf8' });
    expect(check.stderr).toBe('');
    expect(check.status).toBe(0);
  });

  it.each([
    ['vce-like-normal-day', 116, 'DEPARTURE_SECURITY', 16_000, 17_400],
    ['vce-like-peak-day', 138, 'DEPARTURE_SECURITY', 21_000, 22_700],
    ['vce-like-disrupted-day', 138, 'DEPARTURE_SECURITY', 21_000, 22_700],
    ['tsf-like-peak-day', 34, 'DEPARTURE_SECURITY', 5_600, 6_400],
    ['mx-like-transfer-hub', 58, 'TRANSFER_SECURITY', 4_473, 4_473],
  ])('%s: %i flights from its CSV file, sized as stated', (id, flights, kind, min, max) => {
    const scenario = load(id);
    expect(scenario.id).toBe(id);
    expect(scenario.dataClassification).toBe('SYNTHETIC');
    expect(scenario.checkpoint.kind).toBe(kind);
    expect(scenario.dataSources.map((s) => s.id)).toContain('library-flights');
    if (scenario.schedule.kind !== 'flight-list') throw new Error('expected a flight list');
    expect(scenario.schedule.flights.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(generateSchedule(scenario)).toHaveLength(flights);
    const population = generatePopulation(scenario, 1);
    expect(() => {
      validatePopulation(population);
    }).not.toThrow();
    const people = population.passengers.reduce((sum, p) => sum + p.partySize, 0);
    expect(people).toBeGreaterThanOrEqual(min);
    expect(people).toBeLessThanOrEqual(max);
  });

  it('gives the disrupted day the passengers and lanes of the peak day', () => {
    const peak = load('vce-like-peak-day');
    const disrupted = load('vce-like-disrupted-day');
    expect(disrupted.checkpoint).toEqual(peak.checkpoint);
    for (const seed of [1, 2]) {
      expect(generatePopulation(disrupted, seed).passengers).toEqual(
        generatePopulation(peak, seed).passengers,
      );
    }
  });
});
