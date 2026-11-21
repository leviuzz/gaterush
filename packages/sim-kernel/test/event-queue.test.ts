import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { DiscreteEventSimulation, EventQueue } from '../src';

describe('EventQueue', () => {
  it('pops events in (time, priority, insertion) order', () => {
    fc.assert(
      fc.property(
        fc.array(fc.tuple(fc.integer({ min: 0, max: 50 }), fc.integer({ min: 0, max: 3 })), {
          maxLength: 200,
        }),
        (entries) => {
          const queue = new EventQueue<number>();
          entries.forEach(([time, priority], index) => {
            queue.push(time, priority, index);
          });
          const expected = entries
            .map(([time, priority], index) => ({ time, priority, index }))
            .sort((a, b) => a.time - b.time || a.priority - b.priority || a.index - b.index)
            .map((e) => e.index);
          const actual: number[] = [];
          for (let e = queue.pop(); e !== undefined; e = queue.pop()) actual.push(e.payload);
          expect(actual).toEqual(expected);
          expect(queue.size).toBe(0);
        },
      ),
      { numRuns: 1000 },
    );
  });

  it('supports interleaved pushes and pops', () => {
    const queue = new EventQueue<string>();
    queue.push(10, 0, 'a');
    queue.push(5, 0, 'b');
    expect(queue.pop()?.payload).toBe('b');
    queue.push(7, 1, 'c');
    queue.push(7, 0, 'd');
    expect(queue.peek()?.payload).toBe('d');
    expect([queue.pop()?.payload, queue.pop()?.payload, queue.pop()?.payload]).toEqual([
      'd',
      'c',
      'a',
    ]);
    expect(queue.pop()).toBeUndefined();
  });

  it('rejects non-integer times', () => {
    const queue = new EventQueue<null>();
    expect(() => {
      queue.push(1.5, 0, null);
    }).toThrow(RangeError);
  });
});

describe('DiscreteEventSimulation', () => {
  it('advances the clock and lets handlers schedule future events', () => {
    const sim = new DiscreteEventSimulation<string>(0);
    const log: string[] = [];
    sim.scheduleAt(10, 0, 'first');
    sim.run((event) => {
      log.push(`${event.timeMs}:${event.payload}`);
      if (event.payload === 'first') sim.scheduleAt(sim.nowMs + 5, 0, 'second');
    });
    expect(log).toEqual(['10:first', '15:second']);
    expect(sim.nowMs).toBe(15);
    expect(sim.processedEvents).toBe(2);
  });

  it('forbids scheduling in the past (causality)', () => {
    const sim = new DiscreteEventSimulation<string>(0);
    sim.scheduleAt(10, 0, 'x');
    expect(() => {
      sim.run(() => {
        sim.scheduleAt(9, 0, 'past');
      });
    }).toThrow(RangeError);
  });
});
