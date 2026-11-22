/** Version of the forecasts (S21). Bump on any change to a forecast or to its errors. */
export const FORECAST_VERSION = '0.3.0';

export { BUCKET_MS, ForecastError, HORIZONS_MIN, QUANTITIES, SPAN_MS, quantile } from './base';
export type { Band, Quantity } from './base';
export {
  FORECAST_SEED,
  PATHS_PER_DAY,
  SCALE_FADE_MIN,
  arrivalScale,
  bandAt,
  bandOf,
  bandsOf,
  expectedLastHour,
  forecastFrom,
  forecastPaths,
  plannedLanesAt,
} from './forecast';
export type {
  CheckpointProfile,
  CheckpointStaffing,
  Forecast,
  ForecastBucket,
  ForecastHorizon,
  ForecastPaths,
  HorizonPaths,
  LiveState,
  PlannedLanes,
} from './forecast';
export {
  MIN_CALIBRATION_TRUTHS,
  UNCALIBRATED,
  calibrationFrom,
  levelsAt,
  pitOf,
  validateCalibration,
} from './calibration';
export type { Calibration, Levels, PitSets } from './calibration';
export {
  LIBRARY_CALIBRATION,
  LIBRARY_CALIBRATION_SOURCE,
  LIBRARY_CALIBRATION_TRUTHS,
} from './library-calibration';
export { errorSummary, isBusy } from './errors';
export type { ErrorSummary, Observation } from './errors';
export {
  ADVICE_ACTIONS,
  ADVICE_REASONS,
  LANE_ADVICE,
  adviseLanes,
  laneChangePossible,
  roomForLanes,
} from './advice';
export type { AdviceAction, AdviceOptions, AdviceReason, AdviceRule, LaneAdvice } from './advice';
