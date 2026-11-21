import { SOURCE_LABELS } from './schema';
import type { Scenario, SourceLabel } from './schema';

/** One labelled parameter of a scenario, as listed in the assumptions table of every report. */
export interface Assumption {
  /** Dotted path of the parameter in the scenario, e.g. `checkpoint.lanes`. */
  readonly path: string;
  readonly value: unknown;
  readonly source: SourceLabel;
  /** The entry of the scenario's data sources the value comes from, if any. */
  readonly ref: string | null;
  readonly note: string | null;
}

function isParam(
  node: unknown,
): node is { value: unknown; source: SourceLabel; ref?: string; note?: string } {
  if (typeof node !== 'object' || node === null || Array.isArray(node)) return false;
  const record = node as Record<string, unknown>;
  return (
    'value' in record &&
    typeof record.source === 'string' &&
    (SOURCE_LABELS as readonly string[]).includes(record.source)
  );
}

/** Lists every labelled parameter of the scenario, in document order. */
export function collectAssumptions(scenario: Scenario): Assumption[] {
  const out: Assumption[] = [];
  const visit = (node: unknown, path: string[]): void => {
    if (isParam(node)) {
      out.push({
        path: path.join('.'),
        value: node.value,
        source: node.source,
        ref: node.ref ?? null,
        note: node.note ?? null,
      });
      return;
    }
    if (typeof node !== 'object' || node === null) return;
    if (Array.isArray(node)) {
      node.forEach((child: unknown, i) => {
        visit(child, [...path, String(i)]);
      });
      return;
    }
    for (const [key, child] of Object.entries(node)) visit(child, [...path, key]);
  };
  visit(scenario, []);
  return out;
}
