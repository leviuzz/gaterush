/** Version of the operational checkpoint. Bump on any change to commands, results or events. */
export const OPERATIONS_VERSION = '0.5.0';

export {
  MANUAL_REASONS,
  PASS_INFANTS,
  PRESENT_METHODS,
  STAFF_ACTIONS,
  TICKET_SOURCES,
} from './commands';
export type {
  ActOnTicket,
  AddToParty,
  Board,
  BoardCall,
  Advance,
  Applied,
  CallNext,
  Command,
  CommandRecord,
  CommandResult,
  CommandType,
  DayConfig,
  DayLogEvent,
  IssueTicket,
  ManualReason,
  OpenDay,
  PassInfant,
  Present,
  PresentMethod,
  ResolveReview,
  StaffAction,
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
