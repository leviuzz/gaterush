/** Version of the priority engine. Bump on any change that can alter a decision. */
export const ENGINE_VERSION = '0.4.0';

export {
  assessQueue,
  assessTicket,
  fifoWaitEstimateMs,
  isDeadlineTrusted,
  journeyEstimates,
  partySizeOf,
  presentationBlock,
} from './assess';
export type { JourneyEstimates, QueueSnapshot } from './assess';
export { capAllows, priorityCallsInWindow, selectNext } from './select';
export { REASON_CODES } from './reasons';
export type { ReasonCode } from './reasons';
export {
  EngineInputError,
  toFifoOrder,
  validateAheadMaxOvertakenCount,
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
  FlightCallSelection,
  Selection,
  SelectionParams,
  WaitingTicket,
} from './types';
