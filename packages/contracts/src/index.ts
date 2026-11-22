import { z } from 'zod';

/*
 * The contracts of the GateFlow API (ADR-042): what each endpoint takes and gives, shared by the
 * server and its clients. Times are ISO 8601 instants in UTC. No schema carries personal data: a
 * ticket is a number, a state and a flight, never a name.
 */

export const CONTRACTS_VERSION = '0.2.0';

export const Segment = z.enum(['DEPARTING', 'TRANSFER']);

export const TicketState = z.enum([
  'QUEUED',
  'PREPARE',
  'CALLED',
  'RECALLED',
  'NO_SHOW',
  'ADMITTED',
  'EXPIRED',
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
  admittedAt: Instant.nullable(),
});
export type Ticket = z.infer<typeof Ticket>;

/**
 * A kiosk scans a boarding pass (IATA BCBP). The pass is read in memory and never stored or logged
 * (ADR-043).
 */
export const ScanRequest = z.strictObject({ bcbp: z.string().min(1).max(1100) });

export const ScanOutcome = z.enum(['ISSUED', 'RETRIEVED', 'REJECTED', 'NEEDS_ASSISTANCE']);

/** Why a scan gave no ticket, or sent the passenger to staff. */
export const ScanReason = z.enum([
  'UNREADABLE',
  'WRONG_AIRPORT',
  'WRONG_DAY',
  'UNKNOWN_FLIGHT',
  'ALREADY_ADMITTED',
]);

/** Staff issue a ticket for a passenger of a flight. */
export const IssueTicketRequest = z.strictObject({
  flightId: z.uuid(),
  segment: Segment,
  partySize: z.int().min(1).max(20).default(1),
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

/** A ticket presented at the access point, by its number or by the reference of its QR code. */
export const AdmissionRequest = z.union([
  z.strictObject({ number: z.string().min(1).max(10) }),
  z.strictObject({ ref: z.string().min(16).max(64) }),
]);

export const PresentOutcome = z.enum([
  'ADMITTED',
  'REACTIVATED',
  'EXPIRED',
  'NOT_CALLED',
  'ALREADY_ADMITTED',
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

export const ErrorResponse = z.object({
  error: z.object({ code: z.string(), message: z.string() }),
});

/** An endpoint of the API, for the OpenAPI document. */
export interface Route {
  readonly method: 'get' | 'post';
  readonly path: string;
  readonly summary: string;
  /** Commands take an `Idempotency-Key`: the same key gives the same answer, applied once. */
  readonly command: boolean;
  readonly body?: z.ZodType;
  readonly responses: Readonly<
    Record<string, { readonly description: string; readonly schema: z.ZodType }>
  >;
}

const errors = {
  '400': { description: 'The request is invalid', schema: ErrorResponse },
  '404': { description: 'Not found', schema: ErrorResponse },
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
    body: ScanRequest,
    responses: {
      '201': { description: 'A ticket was issued', schema: ScanResponse },
      '200': { description: 'The ticket found again, or why there is none', schema: ScanResponse },
      ...errors,
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
  };
}
