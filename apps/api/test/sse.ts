/**
 * A client of server-sent events for the tests (S16): it reads a stream over `fetch`, as the
 * display page does, and hands its messages over one by one.
 */
export interface SseMessage {
  readonly event: string;
  readonly data: string;
  readonly id: string | null;
}

export interface SseClient {
  readonly status: number;
  /** The next message, of any event or of `event`, within `timeoutMs`. */
  next(event?: string, timeoutMs?: number): Promise<SseMessage>;
  /** Resolves when the server ends the stream. */
  readonly ended: Promise<void>;
  /** Everything the stream carried so far, as text. */
  text(): string;
  close(): void;
}

export async function openSse(
  url: string,
  headers: Record<string, string> = {},
): Promise<SseClient> {
  const controller = new AbortController();
  const response = await fetch(url, {
    headers: { accept: 'text/event-stream', ...headers },
    signal: controller.signal,
  });
  const queue: SseMessage[] = [];
  const waiters: (() => void)[] = [];
  let raw = '';
  let buffer = '';
  let event = 'message';
  let data: string[] = [];
  let id: string | null = null;
  const dispatch = () => {
    if (data.length > 0) {
      queue.push({ event, data: data.join('\n'), id });
      for (const wake of waiters.splice(0)) wake();
    }
    event = 'message';
    data = [];
    id = null;
  };
  const read = async () => {
    if (response.body === null) return;
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value as Uint8Array, { stream: true });
        raw += chunk;
        buffer += chunk;
        let end = buffer.indexOf('\n');
        while (end >= 0) {
          const line = buffer.slice(0, end).replace(/\r$/, '');
          buffer = buffer.slice(end + 1);
          if (line === '') dispatch();
          else if (!line.startsWith(':')) {
            const colon = line.indexOf(':');
            const field = colon < 0 ? line : line.slice(0, colon);
            const value = colon < 0 ? '' : line.slice(colon + 1).replace(/^ /, '');
            if (field === 'event') event = value;
            else if (field === 'data') data.push(value);
            else if (field === 'id') id = value;
          }
          end = buffer.indexOf('\n');
        }
      }
    } catch {
      // Aborted by the test.
    } finally {
      for (const wake of waiters.splice(0)) wake();
    }
  };
  const ended = read();
  let done = false;
  void ended.then(() => {
    done = true;
  });
  return {
    status: response.status,
    ended,
    text: () => raw,
    async next(name?: string, timeoutMs = 5000) {
      const deadline = Date.now() + timeoutMs;
      for (;;) {
        const index = queue.findIndex((m) => name === undefined || m.event === name);
        if (index >= 0) return queue.splice(index, 1)[0] as SseMessage;
        if (done) throw new Error(`the stream ended before a ${name ?? 'message'}`);
        const left = deadline - Date.now();
        if (left <= 0) throw new Error(`no ${name ?? 'message'} within ${String(timeoutMs)} ms`);
        await new Promise<void>((resolve) => {
          const timer = setTimeout(resolve, left);
          waiters.push(() => {
            clearTimeout(timer);
            resolve();
          });
        });
      }
    },
    close() {
      controller.abort();
    },
  };
}
