/** The time of the server: real, or virtual in tests and demos. */
export interface Clock {
  now(): number;
}

export const systemClock: Clock = { now: () => Date.now() };

const MS_PER_DAY = 86_400_000;
const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string): Intl.DateTimeFormat {
  let f = formatters.get(timeZone);
  if (f === undefined) {
    f = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    });
    formatters.set(timeZone, f);
  }
  return f;
}

/** The wall clock of a time zone at an instant. */
function wallClock(ms: number, timeZone: string) {
  const parts: Record<string, number> = {};
  for (const part of formatter(timeZone).formatToParts(ms)) {
    if (part.type !== 'literal') parts[part.type] = Number(part.value);
  }
  return {
    year: parts.year ?? 0,
    month: parts.month ?? 1,
    day: parts.day ?? 1,
    hour: parts.hour ?? 0,
    minute: parts.minute ?? 0,
    second: parts.second ?? 0,
  };
}

function isoDate(utcMs: number): string {
  return new Date(utcMs).toISOString().slice(0, 10);
}

/**
 * The service day of an instant at a checkpoint: the local date, or the day before when the local
 * time is earlier than the time at which the checkpoint's day starts (e.g. 03:00).
 */
export function serviceDayOf(ms: number, timeZone: string, dayStartsAt: string): string {
  const c = wallClock(ms, timeZone);
  const [hours = 0, minutes = 0] = dayStartsAt.split(':').map(Number);
  const local = Date.UTC(c.year, c.month - 1, c.day);
  return isoDate(c.hour * 60 + c.minute >= hours * 60 + minutes ? local : local - MS_PER_DAY);
}

/** How far the time zone is ahead of UTC at an instant. */
function offsetMs(ms: number, timeZone: string): number {
  const c = wallClock(ms, timeZone);
  return (
    Date.UTC(c.year, c.month - 1, c.day, c.hour, c.minute, c.second) - Math.floor(ms / 1000) * 1000
  );
}

/**
 * The instant of a local time of day on a date in a time zone (`msOfDay` may be negative or past
 * midnight: the day before or after).
 */
export function zonedEpoch(date: string, msOfDay: number, timeZone: string): number {
  const [year = 1970, month = 1, day = 1] = date.split('-').map(Number);
  const asUtc = Date.UTC(year, month - 1, day) + msOfDay;
  const first = asUtc - offsetMs(asUtc, timeZone);
  return asUtc - offsetMs(first, timeZone);
}
