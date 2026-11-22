import type {
  DayJob,
  ExperimentConfig,
  ExperimentPlan,
  ResultsDocument,
  SeedResult,
} from '@gateflow/sim-metrics';

/** What the page asks a worker: plan a run, simulate days of a job, or compute the statistics. */
export type WorkerRequest =
  | { readonly type: 'plan'; readonly config: ExperimentConfig }
  | { readonly type: 'job'; readonly job: DayJob }
  | { readonly type: 'day'; readonly index: number; readonly seed: number }
  | {
      readonly type: 'results';
      readonly config: ExperimentConfig;
      readonly days: readonly SeedResult[];
      readonly build: { readonly version: string; readonly commit: string };
    };

/** Answers of a worker. */
export type WorkerReply =
  | { readonly type: 'planned'; readonly plan: ExperimentPlan }
  | { readonly type: 'day'; readonly index: number; readonly day: SeedResult }
  | { readonly type: 'results'; readonly doc: ResultsDocument }
  | { readonly type: 'error'; readonly index: number; readonly message: string };
