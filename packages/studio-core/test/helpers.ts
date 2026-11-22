import { readFileSync, readdirSync } from 'node:fs';
import type { FileMap } from '../src';

const root = new URL('../../../', import.meta.url);

/** The scenario library of the repository, as the Studio embeds it. */
export function repositoryFiles(): FileMap {
  const files: Record<string, string> = {};
  for (const folder of ['airports', 'scenarios', 'scenarios/flights']) {
    for (const name of readdirSync(new URL(`${folder}/`, root))) {
      if (!/\.(ya?ml|json|csv)$/i.test(name)) continue;
      files[`${folder}/${name}`] = readFileSync(new URL(`${folder}/${name}`, root), 'utf8');
    }
  }
  return files;
}

export const repositoryRoot = root;
