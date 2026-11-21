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

/** Validates already-parsed data against the scenario schema. */
export function parseScenario(data: unknown): Scenario {
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
