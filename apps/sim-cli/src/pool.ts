import { Worker } from 'node:worker_threads';
import type { MessagePort } from 'node:worker_threads';
import { runTask } from './tasks';
import type { Task, TaskResult } from './tasks';

/** `workerData` of the threads started by the pool, which run the same bundle as the CLI. */
export const WORKER_MARKER = 'gateflow-sim-worker';

interface Request {
  readonly index: number;
  readonly task: Task;
}

interface Reply {
  readonly index: number;
  readonly result?: TaskResult;
  readonly error?: string;
}

/**
 * Runs tasks on up to `workers` worker threads. Each thread gets the next task as soon as it has
 * finished one, so slow and fast tasks balance out. Results come back in task order, whatever the
 * order of completion, so the output does not depend on the number of threads.
 */
export function runInWorkers(
  script: URL,
  tasks: readonly Task[],
  workers: number,
  onDone?: (done: number, total: number) => void,
): Promise<TaskResult[]> {
  return new Promise<TaskResult[]>((resolve, reject) => {
    const total = tasks.length;
    if (total === 0) {
      resolve([]);
      return;
    }
    const results = new Array<TaskResult | undefined>(total).fill(undefined);
    const threads: Worker[] = [];
    const retired = new Set<Worker>();
    let next = 0;
    let done = 0;
    let settled = false;
    const stopAll = () => {
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
    const feed = (thread: Worker) => {
      if (next >= total) {
        retired.add(thread);
        void thread.terminate();
        return;
      }
      const request: Request = { index: next, task: tasks[next] as Task };
      next++;
      thread.postMessage(request);
    };
    for (let i = 0; i < Math.min(Math.max(1, workers), total); i++) {
      const thread = new Worker(script, { workerData: WORKER_MARKER });
      threads.push(thread);
      thread.on('message', (reply: Reply) => {
        if (settled) return;
        if (reply.error !== undefined || reply.result === undefined) {
          fail(new Error(`task ${reply.index} failed in a worker thread: ${reply.error ?? '?'}`));
          return;
        }
        results[reply.index] = reply.result;
        done++;
        onDone?.(done, total);
        if (done === total) {
          settled = true;
          stopAll();
          resolve(results as TaskResult[]);
          return;
        }
        feed(thread);
      });
      thread.on('error', fail);
      thread.on('exit', (code) => {
        if (!settled && !retired.has(thread)) {
          fail(new Error(`a worker thread exited with code ${code} before finishing its work`));
        }
      });
      feed(thread);
    }
  });
}

/** The worker side: answers each request with the result of its task, or with the error. */
export function serveTasks(port: MessagePort): void {
  port.on('message', (request: Request) => {
    let reply: Reply;
    try {
      reply = { index: request.index, result: runTask(request.task) };
    } catch (error) {
      reply = {
        index: request.index,
        error: error instanceof Error ? (error.stack ?? error.message) : String(error),
      };
    }
    port.postMessage(reply);
  });
}
