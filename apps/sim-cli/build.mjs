// Bundles the CLI and its workspace dependencies into a single ESM file runnable with plain Node.
import { build } from 'esbuild';

await build({
  entryPoints: ['src/main.ts'],
  outfile: 'dist/gateflow-sim.mjs',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  sourcemap: true,
  legalComments: 'linked',
  logLevel: 'warning',
  banner: {
    // Some CommonJS dependencies (e.g. yaml's Node build) call require() for built-in modules,
    // which an ESM bundle does not provide natively.
    js: [
      '#!/usr/bin/env node',
      "import { createRequire as __gateflowCreateRequire } from 'node:module';",
      'const require = __gateflowCreateRequire(import.meta.url);',
    ].join('\n'),
  },
});
