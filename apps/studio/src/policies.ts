import { POLICY_PRESETS } from '@gateflow/queue-core';

/** A policy the Studio offers, with the name people know it by. */
export interface PolicyRow {
  readonly id: string;
  readonly name: string;
  /** Earlier versions, shown on request. */
  readonly earlier?: boolean;
}

export const POLICY_ROWS: readonly PolicyRow[] = [
  { id: 'fifo', name: 'Physical queue, as today (A)' },
  { id: 'fifo-manual', name: "Physical queue with staff calling closing flights (A')" },
  { id: 'virtual-fifo', name: 'Virtual queue, called in arrival order' },
  { id: 'priority-v3', name: 'GateFlow priority v3' },
  { id: 'priority-v2', name: 'GateFlow priority v2', earlier: true },
  { id: 'priority-v1', name: 'GateFlow priority v1', earlier: true },
  { id: 'priority-v1-strict', name: 'GateFlow priority v1, late-arrival rule', earlier: true },
  { id: 'priority-v0', name: 'GateFlow priority v0', earlier: true },
];

/** How lanes are run: the plan only, a supervisor (today), or GateFlow's recommendations (S8). */
export const LANE_MODE_COLUMNS = [
  { suffix: '', label: 'Plan only', short: 'Plan' },
  {
    suffix: '@reactive',
    label: 'A supervisor opens extra lanes when the queue is long',
    short: 'Supervisor',
  },
  {
    suffix: '@predict',
    label: "Extra lanes on GateFlow's recommendation",
    short: 'GateFlow lanes',
  },
] as const;

/**
 * The chosen policies in the order of the CLI's runs: presets in preset order, each with the plan,
 * then the supervisor, then GateFlow's lanes. The first is the default status quo, and the first
 * priority policy sets the risk classes on arrival.
 */
export function orderedPolicyIds(chosen: ReadonlySet<string>): string[] {
  const ids: string[] = [];
  for (const preset of POLICY_PRESETS) {
    for (const mode of LANE_MODE_COLUMNS) {
      const id = `${preset.id}${mode.suffix}`;
      if (chosen.has(id)) ids.push(id);
    }
  }
  return ids;
}

export function policyName(id: string): string {
  const at = id.indexOf('@');
  const base = at < 0 ? id : id.slice(0, at);
  const name = POLICY_ROWS.find((row) => row.id === base)?.name ?? base;
  if (at < 0) return name;
  return id.endsWith('@reactive') ? `${name}, supervisor's lanes` : `${name}, GateFlow's lanes`;
}
