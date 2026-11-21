import { isMainThread, parentPort, workerData } from 'node:worker_threads';
import { runCli } from './cli';
import { createNodeIo } from './io';
import { WORKER_MARKER, serveTasks } from './pool';

if (!isMainThread && workerData === WORKER_MARKER && parentPort !== null) {
  // A thread of the pool: this file is the bundle, started again as a worker.
  serveTasks(parentPort);
} else {
  void runCli(
    process.argv.slice(2),
    createNodeIo({}, { workerScript: new URL(import.meta.url) }),
  ).then((code) => {
    process.exitCode = code;
  });
}
