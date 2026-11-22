/** Version of the digital twin. Bump on any change to the commands it sends or the checks. */
export const TWIN_VERSION = '0.1.1';

export { TwinError, expectedCallNumbers, simulatedCalls, twinDay, twinSettings } from './day';
export type { TwinDay, TwinSettings } from './day';
export { TwinScript, checkStep, playInMemory } from './script';
export type {
  TwinDivergence,
  TwinExpectation,
  TwinFlight,
  TwinIds,
  TwinPlay,
  TwinStep,
} from './script';
