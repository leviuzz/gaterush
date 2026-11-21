/** Version of the queue state machine. Bump on any change that can alter behaviour. */
export const QUEUE_CORE_VERSION = '0.4.0';

export { CheckpointQueue } from './queue';
export {
  DEFAULT_VIRTUAL_QUEUE,
  FIFO_MANUAL_POLICY,
  FIFO_POLICY,
  FLIGHT_CALL_SELECTION,
  POLICY_PRESETS,
  PRIORITY_V0_POLICY,
  PRIORITY_V0_SELECTION,
  PRIORITY_V1_POLICY,
  PRIORITY_V1_SELECTION,
  PRIORITY_V1_STRICT_POLICY,
  PRIORITY_V1_STRICT_SELECTION,
  PRIORITY_V2_POLICY,
  PRIORITY_V2_SELECTION,
  PRIORITY_V3_POLICY,
  PRIORITY_V3_SELECTION,
  QueueError,
  VIRTUAL_FIFO_POLICY,
  callAheadTarget,
  classificationOf,
  fastTrackResponseEstimateMs,
  findPolicyPreset,
  prepareWindowSizeOf,
  responseEstimateMs,
  validatePolicy,
  validateQueueOperation,
} from './policy';
export { TICKET_STATES } from './types';
export type {
  FlightKnowledge,
  PhysicalQueue,
  Policy,
  PresentOutcome,
  QueueEvent,
  QueueListener,
  QueueOperation,
  QueueStats,
  TicketInput,
  TicketState,
  TicketView,
  VirtualQueue,
} from './types';
