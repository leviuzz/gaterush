// Bundles the API and its workspace packages into one ESM file; npm dependencies stay in
// node_modules (pg's optional native driver is never loaded).
import { build } from 'esbuild';

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
  banner: {
    js: [
      '#!/usr/bin/env node',
      "import { createRequire as __gateflowCreateRequire } from 'node:module';",
      'const require = __gateflowCreateRequire(import.meta.url);',
    ].join('\n'),
  },
});
