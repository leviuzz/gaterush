import fc from 'fast-check';
import { streamFor } from '@gateflow/sim-kernel';
import { describe, expect, it } from 'vitest';
import {
  BCBP_ERRORS,
  civilDate,
  dayNumber,
  dedupMaterial,
  encodeBoardingPass,
  flightDateOf,
  isoDate,
  legForDeparture,
  parseBoardingPass,
  syntheticBoardingPass,
} from '../src';
import type { BoardingPassInput, BoardingPassLeg, LegInput, ParseResult } from '../src';

/** The minimal example of the IATA implementation guide: one leg, no conditional items. */
const MINIMAL = 'M1DESMARAIS/LUC       EABC123 YULFRAAC 0834 326J001A0025 100';

function pass(result: ParseResult) {
  if (!result.ok) throw new Error(`not parsed: ${result.error.code} at ${result.error.position}`);
  return result.pass;
}

describe('reading a boarding pass', () => {
  it('reads the example of the implementation guide, without the name', () => {
    const p = pass(parseBoardingPass(MINIMAL));
    expect(p.legs).toEqual([
      {
        pnr: 'ABC123',
        from: 'YUL',
        to: 'FRA',
        carrier: 'AC',
        flightNumber: '834',
        dayOfYear: 326,
        compartment: 'J',
        seat: '001A',
        checkInSequence: '0025',
        passengerStatus: '1',
        marketingCarrier: null,
        fastTrack: null,
      },
    ]);
    expect(p).toMatchObject({ electronicTicket: true, version: null, securityData: false });
    expect(JSON.stringify(p)).not.toContain('DESMARAIS');
    // A keyboard-wedge scanner ends the pass with a line end.
    expect(parseBoardingPass(`${MINIMAL}\r\n`)).toEqual(parseBoardingPass(MINIMAL));
  });

  it('refuses what is not a boarding pass, with a reason and a position', () => {
    const cases: [unknown, string][] = [
      ['', 'EMPTY'],
      [42, 'EMPTY'],
      ['X'.repeat(2000), 'TOO_LONG'],
      ['M1DESMARAIS\u0000', 'BAD_CHARACTERS'],
      [`S${MINIMAL.slice(1)}`, 'NOT_M_FORMAT'],
      [`M5${MINIMAL.slice(2)}`, 'BAD_LEG_COUNT'],
      [MINIMAL.slice(0, 40), 'TOO_SHORT'],
      [MINIMAL.replace('YUL', 'YU1'), 'BAD_AIRPORT'],
      [MINIMAL.replace('AC 0834', 'A! 0834'), 'BAD_CARRIER'],
      [MINIMAL.replace('0834 ', 'AB34 '), 'BAD_FLIGHT_NUMBER'],
      [MINIMAL.replace('326J', '367J'), 'BAD_DATE'],
      [MINIMAL.replace(/00$/, 'ZZ'), 'BAD_FIELD_SIZE'],
      [`${MINIMAL}EXTRA`, 'TRAILING_DATA'],
    ];
    for (const [input, code] of cases) {
      const result = parseBoardingPass(input);
      expect(result.ok, code).toBe(false);
      if (!result.ok) expect(result.error.code).toBe(code);
    }
  });
});

const letters = (n: number) => fc.stringMatching(new RegExp(`^[A-Z]{${n}}$`));
const legArb: fc.Arbitrary<LegInput> = fc.record({
  pnr: fc.stringMatching(/^[A-Z0-9]{5,7}$/),
  from: letters(3),
  to: letters(3),
  carrier: fc.stringMatching(/^[A-Z0-9]{2,3}$/),
  flightNumber: fc
    .tuple(fc.integer({ min: 1, max: 9999 }), fc.constantFrom('', 'A', 'D'))
    .map(([n, s]) => `${n}${s}`),
  dayOfYear: fc.integer({ min: 1, max: 366 }),
  compartment: fc.constantFrom('Y', 'J', 'F', 'C'),
  seat: fc.stringMatching(/^\d{3}[A-K]$/),
  checkInSequence: fc.stringMatching(/^\d{4}[A-Z]?$/),
  passengerStatus: fc.constantFrom('0', '1', '3'),
  marketingCarrier: fc.stringMatching(/^[A-Z0-9]{2,3}$/),
  fastTrack: fc.boolean(),
  airlineUse: fc.stringMatching(/^[A-Z0-9 ]{0,20}$/),
});
const passArb: fc.Arbitrary<BoardingPassInput> = fc.record({
  passengerName: fc.stringMatching(/^[A-Z]{2,8}\/[A-Z]{2,8}$/),
  electronicTicket: fc.boolean(),
  legs: fc.array(legArb, { minLength: 1, maxLength: 4 }),
  version: fc.integer({ min: 5, max: 8 }),
  issued: fc.record({
    yearDigit: fc.integer({ min: 0, max: 9 }),
    dayOfYear: fc.integer({ min: 1, max: 366 }),
  }),
  securityData: fc.option(fc.stringMatching(/^[A-Z0-9]{10,80}$/), { nil: undefined }),
});

describe('encoding and reading', () => {
  it('read back exactly what was encoded (round trip)', () => {
    fc.assert(
      fc.property(passArb, (input) => {
        const p = pass(parseBoardingPass(encodeBoardingPass(input)));
        expect(p.legs).toEqual(
          input.legs.map((leg): BoardingPassLeg => ({
            pnr: leg.pnr,
            from: leg.from,
            to: leg.to,
            carrier: leg.carrier,
            flightNumber: leg.flightNumber,
            dayOfYear: leg.dayOfYear,
            compartment: leg.compartment,
            seat: leg.seat,
            checkInSequence: leg.checkInSequence,
            passengerStatus: leg.passengerStatus,
            marketingCarrier: leg.marketingCarrier ?? null,
            fastTrack: leg.fastTrack ?? null,
          })),
        );
        expect(p.electronicTicket).toBe(input.electronicTicket);
        expect(p.version).toBe(input.version);
        expect(p.issued).toEqual(input.issued);
        expect(p.securityData).toBe(input.securityData !== undefined);
        expect(JSON.stringify(p)).not.toContain(input.passengerName);
      }),
      { numRuns: 500 },
    );
  });

  it('never throws, whatever the input, and never quotes it in an error', () => {
    const mutated = fc
      .tuple(
        passArb,
        fc.array(fc.tuple(fc.nat(), fc.string({ minLength: 0, maxLength: 3 })), { maxLength: 4 }),
        fc.nat(),
      )
      .map(([input, edits, cut]) => {
        let text = encodeBoardingPass(input);
        for (const [at, s] of edits) {
          const i = at % (text.length + 1);
          text = text.slice(0, i) + s + text.slice(i + s.length);
        }
        return text.slice(0, text.length - (cut % 5));
      });
    fc.assert(
      fc.property(fc.oneof(fc.string(), fc.string({ unit: 'binary' }), mutated), (text) => {
        const result = parseBoardingPass(text);
        if (!result.ok) {
          expect(BCBP_ERRORS).toContain(result.error.code);
          expect(result.error.position).toBeGreaterThanOrEqual(0);
          expect(Object.keys(result.error).sort()).toEqual(['code', 'position']);
        }
      }),
      { numRuns: 2000 },
    );
  });
});

describe('the flight date', () => {
  it('takes the year that puts the flight closest to the scan, across the year end', () => {
    const at = (iso: string) => {
      const [year, month, day] = iso.split('-').map(Number) as [number, number, number];
      return { year, month, day };
    };
    const date = (day: number, scan: string) => {
      const d = flightDateOf(day, at(scan));
      return d === null ? null : isoDate(d);
    };
    expect(date(1, '2026-12-31')).toBe('2027-01-01');
    expect(date(365, '2027-01-01')).toBe('2026-12-31');
    expect(date(366, '2028-12-31')).toBe('2028-12-31');
    expect(date(1, '2029-01-01')).toBe('2029-01-01');
    expect(date(60, '2028-03-01')).toBe('2028-02-29');
    // Day 366 exists only in a leap year: with no leap year next to the scan, there is no date.
    expect(date(366, '2026-06-01')).toBeNull();
  });

  it('agrees with the calendar for every day of four years', () => {
    for (
      let n = dayNumber({ year: 2026, month: 1, day: 1 });
      n < dayNumber({ year: 2030, month: 1, day: 1 });
      n++
    ) {
      const d = civilDate(n);
      expect(dayNumber(d)).toBe(n);
      const doy = n - dayNumber({ year: d.year, month: 1, day: 1 }) + 1;
      expect(flightDateOf(doy, d)).toEqual(d);
    }
  });
});

describe('the leg for a checkpoint', () => {
  const connecting = encodeBoardingPass({
    passengerName: 'SAMPLE/ALEX',
    electronicTicket: true,
    legs: [
      {
        pnr: 'XYZ789',
        from: 'VCE',
        to: 'FCO',
        carrier: 'AZ',
        flightNumber: '1462',
        dayOfYear: 327,
        compartment: 'Y',
        seat: '012C',
        checkInSequence: '0042',
        passengerStatus: '1',
      },
      {
        pnr: 'XYZ789',
        from: 'FCO',
        to: 'JFK',
        carrier: 'AZ',
        flightNumber: '608',
        dayOfYear: 327,
        compartment: 'Y',
        seat: '034A',
        checkInSequence: '0107',
        passengerStatus: '1',
      },
    ],
  });
  const scanned = { year: 2026, month: 11, day: 23 };

  it("chooses the leg from this airport, for today's flight", () => {
    const p = pass(parseBoardingPass(connecting));
    expect(legForDeparture(p, 'VCE', scanned)).toMatchObject({
      ok: true,
      legIndex: 0,
      flightDate: '2026-11-23',
    });
    const transfer = legForDeparture(p, 'FCO', scanned);
    expect(transfer).toMatchObject({ ok: true, legIndex: 1, flightDate: '2026-11-23' });
    expect(legForDeparture(p, 'MXP', scanned)).toEqual({ ok: false, reason: 'WRONG_AIRPORT' });
    expect(legForDeparture(p, 'VCE', { year: 2026, month: 11, day: 27 })).toEqual({
      ok: false,
      reason: 'WRONG_DAY',
    });
    if (transfer.ok) {
      expect(dedupMaterial(transfer.leg, transfer.flightDate)).toBe(
        'AZ|608|2026-11-23|FCO|0107|XYZ789',
      );
    }
  });

  it('gives synthetic passes for demos that read back as given', () => {
    const random = streamFor(7, [1]);
    const { text, input } = syntheticBoardingPass(random, [
      { from: 'VCE', to: 'CDG', carrier: 'U2', flightNumber: '4512', date: scanned },
    ]);
    const p = pass(parseBoardingPass(text));
    expect(p.legs[0]).toMatchObject({
      from: 'VCE',
      to: 'CDG',
      carrier: 'U2',
      flightNumber: '4512',
      dayOfYear: 327,
    });
    expect(input.passengerName).toMatch(/^(SAMPLE|TEST|DEMO|EXAMPLE)\//);
    expect(
      syntheticBoardingPass(streamFor(7, [1]), [
        { from: 'VCE', to: 'CDG', carrier: 'U2', flightNumber: '4512', date: scanned },
      ]).text,
    ).toBe(text);
  });
});
