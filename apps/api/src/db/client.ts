import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/node-postgres';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';
import * as schema from './schema';

export type Db = NodePgDatabase<typeof schema>;
/** A transaction of `Db`. */
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

export interface Database {
  readonly db: Db;
  readonly pool: pg.Pool;
  close(): Promise<void>;
}

/** Connects to PostgreSQL: a pool of connections and the typed query builder. */
export function connect(url: string, options: { readonly maxConnections?: number } = {}): Database {
  const pool = new pg.Pool({ connectionString: url, max: options.maxConnections ?? 10 });
  // A connection that fails while idle must not crash the process: the pool replaces it.
  pool.on('error', () => undefined);
  return {
    db: drizzle(pool, { schema }),
    pool,
    close: () => pool.end(),
  };
}

/** The migrations folder, next to the sources or next to the bundle. */
export function migrationsFolder(): string {
  for (const candidate of ['../../migrations/', '../migrations/']) {
    const path = fileURLToPath(new URL(candidate, import.meta.url));
    if (existsSync(`${path}meta/_journal.json`)) return path;
  }
  throw new Error('the migrations folder was not found next to the API');
}

/** Brings the database to the latest schema (each migration once, in order). */
export async function runMigrations(db: Db): Promise<void> {
  await migrate(db, { migrationsFolder: migrationsFolder() });
}
