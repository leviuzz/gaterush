/** Version of the checkpoint model. Bump on any change that can alter simulated outcomes. */
export const MODEL_VERSION = '0.1.0';

export { PopulationError, simulateCheckpoint, validatePopulation } from './checkpoint';
export type {
  CheckpointSpec,
  PassengerOutcome,
  Population,
  RunResult,
  RunStats,
  SimFlight,
  SimPassenger,
  SimulationOptions,
} from './types';
