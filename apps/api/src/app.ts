import { randomUUID } from 'node:crypto';
import { and, asc, eq } from 'drizzle-orm';
import Fastify from 'fastify';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';
import type { z } from 'zod';
import { AdmissionRequest, IssueTicketRequest, openApiDocument } from '@gateflow/contracts';
import type { Ticket } from '@gateflow/contracts';
import { OperationError } from '@gateflow/operations';
import type { Command, CommandResult, TicketSummary } from '@gateflow/operations';
import { requestHash } from './chain';
import type { Db } from './db/client';
import { checkpoint, flight, queueToken } from './db/schema';
import type { Ids } from './ids';
import { randomIds } from './ids';
import { ApiError, Runtime, loadCheckpoint } from './runtime';
import type { BuildContext } from './runtime';
import { serviceDayOf, systemClock } from './time';
import type { Clock } from './time';
import { verifyChain } from './verify';
import { API_VERSION } from './version';

export interface AppOptions {
  readonly db: Db;
  readonly clock?: Clock;
  readonly ids?: Ids;
  /** Log requests (to standard output, or to `stream`). */
  readonly logger?: boolean | { readonly stream: { write(line: string): void } };
}

/**
 * What the log keeps of a request: the method and the route, with no client address and no
 * ticket reference (a passenger's phone and their ticket would be personal data, ADR-042).
 */
export function loggedRequest(request: { method: string; url: string }): {
  method: string;
  url: string;
} {
  return {
    method: request.method,
    url: request.url.replace(/\/v1\/tickets\/[^/?#]+/, '/v1/tickets/:ref'),
  };
}

const iso = (ms: number | null): string | null => (ms === null ? null : new Date(ms).toISOString());

/** A ticket as the contract gives it. */
export function toTicket(t: TicketSummary): Ticket {
  return {
    id: t.ticketId,
    number: t.number,
    state: t.state,
    source: t.source,
    flightId: t.flightId,
    segment: t.segment,
    partySize: t.partySize,
    riskClass: t.riskClass as Ticket['riskClass'],
    priority: t.priority,
    calls: t.calls,
    issuedAt: new Date(t.issuedAtMs).toISOString(),
    firstCalledAt: iso(t.firstCalledAtMs),
    admittedAt: iso(t.admittedAtMs),
  };
}

function parse<T extends z.ZodType>(schema: T, value: unknown): z.output<T> {
  const parsed = schema.safeParse(value ?? {});
  if (!parsed.success) {
    throw new ApiError(
      400,
      'INVALID_REQUEST',
      parsed.error.issues.map((i) => i.message).join('; '),
    );
  }
  return parsed.data;
}

const IDEMPOTENCY_KEY = /^[\x21-\x7e]{1,200}$/;

/** The `Idempotency-Key` of a command, or a new one: then a retry is a new command. */
function idempotencyKeyOf(request: FastifyRequest): string {
  const header = request.headers['idempotency-key'];
  if (header === undefined) return `auto:${randomUUID()}`;
  const key = Array.isArray(header) ? header[0] : header;
  if (key === undefined || !IDEMPOTENCY_KEY.test(key)) {
    throw new ApiError(
      400,
      'INVALID_IDEMPOTENCY_KEY',
      'Idempotency-Key must be 1 to 200 visible characters',
    );
  }
  return key;
}

/** Until staff sign in (S15), every command is recorded as coming from unauthenticated staff. */
const ACTOR = 'staff:unauthenticated';

/** The Fastify application of the API. */
export function buildApp(options: AppOptions): FastifyInstance {
  const clock = options.clock ?? systemClock;
  const ids = options.ids ?? randomIds(clock);
  const runtime = new Runtime(options.db, clock);
  const logger = options.logger ?? false;
  const app = Fastify({
    logger:
      logger === false
        ? false
        : {
            ...(logger === true ? {} : { stream: logger.stream }),
            serializers: {
              req: loggedRequest,
              res: (reply: { statusCode: number }) => ({ statusCode: reply.statusCode }),
            },
          },
  });

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof ApiError) {
      return reply
        .status(error.status)
        .send({ error: { code: error.code, message: error.message } });
    }
    if (error instanceof OperationError) {
      const status =
        error.code === 'UNKNOWN_TICKET' ? 404 : error.code === 'INVALID_COMMAND' ? 400 : 409;
      return reply.status(status).send({ error: { code: error.code, message: error.message } });
    }
    if (error instanceof ZodError) {
      return reply.status(400).send({ error: { code: 'INVALID_REQUEST', message: error.message } });
    }
    const status = (error as { statusCode?: number }).statusCode;
    if (status !== undefined && status >= 400 && status < 500) {
      return reply
        .status(status)
        .send({ error: { code: 'INVALID_REQUEST', message: (error as Error).message } });
    }
    app.log.error(error);
    return reply.status(500).send({ error: { code: 'INTERNAL', message: 'internal error' } });
  });

  /** Runs a command of a checkpoint and answers with its result. */
  const command = async (
    request: FastifyRequest<{ Params: { checkpointId: string } }>,
    reply: FastifyReply,
    body: unknown,
    build: (context: BuildContext) => Promise<Command> | Command,
    answer: (result: CommandResult) => { status: number; body: unknown },
  ) => {
    const executed = await runtime.execute({
      checkpointId: request.params.checkpointId,
      idempotencyKey: idempotencyKeyOf(request),
      requestHash: requestHash(`${request.method} ${request.routeOptions.url ?? ''}`, body),
      actor: ACTOR,
      build,
    });
    const { status, body: payload } = answer(executed.result);
    if (executed.replayed) void reply.header('Idempotent-Replayed', 'true');
    return reply.status(status).send(payload);
  };

  app.get('/v1/health', () => ({ status: 'ok', version: API_VERSION }));

  app.get('/v1/openapi.json', () => openApiDocument(API_VERSION));

  app.post<{ Params: { checkpointId: string } }>(
    '/v1/checkpoints/:checkpointId/tickets',
    async (request, reply) => {
      const body = parse(IssueTicketRequest, request.body);
      return command(
        request,
        reply,
        body,
        async ({ tx, checkpoint: cp }) => {
          const rows = await tx.select().from(flight).where(eq(flight.id, body.flightId));
          const f = rows[0];
          if (f?.airportId !== cp.airportId) {
            throw new ApiError(404, 'UNKNOWN_FLIGHT', 'no such flight at this airport');
          }
          return {
            type: 'ISSUE_TICKET',
            ticketId: ids.uuid(),
            opaqueRef: ids.opaqueRef(),
            source: 'STAFF',
            flightId: f.id,
            segment: body.segment,
            partySize: body.partySize,
            deadline:
              f.boardingCloseMs === null || f.deadlineSource === 'NONE'
                ? { atMs: null, source: 'NONE' }
                : {
                    atMs: f.boardingCloseMs,
                    source: f.deadlineSource === 'RULE' ? 'RULE' : 'FEED',
                    ...(f.observedAtMs === null ? {} : { observedAtMs: f.observedAtMs }),
                  },
            walkEstimateMs: f.walkEstimateMs,
            scheduledDepartureMs: f.stdMs,
          };
        },
        (result) => {
          if (result.type !== 'TICKET_ISSUED') throw new Error(`unexpected result ${result.type}`);
          return { status: 201, body: { ticket: toTicket(result.ticket), ref: result.opaqueRef } };
        },
      );
    },
  );

  app.post<{ Params: { checkpointId: string } }>(
    '/v1/checkpoints/:checkpointId/calls',
    async (request, reply) =>
      command(
        request,
        reply,
        null,
        () => ({ type: 'CALL_NEXT' }),
        (result) => {
          if (result.type !== 'CALLED') throw new Error(`unexpected result ${result.type}`);
          return {
            status: 200,
            body: { called: result.ticket === null ? null : toTicket(result.ticket) },
          };
        },
      ),
  );

  app.post<{ Params: { checkpointId: string } }>(
    '/v1/checkpoints/:checkpointId/admissions',
    async (request, reply) => {
      const body = parse(AdmissionRequest, request.body);
      return command(
        request,
        reply,
        body,
        ({ day }) => {
          const ticket =
            'number' in body ? day.ticketByNumber(body.number) : day.ticketByRef(body.ref);
          if (ticket === undefined) {
            throw new ApiError(404, 'UNKNOWN_TICKET', 'no such ticket today at this checkpoint');
          }
          return {
            type: 'PRESENT',
            ticketId: ticket.ticketId,
            method: 'number' in body ? 'NUMBER' : 'REF',
          };
        },
        (result) => {
          if (result.type !== 'PRESENTED') throw new Error(`unexpected result ${result.type}`);
          return {
            status: 200,
            body: { outcome: result.outcome, ticket: toTicket(result.ticket) },
          };
        },
      );
    },
  );

  app.get<{ Params: { checkpointId: string } }>(
    '/v1/checkpoints/:checkpointId/queue',
    async (request) => {
      const cp = await loadCheckpoint(options.db, request.params.checkpointId);
      const serviceDay = serviceDayOf(clock.now(), cp.timeZone, cp.dayStartsAt);
      const rows = await options.db
        .select()
        .from(queueToken)
        .where(and(eq(queueToken.checkpointId, cp.id), eq(queueToken.serviceDay, serviceDay)))
        .orderBy(asc(queueToken.issuedAtMs), asc(queueToken.number));
      return {
        checkpointId: cp.id,
        serviceDay,
        tickets: rows.map((r) =>
          toTicket({
            ticketId: r.id,
            number: r.number,
            state: r.state as TicketSummary['state'],
            source: r.source as TicketSummary['source'],
            flightId: r.flightId,
            segment: r.segment as TicketSummary['segment'],
            partySize: r.partySize,
            riskClass: r.riskClass,
            priority: r.priority,
            calls: r.calls,
            issuedAtMs: r.issuedAtMs,
            firstCalledAtMs: r.firstCalledAtMs,
            admittedAtMs: r.admittedAtMs,
          }),
        ),
      };
    },
  );

  app.get<{ Params: { checkpointId: string } }>(
    '/v1/checkpoints/:checkpointId/audit/verify',
    async (request) => {
      const cp = await loadCheckpoint(options.db, request.params.checkpointId);
      return { checkpointId: cp.id, ...(await verifyChain(options.db, cp.id)) };
    },
  );

  app.get<{ Params: { ref: string } }>('/v1/tickets/:ref', async (request) => {
    const rows = await options.db
      .select({
        number: queueToken.number,
        state: queueToken.state,
        serviceDay: queueToken.serviceDay,
        checkpoint: checkpoint.name,
      })
      .from(queueToken)
      .innerJoin(checkpoint, eq(checkpoint.id, queueToken.checkpointId))
      .where(eq(queueToken.opaqueRef, request.params.ref));
    const row = rows[0];
    if (row === undefined) throw new ApiError(404, 'UNKNOWN_TICKET', 'no such ticket');
    return row;
  });

  return app;
}
