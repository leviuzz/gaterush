import { describe, expect, it } from 'vitest';
import { isMillis, minutesToMs, msToMinutes, secondsToMs } from '../src';

describe('time helpers', () => {
  it('converts minutes and seconds to integer milliseconds', () => {
    expect(minutesToMs(1)).toBe(60_000);
    expect(minutesToMs(0.5)).toBe(30_000);
    expect(secondsToMs(40)).toBe(40_000);
    expect(secondsToMs(0.0004)).toBe(0);
    expect(secondsToMs(0.0005)).toBe(1);
  });

  it('rounds half away from zero and never returns -0', () => {
    expect(secondsToMs(-0.0005)).toBe(-1);
    expect(Object.is(secondsToMs(-0.0001), 0)).toBe(true);
  });

  it('converts milliseconds back to minutes', () => {
    expect(msToMinutes(90_000)).toBe(1.5);
  });

  it('recognises valid Millis values', () => {
    expect(isMillis(0)).toBe(true);
    expect(isMillis(-5)).toBe(true);
    expect(isMillis(1.5)).toBe(false);
    expect(isMillis(Number.MAX_SAFE_INTEGER + 1)).toBe(false);
    expect(isMillis('1')).toBe(false);
  });
});
