/*
 * Server-sent events over `fetch` (S16, ADR-047). The browser's own EventSource cannot send a
 * header: a display's token would have to go in the address, where proxies and logs keep it. This
 * client sends the token as `Authorization`, reads the stream as it comes, and reconnects by
 * itself with `Last-Event-ID`, so that the server sends what was missed.
 */

/** One message of a stream. */
export interface StreamMessage {
  readonly event: string;
  readonly data: string;
  readonly id: string | null;
}

/**
 * Reads the text of an event stream (the WHATWG format), chunk by chunk: lines end with CR LF, LF
 * or CR; a blank line ends a message; lines starting with a colon are comments.
 */
export class EventStreamParser {
  /** The id of the latest message that had one: sent back as `Last-Event-ID`. */
  lastEventId: string | null = null;
  /** The delay before reconnecting the server asked for, in milliseconds. */
  retryMs: number | null = null;
  private buffer = '';
  private event = '';
  private data: string[] = [];
  private id: string | null = null;

  constructor(private readonly onMessage: (message: StreamMessage) => void) {}

  push(chunk: string): void {
    this.buffer += chunk;
    for (;;) {
      const cr = this.buffer.indexOf('\r');
      const lf = this.buffer.indexOf('\n');
      if (cr < 0 && lf < 0) return;
      let end: number;
      let next: number;
      if (cr >= 0 && (lf < 0 || cr < lf)) {
        // A CR at the end of the chunk may be the first half of a CR LF: wait for the next.
        if (cr === this.buffer.length - 1) return;
        end = cr;
        next = this.buffer.charAt(cr + 1) === '\n' ? cr + 2 : cr + 1;
      } else {
        end = lf;
        next = lf + 1;
      }
      const line = this.buffer.slice(0, end);
      this.buffer = this.buffer.slice(next);
      this.line(line);
    }
  }

  private line(line: string): void {
    if (line === '') {
      this.dispatch();
      return;
    }
    if (line.startsWith(':')) return;
    const colon = line.indexOf(':');
    const field = colon < 0 ? line : line.slice(0, colon);
    let value = colon < 0 ? '' : line.slice(colon + 1);
    if (value.startsWith(' ')) value = value.slice(1);
    switch (field) {
      case 'event':
        this.event = value;
        break;
      case 'data':
        this.data.push(value);
        break;
      case 'id':
        if (!value.includes('\u0000')) this.id = value;
        break;
      case 'retry':
        if (/^\d+$/.test(value)) this.retryMs = Number(value);
        break;
      default:
      // Unknown fields are ignored.
    }
  }

  private dispatch(): void {
    if (this.id !== null) this.lastEventId = this.id;
    if (this.data.length > 0) {
      this.onMessage({
        event: this.event === '' ? 'message' : this.event,
        data: this.data.join('\n'),
        id: this.id,
      });
    }
    this.event = '';
    this.data = [];
    this.id = null;
  }
}

export interface FollowOptions {
  /** A device's token, sent as `Authorization: Bearer`. */
  readonly token?: string;
  /** Sends the staff's session cookie. */
  readonly session?: boolean;
  readonly onMessage: (message: StreamMessage) => void;
  /** The stream is open (again). */
  readonly onOpen?: () => void;
  /** The server refused the stream (401, 403, 404): no more tries. */
  readonly onRefused?: (status: number) => void;
}

/** The first and the longest wait before reconnecting. */
const FIRST_RETRY_MS = 1000;
const LONGEST_RETRY_MS = 15_000;

/**
 * Follows a stream until the returned function is called. When the stream breaks, it reconnects
 * after 1, 2, 4... up to 15 seconds, sending the id of the latest message it had.
 */
export function follow(path: string, options: FollowOptions): () => void {
  let stopped = false;
  let controller: AbortController | null = null;
  let timer: number | undefined;
  let lastEventId: string | null = null;
  let delay = FIRST_RETRY_MS;

  const retry = (serverMs: number | null) => {
    if (stopped) return;
    const wait = Math.max(delay, serverMs ?? 0);
    delay = Math.min(delay * 2, LONGEST_RETRY_MS);
    timer = window.setTimeout(() => {
      void connect();
    }, wait);
  };

  const connect = async () => {
    if (stopped) return;
    controller = new AbortController();
    const headers: Record<string, string> = { Accept: 'text/event-stream' };
    if (options.token !== undefined) headers.Authorization = `Bearer ${options.token}`;
    if (lastEventId !== null) headers['Last-Event-ID'] = lastEventId;
    const parser = new EventStreamParser((message) => {
      // A message received: the stream works, the next break starts from a short wait.
      delay = FIRST_RETRY_MS;
      options.onMessage(message);
    });
    try {
      const response = await fetch(path, {
        headers,
        cache: 'no-store',
        credentials: options.session === true ? 'same-origin' : 'omit',
        signal: controller.signal,
      });
      if (response.status === 401 || response.status === 403 || response.status === 404) {
        stopped = true;
        options.onRefused?.(response.status);
        return;
      }
      if (!response.ok || response.body === null) {
        retry(parser.retryMs);
        return;
      }
      options.onOpen?.();
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        parser.push(decoder.decode(value, { stream: true }));
        lastEventId = parser.lastEventId ?? lastEventId;
      }
      retry(parser.retryMs);
    } catch {
      lastEventId = parser.lastEventId ?? lastEventId;
      retry(parser.retryMs);
    }
  };

  void connect();
  return () => {
    stopped = true;
    window.clearTimeout(timer);
    controller?.abort();
  };
}
