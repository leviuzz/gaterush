import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { runInWorkers } from './pool';
import { runTasksHere } from './tasks';
import type { Task, TaskResult } from './tasks';

/** Side effects of the CLI, injectable for tests. */
export interface CliIo {
  readFile(path: string): string;
  writeFile(path: string, content: string): void;
  mkdir(path: string): void;
  stdout(text: string): void;
  stderr(text: string): void;
  sha256(text: string): string;
  /** Source revision recorded in the results manifest. */
  commit(): string;
  env(name: string): string | undefined;
  /** Threads this machine can run in parallel (the default number of workers). */
  cpus(): number;
  /**
   * Runs tasks, on up to `workers` worker threads when possible, else in this thread. Results come
   * back in task order: the output never depends on the number of workers.
   */
  runTasks(
    tasks: readonly Task[],
    workers: number,
    onDone?: (done: number, total: number) => void,
  ): Promise<TaskResult[]>;
}

export interface NodeIoOptions {
  /**
   * Script that worker threads run (the CLI bundle, which serves tasks when started as a
   * worker). Without it every task runs in this thread.
   */
  readonly workerScript?: URL;
}

function git(args: string[]): string | undefined {
  try {
    return execFileSync('git', args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return undefined;
  }
}

/**
 * Source revision: GATEFLOW_COMMIT, then GITHUB_SHA, then the current git commit, else "unknown".
 * A "-dirty" suffix is added when the working tree differs from the commit, including new files
 * that are not ignored: results must never claim a revision that did not produce them.
 */
export function detectCommit(env: (name: string) => string | undefined): string {
  const explicit = env('GATEFLOW_COMMIT') ?? env('GITHUB_SHA');
  if (explicit !== undefined && explicit !== '') return explicit;
  const head = git(['rev-parse', 'HEAD']);
  if (head === undefined || head === '') return 'unknown';
  const status = git(['status', '--porcelain']);
  return status === undefined || status === '' ? head : `${head}-dirty`;
}

export function createNodeIo(overrides: Partial<CliIo> = {}, options: NodeIoOptions = {}): CliIo {
  const env = (name: string) => process.env[name];
  const script = options.workerScript;
  return {
    readFile: (path) => readFileSync(path, 'utf8'),
    writeFile: (path, content) => {
      writeFileSync(path, content, 'utf8');
    },
    mkdir: (path) => {
      mkdirSync(path, { recursive: true });
    },
    stdout: (text) => {
      process.stdout.write(text);
    },
    stderr: (text) => {
      process.stderr.write(text);
    },
    sha256: (text) => createHash('sha256').update(text, 'utf8').digest('hex'),
    commit: () => detectCommit(env),
    env,
    cpus: () => availableParallelism(),
    runTasks: (tasks, workers, onDone) =>
      script !== undefined && workers > 1 && tasks.length > 1
        ? runInWorkers(script, tasks, workers, onDone)
        : Promise.resolve(runTasksHere(tasks, onDone)),
    ...overrides,
  };
}
