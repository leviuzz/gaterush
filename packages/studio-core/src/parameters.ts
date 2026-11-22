import {
  ScenarioValidationError,
  collectAssumptions,
  parseScenario,
} from '@gateflow/sim-scenarios';
import type { Assumption, Scenario, SourceLabel } from '@gateflow/sim-scenarios';

/** A new value for a labelled parameter, with the source the person editing it gives. */
export interface ParameterChange {
  readonly value: unknown;
  readonly source: SourceLabel;
  readonly note?: string;
  /** Data source of the scenario the value comes from (`dataSources[].id`), if any. */
  readonly ref?: string;
}

/** Every labelled parameter of the scenario, in document order (the assumptions of a report). */
export function scenarioParameters(scenario: Scenario): Assumption[] {
  return collectAssumptions(scenario);
}

/** The object of a labelled parameter (`{ value, source, ... }`) at a dotted path, if any. */
function parameterAt(root: unknown, path: string): Record<string, unknown> | undefined {
  let node = root;
  for (const part of path.split('.')) {
    if (typeof node !== 'object' || node === null) return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  if (typeof node !== 'object' || node === null || Array.isArray(node)) return undefined;
  return 'value' in node ? node : undefined;
}

/** A deep copy of a scenario as plain data, to change and validate again. */
export function scenarioCopy(scenario: Scenario): Record<string, unknown> {
  return JSON.parse(JSON.stringify(scenario)) as Record<string, unknown>;
}

/**
 * The scenario with one labelled parameter changed, validated again: a `ScenarioValidationError`
 * lists what is wrong. The value replaces the old one as a whole, with the source and note given
 * (a reference to a data source is kept only when given again).
 */
export function withParameter(scenario: Scenario, path: string, change: ParameterChange): Scenario {
  const copy = scenarioCopy(scenario);
  const parameter = parameterAt(copy, path);
  if (parameter === undefined) {
    throw new ScenarioValidationError([`${path}: the scenario has no such parameter`]);
  }
  parameter.value = change.value;
  parameter.source = change.source;
  if (change.ref === undefined) delete parameter.ref;
  else parameter.ref = change.ref;
  if (change.note === undefined || change.note === '') delete parameter.note;
  else parameter.note = change.note;
  return parseScenario(copy);
}

/** Labelled parameters whose value differs between two scenarios (absent on one side: `undefined`). */
export function changedParameters(
  a: Scenario,
  b: Scenario,
): { readonly path: string; readonly before: unknown; readonly after: unknown }[] {
  const before = new Map(collectAssumptions(a).map((p) => [p.path, p.value]));
  const after = new Map(collectAssumptions(b).map((p) => [p.path, p.value]));
  const paths = [...new Set([...before.keys(), ...after.keys()])];
  return paths
    .filter((path) => JSON.stringify(before.get(path)) !== JSON.stringify(after.get(path)))
    .map((path) => ({ path, before: before.get(path), after: after.get(path) }));
}
