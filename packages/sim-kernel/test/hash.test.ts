import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { labelCode, murmur3_32, murmur3_32Words, utf8Encode } from '../src';

/**
 * Known-answer values. They were cross-checked against an independent Python implementation of
 * the reference C code and against the `mmh3` library; several are the published test vectors.
 */
const MURMUR_VECTORS: [string, number, number][] = [
  ['', 0, 0],
  ['', 1, 0x514e28b7],
  ['', 0xffffffff, 0x81f16f39],
  ['test', 0, 0xba6bd213],
  ['abc', 0, 3017643002],
  ['Hello, world!', 0x9747b28c, 0x24884cba],
  ['The quick brown fox jumps over the lazy dog', 0x9747b28c, 0x2fa826cd],
  ['pax.arrival', 0, 2215973015],
  ['città ✈ 東京', 7, 1013594238],
];

const WORD_VECTORS: [number[], number, number][] = [
  [[1, 2, 3], 0x9e3779b9, 2107016148],
  [[42], 0, 3160117731],
  [[0xffffffff, 0, 7, 123456789], 0x27d4eb2f, 2469769496],
];

function littleEndianBytes(words: readonly number[]): Uint8Array {
  const out = new Uint8Array(words.length * 4);
  const view = new DataView(out.buffer);
  words.forEach((w, i) => {
    view.setUint32(i * 4, w >>> 0, true);
  });
  return out;
}

describe('murmur3_32', () => {
  it.each(MURMUR_VECTORS)('hash(%j, seed %i) = %i', (text, seed, expected) => {
    expect(murmur3_32(utf8Encode(text), seed)).toBe(expected);
  });

  it.each(WORD_VECTORS)('words %j with seed %i = %i', (words, seed, expected) => {
    expect(murmur3_32Words(words, seed)).toBe(expected);
  });

  it('word hashing equals byte hashing of the little-endian encoding', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 0, max: 0xffffffff }), { maxLength: 12 }),
        fc.integer({ min: 0, max: 0xffffffff }),
        (words, seed) =>
          murmur3_32Words(words, seed) === murmur3_32(littleEndianBytes(words), seed),
      ),
      { numRuns: 1000 },
    );
  });

  it('always returns an unsigned 32-bit integer', () => {
    fc.assert(
      fc.property(fc.uint8Array({ maxLength: 64 }), fc.integer(), (bytes, seed) => {
        const h = murmur3_32(bytes, seed);
        return Number.isInteger(h) && h >= 0 && h <= 0xffffffff;
      }),
      { numRuns: 1000 },
    );
  });
});

describe('utf8Encode', () => {
  it('matches TextEncoder, including lone surrogates', () => {
    const encoder = new TextEncoder();
    fc.assert(
      fc.property(fc.string({ unit: 'binary', maxLength: 40 }), (text) => {
        expect(Array.from(utf8Encode(text))).toEqual(Array.from(encoder.encode(text)));
      }),
      { numRuns: 1000 },
    );
    expect(Array.from(utf8Encode('\ud800x'))).toEqual(Array.from(encoder.encode('\ud800x')));
  });
});

describe('labelCode', () => {
  it('is the murmur3 hash of the UTF-8 label with seed 0', () => {
    expect(labelCode('pax.arrival')).toBe(2215973015);
  });
});
