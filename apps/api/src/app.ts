import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import fastifyCookie from '@fastify/cookie';
import fastifyStatic from '@fastify/static';
import { and, asc, eq, gte, lte } from 'drizzle-orm';
import Fastify from 'fastify';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';
import type { z } from 'zod';
import {
  AdmissionRequest,
  IssueTicketRequest,
  ResolveReviewRequest,
  ScanRequest,
  SignInRequest,
  openApiDocument,
} from '@gateflow/contracts';
import type { StaffActionResponse, StaffMemberResponse, Ticket } from '@gateflow/contracts';
import { OperationError } from '@gateflow/operations';
import type { Command, CommandResult, TicketSummary } from '@gateflow/operations';
import { requestHash } from './chain';
import { readPass, recordScan, ticketOfPass } from './intake';
import { TimerScheduler } from './scheduler';
import {
  SignInGuard,
  clearSessionCookie,
  requireSameOrigin,
  requireStaff,
  setSessionCookie,
  signIn,
  signOut,
  staffOf,
} from './staff';
import type { StaffMember, StaffRole } from './staff';
import type { ScanOutcome, ScanReason } from './intake';
import type { Db } from './db/client';
import { airport, checkpoint, flight, queueToken } from './db/schema';
import { deviceOf, requireDevice } from './devices';
import type { Ids } from './ids';
import { randomIds } from './ids';
import { ApiError, Runtime, loadCheckpoint } from './runtime';
import type { BuildContext } from './runtime';
import { localDate, serviceDayOf, systemClock } from './time';
import type { Clock } from './time';
import { verifyChain } from './verify';
import { API_VERSION } from './version';

export interface AppOptions {
  readonly db: Db;
  readonly clock?: Clock;
  readonly ids?: Ids;
  /** Log requests (to standard output, or to `stream`). */
  readonly logger?: boolean | { readonly stream: { write(line: string): void } };
  /** The built web application (kiosk, ticket page...), served at `/` when given. */
  readonly webRoot?: string;
  /**
   * The timers of the queue (S15): `auto` applies them every second while the server listens;
   * `manual` (the default, for tests) leaves it to `app.timers.tick()`.
   */
  readonly timers?: 'auto' | 'manual';
}

declare module 'fastify' {
  interface FastifyInstance {
    /** The scheduler of the queue's timeouts (S15). */
    readonly timers: TimerScheduler;
  }
}

/**
 * The Content Security Policy of the web application: its own scripts and styles only, no third
 * party, no framing. With `Referrer-Policy: no-referrer`, the reference in a ticket's address
 * never leaves the page.
 */
export const WEB_CSP =
  "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; " +
  "font-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'";

/**
 * What the log keeps of a request: the method and the route, with no client address and no
 * ticket reference, neither the API's nor that of the passenger's page (a passenger's phone and
 * their ticket would be personal data, ADR-042).
 */
export function loggedRequest(request: { method: string; url: string }): {
  method: string;
  url: string;
} {
  return {
    method: request.method,
    url: request.url
      .replace(/\/v1\/tickets\/[^/?#]+/, '/v1/tickets/:ref')
      .replace(/^\/t\/[^/?#]+/, '/t/:ref'),
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
    lastCalledAt: iso(t.lastCalledAtMs),
    admittedAt: iso(t.admittedAtMs),
  };
}

/**
 * What a kiosk says when a pass's ticket of the day exists (S13, S15): the same ticket again; a
 * no-show brought back; or staff, for a ticket admitted, under review or cancelled.
 */
function scanAnswerFor(state: TicketSummary['state']): {
  readonly outcome: ScanOutcome;
  readonly reason: ScanReason | null;
  /** Whether the kiosk gets the ticket and its reference, to show and print it. */
  readonly withTicket: boolean;
} {
  switch (state) {
    case 'QUEUED':
    case 'PREPARE':
    case 'CALLED':
    case 'RECALLED':
      return { outcome: 'RETRIEVED', reason: null, withTicket: true };
    case 'NO_SHOW':
      return { outcome: 'REACTIVATED', reason: null, withTicket: true };
    case 'ADMITTED':
      return { outcome: 'NEEDS_ASSISTANCE', reason: 'ALREADY_ADMITTED', withTicket: true };
    case 'REVIEW':
      return { outcome: 'NEEDS_ASSISTANCE', reason: 'UNDER_REVIEW', withTicket: false };
    case 'CANCELLED':
      return { outcome: 'NEEDS_ASSISTANCE', reason: 'CANCELLED', withTicket: false };
    case 'EXPIRED':
      throw new Error('an expired ticket gives way to a new one');
  }
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
  void app.register(fastifyCookie);
  const timers = new TimerScheduler(options.db, runtime, clock);
  app.decorate('timers', timers);
  if (options.timers === 'auto') {
    app.addHook('onReady', () => {
      timers.start((error) => {
        app.log.error(error);
      });
    });
  }
  app.addHook('onClose', async () => {
    await timers.stop();
  });

  /**
   * The member of staff a request of a checkpoint needs, checked before anything else of the
   * request is read (S15).
   */
  const staffFor = async (
    request: FastifyRequest<{ Params: { checkpointId: string } }>,
    role: StaffRole,
  ): Promise<StaffMember> =>
    (await requireStaff(options.db, clock, request, role, request.params.checkpointId)).member;

  /** Runs a staff command of a checkpoint and answers with its result; the log says who acted. */
  const command = async (
    request: FastifyRequest<{ Params: { checkpointId: string } }>,
    reply: FastifyReply,
    member: StaffMember,
    body: unknown,
    build: (context: BuildContext) => Promise<Command> | Command,
    answer: (result: CommandResult) => { status: number; body: unknown },
  ) => {
    const executed = await runtime.execute({
      checkpointId: request.params.checkpointId,
      idempotencyKey: idempotencyKeyOf(request),
      requestHash: requestHash(`${request.method} ${request.routeOptions.url ?? ''}`, body),
      actor: `staff:${member.id}`,
      build,
    });
    if (executed.result === null) throw new Error('the command applied nothing');
    const { status, body: payload } = answer(executed.result);
    if (executed.replayed) void reply.header('Idempotent-Replayed', 'true');
    return reply.status(status).send(payload);
  };

  app.addHook('onSend', (_request, reply, payload, done) => {
    void reply.header('X-Content-Type-Options', 'nosniff');
    void reply.header('Referrer-Policy', 'no-referrer');
    const type = reply.getHeader('content-type');
    if (typeof type === 'string' && type.startsWith('text/html')) {
      void reply.header('Content-Security-Policy', WEB_CSP);
      // A ticket's address is its key: no search engine may keep one.
      void reply.header('X-Robots-Tag', 'noindex, nofollow');
    }
    done(null, payload);
  });

  const web = options.webRoot !== undefined && existsSync(options.webRoot);
  if (web) {
    void app.register(fastifyStatic, {
      root: options.webRoot,
      index: 'index.html',
      wildcard: false,
      // The build writes Brotli and gzip copies: phones on an airport's network get a third.
      preCompressed: true,
    });
  }
  // The web application routes its own pages (/kiosk/..., /t/...): every address that is not the
  // API's or a file's is one of its pages. Fastify's own handler would log a missing address
  // whole, with the reference of a ticket in it.
  app.setNotFoundHandler((request, reply) => {
    const path = request.url.split('?')[0] ?? '';
    if (
      web &&
      request.method === 'GET' &&
      !path.startsWith('/v1/') &&
      !path.startsWith('/assets/')
    ) {
      return reply.header('Cache-Control', 'no-cache').type('text/html').sendFile('index.html');
    }
    return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'no such route' } });
  });

  app.get('/v1/health', () => ({ status: 'ok', version: API_VERSION }));

  /** Staff sign in (S15): the session goes in an HttpOnly cookie, never in a page's reach. */
  const guard = new SignInGuard(clock);
  const memberView = (m: StaffMember): StaffMemberResponse => ({
    member: {
      id: m.id,
      login: m.login,
      role: m.role,
      checkpoints: m.checkpointIds?.slice() ?? null,
    },
  });
  app.post('/v1/auth/sign-in', async (request, reply) => {
    requireSameOrigin(request);
    const body = parse(SignInRequest, request.body);
    if (guard.blocked(body.login)) {
      throw new ApiError(429, 'TOO_MANY_ATTEMPTS', 'too many failed sign-ins: try again later');
    }
    const signed = await signIn(options.db, clock, body.login, body.password);
    if (signed === null) {
      guard.failed(body.login);
      throw new ApiError(401, 'INVALID_CREDENTIALS', 'the login or the password is not right');
    }
    guard.succeeded(body.login);
    const forwarded = request.headers['x-forwarded-proto'];
    setSessionCookie(reply, signed.token, request.protocol === 'https' || forwarded === 'https');
    return memberView(signed.member);
  });
  app.get('/v1/auth/me', async (request) => {
    const member = await staffOf(options.db, clock, request);
    if (member === null) throw new ApiError(401, 'SIGN_IN_REQUIRED', 'sign in as staff first');
    return memberView(member);
  });
  app.post('/v1/auth/sign-out', async (request, reply) => {
    requireSameOrigin(request);
    await signOut(options.db, request);
    clearSessionCookie(reply);
    return reply.status(204).send();
  });

  /** The device's own view: what a kiosk needs to show where it is. */
  app.get('/v1/devices/me', async (request) => {
    const d = await deviceOf(options.db, request);
    const cp = await loadCheckpoint(options.db, d.checkpointId);
    const rows = await options.db.select().from(airport).where(eq(airport.id, cp.airportId));
    const a = rows[0];
    return {
      device: { id: d.id, kind: d.kind, label: d.name },
      checkpoint: { id: cp.id, label: cp.name },
      airport: {
        label: a?.name ?? '',
        iata: cp.iata,
        timeZone: cp.timeZone,
        synthetic: a?.dataClassification === 'SYNTHETIC',
      },
    };
  });

  /**
   * The demo flights leaving a kiosk's airport in the next 24 hours, for its sample boarding passes
   * at any hour. Only flights marked DEMO are listed: live flight data never goes to a kiosk.
   */
  app.get<{ Params: { checkpointId: string } }>(
    '/v1/checkpoints/:checkpointId/demo-flights',
    async (request) => {
      await requireDevice(options.db, request, request.params.checkpointId, 'KIOSK');
      const cp = await loadCheckpoint(options.db, request.params.checkpointId);
      const now = clock.now();
      const two = (n: number) => String(n).padStart(2, '0');
      const today = localDate(now, cp.timeZone);
      const rows = await options.db
        .select()
        .from(flight)
        .where(
          and(
            eq(flight.airportId, cp.airportId),
            eq(flight.environment, 'DEMO'),
            gte(flight.stdMs, now),
            lte(flight.stdMs, now + 24 * 60 * 60 * 1000),
          ),
        )
        .orderBy(asc(flight.stdMs));
      return {
        date: `${String(today.year)}-${two(today.month)}-${two(today.day)}`,
        flights: rows.flatMap((f) =>
          f.carrier === null || f.flightNumber === null || f.departureDate === null
            ? []
            : [
                {
                  carrier: f.carrier,
                  flightNumber: f.flightNumber,
                  departure: new Date(f.stdMs).toISOString(),
                  date: f.departureDate,
                },
              ],
        ),
      };
    },
  );

  app.get('/v1/openapi.json', () => openApiDocument(API_VERSION));

  app.post<{ Params: { checkpointId: string } }>(
    '/v1/checkpoints/:checkpointId/tickets',
    async (request, reply) => {
      const member = await staffFor(request, 'OPERATOR');
      const body = parse(IssueTicketRequest, request.body);
      return command(
        request,
        reply,
        member,
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
            dedupKey: null,
            reason: body.reason,
          };
        },
        (result) => {
          if (result.type !== 'TICKET_ISSUED') throw new Error(`unexpected result ${result.type}`);
          return { status: 201, body: { ticket: toTicket(result.ticket), ref: result.opaqueRef } };
        },
      );
    },
  );

  /** A ticket's current-state row. */
  const tokenRow = async (ticketId: string) => {
    const rows = await options.db.select().from(queueToken).where(eq(queueToken.id, ticketId));
    const row = rows[0];
    if (row === undefined) throw new Error(`the ticket ${ticketId} is gone`);
    return row;
  };

  /** A ticket as staff see it, from its current-state row. */
  const ticketOfRow = (r: typeof queueToken.$inferSelect): Ticket =>
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
      lastCalledAtMs: r.lastCalledAtMs,
      admittedAtMs: r.admittedAtMs,
    });

  app.post<{ Params: { checkpointId: string } }>(
    '/v1/checkpoints/:checkpointId/scans',
    async (request, reply) => {
      const kiosk = await requireDevice(options.db, request, request.params.checkpointId, 'KIOSK');
      const body = parse(ScanRequest, request.body);
      const cp = await loadCheckpoint(options.db, request.params.checkpointId);
      const intake = await readPass(options.db, cp, body.bcbp, clock.now());
      if (!intake.ok) {
        await recordScan(options.db, {
          id: ids.uuid(),
          checkpointId: cp.id,
          atMs: clock.now(),
          outcome: intake.outcome,
          reason: intake.reason,
          ticketId: null,
          pass: intake.pass,
        });
        return reply
          .status(200)
          .send({ outcome: intake.outcome, reason: intake.reason, ticket: null, ref: null });
      }
      // Under the checkpoint's lock: the same pass at two kiosks at once still gives one ticket.
      const scanOnce = async (key: string): Promise<{ status: number; body: unknown } | null> => {
        const found: {
          value?: {
            outcome: ScanOutcome;
            reason: ScanReason | null;
            ticketId: string | null;
            ref: string | null;
          };
        } = {};
        const executed = await runtime.execute({
          checkpointId: cp.id,
          idempotencyKey: key,
          requestHash: requestHash('POST /v1/checkpoints/:checkpointId/scans', {
            pass: intake.dedupKey,
          }),
          actor: `kiosk:${kiosk.id}`,
          build: async ({ tx, day, atMs }) => {
            const scanned = (
              outcome: ScanOutcome,
              reason: ScanReason | null,
              ticketId: string | null,
            ) =>
              recordScan(tx, {
                id: ids.uuid(),
                checkpointId: cp.id,
                atMs,
                outcome,
                reason,
                ticketId,
                pass: intake.pass,
              });
            const existing = await ticketOfPass(tx, cp.id, intake.dedupKey);
            const current = existing === undefined ? undefined : day.ticket(existing.id);
            if (existing !== undefined && current !== undefined && current.state !== 'EXPIRED') {
              // The pass's ticket: found again, brought back from a no-show (S15), or for staff.
              const answer = scanAnswerFor(current.state);
              found.value = {
                ...answer,
                ticketId: answer.withTicket ? existing.id : null,
                ref: answer.withTicket ? existing.opaqueRef : null,
              };
              await scanned(answer.outcome, answer.reason, existing.id);
              return answer.outcome === 'REACTIVATED'
                ? { type: 'REACTIVATE', ticketId: existing.id }
                : null;
            }
            const f = intake.flight;
            const closed = f.boardingCloseMs !== null && atMs > f.boardingCloseMs;
            if (closed && (cp.settings.afterBoardingClose ?? 'ASSIST') === 'ASSIST') {
              // Boarding has closed, as GateFlow knows it: staff decide, not the queue (S15).
              found.value = {
                outcome: 'NEEDS_ASSISTANCE',
                reason: 'BOARDING_CLOSED',
                ticketId: null,
                ref: null,
              };
              await scanned('NEEDS_ASSISTANCE', 'BOARDING_CLOSED', null);
              return null;
            }
            const ticketId = ids.uuid();
            await scanned('ISSUED', null, ticketId);
            return {
              type: 'ISSUE_TICKET',
              ticketId,
              opaqueRef: ids.opaqueRef(),
              source: 'KIOSK',
              flightId: f.id,
              segment: intake.segment,
              partySize: 1,
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
              dedupKey: intake.dedupKey,
            };
          },
        });
        const result = executed.result;
        if (result?.type === 'TICKET_ISSUED') {
          return {
            status: 201,
            body: {
              outcome: 'ISSUED',
              reason: null,
              ticket: toTicket(result.ticket),
              ref: result.opaqueRef,
            },
          };
        }
        if (result?.type === 'ACTED') {
          // The no-show's window closed before this scan: it is expired now, try again.
          if (result.outcome !== 'DONE') return null;
          const row = await tokenRow(result.ticket.ticketId);
          return {
            status: 200,
            body: {
              outcome: 'REACTIVATED',
              reason: null,
              ticket: toTicket(result.ticket),
              ref: row.opaqueRef,
            },
          };
        }
        const answer = found.value;
        if (answer === undefined) throw new Error('the scan found no ticket and issued none');
        if (answer.ticketId === null) {
          return {
            status: 200,
            body: { outcome: answer.outcome, reason: answer.reason, ticket: null, ref: null },
          };
        }
        const row = await tokenRow(answer.ticketId);
        return {
          status: 200,
          body: {
            outcome: answer.outcome,
            reason: answer.reason,
            ticket: ticketOfRow(row),
            ref: answer.ref,
          },
        };
      };
      const key = idempotencyKeyOf(request);
      // A rescan reads the ticket's state: the timeouts due by now come first (S15).
      await timers.advanceIfDue(cp.id);
      const answer = (await scanOnce(key)) ?? (await scanOnce(`${key}:expired`));
      if (answer === null) throw new Error('a no-show could not be brought back nor replaced');
      return reply.status(answer.status).send(answer.body);
    },
  );

  app.post<{ Params: { checkpointId: string } }>(
    '/v1/checkpoints/:checkpointId/calls',
    async (request, reply) =>
      command(
        request,
        reply,
        await staffFor(request, 'OPERATOR'),
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
      const member = await staffFor(request, 'OPERATOR');
      const body = parse(AdmissionRequest, request.body);
      const unknown = () =>
        new ApiError(404, 'UNKNOWN_TICKET', 'no such ticket today at this checkpoint');
      // A boarding pass is read in memory: only its deduplication key is used, and hashed (S15).
      let passKey: string | null = null;
      if ('bcbp' in body) {
        const cp = await loadCheckpoint(options.db, request.params.checkpointId);
        const intake = await readPass(options.db, cp, body.bcbp, clock.now());
        if (!intake.ok) throw unknown();
        passKey = intake.dedupKey;
      }
      return command(
        request,
        reply,
        member,
        passKey === null ? body : { pass: passKey },
        async ({ tx, day, checkpoint: cp }) => {
          let ticketId: string | undefined;
          if (passKey !== null) ticketId = (await ticketOfPass(tx, cp.id, passKey))?.id;
          else if ('number' in body) ticketId = day.ticketByNumber(body.number)?.ticketId;
          else if ('ref' in body) ticketId = day.ticketByRef(body.ref)?.ticketId;
          if (ticketId === undefined || day.ticket(ticketId) === undefined) throw unknown();
          return {
            type: 'PRESENT',
            ticketId,
            method: passKey !== null ? 'PASS' : 'number' in body ? 'NUMBER' : 'REF',
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

  /** The answer to a staff action (S15). */
  const acted = (result: CommandResult): { status: number; body: StaffActionResponse } => {
    if (result.type !== 'ACTED') throw new Error(`unexpected result ${result.type}`);
    return {
      status: 200,
      body: {
        action: result.action,
        outcome: result.outcome === 'DONE' ? 'DONE' : 'NOT_ALLOWED',
        ticket: toTicket(result.ticket),
      },
    };
  };
  const unknownTicket = () =>
    new ApiError(404, 'UNKNOWN_TICKET', 'no such ticket today at this checkpoint');

  const STAFF_ROUTES = [
    ['recall', 'RECALL', 'OPERATOR'],
    ['no-show', 'MARK_NO_SHOW', 'OPERATOR'],
    ['reactivate', 'REACTIVATE', 'OPERATOR'],
    ['review', 'HOLD', 'OPERATOR'],
    ['cancel', 'CANCEL', 'SUPERVISOR'],
  ] as const;
  for (const [path, action, role] of STAFF_ROUTES) {
    app.post<{ Params: { checkpointId: string; ticketId: string } }>(
      `/v1/checkpoints/:checkpointId/tickets/:ticketId/${path}`,
      async (request, reply) => {
        const member = await staffFor(request, role);
        const { ticketId } = request.params;
        return command(
          request,
          reply,
          member,
          { action, ticketId },
          ({ day }) => {
            if (day.ticket(ticketId) === undefined) throw unknownTicket();
            return { type: action, ticketId };
          },
          acted,
        );
      },
    );
  }

  app.post<{ Params: { checkpointId: string; ticketId: string } }>(
    '/v1/checkpoints/:checkpointId/tickets/:ticketId/resolve',
    async (request, reply) => {
      const member = await staffFor(request, 'SUPERVISOR');
      const { ticketId } = request.params;
      const body = parse(ResolveReviewRequest, request.body);
      return command(
        request,
        reply,
        member,
        { ...body, ticketId },
        ({ day }) => {
          if (day.ticket(ticketId) === undefined) throw unknownTicket();
          return { type: 'RESOLVE_REVIEW', ticketId, decision: body.decision };
        },
        acted,
      );
    },
  );

  app.get<{ Params: { checkpointId: string } }>(
    '/v1/checkpoints/:checkpointId/queue',
    async (request) => {
      const { checkpoint: cp } = await requireStaff(
        options.db,
        clock,
        request,
        'OPERATOR',
        request.params.checkpointId,
      );
      const serviceDay = serviceDayOf(clock.now(), cp.timeZone, cp.dayStartsAt);
      const rows = await options.db
        .select()
        .from(queueToken)
        .where(and(eq(queueToken.checkpointId, cp.id), eq(queueToken.serviceDay, serviceDay)))
        .orderBy(asc(queueToken.issuedAtMs), asc(queueToken.number));
      return { checkpointId: cp.id, serviceDay, tickets: rows.map(ticketOfRow) };
    },
  );

  app.get<{ Params: { checkpointId: string } }>(
    '/v1/checkpoints/:checkpointId/audit/verify',
    async (request) => {
      const { checkpoint: cp } = await requireStaff(
        options.db,
        clock,
        request,
        'SUPERVISOR',
        request.params.checkpointId,
      );
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
