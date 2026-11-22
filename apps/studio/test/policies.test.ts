import { describe, expect, it } from 'vitest';
import { interval, num, signed, thousands, valueText } from '../src/format';
import { orderedPolicyIds, policyName } from '../src/policies';

describe('policies of the Studio', () => {
  it('lists the chosen policies in the order of the CLI runs', () => {
    expect(
      orderedPolicyIds(
        new Set([
          'priority-v3@predict',
          'fifo',
          'fifo-manual@predict',
          'priority-v3',
          'fifo-manual@reactive',
          'fifo-manual',
        ]),
      ),
    ).toEqual([
      'fifo',
      'fifo-manual',
      'fifo-manual@reactive',
      'fifo-manual@predict',
      'priority-v3',
      'priority-v3@predict',
    ]);
    expect(policyName('fifo-manual@reactive')).toBe(
      "Physical queue with staff calling closing flights (A'), supervisor's lanes",
    );
    expect(policyName('priority-v3@predict')).toBe("GateFlow priority v3, GateFlow's lanes");
  });

  it('formats numbers without a negative zero', () => {
    expect(num(-0.04)).toBe('0.0');
    expect(signed(0.04)).toBe('0.0');
    expect(signed(1.26)).toBe('+1.3');
    expect(interval(19.7, 17.8, 21.6)).toBe('+19.7 [17.8, 21.6]');
    expect(thousands(21791.6)).toBe('21,792');
    expect(valueText({ a: 1 })).toBe('{"a":1}');
    expect(valueText('x'.repeat(200), 10)).toBe(`${'x'.repeat(9)}…`);
  });
});
