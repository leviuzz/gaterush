import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import {
  FIFO_POLICY,
  PRIORITY_V0_POLICY,
  PRIORITY_V0_SELECTION,
  VIRTUAL_FIFO_POLICY,
  classificationOf,
} from '@gateflow/queue-core';
import type { Policy } from '@gateflow/queue-core';
import { canonicalJson, collectAssumptions, parseScenarioText } from '@gateflow/sim-scenarios';
import { describe, expect, it } from 'vitest';
import {
  ExperimentConfigError,
  buildResults,
  renderReport,
  runExperiment,
  stringifyResults,
} from '../src';
import type { ExperimentConfig, PolicyComparison } from '../src';

const scenario = parseScenarioText(
  readFileSync(new URL('../../../scenarios/single-checkpoint-demo.yaml', import.meta.url), 'utf8'),
);
const scenarioHash = `sha256:${createHash('sha256').update(canonicalJson(scenario)).digest('hex')}`;
const classification = classificationOf(PRIORITY_V0_POLICY)!;

/** The comparisons of the published reports: each GateFlow policy against the status quo, and the prioritisation alone. */
const COMPARISONS: PolicyComparison[] = [
  { candidateId: 'virtual-fifo', referenceId: 'fifo' },
  { candidateId: 'priority-v0', referenceId: 'fifo' },
  { candidateId: 'priority-v0', referenceId: 'virtual-fifo' },
];

function config(overrides: Partial<ExperimentConfig> = {}): ExperimentConfig {
  return {
    scenario,
    seeds: [1, 2, 3],
    policies: [FIFO_POLICY, VIRTUAL_FIFO_POLICY, PRIORITY_V0_POLICY],
    baselinePolicyId: 'fifo',
    comparisons: COMPARISONS,
    classification,
    bootstrap: { resamples: 200, confidence: 0.95, seed: 20261121 },
    ...overrides,
  };
}

const manifest = { generator: { name: 'test', version: '0.0.0' }, commit: 'test', scenarioHash };

function document(overrides: Partial<ExperimentConfig> = {}) {
  return buildResults(runExperiment(config(overrides)), manifest);
}

describe('runExperiment', () => {
  it('normalises seeds and runs every requested comparison, paired on the same passengers', () => {
    const result = runExperiment(config({ seeds: [3, 1, 2, 2] }));
    expect(result.seeds).toEqual([1, 2, 3]);
    expect(result.perSeed.map((s) => s.seed)).toEqual([1, 2, 3]);
    for (const day of result.perSeed) {
      expect(Object.keys(day.policies)).toEqual(['fifo', 'virtual-fifo', 'priority-v0']);
      expect(Object.keys(day.comparisons)).toEqual([
        'virtual-fifo vs fifo',
        'priority-v0 vs fifo',
        'priority-v0 vs virtual-fifo',
      ]);
      for (const c of COMPARISONS) {
        const metrics = day.comparisons[`${c.candidateId} vs ${c.referenceId}`]!;
        expect(metrics.net).toBe(
          day.policies[c.referenceId]!.missed - day.policies[c.candidateId]!.missed,
        );
      }
    }
  });

  it('compares every policy with the baseline by default', () => {
    const result = runExperiment(config({ comparisons: undefined, seeds: [1] }));
    expect(result.comparisons).toEqual([
      { candidateId: 'virtual-fifo', referenceId: 'fifo' },
      { candidateId: 'priority-v0', referenceId: 'fifo' },
    ]);
  });

  it('shows no difference between virtual FIFO and priority with a zero cap', () => {
    const zeroCap: Policy = {
      ...PRIORITY_V0_POLICY,
      id: 'zero-cap',
      selection: { ...PRIORITY_V0_SELECTION, capMaxPriorityCalls: 0 },
    };
    const result = runExperiment(
      config({
        policies: [FIFO_POLICY, VIRTUAL_FIFO_POLICY, zeroCap],
        comparisons: [{ candidateId: 'zero-cap', referenceId: 'virtual-fifo' }],
        seeds: [1, 2],
      }),
    );
    for (const day of result.perSeed) {
      expect(day.comparisons['zero-cap vs virtual-fifo']).toMatchObject({
        saved: 0,
        harmed: 0,
        net: 0,
        waitMeanDeltaMin: 0,
      });
      expect(day.policies['zero-cap']!.capReachedCalls).toBeGreaterThan(0);
    }
  });

  it('rejects misconfigured experiments', () => {
    const rejects = (overrides: Partial<ExperimentConfig>) => {
      expect(() => runExperiment(config(overrides))).toThrow(ExperimentConfigError);
    };
    rejects({ baselinePolicyId: 'nope' });
    rejects({ policies: [FIFO_POLICY, FIFO_POLICY] });
    rejects({ seeds: [] });
    rejects({ seeds: [-1] });
    rejects({ comparisons: [{ candidateId: 'nope', referenceId: 'fifo' }] });
    rejects({ comparisons: [{ candidateId: 'fifo', referenceId: 'fifo' }] });
    rejects({ comparisons: [COMPARISONS[0]!, COMPARISONS[0]!] });
  });
});

describe('results document', () => {
  const doc = document();
  const json = stringifyResults(doc);

  it('is byte-identical across runs and changes with the seeds', () => {
    expect(stringifyResults(document())).toBe(json);
    expect(stringifyResults(document({ seeds: [4, 5, 6] }))).not.toBe(json);
  });

  it('carries the disclaimer, the manifest and every assumption', () => {
    expect(doc.disclaimer).toMatch(/^SIMULATED RESULTS/);
    expect(doc.manifest).toMatchObject({
      commit: 'test',
      scenario: {
        id: 'single-checkpoint-demo',
        hash: scenarioHash,
        dataClassification: 'SYNTHETIC',
      },
      seeds: { count: 3, ranges: '1-3' },
      baselinePolicyId: 'fifo',
      comparisons: COMPARISONS,
      versions: {
        engine: '0.2.1',
        queueCore: '0.1.0',
        model: '0.2.0',
        kernel: '0.1.0',
        populationGenerator: '0.2.0',
        scenarioSchema: 2,
      },
    });
    expect(doc.schema).toBe('gateflow.sim.results/2');
    expect(doc.manifest.reproduce).toContain(
      '--compare virtual-fifo:fifo,priority-v0:fifo,priority-v0:virtual-fifo',
    );
    expect(doc.assumptions).toEqual(collectAssumptions(scenario));
    expect(doc.modelLimitations.length).toBeGreaterThan(0);
  });

  it('reports confidence intervals that bracket the mean of every comparison metric', () => {
    for (const comparison of Object.values(doc.summary.comparisons)) {
      for (const metric of Object.values(comparison.metrics)) {
        expect(metric.ciLower).toBeLessThanOrEqual(metric.mean + 1e-9);
        expect(metric.ciUpper).toBeGreaterThanOrEqual(metric.mean - 1e-9);
      }
    }
  });

  it('never serialises NaN, Infinity, null or more than 4 decimals in the results', () => {
    expect(json).not.toMatch(/NaN|Infinity/);
    expect(JSON.stringify(doc.summary)).not.toMatch(/null/);
    expect(JSON.stringify(doc.perSeed)).not.toMatch(/null/);
    const numbers = JSON.stringify(doc.summary).match(/-?\d+\.\d+/g) ?? [];
    for (const n of numbers) expect(n.split('.')[1]!.length).toBeLessThanOrEqual(4);
  });
});

describe('report', () => {
  const doc = document();
  const report = renderReport(doc);

  it('is deterministic', () => {
    expect(renderReport(document())).toBe(report);
  });

  it('starts with the disclaimer and contains the manifest and every assumption', () => {
    expect(report.split('\n')[2]).toBe(`> **${doc.disclaimer}**`);
    expect(report).toContain(scenarioHash);
    expect(report).toContain('| Source revision | `test` |');
    for (const assumption of doc.assumptions) expect(report).toContain(`| ${assumption.path} |`);
    for (const limitation of doc.modelLimitations) expect(report).toContain(limitation);
    expect(report).toContain('Net flights saved');
    expect(report).toContain('`priority-v0` compared with `virtual-fifo`');
    expect(report).toContain('Call mechanics');
    expect(report).toContain('No-shows (missed-call rate)');
    expect(report).toContain('Idle lane time');
    expect(report).not.toMatch(/NaN|undefined|Infinity/);
  });
});

describe('golden files (regenerate with UPDATE_GOLDEN=1 and explain the change in CHANGELOG.md)', () => {
  const goldenDir = new URL('./golden/', import.meta.url);
  const doc = document();
  const files: [string, string][] = [
    ['demo-seeds-1-3.results.json', stringifyResults(doc)],
    ['demo-seeds-1-3.report.md', renderReport(doc)],
  ];

  if (process.env.UPDATE_GOLDEN === '1') {
    mkdirSync(goldenDir, { recursive: true });
    for (const [name, content] of files) writeFileSync(new URL(name, goldenDir), content);
  }

  it.each(files)('%s matches the committed golden file', (name, content) => {
    expect(content).toBe(readFileSync(new URL(name, goldenDir), 'utf8'));
  });
});
