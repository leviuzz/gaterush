import { FIFO_MANUAL_POLICY, POLICY_PRESETS, PRIORITY_V3_POLICY } from '@gateflow/queue-core';
import { describe, expect, it } from 'vitest';
import { applyScenarioSettings, differencesFromPreset } from '../src';

describe('checkpoint settings applied to the policies', () => {
  it('leaves every preset unchanged without settings, or with the preset values', () => {
    expect(applyScenarioSettings(POLICY_PRESETS, {})).toEqual(POLICY_PRESETS);
    const sameAsPresets = applyScenarioSettings(POLICY_PRESETS, {
      gateflow: {
        value: {
          maxOvertakes: 30,
          capMaxPriorityCalls: 10,
          capWindowCalls: 20,
          hysteresisMinutes: 3,
          maxDeadlineAgeMinutes: 60,
          prepareWindowSize: 10,
          callAheadSeconds: 180,
          responseEstimateSeconds: 90,
        },
        source: 'SYNTHETIC',
      },
      todayPractice: {
        value: { callWindowMinutes: 20, announcementIntervalMinutes: 5 },
        source: 'SYNTHETIC',
      },
    });
    const v3 = sameAsPresets.find((p) => p.id === 'priority-v3');
    expect(v3).toEqual(PRIORITY_V3_POLICY);
    expect(sameAsPresets.find((p) => p.id === 'fifo-manual')).toEqual(FIFO_MANUAL_POLICY);
    for (const policy of sameAsPresets.filter((p) => p.id.startsWith('priority-v3'))) {
      expect(differencesFromPreset(policy)).toEqual([]);
    }
  });

  it('sets K, the cap, hysteresis, data age and the virtual queue, and staff calls of A', () => {
    const [manual, v3, virtualFifo] = applyScenarioSettings(
      [FIFO_MANUAL_POLICY, PRIORITY_V3_POLICY, POLICY_PRESETS[2]!],
      {
        gateflow: {
          value: { maxOvertakes: 15, maxDeadlineAgeMinutes: null, callAheadSeconds: 300 },
          source: 'AIRPORT_PROVIDED',
        },
        todayPractice: {
          value: { callWindowMinutes: 30, announcementIntervalMinutes: 10 },
          source: 'AIRPORT_PROVIDED',
        },
      },
    );
    expect(v3?.selection).toMatchObject({ maxOvertakes: 15, maxDeadlineAgeMs: null });
    expect(v3?.queue).toMatchObject({ callAheadSeconds: 300, responseEstimateSeconds: 90 });
    expect(virtualFifo?.queue).toMatchObject({ callAheadSeconds: 300 });
    expect(virtualFifo?.selection).toEqual({ kind: 'fifo' });
    expect(manual?.selection).toEqual({
      kind: 'flight-call',
      callWindowMs: 30 * 60_000,
      announcementIntervalMs: 10 * 60_000,
    });
    expect(v3 === undefined ? [] : differencesFromPreset(v3)).toEqual([
      { parameter: 'selection.maxOvertakes', value: 15, preset: 30 },
      { parameter: 'selection.maxDeadlineAgeMs', value: null, preset: 3_600_000 },
      { parameter: 'queue.callAheadSeconds', value: 300, preset: 180 },
    ]);
  });

  it('sets the data-quality rules only on versions that have them', () => {
    const v2 = POLICY_PRESETS.find((p) => p.id === 'priority-v2')!;
    const [configured] = applyScenarioSettings([v2], {
      gateflow: {
        value: { hysteresisMinutes: 5, maxDeadlineAgeMinutes: 30, maxOvertakes: 20 },
        source: 'SYNTHETIC',
      },
    });
    expect(configured?.selection).toMatchObject({
      hysteresisMs: 0,
      maxDeadlineAgeMs: null,
      maxOvertakes: 20,
    });
  });

  it('rejects settings that make a policy invalid', () => {
    expect(() =>
      applyScenarioSettings([PRIORITY_V3_POLICY], {
        gateflow: { value: { capMaxPriorityCalls: 25 }, source: 'SYNTHETIC' },
      }),
    ).toThrow(/capMaxPriorityCalls/);
  });
});
