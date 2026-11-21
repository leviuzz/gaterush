import { murmur3_32Words } from './hash';

/** A source of uniformly distributed random numbers. */
export interface RandomSource {
  /** Next unsigned 32-bit integer. */
  nextU32(): number;
  /** Next double uniformly distributed in [0, 1), with 53 random bits. */
  nextFloat(): number;
}

const MAX_U32 = 0xffffffff;

function rotl32(x: number, k: number): number {
  return (x << k) | (x >>> (32 - k));
}

/**
 * xoshiro128** 1.1 by David Blackman and Sebastiano Vigna (public domain): a small, fast generator
 * with a 128-bit state and period 2^128 - 1. Implemented with 32-bit integer operations only, so
 * the output sequence is identical on every JavaScript engine.
 */
export class Xoshiro128StarStar implements RandomSource {
  private s0: number;
  private s1: number;
  private s2: number;
  private s3: number;

  constructor(s0: number, s1: number, s2: number, s3: number) {
    if ((s0 | s1 | s2 | s3) === 0) {
      throw new RangeError('xoshiro128** state must not be all zeros');
    }
    this.s0 = s0 | 0;
    this.s1 = s1 | 0;
    this.s2 = s2 | 0;
    this.s3 = s3 | 0;
  }

  nextU32(): number {
    const result = Math.imul(rotl32(Math.imul(this.s1, 5), 7), 9) >>> 0;
    const t = this.s1 << 9;
    this.s2 ^= this.s0;
    this.s3 ^= this.s1;
    this.s1 ^= this.s2;
    this.s0 ^= this.s3;
    this.s2 ^= t;
    this.s3 = rotl32(this.s3, 11);
    return result;
  }

  nextFloat(): number {
    const high = this.nextU32() >>> 5; // 27 bits
    const low = this.nextU32() >>> 6; // 26 bits
    return (high * 67108864 + low) / 9007199254740992; // (high * 2^26 + low) / 2^53
  }

  /** Current state as unsigned 32-bit words (useful for tests and diagnostics). */
  state(): [number, number, number, number] {
    return [this.s0 >>> 0, this.s1 >>> 0, this.s2 >>> 0, this.s3 >>> 0];
  }
}

const STATE_SEEDS = [0x9e3779b9, 0x85ebca6b, 0xc2b2ae35, 0x27d4eb2f] as const;

function assertU32(value: number, what: string): void {
  if (!Number.isInteger(value) || value < 0 || value > MAX_U32) {
    throw new RangeError(`${what} must be an integer in [0, 2^32 - 1], got ${value}`);
  }
}

/**
 * Derives an independent random stream from a master `seed` and a structured `key`
 * (for example `[labelCode('pax.arrival'), flightIndex, passengerIndex]`).
 *
 * Each (seed, key) pair always yields the same sequence, and adding new keys never perturbs
 * existing streams. This is what makes simulations reproducible and lets every policy see the
 * same random inputs ("common random numbers").
 */
export function streamFor(seed: number, key: readonly number[]): Xoshiro128StarStar {
  assertU32(seed, 'seed');
  for (const part of key) assertU32(part, 'stream key component');
  const words = [seed, ...key];
  const s0 = murmur3_32Words(words, STATE_SEEDS[0]);
  const s1 = murmur3_32Words(words, STATE_SEEDS[1]);
  const s2 = murmur3_32Words(words, STATE_SEEDS[2]);
  const s3 = murmur3_32Words(words, STATE_SEEDS[3]);
  if ((s0 | s1 | s2 | s3) === 0) {
    // Astronomically unlikely; fall back to a fixed non-zero state to keep the generator valid.
    return new Xoshiro128StarStar(STATE_SEEDS[0], STATE_SEEDS[1], STATE_SEEDS[2], STATE_SEEDS[3]);
  }
  return new Xoshiro128StarStar(s0, s1, s2, s3);
}
