import { canonicalJson, parseScenarioText } from '@gateflow/sim-scenarios';
import type { Scenario } from '@gateflow/sim-scenarios';
import { sha256Hex } from './sha256';

/** Files the Studio reads scenarios from, by path (`scenarios/x.yaml`, `airports/y.yaml`). */
export type FileMap = Readonly<Record<string, string>>;

/** A POSIX path without `.`, empty or redundant `..` segments. */
export function normalizePath(path: string): string {
  const parts: string[] = [];
  for (const part of path.split('/')) {
    if (part === '' || part === '.') continue;
    if (part === '..' && parts.length > 0 && parts[parts.length - 1] !== '..') {
      parts.pop();
    } else {
      parts.push(part);
    }
  }
  return parts.join('/');
}

/** The folder of a path (`''` for a file at the root). */
export function folderOf(path: string): string {
  const cut = path.lastIndexOf('/');
  return cut < 0 ? '' : path.slice(0, cut);
}

/** `path` as seen from the file at `from`, as the CLI resolves it on disk. */
export function resolveFrom(from: string, path: string): string {
  return path.startsWith('/') ? normalizePath(path) : normalizePath(`${folderOf(from)}/${path}`);
}

/** A file a scenario names that is not among the files given. */
export class MissingFileError extends Error {
  constructor(
    readonly path: string,
    readonly from: string,
  ) {
    super(`${from} needs the file ${path}, which is missing`);
    this.name = 'MissingFileError';
  }
}

/** The last segment of a path. */
export function fileName(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1);
}

/**
 * Loads the scenario at `path` as the CLI loads it from disk: the airport configuration it extends
 * and the flight list it names are read relative to it, and their SHA-256 is recorded. The same
 * files give the same scenario, so the same hash.
 *
 * Files a person adds in the browser come without their folders: with `looseFolder`, a file the
 * scenario names that is not at its path is looked for by name in that folder.
 */
export function loadScenarioFile(
  files: FileMap,
  path: string,
  options: { readonly looseFolder?: string } = {},
): Scenario {
  const text = files[path];
  if (text === undefined) throw new MissingFileError(path, 'the Studio');
  return parseScenarioText(text, path.toLowerCase().endsWith('.json') ? 'json' : 'yaml', {
    read: (relative) => {
      const target = resolveFrom(path, relative);
      const loose =
        options.looseFolder === undefined
          ? undefined
          : `${options.looseFolder}/${fileName(target)}`;
      const content = files[target] ?? (loose === undefined ? undefined : files[loose]);
      if (content === undefined) throw new MissingFileError(target, path);
      return content;
    },
    sha256: sha256Hex,
  });
}

/** Hash of a scenario as recorded in results (`sha256:` of its canonical JSON), as the CLI's. */
export function scenarioHash(scenario: Scenario): string {
  return `sha256:${sha256Hex(canonicalJson(scenario))}`;
}

/** The scenario as a JSON file the CLI can run (`gateflow-sim run --scenario <file>.json`). */
export function scenarioFileText(scenario: Scenario): string {
  return `${JSON.stringify(scenario, null, 2)}\n`;
}
