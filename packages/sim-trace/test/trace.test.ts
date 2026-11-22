import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { REASON_CODES } from '@gateflow/priority-engine';
import { findPolicyPreset } from '@gateflow/queue-core';
import {
  DEFAULT_BOOTSTRAP,
  applyScenarioSettings,
  arrivalClassification,
  comparisonDayMetrics,
  comparisonKey,
  planExperiment,
  policyDayMetrics,
  recommendedComparisons,
  runDay,
} from '@gateflow/sim-metrics';
import type { DayJob, PolicyComparison } from '@gateflow/sim-metrics';
import { canonicalJson, parseScenarioText } from '@gateflow/sim-scenarios';
import type { Scenario } from '@gateflow/sim-scenarios';
import { describe, expect, it } from 'vitest';
import {
  TRACE_SCHEMA,
  TraceError,
  TraceFileError,
  buildTimeline,
  commitmentIndexes,
  countUntil,
  daySpan,
  eventsByParty,
  explainCommitment,
  integrate,
  knownDeadlines,
  lanesAt,
  missedByClosing,
  pairParties,
  parseTraceFile,
  screeningsByLane,
  stateAt,
  stringifyTrace,
  summariseDay,
  traceContent,
  traceDay,
} from '../src';
import type { TraceDocument } from '../src';

const sha256 = (text: string) => createHash('sha256').update(text).digest('hex');

function loadScenario(name: string): Scenario {
  const file = new URL(`../../../scenarios/${name}.yaml`, import.meta.url);
  return parseScenarioText(readFileSync(file, 'utf8'), 'yaml', {
    read: (path) => readFileSync(new URL(path, file), 'utf8'),
    sha256,
  });
}

/** The job of a run with these policies, set up as the CLI and the Studio set it up. */
function jobFor(scenario: Scenario, policyIds: readonly string[]): DayJob {
  const presets = policyIds.map((id) => {
    const preset = findPolicyPreset(id);
    if (preset === undefined) throw new Error(`no preset ${id}`);
    return preset;
  });
  const policies = applyScenarioSettings(presets, scenario);
  const baselinePolicyId = (policies[0] ?? presets[0])!.id;
  return planExperiment({
    scenario,
    seeds: [1],
    policies,
    baselinePolicyId,
    comparisons: recommendedComparisons(policies, baselinePolicyId),
    classification: arrivalClassification(policies),
    bootstrap: DEFAULT_BOOTSTRAP,
  }).job;
}

function trace(job: DayJob, seed: number, comparison: PolicyComparison, name = 'test') {
  return traceDay(job, seed, comparison, {
    generator: { name, version: '0' },
    commit: 'test',
    scenarioHash: `sha256:${sha256(canonicalJson(job.scenario))}`,
  });
}

const DEFAULT = ['fifo', 'fifo-manual', 'virtual-fifo', 'priority-v3'];
const LANES = [
  'fifo',
  'fifo-manual',
  'fifo-manual@reactive',
  'fifo-manual@predict',
  'priority-v3',
  'priority-v3@predict',
];

/** Days chosen for their variety: a demo day, disruptions, feed outages, extra lanes, a hub. */
const CASES: {
  readonly scenario: string;
  readonly policies: readonly string[];
  readonly comparisons: readonly PolicyComparison[];
  readonly seeds: readonly number[];
}[] = [
  {
    scenario: 'single-checkpoint-demo',
    policies: DEFAULT,
    comparisons: [
      { candidateId: 'priority-v3', referenceId: 'fifo' },
      { candidateId: 'priority-v3', referenceId: 'fifo-manual' },
    ],
    seeds: [1, 2],
  },
  {
    scenario: 'single-checkpoint-feed-stress',
    policies: DEFAULT,
    comparisons: [{ candidateId: 'priority-v3', referenceId: 'virtual-fifo' }],
    seeds: [3],
  },
  {
    scenario: 'vce-like-disrupted-day',
    policies: DEFAULT,
    comparisons: [{ candidateId: 'priority-v3', referenceId: 'fifo-manual' }],
    seeds: [1],
  },
  {
    scenario: 'tsf-like-peak-day',
    policies: LANES,
    comparisons: [
      { candidateId: 'priority-v3@predict', referenceId: 'fifo-manual@reactive' },
      { candidateId: 'fifo-manual@predict', referenceId: 'fifo-manual@reactive' },
    ],
    seeds: [1],
  },
  {
    scenario: 'mx-like-transfer-hub',
    policies: DEFAULT,
    comparisons: [{ candidateId: 'priority-v3', referenceId: 'fifo' }],
    seeds: [5],
  },
];

const traces: { readonly label: string; readonly doc: TraceDocument; readonly job: DayJob }[] = [];
for (const c of CASES) {
  const job = jobFor(loadScenario(c.scenario), c.policies);
  for (const seed of c.seeds) {
    for (const comparison of c.comparisons) {
      traces.push({
        label: `${c.scenario} seed ${seed} ${comparisonKey(comparison)}`,
        doc: trace(job, seed, comparison),
        job,
      });
    }
  }
}

describe('the trace of a day (S11)', () => {
  it.each(traces)('$label: has the outcomes and metrics of the run', ({ doc, job }) => {
    const day = runDay(job, doc.manifest.seed);
    const [reference, candidate] = doc.runs;
    expect(doc.schema).toBe(TRACE_SCHEMA);
    expect(doc.day.passengers.length).toBe(day.passengers);
    for (const run of doc.runs) {
      expect(policyDayMetrics(doc.day, run)).toEqual(day.policies[run.policyId]);
    }
    const key = comparisonKey({
      candidateId: candidate.policyId,
      referenceId: reference.policyId,
    });
    const metrics = comparisonDayMetrics(doc.day, reference, candidate);
    if (day.comparisons[key] !== undefined) expect(metrics).toEqual(day.comparisons[key]);
    // The paired outcome of every party gives the day's flights saved and lost.
    const summary = summariseDay(doc, pairParties(doc));
    expect(summary.saved).toBe(metrics.saved);
    expect(summary.harmed).toBe(metrics.harmed);
    expect(summary.missedReference).toBe(day.policies[reference.policyId]?.missed);
    expect(summary.missedCandidate).toBe(day.policies[candidate.policyId]?.missed);
  });

  it.each(traces)('$label: its replay gives the statistics of the simulator', ({ doc }) => {
    doc.runs.forEach((run, i) => {
      const physical = doc.manifest.policies[i]?.queue.kind === 'physical';
      const timeline = buildTimeline(doc.day, run, physical);
      const people = doc.day.passengers.reduce((n, p) => n + p.partySize, 0);
      const n = timeline.times.length;
      // Waiting for the call, and standing, integrated over the day: exactly the simulator's.
      expect(integrate(timeline, (k) => timeline.waiting[k] ?? 0)).toBe(run.stats.waitingAreaMs);
      expect(
        integrate(
          timeline,
          (k) => (physical ? (timeline.waiting[k] ?? 0) : 0) + (timeline.atLanes[k] ?? 0),
        ),
      ).toBe(run.stats.standingAreaMs);
      expect(Math.max(...timeline.waiting)).toBe(run.stats.maxWaiting);
      let maxStanding = 0;
      for (let k = 0; k < n; k++) {
        maxStanding = Math.max(
          maxStanding,
          (physical ? (timeline.waiting[k] ?? 0) : 0) + (timeline.atLanes[k] ?? 0),
        );
      }
      expect(maxStanding).toBe(run.stats.maxStanding);
      expect(Math.max(...timeline.lanesOpen)).toBe(run.stats.maxOpenLanes);
      // Everybody is screened in the end, and nobody is anywhere else.
      const end = stateAt(timeline, Infinity);
      expect(end.done).toBe(people);
      expect(end.waiting + end.called + end.absent + end.atLanes + end.screening).toBe(0);
      expect(stateAt(timeline, -Infinity).done).toBe(0);
      // Screening on a lane never overlaps, and the lanes give the outcomes' lanes and times.
      const byLane = screeningsByLane(run);
      let screened = 0;
      byLane.forEach((lane, index) => {
        for (let s = 0; s < lane.length; s++) {
          const screening = lane[s]!;
          expect(screening.lane).toBe(index);
          expect(run.outcomes[screening.party]?.serviceStartMs).toBe(screening.startMs);
          if (s > 0) expect(screening.startMs).toBeGreaterThanOrEqual(lane[s - 1]!.endMs);
          screened++;
        }
      });
      expect(screened).toBe(doc.day.passengers.length);
      const middle = run.outcomes[Math.floor(run.outcomes.length / 2)]!;
      expect(lanesAt(byLane, middle.serviceStartMs)[middle.laneIndex]).toBe(
        Math.floor(run.outcomes.length / 2),
      );
      // The flights missed over the day add up to the day's missed passengers.
      const missed = missedByClosing(doc.day, run);
      expect(countUntil(missed, Infinity)).toBe(policyDayMetrics(doc.day, run).missed);
      // Every party's events are its own, in time order.
      const byParty = eventsByParty(doc.day, run);
      expect(byParty.length).toBe(doc.day.passengers.length);
      for (const indexes of byParty) {
        for (let j = 1; j < indexes.length; j++) {
          expect(run.events[indexes[j]!]!.atMs).toBeGreaterThanOrEqual(
            run.events[indexes[j - 1]!]!.atMs,
          );
        }
      }
    });
    const span = daySpan(doc);
    expect(span.toMs).toBeGreaterThan(span.fromMs);
  });

  it.each(traces)('$label: explains every call with a reason of the engine', ({ doc }) => {
    doc.runs.forEach((run, i) => {
      const policy = doc.manifest.policies[i]!;
      const known = knownDeadlines(doc.day, run);
      const commitments = commitmentIndexes(run);
      expect(commitments.length).toBe(run.stats.commitments);
      let priority = 0;
      for (const k of commitments) {
        const event = run.events[k]!;
        if (event.type !== 'QUEUE' || event.event.type !== 'COMMITTED')
          throw new Error('no commitment');
        const explanation = explainCommitment(event.event, {
          policy,
          knownDeadlineMs: known.get(k) ?? null,
        });
        expect(REASON_CODES).toContain(explanation.code);
        expect(explanation.text.length).toBeGreaterThan(10);
        expect(explanation.facts.length).toBeGreaterThan(0);
        if (explanation.priority) {
          priority++;
          // A priority call is the engine bringing someone forward, or staff calling a flight.
          expect(explanation.code).toBe(
            policy.selection.kind === 'flight-call' ? 'FLIGHT_CALL' : 'URGENT_FEASIBLE',
          );
        }
        if (policy.selection.kind === 'constrained-edf') {
          expect(event.event.assessment).not.toBeNull();
        }
      }
      expect(priority).toBe(run.stats.priorityCalls);
    });
  });

  it('is deterministic, and its fingerprint does not depend on the program that wrote it', () => {
    const { doc, job } = traces[0]!;
    const again = trace(job, doc.manifest.seed, {
      candidateId: doc.manifest.candidateId,
      referenceId: doc.manifest.referenceId,
    });
    expect(stringifyTrace(again)).toBe(stringifyTrace(doc));
    const other = trace(
      job,
      doc.manifest.seed,
      { candidateId: doc.manifest.candidateId, referenceId: doc.manifest.referenceId },
      'another-program',
    );
    expect(stringifyTrace(other)).not.toBe(stringifyTrace(doc));
    expect(traceContent(other)).toBe(traceContent(doc));
    expect(parseTraceFile(stringifyTrace(doc))).toEqual(doc);
    expect(() => parseTraceFile('{"schema":"gateflow.sim.results/7"}')).toThrow(TraceFileError);
    expect(() => parseTraceFile('not json')).toThrow(TraceFileError);
  });

  it('refuses a comparison with a policy the run does not have', () => {
    const { job } = traces[0]!;
    expect(() => trace(job, 1, { candidateId: 'priority-v2', referenceId: 'fifo' })).toThrow(
      TraceError,
    );
    expect(() => trace(job, 1, { candidateId: 'fifo', referenceId: 'fifo' })).toThrow(TraceError);
  });

  it('records what each policy decided about extra lanes', () => {
    const tsf = traces.find((t) => t.label.startsWith('tsf-like-peak-day'))!;
    const [reference, candidate] = tsf.doc.runs;
    const decisions = (run: typeof reference) =>
      run.events.filter((e) => e.type === 'LANE_DECISION');
    expect(decisions(reference).length).toBe(reference.stats.laneDecisions);
    expect(decisions(reference).every((e) => e.by === 'SUPERVISOR')).toBe(true);
    expect(decisions(candidate).every((e) => e.by === 'GATEFLOW')).toBe(true);
    expect(decisions(reference).length + decisions(candidate).length).toBeGreaterThan(0);
  });
});
