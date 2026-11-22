import type {
  AddSimulationScenarioResponse,
  MeResponse,
  SimulationRun,
  SimulationsResponse,
  StaffMemberResponse,
} from '@gateflow/contracts';
import { fingerprintMaterial, stringifyResults } from '@gateflow/sim-metrics';
import type { ResultsDocument } from '@gateflow/sim-metrics';
import type { Scenario } from '@gateflow/sim-scenarios';
import { sha256Hex } from '@gateflow/studio-core';

/*
 * The Studio served by GateFlow (S19, ADR-052) talks to the server that served it, and to nothing
 * else (`connect-src 'self'`): an analyst signs in, saves a run of the page (its scenario, then
 * its manifest, with the fingerprint of the page's results), and opens the runs of the airport.
 * GateFlow simulates a saved run again and says whether it gave the page's results.
 */

/** An answer of GateFlow that is not a success, with its code (`SIGN_IN_REQUIRED`...). */
export class GateFlowError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'GateFlowError';
  }
}

async function call(method: 'GET' | 'POST', path: string, body?: unknown): Promise<string> {
  const response = await fetch(path, {
    method,
    credentials: 'same-origin',
    ...(body === undefined
      ? {}
      : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
  });
  const text = await response.text();
  if (!response.ok) {
    let code = `HTTP_${String(response.status)}`;
    let message = text;
    try {
      const error = (JSON.parse(text) as { error?: { code?: string; message?: string } }).error;
      code = error?.code ?? code;
      message = error?.message ?? message;
    } catch {
      // not JSON
    }
    throw new GateFlowError(response.status, code, message);
  }
  return text;
}

const json = async <T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> =>
  JSON.parse(await call(method, path, body)) as T;

export const gateflow = {
  me: () => json<MeResponse>('GET', '/v1/auth/me'),
  signIn: (login: string, password: string) =>
    json<StaffMemberResponse>('POST', '/v1/auth/sign-in', { login, password }),
  signOut: async () => {
    await call('POST', '/v1/auth/sign-out');
  },
  simulations: () => json<SimulationsResponse>('GET', '/v1/simulations'),
  /** The results file of a run, as written. */
  results: (runId: string) => call('GET', `/v1/simulations/${encodeURIComponent(runId)}/results`),
};

/** The fingerprint of results, as GateFlow computes it: the same experiment, the same print. */
export function fingerprintOf(doc: ResultsDocument): string {
  return sha256Hex(fingerprintMaterial(stringifyResults(doc)));
}

/**
 * Saves a run of the page: its scenario (whole), then its manifest with the fingerprint of the
 * page's results. GateFlow simulates it again and says, once done, whether it gave them.
 */
export async function saveRun(run: {
  readonly doc: ResultsDocument;
  readonly scenario: Scenario;
  readonly label: string;
}): Promise<SimulationRun> {
  await json<AddSimulationScenarioResponse>('POST', '/v1/simulation-scenarios', {
    scenario: run.scenario,
  });
  return json<SimulationRun>('POST', '/v1/simulations', {
    manifest: run.doc.manifest,
    expectedFingerprint: fingerprintOf(run.doc),
    label: run.label.slice(0, 100),
  });
}
