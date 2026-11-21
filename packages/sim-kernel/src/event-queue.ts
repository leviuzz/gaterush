/** An event waiting in the calendar. */
export interface ScheduledEvent<P> {
  /** Simulation time of the event, in integer milliseconds. */
  readonly timeMs: number;
  /** Tie-breaker between events at the same time: lower values are processed first. */
  readonly priority: number;
  /** Insertion sequence number: the final tie-breaker (FIFO among identical time and priority). */
  readonly seq: number;
  readonly payload: P;
}

function precedes<P>(a: ScheduledEvent<P>, b: ScheduledEvent<P>): boolean {
  if (a.timeMs !== b.timeMs) return a.timeMs < b.timeMs;
  if (a.priority !== b.priority) return a.priority < b.priority;
  return a.seq < b.seq;
}

/**
 * Future-event list implemented as a binary min-heap ordered by (time, priority, insertion order).
 * The total order makes the processing sequence fully deterministic.
 */
export class EventQueue<P> {
  private readonly heap: ScheduledEvent<P>[] = [];
  private nextSeq = 0;

  get size(): number {
    return this.heap.length;
  }

  push(timeMs: number, priority: number, payload: P): void {
    if (!Number.isSafeInteger(timeMs)) {
      throw new RangeError(`event time must be an integer number of ms, got ${timeMs}`);
    }
    if (!Number.isSafeInteger(priority)) {
      throw new RangeError(`event priority must be an integer, got ${priority}`);
    }
    const event: ScheduledEvent<P> = { timeMs, priority, seq: this.nextSeq++, payload };
    const heap = this.heap;
    heap.push(event);
    let i = heap.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      const parentEvent = heap[parent] as ScheduledEvent<P>;
      if (!precedes(event, parentEvent)) break;
      heap[i] = parentEvent;
      i = parent;
    }
    heap[i] = event;
  }

  peek(): ScheduledEvent<P> | undefined {
    return this.heap[0];
  }

  pop(): ScheduledEvent<P> | undefined {
    const heap = this.heap;
    const top = heap[0];
    const last = heap.pop();
    if (top === undefined || last === undefined || heap.length === 0) return top;
    let i = 0;
    const n = heap.length;
    for (;;) {
      const left = 2 * i + 1;
      if (left >= n) break;
      const right = left + 1;
      let child = left;
      const leftEvent = heap[left] as ScheduledEvent<P>;
      if (right < n && precedes(heap[right] as ScheduledEvent<P>, leftEvent)) child = right;
      const childEvent = heap[child] as ScheduledEvent<P>;
      if (!precedes(childEvent, last)) break;
      heap[i] = childEvent;
      i = child;
    }
    heap[i] = last;
    return top;
  }
}

/**
 * Minimal discrete-event simulation driver: a clock plus a future-event list with a causality
 * check (events can never be scheduled in the past).
 */
export class DiscreteEventSimulation<P> {
  private readonly queue = new EventQueue<P>();
  private clockMs: number;
  private processed = 0;

  constructor(startMs = 0) {
    if (!Number.isSafeInteger(startMs)) throw new RangeError('startMs must be an integer');
    this.clockMs = startMs;
  }

  /** Current simulation time (time of the event being processed). */
  get nowMs(): number {
    return this.clockMs;
  }

  get processedEvents(): number {
    return this.processed;
  }

  get pendingEvents(): number {
    return this.queue.size;
  }

  scheduleAt(timeMs: number, priority: number, payload: P): void {
    if (timeMs < this.clockMs) {
      throw new RangeError(`cannot schedule an event at ${timeMs} before now (${this.clockMs})`);
    }
    this.queue.push(timeMs, priority, payload);
  }

  /** Processes events in order until the calendar is empty. */
  run(handler: (event: ScheduledEvent<P>) => void): void {
    for (let event = this.queue.pop(); event !== undefined; event = this.queue.pop()) {
      this.clockMs = event.timeMs;
      this.processed++;
      handler(event);
    }
  }
}
