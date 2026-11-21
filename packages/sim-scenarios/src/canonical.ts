/**
 * Canonical JSON: object keys sorted (by UTF-16 code units), no whitespace, arrays in order.
 * Two semantically equal scenarios therefore serialise to the same string, whatever the key
 * order or formatting of the source file; its SHA-256 identifies the scenario in reports.
 */
export function canonicalJson(value: unknown): string {
  if (value === null) return 'null';
  switch (typeof value) {
    case 'number':
      if (!Number.isFinite(value))
        throw new TypeError(`cannot serialise non-finite number ${value}`);
      return JSON.stringify(value);
    case 'string':
    case 'boolean':
      return JSON.stringify(value);
    case 'object': {
      if (Array.isArray(value)) return `[${value.map((v: unknown) => canonicalJson(v)).join(',')}]`;
      const record = value as Record<string, unknown>;
      const keys = Object.keys(record)
        .filter((k) => record[k] !== undefined)
        .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
      return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(record[k])}`).join(',')}}`;
    }
    case 'undefined':
    case 'bigint':
    case 'function':
    case 'symbol':
      break;
  }
  throw new TypeError(`cannot serialise a value of type ${typeof value}`);
}
