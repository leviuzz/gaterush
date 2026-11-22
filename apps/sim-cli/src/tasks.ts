import type { Calibration, PitSets } from '@gateflow/forecast';
import { backtestDay, calibrationDay, runDay, runSweepDay } from '@gateflow/sim-metrics';
import type {
  BacktestJob,
  BacktestObservation,
  DayJob,
  SeedResult,
  SweepDayJob,
  SweepDayResult,
} from '@gateflow/sim-metrics';

/**
 * Work that can run in a worker thread: a pure computation on structured-clonable data, whose
 * result depends on the task alone (never on the thread or on the order of execution).
 */
export interface ExperimentDayTask {
  readonly kind: 'experiment-day';
  readonly job: DayJob;
  readonly seed: number;
}

/** One simulated day of one variant of a sensitivity sweep. */
export interface SweepDayTask {
  readonly kind: 'sweep-day';
  readonly job: SweepDayJob;
  readonly seed: number;
}

/** One simulated day of a backtest of the forecasts (S21), calibrated or not (S21.3). */
export interface BacktestDayTask {
  readonly kind: 'backtest-day';
  readonly job: BacktestJob;
  readonly seed: number;
  readonly calibration?: Calibration;
}

/** One simulated day of a calibration of the forecasts' bands (S21.3). */
export interface CalibrationDayTask {
  readonly kind: 'calibration-day';
  readonly job: BacktestJob;
  readonly seed: number;
}

export type Task = ExperimentDayTask | SweepDayTask | BacktestDayTask | CalibrationDayTask;
export type TaskResult =
  | { readonly kind: 'experiment-day'; readonly day: SeedResult }
  | { readonly kind: 'sweep-day'; readonly day: SweepDayResult }
  | { readonly kind: 'backtest-day'; readonly day: readonly BacktestObservation[] }
  | { readonly kind: 'calibration-day'; readonly day: PitSets };

export function runTask(task: Task): TaskResult {
  switch (task.kind) {
    case 'experiment-day':
      return { kind: task.kind, day: runDay(task.job, task.seed) };
    case 'sweep-day':
      return { kind: task.kind, day: runSweepDay(task.job, task.seed) };
    case 'backtest-day':
      return { kind: task.kind, day: backtestDay(task.job, task.seed, task.calibration) };
    case 'calibration-day':
      return { kind: task.kind, day: calibrationDay(task.job, task.seed) };
  }
}

/** Runs tasks one after the other in this thread; results in task order. */
export function runTasksHere(
  tasks: readonly Task[],
  onDone?: (done: number, total: number) => void,
): TaskResult[] {
  return tasks.map((task, i) => {
    const result = runTask(task);
    onDone?.(i + 1, tasks.length);
    return result;
  });
}
