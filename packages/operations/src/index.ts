/** Version of the operational checkpoint. Bump on any change to commands, results or events. */
export const OPERATIONS_VERSION = '0.1.0';

export { PRESENT_METHODS, TICKET_SOURCES } from './commands';
export type {
  Applied,
  CallNext,
  Command,
  CommandRecord,
  CommandResult,
  CommandType,
  DayConfig,
  DayLogEvent,
  IssueTicket,
  OpenDay,
  Present,
  PresentMethod,
  TicketSource,
  TicketSummary,
} from './commands';
export {
  CheckpointDay,
  MAX_PARTY_SIZE,
  OPERATION_ERRORS,
  OperationError,
  estimatesOf,
} from './day';
export type { OperationErrorCode } from './day';
