import { z } from 'zod';

/*
 * The contracts of the GateFlow API (ADR-042): what each endpoint takes and gives, shared by the
 * server and its clients. Times are ISO 8601 instants in UTC. No schema carries personal data: a
 * ticket is a number, a state and a flight, never a name.
 */

export const CONTRACTS_VERSION = '0.13.0';

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
  /** Staff, a kiosk, or the digital twin's simulated passengers (S18). */
  source: z.enum(['STAFF', 'KIOSK', 'TWIN']),
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
  /**
   * When the passenger first presented at the checkpoint (S20): the issue, or the earlier
   * presentation a ticket issued again keeps. A wait runs from here.
   */
  presentedAt: Instant,
  /** People who overtook the ticket while it waited (S20): the policy's bound K limits it. */
  overtaken: z.int().min(0),
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
  /**
   * The time of the checkpoint's latest command, null before its first (S18): for a checkpoint of
   * the digital twin, its virtual clock.
   */
  updatedAt: z.iso.datetime().nullable(),
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

/**
 * One command of a checkpoint's log, as the audit view shows it (S17, ADR-050): who, what, when and
 * why, with the tickets its events changed. Coded values only: no ticket reference, no HMAC.
 */
export const AuditEntry = z.object({
  seq: z.int().min(1),
  at: Instant,
  /** The command, e.g. `CALL_NEXT`, `OVERRIDE`, `SET_MODE`. */
  command: z.string(),
  /** A member of staff (their login), a device (its label), or GateFlow itself (`timer`). */
  by: z.object({ kind: z.enum(['STAFF', 'DEVICE', 'SYSTEM']), label: z.string() }),
  /** The number of the ticket the command names, or called. */
  ticket: z.string().nullable(),
  /** What it did: `DONE`, `NOT_ALLOWED`, `ADMITTED`, `NOBODY_WAITING`... */
  outcome: z.string().nullable(),
  /** The coded reason of an override or a manual ticket. */
  reason: z.string().nullable(),
  /** The coded values that read the command: the mode, the lanes, the override, the policy... */
  detail: z.object({
    mode: CheckpointMode.optional(),
    previous: CheckpointMode.optional(),
    reset: z.boolean().optional(),
    lanesOpen: z.int().optional(),
    previousLanes: z.int().optional(),
    override: Override.optional(),
    policy: z.string().optional(),
    source: z.string().optional(),
    partySize: z.int().optional(),
    method: z.string().optional(),
    people: z.int().optional(),
    decision: z.string().optional(),
    /** The tickets of a flight that took what the feed knows (S18). */
    tickets: z.int().optional(),
  }),
  /** The events of the command, in order, with the number of the ticket each changed. */
  events: z.array(z.object({ type: z.string(), ticket: z.string().nullable() })),
});

/** A page of the audit view, the latest command first; `more` when older ones remain. */
export const AuditResponse = z.object({
  checkpointId: z.uuid(),
  serviceDay: z.iso.date(),
  entries: z.array(AuditEntry),
  more: z.boolean(),
});

/** A policy as the console shows it (S17): its name, version and the hash of its content. */
export const PolicySummary = z.object({
  policyId: z.string(),
  version: z.string(),
  title: z.string(),
  /** The SHA-256 of the policy's canonical JSON. */
  hash: z.string().regex(/^[0-9a-f]{64}$/),
});

/**
 * The policies of a checkpoint (S17, ADR-050): today's, as its day opened; the next service
 * day's; the airport's versions; the latest activations.
 */
export const PolicyStatusResponse = z.object({
  checkpointId: z.uuid(),
  today: z.object({ serviceDay: z.iso.date(), policy: PolicySummary }),
  next: z.object({ serviceDay: z.iso.date(), policy: PolicySummary }),
  versions: z.array(
    PolicySummary.extend({ id: z.uuid(), createdAt: Instant, createdBy: z.string() }),
  ),
  activations: z.array(
    z.object({
      versionId: z.uuid(),
      hash: z.string(),
      fromServiceDay: z.iso.date(),
      activatedAt: Instant,
      activatedBy: z.string(),
    }),
  ),
});

/**
 * An administrator publishes a version of a policy (S17): a policy of the queue engine, checked as
 * a live checkpoint runs it. The same content gives the same version.
 */
export const PublishPolicyRequest = z.strictObject({
  policy: z.looseObject({ id: z.string(), version: z.string(), title: z.string() }),
});

export const PublishPolicyResponse = z.object({
  id: z.uuid(),
  hash: z.string(),
  /** False when the same content was published already. */
  created: z.boolean(),
});

/** An administrator activates a version for the checkpoint, from the next service day (S17). */
export const ActivatePolicyRequest = z.strictObject({ versionId: z.uuid() });

export const ActivatePolicyResponse = z.object({
  fromServiceDay: z.iso.date(),
  policy: PolicySummary,
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
  checkpoint: z.object({
    id: z.uuid(),
    label: z.string(),
    ticketPrefix: z.string(),
    /**
     * A checkpoint of the digital twin (S18): the twin drives it on its virtual day, staff only
     * watch it. Null for a real checkpoint.
     */
    twin: z.object({ runId: z.uuid(), serviceDay: z.iso.date() }).nullable(),
  }),
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
export const StaffRole = z.enum(['OPERATOR', 'SUPERVISOR', 'ADMIN', 'ANALYST']);

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
export type AuditEntry = z.infer<typeof AuditEntry>;
export type AuditVerifyResponse = z.infer<typeof AuditVerifyResponse>;
export type AuditResponse = z.infer<typeof AuditResponse>;
export type PolicyStatusResponse = z.infer<typeof PolicyStatusResponse>;
export type PublishPolicyResponse = z.infer<typeof PublishPolicyResponse>;
export type ActivatePolicyResponse = z.infer<typeof ActivatePolicyResponse>;
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

/** The states of a run of the digital twin (S18). */
export const TwinState = z.enum(['RUNNING', 'STOPPED', 'FINISHED', 'DIVERGED', 'FAILED']);

/**
 * How fast the twin plays (S18): virtual time per real time, from 1 to 10,000; null, as fast as the
 * server goes.
 */
export const TwinSpeed = z.int().min(1).max(10_000).nullable();

/** What the twin can play at this airport (S18): the server's scenarios, the airport's policies. */
export const TwinOptionsResponse = z.object({
  scenarios: z.array(z.object({ id: z.string(), title: z.string() })),
  /** The airport's versions that the live system runs. */
  policies: z.array(PolicySummary.extend({ id: z.uuid() })),
});

/** An administrator starts the twin (S18): a scenario's day, a seed, a policy, a speed. */
export const StartTwinRequest = z.strictObject({
  scenarioId: z.string().min(1).max(100),
  seed: z.int().min(1).max(1_000_000),
  policyVersionId: z.uuid(),
  speed: TwinSpeed,
  /** The last time of the day to play, `HH:MM`; the whole day when absent. */
  until: z
    .string()
    .regex(/^([01][0-9]|2[0-3]):[0-5][0-9]$/)
    .optional(),
});

/** The speed of a run, changed while it plays (S18). */
export const TwinSpeedRequest = z.strictObject({ speed: TwinSpeed });

/** A run of the twin (S18): what it plays, how far it went, and whether it matched. */
export const TwinRun = z.object({
  id: z.uuid(),
  checkpointId: z.uuid(),
  /** The twin checkpoint's name. */
  checkpoint: z.string(),
  scenarioId: z.string(),
  seed: z.int(),
  policy: PolicySummary,
  serviceDay: z.iso.date(),
  state: TwinState,
  speed: TwinSpeed,
  /** The virtual clock: where the run is in its day. */
  virtualNow: Instant,
  /** The first and the last operation the run plays. */
  from: Instant,
  to: Instant,
  /** The operations played, of all; the calls made in the simulator's order, of all. */
  applied: z.int().min(0),
  steps: z.int().min(0),
  matchedCalls: z.int().min(0),
  expectedCalls: z.int().min(0),
  /** The first answer of the live system that was not the simulator's: numbers or outcomes. */
  divergence: z
    .object({
      at: Instant,
      operation: z.string(),
      expected: z.string(),
      actual: z.string(),
    })
    .nullable(),
  error: z.string().nullable(),
  startedAt: Instant,
  endedAt: Instant.nullable(),
});

/** A call of the twin, with the engine's reasons for the ticket (S18). */
export const TwinCall = z.object({
  number: z.string(),
  at: Instant,
  /** Called out of the order of arrival by the engine. */
  priority: z.boolean(),
  reasons: z.array(z.string()),
});

/** The twin of the airport (S18): its latest run, and what its checkpoint shows now. */
export const TwinResponse = z.object({
  run: TwinRun.nullable(),
  /** What the twin's displays show. */
  board: DisplayBoard.nullable(),
  /** The latest calls, the latest first. */
  calls: z.array(TwinCall),
  /** The twin's tickets of the day: issued, waiting (or announced), called, admitted. */
  counts: z.object({
    issued: z.int().min(0),
    waiting: z.int().min(0),
    called: z.int().min(0),
    admitted: z.int().min(0),
  }),
});

/** A display device made for the twin's checkpoint (S18): its token, given once. */
export const TwinDisplayResponse = z.object({ checkpointId: z.uuid(), token: z.string() });

export type TwinState = z.infer<typeof TwinState>;
export type TwinOptionsResponse = z.infer<typeof TwinOptionsResponse>;
export type StartTwinRequest = z.infer<typeof StartTwinRequest>;
export type TwinRun = z.infer<typeof TwinRun>;
export type TwinCall = z.infer<typeof TwinCall>;
export type TwinResponse = z.infer<typeof TwinResponse>;
export type TwinDisplayResponse = z.infer<typeof TwinDisplayResponse>;

/** Tickets and the people on them (S20). */
export const Group = z.object({ tickets: z.int().min(0), people: z.int().min(0) });

/** Durations per person (S20): median, 90th percentile and largest, in milliseconds. */
export const Spread = z.object({
  people: z.int().min(1),
  p50Ms: z.int().min(0),
  p90Ms: z.int().min(0),
  maxMs: z.int().min(0),
});

/** A condition the duty manager should see (S20): worked out from the state, not stored. */
export const OverviewAlert = z.object({
  code: z.enum([
    'EMERGENCY',
    'CRITICAL_WAITING',
    'CALLS_PAUSED',
    'REVIEWS_PENDING',
    'STALE_FLIGHT_DATA',
    'FIFO_ONLY',
  ]),
  severity: z.enum(['CRITICAL', 'WARNING', 'INFO']),
  /** How many tickets or flights, when it counts any. */
  count: z.int().min(0).nullable(),
});

/**
 * The operations overview of a checkpoint's service day (S20, ADR-053), from its current state.
 * Waits as the simulator counts them: per person, from the first presentation to the admission.
 */
export const OverviewResponse = z.object({
  checkpointId: z.uuid(),
  serviceDay: z.iso.date(),
  /** The time of the figures: now; for a twin's checkpoint, its virtual time. */
  at: Instant,
  /** The day's latest command: what the figures reflect. */
  seq: z.int().min(0),
  mode: CheckpointMode,
  lanesOpen: z.int().min(1),
  tickets: z.object({
    waiting: Group,
    prepare: Group,
    /** Called, or called again, and not yet come. */
    called: Group,
    review: Group,
    noShow: Group,
    admitted: Group,
    expired: Group,
    cancelled: Group,
  }),
  /** How long the people waiting now (waiting, announced, called) have waited so far. */
  waitingNow: Spread.nullable(),
  /** The waits of the people admitted, in the last hour and over the day. */
  waits: z.object({ lastHour: Spread.nullable(), day: Spread.nullable() }),
  /** People waiting or announced whose class says they are at risk. */
  atRisk: z.object({ ATTENTION: Group, URGENT: Group, CRITICAL: Group }),
  /** The fairness monitor: the engine's jumps of the order, overrides, and the bound K. */
  fairness: z.object({
    commitments: z.int().min(0),
    priorityCommitments: z.int().min(0),
    passedPeople: z.int().min(0),
    overrides: z.int().min(0),
    /** The most people who overtook a ticket still in play. */
    mostOvertaken: z.int().min(0),
    overtakeBound: z.int().min(0).nullable(),
  }),
  /** Where the closing times of the day's flights come from, and how fresh they are. */
  dataQuality: z.object({
    flights: z.int().min(0),
    feed: z.int().min(0),
    rule: z.int().min(0),
    none: z.int().min(0),
    /** The stale-data rule (ADR-029): how long the feed's word holds; null without one. */
    staleAfterMs: z.int().min(0).nullable(),
    /** Flights the feed has not confirmed within the stale-data rule; null without the rule. */
    stale: z.int().min(0).nullable(),
    unverified: Group,
  }),
  alerts: z.array(OverviewAlert),
});

/** The check of the overview against the log (S20): the day replayed, every figure and ticket. */
export const OverviewVerifyResponse = z.object({
  checkpointId: z.uuid(),
  serviceDay: z.iso.date(),
  at: Instant,
  /** The commands of the day replayed. */
  commands: z.int().min(0),
  /** True when every figure and every ticket of the current state equals the replay's. */
  intact: z.boolean(),
  /** What differs, the first 20: the current state's value and the log's. */
  differences: z.array(z.object({ what: z.string(), live: z.string(), log: z.string() })),
});

export type OverviewResponse = z.infer<typeof OverviewResponse>;
export type OverviewVerifyResponse = z.infer<typeof OverviewVerifyResponse>;

/** A scenario's name (S19): the SHA-256 of its canonical JSON, as results record it. */
export const ScenarioHash = z.string().regex(/^sha256:[0-9a-f]{64}$/);

/** A forecast's spread (S21): the 10th, 50th and 90th percentile of its simulated paths. */
export const ForecastBand = z.object({
  p10: z.number().min(0),
  p50: z.number().min(0),
  p90: z.number().min(0),
});

/**
 * GateFlow Predict, a preview (S21, ADR-054): what the next 90 minutes may bring at a checkpoint,
 * from what the live system knows now and the simulated days of the checkpoint's scenario. Every
 * number is a band over simulated paths: SIMULATED, not a measurement. People and minutes are
 * rounded to a tenth.
 */
export const ForecastResponse = z.object({
  checkpointId: z.uuid(),
  serviceDay: z.iso.date(),
  /** The time of the forecast: now; for a twin's checkpoint, its virtual time. */
  at: Instant,
  /** What the forecast learnt from. */
  model: z.object({
    version: z.string(),
    /** Simulated paths behind every band. */
    paths: z.int().min(1),
    /** The simulated days of the scenario the arrivals come from. */
    days: z.int().min(1),
    scenario: z.object({
      id: z.string(),
      title: z.string(),
      hash: ScenarioHash,
      dataClassification: z.string(),
    }),
  }),
  /** What the forecast read of the checkpoint now. */
  state: z.object({
    /** People who took a number in the last hour, each party once. */
    arrivalsLastHour: z.int().min(0),
    /** The arrivals of the last hour the simulated days expect, on average. */
    expectedLastHour: z.number().min(0),
    /** Seen against expected: (seen + 5) / (expected + 5), within 0.5 and 2. */
    scale: z.number().min(0.5).max(2),
    /** People not yet admitted: waiting, announced, called. */
    backlog: z.int().min(0),
    lanesOpen: z.int().min(1),
    ratePerLanePerHour: z.number().positive(),
  }),
  /** People arriving in each 5 minutes of the next 90. */
  buckets: z.array(z.object({ fromMin: z.int().min(0), arrivals: ForecastBand })),
  horizons: z.array(
    z.object({
      minutes: z.int().min(1),
      at: Instant,
      /** The lanes the paths assume: the scenario's plan, with today's difference from it. */
      lanes: z.int().min(1),
      /** People arriving in the 5 minutes before. */
      arrivals: ForecastBand,
      /** People not yet admitted. */
      backlog: ForecastBand,
      /** The wait of a party arriving then, from its arrival to its admission. */
      waitMinutes: ForecastBand,
    }),
  ),
});

export type ForecastResponse = z.infer<typeof ForecastResponse>;

/**
 * The fingerprint of results (S19): the SHA-256 of their canonical JSON without the generator and
 * the source revision. The same experiment has the same fingerprint, whichever tool computed it.
 */
export const ResultsFingerprint = z.string().regex(/^[0-9a-f]{64}$/);

/** A scenario saved at an airport for its simulations (S19): kept whole, never changed. */
export const SimulationScenario = z.object({
  id: z.uuid(),
  hash: ScenarioHash,
  /** The scenario's own id and title. */
  scenarioId: z.string(),
  title: z.string(),
  /** What its data are: `SYNTHETIC`, `AIRPORT_PROVIDED`... */
  dataClassification: z.string(),
  createdAt: Instant,
  /** The login of who saved it, or `cli` and `system`. */
  createdBy: z.string(),
});

/**
 * An analyst saves a scenario (S19): a scenario of the simulator, whole (as the Studio exports it,
 * its flight list included), checked as the simulator reads it. The same content is the same
 * scenario.
 */
export const AddSimulationScenarioRequest = z.strictObject({
  scenario: z.record(z.string(), z.unknown()),
});

export const AddSimulationScenarioResponse = z.object({
  scenario: SimulationScenario,
  /** False when the same scenario was saved already. */
  created: z.boolean(),
});

export const SimulationScenariosResponse = z.object({ scenarios: z.array(SimulationScenario) });

/** The states of a simulation (S19). */
export const SimulationState = z.enum(['QUEUED', 'RUNNING', 'DONE', 'FAILED', 'CANCELLED']);

/** Seeds as the CLI takes them, e.g. `1-200` or `1-10,42`. */
const SeedRanges = z
  .string()
  .max(1000)
  .regex(/^\d+(-\d+)?(,\d+(-\d+)?)*$/);

const PolicyId = z.string().min(1).max(100);

/** A paired comparison: what changes when the candidate replaces the reference. */
export const SimulationComparison = z.strictObject({
  candidateId: PolicyId,
  referenceId: PolicyId,
});

/**
 * What to simulate, as on the CLI's command line (S19): a saved scenario, the simulated days
 * (one seed each), the policies (presets, possibly with a lane mode: `fifo-manual@reactive`), the
 * status quo (the first policy by default), the comparisons (the recommended ones by default) and
 * the bootstrap's resamples.
 */
export const SimulationSettings = z.strictObject({
  scenarioHash: ScenarioHash,
  seeds: SeedRanges,
  policies: z.array(PolicyId).min(1).max(8),
  baseline: PolicyId.optional(),
  comparisons: z.array(SimulationComparison).min(1).max(56).optional(),
  bootstrapResamples: z.int().min(100).max(10_000).optional(),
});

/**
 * The manifest of results (S19), as their file has it: everything its experiment was. The server
 * simulates it again on the saved scenario of its hash; the other fields of the manifest describe
 * the results and are not read.
 */
export const SimulationManifest = z.looseObject({
  scenario: z.looseObject({ hash: ScenarioHash }),
  seeds: z.looseObject({ ranges: SeedRanges, count: z.int().min(1).optional() }),
  baselinePolicyId: PolicyId,
  policies: z.array(z.record(z.string(), z.unknown())).min(1).max(8),
  comparisons: z.array(SimulationComparison).max(56),
  classification: z.record(z.string(), z.unknown()),
  statistics: z.looseObject({
    bootstrapResamples: z.int(),
    confidenceLevel: z.number(),
    bootstrapSeed: z.int(),
  }),
});

const SimulationLabel = z.string().trim().min(1).max(100);

/**
 * An analyst asks for a simulation (S19): from settings, or from the manifest of results to
 * compute again. With `expectedFingerprint` (the Studio's results, for one), the run says whether
 * it gave the same results.
 */
export const CreateSimulationRequest = z.union([
  z.strictObject({
    settings: SimulationSettings,
    label: SimulationLabel.optional(),
    expectedFingerprint: ResultsFingerprint.optional(),
  }),
  z.strictObject({
    manifest: SimulationManifest,
    label: SimulationLabel.optional(),
    expectedFingerprint: ResultsFingerprint.optional(),
  }),
]);

/** A simulation (S19): what it simulates, how far it went, and its results once done. */
export const SimulationRun = z.object({
  id: z.uuid(),
  label: z.string().nullable(),
  state: SimulationState,
  scenario: SimulationScenario.pick({
    id: true,
    hash: true,
    scenarioId: true,
    title: true,
    dataClassification: true,
  }),
  seeds: z.object({ count: z.int().min(1), ranges: z.string() }),
  policies: z.array(z.string()),
  baselinePolicyId: z.string(),
  days: z.object({ done: z.int().min(0), total: z.int().min(1) }),
  createdAt: Instant,
  createdBy: z.string(),
  startedAt: Instant.nullable(),
  endedAt: Instant.nullable(),
  error: z.string().nullable(),
  /** Once done: the SHA-256 of the results file, its size and the results' fingerprint. */
  results: z
    .object({
      sha256: z.string().regex(/^[0-9a-f]{64}$/),
      bytes: z.int().min(1),
      fingerprint: ResultsFingerprint,
    })
    .nullable(),
  /**
   * The results it had to give: those of the run it reproduces, or those of the Studio; whether it
   * gave them, once done.
   */
  expected: z
    .object({
      fingerprint: ResultsFingerprint,
      reproduces: z.uuid().nullable(),
      matches: z.boolean().nullable(),
    })
    .nullable(),
});

export const SimulationsResponse = z.object({ runs: z.array(SimulationRun) });

/** A results document of the simulator (`gateflow.sim.results/7`), as its file. */
export const SimulationResults = z.looseObject({ schema: z.string(), disclaimer: z.string() });

export type ScenarioHash = z.infer<typeof ScenarioHash>;
export type SimulationScenario = z.infer<typeof SimulationScenario>;
export type AddSimulationScenarioResponse = z.infer<typeof AddSimulationScenarioResponse>;
export type SimulationScenariosResponse = z.infer<typeof SimulationScenariosResponse>;
export type SimulationState = z.infer<typeof SimulationState>;
export type SimulationSettings = z.infer<typeof SimulationSettings>;
export type SimulationManifest = z.infer<typeof SimulationManifest>;
export type CreateSimulationRequest = z.infer<typeof CreateSimulationRequest>;
export type SimulationRun = z.infer<typeof SimulationRun>;
export type SimulationsResponse = z.infer<typeof SimulationsResponse>;

/** An endpoint of the API, for the OpenAPI document. */
export interface Route {
  readonly method: 'get' | 'post';
  readonly path: string;
  readonly summary: string;
  /** Commands take an `Idempotency-Key`: the same key gives the same answer, applied once. */
  readonly command: boolean;
  /** Only a registered device may call it, with its token (`Authorization: Bearer`). */
  readonly device?: boolean;
  /**
   * Only staff signed in with at least this role, at the checkpoint, may call it (S15). `ANALYST`
   * (S19): analysts and administrators, of the airport; it gives no right on a live checkpoint.
   */
  readonly staff?: z.infer<typeof StaffRole>;
  readonly body?: z.ZodType;
  /**
   * Server-sent events (S16): the answer is a `text/event-stream`, the schema of 200 that of its
   * messages' data; `Last-Event-ID` resumes it.
   */
  readonly stream?: boolean;
  readonly responses: Readonly<
    Record<
      string,
      {
        readonly description: string;
        readonly schema: z.ZodType;
        /** `application/json` unless said (a report: `text/markdown`, `text/html`). */
        readonly contentType?: string;
      }
    >
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

const notDone = {
  '409': { description: 'The simulation is not done', schema: ErrorResponse },
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
    summary:
      "The day's tickets, as staff see them; with `inPlay=true`, those still in play only: not admitted, expired or cancelled (S18)",
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
    path: '/v1/checkpoints/{checkpointId}/audit',
    summary:
      "The audit view (S17): a service day's commands, the latest first, with who, what, when and why; `day`, `number`, `before` and `limit` in the query",
    command: false,
    staff: 'SUPERVISOR',
    responses: {
      '200': { description: 'A page of the log', schema: AuditResponse },
      ...errors,
      ...staffErrors,
    },
  },
  {
    method: 'get',
    path: '/v1/checkpoints/{checkpointId}/policy',
    summary:
      "The checkpoint's policies (S17): today's, the next service day's, the airport's versions and the latest activations",
    command: false,
    staff: 'SUPERVISOR',
    responses: {
      '200': { description: 'The policies', schema: PolicyStatusResponse },
      ...errors,
      ...staffErrors,
    },
  },
  {
    method: 'post',
    path: '/v1/checkpoints/{checkpointId}/policy/versions',
    summary:
      "An administrator publishes a version of a policy for the checkpoint's airport (S17): immutable, named by its hash",
    command: false,
    staff: 'ADMIN',
    body: PublishPolicyRequest,
    responses: {
      '201': { description: 'Published', schema: PublishPolicyResponse },
      '200': {
        description: 'The same content was published already',
        schema: PublishPolicyResponse,
      },
      ...errors,
      ...staffErrors,
    },
  },
  {
    method: 'post',
    path: '/v1/checkpoints/{checkpointId}/policy/activations',
    summary:
      'An administrator activates a version for the checkpoint, from the next service day that has not started (S17)',
    command: false,
    staff: 'ADMIN',
    body: ActivatePolicyRequest,
    responses: {
      '200': { description: 'Activated, from the day said', schema: ActivatePolicyResponse },
      ...errors,
      ...staffErrors,
    },
  },
  {
    method: 'get',
    path: '/v1/checkpoints/{checkpointId}/overview',
    summary:
      "The operations overview of the checkpoint's service day (S20): waiting, waits, at risk, lanes, fairness, data quality, alerts",
    command: false,
    staff: 'SUPERVISOR',
    responses: {
      '200': { description: 'The figures', schema: OverviewResponse },
      ...errors,
      ...staffErrors,
    },
  },
  {
    method: 'get',
    path: '/v1/checkpoints/{checkpointId}/overview/verify',
    summary:
      "Check the overview against the log (S20): the day's commands replayed, every figure and every ticket compared",
    command: false,
    staff: 'SUPERVISOR',
    responses: {
      '200': { description: 'The check', schema: OverviewVerifyResponse },
      ...errors,
      ...staffErrors,
    },
  },
  {
    method: 'get',
    path: '/v1/checkpoints/{checkpointId}/forecast',
    summary:
      'GateFlow Predict, a preview (S21): arrivals, queue and wait over the next 90 minutes, as bands from simulated days (409 NO_SCENARIO when the checkpoint names none)',
    command: false,
    staff: 'SUPERVISOR',
    responses: {
      '200': { description: 'The forecast (SIMULATED)', schema: ForecastResponse },
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
    path: '/v1/twin/options',
    summary:
      "What the digital twin can play at the administrator's airport (S18): the server's scenarios and the airport's policies",
    command: false,
    staff: 'ADMIN',
    responses: {
      '200': { description: 'The options', schema: TwinOptionsResponse },
      ...errors,
      ...staffErrors,
    },
  },
  {
    method: 'get',
    path: '/v1/twin',
    summary:
      "The digital twin of the administrator's airport (S18): its latest run, the board, the latest calls and the counts",
    command: false,
    staff: 'ADMIN',
    responses: {
      '200': { description: 'The twin', schema: TwinResponse },
      ...errors,
      ...staffErrors,
    },
  },
  {
    method: 'post',
    path: '/v1/twin/runs',
    summary:
      'An administrator starts the digital twin (S18): a new twin checkpoint plays the simulated day at its virtual time',
    command: false,
    staff: 'ADMIN',
    body: StartTwinRequest,
    responses: {
      '201': { description: 'Started', schema: TwinRun },
      ...errors,
      ...staffErrors,
      '409': { description: 'A run of the twin is playing already', schema: ErrorResponse },
    },
  },
  {
    method: 'post',
    path: '/v1/twin/runs/{runId}/speed',
    summary: 'Change the speed of a run of the twin while it plays (S18)',
    command: false,
    staff: 'ADMIN',
    body: TwinSpeedRequest,
    responses: {
      '200': { description: 'The run', schema: TwinRun },
      ...errors,
      ...staffErrors,
      '409': { description: 'The run does not play on this server', schema: ErrorResponse },
    },
  },
  {
    method: 'post',
    path: '/v1/twin/runs/{runId}/stop',
    summary: 'Stop a run of the twin (S18): its checkpoint keeps the day as far as it went',
    command: false,
    staff: 'ADMIN',
    responses: {
      '200': { description: 'The run', schema: TwinRun },
      ...errors,
      ...staffErrors,
    },
  },
  {
    method: 'post',
    path: '/v1/twin/runs/{runId}/display',
    summary:
      "A display device for the twin's checkpoint (S18): its token, given once, for the display page",
    command: false,
    staff: 'ADMIN',
    responses: {
      '201': { description: 'The device', schema: TwinDisplayResponse },
      ...errors,
      ...staffErrors,
    },
  },
  {
    method: 'post',
    path: '/v1/simulation-scenarios',
    summary:
      "An analyst saves a scenario for the airport's simulations (S19): kept whole, named by its hash",
    command: false,
    staff: 'ANALYST',
    body: AddSimulationScenarioRequest,
    responses: {
      '201': { description: 'Saved', schema: AddSimulationScenarioResponse },
      '200': { description: 'Saved already', schema: AddSimulationScenarioResponse },
      ...errors,
      ...staffErrors,
    },
  },
  {
    method: 'get',
    path: '/v1/simulation-scenarios',
    summary: "The scenarios saved for the airport's simulations (S19), the latest first",
    command: false,
    staff: 'ANALYST',
    responses: {
      '200': { description: 'The scenarios', schema: SimulationScenariosResponse },
      ...errors,
      ...staffErrors,
    },
  },
  {
    method: 'get',
    path: '/v1/simulation-scenarios/{scenarioId}/file',
    summary:
      'A saved scenario as a file the CLI runs (S19): `gateflow-sim run --scenario <file>.json`',
    command: false,
    staff: 'ANALYST',
    responses: {
      '200': { description: 'The scenario file', schema: z.record(z.string(), z.unknown()) },
      ...errors,
      ...staffErrors,
    },
  },
  {
    method: 'post',
    path: '/v1/simulations',
    summary:
      'An analyst asks for a simulation (S19): from settings, or from the manifest of results to compute again; it waits its turn',
    command: false,
    staff: 'ANALYST',
    body: CreateSimulationRequest,
    responses: {
      '201': { description: 'Waiting its turn', schema: SimulationRun },
      ...errors,
      ...staffErrors,
      '409': {
        description: 'Too many simulations of the airport wait already',
        schema: ErrorResponse,
      },
    },
  },
  {
    method: 'get',
    path: '/v1/simulations',
    summary: "The airport's simulations (S19), the latest first",
    command: false,
    staff: 'ANALYST',
    responses: {
      '200': { description: 'The simulations', schema: SimulationsResponse },
      ...errors,
      ...staffErrors,
    },
  },
  {
    method: 'get',
    path: '/v1/simulations/{runId}',
    summary: 'A simulation (S19): its settings, how far it went, its results once done',
    command: false,
    staff: 'ANALYST',
    responses: {
      '200': { description: 'The simulation', schema: SimulationRun },
      ...errors,
      ...staffErrors,
    },
  },
  {
    method: 'get',
    path: '/v1/simulations/{runId}/results',
    summary:
      'The results of a simulation (S19): the file, as written; SIMULATED RESULTS, not operational evidence',
    command: false,
    staff: 'ANALYST',
    responses: {
      '200': { description: 'The results document', schema: SimulationResults },
      ...errors,
      ...staffErrors,
      ...notDone,
    },
  },
  {
    method: 'get',
    path: '/v1/simulations/{runId}/report',
    summary: 'The report of a simulation, in Markdown (S19), as the CLI writes it',
    command: false,
    staff: 'ANALYST',
    responses: {
      '200': { description: 'The report', schema: z.string(), contentType: 'text/markdown' },
      ...errors,
      ...staffErrors,
      ...notDone,
    },
  },
  {
    method: 'get',
    path: '/v1/simulations/{runId}/report.html',
    summary: 'The report of a simulation, as a web page with its charts (S19)',
    command: false,
    staff: 'ANALYST',
    responses: {
      '200': { description: 'The report', schema: z.string(), contentType: 'text/html' },
      ...errors,
      ...staffErrors,
      ...notDone,
    },
  },
  {
    method: 'post',
    path: '/v1/simulations/{runId}/reproduce',
    summary:
      'Simulate a run again from its manifest (S19): the new run says whether it gave the same results',
    command: false,
    staff: 'ANALYST',
    responses: {
      '201': { description: 'Waiting its turn', schema: SimulationRun },
      ...errors,
      ...staffErrors,
      '409': {
        description: 'The simulation is not done, or too many wait already',
        schema: ErrorResponse,
      },
    },
  },
  {
    method: 'post',
    path: '/v1/simulations/{runId}/cancel',
    summary: 'Cancel a simulation that waits or runs (S19)',
    command: false,
    staff: 'ANALYST',
    responses: {
      '200': { description: 'The simulation', schema: SimulationRun },
      ...errors,
      ...staffErrors,
      '409': { description: 'The simulation has ended already', schema: ErrorResponse },
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
              [r.contentType ??
              (route.stream === true && status === '200'
                ? 'text/event-stream'
                : 'application/json')]: { schema: z.toJSONSchema(r.schema, { io: 'output' }) },
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
            'The session of a member of staff, from `POST /v1/auth/sign-in`: HttpOnly, SameSite=Strict. The role each route needs is in `x-gateflow-role`: OPERATOR, SUPERVISOR and ADMIN at least, at the checkpoint; ANALYST, analysts and administrators of the airport (simulations, S19).',
        },
      },
    },
  };
}
