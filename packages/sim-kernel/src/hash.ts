/**
 * MurmurHash3 (x86, 32-bit) by Austin Appleby, public domain.
 *
 * Used to derive independent random streams from structured keys. It is not a cryptographic hash.
 * All arithmetic uses 32-bit integer operations, so results are identical on every engine.
 */

const C1 = 0xcc9e2d51;
const C2 = 0x1b873593;

function rotl32(x: number, r: number): number {
  return (x << r) | (x >>> (32 - r));
}

function mixK1(k: number): number {
  return Math.imul(rotl32(Math.imul(k, C1), 15), C2);
}

function mixH1(h: number, k: number): number {
  const h1 = rotl32(h ^ mixK1(k), 13);
  return (Math.imul(h1, 5) + 0xe6546b64) | 0;
}

function fmix32(hIn: number): number {
  let h = hIn;
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/** MurmurHash3_x86_32 of a byte sequence. Returns an unsigned 32-bit integer. */
export function murmur3_32(bytes: ArrayLike<number>, seed: number): number {
  const length = bytes.length;
  const blocks = length >>> 2;
  let h = seed | 0;
  for (let i = 0; i < blocks; i++) {
    const o = i * 4;
    const k =
      (bytes[o] ?? 0) |
      ((bytes[o + 1] ?? 0) << 8) |
      ((bytes[o + 2] ?? 0) << 16) |
      ((bytes[o + 3] ?? 0) << 24);
    h = mixH1(h, k);
  }
  const tail = blocks * 4;
  const remainder = length & 3;
  if (remainder > 0) {
    let k1 = 0;
    if (remainder === 3) k1 ^= (bytes[tail + 2] ?? 0) << 16;
    if (remainder >= 2) k1 ^= (bytes[tail + 1] ?? 0) << 8;
    k1 ^= bytes[tail] ?? 0;
    h ^= mixK1(k1);
  }
  h ^= length;
  return fmix32(h);
}

/**
 * MurmurHash3_x86_32 of a sequence of unsigned 32-bit words, each read as 4 little-endian bytes.
 * Equivalent to {@link murmur3_32} on the little-endian byte encoding of `words`.
 */
export function murmur3_32Words(words: readonly number[], seed: number): number {
  let h = seed | 0;
  for (const word of words) {
    h = mixH1(h, word | 0);
  }
  h ^= words.length * 4;
  return fmix32(h);
}

/** Encodes a string as UTF-8. Lone surrogates are replaced by U+FFFD, like `TextEncoder`. */
export function utf8Encode(text: string): Uint8Array {
  const bytes: number[] = [];
  for (const char of text) {
    let cp = char.codePointAt(0) ?? 0xfffd;
    if (cp >= 0xd800 && cp <= 0xdfff) cp = 0xfffd;
    if (cp < 0x80) {
      bytes.push(cp);
    } else if (cp < 0x800) {
      bytes.push(0xc0 | (cp >> 6), 0x80 | (cp & 0x3f));
    } else if (cp < 0x10000) {
      bytes.push(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
    } else {
      bytes.push(
        0xf0 | (cp >> 18),
        0x80 | ((cp >> 12) & 0x3f),
        0x80 | ((cp >> 6) & 0x3f),
        0x80 | (cp & 0x3f),
      );
    }
  }
  return Uint8Array.from(bytes);
}

/** Stable 32-bit code for a textual label (e.g. `"pax.arrival"`), used as a stream key component. */
export function labelCode(label: string): number {
  return murmur3_32(utf8Encode(label), 0);
}
