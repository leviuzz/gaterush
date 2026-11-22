import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { findPolicyPreset } from '@gateflow/queue-core';
import type { Policy } from '@gateflow/queue-core';
import { canonicalJson, parseScenarioText } from '@gateflow/sim-scenarios';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_BOOTSTRAP,
  ExperimentConfigError,
  applyScenarioSettings,
  arrivalClassification,
  buildResults,
  experimentFromManifest,
  fingerprintMaterial,
  parseSeedRanges,
  recommendedComparisons,
  runExperiment,
  stringifyResults,
} from '../src';
import type { ExperimentConfig, ExperimentManifest, ResultsDocument } from '../src';

const scenario = parseScenarioText(
  readFileSync(new URL('../../../scenarios/single-checkpoint-demo.yaml', import.meta.url), 'utf8'),
);
const scenarioHash = `sha256:${createHash('sha256').update(canonicalJson(scenario)).digest('hex')}`;

const preset = (id: string): Policy => {
  const policy = findPolicyPreset(id);
  if (policy === undefined) throw new Error(`no preset ${id}`);
  return policy;
};

/** The experiment the CLI runs for `--seeds 3-4,9 --policies fifo,priority-v3`. */
function cliExperiment(): ExperimentConfig {
  const policies = applyScenarioSettings([preset('fifo'), preset('priority-v3')], scenario);
  return {
    scenario,
    seeds: [3, 4, 9],
    policies,
    baselinePolicyId: 'fifo',
    comparisons: recommendedComparisons(policies, 'fifo'),
    classification: arrivalClassification(policies),
    bootstrap: { ...DEFAULT_BOOTSTRAP, resamples: 200 },
  };
}

function resultsOf(
  config: ExperimentConfig,
  generator = { name: 'gateflow-sim', version: '1.0.0' },
  commit = 'abc',
) {
  return stringifyResults(buildResults(runExperiment(config), { generator, commit, scenarioHash }));
}

const manifestOf = (text: string) =>
  (JSON.parse(text) as ResultsDocument).manifest as unknown as ExperimentManifest;

describe('results reproduced from their manifest (S19)', () => {
  it('reads seed ranges as results write them', () => {
    expect(parseSeedRanges('1-3,7')).toEqual([1, 2, 3, 7]);
    expect(parseSeedRanges('9,2-3')).toEqual([2, 3, 9]);
    expect(() => parseSeedRanges('3-1')).toThrow(ExperimentConfigError);
    expect(() => parseSeedRanges('1-x')).toThrow(ExperimentConfigError);
    expect(() => parseSeedRanges('')).toThrow(ExperimentConfigError);
    expect(() => parseSeedRanges('1-1001', 1000)).toThrow(/at most 1000/);
  });

  it('gives the same results from the manifest, whoever computes them', () => {
    const original = resultsOf(cliExperiment());
    const manifest = manifestOf(original);
    // As a server reads it back: JSON, the policies whole.
    const again = experimentFromManifest(
      JSON.parse(JSON.stringify(manifest)) as ExperimentManifest,
      scenario,
    );
    expect(resultsOf(again)).toBe(original);
    // Another tool, another revision: other bytes, the same fingerprint.
    const elsewhere = resultsOf(again, { name: 'gateflow-api', version: '0.19.0' }, 'def');
    expect(elsewhere).not.toBe(original);
    expect(fingerprintMaterial(elsewhere)).toBe(fingerprintMaterial(original));
    // Whatever the formatting of the file.
    expect(fingerprintMaterial(JSON.stringify(JSON.parse(original)))).toBe(
      fingerprintMaterial(original),
    );
    // Other days are other results.
    const other = resultsOf({ ...cliExperiment(), seeds: [3, 4, 10] });
    expect(fingerprintMaterial(other)).not.toBe(fingerprintMaterial(original));
  });

  it('refuses a manifest that GateFlow tools would not have written', () => {
    const manifest = manifestOf(resultsOf(cliExperiment()));
    const refused = (change: Partial<ExperimentManifest>, message: RegExp) => {
      expect(() => experimentFromManifest({ ...manifest, ...change }, scenario)).toThrow(message);
    };
    refused({ seeds: { ranges: '3,4,9', count: 3 } }, /must be written as results write them/);
    refused({ seeds: { ranges: '3-4,9', count: 4 } }, /says 4 days/);
    refused({ policies: [] }, /at least one policy/);
    refused(
      { policies: manifest.policies.map((p) => ({ ...p, title: '' })) },
      /title must be a non-empty string/,
    );
    refused(
      { classification: { ...manifest.classification, safetyBufferMs: 1 } },
      /classification on arrival/,
    );
    refused(
      { statistics: { ...manifest.statistics, bootstrapResamples: 0 } },
      /bootstrapResamples/,
    );
    refused({ statistics: { ...manifest.statistics, confidenceLevel: 1 } }, /confidenceLevel/);
    expect(() => experimentFromManifest(manifest, scenario, { maxDays: 2 })).toThrow(
      /at most 2 seeds/,
    );
    expect(() => experimentFromManifest(manifest, scenario, { maxPolicies: 1 })).toThrow(
      /at most 1 policies/,
    );
  });

  it('takes the fingerprint of results documents only', () => {
    expect(() => fingerprintMaterial('not json')).toThrow(/not JSON/);
    expect(() => fingerprintMaterial('[1]')).toThrow(/not a results document/);
    expect(() => fingerprintMaterial('{"schema":"x"}')).toThrow(/no manifest/);
  });
});
