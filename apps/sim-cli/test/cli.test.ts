import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { EXIT_FAILURE, EXIT_OK, EXIT_USAGE, runCli } from '../src/cli';
import { createNodeIo, detectCommit } from '../src/io';
import { CLI_VERSION } from '../src/version';

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
    expect(result.stdout).toContain('flights        40 on the design day (hourly profile)');
    expect(result.stdout).toContain('assumptions    21 labelled parameters');
    expect(result.stdout).toContain(
      'data sources   gateflow-synthetic (SYNTHETIC): Created for GateFlow; contains no third-party data.',
    );
  });

  it('reports invalid scenarios with exit code 1', async () => {
    const bad = join(workDir, 'bad.yaml');
    writeFileSync(bad, 'schemaVersion: 1\nid: Bad Id\n');
    const result = await cli(['validate', '--scenario', bad]);
    expect(result.code).toBe(EXIT_FAILURE);
    expect(result.stderr).toContain('invalid scenario');
    expect(result.stderr).toContain('migrated to version 5');
  });

  it('lists the policy presets and the lane modes as JSON', async () => {
    const result = await cli(['policies']);
    expect(result.code).toBe(EXIT_OK);
    const listed = JSON.parse(result.stdout) as {
      presets: { id: string }[];
      laneModes: Record<string, { lanes: { kind: string } }>;
    };
    expect(listed.presets.map((p) => p.id)).toEqual([
      'fifo',
      'fifo-manual',
      'virtual-fifo',
      'priority-v0',
      'priority-v1',
      'priority-v1-strict',
      'priority-v2',
      'priority-v3',
    ]);
    expect(Object.keys(listed.laneModes)).toEqual(['reactive', 'predict']);
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
    expect((await cli(['--version'])).stdout.trim()).toBe(CLI_VERSION);
  });
});

describe('gateflow-sim flights and flight list scenarios', () => {
  const dir = join(workDir, 'flight-list');
  const csv = join(dir, 'flights', 'demo.csv');
  const scenarioFile = join(dir, 'demo-from-file.yaml');

  beforeAll(async () => {
    mkdirSync(join(dir, 'flights'), { recursive: true });
    const exported = await cli(['flights', '--scenario', DEMO, '--out', csv]);
    expect(exported.code).toBe(EXIT_OK);
    expect(exported.stdout).toContain('(40 flights)');
    const yaml = readFileSync(DEMO, 'utf8')
      .replace('id: single-checkpoint-demo', 'id: demo-from-file')
      .replace(
        /^schedule:\n(?: .*\n|\n)*?(?=^passengers:)/m,
        [
          'schedule:',
          '  kind: flight-list',
          '  generatorSeed: 20261121',
          '  flights:',
          '    source: gateflow-synthetic',
          '    file: flights/demo.csv',
          '  gateZones:',
          '    value:',
          '      - { id: A, walkMinutes: 4, share: 0.4 }',
          '      - { id: B, walkMinutes: 8, share: 0.4 }',
          '      - { id: C, walkMinutes: 14, share: 0.2 }',
          '    source: SYNTHETIC',
          '',
        ].join('\n'),
      );
    writeFileSync(scenarioFile, yaml);
  });

  it('writes the design day as CSV, to standard output by default', async () => {
    const text = readFileSync(csv, 'utf8');
    expect(text.split('\n')[0]).toBe(
      '# gateflow.flights/1: design day of scenario single-checkpoint-demo (SYNTHETIC data)',
    );
    expect(text).toContain(
      'flight,std,aircraft,seats,passengers,gate_zone,destination\nF001,06:06,',
    );
    expect((await cli(['flights', '--scenario', DEMO])).stdout).toBe(text);
  });

  it('simulates a scenario whose flights come from a file exactly like the original', async () => {
    const validated = await cli(['validate', '--scenario', scenarioFile]);
    expect(validated.stdout).toContain(
      'flights        40 on the design day (flight list flights/demo.csv, source gateflow-synthetic)',
    );
    const run = async (scenario: string, out: string) => {
      const result = await cli([
        'run',
        '--scenario',
        scenario,
        '--seeds',
        '1-2',
        '--out',
        join(dir, out),
        '--bootstrap-resamples',
        '100',
        '--quiet',
      ]);
      expect(result.code).toBe(EXIT_OK);
      return {
        doc: JSON.parse(readFileSync(join(dir, out, 'results.json'), 'utf8')) as {
          manifest: { scenario: { schedule: { sha256: string | null; file: string | null } } };
          summary: unknown;
          perSeed: unknown;
        },
        report: readFileSync(join(dir, out, 'report.md'), 'utf8'),
      };
    };
    const original = await run(DEMO, 'original');
    const fromFile = await run(scenarioFile, 'from-file');
    expect(fromFile.doc.summary).toEqual(original.doc.summary);
    expect(fromFile.doc.perSeed).toEqual(original.doc.perSeed);
    const sha = createHash('sha256').update(readFileSync(csv, 'utf8'), 'utf8').digest('hex');
    expect(fromFile.doc.manifest.scenario.schedule).toMatchObject({
      file: 'flights/demo.csv',
      sha256: sha,
    });
    expect(fromFile.report).toContain(
      `Design day: 40 departures from the flight list \`flights/demo.csv\` (SHA-256 \`${sha}\`), source \`gateflow-synthetic\`.`,
    );
  });

  it('reports a missing or broken flight list as an invalid scenario', async () => {
    const missing = join(dir, 'missing-file.yaml');
    writeFileSync(
      missing,
      readFileSync(scenarioFile, 'utf8').replace('flights/demo.csv', 'flights/none.csv'),
    );
    const result = await cli(['validate', '--scenario', missing]);
    expect(result.code).toBe(EXIT_FAILURE);
    expect(result.stderr).toContain('schedule.flights.file: cannot read flights/none.csv');
    const broken = join(dir, 'broken.yaml');
    writeFileSync(join(dir, 'flights', 'broken.csv'), 'flight,std\nX1,6:00\n');
    writeFileSync(
      broken,
      readFileSync(scenarioFile, 'utf8').replace('flights/demo.csv', 'flights/broken.csv'),
    );
    const brokenResult = await cli(['validate', '--scenario', broken]);
    expect(brokenResult.code).toBe(EXIT_FAILURE);
    expect(brokenResult.stderr).toContain(
      'flight list flights/broken.csv, line 2: std: expected a clock time HH:MM',
    );
  });
});

describe('airport configurations', () => {
  const repo = fileURLToPath(new URL('../../../', import.meta.url));
  const dir = join(workDir, 'airport');

  it('validates a day of an airport and prints the lane plan of its checkpoint', async () => {
    const day = join(repo, 'scenarios', 'tsf-like-peak-day.yaml');
    const validated = await cli(['validate', '--scenario', day]);
    expect(validated.code).toBe(EXIT_OK);
    expect(validated.stdout).toContain(
      'airport        tsf-like (TSF-like airport (synthetic)), checkpoint departures',
    );
    expect(validated.stdout).toContain(
      'lanes          5 planned at most, 6 at the checkpoint; staff on call for 1 extra lane (about 10 min to open)',
    );
    const lanes = await cli(['lanes', '--scenario', day]);
    expect(lanes.code).toBe(EXIT_OK);
    const planned = lanes.stdout
      .split('\n')
      .filter((l) => l.startsWith('      - { from:'))
      .join('\n');
    const given = readFileSync(day, 'utf8')
      .split('\n')
      .filter((l) => l.startsWith('      - { from:'))
      .join('\n');
    expect(planned).toBe(given);
    expect(lanes.stdout).toMatch(/^# Lane plan of tsf-like-peak-day: \d+\.\d lane-hours/);
    const noRule = await cli(['lanes', '--scenario', DEMO]);
    expect(noRule.code).toBe(EXIT_USAGE);
  });

  it('simulates the policies with the settings of the checkpoint', async () => {
    mkdirSync(join(dir, 'airports'), { recursive: true });
    mkdirSync(join(dir, 'scenarios', 'flights'), { recursive: true });
    writeFileSync(
      join(dir, 'airports', 'tsf-like.yaml'),
      readFileSync(join(repo, 'airports', 'tsf-like.yaml'), 'utf8').replace(
        'maxOvertakes: 30',
        'maxOvertakes: 15',
      ),
    );
    writeFileSync(
      join(dir, 'scenarios', 'flights', 'tsf-like-peak-day.csv'),
      readFileSync(join(repo, 'scenarios', 'flights', 'tsf-like-peak-day.csv'), 'utf8'),
    );
    const day = join(dir, 'scenarios', 'tsf-like-peak-day.yaml');
    writeFileSync(day, readFileSync(join(repo, 'scenarios', 'tsf-like-peak-day.yaml'), 'utf8'));
    const out = join(dir, 'out');
    const result = await cli([
      'run',
      '--scenario',
      day,
      '--seeds',
      '1-2',
      '--policies',
      'fifo,virtual-fifo,priority-v3',
      '--out',
      out,
      '--bootstrap-resamples',
      '50',
      '--quiet',
    ]);
    expect(result.code).toBe(EXIT_OK);
    const doc = JSON.parse(readFileSync(join(out, 'results.json'), 'utf8')) as {
      manifest: {
        policies: { id: string; selection: { maxOvertakes?: number } }[];
        scenario: { airport: { id: string; checkpoint: string } | null };
      };
    };
    expect(doc.manifest.policies.find((p) => p.id === 'priority-v3')?.selection.maxOvertakes).toBe(
      15,
    );
    expect(doc.manifest.scenario.airport).toMatchObject({
      id: 'tsf-like',
      checkpoint: 'departures',
    });
    const report = readFileSync(join(out, 'report.md'), 'utf8');
    expect(report).toContain(
      'Set for this checkpoint by the scenario (preset value in brackets): selection.maxOvertakes 15 (30).',
    );
    expect(report).toMatch(
      /\| Fairness target of this checkpoint: at most 0\.10% delayed by more than 5 min \| (met|\*\*not met\*\*) \(\d+\.\d\d%\) \|/,
    );
    expect(report).toContain(
      'Airport configuration: `tsf-like` (TSF-like airport (synthetic)), checkpoint `departures`',
    );
  });

  it('opens extra lanes with a lane mode, within the lanes and staff of the checkpoint (S8)', async () => {
    const out = join(dir, 'out-lanes');
    const result = await cli([
      'run',
      '--scenario',
      join(repo, 'scenarios', 'tsf-like-peak-day.yaml'),
      '--seeds',
      '1-3',
      '--policies',
      'fifo-manual,fifo-manual@reactive,fifo-manual@predict',
      '--out',
      out,
      '--bootstrap-resamples',
      '50',
      '--workers',
      '2',
      '--quiet',
    ]);
    expect(result.code).toBe(EXIT_OK);
    expect(result.stdout).toMatch(/fifo-manual@predict\s+\d+\.\d\s+\d+\.\d\s+\d+\.\d\s+\d+\.\d/);
    expect(result.stdout).toContain('fifo-manual@predict vs fifo-manual@reactive');
    const doc = JSON.parse(readFileSync(join(out, 'results.json'), 'utf8')) as {
      summary: {
        policies: Record<
          string,
          { maxOpenLanes: { max: number }; extraLaneHours: { mean: number } }
        >;
      };
    };
    for (const id of ['fifo-manual@reactive', 'fifo-manual@predict']) {
      expect(doc.summary.policies[id]?.maxOpenLanes.max).toBeLessThanOrEqual(6);
    }
    expect(doc.summary.policies['fifo-manual']?.extraLaneHours.mean).toBe(0);
    const report = readFileSync(join(out, 'report.md'), 'utf8');
    expect(report).toMatch(/## \d+\. Lane management/);
    expect(report).toContain(
      'never more than the 6 lanes the checkpoint has, and at most 1 at the same time',
    );
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
    expect(doc.schema).toBe('gateflow.sim.sweep/3');
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
