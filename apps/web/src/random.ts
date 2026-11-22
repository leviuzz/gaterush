/** A source of random numbers from the browser's generator, for sample boarding passes. */
export function browserRandom(): { nextU32(): number; nextFloat(): number } {
  const words = new Uint32Array(2);
  return {
    nextU32() {
      crypto.getRandomValues(words);
      return words[0] ?? 0;
    },
    nextFloat() {
      crypto.getRandomValues(words);
      // 53 random bits, as the simulator's generators give them.
      return ((words[0] ?? 0) * 2097152 + ((words[1] ?? 0) >>> 11)) / 9007199254740992;
    },
  };
}
