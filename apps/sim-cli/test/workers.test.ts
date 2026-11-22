import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
// @ts-expect-error: plain JavaScript module shared with build.mjs (no type declarations).
import { bundleOptions } from '../bundle-options.mjs';

const DISRUPTED = fileURLToPath(
  new URL('../../../scenarios/single-checkpoint-disrupted.yaml', import.meta.url),
);
const SWEEP = fileURLToPath(
  new URL('../../../sweeps/data-quality-disrupted.yaml', import.meta.url),
);
const workDir = mkdtempSync(join(tmpdir(), 'gateflow-workers-'));
const bundle = join(workDir, 'gateflow-sim.mjs');

beforeAll(async () => {
  // The worker threads run the bundle itself, so the end-to-end test needs a fresh one.
  await build({ ...(bundleOptions as object), outfile: bundle, sourcemap: false });
}, 60_000);

afterAll(() => {
  rmSync(workDir, { recursive: true, force: true });
});

function node(args: string[]): string {
  const child = spawnSync(process.execPath, [bundle, ...args], { encoding: 'utf8' });
  expect(child.status, child.stderr).toBe(0);
  return child.stderr;
}

function sweep(workers: number): string {
  const out = join(workDir, `sweep-w${workers}`);
  node([
    'sweep',
    '--spec',
    SWEEP,
    '--seeds',
    '1-2',
    '--out',
    out,
    '--bootstrap-resamples',
    '50',
    '--workers',
    String(workers),
    '--commit',
    'test-commit',
    '--quiet',
  ]);
  return readFileSync(join(out, 'sweep.json'), 'utf8');
}

function run(workers: number): { results: string; report: string; stderr: string } {
  const out = join(workDir, `w${workers}`);
  const child = spawnSync(
    process.execPath,
    [
      bundle,
      'run',
      '--scenario',
      DISRUPTED,
      '--seeds',
      '1-7',
      '--out',
      out,
      '--bootstrap-resamples',
      '100',
      '--workers',
      String(workers),
      '--commit',
      'test-commit',
    ],
    { encoding: 'utf8' },
  );
  expect(child.status, child.stderr).toBe(0);
  const stderr = child.stderr;
  return {
    results: readFileSync(join(out, 'results.json'), 'utf8'),
    report: readFileSync(join(out, 'report.md'), 'utf8'),
    stderr,
  };
}

describe('parallel days in worker threads', () => {
  it('writes byte-identical results and reports whatever the number of workers', () => {
    const one = run(1);
    const three = run(3);
    expect(three.results).toBe(one.results);
    expect(three.report).toBe(one.report);
    // Progress counts the days as they finish, in any order.
    expect(three.stderr).toContain('simulated 7/7 days');
    expect(JSON.parse(one.results)).toMatchObject({ manifest: { seeds: { ranges: '1-7' } } });
  }, 120_000);

  it('writes a byte-identical sweep whatever the number of workers', () => {
    expect(sweep(3)).toBe(sweep(1));
  }, 300_000);

  it('writes a byte-identical backtest whatever the number of workers', () => {
    const backtest = (workers: number) => {
      const out = join(workDir, `backtest-w${workers}`);
      node([
        'backtest',
        '--scenario',
        DISRUPTED,
        '--seeds',
        '1-3',
        '--out',
        out,
        '--workers',
        String(workers),
        '--commit',
        'test-commit',
        '--quiet',
      ]);
      return readFileSync(join(out, 'backtest.json'), 'utf8');
    };
    expect(backtest(3)).toBe(backtest(1));
  }, 300_000);
});
