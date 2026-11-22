/** Version of the forecasts (S21). Bump on any change to a forecast or to its errors. */
export const FORECAST_VERSION = '0.1.0';

export {
  BUCKET_MS,
  FORECAST_SEED,
  ForecastError,
  HORIZONS_MIN,
  PATHS_PER_DAY,
  SCALE_FADE_MIN,
  SPAN_MS,
  arrivalScale,
  bandOf,
  expectedLastHour,
  forecastFrom,
  plannedLanesAt,
  quantile,
} from './forecast';
export type {
  Band,
  CheckpointProfile,
  Forecast,
  ForecastBucket,
  ForecastHorizon,
  LiveState,
  PlannedLanes,
} from './forecast';
export { QUANTITIES, errorSummary, isBusy } from './errors';
export type { ErrorSummary, Observation, Quantity } from './errors';
