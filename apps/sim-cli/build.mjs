// Bundles the CLI and its workspace dependencies into a single ESM file runnable with plain Node.
import { build } from 'esbuild';
import { bundleOptions } from './bundle-options.mjs';

await build({ ...bundleOptions, outfile: 'dist/gateflow-sim.mjs' });
