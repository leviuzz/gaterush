/** Version of the queue state machine. Bump on any change that can alter behaviour. */
export const QUEUE_CORE_VERSION = '0.1.0';

export { CheckpointQueue } from './queue';
export {
  DEFAULT_VIRTUAL_QUEUE,
  FIFO_POLICY,
  POLICY_PRESETS,
  PRIORITY_V0_POLICY,
  PRIORITY_V0_SELECTION,
  QueueError,
  VIRTUAL_FIFO_POLICY,
  callAheadTarget,
  classificationOf,
  findPolicyPreset,
  prepareWindowSizeOf,
  responseEstimateMs,
  validatePolicy,
  validateQueueOperation,
} from './policy';
export { TICKET_STATES } from './types';
export type {
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
