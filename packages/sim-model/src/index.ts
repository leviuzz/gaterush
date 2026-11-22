/** Version of the checkpoint model. Bump on any change that can alter simulated outcomes. */
export const MODEL_VERSION = '0.7.0';

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
  LaneAdvisor,
  LaneOutage,
  LaneRecommendation,
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
  TapeEntry,
} from './types';
