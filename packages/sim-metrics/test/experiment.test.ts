import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import {
  FIFO_MANUAL_POLICY,
  FIFO_POLICY,
  PRIORITY_V0_POLICY,
  PRIORITY_V0_SELECTION,
  PRIORITY_V2_POLICY,
  PRIORITY_V3_POLICY,
  VIRTUAL_FIFO_POLICY,
  classificationOf,
} from '@gateflow/queue-core';
import type { Policy } from '@gateflow/queue-core';
import { canonicalJson, collectAssumptions, parseScenarioText } from '@gateflow/sim-scenarios';
import { describe, expect, it } from 'vitest';
import {
  ExperimentConfigError,
  assembleExperiment,
  buildResults,
  buildSweepResults,
  planExperiment,
  renderHtmlReport,
  renderReport,
  renderSweepHtml,
  renderSweepReport,
  runDay,
  runExperiment,
  runSweep,
  stringifyResults,
  stringifySweep,
} from '../src';
import { balancedTags } from './html-check';
import type { ExperimentConfig, PolicyComparison } from '../src';

const scenario = parseScenarioText(
  readFileSync(new URL('../../../scenarios/single-checkpoint-demo.yaml', import.meta.url), 'utf8'),
);
const scenarioHash = `sha256:${createHash('sha256').update(canonicalJson(scenario)).digest('hex')}`;
const disrupted = parseScenarioText(
  readFileSync(
    new URL('../../../scenarios/single-checkpoint-disrupted.yaml', import.meta.url),
    'utf8',
  ),
);
const classification = classificationOf(PRIORITY_V2_POLICY)!;

/**
 * The comparisons of the published reports: every policy against the status quo, the
 * prioritisation alone, GateFlow against today's manual handling, and v3 against v2 (the S5
 * data-quality rules alone).
 */
const COMPARISONS: PolicyComparison[] = [
  { candidateId: 'fifo-manual', referenceId: 'fifo' },
  { candidateId: 'virtual-fifo', referenceId: 'fifo' },
  { candidateId: 'priority-v2', referenceId: 'fifo' },
  { candidateId: 'priority-v3', referenceId: 'fifo' },
  { candidateId: 'priority-v2', referenceId: 'virtual-fifo' },
  { candidateId: 'priority-v2', referenceId: 'fifo-manual' },
  { candidateId: 'priority-v3', referenceId: 'virtual-fifo' },
  { candidateId: 'priority-v3', referenceId: 'fifo-manual' },
  { candidateId: 'priority-v3', referenceId: 'priority-v2' },
];
const POLICY_IDS = ['fifo', 'fifo-manual', 'virtual-fifo', 'priority-v2', 'priority-v3'];

function config(overrides: Partial<ExperimentConfig> = {}): ExperimentConfig {
  return {
    scenario,
    seeds: [1, 2, 3],
    policies: [
      FIFO_POLICY,
      FIFO_MANUAL_POLICY,
      VIRTUAL_FIFO_POLICY,
      PRIORITY_V2_POLICY,
      PRIORITY_V3_POLICY,
    ],
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
      expect(Object.keys(day.policies)).toEqual(POLICY_IDS);
      expect(Object.keys(day.comparisons)).toEqual(
        COMPARISONS.map((c) => `${c.candidateId} vs ${c.referenceId}`),
      );
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
    expect(result.comparisons).toEqual(
      POLICY_IDS.slice(1).map((candidateId) => ({ candidateId, referenceId: 'fifo' })),
    );
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

  it('gives the same result when the days are computed separately, in any order', () => {
    const c = config({ seeds: [1, 2, 3] });
    const { job, seeds } = planExperiment(c);
    expect(seeds).toEqual([1, 2, 3]);
    // As parallel workers would: each day on its own, finishing in any order.
    const days = [3, 1, 2].map((seed) => structuredClone(runDay(job, seed)));
    expect(assembleExperiment(c, days)).toEqual(runExperiment(c));
    expect(() => assembleExperiment(c, days.slice(1))).toThrow(/seed 3 was not computed/);
    expect(() => assembleExperiment(c, [...days, days[0]!])).toThrow(/computed twice/);
    expect(() => assembleExperiment(c, [...days, runDay(job, 4)])).toThrow(/not in the experiment/);
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
        dataSources: scenario.dataSources,
        schedule: {
          kind: 'synthetic-hourly',
          flights: 40,
          file: null,
          sha256: null,
          source: null,
        },
      },
      seeds: { count: 3, ranges: '1-3' },
      baselinePolicyId: 'fifo',
      comparisons: COMPARISONS,
      versions: {
        engine: '0.5.0',
        queueCore: '0.11.0',
        model: '0.6.0',
        kernel: '0.1.0',
        populationGenerator: '0.6.0',
        scenarioSchema: 5,
      },
    });
    expect(doc.schema).toBe('gateflow.sim.results/7');
    expect(doc.manifest.reproduce).toContain(`--policies ${POLICY_IDS.join(',')}`);
    expect(doc.manifest.reproduce).toContain(
      `--compare ${COMPARISONS.map((c) => `${c.candidateId}:${c.referenceId}`).join(',')}`,
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
    expect(report).toContain('`priority-v2` compared with `fifo-manual`');
    expect(report).toContain('`priority-v3` compared with `priority-v2`');
    expect(report).toContain('Disruptions, data quality and stability');
    expect(report).toContain('No delays, gate changes, lane outages or feed outages');
    expect(report).toContain('People through the fast track per day');
    expect(report).toContain('Groups, assisted passengers and late arrivals');
    expect(report).toContain('Call mechanics');
    expect(report).toContain('No-shows (missed-call rate)');
    expect(report).toContain('Idle lane time');
    expect(report).not.toMatch(/NaN|undefined|Infinity/);
  });
});

describe('golden files (regenerate with UPDATE_GOLDEN=1 and explain the change in CHANGELOG.md)', () => {
  const goldenDir = new URL('./golden/', import.meta.url);
  const doc = document();
  // The disrupted day exercises the S5 section of the report (delays, outages, stability).
  const disruptedDoc = buildResults(runExperiment(config({ scenario: disrupted })), {
    ...manifest,
    scenarioHash: `sha256:${createHash('sha256').update(canonicalJson(disrupted)).digest('hex')}`,
  });
  // A small sensitivity sweep: two curves, two days per point.
  const sweepDoc = buildSweepResults(
    runSweep({
      id: 'golden-sweep',
      title: 'Golden sweep',
      description: 'Two curves on two simulated days, to lock the sweep outputs.',
      scenario,
      seeds: [1, 2],
      policies: [FIFO_POLICY, FIFO_MANUAL_POLICY, VIRTUAL_FIFO_POLICY, PRIORITY_V3_POLICY],
      baselinePolicyId: 'fifo',
      candidateId: 'priority-v3',
      comparisons: [
        { candidateId: 'priority-v3', referenceId: 'fifo-manual' },
        { candidateId: 'priority-v3', referenceId: 'virtual-fifo' },
      ],
      classification,
      bootstrap: { resamples: 200, confidence: 0.95, seed: 20261121 },
      dimensions: [
        {
          id: 'overtake-bound',
          title: 'Overtake bound K',
          parameter: 'maxOvertakes',
          values: [15, 30],
        },
        { id: 'lanes', title: 'Lanes open', parameter: 'lanesDelta', values: [0, 1] },
      ],
    }),
    {
      generator: { name: 'test', version: '0.0.0' },
      commit: 'test',
      scenarioHash,
      sweepHash: 'sha256:test',
      specPath: 'sweeps/golden-sweep.yaml',
    },
  );
  const files: [string, string][] = [
    ['demo-seeds-1-3.results.json', stringifyResults(doc)],
    ['demo-seeds-1-3.report.md', renderReport(doc)],
    ['demo-seeds-1-3.report.html', renderHtmlReport(doc)],
    ['disrupted-seeds-1-3.report.md', renderReport(disruptedDoc)],
    ['sweep-seeds-1-2.sweep.json', stringifySweep(sweepDoc)],
    ['sweep-seeds-1-2.sweep.md', renderSweepReport(sweepDoc)],
    ['sweep-seeds-1-2.sweep.html', renderSweepHtml(sweepDoc)],
  ];

  it('writes well-formed HTML with the disclaimer, the charts and every table', () => {
    for (const html of [renderHtmlReport(doc), renderSweepHtml(sweepDoc)]) {
      expect(balancedTags(html)).toBe(true);
      expect(html).toContain('SIMULATED RESULTS ON SYNTHETIC OR HYPOTHETICAL DATA');
      expect(html).toContain('<svg viewBox=');
      expect(html).not.toMatch(/NaN|undefined|Infinity/);
      expect(html).toContain('prefers-color-scheme: dark');
    }
    const report = renderHtmlReport(doc);
    for (const assumption of doc.assumptions) expect(report).toContain(assumption.path);
    expect(report.match(/<table>/g)?.length).toBe(renderReport(doc).match(/\n\|---/g)?.length);
    expect(renderSweepHtml(sweepDoc).match(/<figure class="chart">/g)).toHaveLength(4);
  });

  if (process.env.UPDATE_GOLDEN === '1') {
    mkdirSync(goldenDir, { recursive: true });
    for (const [name, content] of files) writeFileSync(new URL(name, goldenDir), content);
  }

  it.each(files)('%s matches the committed golden file', (name, content) => {
    expect(content).toBe(readFileSync(new URL(name, goldenDir), 'utf8'));
  });
});
