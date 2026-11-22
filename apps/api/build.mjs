// Bundles the API and its workspace packages into one ESM file; npm dependencies stay in
// node_modules (pg's optional native driver is never loaded).
import { execFileSync } from 'node:child_process';
import { build } from 'esbuild';

/** The source revision, as the CLI records it (ADR-014): `-dirty` when the tree differs. */
function commit() {
  const fromEnv = process.env.GATEFLOW_COMMIT ?? process.env.GITHUB_SHA;
  if (fromEnv) return fromEnv;
  const git = (...args) =>
    execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  try {
    const head = git('rev-parse', 'HEAD');
    return git('status', '--porcelain') === '' ? head : `${head}-dirty`;
  } catch {
    return 'unknown';
  }
}

await build({
  entryPoints: ['src/main.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  outfile: 'dist/gateflow-api.mjs',
  sourcemap: true,
  logLevel: 'warning',
  external: ['fastify', 'pg', 'pg-native', 'drizzle-orm', 'zod', 'yaml'],
  // The revision the simulations' results record (S19).
  define: { __GATEFLOW_COMMIT__: JSON.stringify(commit()) },
  banner: {
    js: [
      '#!/usr/bin/env node',
      "import { createRequire as __gateflowCreateRequire } from 'node:module';",
      'const require = __gateflowCreateRequire(import.meta.url);',
    ].join('\n'),
  },
});
