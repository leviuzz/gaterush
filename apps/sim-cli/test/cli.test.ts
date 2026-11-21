import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { EXIT_FAILURE, EXIT_OK, EXIT_USAGE, runCli } from '../src/cli';
import { createNodeIo, detectCommit } from '../src/io';

const DEMO = fileURLToPath(
  new URL('../../../scenarios/single-checkpoint-demo.yaml', import.meta.url),
);
const workDir = mkdtempSync(join(tmpdir(), 'gateflow-cli-'));

afterAll(() => {
  rmSync(workDir, { recursive: true, force: true });
});

async function cli(argv: string[]) {
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
  const code = await runCli(argv, io);
  return { code, stdout, stderr };
}

async function runInto(dir: string, seeds = '1-3') {
  const out = join(workDir, dir);
  const result = await cli([
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
    html: readFileSync(join(out, 'report.html'), 'utf8'),
  };
}

describe('gateflow-sim run', () => {
  let a: Awaited<ReturnType<typeof runInto>>;
  beforeAll(async () => {
    a = await runInto('a');
  });

  it('writes results.json and report.md and prints a summary', () => {
    expect(a.code).toBe(EXIT_OK);
    expect(a.stderr).toBe('');
    expect(a.stdout).toContain('SIMULATED RESULTS');
    for (const key of [
      'fifo-manual vs fifo',
      'virtual-fifo vs fifo',
      'priority-v3 vs fifo',
      'priority-v3 vs virtual-fifo',
      'priority-v3 vs fifo-manual',
    ]) {
      expect(a.stdout).toContain(`${key}: net flights saved per day`);
    }
    const doc = JSON.parse(a.results) as {
      manifest: { commit: string; seeds: { ranges: string } };
    };
    expect(doc.manifest.commit).toBe('test-commit');
    expect(doc.manifest.seeds.ranges).toBe('1-3');
    expect(a.report.startsWith('# GateFlow simulation report')).toBe(true);
    expect(a.html.startsWith('<!doctype html>')).toBe(true);
    expect(a.html).toContain('SIMULATED RESULTS');
  });

  it('is byte-for-byte deterministic for identical inputs', async () => {
    const b = await runInto('b');
    expect(b.results).toBe(a.results);
    expect(b.report).toBe(a.report);
    expect(b.html).toBe(a.html);
  });

  it('changes when the seeds change', async () => {
    const c = await runInto('c', '4-6');
    expect(c.results).not.toBe(a.results);
  });

  it('prints progress unless --quiet', async () => {
    const result = await cli([
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
  it('validates a scenario', async () => {
    const result = await cli(['validate', '--scenario', DEMO]);
    expect(result.code).toBe(EXIT_OK);
    expect(result.stdout).toContain('valid scenario single-checkpoint-demo');
    expect(result.stdout).toContain('flights        40 on the design day');
    expect(result.stdout).toContain('assumptions    21 labelled parameters');
  });

  it('reports invalid scenarios with exit code 1', async () => {
    const bad = join(workDir, 'bad.yaml');
    writeFileSync(bad, 'schemaVersion: 1\nid: Bad Id\n');
    const result = await cli(['validate', '--scenario', bad]);
    expect(result.code).toBe(EXIT_FAILURE);
    expect(result.stderr).toContain('invalid scenario');
    expect(result.stderr).toContain('migrated to version 4');
  });

  it('lists the policy presets as JSON', async () => {
    const result = await cli(['policies']);
    expect(result.code).toBe(EXIT_OK);
    expect((JSON.parse(result.stdout) as { id: string }[]).map((p) => p.id)).toEqual([
      'fifo',
      'fifo-manual',
      'virtual-fifo',
      'priority-v0',
      'priority-v1',
      'priority-v1-strict',
      'priority-v2',
      'priority-v3',
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
    [['run', '--scenario', DEMO, '--workers', '0']],
  ])('exits with the usage code for %j', async (argv) => {
    expect((await cli(argv)).code).toBe(EXIT_USAGE);
  });

  it('prints help and version', async () => {
    expect((await cli(['--help'])).stdout).toContain('Usage:');
    expect((await cli(['--version'])).stdout.trim()).toBe('0.6.0');
  });
});

const SWEEP = `schemaVersion: 1
id: test-sweep
title: Test sweep
description: Two curves on two days.
scenario: ${DEMO}
seeds: 1-2
policies: [fifo, fifo-manual, virtual-fifo, priority-v3]
baseline: fifo
candidate: priority-v3
compare: [priority-v3:fifo-manual, priority-v3:virtual-fifo]
dimensions:
  - { id: overtake-bound, title: Overtake bound, parameter: maxOvertakes, values: [15, 30] }
  - { id: data-age, title: Data age, parameter: maxDeadlineAgeMinutes, values: [60, none] }
`;

describe('gateflow-sim sweep', () => {
  const specFile = join(workDir, 'test-sweep.yaml');
  const sweepInto = async (dir: string, extra: string[] = []) => {
    const out = join(workDir, dir);
    const result = await cli([
      'sweep',
      '--spec',
      specFile,
      '--out',
      out,
      '--bootstrap-resamples',
      '50',
      '--quiet',
      ...extra,
    ]);
    return {
      ...result,
      json: readFileSync(join(out, 'sweep.json'), 'utf8'),
      report: readFileSync(join(out, 'sweep.md'), 'utf8'),
      html: readFileSync(join(out, 'sweep.html'), 'utf8'),
    };
  };
  let first: Awaited<ReturnType<typeof sweepInto>>;
  beforeAll(async () => {
    writeFileSync(specFile, SWEEP);
    first = await sweepInto('sweep-a');
  });

  it('writes sweep.json and sweep.md and prints one line per curve', () => {
    expect(first.code).toBe(EXIT_OK);
    expect(first.stdout).toContain('SIMULATED RESULTS');
    expect(first.stdout).toMatch(/overtake-bound: 15: [\d.]+ \([+-][\d.]+\), 30\*:/);
    expect(first.stdout).toContain('data-age: 60*:');
    const doc = JSON.parse(first.json) as {
      schema: string;
      manifest: { commit: string; reproduce: string; simulatedDays: number };
      dimensions: { points: { label: string }[] }[];
    };
    expect(doc.schema).toBe('gateflow.sim.sweep/1');
    expect(doc.manifest.commit).toBe('test-commit');
    expect(doc.manifest.reproduce).toBe(
      'gateflow-sim sweep --spec sweeps/test-sweep.yaml --seeds 1-2 --bootstrap-resamples 50',
    );
    // Every point shares the simulated days of the base scenario.
    expect(doc.manifest.simulatedDays).toBe(2);
    expect(doc.dimensions[1]?.points.map((p) => p.label)).toEqual(['60', 'none']);
    expect(first.report).toContain('**30 (base)**');
    expect(first.html).toContain('<figure class="chart">');
  });

  it('is deterministic, and --seeds overrides the file', async () => {
    expect((await sweepInto('sweep-b')).json).toBe(first.json);
    const other = await sweepInto('sweep-c', ['--seeds', '3']);
    expect(other.json).not.toBe(first.json);
    expect(other.json).toContain('"ranges": "3"');
  });

  it('rejects invalid specifications with the usage code', async () => {
    const bad = join(workDir, 'bad-sweep.yaml');
    const cases = [
      SWEEP.replace('maxOvertakes', 'speed'),
      SWEEP.replace('values: [15, 30]', 'values: [15, none]'),
      SWEEP.replace('values: [15, 30]', 'values: [2.5]'),
      SWEEP.replace('candidate: priority-v3', 'candidate: fifo'),
      SWEEP.replace('schemaVersion: 1', 'schemaVersion: 2'),
      SWEEP.replace(`scenario: ${DEMO}`, 'scenario: missing.yaml'),
    ];
    for (const text of cases) {
      writeFileSync(bad, text);
      const result = await cli(['sweep', '--spec', bad, '--out', join(workDir, 'bad')]);
      expect(result.code, result.stderr).toBe(EXIT_USAGE);
    }
    expect((await cli(['sweep'])).code).toBe(EXIT_USAGE);
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
