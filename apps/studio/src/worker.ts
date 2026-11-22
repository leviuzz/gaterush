import { assembleExperiment, planExperiment, runDay } from '@gateflow/sim-metrics';
import type { DayJob } from '@gateflow/sim-metrics';
import { studioResults } from '@gateflow/studio-core';
import type { WorkerReply, WorkerRequest } from './protocol';

/**
 * The Web Worker of the Studio. It plans a run (the arrival forecast takes seconds), simulates days
 * of a job (received once, then one seed per message) and computes the statistics. Each answer
 * depends only on the request: the results are those of the page or of the CLI.
 */
const scope = self as unknown as {
  onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null;
  postMessage(message: WorkerReply): void;
};

let job: DayJob | undefined;

function answer(request: WorkerRequest): WorkerReply | undefined {
  switch (request.type) {
    case 'plan':
      return { type: 'planned', plan: planExperiment(request.config) };
    case 'job':
      job = request.job;
      return undefined;
    case 'day':
      if (job === undefined) throw new Error('the worker has no job');
      return { type: 'day', index: request.index, day: runDay(job, request.seed) };
    case 'results':
      return {
        type: 'results',
        doc: studioResults(assembleExperiment(request.config, request.days), request.build),
      };
  }
}

scope.onmessage = (event) => {
  const request = event.data;
  try {
    const reply = answer(request);
    if (reply !== undefined) scope.postMessage(reply);
  } catch (error) {
    scope.postMessage({
      type: 'error',
      index: request.type === 'day' ? request.index : -1,
      message: error instanceof Error ? error.message : String(error),
    });
  }
};
