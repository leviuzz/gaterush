export {
  DEFAULT_BOOTSTRAP,
  ExperimentConfigError,
  assembleExperiment,
  comparisonKey,
  defaultComparisons,
  normaliseSeeds,
  planExperiment,
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
  ManifestInput,
  ResultsDocument,
} from './results';
export { renderReport } from './report';
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
  escapeHtml,
  intervalsSvg,
  lineChartSvg,
  markdownSections,
  markdownToHtml,
  niceTicks,
  rangeBarsSvg,
} from './html';
export type { IntervalRow, LineChartOptions, LineSeries, RangeBar } from './html';
export { renderHtmlReport, renderSweepHtml } from './report-html';
export { acrossDays, bootstrapMeanInterval, mean, quantileSorted, sortedAscending } from './stats';
export type { AcrossDays, BootstrapOptions } from './stats';
export { renderDataSources, scenarioProvenance, sourceLabel } from './provenance';
export type { ScenarioProvenance, ScheduleSummary } from './provenance';
