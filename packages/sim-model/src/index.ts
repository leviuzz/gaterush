/** Version of the checkpoint model. Bump on any change that can alter simulated outcomes. */
export const MODEL_VERSION = '0.6.0';

export {
  PopulationError,
  firstCallDelayMs,
  openLanesAt,
  simulateCheckpoint,
  trueWalkMs,
  validatePopulation,
} from './checkpoint';
export type {
  ArrivalForecast,
  CheckpointSpec,
  DayEvent,
  FeedOutage,
  FlightUpdate,
  GateChange,
  LaneOutage,
  LaneScheduleEntry,
  LaneStaffing,
  PassengerOutcome,
  PassengerPath,
  Population,
  RunResult,
  RunStats,
  SimFlight,
  SimPassenger,
  SimulationOptions,
} from './types';
