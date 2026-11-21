import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

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

export function createNodeIo(overrides: Partial<CliIo> = {}): CliIo {
  const env = (name: string) => process.env[name];
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
    ...overrides,
  };
}
