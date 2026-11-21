import { findPolicyPreset } from '@gateflow/priority-engine';
import type { Policy } from '@gateflow/priority-engine';

/** Thrown for invalid command-line usage (exit code 2). */
export class UsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UsageError';
  }
}

const MAX_SEED = 0xffffffff;
const MAX_SEED_COUNT = 100_000;

function parseSeed(text: string): number {
  if (!/^\d+$/.test(text))
    throw new UsageError(`invalid seed "${text}": expected a non-negative integer`);
  const value = Number(text);
  if (value > MAX_SEED) throw new UsageError(`seed ${text} exceeds 2^32 - 1`);
  return value;
}

/**
 * Parses a seed specification such as `1-200`, `7` or `1-10,42,100-105` into a sorted list of
 * unique seeds.
 */
export function parseSeeds(spec: string): number[] {
  const seeds = new Set<number>();
  for (const part of spec.split(',')) {
    const item = part.trim();
    if (item === '') throw new UsageError(`invalid seed specification "${spec}"`);
    const range = /^(\d+)-(\d+)$/.exec(item);
    if (range) {
      const from = parseSeed(range[1] ?? '');
      const to = parseSeed(range[2] ?? '');
      if (to < from) throw new UsageError(`invalid seed range "${item}"`);
      if (to - from + 1 + seeds.size > MAX_SEED_COUNT) {
        throw new UsageError(`at most ${MAX_SEED_COUNT} seeds per run`);
      }
      for (let s = from; s <= to; s++) seeds.add(s);
    } else {
      seeds.add(parseSeed(item));
    }
    if (seeds.size > MAX_SEED_COUNT)
      throw new UsageError(`at most ${MAX_SEED_COUNT} seeds per run`);
  }
  return [...seeds].sort((a, b) => a - b);
}

/** Resolves a comma-separated list of policy preset ids. */
export function parsePolicies(list: string): Policy[] {
  const ids = list
    .split(',')
    .map((id) => id.trim())
    .filter((id) => id !== '');
  if (ids.length === 0) throw new UsageError('at least one policy is required');
  if (new Set(ids).size !== ids.length) throw new UsageError(`duplicate policies in "${list}"`);
  return ids.map((id) => {
    const policy = findPolicyPreset(id);
    if (policy === undefined) {
      throw new UsageError(`unknown policy "${id}" (run "gateflow-sim policies" to list them)`);
    }
    return policy;
  });
}

export function parsePositiveInteger(text: string, what: string): number {
  if (!/^\d+$/.test(text) || Number(text) < 1) {
    throw new UsageError(`${what} must be a positive integer, got "${text}"`);
  }
  return Number(text);
}
