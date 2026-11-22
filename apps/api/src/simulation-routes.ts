import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { AddSimulationScenarioRequest, CreateSimulationRequest } from '@gateflow/contracts';
import type {
  AddSimulationScenarioResponse,
  SimulationManifest,
  SimulationRun,
  SimulationScenario,
  SimulationScenariosResponse,
  SimulationsResponse,
} from '@gateflow/contracts';
import { renderHtmlReport, renderReport } from '@gateflow/sim-metrics';
import type { ResultsDocument } from '@gateflow/sim-metrics';
import type { z } from 'zod';
import type { Db } from './db/client';
import type { Ids } from './ids';
import { ApiError } from './runtime';
import {
  cancelRun,
  createRun,
  namesOf,
  resultsOf,
  runOf,
  runView,
  runsOf,
  saveScenario,
  scenarioByHash,
  scenarioById,
  scenarioOfRow,
  scenariosOf,
  specOfManifest,
  specOfSettings,
} from './simulations';
import type { FoundRun, SimScenarioSummary, SimulationRunner } from './simulations';
import { requireSameOrigin, simulates, staffOf } from './staff';
import type { StaffMember } from './staff';
import type { Clock } from './time';

/*
 * The routes of simulations (S19, ADR-052): analysts and administrators of an airport save its
 * scenarios, ask for runs, follow them and export their results. A simulation gives no right on a
 * live checkpoint, and reads nothing of one.
 */

/**
 * The report page: no script at all, its own styles only, nothing loaded from anywhere (the
 * charts are inline SVG).
 */
export const REPORT_CSP =
  "default-src 'none'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; " +
  "form-action 'none'; frame-ancestors 'none'";

function parse<T extends z.ZodType>(schema: T, body: unknown): z.infer<T> {
  const parsed = schema.safeParse(body ?? {});
  if (!parsed.success) {
    throw new ApiError(
      400,
      'INVALID_REQUEST',
      parsed.error.issues
        .slice(0, 5)
        .map((i) => `${i.path.map(String).join('.') || '(body)'}: ${i.message}`)
        .join('; '),
    );
  }
  return parsed.data;
}

function scenarioView(
  row: SimScenarioSummary,
  names: ReadonlyMap<string, string>,
): SimulationScenario {
  return {
    id: row.id,
    hash: row.hash,
    scenarioId: row.scenarioId,
    title: row.title,
    dataClassification: row.dataClassification,
    createdAt: new Date(row.createdAtMs).toISOString(),
    createdBy: names.get(row.createdBy) ?? row.createdBy,
  };
}

/** A file name from a scenario's id and a run's: letters, digits, dots and dashes only. */
const fileName = (scenarioId: string, runId: string, suffix: string): string =>
  `${scenarioId.replace(/[^A-Za-z0-9.-]/g, '-')}-${runId.slice(0, 8)}${suffix}`;

export function registerSimulationRoutes(
  app: FastifyInstance,
  options: {
    readonly db: Db;
    readonly clock: Clock;
    readonly ids: Ids;
    /** The server's runner, when it simulates (else another server does). */
    readonly runner: SimulationRunner | null;
  },
): void {
  const { db, clock, ids, runner } = options;

  /** An analyst or an administrator, from this site. */
  const requireAnalyst = async (request: FastifyRequest): Promise<StaffMember> => {
    requireSameOrigin(request);
    const member = await staffOf(db, clock, request);
    if (member === null) throw new ApiError(401, 'SIGN_IN_REQUIRED', 'sign in as staff first');
    if (!simulates(member)) {
      throw new ApiError(403, 'NOT_ALLOWED', 'simulations are for analysts and administrators');
    }
    return member;
  };

  const view = async (found: FoundRun): Promise<SimulationRun> =>
    runView(found.row, found.scenario, await namesOf(db, [found.row.createdBy]));

  /** A run of the member's airport that is done, and its results file as written. */
  const done = async (member: StaffMember, runId: string) => {
    const found = await runOf(db, member.airportId, runId);
    return { found, text: await resultsOf(db, found) };
  };

  const document = (text: string): ResultsDocument => JSON.parse(text) as ResultsDocument;

  const download = (reply: FastifyReply, type: string, name: string) =>
    reply
      .type(type)
      .header('Cache-Control', 'private, no-store')
      .header('Content-Disposition', `inline; filename="${name}"`);

  app.post('/v1/simulation-scenarios', async (request, reply) => {
    const member = await requireAnalyst(request);
    const body = parse(AddSimulationScenarioRequest, request.body);
    const saved = await saveScenario(db, ids, {
      airportId: member.airportId,
      scenario: body.scenario,
      by: `staff:${member.id}`,
      nowMs: clock.now(),
    });
    const answer: AddSimulationScenarioResponse = {
      scenario: scenarioView(saved.row, await namesOf(db, [saved.row.createdBy])),
      created: saved.created,
    };
    return reply.status(saved.created ? 201 : 200).send(answer);
  });

  app.get('/v1/simulation-scenarios', async (request): Promise<SimulationScenariosResponse> => {
    const member = await requireAnalyst(request);
    const rows = await scenariosOf(db, member.airportId);
    const names = await namesOf(
      db,
      rows.map((r) => r.createdBy),
    );
    return { scenarios: rows.map((r) => scenarioView(r, names)) };
  });

  app.get<{ Params: { scenarioId: string } }>(
    '/v1/simulation-scenarios/:scenarioId/file',
    async (request, reply) => {
      const member = await requireAnalyst(request);
      const row = await scenarioById(db, member.airportId, request.params.scenarioId);
      return download(reply, 'application/json; charset=utf-8', `${row.scenarioId}.json`).send(
        row.content,
      );
    },
  );

  app.post('/v1/simulations', async (request, reply) => {
    const member = await requireAnalyst(request);
    const body = parse(CreateSimulationRequest, request.body);
    const hash = 'settings' in body ? body.settings.scenarioHash : body.manifest.scenario.hash;
    const scenarioRow = await scenarioByHash(db, member.airportId, hash);
    const scenario = scenarioOfRow(scenarioRow);
    // The manifest as sent, not as parsed: its policies keep the order of their fields.
    const raw = request.body as { manifest?: unknown };
    const spec =
      'settings' in body
        ? specOfSettings(body.settings, scenario)
        : specOfManifest(raw.manifest as typeof body.manifest, scenario);
    const row = await createRun(db, ids, {
      airportId: member.airportId,
      scenario: scenarioRow,
      spec,
      label: body.label ?? null,
      expected:
        body.expectedFingerprint === undefined
          ? null
          : { fingerprint: body.expectedFingerprint, reproduces: null },
      by: `staff:${member.id}`,
      nowMs: clock.now(),
    });
    runner?.wake();
    return reply.status(201).send(await view({ row, scenario: scenarioRow }));
  });

  app.get('/v1/simulations', async (request): Promise<SimulationsResponse> => {
    const member = await requireAnalyst(request);
    const found = await runsOf(db, member.airportId);
    const names = await namesOf(
      db,
      found.map((f) => f.row.createdBy),
    );
    return { runs: found.map((f) => runView(f.row, f.scenario, names)) };
  });

  app.get<{ Params: { runId: string } }>(
    '/v1/simulations/:runId',
    async (request): Promise<SimulationRun> => {
      const member = await requireAnalyst(request);
      return view(await runOf(db, member.airportId, request.params.runId));
    },
  );

  app.get<{ Params: { runId: string } }>(
    '/v1/simulations/:runId/results',
    async (request, reply) => {
      const member = await requireAnalyst(request);
      const { found, text } = await done(member, request.params.runId);
      return download(
        reply,
        'application/json; charset=utf-8',
        fileName(found.scenario.scenarioId, found.row.id, '.results.json'),
      ).send(text);
    },
  );

  app.get<{ Params: { runId: string } }>(
    '/v1/simulations/:runId/report',
    async (request, reply) => {
      const member = await requireAnalyst(request);
      const { found, text } = await done(member, request.params.runId);
      return download(
        reply,
        'text/markdown; charset=utf-8',
        fileName(found.scenario.scenarioId, found.row.id, '.report.md'),
      ).send(renderReport(document(text)));
    },
  );

  app.get<{ Params: { runId: string } }>(
    '/v1/simulations/:runId/report.html',
    async (request, reply) => {
      const member = await requireAnalyst(request);
      const { found, text } = await done(member, request.params.runId);
      return download(
        reply,
        'text/html; charset=utf-8',
        fileName(found.scenario.scenarioId, found.row.id, '.report.html'),
      )
        .header('Content-Security-Policy', REPORT_CSP)
        .send(renderHtmlReport(document(text)));
    },
  );

  app.post<{ Params: { runId: string } }>(
    '/v1/simulations/:runId/reproduce',
    async (request, reply) => {
      const member = await requireAnalyst(request);
      const { found, text } = await done(member, request.params.runId);
      if (found.row.fingerprint === null) throw new Error('a run done has no fingerprint');
      const { manifest } = JSON.parse(text) as { readonly manifest: SimulationManifest };
      const row = await createRun(db, ids, {
        airportId: member.airportId,
        scenario: found.scenario,
        spec: specOfManifest(
          manifest,
          scenarioOfRow(await scenarioById(db, member.airportId, found.scenario.id)),
        ),
        label: found.row.label,
        expected: { fingerprint: found.row.fingerprint, reproduces: found.row.id },
        by: `staff:${member.id}`,
        nowMs: clock.now(),
      });
      runner?.wake();
      return reply.status(201).send(await view({ row, scenario: found.scenario }));
    },
  );

  app.post<{ Params: { runId: string } }>(
    '/v1/simulations/:runId/cancel',
    async (request): Promise<SimulationRun> => {
      const member = await requireAnalyst(request);
      await cancelRun(db, member.airportId, request.params.runId, clock.now());
      runner?.cancelled(request.params.runId);
      return view(await runOf(db, member.airportId, request.params.runId));
    },
  );
}
