import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { EventStreamParser } from '../src/common/stream';
import type { StreamMessage } from '../src/common/stream';

/** Reads `chunks` with a fresh parser: the messages, and the parser. */
function read(...chunks: string[]) {
  const messages: StreamMessage[] = [];
  const parser = new EventStreamParser((m) => messages.push(m));
  for (const chunk of chunks) parser.push(chunk);
  return { messages, parser };
}

describe('reading an event stream (S16)', () => {
  it('reads messages, their event, id and data, and the delay asked for', () => {
    const { messages, parser } = read(
      'retry: 3000\n\n',
      'id: 12\nevent: board\ndata: {"seq":12}\n\n',
      ': a comment\nevent: heartbeat\ndata: {"at":1}\n\n',
      'data: first line\ndata: second line\n\n',
    );
    expect(messages).toEqual([
      { event: 'board', data: '{"seq":12}', id: '12' },
      { event: 'heartbeat', data: '{"at":1}', id: null },
      { event: 'message', data: 'first line\nsecond line', id: null },
    ]);
    expect(parser.lastEventId).toBe('12');
    expect(parser.retryMs).toBe(3000);
  });

  it('takes any line end, and messages cut anywhere', () => {
    const text = 'id: 1\r\nevent: board\r\ndata: a\r\n\r\nid: 2\rdata: b\r\rid: 3\ndata: c\n\n';
    const whole = read(text).messages;
    expect(whole.map((m) => [m.id, m.data])).toEqual([
      ['1', 'a'],
      ['2', 'b'],
      ['3', 'c'],
    ]);
    // Cut into pieces at every place, a CR LF split in two included, it reads the same.
    fc.assert(
      fc.property(fc.uniqueArray(fc.integer({ min: 1, max: text.length - 1 })), (cuts) => {
        const points = [0, ...cuts.sort((a, b) => a - b), text.length];
        const chunks = points.slice(1).map((end, i) => text.slice(points[i], end));
        expect(read(...chunks).messages).toEqual(whole);
      }),
    );
  });

  it('keeps the latest id, also from a message without data, and ignores what it does not know', () => {
    const { messages, parser } = read('id: 7\n\n', 'id: bad\u0000id\nfoo: bar\ndata: x\n\n');
    expect(messages).toEqual([{ event: 'message', data: 'x', id: null }]);
    expect(parser.lastEventId).toBe('7');
    // An unfinished message waits for its blank line.
    const pending = read('id: 9\ndata: y\n');
    expect(pending.messages).toEqual([]);
    pending.parser.push('\n');
    expect(pending.messages).toEqual([{ event: 'message', data: 'y', id: '9' }]);
  });
});
