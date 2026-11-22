import { z } from 'zod';

/*
 * The contracts of the GateFlow API (ADR-042): what each endpoint takes and gives, shared by the
 * server and its clients. Times are ISO 8601 instants in UTC. No schema carries personal data: a
 * ticket is a number, a state and a flight, never a name.
 */

export const CONTRACTS_VERSION = '0.4.0';

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
export const ScanRequest = z.strictObject({ bcbp: z.string().min(1).max(1100) });

export const ScanOutcome = z.enum([
  'ISSUED',
  'RETRIEVED',
  /** A no-show scanned again within its window: back in the queue (S15). */
  'REACTIVATED',
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
  tickets: z.array(Ticket),
});

/** What a passenger sees on the page of their ticket: no personal data. */
export const PublicTicketResponse = z.object({
  number: z.string(),
  state: TicketState,
  checkpoint: z.string(),
  serviceDay: z.iso.date(),
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

/** The types of the answers, for clients that do not validate them (the web application). */
export type TicketState = z.infer<typeof TicketState>;
export type ScanOutcome = z.infer<typeof ScanOutcome>;
export type ScanReason = z.infer<typeof ScanReason>;
export type ScanResponse = z.infer<typeof ScanResponse>;
export type PublicTicketResponse = z.infer<typeof PublicTicketResponse>;
export type DeviceKind = z.infer<typeof DeviceKind>;
export type DeviceResponse = z.infer<typeof DeviceResponse>;
export type DemoFlightsResponse = z.infer<typeof DemoFlightsResponse>;
export type ManualReason = z.infer<typeof ManualReason>;
export type StaffActionResponse = z.infer<typeof StaffActionResponse>;
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
  readonly body?: z.ZodType;
  readonly responses: Readonly<
    Record<string, { readonly description: string; readonly schema: z.ZodType }>
  >;
}

const errors = {
  '400': { description: 'The request is invalid', schema: ErrorResponse },
  '404': { description: 'Not found', schema: ErrorResponse },
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
    summary: 'Issue a ticket for a passenger of a flight',
    command: true,
    body: IssueTicketRequest,
    responses: {
      '201': { description: 'Issued', schema: IssueTicketResponse },
      ...errors,
      '409': { description: 'Idempotency key reused for another request', schema: ErrorResponse },
    },
  },
  {
    method: 'post',
    path: '/v1/checkpoints/{checkpointId}/scans',
    summary: 'A kiosk scans a boarding pass: a ticket, the same ticket again, or a reason',
    command: true,
    device: true,
    body: ScanRequest,
    responses: {
      '201': { description: 'A ticket was issued', schema: ScanResponse },
      '200': { description: 'The ticket found again, or why there is none', schema: ScanResponse },
      ...errors,
      ...deviceErrors,
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
    path: '/v1/checkpoints/{checkpointId}/demo-flights',
    summary: "Today's demo flights, for a kiosk's sample boarding passes",
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
    responses: {
      '200': { description: 'Called, or nobody waiting', schema: CallNextResponse },
      ...errors,
      '409': { description: 'Idempotency key reused for another request', schema: ErrorResponse },
    },
  },
  {
    method: 'post',
    path: '/v1/checkpoints/{checkpointId}/admissions',
    summary: 'A passenger presents their ticket at the access point',
    command: true,
    body: AdmissionRequest,
    responses: {
      '200': { description: 'The outcome of the presentation', schema: AdmissionResponse },
      ...errors,
      '409': { description: 'Idempotency key reused for another request', schema: ErrorResponse },
    },
  },
  ...(
    [
      ['recall', 'Call a called passenger again, now: the no-show timeout counts from this call'],
      ['no-show', 'Mark a called passenger as absent, now'],
      ['reactivate', 'Bring a no-show back to the queue, within its window'],
      ['review', 'Hold a waiting ticket for a review: it keeps its place'],
      ['cancel', 'Cancel a ticket'],
    ] as const
  ).map(([action, summary]): Route => ({
    method: 'post',
    path: `/v1/checkpoints/{checkpointId}/tickets/{ticketId}/${action}`,
    summary,
    command: true,
    responses: {
      '200': { description: 'Done, or not allowed in its state', schema: StaffActionResponse },
      ...errors,
      '409': { description: 'Idempotency key reused for another request', schema: ErrorResponse },
    },
  })),
  {
    method: 'post',
    path: '/v1/checkpoints/{checkpointId}/tickets/{ticketId}/resolve',
    summary: 'End the review of a ticket: back to its place in the queue, or cancelled',
    command: true,
    body: ResolveReviewRequest,
    responses: {
      '200': { description: 'Done, or not allowed in its state', schema: StaffActionResponse },
      ...errors,
      '409': { description: 'Idempotency key reused for another request', schema: ErrorResponse },
    },
  },
  {
    method: 'get',
    path: '/v1/checkpoints/{checkpointId}/queue',
    summary: "The day's tickets, as staff see them",
    command: false,
    responses: { '200': { description: 'The queue', schema: QueueResponse }, ...errors },
  },
  {
    method: 'get',
    path: '/v1/checkpoints/{checkpointId}/audit/verify',
    summary: "Check the chain of hashes of the checkpoint's log",
    command: false,
    responses: { '200': { description: 'The check', schema: AuditVerifyResponse }, ...errors },
  },
  {
    method: 'get',
    path: '/v1/tickets/{ref}',
    summary: "The passenger's view of a ticket",
    command: false,
    responses: { '200': { description: 'The ticket', schema: PublicTicketResponse }, ...errors },
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
    const operation: Record<string, unknown> = {
      summary: route.summary,
      parameters,
      responses: Object.fromEntries(
        Object.entries(route.responses).map(([status, r]) => [
          status,
          {
            description: r.description,
            content: { 'application/json': { schema: z.toJSONSchema(r.schema, { io: 'output' }) } },
          },
        ]),
      ),
    };
    if (route.device === true) operation.security = [{ device: [] }];
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
      },
    },
  };
}
