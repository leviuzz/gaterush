// esbuild options of the CLI bundle: a single ESM file runnable with plain Node, which also serves
// as the script of its worker threads. Shared by build.mjs and the end-to-end tests.
export const bundleOptions = {
  entryPoints: [new URL('./src/main.ts', import.meta.url).pathname],
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
};
