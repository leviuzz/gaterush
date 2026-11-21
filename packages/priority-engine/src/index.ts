/** Version of the priority engine. Bump on any change that can alter a decision. */
export const ENGINE_VERSION = '0.2.1';

export { assessQueue, assessTicket, fifoWaitEstimateMs, isDeadlineTrusted } from './assess';
export type { QueueSnapshot } from './assess';
export { priorityCallsInWindow, selectNext } from './select';
export { REASON_CODES } from './reasons';
export type { ReasonCode } from './reasons';
export {
  EngineInputError,
  toFifoOrder,
  validateAheadOfWaiting,
  validateCheckpoint,
  validateClassificationParams,
  validateNow,
  validateSelectionParams,
  validateTicket,
} from './validate';
export type {
  Assessment,
  CheckpointEstimates,
  ClassificationParams,
  ConstrainedEdfSelection,
  EngineInput,
  FifoSelection,
  Selection,
  SelectionParams,
  WaitingTicket,
} from './types';
