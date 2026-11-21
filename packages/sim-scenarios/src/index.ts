export { FlightRowSchema, ScenarioSchema, SOURCE_LABELS, clockMinutes } from './schema';
export type {
  DataSource,
  FairnessTarget,
  FlightRow,
  GateflowSettings,
  LanePlanRule,
  Scenario,
  ScenarioInput,
  SourceLabel,
  TodayPractice,
} from './schema';
export { AirportSchema, composeScenario, mergeScenarioParts, parseAirport } from './airport';
export type { Airport } from './airport';
export { expectedWorkByInterval, planLanes, withLaneSchedule } from './lane-plan';
export { ScenarioValidationError } from './errors';
export { parseScenario, parseScenarioText } from './parse';
export type { ScenarioFiles } from './parse';
export { canonicalJson } from './canonical';
export { collectAssumptions } from './assumptions';
export type { Assumption } from './assumptions';
export { GENERATOR_VERSION, generatePopulation, generateSchedule } from './generate';
export type { ScheduledFlight } from './generate';
export {
  FLIGHTS_FORMAT,
  FLIGHT_COLUMNS,
  designDayRows,
  formatFlightCsv,
  parseFlightCsv,
} from './flights-csv';

/** Version of the scenario schema understood by this package. */
export const SCENARIO_SCHEMA_VERSION = 5;
