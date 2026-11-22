import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  date,
  foreignKey,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

/*
 * The operational database (ADR-042). Configuration tables; the log of every checkpoint (commands
 * and the events they caused, append-only and hash-chained); the current state of tickets for
 * queries; admissions, at most one per ticket by the database's own constraint.
 *
 * Times of the domain are integer milliseconds since the epoch (`*_ms`), as in the queue: the log
 * rebuilds a day exactly. Dates and times for people are `timestamptz` and `date`.
 */

const ms = (name: string) => bigint(name, { mode: 'number' });

export const organization = pgTable('organization', {
  id: uuid('id').primaryKey(),
  name: text('name').notNull(),
  /** ISO 3166-1 alpha-2 country of the operator: it decides the data protection law. */
  country: text('country').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const airport = pgTable(
  'airport',
  {
    id: uuid('id').primaryKey(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organization.id),
    /** IATA code, or a synthetic code such as `vce-like`. */
    code: text('code').notNull(),
    name: text('name').notNull(),
    /** IANA time zone: service days and clocks shown to people follow it. */
    timeZone: text('time_zone').notNull(),
    /** `SYNTHETIC`, `AIRPORT_PROVIDED`...: what the data of the airport are. */
    dataClassification: text('data_classification').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique('airport_org_code').on(t.orgId, t.code)],
);

/** How a checkpoint runs: its policy and lanes (versioned policies come with S17). */
export interface CheckpointSettings {
  /** The policy preset, e.g. `priority-v3`, with the airport's GateFlow settings applied. */
  readonly policy: unknown;
  readonly lanesOpen: number;
  readonly ratePerLanePerHour: number;
  readonly processEstimateMs: number;
}

export const checkpoint = pgTable(
  'checkpoint',
  {
    id: uuid('id').primaryKey(),
    airportId: uuid('airport_id')
      .notNull()
      .references(() => airport.id),
    code: text('code').notNull(),
    name: text('name').notNull(),
    ticketPrefix: text('ticket_prefix').notNull(),
    /** Key of the checkpoint's advisory lock: one writer per checkpoint. */
    lockKey: bigint('lock_key', { mode: 'number' }).generatedAlwaysAsIdentity().notNull(),
    /** Local time at which a service day starts, `HH:MM` (tickets are numbered per day). */
    dayStartsAt: text('day_starts_at').notNull().default('03:00'),
    settings: jsonb('settings').$type<CheckpointSettings>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('checkpoint_airport_code').on(t.airportId, t.code),
    unique('checkpoint_lock_key').on(t.lockKey),
    check('checkpoint_ticket_prefix', sql`${t.ticketPrefix} ~ '^[A-Z]{1,3}$'`),
    check('checkpoint_day_starts_at', sql`${t.dayStartsAt} ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'`),
  ],
);

/** A departing flight of a service day, with the time boarding closes as currently known. */
export const flight = pgTable(
  'flight',
  {
    id: uuid('id').primaryKey(),
    airportId: uuid('airport_id')
      .notNull()
      .references(() => airport.id),
    serviceDate: date('service_date').notNull(),
    number: text('number').notNull(),
    stdMs: ms('std_ms').notNull(),
    /** When boarding closes, as known (null when unknown). */
    boardingCloseMs: ms('boarding_close_ms'),
    /** `FEED`, `RULE` or `NONE`: where the closing time comes from. */
    deadlineSource: text('deadline_source').notNull(),
    /** When the source last confirmed it (null: a live source confirming it continuously). */
    observedAtMs: ms('observed_at_ms'),
    gateZone: text('gate_zone').notNull(),
    walkEstimateMs: integer('walk_estimate_ms').notNull(),
    /** `LIVE`, `SIMULATED` or `DEMO`. */
    environment: text('environment').notNull(),
  },
  (t) => [
    unique('flight_airport_date_number').on(t.airportId, t.serviceDate, t.number),
    check('flight_deadline_source', sql`${t.deadlineSource} IN ('FEED', 'RULE', 'NONE')`),
    check(
      'flight_deadline_known',
      sql`(${t.deadlineSource} = 'NONE') = (${t.boardingCloseMs} IS NULL)`,
    ),
    check('flight_environment', sql`${t.environment} IN ('LIVE', 'SIMULATED', 'DEMO')`),
    check('flight_walk', sql`${t.walkEstimateMs} >= 0`),
  ],
);

/**
 * Every command applied to a checkpoint, in order, with what it did. Append-only. Each row is
 * chained to the previous one of the checkpoint by a hash over the command and its events.
 */
export const queueCommand = pgTable(
  'queue_command',
  {
    checkpointId: uuid('checkpoint_id')
      .notNull()
      .references(() => checkpoint.id),
    seq: bigint('seq', { mode: 'number' }).notNull(),
    serviceDay: date('service_day').notNull(),
    type: text('type').notNull(),
    atMs: ms('at_ms').notNull(),
    command: jsonb('command').notNull(),
    result: jsonb('result').notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    /** Hash of the request that caused the command: a key reused for another request is refused. */
    requestHash: text('request_hash').notNull(),
    actor: text('actor').notNull(),
    prevHash: text('prev_hash').notNull(),
    hash: text('hash').notNull(),
    recordedAt: timestamp('recorded_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ name: 'queue_command_pkey', columns: [t.checkpointId, t.seq] }),
    unique('queue_command_idempotency').on(t.checkpointId, t.idempotencyKey),
    check('queue_command_seq', sql`${t.seq} >= 1`),
    check('queue_command_hash', sql`${t.hash} ~ '^[0-9a-f]{64}$'`),
  ],
);

/** The events each command caused, numbered per checkpoint. Append-only. */
export const queueEvent = pgTable(
  'queue_event',
  {
    checkpointId: uuid('checkpoint_id').notNull(),
    seq: bigint('seq', { mode: 'number' }).notNull(),
    commandSeq: bigint('command_seq', { mode: 'number' }).notNull(),
    type: text('type').notNull(),
    atMs: ms('at_ms').notNull(),
    ticketId: uuid('ticket_id'),
    payload: jsonb('payload').notNull(),
  },
  (t) => [
    primaryKey({ name: 'queue_event_pkey', columns: [t.checkpointId, t.seq] }),
    foreignKey({
      name: 'queue_event_command',
      columns: [t.checkpointId, t.commandSeq],
      foreignColumns: [queueCommand.checkpointId, queueCommand.seq],
    }),
  ],
);

/** The current state of every ticket, for queries. Written with the log, in the same transaction. */
export const queueToken = pgTable(
  'queue_token',
  {
    id: uuid('id').primaryKey(),
    checkpointId: uuid('checkpoint_id')
      .notNull()
      .references(() => checkpoint.id),
    serviceDay: date('service_day').notNull(),
    number: text('number').notNull(),
    /** 128 random bits: the passenger's page and QR code. Identifies nobody. */
    opaqueRef: text('opaque_ref').notNull(),
    source: text('source').notNull(),
    flightId: uuid('flight_id')
      .notNull()
      .references(() => flight.id),
    segment: text('segment').notNull(),
    partySize: integer('party_size').notNull(),
    state: text('state').notNull(),
    riskClass: text('risk_class').notNull(),
    priority: boolean('priority').notNull(),
    calls: integer('calls').notNull(),
    issuedAtMs: ms('issued_at_ms').notNull(),
    firstCalledAtMs: ms('first_called_at_ms'),
    admittedAtMs: ms('admitted_at_ms'),
    /** The command that last changed the ticket. */
    updatedSeq: bigint('updated_seq', { mode: 'number' }).notNull(),
  },
  (t) => [
    unique('queue_token_number').on(t.checkpointId, t.serviceDay, t.number),
    unique('queue_token_opaque_ref').on(t.opaqueRef),
    check('queue_token_party_size', sql`${t.partySize} BETWEEN 1 AND 20`),
    check('queue_token_segment', sql`${t.segment} IN ('DEPARTING', 'TRANSFER')`),
    check('queue_token_source', sql`${t.source} IN ('STAFF', 'KIOSK')`),
    check(
      'queue_token_state',
      sql`${t.state} IN ('QUEUED', 'PREPARE', 'CALLED', 'RECALLED', 'NO_SHOW', 'ADMITTED', 'EXPIRED')`,
    ),
  ],
);

/** Admissions at the access point. The primary key makes a second admission impossible. */
export const admission = pgTable(
  'admission',
  {
    tokenId: uuid('token_id')
      .primaryKey()
      .references(() => queueToken.id),
    checkpointId: uuid('checkpoint_id').notNull(),
    atMs: ms('at_ms').notNull(),
    /** How the ticket was identified: `NUMBER` or `REF`. */
    method: text('method').notNull(),
    commandSeq: bigint('command_seq', { mode: 'number' }).notNull(),
  },
  (t) => [check('admission_method', sql`${t.method} IN ('NUMBER', 'REF')`)],
);
