import { ENGINE_VERSION } from '@gateflow/priority-engine';
import type { ClassificationParams } from '@gateflow/priority-engine';
import { QUEUE_CORE_VERSION } from '@gateflow/queue-core';
import type { Policy } from '@gateflow/queue-core';
import { KERNEL_VERSION } from '@gateflow/sim-kernel';
import { MODEL_VERSION } from '@gateflow/sim-model';
import type { DayEvent, PassengerOutcome, Population, RunStats } from '@gateflow/sim-model';
import { DISCLAIMER, comparisonKey, dayPopulation, simulatePolicy } from '@gateflow/sim-metrics';
import type { DayJob, PolicyComparison } from '@gateflow/sim-metrics';
import { GENERATOR_VERSION, SCENARIO_SCHEMA_VERSION, canonicalJson } from '@gateflow/sim-scenarios';

/** Version of the trace format (ADR-041). */
export const TRACE_SCHEMA = 'gateflow.sim.trace/1';

/** Version of this package. Bump on any change to the trace or to what is derived from it. */
export const TRACE_VERSION = '0.2.0';

/** One policy's day: every event in the order the simulator processed it, and its outcomes. */
export interface TracedRun {
  readonly policyId: string;
  readonly events: readonly DayEvent[];
  /** One outcome per party, aligned with `day.passengers`: the simulator's own result. */
  readonly outcomes: readonly PassengerOutcome[];
  readonly stats: RunStats;
}

/**
 * The trace of one simulated day: the day itself (checkpoint, flights, parties, disruptions,
 * staff), and the run of two policies on it, a reference and a candidate, on the same passengers.
 * It holds everything needed to replay the day, explain every call and run the day again.
 */
export interface TraceDocument {
  readonly schema: string;
  readonly disclaimer: string;
  readonly manifest: {
    readonly generator: { readonly name: string; readonly version: string };
    readonly commit: string;
    readonly versions: {
      readonly engine: string;
      readonly queueCore: string;
      readonly model: string;
      readonly kernel: string;
      readonly populationGenerator: string;
      readonly scenarioSchema: number;
      readonly trace: string;
    };
    readonly scenario: {
      readonly id: string;
      readonly title: string;
      readonly hash: string;
      readonly dataClassification: string;
      readonly timeZone: string;
    };
    readonly seed: number;
    readonly referenceId: string;
    readonly candidateId: string;
    /** Every policy of the run the day belongs to (they set the classification on arrival). */
    readonly policyIds: readonly string[];
    /** The reference, then the candidate. */
    readonly policies: readonly [Policy, Policy];
    readonly classification: ClassificationParams;
    readonly reproduce: string;
  };
  /** The simulated day, as generated from the scenario and the seed. */
  readonly day: Population;
  /** The reference's run, then the candidate's. */
  readonly runs: readonly [TracedRun, TracedRun];
}

export interface TraceInput {
  readonly generator: { readonly name: string; readonly version: string };
  readonly commit: string;
  /** Hash of the canonical scenario (e.g. `sha256:...`). */
  readonly scenarioHash: string;
}

/** Thrown when a day cannot be traced as asked. */
export class TraceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TraceError';
  }
}

/**
 * Simulates `policy` on `population` and keeps every event of the day; a policy `@advise` asks
 * GateFlow's console, from the scenario's `profile` (S22.3).
 */
export function recordRun(
  population: Population,
  policy: Policy,
  classification: ClassificationParams,
  profile?: DayJob['profile'],
): TracedRun {
  const events: DayEvent[] = [];
  const run = simulatePolicy(
    population,
    policy,
    {
      classification,
      observer: (event) => {
        events.push(event);
      },
    },
    profile,
  );
  return { policyId: policy.id, events, outcomes: run.outcomes, stats: run.stats };
}

/**
 * Traces day `seed` of a job (the job of a run: its scenario, policies, classification and
 * forecast) for one comparison. The day and the outcomes are exactly those of `runDay`: the same
 * population, the same policies, the same classification.
 */
export function traceDay(
  job: DayJob,
  seed: number,
  comparison: PolicyComparison,
  input: TraceInput,
): TraceDocument {
  const find = (id: string): Policy => {
    const policy = job.policies.find((p) => p.id === id);
    if (policy === undefined) throw new TraceError(`policy ${id} is not one of the run's policies`);
    return policy;
  };
  const reference = find(comparison.referenceId);
  const candidate = find(comparison.candidateId);
  if (reference.id === candidate.id) {
    throw new TraceError(`the comparison ${comparisonKey(comparison)} names one policy twice`);
  }
  const population = dayPopulation(job.scenario, job.forecast, seed);
  const { scenario } = job;
  const policyIds = job.policies.map((p) => p.id);
  return {
    schema: TRACE_SCHEMA,
    disclaimer: DISCLAIMER,
    manifest: {
      generator: input.generator,
      commit: input.commit,
      versions: {
        engine: ENGINE_VERSION,
        queueCore: QUEUE_CORE_VERSION,
        model: MODEL_VERSION,
        kernel: KERNEL_VERSION,
        populationGenerator: GENERATOR_VERSION,
        scenarioSchema: SCENARIO_SCHEMA_VERSION,
        trace: TRACE_VERSION,
      },
      scenario: {
        id: scenario.id,
        title: scenario.title,
        hash: input.scenarioHash,
        dataClassification: scenario.dataClassification,
        timeZone: scenario.timeZone,
      },
      seed,
      referenceId: reference.id,
      candidateId: candidate.id,
      policyIds,
      policies: [reference, candidate],
      classification: job.classification,
      reproduce:
        `gateflow-sim trace --scenario scenarios/${scenario.id}.yaml --seed ${seed} ` +
        `--policies ${policyIds.join(',')} --reference ${reference.id} --candidate ${candidate.id}`,
    },
    day: population,
    runs: [
      recordRun(population, reference, job.classification, job.profile),
      recordRun(population, candidate, job.classification, job.profile),
    ],
  };
}

/**
 * What a trace's fingerprint covers: everything but the program that wrote it and its source
 * revision. The CLI and the Studio give the same content, so the same fingerprint, for the same
 * day.
 */
export function traceContent(doc: TraceDocument): string {
  const manifest: Record<string, unknown> = { ...doc.manifest };
  delete manifest.generator;
  delete manifest.commit;
  return canonicalJson({ ...doc, manifest });
}

/**
 * A trace as a file: compact JSON (a busy day holds hundreds of thousands of events), newline at
 * the end.
 */
export function stringifyTrace(doc: TraceDocument): string {
  return `${JSON.stringify(doc)}\n`;
}

/** Thrown for a file that is not a trace this version can read. */
export class TraceFileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TraceFileError';
  }
}

/** Reads a trace file written by the CLI or the Studio. */
export function parseTraceFile(text: string): TraceDocument {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new TraceFileError('the file is not JSON');
  }
  const doc = value as Partial<TraceDocument> | null;
  if (doc === null || typeof doc !== 'object' || doc.schema !== TRACE_SCHEMA) {
    throw new TraceFileError(`the file is not a trace in the ${TRACE_SCHEMA} format`);
  }
  const runs: unknown = doc.runs;
  if (!Array.isArray(runs) || runs.length !== 2 || doc.day === undefined) {
    throw new TraceFileError('the trace has no day or not two runs');
  }
  return doc as TraceDocument;
}
