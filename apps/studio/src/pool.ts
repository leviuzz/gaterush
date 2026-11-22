import { assembleExperiment, planExperiment, runDay } from '@gateflow/sim-metrics';
import type {
  DayJob,
  ExperimentConfig,
  ExperimentPlan,
  PolicyComparison,
  ResultsDocument,
  SeedResult,
} from '@gateflow/sim-metrics';
import type { TraceDocument } from '@gateflow/sim-trace';
import { studioResults, studioTrace, traceFingerprint } from '@gateflow/studio-core';
import type { WorkerReply, WorkerRequest } from './protocol';

export interface PoolOptions {
  /** Source of the worker script (bundled into the page). */
  readonly workerSource: string;
  readonly workers: number;
  readonly signal: AbortSignal;
  readonly onProgress: (done: number, total: number) => void;
  /** Where the days ran: on `n` workers, or in the page when workers are not available. */
  readonly onMode?: (
    mode: { readonly kind: 'workers'; readonly count: number } | { readonly kind: 'page' },
  ) => void;
}

/** Thrown when a run is cancelled. */
export class RunCancelled extends Error {
  constructor() {
    super('cancelled');
    this.name = 'RunCancelled';
  }
}

const yieldToPage = () =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });

/**
 * Simulates the days of a job on Web Workers, each taking the next day as soon as it is free.
 * Results come back in seed order, so they do not depend on the number of workers. Where the page
 * may not start workers, the days run in the page itself, one after the other.
 */
export async function runDays(
  job: DayJob,
  seeds: readonly number[],
  options: PoolOptions,
): Promise<SeedResult[]> {
  const results = new Array<SeedResult | undefined>(seeds.length).fill(undefined);
  let done = 0;
  const pending = seeds.map((_, i) => i);
  const finish = (index: number, day: SeedResult) => {
    results[index] = day;
    done++;
    options.onProgress(done, seeds.length);
  };

  const left = await runOnWorkers(job, seeds, pending, options, finish);
  if (left.length > 0) {
    options.onMode?.({ kind: 'page' });
    for (const index of left) {
      if (options.signal.aborted) throw new RunCancelled();
      await yieldToPage();
      finish(index, runDay(job, seeds[index] ?? 0));
    }
  }
  if (options.signal.aborted) throw new RunCancelled();
  return results.map((day, i) => {
    if (day === undefined) throw new Error(`day ${seeds[i] ?? i} was not simulated`);
    return day;
  });
}

/** Runs what it can on workers; resolves with the indexes left to run in the page. */
function runOnWorkers(
  job: DayJob,
  seeds: readonly number[],
  pending: number[],
  options: PoolOptions,
  finish: (index: number, day: SeedResult) => void,
): Promise<number[]> {
  return new Promise<number[]>((resolve, reject) => {
    const count = Math.max(1, Math.min(options.workers, seeds.length));
    const queue = [...pending];
    const workers: Worker[] = [];
    const busy = new Map<Worker, number>();
    let url: string | undefined;
    let answered = false;
    let settled = false;
    const stop = () => {
      for (const worker of workers) worker.terminate();
      if (url !== undefined) URL.revokeObjectURL(url);
    };
    const settle = (left: number[] | Error) => {
      if (settled) return;
      settled = true;
      stop();
      if (left instanceof Error) reject(left);
      else resolve(left);
    };
    const feed = (worker: Worker) => {
      const index = queue.shift();
      if (index === undefined) {
        busy.delete(worker);
        if (busy.size === 0) settle([]);
        return;
      }
      busy.set(worker, index);
      worker.postMessage({ type: 'day', index, seed: seeds[index] ?? 0 } satisfies WorkerRequest);
    };
    options.signal.addEventListener('abort', () => {
      settle(new RunCancelled());
    });
    try {
      url = URL.createObjectURL(new Blob([options.workerSource], { type: 'text/javascript' }));
      for (let i = 0; i < count; i++) {
        const worker = new Worker(url);
        workers.push(worker);
        worker.onmessage = (event: MessageEvent<WorkerReply>) => {
          const reply = event.data;
          if (reply.type === 'error') {
            settle(
              new Error(`simulating day ${seeds[reply.index] ?? reply.index}: ${reply.message}`),
            );
            return;
          }
          if (reply.type !== 'day') return;
          answered = true;
          finish(reply.index, reply.day);
          feed(worker);
        };
        worker.onerror = (event) => {
          event.preventDefault();
          // A worker that never ran (blocked by the page's frame): finish the days in the page.
          if (!answered) {
            settle([...busy.values(), ...queue]);
            return;
          }
          settle(new Error(`a worker failed: ${event.message}`));
        };
        worker.postMessage({ type: 'job', job } satisfies WorkerRequest);
      }
    } catch {
      settle(pending);
      return;
    }
    options.onMode?.({ kind: 'workers', count });
    for (const worker of workers) feed(worker);
  });
}

/**
 * Asks one worker for an answer that takes a while (a plan, the statistics), so that the page stays
 * responsive. Where workers are not available, `here` computes it in the page.
 */
function askOneWorker<T>(
  workerSource: string,
  request: WorkerRequest,
  pick: (reply: WorkerReply) => T | undefined,
  here: () => T,
  signal: AbortSignal,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let worker: Worker;
    let url: string;
    let settled = false;
    const settle = (outcome: { value: T } | { error: Error } | 'here') => {
      if (settled) return;
      settled = true;
      worker.terminate();
      URL.revokeObjectURL(url);
      if (outcome === 'here') {
        void yieldToPage().then(() => {
          try {
            resolve(here());
          } catch (error) {
            reject(error instanceof Error ? error : new Error(String(error)));
          }
        });
      } else if ('value' in outcome) {
        resolve(outcome.value);
      } else {
        reject(outcome.error);
      }
    };
    try {
      url = URL.createObjectURL(new Blob([workerSource], { type: 'text/javascript' }));
      worker = new Worker(url);
    } catch {
      void yieldToPage().then(() => {
        try {
          resolve(here());
        } catch (error) {
          reject(error instanceof Error ? error : new Error(String(error)));
        }
      });
      return;
    }
    signal.addEventListener('abort', () => {
      settle({ error: new RunCancelled() });
    });
    worker.onmessage = (event: MessageEvent<WorkerReply>) => {
      const reply = event.data;
      if (reply.type === 'error') {
        settle({ error: new Error(reply.message) });
        return;
      }
      const value = pick(reply);
      if (value !== undefined) settle({ value });
    };
    worker.onerror = (event) => {
      event.preventDefault();
      settle('here');
    };
    worker.postMessage(request);
  });
}

/** Plans a run (with its arrival forecast when a policy needs one) without blocking the page. */
export function planRun(
  config: ExperimentConfig,
  workerSource: string,
  signal: AbortSignal,
): Promise<ExperimentPlan> {
  return askOneWorker(
    workerSource,
    { type: 'plan', config },
    (reply) => (reply.type === 'planned' ? reply.plan : undefined),
    () => planExperiment(config),
    signal,
  );
}

/** Computes the statistics and the results document of a run without blocking the page. */
export function resultsOfRun(
  config: ExperimentConfig,
  days: readonly SeedResult[],
  build: { readonly version: string; readonly commit: string },
  workerSource: string,
  signal: AbortSignal,
): Promise<ResultsDocument> {
  return askOneWorker(
    workerSource,
    { type: 'results', config, days, build },
    (reply) => (reply.type === 'results' ? reply.doc : undefined),
    () => studioResults(assembleExperiment(config, days), build),
    signal,
  );
}

/** A day being traced: the trace, then its fingerprint (which takes longer). */
export interface TracedDay {
  readonly trace: Promise<TraceDocument>;
  readonly fingerprint: Promise<string>;
}

/**
 * Traces one day of a run on a worker, so that the page stays responsive; where workers are not
 * available, in the page. The trace comes as soon as it is ready, the fingerprint after it.
 */
export function traceOfDay(
  job: DayJob,
  seed: number,
  comparison: PolicyComparison,
  build: { readonly version: string; readonly commit: string },
  workerSource: string,
  signal: AbortSignal,
): TracedDay {
  let resolveTrace: (doc: TraceDocument) => void = () => undefined;
  let rejectTrace: (error: Error) => void = () => undefined;
  let resolveFingerprint: (value: string) => void = () => undefined;
  let rejectFingerprint: (error: Error) => void = () => undefined;
  const trace = new Promise<TraceDocument>((resolve, reject) => {
    resolveTrace = resolve;
    rejectTrace = reject;
  });
  const fingerprint = new Promise<string>((resolve, reject) => {
    resolveFingerprint = resolve;
    rejectFingerprint = reject;
  });
  // Whoever awaits them sees the errors; nothing is reported as unhandled.
  trace.catch(() => undefined);
  fingerprint.catch(() => undefined);
  let traced = false;
  // A settled promise ignores a later rejection: a failure after the trace fails the fingerprint.
  const fail = (error: unknown) => {
    const reason = error instanceof Error ? error : new Error(String(error));
    rejectTrace(reason);
    rejectFingerprint(reason);
  };
  // Read at each step: the run may be cancelled while the page yields.
  const cancelled = () => signal.aborted;
  const here = () => {
    void yieldToPage().then(async () => {
      try {
        if (cancelled()) throw new RunCancelled();
        const doc = studioTrace(job, seed, comparison, build);
        resolveTrace(doc);
        await yieldToPage();
        if (cancelled()) throw new RunCancelled();
        resolveFingerprint(traceFingerprint(doc));
      } catch (error) {
        fail(error);
      }
    });
  };
  let worker: Worker;
  let url: string;
  try {
    url = URL.createObjectURL(new Blob([workerSource], { type: 'text/javascript' }));
    worker = new Worker(url);
  } catch {
    here();
    return { trace, fingerprint };
  }
  const stop = () => {
    worker.terminate();
    URL.revokeObjectURL(url);
  };
  signal.addEventListener('abort', () => {
    stop();
    fail(new RunCancelled());
  });
  worker.onmessage = (event: MessageEvent<WorkerReply>) => {
    const reply = event.data;
    if (reply.type === 'error') {
      stop();
      fail(new Error(reply.message));
    } else if (reply.type === 'traced') {
      traced = true;
      resolveTrace(reply.doc);
    } else if (reply.type === 'fingerprint') {
      stop();
      resolveFingerprint(reply.fingerprint);
    }
  };
  worker.onerror = (event) => {
    event.preventDefault();
    stop();
    // A worker that never ran (blocked by the page's frame): trace the day in the page.
    if (!traced) here();
    else fail(new Error(`a worker failed: ${event.message}`));
  };
  worker.postMessage({ type: 'trace', job, seed, comparison, build } satisfies WorkerRequest);
  return { trace, fingerprint };
}
