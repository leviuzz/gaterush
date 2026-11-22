import type { ComparisonSummary, ResultsDocument } from '@gateflow/sim-metrics';

/** Mean per day with its confidence interval. */
export interface MeanWithInterval {
  readonly mean: number;
  readonly lower: number;
  readonly upper: number;
}

export interface RunComparison {
  readonly runs: readonly [RunSummary, RunSummary];
  /** Missed flights per day of every policy of either run (`null` where a run lacks it). */
  readonly policies: readonly {
    readonly id: string;
    readonly missed: readonly [number | null, number | null];
    readonly extraLaneHours: readonly [number | null, number | null];
  }[];
  /** Net flights saved per day of every comparison of either run. */
  readonly comparisons: readonly {
    readonly key: string;
    readonly net: readonly [MeanWithInterval | null, MeanWithInterval | null];
  }[];
  /** Assumptions whose value differs between the runs (absent on one side: `undefined`). */
  readonly parameters: readonly {
    readonly path: string;
    readonly values: readonly [unknown, unknown];
  }[];
}

export interface RunSummary {
  readonly scenarioId: string;
  readonly scenarioTitle: string;
  readonly scenarioHash: string;
  readonly days: number;
  readonly peoplePerDay: number;
  readonly generator: string;
  readonly commit: string;
}

function summary(doc: ResultsDocument): RunSummary {
  const { manifest } = doc;
  return {
    scenarioId: manifest.scenario.id,
    scenarioTitle: manifest.scenario.title,
    scenarioHash: manifest.scenario.hash,
    days: doc.summary.days,
    peoplePerDay: doc.summary.peoplePerDay.mean,
    generator: `${manifest.generator.name} ${manifest.generator.version}`,
    commit: manifest.commit,
  };
}

function net(comparison: ComparisonSummary | undefined): MeanWithInterval | null {
  if (comparison === undefined) return null;
  const m = comparison.metrics.net;
  return { mean: m.mean, lower: m.ciLower, upper: m.ciUpper };
}

function union<T>(a: readonly T[], b: readonly T[]): T[] {
  return [...new Set([...a, ...b])];
}

/**
 * Two runs side by side: what each policy misses, what each comparison saves, and which assumptions
 * differ. Runs may come from the Studio or from results files of the CLI.
 */
export function compareRuns(a: ResultsDocument, b: ResultsDocument): RunComparison {
  const policyIds = union(
    a.manifest.policies.map((p) => p.id),
    b.manifest.policies.map((p) => p.id),
  );
  const keys = union(Object.keys(a.summary.comparisons), Object.keys(b.summary.comparisons));
  const valueOf = (doc: ResultsDocument) => new Map(doc.assumptions.map((x) => [x.path, x.value]));
  const valuesA = valueOf(a);
  const valuesB = valueOf(b);
  const paths = union([...valuesA.keys()], [...valuesB.keys()]);
  return {
    runs: [summary(a), summary(b)],
    policies: policyIds.map((id) => ({
      id,
      missed: [
        a.summary.policies[id]?.missed.mean ?? null,
        b.summary.policies[id]?.missed.mean ?? null,
      ],
      extraLaneHours: [
        a.summary.policies[id]?.extraLaneHours.mean ?? null,
        b.summary.policies[id]?.extraLaneHours.mean ?? null,
      ],
    })),
    comparisons: keys.map((key) => ({
      key,
      net: [net(a.summary.comparisons[key]), net(b.summary.comparisons[key])],
    })),
    parameters: paths
      .filter((path) => JSON.stringify(valuesA.get(path)) !== JSON.stringify(valuesB.get(path)))
      .map((path) => ({ path, values: [valuesA.get(path), valuesB.get(path)] })),
  };
}

/** Thrown when a file is not a results document the Studio can read. */
export class ResultsFileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ResultsFileError';
  }
}

/** Reads a `results.json` written by the CLI or the Studio (schema `gateflow.sim.results/7`). */
export function parseResultsFile(text: string): ResultsDocument {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new ResultsFileError('this file is not JSON');
  }
  const schema = (data as { schema?: unknown } | null)?.schema;
  if (schema !== 'gateflow.sim.results/7') {
    throw new ResultsFileError(
      typeof schema === 'string'
        ? `results of schema ${schema} cannot be compared here; run them again with this version (gateflow.sim.results/7)`
        : 'this file is not a GateFlow results document',
    );
  }
  return data as ResultsDocument;
}
