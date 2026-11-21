import { parse as parseYaml } from 'yaml';
import { composeScenario, parseAirport, scenarioExtends } from './airport';
import { ScenarioValidationError } from './errors';
import { parseFlightCsv } from './flights-csv';
import { withLaneSchedule } from './lane-plan';
import { ScenarioSchema } from './schema';
import type { Scenario } from './schema';

export { ScenarioValidationError } from './errors';

/** Explains how to migrate a scenario written for an older schema version. */
const NO_DISRUPTIONS =
  'disruptions with flightDelays, gateChanges, laneOutages and feedOutages; to keep the earlier ' +
  'behaviour set every share and perDay to 0';
const DATA_SOURCES =
  'dataSources, the list of the sources of its data with their licence (for a synthetic ' +
  'scenario: [{ id: gateflow-synthetic, title: ..., kind: SYNTHETIC, provider: GateFlow, ' +
  'licence: ... }]); see scenarios/single-checkpoint-demo.yaml';

const MIGRATIONS: Readonly<Record<number, string>> = {
  1:
    'schemaVersion: version 1 scenarios must be migrated to version 5: set schemaVersion to 5, ' +
    'replace checkpoint.lanes with checkpoint.laneSchedule (e.g. value: [{ from: "00:00", lanes: 6 }]), ' +
    'add passengers.callResponse, passengers.groups, passengers.assistedShare and ' +
    `passengers.strategicLateArrival, add ${NO_DISRUPTIONS}, and add ${DATA_SOURCES}`,
  2:
    'schemaVersion: version 2 scenarios must be migrated to version 5: set schemaVersion to 5, ' +
    'add passengers.groups, passengers.assistedShare and passengers.strategicLateArrival (to keep ' +
    'the version 2 behaviour use partySizes [{ size: 1, share: 1 }], assistedShare 0 and ' +
    `strategicLateArrival share 0), add ${NO_DISRUPTIONS}, and add ${DATA_SOURCES}`,
  3: `schemaVersion: version 3 scenarios must be migrated to version 5: set schemaVersion to 5, add ${NO_DISRUPTIONS}, and add ${DATA_SOURCES}`,
  4: `schemaVersion: version 4 scenarios must be migrated to version 5: set schemaVersion to 5 and add ${DATA_SOURCES}`,
};

/** A flight list file that was named but not read (the rows are missing). */
function unreadFlightFile(data: object): string | undefined {
  const schedule = (data as { schedule?: unknown }).schedule;
  if (typeof schedule !== 'object' || schedule === null) return undefined;
  const { kind, flights } = schedule as { kind?: unknown; flights?: unknown };
  if (kind !== 'flight-list' || typeof flights !== 'object' || flights === null) return undefined;
  const { file, rows } = flights as { file?: unknown; rows?: unknown };
  return typeof file === 'string' && rows === undefined ? file : undefined;
}

/** Validates already-parsed data against the scenario schema. */
export function parseScenario(data: unknown): Scenario {
  if (typeof data === 'object' && data !== null && 'kind' in data && data.kind === 'airport') {
    throw new ScenarioValidationError([
      'kind: this is an airport configuration, not a scenario; simulate one of the scenarios that extend it',
    ]);
  }
  if (typeof data === 'object' && data !== null && 'schemaVersion' in data) {
    const version = data.schemaVersion;
    const migration = typeof version === 'number' ? MIGRATIONS[version] : undefined;
    if (migration !== undefined) throw new ScenarioValidationError([migration]);
  }
  if (typeof data === 'object' && data !== null) {
    if ('extends' in data) {
      throw new ScenarioValidationError([
        'extends: the scenario extends an airport configuration; load it from its file',
      ]);
    }
    const file = unreadFlightFile(data);
    if (file !== undefined) {
      throw new ScenarioValidationError([
        `schedule.flights.rows: the flight list ${file} has not been read; load the scenario from its file`,
      ]);
    }
  }
  const result = ScenarioSchema.safeParse(data);
  if (!result.success) {
    throw new ScenarioValidationError(
      result.error.issues.map((issue) => {
        const path = issue.path.map(String).join('.');
        return `${path === '' ? '(root)' : path}: ${issue.message}`;
      }),
    );
  }
  return withLaneSchedule(result.data);
}

/**
 * Access to the files a scenario names (its flight list), relative to the scenario file. The
 * package does no I/O itself: the caller reads the files and computes their hashes.
 */
export interface ScenarioFiles {
  read(path: string): string;
  sha256(text: string): string;
}

/** Reads the flight list file named by a scenario into its rows, with the file's hash. */
function readFlightFile(data: unknown, files: ScenarioFiles): void {
  if (typeof data !== 'object' || data === null) return;
  const file = unreadFlightFile(data);
  if (file === undefined) return;
  const flights = (data as { schedule: { flights: Record<string, unknown> } }).schedule.flights;
  let text: string;
  try {
    text = files.read(file);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new ScenarioValidationError([`schedule.flights.file: cannot read ${file}: ${message}`]);
  }
  try {
    flights.rows = parseFlightCsv(text);
  } catch (error) {
    if (error instanceof ScenarioValidationError) {
      throw new ScenarioValidationError(error.issues.map((i) => `flight list ${file}, ${i}`));
    }
    throw error;
  }
  flights.sha256 = files.sha256(text);
}

function parseText(text: string, format: 'yaml' | 'json'): unknown {
  try {
    return format === 'json' ? JSON.parse(text) : parseYaml(text, { uniqueKeys: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new ScenarioValidationError([`(syntax): ${message}`]);
  }
}

/**
 * Composes a scenario that extends an airport configuration (read through `files`, relative to
 * the scenario file) with that configuration. Problems of the airport file name it.
 */
function composeWithAirport(data: unknown, files: ScenarioFiles): unknown {
  const ext = scenarioExtends(data);
  if (ext === undefined) return data;
  let text: string;
  try {
    text = files.read(ext.airport);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new ScenarioValidationError([`extends.airport: cannot read ${ext.airport}: ${message}`]);
  }
  let airport;
  try {
    airport = parseAirport(
      parseText(text, ext.airport.toLowerCase().endsWith('.json') ? 'json' : 'yaml'),
    );
  } catch (error) {
    if (error instanceof ScenarioValidationError) {
      throw new ScenarioValidationError(error.issues.map((i) => `airport ${ext.airport}, ${i}`));
    }
    throw error;
  }
  return composeScenario(airport, data as Record<string, unknown>, {
    file: ext.airport,
    sha256: files.sha256(text),
  });
}

/**
 * Parses and validates a scenario written in YAML (a superset of JSON) or JSON. With `files`, the
 * airport configuration a scenario extends and the flight list file it names are read and
 * included in the scenario.
 */
export function parseScenarioText(
  text: string,
  format: 'yaml' | 'json' = 'yaml',
  files?: ScenarioFiles,
): Scenario {
  let data = parseText(text, format);
  if (files !== undefined) {
    data = composeWithAirport(data, files);
    readFlightFile(data, files);
  }
  return parseScenario(data);
}
