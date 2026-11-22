import { and, desc, eq } from 'drizzle-orm';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { StartTwinRequest, TwinSpeedRequest } from '@gateflow/contracts';
import type {
  TwinDisplayResponse,
  TwinOptionsResponse,
  TwinResponse,
  TwinRun,
} from '@gateflow/contracts';
import { validateLivePolicy } from '@gateflow/operations';
import type { Policy } from '@gateflow/queue-core';
import type { Scenario } from '@gateflow/sim-scenarios';
import type { Db } from './db/client';
import { airport, policyVersion, twinRun } from './db/schema';
import { addDevice } from './devices';
import type { Ids } from './ids';
import { summaryOf } from './policies';
import { ApiError } from './runtime';
import { requireSameOrigin, staffOf } from './staff';
import type { StaffMember } from './staff';
import type { Clock } from './time';
import { twinOf } from './twin';
import type { TwinRunner } from './twin';

/*
 * The routes of the digital twin (S18, ADR-051), for the demo page: administrators only, of an
 * airport whose data are synthetic, on a server started with the twin. A twin never plays on a
 * real airport.
 */

/** The scenarios of the twin's library that belong to an airport: its own, in its time zone. */
export function scenariosOf(
  library: readonly Scenario[],
  place: { readonly code: string; readonly timeZone: string },
): Scenario[] {
  return library.filter(
    (s) => (s.airport?.id ?? s.id) === place.code && s.timeZone === place.timeZone,
  );
}

/** A policy the live system runs. */
function playable(policy: Policy): boolean {
  try {
    validateLivePolicy(policy);
    return true;
  } catch {
    return false;
  }
}

const MS_PER_MINUTE = 60_000;

export function registerTwinRoutes(
  app: FastifyInstance,
  options: {
    readonly db: Db;
    readonly clock: Clock;
    readonly ids: Ids;
    readonly runner: TwinRunner;
    readonly library: readonly Scenario[];
  },
): void {
  const { db, clock, runner } = options;

  /** The administrator of a synthetic airport a request needs. */
  const requireTwinAdmin = async (request: FastifyRequest) => {
    requireSameOrigin(request);
    const member: StaffMember | null = await staffOf(db, clock, request);
    if (member === null) throw new ApiError(401, 'SIGN_IN_REQUIRED', 'sign in as staff first');
    if (member.role !== 'ADMIN') {
      throw new ApiError(403, 'NOT_ALLOWED', 'the digital twin is for administrators');
    }
    const [place] = await db.select().from(airport).where(eq(airport.id, member.airportId));
    if (place === undefined) throw new ApiError(404, 'UNKNOWN_AIRPORT', 'no such airport');
    if (place.dataClassification !== 'SYNTHETIC') {
      throw new ApiError(
        403,
        'NOT_SYNTHETIC',
        'the digital twin plays only at an airport whose data are synthetic',
      );
    }
    return { member, place };
  };

  /** A run of the administrator's airport. */
  const requireRun = async (runId: string, airportId: string) => {
    const [row] = await db
      .select({ id: twinRun.id, checkpointId: twinRun.checkpointId })
      .from(twinRun)
      .where(and(eq(twinRun.id, runId), eq(twinRun.airportId, airportId)));
    if (row === undefined) throw new ApiError(404, 'UNKNOWN_RUN', 'no such run of the twin');
    return row;
  };

  const viewOf = async (runId: string): Promise<TwinRun> => {
    const view = await runner.view(runId);
    if (view === null) throw new ApiError(404, 'UNKNOWN_RUN', 'no such run of the twin');
    return view;
  };

  app.get('/v1/twin/options', async (request): Promise<TwinOptionsResponse> => {
    const { place } = await requireTwinAdmin(request);
    const versions = await db
      .select()
      .from(policyVersion)
      .where(eq(policyVersion.airportId, place.id))
      .orderBy(desc(policyVersion.createdAtMs));
    return {
      scenarios: scenariosOf(options.library, place).map((s) => ({ id: s.id, title: s.title })),
      policies: versions
        .filter((v) => playable(v.content as Policy))
        .map((v) => ({ id: v.id, ...summaryOf(v.content as Policy) })),
    };
  });

  app.get('/v1/twin', async (request): Promise<TwinResponse> => {
    const { place } = await requireTwinAdmin(request);
    return twinOf(db, runner, place.id, clock.now());
  });

  app.post('/v1/twin/runs', async (request, reply) => {
    const { member, place } = await requireTwinAdmin(request);
    const parsed = StartTwinRequest.safeParse(request.body ?? {});
    if (!parsed.success) {
      throw new ApiError(
        400,
        'INVALID_REQUEST',
        parsed.error.issues.map((i) => i.message).join('; '),
      );
    }
    const body = parsed.data;
    const scenario = scenariosOf(options.library, place).find((s) => s.id === body.scenarioId);
    if (scenario === undefined) {
      throw new ApiError(404, 'UNKNOWN_SCENARIO', 'no such scenario of the twin at this airport');
    }
    const [version] = await db
      .select()
      .from(policyVersion)
      .where(
        and(eq(policyVersion.id, body.policyVersionId), eq(policyVersion.airportId, place.id)),
      );
    if (version === undefined) {
      throw new ApiError(404, 'UNKNOWN_POLICY', 'no such policy version at this airport');
    }
    const [hours = 0, minutes = 0] = (body.until ?? '').split(':').map(Number);
    const runId = await runner.start({
      airportId: place.id,
      timeZone: place.timeZone,
      scenario,
      seed: body.seed,
      policy: version.content as Policy,
      speed: body.speed,
      ...(body.until === undefined ? {} : { untilMs: (hours * 60 + minutes) * MS_PER_MINUTE }),
      createdBy: `staff:${member.id}`,
    });
    return reply.status(201).send(await viewOf(runId));
  });

  app.post<{ Params: { runId: string } }>('/v1/twin/runs/:runId/speed', async (request) => {
    const { place } = await requireTwinAdmin(request);
    const run = await requireRun(request.params.runId, place.id);
    const parsed = TwinSpeedRequest.safeParse(request.body ?? {});
    if (!parsed.success) {
      throw new ApiError(400, 'INVALID_REQUEST', 'the speed is 1 to 10000, or null');
    }
    if (!runner.setSpeed(run.id, parsed.data.speed)) {
      throw new ApiError(409, 'NOT_PLAYING_HERE', 'the run does not play on this server');
    }
    return viewOf(run.id);
  });

  app.post<{ Params: { runId: string } }>('/v1/twin/runs/:runId/stop', async (request) => {
    const { place } = await requireTwinAdmin(request);
    const run = await requireRun(request.params.runId, place.id);
    // A run that ended, or plays elsewhere, stays as it is.
    await runner.stop(run.id);
    return viewOf(run.id);
  });

  app.post<{ Params: { runId: string } }>(
    '/v1/twin/runs/:runId/display',
    async (request, reply) => {
      const { place } = await requireTwinAdmin(request);
      const run = await requireRun(request.params.runId, place.id);
      const added = await addDevice(db, options.ids, {
        checkpointId: run.checkpointId,
        kind: 'DISPLAY',
        name: 'Display of the digital twin',
      });
      const answer: TwinDisplayResponse = { checkpointId: run.checkpointId, token: added.token };
      return reply.status(201).send(answer);
    },
  );
}
