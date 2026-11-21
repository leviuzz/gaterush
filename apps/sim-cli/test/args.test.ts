import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { findPolicyPreset } from '@gateflow/queue-core';
import {
  UsageError,
  parseComparisons,
  parsePolicies,
  parsePositiveInteger,
  parseSeeds,
} from '../src/args';
import { defaultCompare } from '../src/cli';
import { CLI_VERSION } from '../src/version';

describe('parseSeeds', () => {
  it('parses single seeds, ranges and lists into sorted unique seeds', () => {
    expect(parseSeeds('7')).toEqual([7]);
    expect(parseSeeds('1-3')).toEqual([1, 2, 3]);
    expect(parseSeeds('10, 1-3,2')).toEqual([1, 2, 3, 10]);
    expect(parseSeeds('0')).toEqual([0]);
    expect(parseSeeds('4294967295')).toEqual([4294967295]);
  });

  it.each(['', 'a', '3-1', '1,,2', '-1', '1.5', '4294967296', '1-200000'])(
    'rejects "%s"',
    (spec) => {
      expect(() => parseSeeds(spec)).toThrow(UsageError);
    },
  );
});

describe('parsePolicies', () => {
  it('resolves presets in the given order', () => {
    expect(parsePolicies('priority-v0,fifo').map((p) => p.id)).toEqual(['priority-v0', 'fifo']);
  });

  it('rejects unknown, duplicate and empty lists', () => {
    expect(() => parsePolicies('fifo,nope')).toThrow(UsageError);
    expect(() => parsePolicies('fifo,fifo')).toThrow(UsageError);
    expect(() => parsePolicies(' , ')).toThrow(UsageError);
  });
});

describe('comparisons', () => {
  const policies = parsePolicies('fifo,virtual-fifo,priority-v0');

  it('parses candidate:reference pairs', () => {
    expect(parseComparisons('priority-v0:fifo, priority-v0 : virtual-fifo', policies)).toEqual([
      { candidateId: 'priority-v0', referenceId: 'fifo' },
      { candidateId: 'priority-v0', referenceId: 'virtual-fifo' },
    ]);
  });

  it.each([
    'priority-v0',
    'priority-v0:nope',
    'fifo:fifo',
    'priority-v0:fifo,priority-v0:fifo',
    '',
  ])('rejects "%s"', (spec) => {
    expect(() => parseComparisons(spec, policies)).toThrow(UsageError);
  });

  it('compares with the baseline, and each priority policy with the FIFO policy of the same queue', () => {
    expect(defaultCompare(policies, 'fifo')).toEqual([
      { candidateId: 'virtual-fifo', referenceId: 'fifo' },
      { candidateId: 'priority-v0', referenceId: 'fifo' },
      { candidateId: 'priority-v0', referenceId: 'virtual-fifo' },
    ]);
    expect(defaultCompare(policies, 'virtual-fifo')).toEqual([
      { candidateId: 'fifo', referenceId: 'virtual-fifo' },
      { candidateId: 'priority-v0', referenceId: 'virtual-fifo' },
    ]);
    // The physical FIFO queue does not operate the same queue as priority-v0.
    const physicalOnly = [findPolicyPreset('fifo')!, findPolicyPreset('priority-v0')!];
    expect(defaultCompare(physicalOnly, 'fifo')).toEqual([
      { candidateId: 'priority-v0', referenceId: 'fifo' },
    ]);
  });
});

describe('parsePositiveInteger', () => {
  it('accepts positive integers only', () => {
    expect(parsePositiveInteger('2000', 'x')).toBe(2000);
    expect(() => parsePositiveInteger('0', 'x')).toThrow(UsageError);
    expect(() => parsePositiveInteger('1e3', 'x')).toThrow(UsageError);
  });
});

describe('version', () => {
  it('matches package.json', () => {
    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
      version: string;
    };
    expect(CLI_VERSION).toBe(pkg.version);
  });
});
