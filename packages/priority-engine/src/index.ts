/** Version of the priority engine. Bump on any change that can alter a decision. */
export const ENGINE_VERSION = '0.1.0';

export { assessQueue, assessTicket, fifoWaitEstimateMs, isDeadlineTrusted } from './assess';
export type { QueueSnapshot } from './assess';
export { priorityCallsInWindow, selectNext } from './select';
export {
  FIFO_POLICY,
  POLICY_PRESETS,
  PRIORITY_V0_POLICY,
  classificationOf,
  findPolicyPreset,
} from './presets';
export { REASON_CODES } from './reasons';
export type { ReasonCode } from './reasons';
export {
  EngineInputError,
  toFifoOrder,
  validateCheckpoint,
  validateClassificationParams,
  validatePolicyParams,
  validateTicket,
} from './validate';
export type {
  Assessment,
  CheckpointEstimates,
  ClassificationParams,
  ConstrainedEdfPolicyParams,
  EngineInput,
  FifoPolicyParams,
  Policy,
  PolicyParams,
  Selection,
  WaitingTicket,
} from './types';
