import { z } from 'zod';

/*
 * The contracts of the GateFlow API (ADR-042): what each endpoint takes and gives, shared by the
 * server and its clients. Times are ISO 8601 instants in UTC. No schema carries personal data: a
 * ticket is a number, a state and a flight, never a name.
 */

export const CONTRACTS_VERSION = '0.8.0';

export const Segment = z.enum(['DEPARTING', 'TRANSFER']);

export const TicketState = z.enum([
  'QUEUED',
  'PREPARE',
  'CALLED',
  'RECALLED',
  'NO_SHOW',
  'ADMITTED',
  'EXPIRED',
  'REVIEW',
  'CANCELLED',
]);

export const RiskClass = z.enum(['UNVERIFIED', 'NORMAL', 'ATTENTION', 'URGENT', 'CRITICAL']);

/**
 * The mode of a checkpoint, set by its supervisor (S17, ADR-048): NORMAL, the policy of the day;
 * FIFO_ONLY, the order of arrival; PAUSED, nobody is called while kiosks go on issuing;
 * EMERGENCY, nobody is called, kiosks issue nothing and the call timers stop.
 */
export const CheckpointMode = z.enum(['NORMAL', 'FIFO_ONLY', 'PAUSED', 'EMERGENCY']);

/**
 * How a supervisor overrides the order of calls (S17): `BOOST`, the ticket enters the prepare
 * window at once, after the numbers already announced; `CALL_NOW`, it is called at once.
 */
export const Override = z.enum(['BOOST', 'CALL_NOW']);

/** Why a supervisor overrides the order (S17): a coded reason, never free text. */
export const OverrideReason = z.enum([
  'FLIGHT_CLOSING',
  'ASSISTANCE',
  'AIRLINE_REQUEST',
  'OPERATIONAL',
  'OTHER',
]);

const Instant = z.iso.datetime();

/** A ticket as staff see it. */
export const Ticket = z.object({
  id: z.uuid(),
  number: z.string(),
  state: TicketState,
  source: z.enum(['STAFF', 'KIOSK']),
  flightId: z.uuid(),
  segment: Segment,
  partySize: z.int().min(1).max(20),
  riskClass: RiskClass,
  /** Called out of the order of arrival at least once. */
  priority: z.boolean(),
  /** A supervisor overrode the order for it (S17): a boost or a call now. */
  overridden: z.boolean(),
  calls: z.int().min(0),
  issuedAt: Instant,
  firstCalledAt: Instant.nullable(),
  /** The latest call: a reactivated ticket is called again. */
  lastCalledAt: Instant.nullable(),
  admittedAt: Instant.nullable(),
});
export type Ticket = z.infer<typeof Ticket>;

/**
 * A kiosk scans a boarding pass (IATA BCBP). The pass is read in memory and never stored or logged
 * (ADR-043).
 */
export const ScanRequest = z.strictObject({
  bcbp: z.string().min(1).max(1100),
  /**
   * The reference of a ticket the pass joins (S15): a family scans its other boarding passes onto
   * one number, right after taking it.
   */
  party: z
    .string()
    .regex(/^[A-Za-z0-9_-]{16,64}$/)
    .optional(),
});

export const ScanOutcome = z.enum([
  'ISSUED',
  'RETRIEVED',
  /** A no-show scanned again within its window: back in the queue (S15). */
  'REACTIVATED',
  /** The pass joined the party of a waiting ticket (S15). */
  'ADDED',
  'REJECTED',
  'NEEDS_ASSISTANCE',
]);

/** Why a scan gave no ticket, or sent the passenger to staff. */
export const ScanReason = z.enum([
  'UNREADABLE',
  'WRONG_AIRPORT',
  'WRONG_DAY',
  'UNKNOWN_FLIGHT',
  'ALREADY_ADMITTED',
  /** The pass's ticket is held for a review by staff (S15). */
  'UNDER_REVIEW',
  /** Staff cancelled the pass's ticket (S15). */
  'CANCELLED',
  /** Boarding of the flight has closed, as GateFlow knows it: staff decide (S15). */
  'BOARDING_CLOSED',
  /** A pass added to a party is for another flight than the party's (S15). */
  'OTHER_FLIGHT',
  /** A pass added to a party already has a number of its own (S15). */
  'HAS_OWN_NUMBER',
  /** A party has the largest size a ticket may have (S15). */
  'PARTY_FULL',
  /** The party's number is called already: the pass takes its own (S15). */
  'TOO_LATE',
]);

/** Why staff issue a ticket by hand: a coded reason, never free text (S15). */
export const ManualReason = z.enum([
  'NO_BOARDING_PASS',
  'PASS_UNREADABLE',
  'ASSISTANCE',
  'GROUP',
  'OTHER',
]);

/** Staff issue a ticket for a passenger, or a party, of a flight. */
export const IssueTicketRequest = z.strictObject({
  flightId: z.uuid(),
  segment: Segment,
  partySize: z.int().min(1).max(20).default(1),
  reason: ManualReason,
});

export const IssueTicketResponse = z.object({
  ticket: Ticket,
  /** The reference of the passenger's page and QR code: given only here. */
  ref: z.string(),
});

export const ScanResponse = z.object({
  outcome: ScanOutcome,
  reason: ScanReason.nullable(),
  /** The ticket issued or found again; null when the scan gave none. */
  ticket: Ticket.nullable(),
  /** The reference of the ticket's page and QR code, to print it (again). */
  ref: z.string().nullable(),
});

export const CallNextResponse = z.object({
  /** The ticket called, or null when nobody is waiting. */
  called: Ticket.nullable(),
});

/**
 * A ticket presented at the access point: by its number, by the reference of its QR code, or by
 * the boarding pass it was issued for (read in memory, never stored, S15).
 */
export const AdmissionRequest = z.union([
  z.strictObject({ number: z.string().min(1).max(10) }),
  z.strictObject({ ref: z.string().min(16).max(64) }),
  z.strictObject({ bcbp: z.string().min(1).max(1100) }),
]);

/** What staff can do to one ticket (S15). */
export const StaffAction = z.enum([
  'RECALL',
  'MARK_NO_SHOW',
  'REACTIVATE',
  'HOLD',
  'CANCEL',
  'RESOLVE_REVIEW',
]);

/** A review ends with the ticket back at its place in the queue, or cancelled. */
export const ResolveReviewRequest = z.strictObject({ decision: z.enum(['QUEUE', 'CANCEL']) });

/** `DONE` when the ticket's state allowed the action; `NOT_ALLOWED` leaves it unchanged. */
export const StaffActionResponse = z.object({
  action: StaffAction,
  outcome: z.enum(['DONE', 'NOT_ALLOWED']),
  ticket: Ticket,
});

export const PresentOutcome = z.enum([
  'ADMITTED',
  'REACTIVATED',
  'EXPIRED',
  'NOT_CALLED',
  'ALREADY_ADMITTED',
  'UNDER_REVIEW',
  'CANCELLED',
]);

export const AdmissionResponse = z.object({
  outcome: PresentOutcome,
  ticket: Ticket,
});

export const QueueResponse = z.object({
  checkpointId: z.uuid(),
  serviceDay: z.iso.date(),
  /** The mode of the checkpoint (S17): no calls while PAUSED or in an EMERGENCY. */
  mode: CheckpointMode,
  /** The lanes open (S17): the day's configuration, until the supervisor sets them. */
  lanesOpen: z.int().min(1),
  tickets: z.array(Ticket),
});

/** A supervisor's override of one ticket (S17), with its coded reason. */
export const OverrideRequest = z.strictObject({ reason: OverrideReason });

/**
 * `DONE` when the override was applied; `NOT_ALLOWED` leaves the ticket as it was: its state, or
 * the mode (no override in FIFO_ONLY nor in an emergency, no call now while paused).
 */
export const OverrideResponse = z.object({
  override: Override,
  reason: OverrideReason,
  outcome: z.enum(['DONE', 'NOT_ALLOWED']),
  ticket: Ticket,
});

/** The supervisor sets the lanes open (S17). */
export const SetLanesRequest = z.strictObject({ lanesOpen: z.int().min(1).max(200) });

/** The lanes open now, and before. */
export const SetLanesResponse = z.object({
  lanesOpen: z.int().min(1),
  previous: z.int().min(1),
});

/**
 * The supervisor sets the mode of the checkpoint (S17). On resuming from PAUSED or EMERGENCY,
 * `reset` announces the prepare window again in order of arrival; without it, the window stays.
 */
export const SetModeRequest = z.strictObject({
  mode: CheckpointMode,
  reset: z.boolean().default(false),
});

/**
 * `DONE` when the mode changed; `NOT_ALLOWED` leaves it as it was: the same mode again, or a reset
 * that resumes nothing. `mode` is the mode now.
 */
export const SetModeResponse = z.object({
  outcome: z.enum(['DONE', 'NOT_ALLOWED']),
  mode: CheckpointMode,
  previous: CheckpointMode,
  reset: z.boolean(),
});

/** What a passenger sees on the page of their ticket: no personal data. */
export const PublicTicketResponse = z.object({
  number: z.string(),
  /** The people on the ticket (S15). */
  partySize: z.int().min(1).max(20),
  state: TicketState,
  checkpoint: z.string(),
  serviceDay: z.iso.date(),
  /**
   * The mode of the checkpoint (S17): the page says when calls are paused, and in an emergency
   * that the staff's instructions come first.
   */
  mode: CheckpointMode,
});

export const AuditVerifyResponse = z.object({
  checkpointId: z.uuid(),
  commands: z.int().min(0),
  events: z.int().min(0),
  /** True when every command and event matches the chain of hashes. */
  intact: z.boolean(),
  /** The first command whose hash does not match, when the chain is broken. */
  firstBrokenSeq: z.int().nullable(),
  headHash: z.string().nullable(),
});

export const HealthResponse = z.object({ status: z.literal('ok'), version: z.string() });

export const DeviceKind = z.enum(['KIOSK', 'DISPLAY', 'LANE']);

/**
 * A device's view of itself (S14): where a kiosk stands, to show it. Display names are labels of
 * places and devices, never of people.
 */
export const DeviceResponse = z.object({
  device: z.object({ id: z.uuid(), kind: DeviceKind, label: z.string() }),
  checkpoint: z.object({ id: z.uuid(), label: z.string() }),
  airport: z.object({
    label: z.string(),
    /** IATA code of the airport, `ZZZ` until it is configured. */
    iata: z.string().length(3),
    timeZone: z.string(),
    /** A synthetic airport of demos: its kiosks offer sample boarding passes. */
    synthetic: z.boolean(),
  }),
});

/**
 * The demo flights leaving a kiosk's airport in the next 24 hours, for sample boarding passes;
 * never live flights.
 */
export const DemoFlightsResponse = z.object({
  /** The day at the airport. */
  date: z.iso.date(),
  flights: z.array(
    z.object({
      /** The flight a ticket names (S15): a party's sample passes are for its own flight. */
      id: z.uuid(),
      carrier: z.string(),
      flightNumber: z.string(),
      departure: Instant,
      /** The local date of the departure: the date on the flight's boarding passes. */
      date: z.iso.date(),
    }),
  ),
});

export const ErrorResponse = z.object({
  error: z.object({ code: z.string(), message: z.string() }),
});

/** A checkpoint as its staff see it (S15): where it is, how its tickets are numbered. */
export const CheckpointResponse = z.object({
  checkpoint: z.object({ id: z.uuid(), label: z.string(), ticketPrefix: z.string() }),
  airport: z.object({
    label: z.string(),
    iata: z.string().length(3),
    timeZone: z.string(),
    synthetic: z.boolean(),
  }),
});

/** The flights staff can issue a manual ticket for: from an hour ago to 24 hours ahead (S15). */
export const FlightsResponse = z.object({
  flights: z.array(
    z.object({
      id: z.uuid(),
      /** As passengers read it: `ZZ 12`, or the airport's own code without a designator. */
      label: z.string(),
      departure: Instant,
      /** When boarding closes, as GateFlow knows it. */
      boardingClose: Instant.nullable(),
    }),
  ),
});

/** The roles of airport staff (S15), each with what the previous one may do. */
export const StaffRole = z.enum(['OPERATOR', 'SUPERVISOR', 'ADMIN']);

/** A member of staff signs in with their login and password (S15). */
export const SignInRequest = z.strictObject({
  login: z.string().min(3).max(63),
  password: z.string().min(1).max(200),
});

/** A member of staff: never their password, never their session's token. */
export const StaffMember = z.object({
  id: z.uuid(),
  login: z.string(),
  role: StaffRole,
  /** The checkpoints they work at; null for every checkpoint of their airport. */
  checkpoints: z.array(z.uuid()).nullable(),
});

/** The member of staff who signed in. */
export const StaffMemberResponse = z.object({ member: StaffMember });

/** Who is signed in on this browser: a member of staff, or nobody (`null`). */
export const MeResponse = z.object({ member: StaffMember.nullable() });

/** A number called, as a display shows it (S16). */
export const DisplayCall = z.object({
  number: z.string(),
  /** The second call: the passenger did not come at the first. */
  second: z.boolean(),
  at: Instant,
});

/** What a display shows (S16): numbers only, no personal data, no position, no waiting time. */
export const DisplayBoard = z.object({
  serviceDay: z.iso.date(),
  /** The numbers called, the latest call first. */
  called: z.array(DisplayCall),
  /** The numbers to get ready, in the order they will be called. */
  prepare: z.array(z.string()),
  /**
   * The mode of the checkpoint (S17): PAUSED, the display says calls are paused; EMERGENCY, it
   * shows the emergency message instead of numbers.
   */
  mode: CheckpointMode,
  /** When the board last changed: the time of the latest command of the checkpoint. */
  updatedAt: Instant,
});

/**
 * A message of a display's stream (S16), `event: board` with `id:` its `seq`: the board after the
 * command `seq` of the checkpoint's log, and the calls since the previous message, oldest first.
 * A display that reconnects with `Last-Event-ID` gets the calls it missed in its first message.
 */
export const DisplayMessage = z.object({
  seq: z.int().min(0),
  board: DisplayBoard,
  calls: z.array(DisplayCall),
});

/** The heartbeat of a stream (S16), `event: heartbeat`, every 10 seconds: the server's time. */
export const Heartbeat = z.object({ at: Instant });

/** A message of a staff stream (S16), `event: changed` with `id:` its `seq`: the queue changed. */
export const QueueChanged = z.object({ seq: z.int().min(0) });

/**
 * A message of a kiosk's stream (S17), `event: status` with `id:` its `seq`: the mode of the
 * checkpoint, at once and at each change. In an EMERGENCY the kiosk shows the emergency message
 * and scans nothing.
 */
export const KioskStatus = z.object({ seq: z.int().min(0), mode: CheckpointMode });

/** The types of the answers, for clients that do not validate them (the web application). */
export type TicketState = z.infer<typeof TicketState>;
export type ScanOutcome = z.infer<typeof ScanOutcome>;
export type ScanReason = z.infer<typeof ScanReason>;
export type ScanResponse = z.infer<typeof ScanResponse>;
export type PublicTicketResponse = z.infer<typeof PublicTicketResponse>;
export type DeviceKind = z.infer<typeof DeviceKind>;
export type DeviceResponse = z.infer<typeof DeviceResponse>;
export type DisplayCall = z.infer<typeof DisplayCall>;
export type DisplayBoard = z.infer<typeof DisplayBoard>;
export type DisplayMessage = z.infer<typeof DisplayMessage>;
export type Heartbeat = z.infer<typeof Heartbeat>;
export type QueueChanged = z.infer<typeof QueueChanged>;
export type CheckpointMode = z.infer<typeof CheckpointMode>;
export type OverrideReason = z.infer<typeof OverrideReason>;
export type OverrideResponse = z.infer<typeof OverrideResponse>;
export type SetLanesResponse = z.infer<typeof SetLanesResponse>;
export type KioskStatus = z.infer<typeof KioskStatus>;
export type SetModeResponse = z.infer<typeof SetModeResponse>;
export type DemoFlightsResponse = z.infer<typeof DemoFlightsResponse>;
export type ManualReason = z.infer<typeof ManualReason>;
export type StaffActionResponse = z.infer<typeof StaffActionResponse>;
export type StaffRole = z.infer<typeof StaffRole>;
export type CheckpointResponse = z.infer<typeof CheckpointResponse>;
export type FlightsResponse = z.infer<typeof FlightsResponse>;
export type QueueResponse = z.infer<typeof QueueResponse>;
export type AdmissionResponse = z.infer<typeof AdmissionResponse>;
export type CallNextResponse = z.infer<typeof CallNextResponse>;
export type IssueTicketResponse = z.infer<typeof IssueTicketResponse>;
export type StaffMemberResponse = z.infer<typeof StaffMemberResponse>;
export type MeResponse = z.infer<typeof MeResponse>;
export type ErrorResponse = z.infer<typeof ErrorResponse>;

/** An endpoint of the API, for the OpenAPI document. */
export interface Route {
  readonly method: 'get' | 'post';
  readonly path: string;
  readonly summary: string;
  /** Commands take an `Idempotency-Key`: the same key gives the same answer, applied once. */
  readonly command: boolean;
  /** Only a registered device may call it, with its token (`Authorization: Bearer`). */
  readonly device?: boolean;
  /** Only staff signed in with at least this role, at the checkpoint, may call it (S15). */
  readonly staff?: z.infer<typeof StaffRole>;
  readonly body?: z.ZodType;
  /**
   * Server-sent events (S16): the answer is a `text/event-stream`, the schema of 200 that of its
   * messages' data; `Last-Event-ID` resumes it.
   */
  readonly stream?: boolean;
  readonly responses: Readonly<
    Record<string, { readonly description: string; readonly schema: z.ZodType }>
  >;
}

const errors = {
  '400': { description: 'The request is invalid', schema: ErrorResponse },
  '404': { description: 'Not found', schema: ErrorResponse },
} as const;

const staffErrors = {
  '401': { description: 'Not signed in as staff', schema: ErrorResponse },
  '403': {
    description: 'Another site, or a role or checkpoint that does not allow it',
    schema: ErrorResponse,
  },
} as const;

const deviceErrors = {
  '401': { description: 'No device token, or one that is not valid', schema: ErrorResponse },
  '403': { description: 'Not a device of this kind at this checkpoint', schema: ErrorResponse },
} as const;

export const ROUTES: readonly Route[] = [
  {
    method: 'get',
    path: '/v1/health',
    summary: 'The service is up',
    command: false,
    responses: { '200': { description: 'Up', schema: HealthResponse } },
  },
  {
    method: 'post',
    path: '/v1/checkpoints/{checkpointId}/tickets',
    summary: 'Issue a ticket for a passenger, or a party, of a flight (staff, with a reason)',
    command: true,
    staff: 'OPERATOR',
    body: IssueTicketRequest,
    responses: {
      '201': { description: 'Issued', schema: IssueTicketResponse },
      ...errors,
      ...staffErrors,
      '409': {
        description:
          'The checkpoint is in an emergency (`EMERGENCY`), or the idempotency key was reused',
        schema: ErrorResponse,
      },
    },
  },
  {
    method: 'post',
    path: '/v1/checkpoints/{checkpointId}/scans',
    summary:
      'A kiosk scans a boarding pass: a ticket, the same ticket again, the pass added to a party, or a reason',
    command: true,
    device: true,
    body: ScanRequest,
    responses: {
      '201': { description: 'A ticket was issued', schema: ScanResponse },
      '200': {
        description: 'The ticket found again, the party the pass joined, or why there is none',
        schema: ScanResponse,
      },
      ...errors,
      ...deviceErrors,
      '409': {
        description: 'The checkpoint is in an emergency (`EMERGENCY`): kiosks scan nothing',
        schema: ErrorResponse,
      },
    },
  },
  {
    method: 'get',
    path: '/v1/devices/me',
    summary: 'The device that calls: its kind, its checkpoint and its airport',
    command: false,
    device: true,
    responses: {
      '200': { description: 'The device', schema: DeviceResponse },
      '401': deviceErrors['401'],
    },
  },
  {
    method: 'get',
    path: '/v1/checkpoints/{checkpointId}/display',
    summary:
      "A display's stream (S16): the board after each command, the calls since the previous message, and a heartbeat every 10 seconds",
    command: false,
    device: true,
    stream: true,
    responses: {
      '200': {
        description:
          'Server-sent events: `board` messages (id: the sequence number of the log) and `heartbeat` messages',
        schema: DisplayMessage,
      },
      ...deviceErrors,
      '404': errors['404'],
    },
  },
  {
    method: 'get',
    path: '/v1/checkpoints/{checkpointId}/stream',
    summary:
      "The lane station's stream (S16): a message whenever the checkpoint's queue changes, and a heartbeat every 10 seconds",
    command: false,
    staff: 'OPERATOR',
    stream: true,
    responses: {
      '200': {
        description:
          'Server-sent events: `changed` messages (id: the sequence number of the log) and `heartbeat` messages',
        schema: QueueChanged,
      },
      ...staffErrors,
      '404': errors['404'],
    },
  },
  {
    method: 'get',
    path: '/v1/checkpoints/{checkpointId}/kiosk',
    summary:
      "A kiosk's stream (S17): the mode of the checkpoint, at once and at each change, and a heartbeat every 10 seconds",
    command: false,
    device: true,
    stream: true,
    responses: {
      '200': {
        description:
          'Server-sent events: `status` messages (id: the sequence number of the log) and `heartbeat` messages',
        schema: KioskStatus,
      },
      ...deviceErrors,
      '404': errors['404'],
    },
  },
  {
    method: 'get',
    path: '/v1/checkpoints/{checkpointId}/demo-flights',
    summary: "The next 24 hours' demo flights, for a kiosk's sample boarding passes",
    command: false,
    device: true,
    responses: {
      '200': { description: 'The demo flights', schema: DemoFlightsResponse },
      ...errors,
      ...deviceErrors,
    },
  },
  {
    method: 'post',
    path: '/v1/checkpoints/{checkpointId}/calls',
    summary: 'Call the next passenger: the engine chooses who',
    command: true,
    staff: 'OPERATOR',
    responses: {
      '200': { description: 'Called, or nobody waiting', schema: CallNextResponse },
      ...errors,
      ...staffErrors,
      '409': {
        description:
          'Calls are paused or stopped by the supervisor (`CALLS_PAUSED`), or the idempotency key was reused',
        schema: ErrorResponse,
      },
    },
  },
  {
    method: 'post',
    path: '/v1/checkpoints/{checkpointId}/mode',
    summary:
      'Set the mode of the checkpoint (S17): NORMAL, FIFO_ONLY, PAUSED or EMERGENCY; on resuming, optionally the window again in order of arrival',
    command: true,
    staff: 'SUPERVISOR',
    body: SetModeRequest,
    responses: {
      '200': { description: 'Set, or not allowed: nothing changed', schema: SetModeResponse },
      ...errors,
      ...staffErrors,
      '409': { description: 'Idempotency key reused for another request', schema: ErrorResponse },
    },
  },
  {
    method: 'post',
    path: '/v1/checkpoints/{checkpointId}/admissions',
    summary: 'A passenger presents their ticket at the access point',
    command: true,
    staff: 'OPERATOR',
    body: AdmissionRequest,
    responses: {
      '200': { description: 'The outcome of the presentation', schema: AdmissionResponse },
      ...errors,
      ...staffErrors,
      '409': { description: 'Idempotency key reused for another request', schema: ErrorResponse },
    },
  },
  ...(
    [
      [
        'recall',
        'Call a called passenger again, now: the no-show timeout counts from this call',
        'OPERATOR',
      ],
      ['no-show', 'Mark a called passenger as absent, now', 'OPERATOR'],
      ['reactivate', 'Bring a no-show back to the queue, within its window', 'OPERATOR'],
      ['review', 'Hold a waiting ticket for a review: it keeps its place', 'OPERATOR'],
      ['cancel', 'Cancel a ticket', 'SUPERVISOR'],
    ] as const
  ).map(([action, summary, role]): Route => ({
    method: 'post',
    path: `/v1/checkpoints/{checkpointId}/tickets/{ticketId}/${action}`,
    summary,
    command: true,
    staff: role,
    responses: {
      '200': { description: 'Done, or not allowed in its state', schema: StaffActionResponse },
      ...errors,
      ...staffErrors,
      '409': { description: 'Idempotency key reused for another request', schema: ErrorResponse },
    },
  })),
  {
    method: 'post',
    path: '/v1/checkpoints/{checkpointId}/tickets/{ticketId}/resolve',
    summary: 'End the review of a ticket: back to its place in the queue, or cancelled',
    command: true,
    staff: 'SUPERVISOR',
    body: ResolveReviewRequest,
    responses: {
      '200': { description: 'Done, or not allowed in its state', schema: StaffActionResponse },
      ...errors,
      ...staffErrors,
      '409': { description: 'Idempotency key reused for another request', schema: ErrorResponse },
    },
  },
  ...(
    [
      [
        'boost',
        'A supervisor boosts a waiting ticket (S17): it enters the prepare window at once, after the numbers announced',
      ],
      ['call-now', 'A supervisor calls a waiting or announced ticket at once (S17)'],
    ] as const
  ).map(([action, summary]): Route => ({
    method: 'post',
    path: `/v1/checkpoints/{checkpointId}/tickets/{ticketId}/${action}`,
    summary,
    command: true,
    staff: 'SUPERVISOR',
    body: OverrideRequest,
    responses: {
      '200': {
        description: 'Done, or not allowed in its state or in the mode',
        schema: OverrideResponse,
      },
      ...errors,
      ...staffErrors,
      '409': { description: 'Idempotency key reused for another request', schema: ErrorResponse },
    },
  })),
  {
    method: 'post',
    path: '/v1/checkpoints/{checkpointId}/lanes',
    summary:
      "A supervisor sets the lanes open (S17): the engine's estimates follow at once, for the rest of the service day",
    command: true,
    staff: 'SUPERVISOR',
    body: SetLanesRequest,
    responses: {
      '200': { description: 'The lanes open now, and before', schema: SetLanesResponse },
      ...errors,
      ...staffErrors,
      '409': { description: 'Idempotency key reused for another request', schema: ErrorResponse },
    },
  },
  {
    method: 'get',
    path: '/v1/checkpoints/{checkpointId}',
    summary: 'The checkpoint and its airport, for its staff',
    command: false,
    staff: 'OPERATOR',
    responses: {
      '200': { description: 'The checkpoint', schema: CheckpointResponse },
      ...errors,
      ...staffErrors,
    },
  },
  {
    method: 'get',
    path: '/v1/checkpoints/{checkpointId}/flights',
    summary: 'The flights of the next 24 hours (and of the last hour), for manual tickets',
    command: false,
    staff: 'OPERATOR',
    responses: {
      '200': { description: 'The flights', schema: FlightsResponse },
      ...errors,
      ...staffErrors,
    },
  },
  {
    method: 'get',
    path: '/v1/checkpoints/{checkpointId}/queue',
    summary: "The day's tickets, as staff see them",
    command: false,
    staff: 'OPERATOR',
    responses: {
      '200': { description: 'The queue', schema: QueueResponse },
      ...errors,
      ...staffErrors,
    },
  },
  {
    method: 'get',
    path: '/v1/checkpoints/{checkpointId}/audit/verify',
    summary: "Check the chain of hashes of the checkpoint's log",
    command: false,
    staff: 'SUPERVISOR',
    responses: {
      '200': { description: 'The check', schema: AuditVerifyResponse },
      ...errors,
      ...staffErrors,
    },
  },
  {
    method: 'get',
    path: '/v1/tickets/{ref}',
    summary: "The passenger's view of a ticket",
    command: false,
    responses: { '200': { description: 'The ticket', schema: PublicTicketResponse }, ...errors },
  },
  {
    method: 'post',
    path: '/v1/auth/sign-in',
    summary: 'A member of staff signs in: the session goes in an HttpOnly cookie',
    command: false,
    body: SignInRequest,
    responses: {
      '200': { description: 'Signed in', schema: StaffMemberResponse },
      '401': { description: 'The login or the password is not right', schema: ErrorResponse },
      '429': { description: 'Too many failed sign-ins for this login', schema: ErrorResponse },
    },
  },
  {
    method: 'get',
    path: '/v1/auth/me',
    summary: 'Who is signed in on this browser: a member of staff, or nobody',
    command: false,
    responses: { '200': { description: 'The member, or null', schema: MeResponse } },
  },
  {
    method: 'post',
    path: '/v1/auth/sign-out',
    summary: 'End the session',
    command: false,
    responses: { '204': { description: 'Signed out', schema: z.null() } },
  },
];

/** The OpenAPI 3.1 document of the API, generated from the contracts. */
export function openApiDocument(version: string): Record<string, unknown> {
  const paths: Record<string, Record<string, unknown>> = {};
  for (const route of ROUTES) {
    const parameters = [...route.path.matchAll(/\{(\w+)\}/g)].map((m) => ({
      name: m[1],
      in: 'path',
      required: true,
      schema: { type: 'string' },
    }));
    if (route.command) {
      parameters.push({
        name: 'Idempotency-Key',
        in: 'header',
        required: false,
        schema: { type: 'string' },
      });
    }
    if (route.stream === true) {
      parameters.push({
        name: 'Last-Event-ID',
        in: 'header',
        required: false,
        schema: { type: 'string' },
      });
    }
    const operation: Record<string, unknown> = {
      summary: route.summary,
      parameters,
      responses: Object.fromEntries(
        Object.entries(route.responses).map(([status, r]) => [
          status,
          {
            description: r.description,
            content: {
              [route.stream === true && status === '200'
                ? 'text/event-stream'
                : 'application/json']: { schema: z.toJSONSchema(r.schema, { io: 'output' }) },
            },
          },
        ]),
      ),
    };
    if (route.device === true) operation.security = [{ device: [] }];
    if (route.staff !== undefined) {
      operation.security = [{ staff: [] }];
      operation['x-gateflow-role'] = route.staff;
    }
    if (route.body !== undefined) {
      operation.requestBody = {
        required: true,
        content: { 'application/json': { schema: z.toJSONSchema(route.body, { io: 'input' }) } },
      };
    }
    const forPath = paths[route.path] ?? {};
    forPath[route.method] = operation;
    paths[route.path] = forPath;
  }
  return {
    openapi: '3.1.0',
    info: {
      title: 'GateFlow API',
      version,
      description:
        'The operational checkpoint: tickets, calls and admissions, one writer per checkpoint, idempotent commands and a hash-chained log.',
    },
    paths,
    components: {
      securitySchemes: {
        device: {
          type: 'http',
          scheme: 'bearer',
          description:
            'The token of a registered device (kiosk, display, lane station), given once by `gateflow-api device add`; only its hash is stored.',
        },
        staff: {
          type: 'apiKey',
          in: 'cookie',
          name: 'gateflow_session',
          description:
            'The session of a member of staff, from `POST /v1/auth/sign-in`: HttpOnly, SameSite=Strict. The role each route needs is in `x-gateflow-role`.',
        },
      },
    },
  };
}
