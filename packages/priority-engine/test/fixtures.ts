import type { KnownDeadline, Segment } from '@gateflow/domain';
import { MS_PER_MINUTE } from '@gateflow/domain';
import type {
  CheckpointEstimates,
  ConstrainedEdfSelection,
  EngineInput,
  WaitingTicket,
} from '../src';

export const MIN = MS_PER_MINUTE;

/** Same values as the priority-v0 preset (defined in @gateflow/queue-core). */
export const EDF: ConstrainedEdfSelection = {
  kind: 'constrained-edf',
  capWindowCalls: 10,
  capMaxPriorityCalls: 3,
  maxOvertakes: 15,
  attentionThresholdMs: 15 * MIN,
  safetyBufferMs: 5 * MIN,
  feasibilityMarginMs: 5 * MIN,
  allowRuleBasedDeadline: true,
  eligibleSegments: ['DEPARTING', 'TRANSFER'],
  latePresentationCutoffMs: null,
};

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
    ...(overrides.partySize === undefined ? {} : { partySize: overrides.partySize }),
    ...(overrides.presentedAtMs === undefined ? {} : { presentedAtMs: overrides.presentedAtMs }),
    ...(overrides.scheduledDepartureMs === undefined
      ? {}
      : { scheduledDepartureMs: overrides.scheduledDepartureMs }),
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
    selection: overrides.selection ?? EDF,
    ...(overrides.aheadOfWaiting === undefined ? {} : { aheadOfWaiting: overrides.aheadOfWaiting }),
  };
}
