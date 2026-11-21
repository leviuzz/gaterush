/** Version of the checkpoint model. Bump on any change that can alter simulated outcomes. */
export const MODEL_VERSION = '0.3.0';

export {
  PopulationError,
  firstCallDelayMs,
  simulateCheckpoint,
  validatePopulation,
} from './checkpoint';
export type {
  CheckpointSpec,
  LaneScheduleEntry,
  PassengerOutcome,
  PassengerPath,
  Population,
  RunResult,
  RunStats,
  SimFlight,
  SimPassenger,
  SimulationOptions,
} from './types';
