import { readFileSync } from 'node:fs';
import {
  collectAssumptions,
  designDayRows,
  parseScenario,
  parseScenarioText,
} from '@gateflow/sim-scenarios';
import { describe, expect, it } from 'vitest';
import { renderDataSources, scenarioProvenance, sourceLabel } from '../src';

const demo = parseScenarioText(
  readFileSync(new URL('../../../scenarios/single-checkpoint-demo.yaml', import.meta.url), 'utf8'),
);

describe('data sources and licences', () => {
  it('lists every source with its terms and what it is used for', () => {
    const scenario = parseScenario({
      ...demo,
      dataSources: [
        ...demo.dataSources,
        {
          id: 'airport-schedule',
          title: 'Design-day schedule | summer',
          kind: 'AIRPORT_PROVIDED',
          provider: 'An airport',
          licence: 'Provided under a data agreement; evaluation only.',
          url: 'https://example.org/schedule',
          retrieved: '2026-11-21',
          note: 'Peak Saturday of the season.',
        },
      ],
      schedule: {
        kind: 'flight-list',
        generatorSeed: 1,
        flights: {
          source: 'airport-schedule',
          file: 'flights/peak.csv',
          sha256: 'cd'.repeat(32),
          rows: designDayRows(demo),
        },
        gateZones: demo.schedule.gateZones,
      },
      passengers: {
        ...demo.passengers,
        transferShare: { ...demo.passengers.transferShare, ref: 'airport-schedule' },
      },
    });
    const provenance = scenarioProvenance(scenario);
    expect(provenance.schedule).toEqual({
      kind: 'flight-list',
      flights: 40,
      file: 'flights/peak.csv',
      sha256: 'cd'.repeat(32),
      source: 'airport-schedule',
    });
    const assumptions = collectAssumptions(scenario);
    const transfer = assumptions.find((a) => a.path === 'passengers.transferShare');
    expect(transfer === undefined ? '' : sourceLabel(transfer)).toBe(
      'SYNTHETIC (airport-schedule)',
    );
    expect(renderDataSources('## 9. Data sources and licences', provenance, assumptions)).toEqual([
      '## 9. Data sources and licences',
      '',
      'Where the data of this scenario comes from, and the terms under which it may be used.',
      '',
      '| Source | Kind | Provider | Licence or terms of use | Retrieved | Used for |',
      '|---|---|---|---|---|---|',
      '| Synthetic assumptions of this scenario (`gateflow-synthetic`) | SYNTHETIC | GateFlow | Created for GateFlow; contains no third-party data. | - | - |',
      '| [Design-day schedule \\| summer](https://example.org/schedule) (`airport-schedule`) | AIRPORT_PROVIDED | An airport | Provided under a data agreement; evaluation only. | 2026-11-21 | flight list, passengers.transferShare |',
      '',
      '- `airport-schedule`: Peak Saturday of the season.',
      '',
      `Design day: 40 departures from the flight list \`flights/peak.csv\` (SHA-256 \`${'cd'.repeat(32)}\`), source \`airport-schedule\`.`,
      '',
    ]);
  });
});
