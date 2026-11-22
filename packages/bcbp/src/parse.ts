/*
 * IATA Resolution 792 bar coded boarding passes, M format (versions 1 to 8). The parser reads the
 * mandatory items of every leg strictly and the conditional items as far as they are consistent.
 * It never throws: any input gives a boarding pass or a typed error with a position, and an error
 * never quotes the input (a boarding pass holds a name and a booking reference).
 *
 * The passenger's name is skipped, never returned: GateFlow has no use for it (ADR-043).
 */

/** One flight of a boarding pass. */
export interface BoardingPassLeg {
  /**
   * The operating carrier's booking reference. Personal data: it may enter the deduplication key
   * (an HMAC) but must never be stored or logged.
   */
  readonly pnr: string;
  /** IATA codes of the departure and arrival airports. */
  readonly from: string;
  readonly to: string;
  /** Operating carrier, e.g. `AZ` or `U2`. */
  readonly carrier: string;
  /** Flight number without leading zeros, with its suffix: `834`, `12A`. */
  readonly flightNumber: string;
  /** Day of the year of the flight (1 to 366): the year is not in the pass. */
  readonly dayOfYear: number;
  readonly compartment: string;
  readonly seat: string;
  readonly checkInSequence: string;
  readonly passengerStatus: string;
  /** Marketing carrier of the leg, from the conditional items, when given. */
  readonly marketingCarrier: string | null;
  /** Fast track at security, from the conditional items of version 5 and later, when given. */
  readonly fastTrack: boolean | null;
}

export interface BoardingPass {
  readonly legs: readonly BoardingPassLeg[];
  readonly electronicTicket: boolean;
  /** Version of the conditional items (`>` then a digit), or null without them. */
  readonly version: number | null;
  /** Date of issue of the pass from the conditional items: last digit of the year, day of the year. */
  readonly issued: { readonly yearDigit: number; readonly dayOfYear: number } | null;
  /** True when the pass carries security data (a signature). It is not verified here. */
  readonly securityData: boolean;
}

/** Why a text is not a boarding pass this parser can read. */
export const BCBP_ERRORS = [
  'EMPTY',
  'TOO_LONG',
  'BAD_CHARACTERS',
  'NOT_M_FORMAT',
  'BAD_LEG_COUNT',
  'TOO_SHORT',
  'BAD_AIRPORT',
  'BAD_CARRIER',
  'BAD_FLIGHT_NUMBER',
  'BAD_DATE',
  'BAD_FIELD_SIZE',
  'TRAILING_DATA',
] as const;
export type BcbpErrorCode = (typeof BCBP_ERRORS)[number];

export type ParseResult =
  | { readonly ok: true; readonly pass: BoardingPass }
  | {
      readonly ok: false;
      readonly error: { readonly code: BcbpErrorCode; readonly position: number };
    };

/** The longest text read: boarding passes with security data stay well below it. */
export const MAX_LENGTH = 1024;

const PRINTABLE = /^[\x20-\x7e]*$/;
const AIRPORT = /^[A-Z]{3}$/;
const CARRIER = /^[A-Z0-9]{2}[A-Z0-9 ]$/;
const FLIGHT = /^(\d{1,4})([A-Z]?)$/;
const DAY = /^\d{3}$/;
const HEX2 = /^[0-9A-Fa-f]{2}$/;

/** A failure inside the parser; it never leaves `parseBoardingPass`, and never quotes the text. */
class Failure extends Error {
  constructor(
    readonly code: BcbpErrorCode,
    readonly position: number,
  ) {
    super(code);
    this.name = 'Failure';
  }
}

/** A cursor over the text that fails instead of reading past the end. */
class Reader {
  position = 0;
  constructor(private readonly text: string) {}

  get left(): number {
    return this.text.length - this.position;
  }

  read(length: number): string {
    if (this.left < length) throw new Failure('TOO_SHORT', this.text.length);
    const value = this.text.slice(this.position, this.position + length);
    this.position += length;
    return value;
  }

  hex(code: BcbpErrorCode = 'BAD_FIELD_SIZE'): number {
    const at = this.position;
    const value = this.read(2);
    if (!HEX2.test(value)) throw new Failure(code, at);
    return Number.parseInt(value, 16);
  }

  peek(): string {
    return this.text.charAt(this.position);
  }
}

function field(reader: Reader, length: number, pattern: RegExp, code: BcbpErrorCode): string {
  const at = reader.position;
  const value = reader.read(length);
  if (!pattern.test(value)) throw new Failure(code, at);
  return value;
}

/** The conditional items GateFlow reads, from a leg's variable field. */
interface Conditional {
  version: number | null;
  issued: BoardingPass['issued'];
  marketingCarrier: string | null;
  fastTrack: boolean | null;
}

/**
 * Reads the structured part of a leg's variable field. Real passes are not always consistent in
 * these sizes; when they are not, the items are left unknown rather than misread.
 */
function conditional(text: string, first: boolean): Conditional {
  const out: Conditional = { version: null, issued: null, marketingCarrier: null, fastTrack: null };
  let at = 0;
  const take = (n: number): string | null => {
    if (at + n > text.length) return null;
    const value = text.slice(at, at + n);
    at += n;
    return value;
  };
  if (first) {
    if (text.charAt(0) !== '>') return out;
    at = 1;
    const version = take(1);
    if (version === null || !/^\d$/.test(version)) return out;
    out.version = Number(version);
    const size = take(2);
    if (size === null || !HEX2.test(size)) return out;
    const unique = take(Number.parseInt(size, 16));
    if (unique === null) return out;
    // Passenger description, source of check-in, source of issuance, then the date of issue.
    const issue = unique.slice(3, 7);
    if (/^\d{4}$/.test(issue)) {
      const day = Number(issue.slice(1));
      if (day >= 1 && day <= 366)
        out.issued = { yearDigit: Number(issue.charAt(0)), dayOfYear: day };
    }
  }
  const repeatedSize = take(2);
  if (repeatedSize === null || !HEX2.test(repeatedSize)) return out;
  const repeated = take(Number.parseInt(repeatedSize, 16));
  if (repeated === null) return out;
  // Airline numeric code (3), document serial (10), selectee (1), documentation verification (1),
  // then the marketing carrier (3); after frequent flyer items and baggage, the fast track (1).
  const marketing = repeated.slice(15, 18).trim();
  if (/^[A-Z0-9]{2,3}$/.test(marketing)) out.marketingCarrier = marketing;
  const fastTrack = repeated.charAt(41);
  if (fastTrack === 'Y' || fastTrack === 'N') out.fastTrack = fastTrack === 'Y';
  return out;
}

function parseLegs(reader: Reader): BoardingPass {
  if (reader.read(1) !== 'M') throw new Failure('NOT_M_FORMAT', 0);
  const count = reader.read(1);
  if (!/^[1-4]$/.test(count)) throw new Failure('BAD_LEG_COUNT', 1);
  reader.read(20); // The passenger's name: never kept.
  const electronicTicket = reader.read(1) === 'E';
  const legs: BoardingPassLeg[] = [];
  let version: number | null = null;
  let issued: BoardingPass['issued'] = null;
  for (let i = 0; i < Number(count); i++) {
    const pnr = reader.read(7).trim();
    const from = field(reader, 3, AIRPORT, 'BAD_AIRPORT');
    const to = field(reader, 3, AIRPORT, 'BAD_AIRPORT');
    const carrier = field(reader, 3, CARRIER, 'BAD_CARRIER').trim();
    const flightAt = reader.position;
    const flight = FLIGHT.exec(reader.read(5).trim());
    if (flight === null) throw new Failure('BAD_FLIGHT_NUMBER', flightAt);
    const dayAt = reader.position;
    const day = Number(field(reader, 3, DAY, 'BAD_DATE'));
    if (day < 1 || day > 366) throw new Failure('BAD_DATE', dayAt);
    const compartment = reader.read(1);
    const seat = reader.read(4).trim();
    const checkInSequence = reader.read(5).trim();
    const passengerStatus = reader.read(1);
    const size = reader.hex();
    const variable = reader.read(size);
    const extra = conditional(variable, i === 0);
    if (i === 0) {
      version = extra.version;
      issued = extra.issued;
    }
    legs.push({
      pnr,
      from,
      to,
      carrier,
      flightNumber: `${String(Number(flight[1]))}${flight[2] ?? ''}`,
      dayOfYear: day,
      compartment,
      seat,
      checkInSequence,
      passengerStatus,
      marketingCarrier: extra.marketingCarrier,
      fastTrack: extra.fastTrack,
    });
  }
  let securityData = false;
  if (reader.left > 0 && reader.peek() === '^') {
    reader.read(1);
    reader.read(1); // Type of security data.
    reader.read(reader.hex());
    securityData = true;
  }
  if (reader.left > 0) throw new Failure('TRAILING_DATA', reader.position);
  return { legs, electronicTicket, version, issued, securityData };
}

/**
 * Reads a boarding pass as a scanner gives it (a keyboard-wedge scanner may add a line end). Never
 * throws.
 */
export function parseBoardingPass(input: unknown): ParseResult {
  if (typeof input !== 'string') return { ok: false, error: { code: 'EMPTY', position: 0 } };
  const text = input.replace(/[\r\n]+$/, '');
  if (text.length === 0) return { ok: false, error: { code: 'EMPTY', position: 0 } };
  if (text.length > MAX_LENGTH) {
    return { ok: false, error: { code: 'TOO_LONG', position: MAX_LENGTH } };
  }
  if (!PRINTABLE.test(text)) {
    let position = 0;
    while (position < text.length && PRINTABLE.test(text.charAt(position))) position++;
    return { ok: false, error: { code: 'BAD_CHARACTERS', position } };
  }
  try {
    return { ok: true, pass: parseLegs(new Reader(text)) };
  } catch (error) {
    if (error instanceof Failure) {
      return { ok: false, error: { code: error.code, position: error.position } };
    }
    throw error;
  }
}
