import { MS_PER_HOUR, MS_PER_MINUTE } from '@gateflow/domain';
import type { LiveState, ThroughputMinute } from '@gateflow/forecast';
import type { DayEvent, Population } from '@gateflow/sim-model';

/*
 * What the live system would know of a simulated day, as it goes (S22.3): the parties who took a
 * number and when, the people not yet admitted, the lanes open and when they last changed. It is
 * what the console reads from a checkpoint's log (S21, S22), worked out from the day's events
 * while the day is simulated, so that GateFlow's console can be asked in the middle of it. The
 * backtest's `SimulatedDay` reads the same after the day, on its own: a test checks they agree.
 */

/** What the live system knows of a simulated day, from its events as they happen. */
export class LiveView {
  /** The parties who took a number (assisted ones take none), in order. */
  private readonly arrivals: { readonly atMs: number; readonly people: number }[] = [];
  /** The first arrival still within the last hour, as of the latest question. */
  private windowStart = 0;
  /** The people of each ticket not yet admitted, out of play or absent. */
  private readonly inBacklog = new Map<string, number>();
  private people = 0;
  private open: number | null = null;
  private changedAtMs: number | null = null;
  /** Each change of the people not yet admitted, in order, and the people it admitted (S22.5). */
  private readonly changes: {
    readonly atMs: number;
    readonly delta: number;
    readonly admitted: number;
  }[] = [];
  /** The lanes open from each change of the lanes on, in order. */
  private readonly lanes: { readonly atMs: number; readonly open: number }[] = [];

  constructor(private readonly population: Population) {}

  /** The day's observer: give it every event of the day, in order. */
  readonly observe = (event: DayEvent): void => {
    if (event.type === 'ARRIVED') {
      const p = this.population.passengers[event.party];
      if (p?.path === 'QUEUE') this.arrivals.push({ atMs: event.atMs, people: p.partySize });
      return;
    }
    if (event.type === 'LANES') {
      // The lanes the day opens with are not a change: the console's day opens with them.
      if (this.open !== null && event.open !== this.open) this.changedAtMs = event.atMs;
      this.open = event.open;
      this.lanes.push({ atMs: event.atMs, open: event.open });
      return;
    }
    if (event.type !== 'QUEUE') return;
    const e = event.event;
    const enter = e.type === 'ISSUED' || e.type === 'REACTIVATED';
    const leave = e.type === 'ADMITTED' || e.type === 'EXPIRED' || e.type === 'NO_SHOW';
    if (!enter && !leave) return;
    const ticket = 'ticketId' in e ? e.ticketId : '';
    if (enter && !this.inBacklog.has(ticket)) {
      const size = this.population.passengers[event.party]?.partySize ?? 0;
      this.inBacklog.set(ticket, size);
      this.people += size;
      this.changes.push({ atMs: event.atMs, delta: size, admitted: 0 });
    } else if (leave && this.inBacklog.has(ticket)) {
      const size = this.inBacklog.get(ticket) ?? 0;
      this.people -= size;
      this.inBacklog.delete(ticket);
      this.changes.push({
        atMs: event.atMs,
        delta: -size,
        admitted: e.type === 'ADMITTED' ? size : 0,
      });
    }
  };

  /**
   * The minutes of the window before `nowMs`, oldest first (S22.5): the people not yet admitted and
   * the lanes open at each minute's start, after everything at that instant, and the people
   * admitted during it. What the log gives the console of the last minutes, once everything that
   * happens at `nowMs` is in.
   */
  minutesBefore(nowMs: number, windowMinutes: number): ThroughputMinute[] {
    const start = nowMs - windowMinutes * MS_PER_MINUTE;
    const admitted = new Array<number>(windowMinutes).fill(0);
    const backlogs = new Array<number>(windowMinutes).fill(0);
    let backlog = this.people;
    let i = this.changes.length - 1;
    // Walk back from now: a minute's backlog is now's, less the changes after its start.
    for (let m = windowMinutes - 1; m >= 0; m--) {
      const from = start + m * MS_PER_MINUTE;
      for (let c = this.changes[i]; c !== undefined && c.atMs > from; c = this.changes[--i]) {
        backlog -= c.delta;
        if (c.atMs < from + MS_PER_MINUTE) admitted[m] = (admitted[m] ?? 0) + c.admitted;
      }
      backlogs[m] = backlog;
      // People admitted at the minute's very start are the minute's too.
      for (let j = i; j >= 0; j--) {
        const c = this.changes[j];
        if (c === undefined || c.atMs < from) break;
        admitted[m] = (admitted[m] ?? 0) + c.admitted;
      }
    }
    let l = this.lanes.length - 1;
    const minutes: ThroughputMinute[] = [];
    const lanesAt: number[] = [];
    for (let m = windowMinutes - 1; m >= 0; m--) {
      const from = start + m * MS_PER_MINUTE;
      while (l >= 0 && (this.lanes[l]?.atMs ?? 0) > from) l--;
      lanesAt[m] = l >= 0 ? (this.lanes[l]?.open ?? 0) : 0;
    }
    for (let m = 0; m < windowMinutes; m++) {
      minutes.push({
        backlog: backlogs[m] ?? 0,
        lanes: lanesAt[m] ?? 0,
        admitted: admitted[m] ?? 0,
      });
    }
    return minutes;
  }

  /** When the lanes open last changed, after the day's first lanes; null: not yet. */
  get lanesChangedAtMs(): number | null {
    return this.changedAtMs;
  }

  /**
   * What a forecast made at `nowMs` reads: the people who took a number in the hour before (not
   * at `nowMs` itself), the people not yet admitted and the lanes open, once everything that
   * happens at `nowMs` is in. Asked at times that never go back.
   */
  stateNow(nowMs: number): LiveState {
    const from = nowMs - MS_PER_HOUR;
    while ((this.arrivals[this.windowStart]?.atMs ?? Infinity) < from) this.windowStart++;
    let arrivalsLastHour = 0;
    for (let i = this.windowStart; i < this.arrivals.length; i++) {
      const a = this.arrivals[i];
      if (a === undefined || a.atMs >= nowMs) break;
      arrivalsLastHour += a.people;
    }
    return {
      nowMs,
      arrivalsLastHour,
      backlog: this.people,
      lanesOpen: Math.max(1, this.open ?? 0),
      ratePerLanePerHour: this.population.checkpoint.serviceRatePerLanePerHour,
    };
  }
}
