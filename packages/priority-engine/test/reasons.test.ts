import { describe, expect, it } from 'vitest';
import { REASON_CODES, REASON_DESCRIPTIONS, describeReason } from '../src';

describe('reason descriptions', () => {
  it('describe every reason code, and nothing else', () => {
    expect(Object.keys(REASON_DESCRIPTIONS).sort()).toEqual([...REASON_CODES].sort());
  });

  it.each(REASON_CODES)('%s has a short title and one sentence', (code) => {
    const { title, text } = describeReason(code);
    expect(title.length).toBeGreaterThan(3);
    expect(title.length).toBeLessThanOrEqual(36);
    expect(text).toMatch(/^[A-Z].*\.$/);
    expect(text).not.toContain('\n');
  });

  it('give every code its own title', () => {
    const titles = REASON_CODES.map((code) => describeReason(code).title);
    expect(new Set(titles).size).toBe(titles.length);
  });
});
