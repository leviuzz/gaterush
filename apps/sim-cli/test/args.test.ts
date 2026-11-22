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
import { recommendedComparisons as defaultCompare } from '@gateflow/sim-metrics';
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

  it('resolves lane modes (S8) and names the known ones on a mistake', () => {
    expect(
      parsePolicies('fifo-manual,fifo-manual@reactive,priority-v3@predict').map((p) => [
        p.id,
        p.lanes?.kind ?? null,
      ]),
    ).toEqual([
      ['fifo-manual', null],
      ['fifo-manual@reactive', 'reactive'],
      ['priority-v3@predict', 'predict'],
    ]);
    expect(() => parsePolicies('fifo@later')).toThrow(
      'unknown lane mode "later" in "fifo@later" (known: @reactive, @predict)',
    );
    expect(() => parsePolicies('nope@reactive')).toThrow(/unknown policy "nope@reactive"/);
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

  it('compares priority policies with manual handling and with earlier versions', () => {
    const all = parsePolicies('fifo,fifo-manual,virtual-fifo,priority-v0,priority-v1');
    expect(defaultCompare(all, 'fifo')).toEqual([
      { candidateId: 'fifo-manual', referenceId: 'fifo' },
      { candidateId: 'virtual-fifo', referenceId: 'fifo' },
      { candidateId: 'priority-v0', referenceId: 'fifo' },
      { candidateId: 'priority-v1', referenceId: 'fifo' },
      { candidateId: 'priority-v0', referenceId: 'virtual-fifo' },
      { candidateId: 'priority-v0', referenceId: 'fifo-manual' },
      { candidateId: 'priority-v1', referenceId: 'virtual-fifo' },
      { candidateId: 'priority-v1', referenceId: 'fifo-manual' },
      { candidateId: 'priority-v1', referenceId: 'priority-v0' },
    ]);
    // With manual handling as the baseline, no pair is repeated.
    expect(
      defaultCompare(parsePolicies('fifo-manual,virtual-fifo,priority-v1'), 'fifo-manual'),
    ).toEqual([
      { candidateId: 'virtual-fifo', referenceId: 'fifo-manual' },
      { candidateId: 'priority-v1', referenceId: 'fifo-manual' },
      { candidateId: 'priority-v1', referenceId: 'virtual-fifo' },
    ]);
    // Staff flight calls are a reordering of the physical queue: compared with physical FIFO.
    expect(defaultCompare(parsePolicies('virtual-fifo,fifo,fifo-manual'), 'virtual-fifo')).toEqual([
      { candidateId: 'fifo', referenceId: 'virtual-fifo' },
      { candidateId: 'fifo-manual', referenceId: 'virtual-fifo' },
      { candidateId: 'fifo-manual', referenceId: 'fifo' },
    ]);
    // The order of the list decides which version is the reference.
    expect(
      defaultCompare(parsePolicies('fifo,priority-v1,priority-v1-strict'), 'fifo').slice(2),
    ).toEqual([{ candidateId: 'priority-v1-strict', referenceId: 'priority-v1' }]);
    // The fast track is part of the selection: v2 runs the same queue as v1 and virtual FIFO.
    expect(
      defaultCompare(parsePolicies('fifo,fifo-manual,virtual-fifo,priority-v1,priority-v2'), 'fifo')
        .slice(4)
        .map((c) => `${c.candidateId}:${c.referenceId}`),
    ).toEqual([
      'priority-v1:virtual-fifo',
      'priority-v1:fifo-manual',
      'priority-v2:virtual-fifo',
      'priority-v2:fifo-manual',
      'priority-v2:priority-v1',
    ]);
    // v3 adds the S5 data-quality rules to v2 on the same queue: compared version against version.
    expect(
      defaultCompare(parsePolicies('fifo,fifo-manual,virtual-fifo,priority-v2,priority-v3'), 'fifo')
        .slice(4)
        .map((c) => `${c.candidateId}:${c.referenceId}`),
    ).toEqual([
      'priority-v2:virtual-fifo',
      'priority-v2:fifo-manual',
      'priority-v3:virtual-fifo',
      'priority-v3:fifo-manual',
      'priority-v3:priority-v2',
    ]);
  });

  it('compares lane modes with the same calls, and GateFlow as a whole with today (S8)', () => {
    const lanes = parsePolicies(
      'fifo,fifo-manual,fifo-manual@reactive,fifo-manual@predict,virtual-fifo,priority-v3,priority-v3@predict',
    );
    expect(
      defaultCompare(lanes, 'fifo')
        .slice(6)
        .map((c) => `${c.candidateId}:${c.referenceId}`),
    ).toEqual([
      'fifo-manual@reactive:fifo-manual',
      'fifo-manual@predict:fifo-manual',
      'fifo-manual@predict:fifo-manual@reactive',
      'priority-v3:virtual-fifo',
      'priority-v3:fifo-manual',
      'priority-v3@predict:priority-v3',
      'priority-v3@predict:fifo-manual@predict',
      'priority-v3@predict:fifo-manual@reactive',
    ]);
    // Without lane modes, the comparisons of S7.
    const plain = parsePolicies('fifo,fifo-manual,virtual-fifo,priority-v2,priority-v3');
    expect(defaultCompare(plain, 'fifo').map((c) => `${c.candidateId}:${c.referenceId}`)).toEqual([
      'fifo-manual:fifo',
      'virtual-fifo:fifo',
      'priority-v2:fifo',
      'priority-v3:fifo',
      'priority-v2:virtual-fifo',
      'priority-v2:fifo-manual',
      'priority-v3:virtual-fifo',
      'priority-v3:fifo-manual',
      'priority-v3:priority-v2',
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
