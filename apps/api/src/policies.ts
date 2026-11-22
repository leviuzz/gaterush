import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { validateLivePolicy } from '@gateflow/operations';
import type { Command } from '@gateflow/operations';
import type { Policy } from '@gateflow/queue-core';
import { arrivalClassification } from '@gateflow/sim-metrics';
import { canonicalJson } from '@gateflow/sim-scenarios';
import { sha256 } from './chain';
import type { Db } from './db/client';
import { policyActivation, policyVersion, queueCommand, staffUser } from './db/schema';
import type { Ids } from './ids';
import { ApiError, policyForDay } from './runtime';
import type { CheckpointRow } from './runtime';
import { serviceDayOf } from './time';

/*
 * Versioned policies (S17, ADR-050). A version is immutable and named by the SHA-256 of its
 * canonical JSON: the same content is the same version. An administrator activates a version for
 * a checkpoint from the next service day: the day under way keeps the policy it opened with, as
 * its log records. FIFO_ONLY is the fallback at hand meanwhile (ADR-048).
 */

/** The name of a policy's content: the SHA-256 of its canonical JSON. */
export function policyHash(policy: unknown): string {
  return sha256(canonicalJson(policy));
}

/** The calendar date after `day` (`YYYY-MM-DD`). */
export function dayAfter(day: string): string {
  const [year = 1970, month = 1, date = 1] = day.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, date + 1)).toISOString().slice(0, 10);
}

/** What the console shows of a policy. */
export interface PolicySummary {
  readonly policyId: string;
  readonly version: string;
  readonly title: string;
  readonly hash: string;
}

function summaryOf(policy: Policy): PolicySummary {
  return {
    policyId: policy.id,
    version: policy.version,
    title: policy.title,
    hash: policyHash(policy),
  };
}

/** Who did something, as people read it: a member's login, or the product itself. */
async function namesOf(db: Db, actors: readonly string[]): Promise<Map<string, string>> {
  const ids = actors.flatMap((a) => (a.startsWith('staff:') ? [a.slice('staff:'.length)] : []));
  const names = new Map<string, string>();
  if (ids.length > 0) {
    const rows = await db
      .select({ id: staffUser.id, login: staffUser.login })
      .from(staffUser)
      .where(inArray(staffUser.id, ids));
    for (const row of rows) names.set(`staff:${row.id}`, row.login);
  }
  return names;
}

/**
 * Publishes a version of a policy for an airport: checked as a live checkpoint would run it, then
 * kept once. Publishing the same content again gives the version already there.
 */
export async function publishPolicy(
  db: Db,
  airportId: string,
  policy: Policy,
  by: string,
  ids: Ids,
  nowMs: number,
): Promise<{ readonly id: string; readonly created: boolean }> {
  validateLivePolicy(policy);
  try {
    arrivalClassification([policy]);
  } catch (error) {
    throw new ApiError(400, 'INVALID_POLICY', (error as Error).message);
  }
  const hash = policyHash(policy);
  const inserted = await db
    .insert(policyVersion)
    .values({
      id: ids.uuid(),
      airportId,
      hash,
      policyId: policy.id,
      version: policy.version,
      title: policy.title,
      content: policy,
      createdAtMs: nowMs,
      createdBy: by,
    })
    .onConflictDoNothing()
    .returning({ id: policyVersion.id });
  const created = inserted[0];
  if (created !== undefined) return { id: created.id, created: true };
  const [existing] = await db
    .select({ id: policyVersion.id })
    .from(policyVersion)
    .where(and(eq(policyVersion.airportId, airportId), eq(policyVersion.hash, hash)));
  if (existing === undefined) throw new Error('a policy version was neither added nor found');
  return { id: existing.id, created: false };
}

/**
 * Activates a version for a checkpoint from the next service day that has not started, under the
 * checkpoint's lock: the opening of a day reads the activations under the same lock, so a day
 * never opens with one policy while an activation says another.
 */
export async function activatePolicy(
  db: Db,
  cp: CheckpointRow,
  versionId: string,
  by: string,
  ids: Ids,
  nowMs: number,
): Promise<{ readonly fromServiceDay: string; readonly policy: PolicySummary }> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${cp.lockKey})`);
    const [version] = await tx
      .select()
      .from(policyVersion)
      .where(and(eq(policyVersion.id, versionId), eq(policyVersion.airportId, cp.airportId)));
    if (version === undefined) {
      throw new ApiError(404, 'UNKNOWN_POLICY', 'no such policy version at this airport');
    }
    let from = dayAfter(serviceDayOf(nowMs, cp.timeZone, cp.dayStartsAt));
    // A day already opened keeps the policy it opened with.
    const [head] = await tx
      .select({ serviceDay: queueCommand.serviceDay })
      .from(queueCommand)
      .where(eq(queueCommand.checkpointId, cp.id))
      .orderBy(desc(queueCommand.seq))
      .limit(1);
    if (head !== undefined && head.serviceDay >= from) from = dayAfter(head.serviceDay);
    await tx.insert(policyActivation).values({
      id: ids.uuid(),
      checkpointId: cp.id,
      policyVersionId: version.id,
      fromServiceDay: from,
      activatedAtMs: nowMs,
      activatedBy: by,
    });
    return { fromServiceDay: from, policy: summaryOf(version.content as Policy) };
  });
}

/**
 * The policies of a checkpoint, for its console: today's (as its day opened, or as it will open),
 * tomorrow's, the versions of the airport and the latest activations.
 */
export async function policyStatus(db: Db, cp: CheckpointRow, nowMs: number) {
  const today = serviceDayOf(nowMs, cp.timeZone, cp.dayStartsAt);
  const tomorrow = dayAfter(today);
  const [opened] = await db
    .select({ command: queueCommand.command })
    .from(queueCommand)
    .where(
      and(
        eq(queueCommand.checkpointId, cp.id),
        eq(queueCommand.serviceDay, today),
        eq(queueCommand.type, 'OPEN_DAY'),
      ),
    )
    .limit(1);
  const command = opened?.command as Command | undefined;
  const current =
    command?.type === 'OPEN_DAY' ? command.config.policy : await policyForDay(db, cp, today);
  const next = await policyForDay(db, cp, tomorrow);
  const versions = await db
    .select()
    .from(policyVersion)
    .where(eq(policyVersion.airportId, cp.airportId))
    .orderBy(desc(policyVersion.createdAtMs));
  const activations = await db
    .select()
    .from(policyActivation)
    .where(eq(policyActivation.checkpointId, cp.id))
    .orderBy(desc(policyActivation.seq))
    .limit(20);
  const names = await namesOf(db, [
    ...versions.map((v) => v.createdBy),
    ...activations.map((a) => a.activatedBy),
  ]);
  const nameOf = (actor: string) => names.get(actor) ?? (actor === 'system' ? 'GateFlow' : actor);
  const byId = new Map(versions.map((v) => [v.id, v]));
  return {
    checkpointId: cp.id,
    today: { serviceDay: today, policy: summaryOf(current) },
    next: { serviceDay: tomorrow, policy: summaryOf(next) },
    versions: versions.map((v) => ({
      id: v.id,
      policyId: v.policyId,
      version: v.version,
      title: v.title,
      hash: v.hash,
      createdAt: new Date(v.createdAtMs).toISOString(),
      createdBy: nameOf(v.createdBy),
    })),
    activations: activations.map((a) => ({
      versionId: a.policyVersionId,
      hash: byId.get(a.policyVersionId)?.hash ?? '',
      fromServiceDay: a.fromServiceDay,
      activatedAt: new Date(a.activatedAtMs).toISOString(),
      activatedBy: nameOf(a.activatedBy),
    })),
  };
}
