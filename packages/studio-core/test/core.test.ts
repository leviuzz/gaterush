import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DEFAULT_BOOTSTRAP,
  applyScenarioSettings,
  arrivalClassification,
  buildResults,
  planExperiment,
  recommendedComparisons,
  runExperiment,
} from '@gateflow/sim-metrics';
import { traceContent, traceDay } from '@gateflow/sim-trace';
import { findPolicyPreset } from '@gateflow/queue-core';
import {
  ScenarioValidationError,
  canonicalJson,
  collectAssumptions,
  parseScenarioText,
} from '@gateflow/sim-scenarios';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  LEVERS,
  MissingFileError,
  ResultsFileError,
  RunSettingsError,
  compareRuns,
  defaultPolicyIds,
  experimentConfig,
  loadLibrary,
  loadScenarioFile,
  normalizePath,
  notableDays,
  replayComparison,
  parseResultsFile,
  resolveFrom,
  scenarioFileText,
  scenarioHash,
  sha256Hex,
  studioResults,
  studioTrace,
  traceFingerprint,
  withLevers,
  withParameter,
} from '../src';
import { repositoryFiles, repositoryRoot } from './helpers';

const nodeSha = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');
const files = repositoryFiles();

/** The scenario as the CLI loads it from disk (apps/sim-cli/src/cli.ts, loadScenario). */
function cliLoad(path: string) {
  const file = fileURLToPath(new URL(path, repositoryRoot));
  return parseScenarioText(readFileSync(file, 'utf8'), 'yaml', {
    read: (relative) => readFileSync(join(dirname(file), relative), 'utf8'),
    sha256: nodeSha,
  });
}

describe('sha256Hex', () => {
  it('gives the hash of node:crypto for any text', () => {
    for (const text of [
      '',
      'abc',
      'a'.repeat(55),
      'a'.repeat(56),
      'b'.repeat(64),
      'c'.repeat(119),
    ]) {
      expect(sha256Hex(text)).toBe(nodeSha(text));
    }
    expect(sha256Hex('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
    expect(sha256Hex('Zürich → México 🛫')).toBe(nodeSha('Zürich → México 🛫'));
    expect(sha256Hex('lone \ud800 surrogate')).toBe(nodeSha('lone \ud800 surrogate'));
    fc.assert(
      fc.property(fc.string({ unit: 'binary', maxLength: 300 }), (text) => {
        expect(sha256Hex(text)).toBe(nodeSha(text));
      }),
      { numRuns: 500 },
    );
    for (const [path, text] of Object.entries(files)) {
      expect(sha256Hex(text), path).toBe(nodeSha(text));
    }
  });
});

describe('files and library', () => {
  it('resolves paths as the CLI does on disk', () => {
    expect(normalizePath('scenarios/../airports/./vce-like.yaml')).toBe('airports/vce-like.yaml');
    expect(normalizePath('../a/b')).toBe('../a/b');
    expect(resolveFrom('scenarios/day.yaml', 'flights/day.csv')).toBe('scenarios/flights/day.csv');
    expect(resolveFrom('scenarios/day.yaml', '../airports/x.yaml')).toBe('airports/x.yaml');
    expect(resolveFrom('day.yaml', 'x.yaml')).toBe('x.yaml');
  });

  it('loads every library scenario as the CLI does: same scenario, same hash', () => {
    const library = loadLibrary(files);
    expect(library.errors).toEqual([]);
    expect(library.entries.map((e) => e.path)).toEqual([
      'scenarios/mx-like-transfer-hub.yaml',
      'scenarios/tsf-like-peak-day.yaml',
      'scenarios/vce-like-disrupted-day.yaml',
      'scenarios/vce-like-normal-day.yaml',
      'scenarios/vce-like-peak-day.yaml',
      'scenarios/single-checkpoint-demo.yaml',
      'scenarios/single-checkpoint-disrupted.yaml',
      'scenarios/single-checkpoint-feed-stress.yaml',
      'scenarios/single-checkpoint-moderate.yaml',
      'scenarios/single-checkpoint-staffed.yaml',
      'scenarios/single-checkpoint-strategic.yaml',
    ]);
    for (const entry of library.entries) {
      const cli = cliLoad(entry.path);
      expect(canonicalJson(entry.scenario)).toBe(canonicalJson(cli));
      expect(scenarioHash(entry.scenario)).toBe(`sha256:${nodeSha(canonicalJson(cli))}`);
    }
    const hub = library.entries[0];
    expect(hub?.airport).toEqual({
      id: 'mx-like-hub',
      name: expect.any(String) as string,
      checkpoint: 'transfer',
    });
    expect(hub?.extraLanes).toBe(true);
    expect(library.entries.find((e) => e.path.endsWith('demo.yaml'))?.extraLanes).toBe(false);
  });

  it('names the file that is missing', () => {
    const withoutAirport = { ...files };
    delete withoutAirport['airports/tsf-like.yaml'];
    expect(() => loadScenarioFile(withoutAirport, 'scenarios/tsf-like-peak-day.yaml')).toThrow(
      /cannot read \.\.\/airports\/tsf-like\.yaml: scenarios\/tsf-like-peak-day\.yaml needs the file airports\/tsf-like\.yaml/,
    );
    expect(() => loadScenarioFile(files, 'scenarios/none.yaml')).toThrow(MissingFileError);
    expect(loadLibrary(withoutAirport).errors.map((e) => e.path)).toEqual([
      'scenarios/tsf-like-peak-day.yaml',
    ]);
  });

  it('finds the files a person adds by name, as they come without folders', () => {
    const added = {
      'user/tsf-like-peak-day.yaml': files['scenarios/tsf-like-peak-day.yaml'] ?? '',
      'user/tsf-like.yaml': files['airports/tsf-like.yaml'] ?? '',
      'user/tsf-like-peak-day.csv': files['scenarios/flights/tsf-like-peak-day.csv'] ?? '',
    };
    const library = loadLibrary(added, 'user', { looseFolder: 'user' });
    expect(library.errors).toEqual([]);
    expect(library.entries.map((e) => e.path)).toEqual(['user/tsf-like-peak-day.yaml']);
    expect(scenarioHash(library.entries[0]!.scenario)).toBe(
      scenarioHash(loadScenarioFile(files, 'scenarios/tsf-like-peak-day.yaml')),
    );
    const { ['user/tsf-like.yaml']: _airport, ...withoutAirport } = added;
    expect(_airport).toBeDefined();
    expect(loadLibrary(withoutAirport, 'user', { looseFolder: 'user' }).errors[0]?.message).toMatch(
      /needs the file airports\/tsf-like\.yaml/,
    );
  });

  it('writes a scenario the CLI loads back with the same hash', () => {
    const scenario = loadScenarioFile(files, 'scenarios/vce-like-peak-day.yaml');
    const again = parseScenarioText(scenarioFileText(scenario), 'json');
    expect(scenarioHash(again)).toBe(scenarioHash(scenario));
  });
});

describe('experiments', () => {
  const tsf = loadScenarioFile(files, 'scenarios/tsf-like-peak-day.yaml');

  it('sets up the experiment the CLI runs for the same choices', () => {
    const ids = ['fifo', 'fifo-manual@reactive', 'priority-v3@predict'];
    const config = experimentConfig({ scenario: tsf, policyIds: ids, days: 3 });
    const policies = applyScenarioSettings(
      ids.map((id) => findPolicyPreset(id)!),
      tsf,
    );
    expect(config).toEqual({
      scenario: tsf,
      seeds: [1, 2, 3],
      policies,
      baselinePolicyId: 'fifo',
      comparisons: recommendedComparisons(policies, 'fifo'),
      classification: arrivalClassification(policies),
      bootstrap: DEFAULT_BOOTSTRAP,
    });
    expect(defaultPolicyIds(tsf)).toContain('priority-v3@predict');
    expect(
      experimentConfig({
        scenario: tsf,
        policyIds: ids,
        days: 2,
        firstSeed: 41,
        baselineId: 'fifo-manual@reactive',
      }),
    ).toMatchObject({
      seeds: [41, 42],
      baselinePolicyId: 'fifo-manual@reactive',
    });
    expect(() => experimentConfig({ scenario: tsf, policyIds: [], days: 3 })).toThrow(
      RunSettingsError,
    );
    expect(() => experimentConfig({ scenario: tsf, policyIds: ['nobody'], days: 3 })).toThrow(
      /unknown policy nobody/,
    );
    expect(() => experimentConfig({ scenario: tsf, policyIds: ids, days: 0 })).toThrow(
      /number of days/,
    );
    expect(() =>
      experimentConfig({ scenario: tsf, policyIds: ids, days: 3, baselineId: 'virtual-fifo' }),
    ).toThrow(/status quo/);
  });

  it('gives the results of the CLI, naming the Studio as their generator', () => {
    const config = experimentConfig({
      scenario: tsf,
      policyIds: ['fifo', 'priority-v3'],
      days: 2,
      resamples: 50,
    });
    const experiment = runExperiment(config);
    const studio = studioResults(experiment, { version: '0.9.0', commit: 'abc' });
    const cli = buildResults(experiment, {
      generator: { name: 'gateflow-sim', version: '0.8.0' },
      commit: 'abc',
      scenarioHash: `sha256:${nodeSha(canonicalJson(tsf))}`,
    });
    expect(studio.manifest.generator).toEqual({ name: 'gateflow-studio', version: '0.9.0' });
    expect({
      ...studio,
      manifest: { ...studio.manifest, generator: cli.manifest.generator },
    }).toEqual(cli);
  });
});

describe('replaying a day (S11)', () => {
  const tsf = loadScenarioFile(files, 'scenarios/tsf-like-peak-day.yaml');
  const config = experimentConfig({
    scenario: tsf,
    policyIds: ['fifo', 'fifo-manual', 'priority-v3'],
    days: 5,
    resamples: 50,
  });
  const doc = studioResults(runExperiment(config), { version: '0', commit: 'abc' });

  it('opens on a priority policy against the status quo', () => {
    expect(replayComparison(doc)).toEqual({ candidateId: 'priority-v3', referenceId: 'fifo' });
  });

  it('picks the median day as the typical day, and the best and worst days', () => {
    const comparison = { candidateId: 'priority-v3', referenceId: 'fifo' };
    const days = notableDays(doc, comparison)!;
    const nets = doc.perSeed.map((d) => d.comparisons['priority-v3 vs fifo']!.net);
    const sorted = [...nets].sort((a, b) => a - b);
    expect(days.typical.net).toBe(sorted[2]);
    expect(days.best.net).toBe(Math.max(...nets));
    expect(days.worst.net).toBe(Math.min(...nets));
    for (const day of [days.typical, days.best, days.worst]) {
      expect(nets[day.seed - 1]).toBe(day.net);
      // The lowest seed among the days with that net.
      expect(nets.indexOf(day.net)).toBe(day.seed - 1);
    }
    expect(notableDays(doc, { candidateId: 'fifo', referenceId: 'priority-v3' })).toBeNull();
  });

  it('traces a day as the CLI does, with the same fingerprint', () => {
    const { job } = planExperiment(config);
    const comparison = { candidateId: 'priority-v3', referenceId: 'fifo-manual' };
    const studio = studioTrace(job, 3, comparison, { version: '0.11.0', commit: 'abc' });
    const cli = traceDay(job, 3, comparison, {
      generator: { name: 'gateflow-sim', version: '0.11.0' },
      commit: 'def',
      scenarioHash: `sha256:${nodeSha(canonicalJson(tsf))}`,
    });
    expect(studio.manifest.generator).toEqual({ name: 'gateflow-studio', version: '0.11.0' });
    expect(traceContent(studio)).toBe(traceContent(cli));
    expect(traceFingerprint(studio)).toBe(`sha256:${nodeSha(traceContent(cli))}`);
  });
});

describe('editing a scenario', () => {
  const demo = loadScenarioFile(files, 'scenarios/single-checkpoint-demo.yaml');
  const peak = loadScenarioFile(files, 'scenarios/vce-like-peak-day.yaml');

  it('changes a parameter with its source, and validates the scenario again', () => {
    const edited = withParameter(demo, 'checkpoint.serviceTimeMeanSeconds', {
      value: 31,
      source: 'MEASURED',
      note: 'Measured by the airport in June.',
    });
    expect(edited.checkpoint.serviceTimeMeanSeconds).toEqual({
      value: 31,
      source: 'MEASURED',
      note: 'Measured by the airport in June.',
    });
    expect(() =>
      withParameter(demo, 'checkpoint.serviceTimeMeanSeconds', { value: -1, source: 'SYNTHETIC' }),
    ).toThrow(ScenarioValidationError);
    expect(() =>
      withParameter(demo, 'checkpoint.nothing', { value: 1, source: 'SYNTHETIC' }),
    ).toThrow(/no such parameter/);
  });

  it('applies what-if settings from the scenario as written, and marks what they change', () => {
    expect(withLevers(peak, {})).toBe(peak);
    expect(withLevers(peak, { lanes: 0, screening: 24 })).toBe(peak);
    const harder = withLevers(peak, { lanes: -1, screening: 26, 'extra-lanes': 1, k: 15 });
    expect(harder.id).toBe('vce-like-peak-day-what-if');
    expect(harder.title).toBe(`${peak.title} (what-if)`);
    expect(harder.checkpoint.serviceTimeMeanSeconds.value).toBe(26);
    expect(harder.checkpoint.laneStaffing?.value.maxExtraLanes).toBe(1);
    expect(harder.gateflow?.value.maxOvertakes).toBe(15);
    expect(harder.checkpoint.laneSchedule.value.map((e) => e.lanes)).toEqual(
      peak.checkpoint.laneSchedule.value.map((e) => Math.max(1, e.lanes - 1)),
    );
    const notes = new Map(collectAssumptions(harder).map((a) => [a.path, a]));
    expect(notes.get('checkpoint.serviceTimeMeanSeconds')).toMatchObject({
      source: 'SYNTHETIC',
      note: 'What-if in GateFlow Studio: Screening time per person 26 s (the scenario says 24).',
    });
    expect(notes.get('checkpoint.laneSchedule')?.note).toMatch(
      /Lanes added to every hour of the plan -1 lanes/,
    );
    expect(notes.get('gateflow')?.note).toMatch(
      /Overtake bound K 15 people \(the scenario says 30\)/,
    );
    // The staff on call do not exist at the demo checkpoint: those settings do not apply.
    const lever = LEVERS.find((l) => l.id === 'extra-lanes');
    expect(lever?.base(demo)).toBeNull();
    expect(withLevers(demo, { 'extra-lanes': 3 })).toBe(demo);
    expect(() => withLevers(peak, { follow: 1.5 })).toThrow(
      /Share of GateFlow's lane recommendations followed/,
    );
  });
});

describe('comparing runs', () => {
  const tsf = loadScenarioFile(files, 'scenarios/tsf-like-peak-day.yaml');
  const run = (scenario: typeof tsf) =>
    studioResults(
      runExperiment(
        experimentConfig({
          scenario,
          policyIds: ['fifo-manual', 'priority-v3'],
          days: 2,
          resamples: 20,
        }),
      ),
      { version: '0.9.0', commit: 'abc' },
    );

  it('shows what each run misses and which assumptions differ', () => {
    const a = run(tsf);
    const b = run(withLevers(tsf, { k: 15 }));
    const comparison = compareRuns(a, b);
    expect(comparison.runs.map((r) => r.scenarioId)).toEqual([
      'tsf-like-peak-day',
      'tsf-like-peak-day-what-if',
    ]);
    expect(comparison.policies.map((p) => p.id)).toEqual(['fifo-manual', 'priority-v3']);
    expect(comparison.policies[0]?.missed[0]).toBe(a.summary.policies['fifo-manual']?.missed.mean);
    expect(comparison.parameters.map((p) => p.path)).toEqual(['gateflow']);
    expect(comparison.comparisons[0]?.key).toBe('priority-v3 vs fifo-manual');
    expect(parseResultsFile(JSON.stringify(a))).toEqual(a);
    expect(() => parseResultsFile('{')).toThrow(ResultsFileError);
    expect(() =>
      parseResultsFile(JSON.stringify({ ...a, schema: 'gateflow.sim.results/6' })),
    ).toThrow(/schema gateflow.sim.results\/6/);
  });
});
