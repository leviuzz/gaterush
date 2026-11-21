export { labelCode, murmur3_32, murmur3_32Words, utf8Encode } from './hash';
export { Xoshiro128StarStar, streamFor } from './prng';
export type { RandomSource } from './prng';
export { exp, ln } from './dmath';
export {
  bernoulli,
  categorical,
  exponential,
  lognormalFromMeanCv,
  lognormalFromMedian,
  normal,
  standardNormal,
  triangular,
  uniform,
} from './distributions';
export { DiscreteEventSimulation, EventQueue } from './event-queue';
export type { ScheduledEvent } from './event-queue';

/** Version of the simulation kernel. Bump on any change that can alter generated numbers. */
export const KERNEL_VERSION = '0.1.0';
