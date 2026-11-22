import { readFileSync } from 'node:fs';
import { dirname, isAbsolute, join } from 'node:path';
import { createHash } from 'node:crypto';
import { parseArgs } from 'node:util';
import { parseScenarioText } from '@gateflow/sim-scenarios';
import { buildApp } from './app';
import { connect, runMigrations } from './db/client';
import { randomIds } from './ids';
import { seedDemo } from './seed';
import { systemClock } from './time';
import { API_VERSION } from './version';

const HELP = `gateflow-api ${API_VERSION}: the GateFlow API on PostgreSQL

Usage (DATABASE_URL names the database):
  gateflow-api migrate                       Bring the database to the latest schema
  gateflow-api seed --scenario <file>        Demo data: the scenario's airport, checkpoint and
                    [--day YYYY-MM-DD]       flights of today's service day (or --day)
  gateflow-api serve [--port 8080] [--host 127.0.0.1]
                                             Serve the API (OpenAPI at /v1/openapi.json)
`;

function databaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (url === undefined || url === '')
    throw new Error('set DATABASE_URL to the PostgreSQL database');
  return url;
}

async function main(argv: string[]): Promise<number> {
  const [command, ...rest] = argv;
  switch (command) {
    case 'migrate': {
      const database = connect(databaseUrl(), { maxConnections: 1 });
      await runMigrations(database.db);
      await database.close();
      process.stdout.write('database migrated\n');
      return 0;
    }
    case 'seed': {
      const { values } = parseArgs({
        args: rest,
        options: { scenario: { type: 'string' }, day: { type: 'string' } },
        strict: true,
      });
      if (values.scenario === undefined) throw new Error('--scenario is required');
      const file = values.scenario;
      const scenario = parseScenarioText(
        readFileSync(file, 'utf8'),
        file.endsWith('.json') ? 'json' : 'yaml',
        {
          read: (path) => readFileSync(isAbsolute(path) ? path : join(dirname(file), path), 'utf8'),
          sha256: (content) => createHash('sha256').update(content).digest('hex'),
        },
      );
      const database = connect(databaseUrl(), { maxConnections: 1 });
      await runMigrations(database.db);
      const seeded = await seedDemo(database.db, scenario, {
        now: systemClock.now(),
        ids: randomIds(systemClock),
        ...(values.day === undefined ? {} : { serviceDay: values.day }),
      });
      await database.close();
      process.stdout.write(
        `seeded ${scenario.id}: checkpoint ${seeded.checkpointId}, ${seeded.flights} flights on ${seeded.serviceDay}\n`,
      );
      return 0;
    }
    case 'serve': {
      const { values } = parseArgs({
        args: rest,
        options: {
          port: { type: 'string', default: '8080' },
          host: { type: 'string', default: '127.0.0.1' },
        },
        strict: true,
      });
      const database = connect(databaseUrl());
      await runMigrations(database.db);
      const app = buildApp({ db: database.db, logger: true });
      const stop = () => {
        void app.close().then(() => database.close());
      };
      process.on('SIGINT', stop);
      process.on('SIGTERM', stop);
      await app.listen({ port: Number(values.port), host: values.host });
      return -1;
    }
    case undefined:
    case '--help':
    case 'help':
      process.stdout.write(HELP);
      return command === undefined ? 2 : 0;
    case '--version':
      process.stdout.write(`${API_VERSION}\n`);
      return 0;
    default:
      process.stderr.write(`unknown command "${command}"\n\n${HELP}`);
      return 2;
  }
}

main(process.argv.slice(2)).then(
  (code) => {
    if (code >= 0) process.exitCode = code;
  },
  (error: unknown) => {
    process.stderr.write(`error: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  },
);
