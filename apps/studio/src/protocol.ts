import type {
  DayJob,
  ExperimentConfig,
  ExperimentPlan,
  PolicyComparison,
  ResultsDocument,
  SeedResult,
} from '@gateflow/sim-metrics';
import type { TraceDocument } from '@gateflow/sim-trace';

/**
 * What the page asks a worker: plan a run, simulate days of a job, compute the statistics, or
 * trace one day for the replay.
 */
export type WorkerRequest =
  | { readonly type: 'plan'; readonly config: ExperimentConfig }
  | { readonly type: 'job'; readonly job: DayJob }
  | { readonly type: 'day'; readonly index: number; readonly seed: number }
  | {
      readonly type: 'results';
      readonly config: ExperimentConfig;
      readonly days: readonly SeedResult[];
      readonly build: { readonly version: string; readonly commit: string };
    }
  | {
      readonly type: 'trace';
      readonly job: DayJob;
      readonly seed: number;
      readonly comparison: PolicyComparison;
      readonly build: { readonly version: string; readonly commit: string };
    };

/** Answers of a worker. A trace comes first, its fingerprint after it. */
export type WorkerReply =
  | { readonly type: 'planned'; readonly plan: ExperimentPlan }
  | { readonly type: 'day'; readonly index: number; readonly day: SeedResult }
  | { readonly type: 'results'; readonly doc: ResultsDocument }
  | { readonly type: 'traced'; readonly doc: TraceDocument }
  | { readonly type: 'fingerprint'; readonly fingerprint: string }
  | { readonly type: 'error'; readonly index: number; readonly message: string };
