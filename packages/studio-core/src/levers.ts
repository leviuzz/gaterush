import { LANE_MODES, PRIORITY_V3_POLICY } from '@gateflow/queue-core';
import { applySetting } from '@gateflow/sim-metrics';
import type { SweepParameter } from '@gateflow/sim-metrics';
import { ScenarioValidationError, parseScenario } from '@gateflow/sim-scenarios';
import type { GateflowSettings, Scenario } from '@gateflow/sim-scenarios';
import { changedParameters, scenarioCopy } from './parameters';

/**
 * A what-if setting of the Studio: one number that changes the scenario, as the curves of a
 * sensitivity sweep do. Relative settings (lanes added, passengers, arrival shift) start from the
 * scenario as written; the others replace its value.
 */
export interface Lever {
  readonly id: string;
  readonly label: string;
  readonly unit: string;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  /** The value in the scenario as written, or `null` when the setting does not apply to it. */
  base(scenario: Scenario): number | null;
  apply(scenario: Scenario, value: number): Scenario;
}

function sweepLever(
  id: string,
  label: string,
  unit: string,
  parameter: SweepParameter,
  range: { readonly min: number; readonly max: number; readonly step: number },
  base: (scenario: Scenario) => number | null,
): Lever {
  return {
    id,
    label,
    unit,
    ...range,
    base,
    apply: (scenario, value) =>
      applySetting({ scenario, policies: [] }, { parameter, value }, '').scenario,
  };
}

const GATEFLOW_DEFAULTS = {
  maxOvertakes:
    PRIORITY_V3_POLICY.selection.kind === 'constrained-edf'
      ? PRIORITY_V3_POLICY.selection.maxOvertakes
      : 30,
  laneTargetWaitMinutes:
    LANE_MODES.predict?.lanes.kind === 'predict'
      ? LANE_MODES.predict.lanes.targetWaitMs / 60_000
      : 10,
} as const;

function gateflowLever(
  id: string,
  label: string,
  unit: string,
  key: 'maxOvertakes' | 'laneTargetWaitMinutes',
  range: { readonly min: number; readonly max: number; readonly step: number },
): Lever {
  return {
    id,
    label,
    unit,
    ...range,
    base: (scenario) => scenario.gateflow?.value[key] ?? GATEFLOW_DEFAULTS[key],
    apply: (scenario, value) => {
      const copy = scenarioCopy(scenario);
      const current = scenario.gateflow;
      const settings: GateflowSettings = { ...(current?.value ?? {}), [key]: value };
      copy.gateflow =
        current === undefined
          ? { value: settings, source: 'SYNTHETIC' }
          : { ...current, value: settings };
      return parseScenario(copy);
    },
  };
}

/** The what-if settings the Studio shows first, in the order they are applied. */
export const LEVERS: readonly Lever[] = [
  sweepLever(
    'lanes',
    'Lanes added to every hour of the plan',
    'lanes',
    'lanesDelta',
    { min: -4, max: 4, step: 1 },
    () => 0,
  ),
  sweepLever(
    'screening',
    'Screening time per person',
    's',
    'serviceTimeMeanSeconds',
    { min: 10, max: 90, step: 1 },
    (s) => s.checkpoint.serviceTimeMeanSeconds.value,
  ),
  sweepLever(
    'passengers',
    'Passengers per flight (multiple of the load factor)',
    '×',
    'loadFactorScale',
    { min: 0.5, max: 1.3, step: 0.05 },
    () => 1,
  ),
  sweepLever(
    'arrivals',
    'Passengers arrive earlier (+) or later (−)',
    'min',
    'showUpShiftMinutes',
    { min: -30, max: 30, step: 5 },
    () => 0,
  ),
  sweepLever(
    'outages',
    'Lane outages per day',
    'per day',
    'laneOutagesPerDay',
    { min: 0, max: 8, step: 1 },
    (s) => s.disruptions.laneOutages.value.perDay,
  ),
  sweepLever(
    'extra-lanes',
    'Extra lanes the staff on call can open',
    'lanes',
    'maxExtraLanes',
    { min: 0, max: 6, step: 1 },
    (s) => s.checkpoint.laneStaffing?.value.maxExtraLanes ?? null,
  ),
  sweepLever(
    'open-delay',
    'Time to open an extra lane',
    'min',
    'laneOpenDelayMinutes',
    { min: 1, max: 60, step: 1 },
    (s) => s.checkpoint.laneStaffing?.value.openDelayMinutes.median ?? null,
  ),
  sweepLever(
    'follow',
    "Share of GateFlow's lane recommendations followed",
    'share',
    'laneFollowShare',
    { min: 0, max: 1, step: 0.05 },
    (s) => s.checkpoint.laneStaffing?.value.followShare ?? null,
  ),
  gateflowLever('k', 'Overtake bound K', 'people', 'maxOvertakes', { min: 0, max: 200, step: 5 }),
  gateflowLever(
    'target-wait',
    "GateFlow's target wait for extra lanes",
    'min',
    'laneTargetWaitMinutes',
    { min: 1, max: 60, step: 1 },
  ),
];

function formatNumber(value: number): string {
  return String(Math.round(value * 1000) / 1000);
}

/**
 * The scenario with the what-if settings applied in the order of `LEVERS`, each from the value the
 * scenario as written has. Every parameter a setting changes is marked as a SYNTHETIC assumption,
 * with a note naming the setting and the value of the scenario. The id and title say that the
 * scenario was changed, so that results never pass for those of the scenario as written.
 */
export function withLevers(base: Scenario, values: Readonly<Record<string, number>>): Scenario {
  let scenario = base;
  const notes = new Map<string, string[]>();
  for (const lever of LEVERS) {
    const value = values[lever.id];
    const original = lever.base(base);
    if (value === undefined || original === null || value === original) continue;
    if (!Number.isFinite(value)) {
      throw new ScenarioValidationError([`${lever.label}: ${String(value)} is not a number`]);
    }
    const before = scenario;
    try {
      scenario = lever.apply(scenario, value);
    } catch (error) {
      throw new ScenarioValidationError([
        `${lever.label}: ${error instanceof Error ? error.message : String(error)}`,
      ]);
    }
    const text = `${lever.label} ${formatNumber(value)} ${lever.unit} (the scenario says ${formatNumber(original)})`;
    for (const change of changedParameters(before, scenario)) {
      notes.set(change.path, [...(notes.get(change.path) ?? []), text]);
    }
  }
  if (notes.size === 0) return base;
  return markWhatIf(scenario, notes);
}

/** Marks changed parameters as what-if assumptions and renames the scenario. */
export function markWhatIf(
  scenario: Scenario,
  notes: ReadonlyMap<string, readonly string[]>,
): Scenario {
  const copy = scenarioCopy(scenario);
  for (const [path, texts] of notes) {
    let node: unknown = copy;
    for (const part of path.split('.')) {
      node =
        typeof node === 'object' && node !== null
          ? (node as Record<string, unknown>)[part]
          : undefined;
    }
    if (typeof node !== 'object' || node === null) continue;
    const parameter = node as Record<string, unknown>;
    parameter.source = 'SYNTHETIC';
    delete parameter.ref;
    parameter.note = `What-if in GateFlow Studio: ${texts.join('; ')}.`;
  }
  if (typeof copy.id === 'string' && !copy.id.endsWith('-what-if')) copy.id = `${copy.id}-what-if`;
  if (typeof copy.title === 'string' && !copy.title.endsWith(' (what-if)')) {
    copy.title = `${copy.title} (what-if)`;
  }
  return parseScenario(copy);
}
