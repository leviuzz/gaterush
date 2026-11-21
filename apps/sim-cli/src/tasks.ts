import { runDay, runSweepDay } from '@gateflow/sim-metrics';
import type { DayJob, SeedResult, SweepDayJob, SweepDayResult } from '@gateflow/sim-metrics';

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

export type Task = ExperimentDayTask | SweepDayTask;
export type TaskResult =
  | { readonly kind: 'experiment-day'; readonly day: SeedResult }
  | { readonly kind: 'sweep-day'; readonly day: SweepDayResult };

export function runTask(task: Task): TaskResult {
  switch (task.kind) {
    case 'experiment-day':
      return { kind: task.kind, day: runDay(task.job, task.seed) };
    case 'sweep-day':
      return { kind: task.kind, day: runSweepDay(task.job, task.seed) };
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
