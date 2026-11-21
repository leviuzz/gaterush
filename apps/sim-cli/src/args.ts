import { LANE_MODES, findPolicyPreset } from '@gateflow/queue-core';
import type { Policy } from '@gateflow/queue-core';
import type { PolicyComparison } from '@gateflow/sim-metrics';

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
      const at = id.indexOf('@');
      const mode = at < 0 ? undefined : id.slice(at + 1);
      throw new UsageError(
        mode !== undefined && LANE_MODES[mode] === undefined
          ? `unknown lane mode "${mode}" in "${id}" (known: ${Object.keys(LANE_MODES)
              .map((m) => `@${m}`)
              .join(', ')})`
          : `unknown policy "${id}" (run "gateflow-sim policies" to list them)`,
      );
    }
    return policy;
  });
}

/**
 * Parses comparisons written as `candidate:reference` pairs, e.g.
 * `priority-v0:fifo,priority-v0:virtual-fifo`. Both policies must be among `policies`.
 */
export function parseComparisons(spec: string, policies: readonly Policy[]): PolicyComparison[] {
  const ids = new Set(policies.map((p) => p.id));
  const pairs: PolicyComparison[] = [];
  const seen = new Set<string>();
  for (const part of spec.split(',')) {
    const match = /^\s*([^:\s]+)\s*:\s*([^:\s]+)\s*$/.exec(part);
    if (match === null) {
      throw new UsageError(`invalid comparison "${part.trim()}": expected candidate:reference`);
    }
    const [candidateId, referenceId] = [match[1] ?? '', match[2] ?? ''];
    for (const id of [candidateId, referenceId]) {
      if (!ids.has(id))
        throw new UsageError(`comparison "${part.trim()}": "${id}" is not in --policies`);
    }
    if (candidateId === referenceId) {
      throw new UsageError(`comparison "${part.trim()}" compares a policy with itself`);
    }
    const key = `${candidateId}:${referenceId}`;
    if (seen.has(key)) throw new UsageError(`duplicate comparison "${key}"`);
    seen.add(key);
    pairs.push({ candidateId, referenceId });
  }
  return pairs;
}

export function parsePositiveInteger(text: string, what: string): number {
  if (!/^\d+$/.test(text) || Number(text) < 1) {
    throw new UsageError(`${what} must be a positive integer, got "${text}"`);
  }
  return Number(text);
}
