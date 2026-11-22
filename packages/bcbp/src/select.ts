import { dayNumber, flightDateOf, isoDate } from './calendar';
import type { CivilDate } from './calendar';
import type { BoardingPass, BoardingPassLeg } from './parse';

/** Why a valid boarding pass does not give a ticket at this checkpoint. */
export const LEG_REFUSALS = [
  /** No leg departs from this airport. */
  'WRONG_AIRPORT',
  /** The leg from this airport is not for today (or the night around it). */
  'WRONG_DAY',
] as const;
export type LegRefusal = (typeof LEG_REFUSALS)[number];

export type LegChoice =
  | {
      readonly ok: true;
      readonly leg: BoardingPassLeg;
      readonly legIndex: number;
      /** The flight's date, `YYYY-MM-DD`. */
      readonly flightDate: string;
    }
  | { readonly ok: false; readonly reason: LegRefusal };

/**
 * The leg a passenger flies from this airport, on a date within `days` of the day of the scan
 * (default 1: a flight just after midnight, or delayed past it). A connecting passenger's pass has
 * several legs: the one from this airport is chosen.
 */
export function legForDeparture(
  pass: BoardingPass,
  airport: string,
  scanned: CivilDate,
  days = 1,
): LegChoice {
  const fromHere = pass.legs
    .map((leg, legIndex) => ({ leg, legIndex }))
    .filter(({ leg }) => leg.from === airport);
  if (fromHere.length === 0) return { ok: false, reason: 'WRONG_AIRPORT' };
  const scan = dayNumber(scanned);
  for (const { leg, legIndex } of fromHere) {
    const date = flightDateOf(leg.dayOfYear, scanned);
    if (date !== null && Math.abs(dayNumber(date) - scan) <= days) {
      return { ok: true, leg, legIndex, flightDate: isoDate(date) };
    }
  }
  return { ok: false, reason: 'WRONG_DAY' };
}

/**
 * What the deduplication key of a ticket is computed from (kickoff 2.13): carrier, flight, date,
 * origin, check-in sequence and booking reference. The API keys it with an HMAC whose key depends
 * on the airport and the flight's date, so the same pass scanned again finds the same ticket,
 * and the booking reference is never stored.
 */
export function dedupMaterial(leg: BoardingPassLeg, flightDate: string): string {
  return [leg.carrier, leg.flightNumber, flightDate, leg.from, leg.checkInSequence, leg.pnr].join(
    '|',
  );
}
