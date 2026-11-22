import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, isAbsolute, join } from 'node:path';
import { createHash } from 'node:crypto';
import { parseArgs } from 'node:util';
import { and, desc, eq } from 'drizzle-orm';
import type { Policy } from '@gateflow/queue-core';
import { parseScenarioText } from '@gateflow/sim-scenarios';
import type { Scenario } from '@gateflow/sim-scenarios';
import { expectedCallNumbers, twinDay } from '@gateflow/twin';
import { buildApp } from './app';
import { connect, runMigrations } from './db/client';
import { addDevice, revokeDevice } from './devices';
import { airport, policyVersion } from './db/schema';
import { Runtime } from './runtime';
import { addStaff, disableStaff, resetPassword } from './staff';
import { randomIds } from './ids';
import { seedDemo } from './seed';
import { systemClock } from './time';
import { TWIN_PREFIX, TwinRunner, liveCallNumbers } from './twin';
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
  gateflow-api serve [--port 8080] [--host 127.0.0.1] [--web <dir>] [--twin <dir>]
                                             Serve the API (OpenAPI at /v1/openapi.json) and
                                             the web application (kiosk, ticket page); with
                                             --twin, the digital twin of the scenarios in <dir>
                                             for the demo page (synthetic airports only)
  gateflow-api twin --scenario <file> [--seed 1] [--policy priority-v3|virtual-fifo]
                    [--speed <x>] [--until HH:MM] [--day YYYY-MM-DD]
                                             The digital twin: plays the scenario's simulated
                                             day to a new twin checkpoint, as fast as it goes
                                             (or <x> times real time), checks every call
                                             against the simulator's and prints the verdict
                                             (exit code 1 if the order differs)
`;

/** The built web application next to the API, when there is one. */
function defaultWebRoot(): string | undefined {
  const dir = fileURLToPath(new URL('../../web/dist/', import.meta.url));
  return existsSync(`${dir}index.html`) ? dir : undefined;
}

/** A scenario file, with the files it includes (its airport, its flights). */
function readScenario(file: string): Scenario {
  return parseScenarioText(readFileSync(file, 'utf8'), file.endsWith('.json') ? 'json' : 'yaml', {
    read: (path) => readFileSync(isAbsolute(path) ? path : join(dirname(file), path), 'utf8'),
    sha256: (content) => createHash('sha256').update(content).digest('hex'),
  });
}

/** Every scenario of a folder (its `.yaml` and `.json` files): the twin's library. */
function readLibrary(dir: string): Scenario[] {
  return readdirSync(dir)
    .filter((name) => /\.(ya?ml|json)$/.test(name))
    .sort()
    .map((name) => readScenario(join(dir, name)));
}

/** `HH:MM` as milliseconds since midnight. */
function timeOfDay(text: string): number {
  const match = /^([01][0-9]|2[0-3]):([0-5][0-9])$/.exec(text);
  if (match === null) throw new Error(`--until is a time of day HH:MM, not ${text}`);
  return (Number(match[1]) * 60 + Number(match[2])) * 60_000;
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
      const scenario = readScenario(values.scenario);
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
                : kind === 'DISPLAY'
                  ? [`open the display at /display/${values.checkpoint}#device=${added.token}`]
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
          twin: { type: 'string' },
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
        ...(values.twin === undefined ? {} : { twin: { library: readLibrary(values.twin) } }),
      });
      const stop = () => {
        void app.close().then(() => database.close());
      };
      process.on('SIGINT', stop);
      process.on('SIGTERM', stop);
      await app.listen({ port: Number(values.port), host: values.host });
      return -1;
    }
    case 'twin':
      return twin(rest);
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

/**
 * `gateflow-api twin`: plays a scenario's day to a new twin checkpoint of its airport (seeded if it
 * is not there yet) and prints whether the live system called the simulator's numbers, in order.
 */
async function twin(args: string[]): Promise<number> {
  const { values } = parseArgs({
    args,
    options: {
      scenario: { type: 'string' },
      seed: { type: 'string', default: '1' },
      policy: { type: 'string', default: 'priority-v3' },
      speed: { type: 'string' },
      until: { type: 'string' },
      day: { type: 'string' },
    },
    strict: true,
  });
  if (values.scenario === undefined) throw new Error('--scenario is required');
  const scenario = readScenario(values.scenario);
  const seed = Number(values.seed);
  if (!Number.isSafeInteger(seed) || seed < 1) throw new Error('--seed is a whole number from 1');
  const speed = values.speed === undefined || values.speed === 'max' ? null : Number(values.speed);
  if (speed !== null && (!Number.isSafeInteger(speed) || speed < 1 || speed > 10_000)) {
    throw new Error('--speed is a whole number from 1 to 10000, or max');
  }
  const untilMs = values.until === undefined ? undefined : timeOfDay(values.until);
  const database = connect(databaseUrl(), { maxConnections: 4 });
  try {
    await runMigrations(database.db);
    const db = database.db;
    const ids = randomIds(systemClock);
    // The scenario's airport, with its policies: added if it is not there yet.
    const seeded = await seedDemo(db, scenario, { now: systemClock.now(), ids });
    const [place] = await db.select().from(airport).where(eq(airport.id, seeded.airportId));
    if (place === undefined) throw new Error('the airport could not be found');
    if (place.dataClassification !== 'SYNTHETIC') {
      throw new Error('the digital twin plays only at an airport whose data are synthetic');
    }
    const [version] = await db
      .select()
      .from(policyVersion)
      .where(and(eq(policyVersion.airportId, place.id), eq(policyVersion.policyId, values.policy)))
      .orderBy(desc(policyVersion.createdAtMs))
      .limit(1);
    if (version === undefined) throw new Error(`no policy ${values.policy} at ${place.code}`);
    const policy = version.content as Policy;
    const runner = new TwinRunner(db, new Runtime(db, systemClock), ids, systemClock, (error) => {
      process.stderr.write(`error: ${error instanceof Error ? error.message : String(error)}\n`);
    });
    const runId = await runner.start({
      airportId: place.id,
      timeZone: place.timeZone,
      scenario,
      seed,
      policy,
      speed,
      ...(untilMs === undefined ? {} : { untilMs }),
      ...(values.day === undefined ? {} : { serviceDay: values.day }),
      createdBy: 'cli',
    });
    const interrupt = () => {
      void runner.stop(runId);
    };
    process.once('SIGINT', interrupt);
    const started = await runner.view(runId);
    if (started === null) throw new Error('the run could not be found');
    process.stdout.write(
      [
        `twin ${runId}: ${started.checkpoint} (checkpoint ${started.checkpointId})`,
        `virtual day ${started.serviceDay}, ${String(started.steps)} operations, ${String(started.expectedCalls)} calls, speed ${speed === null ? 'max' : `${String(speed)}x`}`,
        '',
      ].join('\n'),
    );
    const progress = setInterval(() => {
      void runner.view(runId).then((run) => {
        if (run === null) return;
        process.stdout.write(
          `  ${run.virtualNow.slice(11, 16)} virtual: ${String(run.applied)}/${String(run.steps)} operations, ${String(run.matchedCalls)}/${String(run.expectedCalls)} calls in order\n`,
        );
      });
    }, 2_000);
    await runner.wait(runId);
    clearInterval(progress);
    process.removeListener('SIGINT', interrupt);
    const run = await runner.view(runId);
    if (run === null) throw new Error('the run could not be found');
    // Over the whole day, independently of the checks of each call: the numbers the live system
    // called, in order, against those the simulator's day gives.
    const expected = expectedCallNumbers(twinDay(scenario, seed, policy), TWIN_PREFIX, untilMs);
    const live = await liveCallNumbers(db, run.checkpointId);
    const same =
      run.state === 'FINISHED' &&
      live.length === expected.length &&
      live.every((number, i) => number === expected[i]);
    if (same) {
      process.stdout.write(
        `SAME ORDER: the live system called ${String(live.length)} numbers in the simulator's order (SIMULATED data)\n`,
      );
      return 0;
    }
    const first = live.findIndex((number, i) => number !== expected[i]);
    process.stdout.write(
      [
        `NOT THE SAME: run ${run.state}, ${String(live.length)} calls of ${String(expected.length)}`,
        ...(run.divergence === null
          ? []
          : [
              `first difference at ${run.divergence.at}: ${run.divergence.operation}, expected ${run.divergence.expected}, got ${run.divergence.actual}`,
            ]),
        ...(first < 0
          ? []
          : [
              `call ${String(first + 1)}: expected ${String(expected[first])}, got ${String(live[first])}`,
            ]),
        ...(run.error === null ? [] : [`error: ${run.error}`]),
        '',
      ].join('\n'),
    );
    return 1;
  } finally {
    await database.close();
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
