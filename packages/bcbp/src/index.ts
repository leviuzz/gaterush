/** Version of the boarding pass package. */
export const BCBP_VERSION = '0.2.0';

export {
  civilDate,
  dayNumber,
  dayOfYear,
  daysInYear,
  flightDateOf,
  isLeapYear,
  isoDate,
} from './calendar';
export type { CivilDate } from './calendar';
export { BcbpEncodeError, encodeBoardingPass } from './encode';
export type { BoardingPassInput, LegInput } from './encode';
export { syntheticBoardingPass } from './generate';
export type { SyntheticLeg } from './generate';
export { BCBP_ERRORS, MAX_LENGTH, parseBoardingPass } from './parse';
export type {
  BcbpErrorCode,
  BoardingPass,
  BoardingPassLeg,
  ParseResult,
  PassInfant,
} from './parse';
export { LEG_REFUSALS, dedupMaterial, legForDeparture } from './select';
export type { LegChoice, LegRefusal } from './select';
