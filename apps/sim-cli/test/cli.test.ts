import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { EXIT_FAILURE, EXIT_OK, EXIT_USAGE, runCli } from '../src/cli';
import { createNodeIo, detectCommit } from '../src/io';

const DEMO = fileURLToPath(
  new URL('../../../scenarios/single-checkpoint-demo.yaml', import.meta.url),
);
const workDir = mkdtempSync(join(tmpdir(), 'gateflow-cli-'));

afterAll(() => {
  rmSync(workDir, { recursive: true, force: true });
});

function cli(argv: string[]) {
  let stdout = '';
  let stderr = '';
  const io = createNodeIo({
    stdout: (text) => {
      stdout += text;
    },
    stderr: (text) => {
      stderr += text;
    },
    commit: () => 'test-commit',
  });
  const code = runCli(argv, io);
  return { code, stdout, stderr };
}

function runInto(dir: string, seeds = '1-3') {
  const out = join(workDir, dir);
  const result = cli([
    'run',
    '--scenario',
    DEMO,
    '--seeds',
    seeds,
    '--out',
    out,
    '--bootstrap-resamples',
    '200',
    '--quiet',
  ]);
  return {
    ...result,
    results: readFileSync(join(out, 'results.json'), 'utf8'),
    report: readFileSync(join(out, 'report.md'), 'utf8'),
  };
}

describe('gateflow-sim run', () => {
  const a = runInto('a');

  it('writes results.json and report.md and prints a summary', () => {
    expect(a.code).toBe(EXIT_OK);
    expect(a.stderr).toBe('');
    expect(a.stdout).toContain('SIMULATED RESULTS');
    for (const key of [
      'fifo-manual vs fifo',
      'virtual-fifo vs fifo',
      'priority-v2 vs fifo',
      'priority-v2 vs virtual-fifo',
      'priority-v2 vs fifo-manual',
    ]) {
      expect(a.stdout).toContain(`${key}: net flights saved per day`);
    }
    const doc = JSON.parse(a.results) as {
      manifest: { commit: string; seeds: { ranges: string } };
    };
    expect(doc.manifest.commit).toBe('test-commit');
    expect(doc.manifest.seeds.ranges).toBe('1-3');
    expect(a.report.startsWith('# GateFlow simulation report')).toBe(true);
  });

  it('is byte-for-byte deterministic for identical inputs', () => {
    const b = runInto('b');
    expect(b.results).toBe(a.results);
    expect(b.report).toBe(a.report);
  });

  it('changes when the seeds change', () => {
    const c = runInto('c', '4-6');
    expect(c.results).not.toBe(a.results);
  });

  it('prints progress unless --quiet', () => {
    const result = cli([
      'run',
      '--scenario',
      DEMO,
      '--seeds',
      '1-2',
      '--out',
      join(workDir, 'd'),
      '--bootstrap-resamples',
      '50',
    ]);
    expect(result.code).toBe(EXIT_OK);
    expect(result.stderr).toContain('simulated 2/2 days');
  });
});

describe('gateflow-sim validate, policies, help', () => {
  it('validates a scenario', () => {
    const result = cli(['validate', '--scenario', DEMO]);
    expect(result.code).toBe(EXIT_OK);
    expect(result.stdout).toContain('valid scenario single-checkpoint-demo');
    expect(result.stdout).toContain('flights        40 on the design day');
    expect(result.stdout).toContain('assumptions    17 labelled parameters');
  });

  it('reports invalid scenarios with exit code 1', () => {
    const bad = join(workDir, 'bad.yaml');
    writeFileSync(bad, 'schemaVersion: 1\nid: Bad Id\n');
    const result = cli(['validate', '--scenario', bad]);
    expect(result.code).toBe(EXIT_FAILURE);
    expect(result.stderr).toContain('invalid scenario');
    expect(result.stderr).toContain('migrated to version 3');
  });

  it('lists the policy presets as JSON', () => {
    const result = cli(['policies']);
    expect(result.code).toBe(EXIT_OK);
    expect((JSON.parse(result.stdout) as { id: string }[]).map((p) => p.id)).toEqual([
      'fifo',
      'fifo-manual',
      'virtual-fifo',
      'priority-v0',
      'priority-v1',
      'priority-v1-strict',
      'priority-v2',
    ]);
  });

  it.each([
    [[] as string[]],
    [['frobnicate']],
    [['run']],
    [['run', '--scenario', DEMO, '--seeds', 'x']],
    [['run', '--scenario', DEMO, '--policies', 'nope']],
    [['run', '--scenario', DEMO, '--baseline', 'priority-v1', '--policies', 'fifo']],
    [['run', '--scenario', DEMO, '--compare', 'priority-v1:nope']],
    [['run', '--scenario', DEMO, '--compare', 'priority-v0:fifo']],
    [['run', '--scenario', DEMO, '--compare', 'priority-v1']],
    [['run', '--scenario', DEMO, '--unknown-option']],
    [['run', '--scenario', join(workDir, 'missing.yaml')]],
  ])('exits with the usage code for %j', (argv) => {
    expect(cli(argv).code).toBe(EXIT_USAGE);
  });

  it('prints help and version', () => {
    expect(cli(['--help']).stdout).toContain('Usage:');
    expect(cli(['--version']).stdout.trim()).toBe('0.4.0');
  });
});

describe('detectCommit', () => {
  it('prefers GATEFLOW_COMMIT, then GITHUB_SHA', () => {
    expect(detectCommit((n) => ({ GATEFLOW_COMMIT: 'abc', GITHUB_SHA: 'def' })[n])).toBe('abc');
    expect(detectCommit((n) => ({ GITHUB_SHA: 'def' })[n])).toBe('def');
  });

  it('falls back to git (or "unknown") when no variable is set', () => {
    const commit = detectCommit(() => undefined);
    expect(commit === 'unknown' || /^[0-9a-f]{40}(-dirty)?$/.test(commit)).toBe(true);
  });
});
