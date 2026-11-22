/** One flight to encode on a boarding pass. */
export interface LegInput {
  readonly pnr: string;
  readonly from: string;
  readonly to: string;
  readonly carrier: string;
  /** Digits (1 to 4) and an optional letter, e.g. `834` or `12A`. */
  readonly flightNumber: string;
  readonly dayOfYear: number;
  readonly compartment: string;
  readonly seat: string;
  readonly checkInSequence: string;
  readonly passengerStatus: string;
  readonly marketingCarrier?: string;
  readonly fastTrack?: boolean;
  /** Free text for the airline's own use, at the end of the leg. */
  readonly airlineUse?: string;
}

/** A boarding pass to encode (tests, demos and the synthetic generator). */
export interface BoardingPassInput {
  /** Written `SURNAME/GIVEN`, at most 20 characters. Synthetic outside tests of real passes. */
  readonly passengerName: string;
  readonly electronicTicket: boolean;
  readonly legs: readonly LegInput[];
  /** Version of the conditional items (default 6). */
  readonly version?: number;
  readonly issued?: { readonly yearDigit: number; readonly dayOfYear: number };
  /**
   * The passenger description of the conditional items (item 15), one character: `0` an adult
   * (the default), `4` an infant, `6` an adult travelling with an infant.
   */
  readonly passengerDescription?: string;
  readonly securityData?: string;
}

/** Thrown for an input that cannot be encoded. */
export class BcbpEncodeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BcbpEncodeError';
  }
}

const left = (value: string, length: number) => value.slice(0, length).padEnd(length, ' ');

const hex2 = (n: number) => {
  if (n < 0 || n > 255) throw new BcbpEncodeError(`a field of ${n} characters is too long`);
  return n.toString(16).toUpperCase().padStart(2, '0');
};

function flightField(flightNumber: string): string {
  const match = /^(\d{1,4})([A-Z]?)$/.exec(flightNumber);
  if (match === null) throw new BcbpEncodeError(`invalid flight number ${flightNumber}`);
  return `${(match[1] ?? '').padStart(4, '0')}${match[2] === '' || match[2] === undefined ? ' ' : match[2]}`;
}

/** The repeated conditional items of a leg (42 characters, fast track last). */
function repeatedItems(leg: LegInput): string {
  return [
    left('', 3),
    left('', 10),
    ' ',
    ' ',
    left(leg.marketingCarrier ?? leg.carrier, 3),
    left('', 3),
    left('', 16),
    ' ',
    left('', 3),
    leg.fastTrack === undefined ? ' ' : leg.fastTrack ? 'Y' : 'N',
  ].join('');
}

/** Encodes a boarding pass in the M format of Resolution 792. */
export function encodeBoardingPass(input: BoardingPassInput): string {
  if (input.legs.length < 1 || input.legs.length > 4) {
    throw new BcbpEncodeError('a boarding pass has 1 to 4 legs');
  }
  const version = input.version ?? 6;
  let text = `M${input.legs.length}${left(input.passengerName, 20)}${input.electronicTicket ? 'E' : ' '}`;
  input.legs.forEach((leg, i) => {
    if (leg.dayOfYear < 1 || leg.dayOfYear > 366) throw new BcbpEncodeError('day of year 1 to 366');
    const repeated = repeatedItems(leg);
    let variable = `${hex2(repeated.length)}${repeated}${leg.airlineUse ?? ''}`;
    if (i === 0) {
      const issued =
        input.issued === undefined
          ? '    '
          : `${input.issued.yearDigit}${String(input.issued.dayOfYear).padStart(3, '0')}`;
      // Passenger description, source of check-in and of issuance, date of issue, document type,
      // issuer.
      const unique = `${left(input.passengerDescription ?? '0', 1)}WW${issued}B${left(leg.carrier, 3)}`;
      variable = `>${version}${hex2(unique.length)}${unique}${variable}`;
    }
    text +=
      left(leg.pnr, 7) +
      leg.from +
      leg.to +
      left(leg.carrier, 3) +
      flightField(leg.flightNumber) +
      String(leg.dayOfYear).padStart(3, '0') +
      left(leg.compartment, 1) +
      left(leg.seat, 4) +
      left(leg.checkInSequence, 5) +
      left(leg.passengerStatus, 1) +
      hex2(variable.length) +
      variable;
  });
  if (input.securityData !== undefined) {
    text += `^1${hex2(input.securityData.length)}${input.securityData}`;
  }
  return text;
}
