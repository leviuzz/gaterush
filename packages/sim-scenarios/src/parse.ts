import { parse as parseYaml } from 'yaml';
import { ScenarioSchema } from './schema';
import type { Scenario } from './schema';

/** Thrown when a scenario cannot be parsed or violates the schema. */
export class ScenarioValidationError extends Error {
  readonly issues: readonly string[];

  constructor(issues: readonly string[]) {
    super(`invalid scenario:\n${issues.map((i) => `  - ${i}`).join('\n')}`);
    this.name = 'ScenarioValidationError';
    this.issues = issues;
  }
}

/** Explains how to migrate a scenario written for an older schema version. */
const NO_DISRUPTIONS =
  'disruptions with flightDelays, gateChanges, laneOutages and feedOutages; to keep the earlier ' +
  'behaviour set every share and perDay to 0 (see scenarios/single-checkpoint-demo.yaml)';

const MIGRATIONS: Readonly<Record<number, string>> = {
  1:
    'schemaVersion: version 1 scenarios must be migrated to version 4: set schemaVersion to 4, ' +
    'replace checkpoint.lanes with checkpoint.laneSchedule (e.g. value: [{ from: "00:00", lanes: 6 }]), ' +
    'add passengers.callResponse, passengers.groups, passengers.assistedShare and ' +
    `passengers.strategicLateArrival, and add ${NO_DISRUPTIONS}`,
  2:
    'schemaVersion: version 2 scenarios must be migrated to version 4: set schemaVersion to 4, ' +
    'add passengers.groups, passengers.assistedShare and passengers.strategicLateArrival (to keep ' +
    'the version 2 behaviour use partySizes [{ size: 1, share: 1 }], assistedShare 0 and ' +
    `strategicLateArrival share 0), and add ${NO_DISRUPTIONS}`,
  3: `schemaVersion: version 3 scenarios must be migrated to version 4: set schemaVersion to 4 and add ${NO_DISRUPTIONS}`,
};

/** Validates already-parsed data against the scenario schema. */
export function parseScenario(data: unknown): Scenario {
  if (typeof data === 'object' && data !== null && 'schemaVersion' in data) {
    const version = data.schemaVersion;
    const migration = typeof version === 'number' ? MIGRATIONS[version] : undefined;
    if (migration !== undefined) throw new ScenarioValidationError([migration]);
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
  return result.data;
}

/** Parses and validates a scenario written in YAML (a superset of JSON) or JSON. */
export function parseScenarioText(text: string, format: 'yaml' | 'json' = 'yaml'): Scenario {
  let data: unknown;
  try {
    data = format === 'json' ? JSON.parse(text) : parseYaml(text, { uniqueKeys: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new ScenarioValidationError([`(syntax): ${message}`]);
  }
  return parseScenario(data);
}
