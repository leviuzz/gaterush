export { ScenarioSchema, SOURCE_LABELS, clockMinutes } from './schema';
export type { Scenario, SourceLabel } from './schema';
export { ScenarioValidationError, parseScenario, parseScenarioText } from './parse';
export { canonicalJson } from './canonical';
export { collectAssumptions } from './assumptions';
export type { Assumption } from './assumptions';
export { GENERATOR_VERSION, generatePopulation, generateSchedule } from './generate';
export type { ScheduledFlight } from './generate';

/** Version of the scenario schema understood by this package. */
export const SCENARIO_SCHEMA_VERSION = 3;
