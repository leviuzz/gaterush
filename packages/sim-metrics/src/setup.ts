import type { ClassificationParams } from '@gateflow/priority-engine';
import { PRIORITY_V3_POLICY, classificationOf } from '@gateflow/queue-core';
import type { Policy } from '@gateflow/queue-core';
import { canonicalJson } from '@gateflow/sim-scenarios';
import { comparisonKey, defaultComparisons } from './experiment';
import type { PolicyComparison } from './experiment';

/*
 * How an experiment is set up from a list of policies, the same in the CLI and in the Studio:
 * the classification of the risk classes on arrival and the default comparisons.
 */

/**
 * Classification for the risk classes on arrival, the same for every policy of an experiment: the
 * first priority policy's, else priority-v3's.
 */
export function arrivalClassification(policies: readonly Policy[]): ClassificationParams {
  for (const policy of policies) {
    const classification = classificationOf(policy);
    if (classification !== null) return classification;
  }
  const fallback = classificationOf(PRIORITY_V3_POLICY);
  if (fallback === null) throw new Error('priority-v3 must define classification parameters');
  return fallback;
}

/**
 * Default comparisons: every policy against the baseline; then each policy that reorders the queue
 * against the FIFO policy operating exactly the same queue (the difference is the reordering
 * alone); and each priority (constrained EDF) policy against today's practice with manual
 * handling (a physical queue with staff calls, baseline A') and against the priority policies
 * listed before it on the same queue (version against version). These references manage lanes
 * as the candidate does, so that one comparison changes one thing.
 *
 * Lane management (S8): a policy with a lane mode is compared with the same policy without it
 * (what the extra lanes buy) and, for GateFlow's recommendations, with the supervisor's
 * (`@predict` or `@advise` against `@reactive`); a priority policy with GateFlow's
 * recommendations is also compared with today's practice as a whole (manual handling with a
 * supervisor, `fifo-manual@reactive`). The console's recommendations (`@advise`, S22.3) are also
 * compared with S8's (`@predict`) on the same calls.
 */
export function recommendedComparisons(
  policies: readonly Policy[],
  baselineId: string,
): PolicyComparison[] {
  const pairs = defaultComparisons(policies, baselineId);
  const keys = new Set(pairs.map(comparisonKey));
  const add = (candidateId: string, referenceId: string) => {
    const pair = { candidateId, referenceId };
    if (keys.has(comparisonKey(pair))) return;
    keys.add(comparisonKey(pair));
    pairs.push(pair);
  };
  const sameQueue = (a: Policy, b: Policy) => canonicalJson(a.queue) === canonicalJson(b.queue);
  const sameCalls = (a: Policy, b: Policy) =>
    sameQueue(a, b) && canonicalJson(a.selection) === canonicalJson(b.selection);
  const lanesOf = (p: Policy): string => p.lanes?.kind ?? 'plan';
  const todaysPractice = (p: Policy) => p.queue.kind === 'physical' && p.selection.kind !== 'fifo';
  /** GateFlow recommends the lanes: S8's projection or the console's rule. */
  const gateflowLanes = (p: Policy) => p.lanes?.kind === 'predict' || p.lanes?.kind === 'advise';
  policies.forEach((candidate, index) => {
    if (candidate.id === baselineId) return;
    const others = policies.filter((p) => p.id !== baselineId && p.id !== candidate.id);
    const lanes = candidate.lanes;
    if (lanes !== undefined) {
      for (const reference of others) {
        if (!sameCalls(reference, candidate)) continue;
        if (
          reference.lanes === undefined ||
          (gateflowLanes(candidate) && reference.lanes.kind === 'reactive') ||
          (lanes.kind === 'advise' && reference.lanes.kind === 'predict')
        ) {
          add(candidate.id, reference.id);
        }
      }
    }
    if (candidate.selection.kind === 'fifo') return;
    const references = others.filter((p) => lanesOf(p) === lanesOf(candidate));
    for (const reference of references) {
      if (reference.selection.kind === 'fifo' && sameQueue(reference, candidate)) {
        add(candidate.id, reference.id);
      }
    }
    if (candidate.selection.kind !== 'constrained-edf') return;
    for (const reference of references) {
      if (todaysPractice(reference)) add(candidate.id, reference.id);
    }
    if (gateflowLanes(candidate)) {
      for (const reference of others) {
        if (todaysPractice(reference) && reference.lanes?.kind === 'reactive') {
          add(candidate.id, reference.id);
        }
      }
    }
    for (const reference of policies.slice(0, index)) {
      if (
        reference.id !== baselineId &&
        reference.selection.kind === 'constrained-edf' &&
        sameQueue(reference, candidate) &&
        lanesOf(reference) === lanesOf(candidate)
      ) {
        add(candidate.id, reference.id);
      }
    }
  });
  return pairs;
}
