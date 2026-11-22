import { MS_PER_MINUTE } from '@gateflow/domain';
import { findPolicyPreset, validatePolicy } from '@gateflow/queue-core';
import type { Policy } from '@gateflow/queue-core';
import type { Scenario } from '@gateflow/sim-scenarios';

/**
 * The policies as configured for the scenario's checkpoint:
 * - the GateFlow settings (`scenario.gateflow`) set the fairness bounds of every priority
 *   policy, the hysteresis and maximum data age of the versions that have these rules (v3), the
 *   call-ahead, response estimate and prepare window of every virtual queue, and the target wait
 *   and horizon of GateFlow's lane recommendations (`@predict`); the console's (`@advise`, S22.3)
 *   keep the console's own numbers, as the console does;
 * - today's practice (`scenario.todayPractice`) sets when staff call closing flights in baseline
 *   A' (`fifo-manual` and any flight-call policy), and when the supervisor opens and closes extra
 *   lanes (`@reactive`).
 *
 * Settings the scenario does not give keep the values of the policy. Ids and versions do not
 * change: the reports list every parameter and the differences from the preset.
 */
export function applyScenarioSettings(
  policies: readonly Policy[],
  scenario: Pick<Scenario, 'gateflow' | 'todayPractice'>,
): Policy[] {
  const gateflow = scenario.gateflow?.value;
  const practice = scenario.todayPractice?.value;
  return policies.map((policy) => {
    let { selection, queue } = policy;
    if (gateflow !== undefined && selection.kind === 'constrained-edf') {
      selection = {
        ...selection,
        ...(gateflow.maxOvertakes === undefined ? {} : { maxOvertakes: gateflow.maxOvertakes }),
        ...(gateflow.capMaxPriorityCalls === undefined
          ? {}
          : { capMaxPriorityCalls: gateflow.capMaxPriorityCalls }),
        ...(gateflow.capWindowCalls === undefined
          ? {}
          : { capWindowCalls: gateflow.capWindowCalls }),
        // The data-quality rules only set versions that have them (v3): they do not add them to
        // v0 to v2, which are defined without.
        ...(gateflow.hysteresisMinutes === undefined || selection.hysteresisMs === 0
          ? {}
          : { hysteresisMs: Math.round(gateflow.hysteresisMinutes * MS_PER_MINUTE) }),
        ...(gateflow.maxDeadlineAgeMinutes === undefined || selection.maxDeadlineAgeMs === null
          ? {}
          : {
              maxDeadlineAgeMs:
                gateflow.maxDeadlineAgeMinutes === null
                  ? null
                  : Math.round(gateflow.maxDeadlineAgeMinutes * MS_PER_MINUTE),
            }),
      };
    }
    if (gateflow !== undefined && queue.kind === 'virtual') {
      queue = {
        ...queue,
        ...(gateflow.callAheadSeconds === undefined
          ? {}
          : { callAheadSeconds: gateflow.callAheadSeconds }),
        ...(gateflow.responseEstimateSeconds === undefined
          ? {}
          : { responseEstimateSeconds: gateflow.responseEstimateSeconds }),
        ...(gateflow.prepareWindowSize === undefined
          ? {}
          : { prepareWindowSize: gateflow.prepareWindowSize }),
      };
    }
    if (practice !== undefined && selection.kind === 'flight-call') {
      selection = {
        ...selection,
        callWindowMs: Math.round(practice.callWindowMinutes * MS_PER_MINUTE),
        announcementIntervalMs: Math.round(practice.announcementIntervalMinutes * MS_PER_MINUTE),
      };
    }
    const ms = (minutes: number | undefined) =>
      minutes === undefined ? undefined : Math.round(minutes * MS_PER_MINUTE);
    let { lanes } = policy;
    if (practice !== undefined && lanes?.kind === 'reactive') {
      const open = ms(practice.laneOpenWaitMinutes);
      const close = ms(practice.laneCloseWaitMinutes);
      if (open !== undefined || close !== undefined) {
        lanes = {
          ...lanes,
          ...(open === undefined ? {} : { openWhenWaitMs: open }),
          ...(close === undefined ? {} : { closeWhenWaitMs: close }),
        };
      }
    }
    if (gateflow !== undefined && lanes?.kind === 'predict') {
      const target = ms(gateflow.laneTargetWaitMinutes);
      const horizon = ms(gateflow.laneHorizonMinutes);
      if (target !== undefined || horizon !== undefined) {
        lanes = {
          ...lanes,
          ...(target === undefined ? {} : { targetWaitMs: target }),
          ...(horizon === undefined ? {} : { horizonMs: horizon }),
        };
      }
    }
    if (selection === policy.selection && queue === policy.queue && lanes === policy.lanes) {
      return policy;
    }
    const configured: Policy = {
      ...policy,
      selection,
      queue,
      ...(lanes === undefined ? {} : { lanes }),
    };
    validatePolicy(configured);
    return configured;
  });
}

/** A parameter of a policy that differs from its preset: `selection.maxOvertakes` and so on. */
export interface PresetDifference {
  readonly parameter: string;
  readonly value: unknown;
  readonly preset: unknown;
}

/**
 * Where a policy differs from the preset with the same id (an empty list for presets used as
 * they are, or for policies that are not presets).
 */
export function differencesFromPreset(policy: Policy): PresetDifference[] {
  const preset = findPolicyPreset(policy.id);
  if (preset === undefined) return [];
  const out: PresetDifference[] = [];
  for (const part of ['selection', 'queue', 'lanes'] as const) {
    const actual = (policy[part] ?? {}) as unknown as Record<string, unknown>;
    const expected = (preset[part] ?? {}) as unknown as Record<string, unknown>;
    for (const key of Object.keys(actual)) {
      if (JSON.stringify(actual[key]) !== JSON.stringify(expected[key])) {
        out.push({ parameter: `${part}.${key}`, value: actual[key], preset: expected[key] });
      }
    }
  }
  return out;
}
