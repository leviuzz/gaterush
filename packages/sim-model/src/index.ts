/** Version of the checkpoint model. Bump on any change that can alter simulated outcomes. */
export const MODEL_VERSION = '0.5.0';

export {
  PopulationError,
  firstCallDelayMs,
  openLanesAt,
  simulateCheckpoint,
  trueWalkMs,
  validatePopulation,
} from './checkpoint';
export type {
  CheckpointSpec,
  FeedOutage,
  FlightUpdate,
  GateChange,
  LaneOutage,
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
