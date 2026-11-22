/** One decimal by default, never "-0.0". */
export function num(value: number, digits = 1): string {
  const text = value.toFixed(digits);
  return text === `-${(0).toFixed(digits)}` ? (0).toFixed(digits) : text;
}

export function signed(value: number, digits = 1): string {
  const text = num(value, digits);
  return value > 0 && text !== num(0, digits) ? `+${text}` : text;
}

export function interval(mean: number, lower: number, upper: number, digits = 1): string {
  return `${signed(mean, digits)} [${num(lower, digits)}, ${num(upper, digits)}]`;
}

export function thousands(value: number): string {
  return Math.round(value)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** A parameter value as compact text. */
export function valueText(value: unknown, max = 160): string {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

export function seconds(ms: number): string {
  return ms < 60_000
    ? `${num(ms / 1000, 1)} s`
    : `${Math.floor(ms / 60_000)} min ${Math.round((ms % 60_000) / 1000)} s`;
}
