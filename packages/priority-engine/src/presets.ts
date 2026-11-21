import { MS_PER_MINUTE } from '@gateflow/domain';
import type { ClassificationParams, Policy } from './types';

/** Policy A: first-in, first-out baseline. */
export const FIFO_POLICY: Policy = {
  id: 'fifo',
  version: '1.0.0',
  title: 'FIFO baseline (policy A)',
  params: { kind: 'fifo' },
};

/**
 * Policy B, version 0. Every parameter value is an initial hypothesis (ADR-004) to be calibrated
 * with sensitivity sweeps and approved by the airport operator; none is a measured optimum.
 */
export const PRIORITY_V0_POLICY: Policy = {
  id: 'priority-v0',
  version: '0.1.0',
  title: 'Constrained EDF priority v0 (policy B)',
  params: {
    kind: 'constrained-edf',
    capWindowCalls: 10,
    capMaxPriorityCalls: 3,
    maxOvertakes: 15,
    attentionThresholdMs: 15 * MS_PER_MINUTE,
    safetyBufferMs: 5 * MS_PER_MINUTE,
    allowRuleBasedDeadline: true,
    eligibleSegments: ['DEPARTING', 'TRANSFER'],
  },
};

export const POLICY_PRESETS: readonly Policy[] = [FIFO_POLICY, PRIORITY_V0_POLICY];

export function findPolicyPreset(id: string): Policy | undefined {
  return POLICY_PRESETS.find((policy) => policy.id === id);
}

/** Classification parameters of a policy, or `null` for plain FIFO. */
export function classificationOf(policy: Policy): ClassificationParams | null {
  const { params } = policy;
  if (params.kind === 'fifo') return null;
  return {
    attentionThresholdMs: params.attentionThresholdMs,
    safetyBufferMs: params.safetyBufferMs,
    allowRuleBasedDeadline: params.allowRuleBasedDeadline,
    eligibleSegments: params.eligibleSegments,
  };
}
