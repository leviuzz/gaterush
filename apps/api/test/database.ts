import { randomBytes } from 'node:crypto';
import pg from 'pg';
import { inject } from 'vitest';
import { connect, runMigrations } from '../src/db/client';
import type { Database } from '../src/db/client';

/** A new, migrated database on the test server, for one test file. */
export async function freshDatabase(
  options: { maxConnections?: number } = {},
): Promise<Database & { readonly url: string; readonly admin: pg.Client }> {
  const base = inject('databaseUrl');
  const name = `gateflow_test_${randomBytes(6).toString('hex')}`;
  const admin = new pg.Client({ connectionString: base });
  await admin.connect();
  await admin.query(`CREATE DATABASE ${name}`);
  const url = new URL(base);
  url.pathname = `/${name}`;
  const database = connect(url.toString(), options);
  await runMigrations(database.db);
  // A connection to the test database with every right, to tamper with it as an attacker would.
  const superuser = new pg.Client({ connectionString: url.toString() });
  await superuser.connect();
  await admin.end();
  return {
    ...database,
    url: url.toString(),
    admin: superuser,
    close: async () => {
      await superuser.end();
      await database.close();
    },
  };
}
