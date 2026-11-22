import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { freshDatabase } from './database';

let database: Awaited<ReturnType<typeof freshDatabase>>;

beforeAll(async () => {
  database = await freshDatabase();
});

afterAll(async () => {
  await database.close();
});

const ORG = '00000000-0000-7000-8000-000000000001';
const AIRPORT = '00000000-0000-7000-8000-000000000002';
const CHECKPOINT = '00000000-0000-7000-8000-000000000003';

async function sql(text: string, values: unknown[] = []) {
  return database.admin.query(text, values);
}

describe('the operational schema', () => {
  it('migrates, and keeps the log append-only', async () => {
    await sql(`INSERT INTO organization (id, name, country) VALUES ($1, 'Test', 'IT')`, [ORG]);
    await sql(
      `INSERT INTO airport (id, org_id, code, name, time_zone, data_classification)
       VALUES ($1, $2, 'tst', 'Test airport', 'Europe/Rome', 'SYNTHETIC')`,
      [AIRPORT, ORG],
    );
    await sql(
      `INSERT INTO checkpoint (id, airport_id, code, name, ticket_prefix, settings)
       VALUES ($1, $2, 'main', 'Main', 'A', '{}')`,
      [CHECKPOINT, AIRPORT],
    );
    const row = await sql(`SELECT lock_key FROM checkpoint WHERE id = $1`, [CHECKPOINT]);
    expect(Number(row.rows[0].lock_key)).toBeGreaterThan(0);
    const hash = 'a'.repeat(64);
    await sql(
      `INSERT INTO queue_command (checkpoint_id, seq, service_day, type, at_ms, command, result,
         idempotency_key, request_hash, actor, prev_hash, hash)
       VALUES ($1, 1, '2026-11-23', 'OPEN_DAY', 0, '{}', '{}', 'k1', 'r', 'system', $2, $2)`,
      [CHECKPOINT, hash],
    );
    await expect(sql(`UPDATE queue_command SET actor = 'x'`)).rejects.toThrow(/append-only/);
    await expect(sql(`DELETE FROM queue_command`)).rejects.toThrow(/append-only/);
    await expect(sql(`TRUNCATE queue_command CASCADE`)).rejects.toThrow(/append-only/);
    // The same idempotency key twice, and a hash that is not one, are refused.
    await expect(
      sql(
        `INSERT INTO queue_command (checkpoint_id, seq, service_day, type, at_ms, command, result,
           idempotency_key, request_hash, actor, prev_hash, hash)
         VALUES ($1, 2, '2026-11-23', 'CALL_NEXT', 0, '{}', '{}', 'k1', 'r', 'system', $2, $2)`,
        [CHECKPOINT, hash],
      ),
    ).rejects.toThrow(/queue_command_idempotency/);
    await expect(
      sql(
        `INSERT INTO queue_command (checkpoint_id, seq, service_day, type, at_ms, command, result,
           idempotency_key, request_hash, actor, prev_hash, hash)
         VALUES ($1, 2, '2026-11-23', 'CALL_NEXT', 0, '{}', '{}', 'k2', 'r', 'system', $2, 'x')`,
        [CHECKPOINT, hash],
      ),
    ).rejects.toThrow(/queue_command_hash/);
  });

  it('keeps the versions of policies and their activations as they were written (S17)', async () => {
    const version = '0193a0b2-7c1d-7e5f-8a9b-0c1d2e3f4a5c';
    const hash = 'b'.repeat(64);
    await sql(
      `INSERT INTO policy_version (id, airport_id, hash, policy_id, version, title, content,
         created_at_ms, created_by)
       VALUES ($1, $2, $3, 'p', '1', 'P', '{}', 0, 'system')`,
      [version, AIRPORT, hash],
    );
    // The same content twice at an airport is one version; a hash must be one.
    await expect(
      sql(
        `INSERT INTO policy_version (id, airport_id, hash, policy_id, version, title, content,
           created_at_ms, created_by)
         VALUES ('0193a0b2-7c1d-7e5f-8a9b-0c1d2e3f4a5d', $1, $2, 'p', '1', 'P', '{}', 0, 'system')`,
        [AIRPORT, hash],
      ),
    ).rejects.toThrow(/policy_version_hash/);
    await sql(
      `INSERT INTO policy_activation (id, checkpoint_id, policy_version_id, from_service_day,
         activated_at_ms, activated_by)
       VALUES ('0193a0b2-7c1d-7e5f-8a9b-0c1d2e3f4a5e', $1, $2, '2026-11-24', 0, 'system')`,
      [CHECKPOINT, version],
    );
    for (const table of ['policy_version', 'policy_activation']) {
      await expect(sql(`UPDATE ${table} SET id = id`)).rejects.toThrow(/append-only/);
      await expect(sql(`DELETE FROM ${table}`)).rejects.toThrow(/append-only/);
      await expect(sql(`TRUNCATE ${table} CASCADE`)).rejects.toThrow(/append-only/);
    }
  });

  it('checks the values of flights and tickets', async () => {
    await expect(
      sql(
        `INSERT INTO flight (id, airport_id, service_date, number, std_ms, boarding_close_ms,
           deadline_source, gate_zone, walk_estimate_ms, environment)
         VALUES (gen_random_uuid(), $1, '2026-11-23', 'X1', 0, NULL, 'FEED', 'A', 0, 'DEMO')`,
        [AIRPORT],
      ),
    ).rejects.toThrow(/flight_deadline_known/);
    await expect(
      sql(
        `INSERT INTO flight (id, airport_id, service_date, number, std_ms, boarding_close_ms,
           deadline_source, gate_zone, walk_estimate_ms, environment)
         VALUES (gen_random_uuid(), $1, '2026-11-23', 'X2', 0, 10, 'FEED', 'A', 0, 'PROD')`,
        [AIRPORT],
      ),
    ).rejects.toThrow(/flight_environment/);
    await expect(
      sql(
        `INSERT INTO checkpoint (id, airport_id, code, name, ticket_prefix, settings)
         VALUES (gen_random_uuid(), $1, 'b', 'B', 'a1', '{}')`,
        [AIRPORT],
      ),
    ).rejects.toThrow(/checkpoint_ticket_prefix/);
  });
});
