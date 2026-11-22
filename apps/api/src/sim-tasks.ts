import { Worker } from 'node:worker_threads';
import type { MessagePort } from 'node:worker_threads';
import {
  assembleExperiment,
  buildResults,
  fingerprintMaterial,
  planExperiment,
  runDay,
  stringifyResults,
} from '@gateflow/sim-metrics';
import type {
  DayJob,
  ExperimentConfig,
  ExperimentPlan,
  ManifestInput,
  SeedResult,
} from '@gateflow/sim-metrics';
import { sha256 } from './chain';

/*
 * The work of a simulation (S19, ADR-052), in three kinds of task: the plan (the checks and the
 * forecast of arrivals, once), each simulated day, and the end (the statistics and the results
 * document). Each is a pure computation on data that can be copied to a thread: the API runs them
 * on worker threads of its own bundle, so that a long simulation never holds up the live
 * checkpoints, or in its own thread between requests when it runs from source (tests). The
 * results do not depend on where or in what order the days were simulated.
 */

/** `workerData` of the threads that simulate: they run the API's bundle again. */
export const SIM_WORKER_MARKER = 'gateflow-api-sim-worker';

export type SimTask =
  | { readonly kind: 'plan'; readonly config: ExperimentConfig }
  | { readonly kind: 'day'; readonly job: DayJob; readonly seed: number }
  | {
      readonly kind: 'finish';
      readonly config: ExperimentConfig;
      readonly days: readonly SeedResult[];
      readonly input: ManifestInput;
    };

/** The results of a simulation as stored: the file, its SHA-256 and the results' fingerprint. */
export interface FinishedResults {
  readonly text: string;
  readonly sha256: string;
  readonly fingerprint: string;
}

export type SimTaskResult =
  | { readonly kind: 'plan'; readonly plan: ExperimentPlan }
  | { readonly kind: 'day'; readonly day: SeedResult }
  | { readonly kind: 'finish'; readonly results: FinishedResults };

/** The results of an experiment: the document as the CLI writes it, its hash and fingerprint. */
export function finishResults(
  config: ExperimentConfig,
  days: readonly SeedResult[],
  input: ManifestInput,
): FinishedResults {
  const text = stringifyResults(buildResults(assembleExperiment(config, days), input));
  return { text, sha256: sha256(text), fingerprint: sha256(fingerprintMaterial(text)) };
}

export function runSimTask(task: SimTask): SimTaskResult {
  switch (task.kind) {
    case 'plan':
      return { kind: 'plan', plan: planExperiment(task.config) };
    case 'day':
      return { kind: 'day', day: runDay(task.job, task.seed) };
    case 'finish':
      return { kind: 'finish', results: finishResults(task.config, task.days, task.input) };
  }
}

/** Thrown when a simulation was stopped: cancelled, taken by another server, or the server stops. */
export class SimulationAborted extends Error {
  constructor() {
    super('the simulation was stopped');
    this.name = 'SimulationAborted';
  }
}

interface Request {
  readonly index: number;
  readonly task: SimTask;
}

interface Reply {
  readonly index: number;
  readonly result?: SimTaskResult;
  readonly error?: string;
}

/** Where the tasks of a simulation run. */
export interface SimExecutor {
  run(
    tasks: readonly SimTask[],
    signal: AbortSignal,
    onDone?: (done: number, total: number) => void,
  ): Promise<SimTaskResult[]>;
}

/** Runs the tasks in this thread, one after the other, letting requests in between. */
export const inThisThread: SimExecutor = {
  async run(tasks, signal, onDone) {
    const results: SimTaskResult[] = [];
    for (const task of tasks) {
      await new Promise<void>((resolve) => {
        setImmediate(resolve);
      });
      if (signal.aborted) throw new SimulationAborted();
      results.push(runSimTask(task));
      onDone?.(results.length, tasks.length);
    }
    return results;
  },
};

/**
 * Runs the tasks on up to `workers` threads of `script` (the API's bundle). Each thread takes the
 * next task once it has finished one; results come back in task order. Aborting terminates the
 * threads at once.
 */
export function onWorkerThreads(script: URL, workers: number): SimExecutor {
  return {
    run: (tasks, signal, onDone) =>
      new Promise<SimTaskResult[]>((resolve, reject) => {
        const total = tasks.length;
        if (total === 0) {
          resolve([]);
          return;
        }
        if (signal.aborted) {
          reject(new SimulationAborted());
          return;
        }
        const results = new Array<SimTaskResult | undefined>(total).fill(undefined);
        const threads: Worker[] = [];
        const retired = new Set<Worker>();
        let next = 0;
        let done = 0;
        let settled = false;
        const stopAll = () => {
          signal.removeEventListener('abort', aborted);
          for (const thread of threads) {
            retired.add(thread);
            void thread.terminate();
          }
        };
        const fail = (error: Error) => {
          if (settled) return;
          settled = true;
          stopAll();
          reject(error);
        };
        const aborted = () => {
          fail(new SimulationAborted());
        };
        signal.addEventListener('abort', aborted);
        const feed = (thread: Worker) => {
          if (next >= total) {
            retired.add(thread);
            void thread.terminate();
            return;
          }
          const request: Request = { index: next, task: tasks[next] as SimTask };
          next++;
          thread.postMessage(request);
        };
        for (let i = 0; i < Math.min(Math.max(1, workers), total); i++) {
          const thread = new Worker(script, { workerData: SIM_WORKER_MARKER });
          threads.push(thread);
          thread.on('message', (reply: Reply) => {
            if (settled) return;
            if (reply.error !== undefined || reply.result === undefined) {
              fail(new Error(`a simulation task failed: ${reply.error ?? '?'}`));
              return;
            }
            results[reply.index] = reply.result;
            done++;
            onDone?.(done, total);
            if (done === total) {
              settled = true;
              stopAll();
              resolve(results as SimTaskResult[]);
              return;
            }
            feed(thread);
          });
          thread.on('error', fail);
          thread.on('exit', (code) => {
            if (!settled && !retired.has(thread)) {
              fail(new Error(`a simulation thread exited with code ${code} before its work`));
            }
          });
          feed(thread);
        }
      }),
  };
}

/** The thread's side: answers each task with its result, or with the error. */
export function serveSimTasks(port: MessagePort): void {
  port.on('message', (request: Request) => {
    let reply: Reply;
    try {
      reply = { index: request.index, result: runSimTask(request.task) };
    } catch (error) {
      reply = {
        index: request.index,
        error: error instanceof Error ? (error.stack ?? error.message) : String(error),
      };
    }
    port.postMessage(reply);
  });
}
