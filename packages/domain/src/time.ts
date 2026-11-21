/**
 * Time in GateFlow is always an integer number of milliseconds.
 *
 * Absolute instants and durations share the same representation; the meaning (epoch-based in
 * production, "milliseconds since the start of the service day" in simulations) is fixed by the
 * caller. Integer arithmetic keeps every comparison exact and reproducible on any platform.
 */
export type Millis = number;

export const MS_PER_SECOND = 1_000;
export const MS_PER_MINUTE = 60_000;
export const MS_PER_HOUR = 3_600_000;

/** Converts (possibly fractional) minutes to integer milliseconds, rounding half away from zero. */
export function minutesToMs(minutes: number): Millis {
  return roundHalfAwayFromZero(minutes * MS_PER_MINUTE);
}

/** Converts (possibly fractional) seconds to integer milliseconds, rounding half away from zero. */
export function secondsToMs(seconds: number): Millis {
  return roundHalfAwayFromZero(seconds * MS_PER_SECOND);
}

/** Converts milliseconds to (fractional) minutes. */
export function msToMinutes(ms: Millis): number {
  return ms / MS_PER_MINUTE;
}

/** True when `value` is a safe integer, i.e. a valid {@link Millis} value. */
export function isMillis(value: unknown): value is Millis {
  return typeof value === 'number' && Number.isSafeInteger(value);
}

function roundHalfAwayFromZero(x: number): number {
  const rounded = x < 0 ? -Math.round(-x) : Math.round(x);
  // Normalise -0 to 0 so that serialised output never contains "-0".
  return rounded === 0 ? 0 : rounded;
}
