import { comparisonKey } from '@gateflow/sim-metrics';
import type { DayJob, PolicyComparison, ResultsDocument } from '@gateflow/sim-metrics';
import { traceContent, traceDay } from '@gateflow/sim-trace';
import type { TraceDocument } from '@gateflow/sim-trace';
import { scenarioHash } from './files';
import { STUDIO_NAME } from './setup';
import { sha256Hex } from './sha256';

/** The trace of a day of a run, as the CLI writes it but naming the Studio as its generator. */
export function studioTrace(
  job: DayJob,
  seed: number,
  comparison: PolicyComparison,
  build: { readonly version: string; readonly commit: string },
): TraceDocument {
  return traceDay(job, seed, comparison, {
    generator: { name: STUDIO_NAME, version: build.version },
    commit: build.commit,
    scenarioHash: scenarioHash(job.scenario),
  });
}

/** The fingerprint of a trace: the CLI prints the same one for the same day (ADR-041). */
export function traceFingerprint(doc: TraceDocument): string {
  return `sha256:${sha256Hex(traceContent(doc))}`;
}

/**
 * The comparison a replay opens on: a priority policy against the status quo when the run has
 * one, else the run's first comparison.
 */
export function replayComparison(doc: ResultsDocument): PolicyComparison | undefined {
  const { comparisons, policies, baselinePolicyId } = doc.manifest;
  const priority = new Set(
    policies.filter((p) => p.selection.kind === 'constrained-edf').map((p) => p.id),
  );
  return (
    comparisons.find((c) => priority.has(c.candidateId) && c.referenceId === baselinePolicyId) ??
    comparisons.find((c) => priority.has(c.candidateId)) ??
    comparisons[0]
  );
}

/** A day of a run worth replaying, with the net flights saved on it (people). */
export interface NotableDay {
  readonly seed: number;
  readonly net: number;
}

/**
 * The typical, best and worst days of a run for one comparison, by net flights saved. The typical
 * day is the median day (the lower one of the two middle days), so that a replay does not show
 * a chosen day as the rule. Ties go to the lowest seed.
 */
export function notableDays(
  doc: ResultsDocument,
  comparison: PolicyComparison,
): { readonly typical: NotableDay; readonly best: NotableDay; readonly worst: NotableDay } | null {
  const key = comparisonKey(comparison);
  const days: NotableDay[] = [];
  for (const day of doc.perSeed) {
    const metrics = day.comparisons[key];
    if (metrics !== undefined) days.push({ seed: day.seed, net: metrics.net });
  }
  if (days.length === 0) return null;
  const sorted = [...days].sort((a, b) => a.net - b.net || a.seed - b.seed);
  const median = (sorted[Math.floor((sorted.length - 1) / 2)] as NotableDay).net;
  const lowestSeed = (net: number) =>
    days.filter((d) => d.net === net).reduce((a, b) => (b.seed < a.seed ? b : a));
  return {
    typical: lowestSeed(median),
    best: lowestSeed((sorted[sorted.length - 1] as NotableDay).net),
    worst: lowestSeed((sorted[0] as NotableDay).net),
  };
}
