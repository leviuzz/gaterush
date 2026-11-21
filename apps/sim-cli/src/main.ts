import { runCli } from './cli';
import { createNodeIo } from './io';

process.exitCode = runCli(process.argv.slice(2), createNodeIo());
