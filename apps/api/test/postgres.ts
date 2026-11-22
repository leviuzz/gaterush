import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { TestProject } from 'vitest/node';

/*
 * A PostgreSQL server for the tests. With DATABASE_URL set (CI: a service container), that server
 * is used. Otherwise a throwaway cluster is started from the PostgreSQL binaries of this machine
 * (PG_BIN, `pg_config --bindir`, or /usr/lib/postgresql/<version>/bin), and removed at the end.
 * Without either the tests fail: they never skip.
 */

declare module 'vitest' {
  export interface ProvidedContext {
    databaseUrl: string;
  }
}

function binaries(): string {
  const fromEnv = process.env.PG_BIN;
  if (fromEnv !== undefined && existsSync(join(fromEnv, 'initdb'))) return fromEnv;
  try {
    const dir = execFileSync('pg_config', ['--bindir'], { encoding: 'utf8' }).trim();
    if (existsSync(join(dir, 'initdb'))) return dir;
  } catch {
    // no pg_config on the PATH
  }
  const root = '/usr/lib/postgresql';
  if (existsSync(root)) {
    const versions = readdirSync(root)
      .filter((v) => /^\d+$/.test(v))
      .sort((a, b) => Number(b) - Number(a));
    for (const version of versions) {
      const dir = join(root, version, 'bin');
      if (existsSync(join(dir, 'initdb'))) return dir;
    }
  }
  throw new Error(
    'The API tests need PostgreSQL: set DATABASE_URL, or install PostgreSQL (or set PG_BIN to its bin folder).',
  );
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

export default async function setup(project: TestProject) {
  const given = process.env.DATABASE_URL;
  if (given !== undefined && given !== '') {
    project.provide('databaseUrl', given);
    return;
  }
  const bin = binaries();
  const dir = mkdtempSync(join(tmpdir(), 'gateflow-pg-'));
  const data = join(dir, 'data');
  // initdb refuses to run as root: as root, the cluster belongs to the postgres user.
  const asRoot = process.getuid?.() === 0;
  if (asRoot) execFileSync('chown', ['postgres:postgres', dir]);
  const run = (tool: string, args: string[]) =>
    asRoot
      ? execFileSync('runuser', ['-u', 'postgres', '--', join(bin, tool), ...args], {
          stdio: 'pipe',
        })
      : execFileSync(join(bin, tool), args, { stdio: 'pipe' });
  run('initdb', ['-D', data, '--auth=trust', '-U', 'postgres', '-E', 'UTF8', '--no-locale']);
  const port = await freePort();
  const options = [
    `-p ${port}`,
    `-k ${dir}`,
    '-c listen_addresses=127.0.0.1',
    '-c fsync=off',
    '-c synchronous_commit=off',
    '-c full_page_writes=off',
    '-c max_connections=300',
  ].join(' ');
  run('pg_ctl', ['-D', data, '-l', join(dir, 'server.log'), '-w', '-o', options, 'start']);
  project.provide('databaseUrl', `postgres://postgres@127.0.0.1:${port}/postgres`);
  return () => {
    try {
      run('pg_ctl', ['-D', data, '-m', 'immediate', '-w', 'stop']);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  };
}
