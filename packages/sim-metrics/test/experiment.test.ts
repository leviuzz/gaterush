import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import type { ConstrainedEdfPolicyParams, Policy } from '@gateflow/priority-engine';
import { FIFO_POLICY, PRIORITY_V0_POLICY, classificationOf } from '@gateflow/priority-engine';
import { canonicalJson, collectAssumptions, parseScenarioText } from '@gateflow/sim-scenarios';
import { describe, expect, it } from 'vitest';
import {
  ExperimentConfigError,
  buildResults,
  renderReport,
  runExperiment,
  stringifyResults,
} from '../src';
import type { ExperimentConfig } from '../src';

const scenario = parseScenarioText(
  readFileSync(new URL('../../../scenarios/single-checkpoint-demo.yaml', import.meta.url), 'utf8'),
);
const scenarioHash = `sha256:${createHash('sha256').update(canonicalJson(scenario)).digest('hex')}`;
const classification = classificationOf(PRIORITY_V0_POLICY)!;

function config(overrides: Partial<ExperimentConfig> = {}): ExperimentConfig {
  return {
    scenario,
    seeds: [1, 2, 3],
    policies: [FIFO_POLICY, PRIORITY_V0_POLICY],
    baselinePolicyId: 'fifo',
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
  it('normalises seeds and compares every candidate with the baseline', () => {
    const result = runExperiment(config({ seeds: [3, 1, 2, 2] }));
    expect(result.seeds).toEqual([1, 2, 3]);
    expect(result.perSeed.map((s) => s.seed)).toEqual([1, 2, 3]);
    for (const day of result.perSeed) {
      expect(Object.keys(day.policies)).toEqual(['fifo', 'priority-v0']);
      expect(Object.keys(day.comparisons)).toEqual(['priority-v0']);
      const c = day.comparisons['priority-v0']!;
      expect(c.net).toBe(day.policies.fifo!.missed - day.policies['priority-v0']!.missed);
    }
  });

  it('shows no difference between FIFO and priority with a zero cap', () => {
    const zeroCap: Policy = {
      ...PRIORITY_V0_POLICY,
      id: 'zero-cap',
      params: {
        ...(PRIORITY_V0_POLICY.params as ConstrainedEdfPolicyParams),
        capMaxPriorityCalls: 0,
      },
    };
    const result = runExperiment(config({ policies: [FIFO_POLICY, zeroCap], seeds: [1, 2] }));
    for (const day of result.perSeed) {
      expect(day.comparisons['zero-cap']).toMatchObject({ saved: 0, harmed: 0, net: 0 });
      expect(day.policies['zero-cap']!.waitMeanMin).toBe(day.policies.fifo!.waitMeanMin);
    }
  });

  it('rejects misconfigured experiments', () => {
    expect(() => runExperiment(config({ baselinePolicyId: 'nope' }))).toThrow(
      ExperimentConfigError,
    );
    expect(() => runExperiment(config({ policies: [FIFO_POLICY, FIFO_POLICY] }))).toThrow(
      ExperimentConfigError,
    );
    expect(() => runExperiment(config({ seeds: [] }))).toThrow(ExperimentConfigError);
    expect(() => runExperiment(config({ seeds: [-1] }))).toThrow(ExperimentConfigError);
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
      versions: { engine: '0.1.0', model: '0.1.0', kernel: '0.1.0', populationGenerator: '0.1.0' },
    });
    expect(doc.assumptions).toEqual(collectAssumptions(scenario));
    expect(doc.modelLimitations.length).toBeGreaterThan(0);
  });

  it('reports confidence intervals that bracket the mean of every comparison metric', () => {
    for (const metric of Object.values(doc.summary.comparisons['priority-v0']!.metrics)) {
      expect(metric.ciLower).toBeLessThanOrEqual(metric.mean + 1e-9);
      expect(metric.ciUpper).toBeGreaterThanOrEqual(metric.mean - 1e-9);
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
