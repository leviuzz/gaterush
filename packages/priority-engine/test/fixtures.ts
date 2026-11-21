import type { KnownDeadline, Segment } from '@gateflow/domain';
import { MS_PER_MINUTE } from '@gateflow/domain';
import type {
  CheckpointEstimates,
  ConstrainedEdfPolicyParams,
  EngineInput,
  WaitingTicket,
} from '../src';
import { PRIORITY_V0_POLICY } from '../src';

export const MIN = MS_PER_MINUTE;

export const EDF = PRIORITY_V0_POLICY.params as ConstrainedEdfPolicyParams;

/** 180 pax/h: one person every 20 s, so `ahead` tickets wait ahead * 20 s. */
export const CHECKPOINT: CheckpointEstimates = {
  throughputPerHour: 180,
  processMs: 0,
  responseMs: 0,
};

export function ticket(
  fifoKey: number,
  overrides: Partial<Omit<WaitingTicket, 'deadline'>> & { deadline?: KnownDeadline } = {},
): WaitingTicket {
  return {
    id: overrides.id ?? `t${fifoKey}`,
    fifoKey,
    segment: overrides.segment ?? ('DEPARTING' satisfies Segment),
    deadline: overrides.deadline ?? { atMs: 600 * MIN, source: 'RULE' },
    walkEstimateMs: overrides.walkEstimateMs ?? 0,
    overtakenCount: overrides.overtakenCount ?? 0,
  };
}

export function input(
  waiting: WaitingTicket[],
  overrides: Partial<Omit<EngineInput, 'waiting'>> = {},
): EngineInput {
  return {
    nowMs: overrides.nowMs ?? 0,
    checkpoint: overrides.checkpoint ?? CHECKPOINT,
    waiting,
    recentPriorityCalls: overrides.recentPriorityCalls ?? [],
    policy: overrides.policy ?? EDF,
  };
}
