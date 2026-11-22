/** Version of the priority engine. Bump on any change that can alter a decision. */
export const ENGINE_VERSION = '0.5.0';

export {
  assessQueue,
  assessTicket,
  classifyMargins,
  fifoWaitEstimateMs,
  isDeadlineStale,
  isDeadlineTrusted,
  journeyEstimates,
  partySizeOf,
  presentationBlock,
} from './assess';
export type { JourneyEstimates, QueueSnapshot } from './assess';
export { capAllows, priorityCallsInWindow, selectNext } from './select';
export { REASON_CODES, REASON_DESCRIPTIONS, describeReason } from './reasons';
export type { ReasonCode, ReasonDescription } from './reasons';
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
