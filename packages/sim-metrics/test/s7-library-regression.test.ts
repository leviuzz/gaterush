import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { POLICY_PRESETS, PRIORITY_V2_POLICY, classificationOf } from '@gateflow/queue-core';
import { parseScenarioText } from '@gateflow/sim-scenarios';
import { describe, expect, it } from 'vitest';
import { applyScenarioSettings, roundNumbers, runExperiment } from '../src';

/**
 * The library days moved into airport configurations (airports/*.yaml) after the S7 reports. Days
 * 1-2 must give exactly the per-day results published in docs/reports/slice-7, with the
 * checkpoint settings applied to the policies as the CLI does.
 */
const fixture = JSON.parse(
  readFileSync(new URL('./fixtures/s7-library-days-1-2.json', import.meta.url), 'utf8'),
) as Record<string, { comparisons: Record<string, unknown> }[]>;

const scenarios = new URL('../../../scenarios/', import.meta.url);

describe('regression: the library days in airport configurations reproduce S7', () => {
  it.each(['tsf-like-peak-day', 'mx-like-transfer-hub'])(
    '%s, days 1-2',
    (id) => {
      const scenario = parseScenarioText(
        readFileSync(new URL(`${id}.yaml`, scenarios), 'utf8'),
        'yaml',
        {
          read: (path) => readFileSync(new URL(path, scenarios), 'utf8'),
          sha256: (text) => createHash('sha256').update(text, 'utf8').digest('hex'),
        },
      );
      expect(scenario.airport).toBeDefined();
      const ids = ['fifo', 'fifo-manual', 'virtual-fifo', 'priority-v2', 'priority-v3'];
      const policies = applyScenarioSettings(
        ids.map((policyId) => POLICY_PRESETS.find((p) => p.id === policyId)!),
        scenario,
      );
      const expected = fixture[id]!;
      const result = runExperiment({
        scenario,
        seeds: [1, 2],
        policies,
        baselinePolicyId: 'fifo',
        comparisons: Object.keys(expected[0]!.comparisons).map((key) => {
          const [candidateId = '', referenceId = ''] = key.split(' vs ');
          return { candidateId, referenceId };
        }),
        // As the CLI: risk classes on arrival use the first priority policy listed (v2).
        classification: classificationOf(PRIORITY_V2_POLICY)!,
        bootstrap: { resamples: 10, confidence: 0.95, seed: 1 },
      });
      expect(roundNumbers(result.perSeed)).toEqual(expected);
    },
    120_000,
  );
});
