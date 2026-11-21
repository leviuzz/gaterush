import { describe, expect, it } from 'vitest';
import {
  bernoulli,
  categorical,
  exponential,
  lognormalFromMeanCv,
  lognormalFromMedian,
  normal,
  streamFor,
  triangular,
  uniform,
} from '../src';

const N = 200_000;

function sample(n: number, draw: () => number): number[] {
  return Array.from({ length: n }, draw);
}

function mean(xs: readonly number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function variance(xs: readonly number[]): number {
  const m = mean(xs);
  return xs.reduce((a, b) => a + (b - m) * (b - m), 0) / (xs.length - 1);
}

function minOf(xs: readonly number[]): number {
  return xs.reduce((a, b) => (b < a ? b : a), Infinity);
}

function maxOf(xs: readonly number[]): number {
  return xs.reduce((a, b) => (b > a ? b : a), -Infinity);
}

function median(xs: readonly number[]): number {
  const sorted = [...xs].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)]!;
}

describe('distributions (statistical sanity with fixed seeds)', () => {
  it('uniform has the right mean and range', () => {
    const rng = streamFor(1, [1]);
    const xs = sample(N, () => uniform(rng, 2, 6));
    expect(minOf(xs)).toBeGreaterThanOrEqual(2);
    expect(maxOf(xs)).toBeLessThan(6);
    expect(mean(xs)).toBeCloseTo(4, 1);
  });

  it('exponential has the right mean and variance', () => {
    const rng = streamFor(1, [2]);
    const xs = sample(N, () => exponential(rng, 3));
    expect(Math.abs(mean(xs) - 3) / 3).toBeLessThan(0.01);
    expect(Math.abs(variance(xs) - 9) / 9).toBeLessThan(0.03);
    expect(minOf(xs)).toBeGreaterThanOrEqual(0);
  });

  it('normal has the right mean and variance', () => {
    const rng = streamFor(1, [3]);
    const xs = sample(N, () => normal(rng, 10, 2));
    expect(Math.abs(mean(xs) - 10)).toBeLessThan(0.02);
    expect(Math.abs(variance(xs) - 4) / 4).toBeLessThan(0.02);
  });

  it('lognormalFromMeanCv matches the requested mean and coefficient of variation', () => {
    const rng = streamFor(1, [4]);
    const xs = sample(N, () => lognormalFromMeanCv(rng, 40, 0.6));
    const m = mean(xs);
    expect(Math.abs(m - 40) / 40).toBeLessThan(0.01);
    expect(Math.abs(Math.sqrt(variance(xs)) / m - 0.6)).toBeLessThan(0.02);
  });

  it('lognormalFromMeanCv with cv = 0 returns the mean exactly', () => {
    const rng = streamFor(1, [5]);
    expect(lognormalFromMeanCv(rng, 40, 0)).toBe(40);
  });

  it('lognormalFromMedian matches the requested median', () => {
    const rng = streamFor(1, [6]);
    const xs = sample(N, () => lognormalFromMedian(rng, 70, 0.55));
    expect(Math.abs(median(xs) - 70) / 70).toBeLessThan(0.01);
    expect(minOf(xs)).toBeGreaterThan(0);
  });

  it('triangular stays in range and has mean (min + mode + max) / 3', () => {
    const rng = streamFor(1, [7]);
    const xs = sample(N, () => triangular(rng, 0.6, 0.85, 0.98));
    expect(minOf(xs)).toBeGreaterThanOrEqual(0.6);
    expect(maxOf(xs)).toBeLessThanOrEqual(0.98);
    expect(Math.abs(mean(xs) - (0.6 + 0.85 + 0.98) / 3)).toBeLessThan(0.002);
  });

  it('categorical frequencies follow the weights', () => {
    const rng = streamFor(1, [8]);
    const counts = [0, 0, 0, 0];
    for (let i = 0; i < N; i++) counts[categorical(rng, [1, 0, 2, 1])]! += 1;
    expect(counts[1]).toBe(0);
    expect(counts[0]! / N).toBeCloseTo(0.25, 2);
    expect(counts[2]! / N).toBeCloseTo(0.5, 2);
    expect(counts[3]! / N).toBeCloseTo(0.25, 2);
  });

  it('bernoulli frequency follows p', () => {
    const rng = streamFor(1, [9]);
    let hits = 0;
    for (let i = 0; i < N; i++) if (bernoulli(rng, 0.05)) hits++;
    expect(hits / N).toBeCloseTo(0.05, 2);
  });

  it('rejects invalid parameters', () => {
    const rng = streamFor(1, [10]);
    expect(() => exponential(rng, 0)).toThrow(RangeError);
    expect(() => normal(rng, 0, -1)).toThrow(RangeError);
    expect(() => lognormalFromMedian(rng, 0, 1)).toThrow(RangeError);
    expect(() => lognormalFromMeanCv(rng, 1, -0.1)).toThrow(RangeError);
    expect(() => triangular(rng, 1, 0, 2)).toThrow(RangeError);
    expect(() => categorical(rng, [0, 0])).toThrow(RangeError);
    expect(() => categorical(rng, [1, -1])).toThrow(RangeError);
    expect(() => bernoulli(rng, 1.5)).toThrow(RangeError);
    expect(() => uniform(rng, 2, 1)).toThrow(RangeError);
  });
});
