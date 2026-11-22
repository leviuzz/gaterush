import { execFileSync, spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { createServer } from 'node:net';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

/*
 * The product as an airport runs it: the gateflow-api bundle on a PostgreSQL database of its own,
 * migrated and seeded by its own commands, serving the built web application. Build first:
 * `pnpm build`.
 */

const API = fileURLToPath(new URL('../../api/dist/gateflow-api.mjs', import.meta.url));
const WEB = fileURLToPath(new URL('../dist/', import.meta.url));
const REPO = fileURLToPath(new URL('../../../', import.meta.url));
/** The Simulator Studio's page for GateFlow (S19), which the bundle serves at /sim. */
const STUDIO = fileURLToPath(
  new URL('../../studio/dist/gateflow-studio.server.html', import.meta.url),
);

export interface Product {
  /** The server's address, e.g. http://127.0.0.1:43123. */
  readonly base: string;
  readonly checkpointId: string;
  readonly kioskToken: string;
  /** A device of the checkpoint that is not a kiosk. */
  readonly displayToken: string;
  /** The airport's day, as boarding passes give it. */
  readonly calendarDay: string;
  /** The `cookie` header of a supervisor signed in at the airport (S15). */
  readonly staffCookie: string;
  /** Members of staff of the airport, to sign in at the lane station (S15). */
  readonly staff: Readonly<
    Record<
      'supervisor' | 'operator' | 'admin' | 'analyst',
      { readonly login: string; readonly password: string }
    >
  >;
  /** Runs a command of gateflow-api on the product's database. */
  cli(args: readonly string[]): string;
  /** Stops the server, as when it fails, leaving its database (S16). */
  stopServer(): Promise<void>;
  /** Starts the server again, at the same address. */
  startServer(): Promise<void>;
  stop(): Promise<void>;
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      server.close(() => {
        if (address === null || typeof address === 'string') reject(new Error('no port'));
        else resolve(address.port);
      });
    });
  });
}

/** The date at the airport, as a boarding pass gives it: `2026-11-22`. */
export function dayAt(ms: number, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(ms));
}

const deviceToken = (printed: string): string => {
  const token = /^token (\S+)$/m.exec(printed)?.[1];
  if (token === undefined) throw new Error(`no token in:\n${printed}`);
  return token;
};

export async function startProduct(
  serverUrl: string,
  scenario: string,
  options: {
    /** Serve the digital twin of the scenarios of the library (S18). */
    readonly twin?: boolean;
  } = {},
): Promise<Product> {
  for (const file of [API, join(WEB, 'index.html'), STUDIO]) {
    if (!existsSync(file)) throw new Error(`${file} is missing: run pnpm build first`);
  }
  const name = `gateflow_web_${randomBytes(6).toString('hex')}`;
  const admin = new pg.Client({ connectionString: serverUrl });
  await admin.connect();
  await admin.query(`CREATE DATABASE ${name}`);
  await admin.end();
  const url = new URL(serverUrl);
  url.pathname = `/${name}`;
  const env = { ...process.env, DATABASE_URL: url.toString() };
  const cli = (args: readonly string[]) =>
    execFileSync(process.execPath, [API, ...args], { env, encoding: 'utf8' });

  const file = join(REPO, 'scenarios', scenario);
  const seeded = cli(['seed', '--scenario', file]);
  const checkpointId = /checkpoint ([0-9a-f-]{36})/.exec(seeded)?.[1];
  if (checkpointId === undefined) throw new Error(`no checkpoint in:\n${seeded}`);
  // The calendar day (before 03:00 it is not the service day) and the next one too: the demo
  // flights of the next 24 hours exist at any hour the tests run.
  const calendarDay = dayAt(Date.now(), 'Europe/Rome');
  cli(['seed', '--scenario', file, '--day', calendarDay]);
  cli([
    'seed',
    '--scenario',
    file,
    '--day',
    dayAt(Date.now() + 24 * 60 * 60 * 1000, 'Europe/Rome'),
  ]);
  const kioskToken = deviceToken(
    cli(['device', 'add', '--checkpoint', checkpointId, '--kind', 'kiosk', '--name', 'Kiosk 1']),
  );
  const displayToken = deviceToken(
    cli(['device', 'add', '--checkpoint', checkpointId, '--kind', 'display', '--name', 'Hall']),
  );
  const added = cli([
    'user',
    'add',
    '--airport',
    'vce-like',
    '--login',
    'e2e.supervisor',
    '--role',
    'supervisor',
  ]);
  const password = /^password (\S+)$/m.exec(added)?.[1];
  if (password === undefined) throw new Error(`no password in:\n${added}`);
  const operatorAdded = cli([
    'user',
    'add',
    '--airport',
    'vce-like',
    '--login',
    'e2e.operator',
    '--role',
    'operator',
    '--checkpoint',
    checkpointId,
  ]);
  const operatorPassword = /^password (\S+)$/m.exec(operatorAdded)?.[1] ?? '';
  const adminAdded = cli([
    'user',
    'add',
    '--airport',
    'vce-like',
    '--login',
    'e2e.admin',
    '--role',
    'admin',
  ]);
  const adminPassword = /^password (\S+)$/m.exec(adminAdded)?.[1] ?? '';
  // Simulations (S19): an analyst of the airport.
  const analystAdded = cli([
    'user',
    'add',
    '--airport',
    'vce-like',
    '--login',
    'e2e.analyst',
    '--role',
    'analyst',
  ]);
  const analystPassword = /^password (\S+)$/m.exec(analystAdded)?.[1] ?? '';

  const port = await freePort();
  const base = `http://127.0.0.1:${String(port)}`;
  /** Starts gateflow-api and waits until it answers. */
  const launch = async () => {
    const started = spawn(
      process.execPath,
      [
        API,
        'serve',
        '--port',
        String(port),
        '--host',
        '127.0.0.1',
        '--web',
        WEB,
        '--studio',
        STUDIO,
        // Simulations on two threads of the bundle (S19).
        '--sim-workers',
        '2',
        ...(options.twin === true ? ['--twin', join(REPO, 'scenarios')] : []),
      ],
      { env, stdio: ['ignore', 'pipe', 'pipe'] },
    );
    const output: string[] = [];
    started.stdout.on('data', (chunk: Buffer) => output.push(chunk.toString()));
    started.stderr.on('data', (chunk: Buffer) => output.push(chunk.toString()));
    const deadline = Date.now() + 30_000;
    for (;;) {
      try {
        if ((await fetch(`${base}/v1/health`)).ok) break;
      } catch {
        // not listening yet
      }
      if (started.exitCode !== null || Date.now() > deadline) {
        started.kill();
        throw new Error(`the server did not start:\n${output.join('')}`);
      }
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    return started;
  };
  let server: ReturnType<typeof spawn> | null = await launch();
  const stopServer = async () => {
    const running = server;
    if (running === null) return;
    server = null;
    const exited = new Promise((resolve) => running.once('exit', resolve));
    running.kill('SIGTERM');
    await exited;
  };

  const signedIn = await fetch(`${base}/v1/auth/sign-in`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ login: 'e2e.supervisor', password }),
  });
  const session = /gateflow_session=([^;]+)/.exec(signedIn.headers.get('set-cookie') ?? '')?.[1];
  if (!signedIn.ok || session === undefined) throw new Error('the supervisor cannot sign in');

  return {
    base,
    checkpointId,
    kioskToken,
    displayToken,
    calendarDay,
    staffCookie: `gateflow_session=${session}`,
    staff: {
      supervisor: { login: 'e2e.supervisor', password },
      operator: { login: 'e2e.operator', password: operatorPassword },
      admin: { login: 'e2e.admin', password: adminPassword },
      analyst: { login: 'e2e.analyst', password: analystPassword },
    },
    cli,
    stopServer,
    startServer: async () => {
      server ??= await launch();
    },
    stop: async () => {
      await stopServer();
      const dropper = new pg.Client({ connectionString: serverUrl });
      await dropper.connect();
      await dropper.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
      await dropper.end();
    },
  };
}
