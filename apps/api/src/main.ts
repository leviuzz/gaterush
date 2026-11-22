import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, isAbsolute, join } from 'node:path';
import { createHash } from 'node:crypto';
import { parseArgs } from 'node:util';
import { eq } from 'drizzle-orm';
import { parseScenarioText } from '@gateflow/sim-scenarios';
import { buildApp } from './app';
import { connect, runMigrations } from './db/client';
import { addDevice, revokeDevice } from './devices';
import { airport } from './db/schema';
import { addStaff, disableStaff, resetPassword } from './staff';
import { randomIds } from './ids';
import { seedDemo } from './seed';
import { systemClock } from './time';
import { API_VERSION } from './version';

const HELP = `gateflow-api ${API_VERSION}: the GateFlow API on PostgreSQL

Usage (DATABASE_URL names the database):
  gateflow-api migrate                       Bring the database to the latest schema
  gateflow-api seed --scenario <file>        Demo data: the scenario's airport, checkpoint and
                    [--day YYYY-MM-DD]       flights of today's service day (or --day)
  gateflow-api device add --checkpoint <id> --kind kiosk|display|lane --name <name>
                                             Add a device; prints its token once
  gateflow-api device revoke --id <id>       Revoke a device: its token stops working
  gateflow-api user add --airport <code> --login <login> --role operator|supervisor|admin
                    [--checkpoint <id>]...   Add a member of staff (every checkpoint of the
                                             airport, or those given); prints a password once
  gateflow-api user password --login <login> A new password, printed once; sessions end
  gateflow-api user disable --login <login>  Disable a member of staff: sessions end at once
  gateflow-api serve [--port 8080] [--host 127.0.0.1] [--web <dir>]
                                             Serve the API (OpenAPI at /v1/openapi.json) and
                                             the web application (kiosk, ticket page)
`;

/** The built web application next to the API, when there is one. */
function defaultWebRoot(): string | undefined {
  const dir = fileURLToPath(new URL('../../web/dist/', import.meta.url));
  return existsSync(`${dir}index.html`) ? dir : undefined;
}

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
    case 'device': {
      const [action, ...args] = rest;
      const { values } = parseArgs({
        args,
        options: {
          checkpoint: { type: 'string' },
          kind: { type: 'string' },
          name: { type: 'string' },
          id: { type: 'string' },
        },
        strict: true,
      });
      const database = connect(databaseUrl(), { maxConnections: 1 });
      try {
        if (action === 'add') {
          const kind = values.kind?.toUpperCase();
          if (values.checkpoint === undefined || values.name === undefined) {
            throw new Error('--checkpoint and --name are required');
          }
          if (kind !== 'KIOSK' && kind !== 'DISPLAY' && kind !== 'LANE') {
            throw new Error('--kind is kiosk, display or lane');
          }
          const added = await addDevice(database.db, randomIds(systemClock), {
            checkpointId: values.checkpoint,
            kind,
            name: values.name,
          });
          process.stdout.write(
            [
              `added ${kind.toLowerCase()} ${added.device.id} (${added.device.name})`,
              `token ${added.token}`,
              ...(kind === 'KIOSK'
                ? [`open the kiosk at /kiosk/${values.checkpoint}#device=${added.token}`]
                : []),
              'The token is shown once: keep it on the device only.',
              '',
            ].join('\n'),
          );
          return 0;
        }
        if (action === 'revoke') {
          if (values.id === undefined) throw new Error('--id is required');
          const revoked = await revokeDevice(database.db, values.id);
          process.stdout.write(
            revoked ? `revoked ${values.id}\n` : `no active device ${values.id}\n`,
          );
          return revoked ? 0 : 1;
        }
        throw new Error('device add or device revoke');
      } finally {
        await database.close();
      }
    }
    case 'user': {
      const [action, ...args] = rest;
      const { values } = parseArgs({
        args,
        options: {
          airport: { type: 'string' },
          login: { type: 'string' },
          role: { type: 'string' },
          checkpoint: { type: 'string', multiple: true },
        },
        strict: true,
      });
      if (values.login === undefined) throw new Error('--login is required');
      const database = connect(databaseUrl(), { maxConnections: 1 });
      try {
        if (action === 'add') {
          const role = values.role?.toUpperCase();
          if (role !== 'OPERATOR' && role !== 'SUPERVISOR' && role !== 'ADMIN') {
            throw new Error('--role is operator, supervisor or admin');
          }
          if (values.airport === undefined) throw new Error('--airport is required');
          const code = values.airport;
          const found = await database.db
            .select({ id: airport.id })
            .from(airport)
            .where(/^[0-9a-f-]{36}$/.test(code) ? eq(airport.id, code) : eq(airport.code, code));
          const airportId = found[0]?.id;
          if (airportId === undefined) throw new Error(`no airport ${code}`);
          const added = await addStaff(database.db, randomIds(systemClock), {
            airportId,
            login: values.login,
            role,
            checkpointIds: values.checkpoint ?? null,
          });
          process.stdout.write(
            [
              `added ${role.toLowerCase()} ${added.member.login} (${added.member.id})`,
              `password ${added.password}`,
              'The password is shown once: give it to the person only.',
              '',
            ].join('\n'),
          );
          return 0;
        }
        if (action === 'password') {
          const password = await resetPassword(database.db, values.login);
          if (password === null) throw new Error(`no member of staff ${values.login}`);
          process.stdout.write(`password ${password}\nThe password is shown once.\n`);
          return 0;
        }
        if (action === 'disable') {
          const disabled = await disableStaff(database.db, values.login);
          process.stdout.write(
            disabled ? `disabled ${values.login}\n` : `no active member ${values.login}\n`,
          );
          return disabled ? 0 : 1;
        }
        throw new Error('user add, user password or user disable');
      } finally {
        await database.close();
      }
    }
    case 'serve': {
      const { values } = parseArgs({
        args: rest,
        options: {
          port: { type: 'string', default: '8080' },
          host: { type: 'string', default: '127.0.0.1' },
          web: { type: 'string' },
        },
        strict: true,
      });
      const database = connect(databaseUrl());
      await runMigrations(database.db);
      const webRoot = values.web ?? defaultWebRoot();
      const app = buildApp({
        db: database.db,
        logger: true,
        timers: 'auto',
        ...(webRoot === undefined ? {} : { webRoot }),
      });
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
