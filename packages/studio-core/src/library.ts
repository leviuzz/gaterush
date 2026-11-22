import { generateSchedule } from '@gateflow/sim-scenarios';
import type { Scenario } from '@gateflow/sim-scenarios';
import { loadScenarioFile } from './files';
import type { FileMap } from './files';

/** A scenario the Studio offers, with what its list shows. */
export interface LibraryEntry {
  readonly path: string;
  readonly scenario: Scenario;
  /** Airport and checkpoint, for a scenario that extends an airport configuration. */
  readonly airport: {
    readonly id: string;
    readonly name: string;
    readonly checkpoint: string;
  } | null;
  readonly flights: number;
  /** True when the checkpoint has staff on call for extra lanes (S8). */
  readonly extraLanes: boolean;
}

export interface Library {
  readonly entries: readonly LibraryEntry[];
  /** Scenario files that could not be loaded, with the reason. */
  readonly errors: readonly { readonly path: string; readonly message: string }[];
}

/** True for an airport configuration (`kind: airport`), which is not a scenario of its own. */
export function isAirportFile(text: string): boolean {
  return /^\s*["']?kind["']?\s*:\s*["']?airport["']?\s*,?\s*$/m.test(text);
}

/** Scenario files among `files`: YAML or JSON files directly in `folder`. */
export function scenarioPaths(files: FileMap, folder = 'scenarios'): string[] {
  return Object.keys(files)
    .filter((path) => {
      if (!path.startsWith(`${folder}/`)) return false;
      const name = path.slice(folder.length + 1);
      return !name.includes('/') && /\.(ya?ml|json)$/i.test(name);
    })
    .sort();
}

/**
 * Loads every scenario of `folder`. Scenarios of an airport come first, by airport and in file
 * order; the others follow.
 */
export function loadLibrary(
  files: FileMap,
  folder = 'scenarios',
  options: { readonly looseFolder?: string } = {},
): Library {
  const entries: LibraryEntry[] = [];
  const errors: { path: string; message: string }[] = [];
  for (const path of scenarioPaths(files, folder)) {
    if (isAirportFile(files[path] ?? '')) continue;
    try {
      const scenario = loadScenarioFile(files, path, options);
      entries.push({
        path,
        scenario,
        airport:
          scenario.airport === undefined
            ? null
            : {
                id: scenario.airport.id,
                name: scenario.airport.name,
                checkpoint: scenario.airport.checkpoint,
              },
        flights: generateSchedule(scenario).length,
        extraLanes: scenario.checkpoint.laneStaffing !== undefined,
      });
    } catch (error) {
      errors.push({ path, message: error instanceof Error ? error.message : String(error) });
    }
  }
  const rank = (entry: LibraryEntry) => (entry.airport === null ? 1 : 0);
  const order = (x: string, y: string) => (x < y ? -1 : x > y ? 1 : 0);
  entries.sort(
    (a, b) =>
      rank(a) - rank(b) ||
      order(a.airport?.name ?? '', b.airport?.name ?? '') ||
      order(a.path, b.path),
  );
  return { entries, errors };
}
