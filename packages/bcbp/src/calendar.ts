/*
 * Calendar arithmetic on whole days, without Date (pure packages read no clock and use no locale).
 * Day numbers count days since 1970-01-01 (proleptic Gregorian), after H. Hinnant's algorithms.
 */

/** A date of the Gregorian calendar. */
export interface CivilDate {
  readonly year: number;
  readonly month: number;
  readonly day: number;
}

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function daysInYear(year: number): number {
  return isLeapYear(year) ? 366 : 365;
}

/** Days since 1970-01-01 of a date. */
export function dayNumber(date: CivilDate): number {
  const y = date.month <= 2 ? date.year - 1 : date.year;
  const era = Math.floor(y / 400);
  const yoe = y - era * 400;
  const mp = (date.month + 9) % 12;
  const doy = Math.floor((153 * mp + 2) / 5) + date.day - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

/** The date of a day number. */
export function civilDate(days: number): CivilDate {
  const z = days + 719468;
  const era = Math.floor(z / 146097);
  const doe = z - era * 146097;
  const yoe = Math.floor(
    (doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365,
  );
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const day = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const month = mp < 10 ? mp + 3 : mp - 9;
  const year = yoe + era * 400 + (month <= 2 ? 1 : 0);
  return { year, month, day };
}

/** The day of the year (1 for 1 January) of a date. */
export function dayOfYear(date: CivilDate): number {
  return dayNumber(date) - dayNumber({ year: date.year, month: 1, day: 1 }) + 1;
}

/** `YYYY-MM-DD`. */
export function isoDate(date: CivilDate): string {
  const two = (n: number) => String(n).padStart(2, '0');
  return `${String(date.year).padStart(4, '0')}-${two(date.month)}-${two(date.day)}`;
}

/**
 * The date of a boarding pass's flight. A boarding pass gives the day of the year only (its
 * "Julian date"), so the year is the one that puts the flight closest to the scan: a pass for
 * 1 January scanned on 31 December is for the next year. `null` when no year nearby has that day
 * (day 366 three years from a leap year).
 */
export function flightDateOf(dayOfTheYear: number, scanned: CivilDate): CivilDate | null {
  const scan = dayNumber(scanned);
  let best: CivilDate | null = null;
  let bestDistance = Infinity;
  for (const year of [scanned.year - 1, scanned.year, scanned.year + 1]) {
    if (dayOfTheYear < 1 || dayOfTheYear > daysInYear(year)) continue;
    const days = dayNumber({ year, month: 1, day: 1 }) + dayOfTheYear - 1;
    const distance = Math.abs(days - scan);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = civilDate(days);
    }
  }
  return best;
}
