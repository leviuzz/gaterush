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

export interface Product {
  /** The server's address, e.g. http://127.0.0.1:43123. */
  readonly base: string;
  readonly checkpointId: string;
  readonly kioskToken: string;
  /** A device of the checkpoint that is not a kiosk. */
  readonly displayToken: string;
  /** The airport's day, as boarding passes give it. */
  readonly calendarDay: string;
  /** Runs a command of gateflow-api on the product's database. */
  cli(args: readonly string[]): string;
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

export async function startProduct(serverUrl: string, scenario: string): Promise<Product> {
  for (const file of [API, join(WEB, 'index.html')]) {
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

  const port = await freePort();
  const server = spawn(
    process.execPath,
    [API, 'serve', '--port', String(port), '--host', '127.0.0.1', '--web', WEB],
    { env, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  const output: string[] = [];
  server.stdout.on('data', (chunk: Buffer) => output.push(chunk.toString()));
  server.stderr.on('data', (chunk: Buffer) => output.push(chunk.toString()));
  const base = `http://127.0.0.1:${String(port)}`;
  const deadline = Date.now() + 30_000;
  for (;;) {
    try {
      if ((await fetch(`${base}/v1/health`)).ok) break;
    } catch {
      // not listening yet
    }
    if (server.exitCode !== null || Date.now() > deadline) {
      server.kill();
      throw new Error(`the server did not start:\n${output.join('')}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  return {
    base,
    checkpointId,
    kioskToken,
    displayToken,
    calendarDay,
    cli,
    stop: async () => {
      const exited = new Promise((resolve) => server.once('exit', resolve));
      server.kill('SIGTERM');
      await exited;
      const dropper = new pg.Client({ connectionString: serverUrl });
      await dropper.connect();
      await dropper.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
      await dropper.end();
    },
  };
}
