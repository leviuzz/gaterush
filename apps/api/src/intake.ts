import { createHmac, randomBytes } from 'node:crypto';
import { and, desc, eq } from 'drizzle-orm';
import { dedupMaterial, legForDeparture, parseBoardingPass } from '@gateflow/bcbp';
import type { BoardingPass } from '@gateflow/bcbp';
import type { Db, Tx } from './db/client';
import { dedupSecret, flight, partyPass, queueToken, scan } from './db/schema';
import type { CheckpointRow } from './runtime';
import { localDate } from './time';

/*
 * The kiosk's intake of a boarding pass (ADR-043). The pass is read in memory and only what the
 * queue needs is kept: the flight, the segment and a deduplication key, an HMAC whose secret
 * depends on the airport and the flight's date. The name, the booking reference and the seat are
 * never stored or logged.
 */

export type ScanOutcome =
  'ISSUED' | 'RETRIEVED' | 'REACTIVATED' | 'ADDED' | 'REJECTED' | 'NEEDS_ASSISTANCE';
export type ScanReason =
  | 'UNREADABLE'
  | 'WRONG_AIRPORT'
  | 'WRONG_DAY'
  | 'UNKNOWN_FLIGHT'
  | 'ALREADY_ADMITTED'
  | 'UNDER_REVIEW'
  | 'CANCELLED'
  | 'BOARDING_CLOSED'
  | 'OTHER_FLIGHT'
  | 'HAS_OWN_NUMBER'
  | 'PARTY_FULL'
  | 'TOO_LATE';

/** A boarding pass that can give a ticket at this checkpoint. */
export interface Accepted {
  readonly ok: true;
  readonly pass: BoardingPass;
  readonly flight: typeof flight.$inferSelect;
  readonly flightDate: string;
  readonly segment: 'DEPARTING' | 'TRANSFER';
  readonly dedupKey: string;
}

export type Intake =
  | Accepted
  | {
      readonly ok: false;
      readonly outcome: ScanOutcome;
      readonly reason: ScanReason;
      readonly pass: BoardingPass | null;
    };

/** The secret of an airport and flight date: created on first use, shared by every server. */
async function secretFor(db: Db | Tx, airportId: string, flightDate: string): Promise<string> {
  await db
    .insert(dedupSecret)
    .values({ airportId, flightDate, secret: randomBytes(32).toString('hex') })
    .onConflictDoNothing();
  const rows = await db
    .select({ secret: dedupSecret.secret })
    .from(dedupSecret)
    .where(and(eq(dedupSecret.airportId, airportId), eq(dedupSecret.flightDate, flightDate)));
  const secret = rows[0]?.secret;
  if (secret === undefined) throw new Error('no deduplication secret');
  return secret;
}

/** Reads a boarding pass for a checkpoint: the flight it gives a ticket for, or why not. */
export async function readPass(
  db: Db,
  cp: CheckpointRow,
  bcbp: string,
  nowMs: number,
): Promise<Intake> {
  const parsed = parseBoardingPass(bcbp);
  if (!parsed.ok) return { ok: false, outcome: 'REJECTED', reason: 'UNREADABLE', pass: null };
  const choice = legForDeparture(parsed.pass, cp.iata, localDate(nowMs, cp.timeZone));
  if (!choice.ok) {
    return { ok: false, outcome: 'REJECTED', reason: choice.reason, pass: parsed.pass };
  }
  const rows = await db
    .select()
    .from(flight)
    .where(
      and(
        eq(flight.airportId, cp.airportId),
        eq(flight.carrier, choice.leg.carrier),
        eq(flight.flightNumber, choice.leg.flightNumber),
        eq(flight.departureDate, choice.flightDate),
      ),
    );
  const f = rows[0];
  if (f === undefined) {
    return { ok: false, outcome: 'NEEDS_ASSISTANCE', reason: 'UNKNOWN_FLIGHT', pass: parsed.pass };
  }
  const secret = await secretFor(db, cp.airportId, choice.flightDate);
  const dedupKey = createHmac('sha256', Buffer.from(secret, 'hex'))
    .update(dedupMaterial(choice.leg, choice.flightDate))
    .digest('hex');
  return {
    ok: true,
    pass: parsed.pass,
    flight: f,
    flightDate: choice.flightDate,
    segment: choice.legIndex > 0 ? 'TRANSFER' : 'DEPARTING',
    dedupKey,
  };
}

/**
 * The latest ticket of a boarding pass at the checkpoint: the one it was issued, or the party it
 * joined at the kiosk (S15), whichever came last.
 */
export async function ticketOfPass(tx: Tx, checkpointId: string, dedupKey: string) {
  const own = await tx
    .select()
    .from(queueToken)
    .where(and(eq(queueToken.checkpointId, checkpointId), eq(queueToken.dedupKey, dedupKey)))
    .orderBy(desc(queueToken.issuedAtMs))
    .limit(1);
  const joined = await tx
    .select({ ticket: queueToken, atMs: partyPass.atMs })
    .from(partyPass)
    .innerJoin(queueToken, eq(queueToken.id, partyPass.ticketId))
    .where(and(eq(partyPass.checkpointId, checkpointId), eq(partyPass.dedupKey, dedupKey)))
    .orderBy(desc(partyPass.atMs))
    .limit(1);
  const issued = own[0];
  const party = joined[0];
  if (party === undefined) return issued;
  if (issued === undefined) return party.ticket;
  return party.atMs > issued.issuedAtMs ? party.ticket : issued;
}

/** Records a scan: its outcome and what describes the pass, nothing that identifies anybody. */
export async function recordScan(
  db: Db | Tx,
  values: {
    readonly id: string;
    readonly checkpointId: string;
    readonly atMs: number;
    readonly outcome: ScanOutcome;
    readonly reason: ScanReason | null;
    readonly ticketId: string | null;
    readonly pass: BoardingPass | null;
  },
): Promise<void> {
  await db.insert(scan).values({
    id: values.id,
    checkpointId: values.checkpointId,
    atMs: values.atMs,
    outcome: values.outcome,
    reason: values.reason,
    ticketId: values.ticketId,
    bcbpVersion: values.pass?.version ?? null,
    legs: values.pass?.legs.length ?? null,
    securityData: values.pass?.securityData ?? null,
  });
}
