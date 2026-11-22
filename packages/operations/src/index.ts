/** Version of the operational checkpoint. Bump on any change to commands, results or events. */
export const OPERATIONS_VERSION = '0.10.0';

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
  OverrideTicket,
  PassInfant,
  Present,
  PresentMethod,
  ResolveReview,
  SetLanes,
  SetMode,
  StaffAction,
  TicketSource,
  TicketSummary,
  UpdateFlight,
} from './commands';
export {
  CheckpointDay,
  MAX_PARTY_SIZE,
  OPERATION_ERRORS,
  OperationError,
  estimatesOf,
  ticketNumber,
  validateLivePolicy,
} from './day';
export type { OperationErrorCode } from './day';
export { OVERVIEW_ALERTS, RECENT_WAITS_MS, callCountsOf, overviewOf } from './overview';
export type {
  CallCounts,
  Group,
  Overview,
  OverviewAlert,
  OverviewAlertCode,
  OverviewFlight,
  OverviewInput,
  OverviewTicket,
  Spread,
} from './overview';
export {
  ADVICE_DECISIONS,
  ADVICE_DECLINE_REASONS,
  ADVICE_RULES,
  ADVICE_STATUSES,
  AdviceBook,
  advicesOfLog,
} from './advice';
export type {
  AdviceBand,
  AdviceDecision,
  AdviceDeclineReason,
  AdviceOutcome,
  AdviceStatus,
  AdviceSummary,
  AdviseLanes,
  DecideAdvice,
  LaneAdviceRecord,
  RecordAdviceOutcome,
} from './advice';
