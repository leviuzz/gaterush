import { MS_PER_MINUTE } from '@gateflow/domain';
import { generateSchedule } from './generate';
import { ScenarioValidationError } from './errors';
import { FlightRowSchema } from './schema';
import type { FlightRow, Scenario } from './schema';

/**
 * Flight lists as CSV files (format `gateflow.flights/1`): one departure per row, the columns
 * below in any order, a header row first. Only `flight` and `std` are required. Lines starting
 * with `#` are comments. Fields may be quoted ("..."), and a header separated by semicolons makes
 * the whole file semicolon-separated (as spreadsheets in many European locales write it).
 */
export const FLIGHTS_FORMAT = 'gateflow.flights/1';

/** Columns of the format, in the order they are written. */
export const FLIGHT_COLUMNS = [
  'flight',
  'std',
  'aircraft',
  'seats',
  'passengers',
  'gate_zone',
  'destination',
] as const;
type Column = (typeof FLIGHT_COLUMNS)[number];
const REQUIRED: readonly Column[] = ['flight', 'std'];

interface CsvRecord {
  readonly line: number;
  readonly fields: string[];
}

/** Splits CSV text into records (RFC 4180 quoting), skipping empty and comment lines. */
function records(text: string, delimiter: string): CsvRecord[] {
  const out: CsvRecord[] = [];
  const source = text.startsWith('\uFEFF') ? text.slice(1) : text;
  let line = 1;
  let i = 0;
  while (i < source.length) {
    const start = line;
    // A comment or a blank line, outside quotes.
    const end = source.indexOf('\n', i);
    const lineText = source.slice(i, end === -1 ? source.length : end);
    if (lineText.trim() === '' || lineText.trimStart().startsWith('#')) {
      i = end === -1 ? source.length : end + 1;
      line++;
      continue;
    }
    const fields: string[] = [];
    let field = '';
    let quoted = false;
    let wasQuoted = false;
    for (;;) {
      const c = source[i];
      if (c === undefined) break;
      if (quoted) {
        if (c === '"') {
          if (source[i + 1] === '"') {
            field += '"';
            i += 2;
            continue;
          }
          quoted = false;
          i++;
          continue;
        }
        if (c === '\n') line++;
        field += c;
        i++;
        continue;
      }
      if (c === '"' && field.trim() === '') {
        quoted = true;
        wasQuoted = true;
        field = '';
        i++;
        continue;
      }
      if (c === delimiter) {
        fields.push(wasQuoted ? field : field.trim());
        field = '';
        wasQuoted = false;
        i++;
        continue;
      }
      if (c === '\r' && source[i + 1] === '\n') {
        i++;
        continue;
      }
      if (c === '\n') {
        i++;
        line++;
        break;
      }
      field += c;
      i++;
    }
    if (quoted) {
      throw new ScenarioValidationError([`line ${start}: a quoted field is not closed`]);
    }
    fields.push(wasQuoted ? field : field.trim());
    out.push({ line: start, fields });
    if (i >= source.length) break;
  }
  return out;
}

/** The delimiter of a file: a semicolon when the header has semicolons and no commas. */
function delimiterOf(text: string): string {
  const header = text
    .split(/\r?\n/)
    .find((l) => l.trim() !== '' && !l.replace(/^\uFEFF/, '').startsWith('#'));
  if (header === undefined) return ',';
  return header.includes(';') && !header.includes(',') ? ';' : ',';
}

const WHOLE = /^\d+$/;

/**
 * Parses a flight list file. Throws a ScenarioValidationError listing every problem with its line
 * number; the semantic checks that need the scenario (gate zones, seats) are made by the schema.
 */
export function parseFlightCsv(text: string): FlightRow[] {
  const delimiter = delimiterOf(text);
  const all = records(text, delimiter);
  const header = all[0];
  if (header === undefined) throw new ScenarioValidationError(['the flight list is empty']);
  const issues: string[] = [];
  const columns = header.fields.map((name) => name.toLowerCase());
  const index = new Map<Column, number>();
  columns.forEach((name, i) => {
    if (!(FLIGHT_COLUMNS as readonly string[]).includes(name)) {
      issues.push(
        `line ${header.line}: unknown column "${name}" (allowed: ${FLIGHT_COLUMNS.join(', ')})`,
      );
      return;
    }
    if (index.has(name as Column)) {
      issues.push(`line ${header.line}: column "${name}" appears twice`);
      return;
    }
    index.set(name as Column, i);
  });
  for (const name of REQUIRED) {
    if (!index.has(name)) issues.push(`line ${header.line}: missing column "${name}"`);
  }
  if (issues.length > 0) throw new ScenarioValidationError(issues);

  const rows: FlightRow[] = [];
  for (const record of all.slice(1)) {
    if (record.fields.length !== columns.length) {
      issues.push(
        `line ${record.line}: ${record.fields.length} fields, expected ${columns.length} as in the header`,
      );
      continue;
    }
    const get = (name: Column): string | undefined => {
      const i = index.get(name);
      const value = i === undefined ? undefined : record.fields[i];
      return value === undefined || value === '' ? undefined : value;
    };
    const draft: Record<string, unknown> = {};
    const setText = (name: Column, key: string) => {
      const value = get(name);
      if (value !== undefined) draft[key] = value;
    };
    const setWhole = (name: Column) => {
      const value = get(name);
      if (value === undefined) return;
      if (!WHOLE.test(value)) {
        issues.push(`line ${record.line}: ${name}: expected a whole number, got "${value}"`);
        return;
      }
      draft[name] = Number(value);
    };
    setText('flight', 'flight');
    setText('std', 'std');
    setText('aircraft', 'aircraft');
    setWhole('seats');
    setWhole('passengers');
    setText('gate_zone', 'gateZone');
    setText('destination', 'destination');
    const result = FlightRowSchema.safeParse(draft);
    if (!result.success) {
      for (const issue of result.error.issues) {
        const key = issue.path.map(String).join('.');
        const column = key === 'gateZone' ? 'gate_zone' : key;
        issues.push(`line ${record.line}: ${column === '' ? '' : `${column}: `}${issue.message}`);
      }
      continue;
    }
    rows.push(result.data);
  }
  if (issues.length > 0) throw new ScenarioValidationError(issues);
  if (rows.length === 0) throw new ScenarioValidationError(['the flight list has no flights']);
  return rows;
}

function quote(value: string): string {
  return /[",;\r\n#]|^\s|\s$/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** Writes flight rows in the format, with optional comment lines first. */
export function formatFlightCsv(
  rows: readonly FlightRow[],
  comments: readonly string[] = [],
): string {
  const lines = comments.map((c) => `# ${c.replace(/\r?\n/g, ' ')}`);
  lines.push(FLIGHT_COLUMNS.join(','));
  for (const row of rows) {
    const cells: Record<Column, string> = {
      flight: row.flight,
      std: row.std,
      aircraft: row.aircraft ?? '',
      seats: row.seats === undefined ? '' : String(row.seats),
      passengers: row.passengers === undefined ? '' : String(row.passengers),
      gate_zone: row.gateZone ?? '',
      destination: row.destination ?? '',
    };
    lines.push(FLIGHT_COLUMNS.map((c) => quote(cells[c])).join(','));
  }
  return `${lines.join('\n')}\n`;
}

function clock(ms: number): string {
  const minutes = Math.round(ms / MS_PER_MINUTE);
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * The design day of a scenario as flight rows: every flight with its departure, aircraft, seats
 * (or fixed passengers) and gate zone. A flight list scenario made of these rows, with the same
 * gate zones, generates exactly the same passengers.
 */
export function designDayRows(scenario: Scenario): FlightRow[] {
  return generateSchedule(scenario).map((flight) => ({
    flight: flight.id,
    std: clock(flight.stdMs),
    aircraft: flight.aircraftCategory,
    seats: flight.seats,
    ...(flight.passengers === undefined ? {} : { passengers: flight.passengers }),
    gateZone: flight.gateZone,
    ...(flight.destination === undefined ? {} : { destination: flight.destination }),
  }));
}
