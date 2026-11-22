export {
  DEFAULT_BOOTSTRAP,
  ExperimentConfigError,
  assembleExperiment,
  comparisonKey,
  dayPopulation,
  defaultComparisons,
  forecastFor,
  needsForecast,
  normaliseSeeds,
  planExperiment,
  resolveComparisons,
  runDay,
  runExperiment,
} from './experiment';
export type {
  BootstrapSettings,
  DayJob,
  ExperimentConfig,
  ExperimentPlan,
  ExperimentResult,
  PolicyComparison,
  SeedResult,
} from './experiment';
export { arrivalClassification, recommendedComparisons } from './setup';
export { comparisonDayMetrics, dayDisruptions, policyDayMetrics } from './day-metrics';
export type { ComparisonDayMetrics, DayDisruptions, PolicyDayMetrics } from './day-metrics';
export {
  DISCLAIMER,
  MODEL_LIMITATIONS,
  RESULTS_SCHEMA,
  buildResults,
  formatSeedRanges,
  roundNumbers,
  stringifyResults,
} from './results';
export type {
  ComparisonMetricSummary,
  ComparisonSummary,
  ExtraLaneHourBenefit,
  ManifestInput,
  RatioSummary,
  ResultsDocument,
} from './results';
export { renderReport } from './report';
export { experimentFromManifest, fingerprintMaterial, parseSeedRanges } from './reproduce';
export type { ExperimentManifest, ManifestLimits } from './reproduce';
export {
  SWEEP_PARAMETERS,
  SweepConfigError,
  applySetting,
  assembleSweep,
  planSweep,
  runSweep,
  runSweepDay,
  sweepDayJob,
} from './sweep';
export type {
  SweepConfig,
  SweepDayJob,
  SweepDayResult,
  SweepDimension,
  SweepParameter,
  SweepPlan,
  SweepPoint,
  SweepResult,
  SweepRunDay,
  SweepSetting,
  SweepValue,
  SweepVariant,
} from './sweep';
export {
  SWEEP_COMPARISON_METRICS,
  SWEEP_POLICY_METRICS,
  SWEEP_SCHEMA,
  buildSweepResults,
  stringifySweep,
  sweepValueLabel,
} from './sweep-results';
export type {
  SweepComparisonMetric,
  SweepComparisonSummary,
  SweepDimensionSummary,
  SweepDocument,
  SweepManifestInput,
  SweepPointSummary,
  SweepPolicyMetric,
} from './sweep-results';
export { SWEEP_PARAMETER_LABELS, harmComparisonKey, renderSweepReport } from './sweep-report';
export {
  REPORT_CONTENT_STYLE,
  REPORT_TOKENS_DARK,
  REPORT_TOKENS_LIGHT,
  escapeHtml,
  intervalsSvg,
  lineChartSvg,
  markdownSections,
  markdownToHtml,
  niceTicks,
  rangeBarsSvg,
} from './html';
export type { IntervalRow, LineChartOptions, LineSeries, RangeBar } from './html';
export { renderHtmlReport, renderHtmlReportBody, renderSweepHtml } from './report-html';
export {
  acrossDays,
  bootstrapMeanInterval,
  bootstrapRatioInterval,
  mean,
  quantileSorted,
  sortedAscending,
} from './stats';
export type { AcrossDays, BootstrapOptions } from './stats';
export { renderDataSources, scenarioProvenance, sourceLabel } from './provenance';
export type { AirportSummary, ScenarioProvenance, ScheduleSummary } from './provenance';
export { applyScenarioSettings, differencesFromPreset } from './policy-settings';
export type { PresetDifference } from './policy-settings';
export {
  BACKTEST_SCHEMA,
  ORIGIN_EVERY_MS,
  SimulatedDay,
  arrivalsByBucket,
  backtestDay,
  buildBacktest,
  checkpointProfile,
  planBacktest,
  profileOf,
  renderBacktestReport,
  stringifyBacktest,
  summariseBacktest,
} from './backtest';
export type {
  BacktestDocument,
  BacktestJob,
  BacktestObservation,
  BacktestSummary,
  HorizonErrors,
} from './backtest';
