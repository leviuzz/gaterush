import type { RandomSource } from '@gateflow/sim-kernel';
import { dayOfYear } from './calendar';
import type { CivilDate } from './calendar';
import { encodeBoardingPass } from './encode';
import type { BoardingPassInput, LegInput } from './encode';
import type { PassInfant } from './parse';

/** Names of synthetic passengers: never a real person. */
const NAMES = [
  'SAMPLE/ALEX',
  'SAMPLE/MARIA',
  'TEST/JORDAN',
  'TEST/LUCA',
  'DEMO/SAM',
  'DEMO/ANA',
  'EXAMPLE/KIM',
  'EXAMPLE/NOA',
];

const ALPHANUMERIC = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function pick<T>(random: RandomSource, items: readonly T[]): T {
  const item = items[Math.floor(random.nextFloat() * items.length)];
  if (item === undefined) throw new RangeError('nothing to pick from');
  return item;
}

function code(random: RandomSource, length: number): string {
  let out = '';
  for (let i = 0; i < length; i++) {
    out += ALPHANUMERIC.charAt(Math.floor(random.nextFloat() * ALPHANUMERIC.length));
  }
  return out;
}

export interface SyntheticLeg {
  readonly from: string;
  readonly to: string;
  readonly carrier: string;
  readonly flightNumber: string;
  readonly date: CivilDate;
}

/**
 * A synthetic boarding pass for demos and tests: a sample name and booking reference drawn from
 * `random`, the given legs, a seat and a check-in sequence number. With `infant`, the pass is an
 * adult's travelling with an infant, or an infant's own (ADR-046).
 */
export function syntheticBoardingPass(
  random: RandomSource,
  legs: readonly SyntheticLeg[],
  options: { readonly infant?: PassInfant } = {},
): { readonly text: string; readonly input: BoardingPassInput } {
  const pnr = code(random, 6);
  const input: BoardingPassInput = {
    passengerName: pick(random, NAMES),
    electronicTicket: true,
    passengerDescription:
      options.infant === 'WITH_INFANT' ? '6' : options.infant === 'INFANT' ? '4' : '0',
    legs: legs.map((leg): LegInput => ({
      pnr,
      from: leg.from,
      to: leg.to,
      carrier: leg.carrier,
      flightNumber: leg.flightNumber,
      dayOfYear: dayOfYear(leg.date),
      compartment: 'Y',
      seat: `${String(1 + Math.floor(random.nextFloat() * 32)).padStart(3, '0')}${pick(random, ['A', 'B', 'C', 'D', 'E', 'F'])}`,
      checkInSequence: String(1 + Math.floor(random.nextFloat() * 400)).padStart(4, '0'),
      passengerStatus: '1',
      fastTrack: false,
    })),
  };
  return { text: encodeBoardingPass(input), input };
}
