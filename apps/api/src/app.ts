import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import fastifyCookie from '@fastify/cookie';
import fastifyStatic from '@fastify/static';
import { and, asc, desc, eq, gte, inArray, isNull, lte, notInArray } from 'drizzle-orm';
import Fastify from 'fastify';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { ZodError, z } from 'zod';
import {
  ActivatePolicyRequest,
  AdmissionRequest,
  IssueTicketRequest,
  OverrideRequest,
  PublishPolicyRequest,
  ResolveReviewRequest,
  ScanRequest,
  SetLanesRequest,
  SetModeRequest,
  SignInRequest,
  openApiDocument,
} from '@gateflow/contracts';
import type {
  ActivatePolicyResponse,
  AuditResponse,
  CheckpointResponse,
  FlightsResponse,
  KioskStatus,
  MeResponse,
  OverrideResponse,
  PolicyStatusResponse,
  PublicTicketResponse,
  PublishPolicyResponse,
  QueueResponse,
  SetLanesResponse,
  SetModeResponse,
  StaffActionResponse,
  StaffMemberResponse,
  Ticket,
} from '@gateflow/contracts';
import { MAX_PARTY_SIZE, OperationError } from '@gateflow/operations';
import type { Policy } from '@gateflow/queue-core';
import type { Scenario } from '@gateflow/sim-scenarios';
import type { Command, CommandResult, TicketSummary } from '@gateflow/operations';
import { auditOf } from './audit';
import { requestHash } from './chain';
import { activatePolicy, policyHash, policyStatus, publishPolicy } from './policies';
import { readPass, recordScan, ticketOfPass } from './intake';
import { TimerScheduler } from './scheduler';
import {
  EventStream,
  HEARTBEAT_MS,
  POLL_MS,
  StreamHub,
  boardOf,
  callsBetween,
  displayMessageOf,
  lastEventIdOf,
  modeOf,
  seqOf,
} from './streams';
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
import type { Accepted, ScanOutcome, ScanReason } from './intake';
import type { Db } from './db/client';
import { airport, checkpoint, flight, queueCommand, queueToken } from './db/schema';
import { deviceOf, requireDevice } from './devices';
import type { Ids } from './ids';
import { randomIds } from './ids';
import { ApiError, Runtime, loadCheckpoint, serviceDayNow } from './runtime';
import type { BuildContext, CheckpointRow } from './runtime';
import { localDate, systemClock } from './time';
import type { Clock } from './time';
import { TwinRunner, twinFlightsOf } from './twin';
import { registerTwinRoutes } from './twin-routes';
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
  /**
   * The streams (S16): how often they say they are alive (10 seconds), and how often the server
   * reads the commands of the other servers (1 second). Shorter in tests.
   */
  readonly streams?: { readonly heartbeatMs?: number; readonly pollMs?: number };
  /**
   * The digital twin (S18), for demos: the scenarios it may play. Without it, the server has no
   * twin and no route of it.
   */
  readonly twin?: {
    readonly library: readonly Scenario[];
    /** The real time of the pacing (tests): the system's clock by default. */
    readonly realClock?: Clock;
  };
}

declare module 'fastify' {
  interface FastifyInstance {
    /** The scheduler of the queue's timeouts (S15). */
    readonly timers: TimerScheduler;
    /** The runs of the digital twin on this server (S18), when the server has the twin. */
    readonly twin: TwinRunner | null;
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
    overridden: t.overridden,
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

/** The people a boarding pass brings: an adult travelling with an infant is two (ADR-046). */
function peopleOn(intake: Accepted): number {
  return intake.pass.infant === 'WITH_INFANT' ? 2 : 1;
}

/** What a kiosk is told of a scan. */
interface ScanAnswer {
  readonly outcome: ScanOutcome;
  readonly reason: ScanReason | null;
  readonly ticket: Ticket | null;
  readonly ref: string | null;
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

/**
 * The lanes open at a checkpoint on a service day (S17): its latest `SET_LANES`, else what the day
 * opened with, else the checkpoint's settings (the day is not open yet).
 */
async function lanesOf(db: Db, cp: CheckpointRow, serviceDay: string): Promise<number> {
  const rows = await db
    .select({ command: queueCommand.command })
    .from(queueCommand)
    .where(
      and(
        eq(queueCommand.checkpointId, cp.id),
        eq(queueCommand.serviceDay, serviceDay),
        inArray(queueCommand.type, ['OPEN_DAY', 'SET_LANES']),
      ),
    )
    .orderBy(desc(queueCommand.seq))
    .limit(1);
  const command = rows[0]?.command as Command | undefined;
  if (command?.type === 'SET_LANES') return command.lanesOpen;
  if (command?.type === 'OPEN_DAY') return command.config.lanesOpen;
  return cp.settings.lanesOpen;
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

  /** The digital twin (S18): only on a server started with it, for demos. */
  const twin =
    options.twin === undefined
      ? null
      : new TwinRunner(
          options.db,
          runtime,
          ids,
          clock,
          (error) => {
            app.log.error(error);
          },
          options.twin.realClock,
        );
  app.decorate('twin', twin);
  if (twin !== null && options.twin !== undefined) {
    registerTwinRoutes(app, {
      db: options.db,
      clock,
      ids,
      runner: twin,
      library: options.twin.library,
    });
    // Before the server stops: a run playing would keep writing.
    app.addHook('preClose', async () => {
      await twin.close();
    });
  }

  /** The streams of the checkpoints: displays and lane stations follow the queue (S16). */
  const hub = new StreamHub(options.db, options.streams?.pollMs ?? POLL_MS);
  const heartbeatMs = options.streams?.heartbeatMs ?? HEARTBEAT_MS;
  runtime.onCommitted = (checkpointId, seq) => {
    hub.changed(checkpointId, seq);
  };
  app.addHook('onReady', () => {
    hub.start((error) => {
      app.log.error(error);
    });
  });
  // Before the server stops: an open stream would keep it waiting.
  app.addHook('preClose', () => {
    hub.stop();
  });
  /**
   * Keeps a stream alive: a heartbeat at every beat, once `stillAllowed` says its client may still
   * follow the checkpoint (a revoked display, a member signed out, end there); `refresh` then runs.
   */
  const keepAlive = (
    stream: EventStream,
    stillAllowed: () => Promise<void>,
    refresh: () => Promise<void>,
  ) => {
    const beat = setInterval(() => {
      void (async () => {
        try {
          await stillAllowed();
        } catch {
          stream.close();
          return;
        }
        stream.send('heartbeat', { at: new Date(clock.now()).toISOString() });
        await refresh();
      })().catch((error: unknown) => {
        app.log.error(error);
        stream.close();
      });
    }, heartbeatMs);
    stream.onClose(() => {
      clearInterval(beat);
    });
  };

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
  app.get('/v1/auth/me', async (request): Promise<MeResponse> => {
    const member = await staffOf(options.db, clock, request);
    return member === null ? { member: null } : memberView(member);
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
            isNull(flight.twinRunId),
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
                  id: f.id,
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

  /**
   * A display's stream (S16): the board after each command, with the calls since the previous
   * message. A display that reconnects with `Last-Event-ID` gets the calls it missed first.
   */
  app.get<{ Params: { checkpointId: string } }>(
    '/v1/checkpoints/:checkpointId/display',
    async (request, reply) => {
      const checkpointId = request.params.checkpointId;
      await requireDevice(options.db, request, checkpointId, 'DISPLAY');
      const cp = await loadCheckpoint(options.db, checkpointId);
      const today = () => serviceDayNow(cp, clock.now());
      const stream = new EventStream(reply);
      stream.onClose(hub.keep(stream));
      const failed = (error: unknown) => {
        app.log.error(error);
        stream.close();
      };
      // The sequence number the display has, and the service day it shows.
      let sent = lastEventIdOf(request);
      let shown: string | null = null;
      /** Sends the latest board, if the display does not have it, with the calls it missed. */
      const sendLatest = async (): Promise<void> => {
        const row = await boardOf(options.db, cp.id);
        const day = today();
        const seq = row?.seq ?? 0;
        if (sent !== null && seq <= sent && day === shown) return;
        // The calls since the display's last message, when that message is of this log.
        const calls =
          row?.serviceDay === day && sent !== null && sent <= seq
            ? await callsBetween(options.db, cp.id, day, sent, seq)
            : [];
        stream.send('board', displayMessageOf(row, calls, day, clock.now()), seq);
        sent = seq;
        shown = day;
      };
      // One send at a time, in order; the changes that come meanwhile make one more.
      let queued = false;
      let chain: Promise<void> = Promise.resolve();
      const pump = (): Promise<void> => {
        if (queued) return chain;
        queued = true;
        chain = chain
          .then(async () => {
            queued = false;
            if (!stream.closed) await sendLatest();
          })
          .catch(failed);
        return chain;
      };
      stream.onClose(
        hub.follow(cp.id, () => {
          void pump();
        }),
      );
      keepAlive(
        stream,
        async () => {
          await requireDevice(options.db, request, cp.id, 'DISPLAY');
        },
        pump,
      );
      await pump();
    },
  );

  /**
   * A kiosk's stream (S17): the mode of the checkpoint at once, and again whenever it changes. In
   * an emergency the kiosk shows the emergency message instead of asking for a boarding pass.
   */
  app.get<{ Params: { checkpointId: string } }>(
    '/v1/checkpoints/:checkpointId/kiosk',
    async (request, reply) => {
      const checkpointId = request.params.checkpointId;
      await requireDevice(options.db, request, checkpointId, 'KIOSK');
      const cp = await loadCheckpoint(options.db, checkpointId);
      const stream = new EventStream(reply);
      stream.onClose(hub.keep(stream));
      let sent: KioskStatus['mode'] | null = null;
      let chain: Promise<void> = Promise.resolve();
      /** Sends the mode, when the kiosk does not have it; one read at a time, in order. */
      const tell = (): Promise<void> => {
        chain = chain
          .then(async () => {
            if (stream.closed) return;
            const row = await boardOf(options.db, cp.id);
            const mode = row?.board.mode ?? 'NORMAL';
            if (mode === sent) return;
            const status: KioskStatus = { seq: row?.seq ?? 0, mode };
            stream.send('status', status, status.seq);
            sent = mode;
          })
          .catch((error: unknown) => {
            app.log.error(error);
            stream.close();
          });
        return chain;
      };
      stream.onClose(
        hub.follow(cp.id, () => {
          void tell();
        }),
      );
      keepAlive(
        stream,
        async () => {
          await requireDevice(options.db, request, cp.id, 'KIOSK');
        },
        tell,
      );
      await tell();
    },
  );

  /** The lane station's stream (S16): a message whenever the checkpoint's queue changes. */
  app.get<{ Params: { checkpointId: string } }>(
    '/v1/checkpoints/:checkpointId/stream',
    async (request, reply) => {
      const checkpointId = request.params.checkpointId;
      await requireStaff(options.db, clock, request, 'OPERATOR', checkpointId);
      const stream = new EventStream(reply);
      stream.onClose(hub.keep(stream));
      let sent = -1;
      const tell = (seq: number) => {
        if (seq <= sent) return;
        stream.send('changed', { seq }, seq);
        sent = seq;
      };
      stream.onClose(hub.follow(checkpointId, tell));
      keepAlive(
        stream,
        async () => {
          await requireStaff(options.db, clock, request, 'OPERATOR', checkpointId);
        },
        async () => {
          tell(await seqOf(options.db, checkpointId));
        },
      );
      tell(await seqOf(options.db, checkpointId));
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
          // Never a flight of the digital twin (S18): those are its simulated passengers'.
          if (f?.airportId !== cp.airportId || f.twinRunId !== null) {
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
      overridden: r.overridden,
      calls: r.calls,
      issuedAtMs: r.issuedAtMs,
      firstCalledAtMs: r.firstCalledAtMs,
      lastCalledAtMs: r.lastCalledAtMs,
      admittedAtMs: r.admittedAtMs,
    });

  /** A kiosk's scan in an emergency (S17): the kiosk shows the emergency message. */
  const emergency = () =>
    new ApiError(409, 'EMERGENCY', 'the checkpoint is in an emergency: kiosks scan nothing');

  /**
   * A boarding pass joins the party of a waiting ticket (S15): a family scans its other passes onto
   * the number it just took. The pass must be for the same flight and have no number of its own;
   * the party must still wait and not be full. A pass added twice counts once.
   */
  const joinParty = async (
    request: FastifyRequest,
    kioskId: string,
    cp: CheckpointRow,
    intake: Accepted,
    partyRef: string,
  ): Promise<ScanAnswer> => {
    const decided: { value?: ScanAnswer } = {};
    const executed = await runtime.execute({
      checkpointId: cp.id,
      idempotencyKey: idempotencyKeyOf(request),
      requestHash: requestHash('POST /v1/checkpoints/:checkpointId/scans', {
        pass: intake.dedupKey,
        party: partyRef,
      }),
      actor: `kiosk:${kioskId}`,
      build: async ({ tx, day, atMs }) => {
        if (day.mode === 'EMERGENCY') throw emergency();
        const party = day.ticketByRef(partyRef);
        if (party === undefined) {
          throw new ApiError(404, 'UNKNOWN_TICKET', 'no such ticket today at this checkpoint');
        }
        const own = await ticketOfPass(tx, cp.id, intake.dedupKey);
        const mine = own === undefined ? undefined : day.ticket(own.id);
        const infant = intake.pass.infant ?? undefined;
        const refuse = (outcome: ScanOutcome, reason: ScanReason): ScanAnswer => ({
          outcome,
          reason,
          ticket: null,
          ref: null,
        });
        let answer: ScanAnswer;
        if (mine?.ticketId === party.ticketId) {
          // The pass is on this number already: found again, not added twice.
          answer = { outcome: 'RETRIEVED', reason: null, ticket: toTicket(party), ref: partyRef };
        } else if (intake.flight.id !== party.flightId) {
          answer = refuse('REJECTED', 'OTHER_FLIGHT');
        } else if (mine !== undefined && mine.state !== 'EXPIRED') {
          // Its own number stands: admitted, held or cancelled ones go to staff, as on a rescan.
          const again = scanAnswerFor(mine.state);
          answer =
            again.outcome === 'NEEDS_ASSISTANCE' && again.reason !== null
              ? refuse('NEEDS_ASSISTANCE', again.reason)
              : refuse('REJECTED', 'HAS_OWN_NUMBER');
        } else if (party.state !== 'QUEUED' && party.state !== 'PREPARE') {
          answer = refuse('REJECTED', 'TOO_LATE');
        } else if (
          party.partySize + day.partyGrowth(party.ticketId, peopleOn(intake), infant) >
          MAX_PARTY_SIZE
        ) {
          answer = refuse('REJECTED', 'PARTY_FULL');
        } else {
          return {
            type: 'ADD_TO_PARTY',
            ticketId: party.ticketId,
            people: peopleOn(intake),
            ...(infant === undefined ? {} : { infant }),
            dedupKey: intake.dedupKey,
          };
        }
        decided.value = answer;
        await recordScan(tx, {
          id: ids.uuid(),
          checkpointId: cp.id,
          atMs,
          outcome: answer.outcome,
          reason: answer.reason,
          ticketId: party.ticketId,
          pass: intake.pass,
        });
        return null;
      },
    });
    const result = executed.result;
    if (result?.type === 'ACTED') {
      // Recorded once the queue has answered: a party called meanwhile takes no one more.
      const answer: ScanAnswer =
        result.outcome === 'DONE'
          ? { outcome: 'ADDED', reason: null, ticket: toTicket(result.ticket), ref: partyRef }
          : { outcome: 'REJECTED', reason: 'TOO_LATE', ticket: null, ref: null };
      if (!executed.replayed) {
        await recordScan(options.db, {
          id: ids.uuid(),
          checkpointId: cp.id,
          atMs: clock.now(),
          outcome: answer.outcome,
          reason: answer.reason,
          ticketId: result.ticket.ticketId,
          pass: intake.pass,
        });
      }
      return answer;
    }
    if (decided.value === undefined) throw new Error('the party scan gave no answer');
    return decided.value;
  };

  app.post<{ Params: { checkpointId: string } }>(
    '/v1/checkpoints/:checkpointId/scans',
    async (request, reply) => {
      const kiosk = await requireDevice(options.db, request, request.params.checkpointId, 'KIOSK');
      const body = parse(ScanRequest, request.body);
      const cp = await loadCheckpoint(options.db, request.params.checkpointId);
      // In an emergency a kiosk scans nothing (S17): the pass is not even read.
      if ((await modeOf(options.db, cp.id)) === 'EMERGENCY') throw emergency();
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
      if (body.party !== undefined) {
        await timers.advanceIfDue(cp.id);
        return reply.status(200).send(await joinParty(request, kiosk.id, cp, intake, body.party));
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
            // An emergency set since the check above, under the checkpoint's lock this time.
            if (day.mode === 'EMERGENCY') throw emergency();
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
            // A ticket issued again after an expiry keeps the passenger's first presentation at
            // the checkpoint, which the presentation rule reads, as in the simulator (S18).
            const firstPresented =
              existing !== undefined && current?.state === 'EXPIRED'
                ? day.presentedAtMs(existing.id)
                : undefined;
            return {
              type: 'ISSUE_TICKET',
              ticketId,
              opaqueRef: ids.opaqueRef(),
              source: 'KIOSK',
              ...(firstPresented === undefined || firstPresented >= atMs
                ? {}
                : { presentedAtMs: firstPresented }),
              flightId: f.id,
              segment: intake.segment,
              // An adult travelling with an infant is two people (ADR-046).
              partySize: peopleOn(intake),
              ...(intake.pass.infant === null ? {} : { infant: intake.pass.infant }),
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
        ({ day }) => {
          // Paused or in an emergency, nobody is called (S17): the lane station says why.
          if (day.mode === 'PAUSED' || day.mode === 'EMERGENCY') {
            throw new ApiError(
              409,
              'CALLS_PAUSED',
              `calls are stopped: the checkpoint is ${day.mode}`,
            );
          }
          return { type: 'CALL_NEXT' };
        },
        (result) => {
          if (result.type !== 'CALLED') throw new Error(`unexpected result ${result.type}`);
          return {
            status: 200,
            body: { called: result.ticket === null ? null : toTicket(result.ticket) },
          };
        },
      ),
  );

  /** The supervisor sets the mode of the checkpoint (S17, ADR-048). */
  app.post<{ Params: { checkpointId: string } }>(
    '/v1/checkpoints/:checkpointId/mode',
    async (request, reply) => {
      const member = await staffFor(request, 'SUPERVISOR');
      const body = parse(SetModeRequest, request.body);
      return command(
        request,
        reply,
        member,
        body,
        () => ({ type: 'SET_MODE', mode: body.mode, reset: body.reset }),
        (result): { status: number; body: SetModeResponse } => {
          if (result.type !== 'MODE_SET') throw new Error(`unexpected result ${result.type}`);
          return {
            status: 200,
            body: {
              outcome: result.outcome,
              mode: result.mode,
              previous: result.previous,
              reset: result.reset,
            },
          };
        },
      );
    },
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
    // A party grows at the kiosk, not by a staff action.
    if (result.type !== 'ACTED' || result.action === 'ADD_TO_PARTY') {
      throw new Error(`unexpected result ${result.type}`);
    }
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

  /** A supervisor's overrides of one ticket (S17): a boost or a call now, with a coded reason. */
  for (const [path, override] of [
    ['boost', 'BOOST'],
    ['call-now', 'CALL_NOW'],
  ] as const) {
    app.post<{ Params: { checkpointId: string; ticketId: string } }>(
      `/v1/checkpoints/:checkpointId/tickets/:ticketId/${path}`,
      async (request, reply) => {
        const member = await staffFor(request, 'SUPERVISOR');
        const { ticketId } = request.params;
        const body = parse(OverrideRequest, request.body);
        return command(
          request,
          reply,
          member,
          { ...body, ticketId, override },
          ({ day }) => {
            if (day.ticket(ticketId) === undefined) throw unknownTicket();
            return { type: 'OVERRIDE', ticketId, override, reason: body.reason };
          },
          (result): { status: number; body: OverrideResponse } => {
            if (result.type !== 'OVERRIDDEN') throw new Error(`unexpected result ${result.type}`);
            return {
              status: 200,
              body: {
                override: result.override,
                reason: result.reason,
                outcome: result.outcome,
                ticket: toTicket(result.ticket),
              },
            };
          },
        );
      },
    );
  }

  /** The supervisor sets the lanes open (S17): the engine's estimates follow at once. */
  app.post<{ Params: { checkpointId: string } }>(
    '/v1/checkpoints/:checkpointId/lanes',
    async (request, reply) => {
      const member = await staffFor(request, 'SUPERVISOR');
      const body = parse(SetLanesRequest, request.body);
      return command(
        request,
        reply,
        member,
        body,
        () => ({ type: 'SET_LANES', lanesOpen: body.lanesOpen }),
        (result): { status: number; body: SetLanesResponse } => {
          if (result.type !== 'LANES_SET') throw new Error(`unexpected result ${result.type}`);
          return { status: 200, body: { lanesOpen: result.lanesOpen, previous: result.previous } };
        },
      );
    },
  );

  /** The checkpoint and its airport, for the lane station's header (S15). */
  app.get<{ Params: { checkpointId: string } }>(
    '/v1/checkpoints/:checkpointId',
    async (request): Promise<CheckpointResponse> => {
      const { checkpoint: cp } = await requireStaff(
        options.db,
        clock,
        request,
        'OPERATOR',
        request.params.checkpointId,
      );
      const rows = await options.db.select().from(airport).where(eq(airport.id, cp.airportId));
      const a = rows[0];
      return {
        checkpoint: {
          id: cp.id,
          label: cp.name,
          ticketPrefix: cp.ticketPrefix,
          twin: cp.settings.twin ?? null,
        },
        airport: {
          label: a?.name ?? '',
          iata: cp.iata,
          timeZone: cp.timeZone,
          synthetic: a?.dataClassification === 'SYNTHETIC',
        },
      };
    },
  );

  /** The flights a manual ticket can be for: from an hour ago to 24 hours ahead (S15). */
  app.get<{ Params: { checkpointId: string } }>(
    '/v1/checkpoints/:checkpointId/flights',
    async (request): Promise<FlightsResponse> => {
      const { checkpoint: cp } = await requireStaff(
        options.db,
        clock,
        request,
        'OPERATOR',
        request.params.checkpointId,
      );
      // A twin's checkpoint has the flights of its virtual day (S18).
      const now = clock.now();
      const rows =
        cp.settings.twin !== undefined
          ? await twinFlightsOf(options.db, cp.settings.twin.runId)
          : await options.db
              .select()
              .from(flight)
              .where(
                and(
                  eq(flight.airportId, cp.airportId),
                  // The digital twin's flights are its checkpoints' only (S18).
                  isNull(flight.twinRunId),
                  gte(flight.stdMs, now - 60 * 60 * 1000),
                  lte(flight.stdMs, now + 24 * 60 * 60 * 1000),
                ),
              )
              .orderBy(asc(flight.stdMs));
      return {
        flights: rows.map((f) => ({
          id: f.id,
          label:
            f.carrier === null || f.flightNumber === null
              ? f.number
              : `${f.carrier} ${f.flightNumber}`,
          departure: new Date(f.stdMs).toISOString(),
          boardingClose:
            f.boardingCloseMs === null ? null : new Date(f.boardingCloseMs).toISOString(),
        })),
      };
    },
  );

  const QueueQuery = z.strictObject({ inPlay: z.enum(['true', 'false']).optional() });
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
      const { inPlay } = parse(QueueQuery, request.query);
      const serviceDay = serviceDayNow(cp, clock.now());
      const rows = await options.db
        .select()
        .from(queueToken)
        .where(
          and(
            eq(queueToken.checkpointId, cp.id),
            eq(queueToken.serviceDay, serviceDay),
            // The screens of staff need the tickets still in play only: a day has thousands.
            inPlay === 'true'
              ? notInArray(queueToken.state, ['ADMITTED', 'EXPIRED', 'CANCELLED'])
              : undefined,
          ),
        )
        .orderBy(asc(queueToken.issuedAtMs), asc(queueToken.number));
      const board = await boardOf(options.db, cp.id);
      return {
        checkpointId: cp.id,
        serviceDay,
        mode: board?.board.mode ?? 'NORMAL',
        lanesOpen: await lanesOf(options.db, cp, serviceDay),
        updatedAt: board === undefined ? null : new Date(board.atMs).toISOString(),
        tickets: rows.map(ticketOfRow),
      } satisfies QueueResponse;
    },
  );

  /** The audit view (S17, ADR-050): a service day's commands, the latest first. */
  const AuditQuery = z.strictObject({
    day: z.iso.date().optional(),
    number: z.string().min(1).max(10).optional(),
    before: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(50).optional(),
  });
  app.get<{ Params: { checkpointId: string } }>(
    '/v1/checkpoints/:checkpointId/audit',
    async (request): Promise<AuditResponse> => {
      const { checkpoint: cp } = await requireStaff(
        options.db,
        clock,
        request,
        'SUPERVISOR',
        request.params.checkpointId,
      );
      const query = parse(AuditQuery, request.query);
      const day = query.day ?? serviceDayNow(cp, clock.now());
      return auditOf(options.db, cp, day, {
        ...(query.number === undefined ? {} : { number: query.number }),
        ...(query.before === undefined ? {} : { before: query.before }),
        ...(query.limit === undefined ? {} : { limit: query.limit }),
      });
    },
  );

  /** The checkpoint's policies (S17, ADR-050): today's, the next day's, versions, activations. */
  app.get<{ Params: { checkpointId: string } }>(
    '/v1/checkpoints/:checkpointId/policy',
    async (request): Promise<PolicyStatusResponse> => {
      const { checkpoint: cp } = await requireStaff(
        options.db,
        clock,
        request,
        'SUPERVISOR',
        request.params.checkpointId,
      );
      return policyStatus(options.db, cp, clock.now());
    },
  );

  /** An administrator publishes a version of a policy for the airport (S17): immutable. */
  app.post<{ Params: { checkpointId: string } }>(
    '/v1/checkpoints/:checkpointId/policy/versions',
    async (request, reply) => {
      const { member, checkpoint: cp } = await requireStaff(
        options.db,
        clock,
        request,
        'ADMIN',
        request.params.checkpointId,
      );
      const body = parse(PublishPolicyRequest, request.body);
      const policy = body.policy as unknown as Policy;
      const published = await publishPolicy(
        options.db,
        cp.airportId,
        policy,
        `staff:${member.id}`,
        ids,
        clock.now(),
      );
      const answer: PublishPolicyResponse = { ...published, hash: policyHash(policy) };
      return reply.status(published.created ? 201 : 200).send(answer);
    },
  );

  /** An administrator activates a version from the next service day that has not started. */
  app.post<{ Params: { checkpointId: string } }>(
    '/v1/checkpoints/:checkpointId/policy/activations',
    async (request): Promise<ActivatePolicyResponse> => {
      const { member, checkpoint: cp } = await requireStaff(
        options.db,
        clock,
        request,
        'ADMIN',
        request.params.checkpointId,
      );
      const body = parse(ActivatePolicyRequest, request.body);
      return activatePolicy(options.db, cp, body.versionId, `staff:${member.id}`, ids, clock.now());
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
        partySize: queueToken.partySize,
        state: queueToken.state,
        serviceDay: queueToken.serviceDay,
        checkpoint: checkpoint.name,
        checkpointId: queueToken.checkpointId,
      })
      .from(queueToken)
      .innerJoin(checkpoint, eq(checkpoint.id, queueToken.checkpointId))
      .where(eq(queueToken.opaqueRef, request.params.ref));
    const row = rows[0];
    if (row === undefined) throw new ApiError(404, 'UNKNOWN_TICKET', 'no such ticket');
    return {
      number: row.number,
      partySize: row.partySize,
      state: row.state as PublicTicketResponse['state'],
      checkpoint: row.checkpoint,
      serviceDay: row.serviceDay,
      mode: await modeOf(options.db, row.checkpointId),
    } satisfies PublicTicketResponse;
  });

  return app;
}
