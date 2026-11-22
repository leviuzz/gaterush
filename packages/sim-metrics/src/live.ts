import { MS_PER_HOUR } from '@gateflow/domain';
import type { LiveState } from '@gateflow/forecast';
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
    } else if (leave && this.inBacklog.has(ticket)) {
      this.people -= this.inBacklog.get(ticket) ?? 0;
      this.inBacklog.delete(ticket);
    }
  };

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
