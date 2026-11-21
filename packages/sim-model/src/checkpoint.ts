import { SEGMENTS } from '@gateflow/domain';
import type { RiskClass } from '@gateflow/domain';
import type { CheckpointEstimates } from '@gateflow/priority-engine';
import {
  CheckpointQueue,
  callAheadTarget,
  fastTrackResponseEstimateMs,
  responseEstimateMs,
} from '@gateflow/queue-core';
import type { Policy, QueueEvent } from '@gateflow/queue-core';
import { DiscreteEventSimulation } from '@gateflow/sim-kernel';
import type {
  CheckpointSpec,
  PassengerOutcome,
  Population,
  RunResult,
  SimPassenger,
  SimulationOptions,
} from './types';

/**
 * Order of events at the same instant: lanes open or close first (a lane closing at t takes
 * nobody at t); then lanes are freed; then passengers present at the access point; then timeouts
 * are applied (so presenting exactly at a deadline is on time); arrivals come last. With a
 * physical queue (or a virtual queue whose calls are answered instantly) this reproduces the S1
 * model exactly.
 */
const LANE_CHANGE = 0;
const SERVICE_END = 1;
const PRESENT = 2;
const TIMEOUT = 3;
const ARRIVAL = 4;

/**
 * A passenger answers every call after the first one at once, so they need at most two tickets.
 * The bound turns a modelling error into an exception instead of an endless loop.
 */
const MAX_TICKETS_PER_PASSENGER = 100;

type ModelEvent =
  | { readonly kind: typeof SERVICE_END; readonly lane: number; readonly passenger: number }
  | { readonly kind: typeof LANE_CHANGE; readonly lanes: number }
  | { readonly kind: typeof PRESENT; readonly passenger: number }
  | { readonly kind: typeof TIMEOUT }
  | { readonly kind: typeof ARRIVAL; readonly passenger: number };

/** Mutable bookkeeping of one passenger during a run. */
interface PassengerState {
  /** Current ticket (a new one is issued when the previous one expires). */
  ticketId: string;
  tickets: number;
  /** True once the passenger has been at the access point: later calls are answered at once. */
  presented: boolean;
  classAtArrival: RiskClass | null;
  firstCalledAtMs: number;
  admittedAtMs: number;
  serviceStartMs: number;
  serviceEndMs: number;
  lane: number;
  calls: number;
  noShows: number;
  reactivations: number;
  prioritized: boolean;
  /** Most overtakes suffered by an expired ticket of this passenger. */
  maxOvertakenExpired: number;
}

/** Thrown when a population violates the model's preconditions. */
export class PopulationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PopulationError';
  }
}

function requireInteger(value: number, what: string, min = Number.MIN_SAFE_INTEGER): void {
  if (!Number.isSafeInteger(value) || value < min) {
    throw new PopulationError(`${what} must be an integer >= ${min}, got ${value}`);
  }
}

function validateCheckpointSpec(spec: CheckpointSpec): void {
  const schedule = spec.laneSchedule;
  if (schedule.length === 0) throw new PopulationError('checkpoint.laneSchedule must not be empty');
  schedule.forEach((entry, i) => {
    requireInteger(entry.fromMs, `laneSchedule[${i}].fromMs`, 0);
    requireInteger(entry.lanes, `laneSchedule[${i}].lanes`, 1);
    const previous = schedule[i - 1];
    if (previous === undefined) {
      if (entry.fromMs !== 0) throw new PopulationError('laneSchedule must start at 0');
    } else if (entry.fromMs <= previous.fromMs) {
      throw new PopulationError('laneSchedule must be sorted by strictly increasing fromMs');
    }
  });
  const rate = spec.serviceRatePerLanePerHour;
  if (!Number.isFinite(rate) || rate <= 0) {
    throw new PopulationError(`serviceRatePerLanePerHour must be positive, got ${rate}`);
  }
  requireInteger(spec.processEstimateMs, 'checkpoint.processEstimateMs', 0);
}

export function validatePopulation(population: Population): void {
  const { checkpoint, flights, passengers } = population;
  validateCheckpointSpec(checkpoint);
  flights.forEach((flight, i) => {
    if (flight.index !== i)
      throw new PopulationError(`flight ${flight.id} has index ${flight.index}, expected ${i}`);
    requireInteger(flight.stdMs, `stdMs of ${flight.id}`);
    requireInteger(flight.boardingCloseMs, `boardingCloseMs of ${flight.id}`);
  });
  const ids = new Set<string>();
  passengers.forEach((p, i) => {
    if (p.index !== i)
      throw new PopulationError(`passenger ${p.id} has index ${p.index}, expected ${i}`);
    if (p.id.length === 0 || p.id.includes('#')) {
      throw new PopulationError(`passenger id ${JSON.stringify(p.id)} must be non-empty without #`);
    }
    if (ids.has(p.id)) throw new PopulationError(`duplicate passenger id ${p.id}`);
    ids.add(p.id);
    if (p.flightIndex < 0 || p.flightIndex >= flights.length || !Number.isInteger(p.flightIndex)) {
      throw new PopulationError(`passenger ${p.id} references unknown flight ${p.flightIndex}`);
    }
    if (!(SEGMENTS as readonly string[]).includes(p.segment)) {
      throw new PopulationError(`passenger ${p.id} has unknown segment ${p.segment}`);
    }
    requireInteger(p.arrivalMs, `arrivalMs of ${p.id}`);
    requireInteger(p.serviceMs, `serviceMs of ${p.id}`, 0);
    requireInteger(p.walkMs, `walkMs of ${p.id}`, 0);
    requireInteger(p.walkEstimateMs, `walkEstimateMs of ${p.id}`, 0);
    requireInteger(p.callResponseMs, `callResponseMs of ${p.id}`, 0);
    requireInteger(p.absenceDelayMs, `absenceDelayMs of ${p.id}`, 0);
    requireInteger(p.partySize, `partySize of ${p.id}`, 1);
    // Widened: callers may pass untyped data.
    const path: string = p.path;
    if (path !== 'QUEUE' && path !== 'ASSISTED') {
      throw new PopulationError(`passenger ${p.id} has unknown path ${path}`);
    }
    const strategic: unknown = p.strategic;
    if (typeof strategic !== 'boolean') {
      throw new PopulationError(`strategic of ${p.id} must be a boolean`);
    }
  });
}

/**
 * Delay between the first call and the passenger presenting at the access point. After taking the
 * ticket the passenger walks away for at most `callResponseMs` and walks back when called, so a
 * call that comes sooner is answered sooner; a passenger who has not yet left cannot miss it.
 */
export function firstCallDelayMs(passenger: SimPassenger, sinceTicketMs: number): number {
  if (sinceTicketMs < passenger.callResponseMs) return Math.max(0, sinceTicketMs);
  return passenger.callResponseMs + passenger.absenceDelayMs;
}

function at<T>(items: readonly T[], index: number, what: string): T {
  const item = items[index];
  if (item === undefined) throw new RangeError(`${what} ${index} does not exist`);
  return item;
}

/**
 * Simulates one service day at a checkpoint operated under `policy`.
 *
 * Each passenger receives a ticket on arrival. With a physical queue (today's operation) the
 * passenger stands in line and steps forward as soon as a lane is free. With a GateFlow virtual
 * queue the passenger waits anywhere; the queue calls tickets so as to keep the free lanes plus a
 * call-ahead buffer supplied, the passenger presents at the access point after their response time
 * (later if they miss the call), queues briefly at the lanes and is screened. Late passengers are
 * recalled, become no-shows, can be reactivated, and get a new ticket once theirs has expired.
 * After screening the passenger walks to the gate and misses the flight when they arrive after
 * boarding closed.
 *
 * The run is deterministic: it consumes no randomness, so all variability comes from the
 * population (common random numbers across policies).
 */
export function simulateCheckpoint(
  population: Population,
  policy: Policy,
  options: SimulationOptions,
): RunResult {
  validatePopulation(population);
  const { checkpoint, flights, passengers } = population;
  const physical = policy.queue.kind === 'physical';
  const schedule = checkpoint.laneSchedule;
  const laneCount = schedule.reduce((max, entry) => Math.max(max, entry.lanes), 0);
  const rate = checkpoint.serviceRatePerLanePerHour;
  const responseMs = responseEstimateMs(policy.queue);
  const fastTrackResponseMs = fastTrackResponseEstimateMs(policy.queue);
  const estimatesFor = (lanes: number): CheckpointEstimates => ({
    throughputPerHour: lanes * rate,
    processMs: checkpoint.processEstimateMs,
    responseMs,
    fastTrackResponseMs,
  });
  /** The overtake bound, which also limits the passes of fast-tracked parties at the lanes. */
  const maxOvertakes =
    policy.selection.kind === 'constrained-edf' ? policy.selection.maxOvertakes : Infinity;

  const state: PassengerState[] = passengers.map((p) => ({
    ticketId: p.id,
    tickets: 0,
    presented: false,
    classAtArrival: null,
    firstCalledAtMs: -1,
    admittedAtMs: -1,
    serviceStartMs: -1,
    serviceEndMs: -1,
    lane: -1,
    calls: 0,
    noShows: 0,
    reactivations: 0,
    prioritized: false,
    maxOvertakenExpired: 0,
  }));
  const ticketOwner = new Map<string, number>();
  const ownerOf = (ticketId: string): PassengerState => {
    const index = ticketOwner.get(ticketId);
    if (index === undefined) throw new Error(`unknown ticket ${ticketId}`);
    return at(state, index, 'passenger');
  };

  const onQueueEvent = (event: QueueEvent): void => {
    switch (event.type) {
      case 'COMMITTED':
        if (event.priority) ownerOf(event.ticketId).prioritized = true;
        break;
      case 'CALLED': {
        const s = ownerOf(event.ticketId);
        s.calls++;
        if (s.firstCalledAtMs < 0) s.firstCalledAtMs = event.atMs;
        break;
      }
      case 'NO_SHOW':
        ownerOf(event.ticketId).noShows++;
        break;
      case 'REACTIVATED':
        ownerOf(event.ticketId).reactivations++;
        break;
      case 'ISSUED':
      case 'RECALLED':
      case 'ADMITTED':
      case 'EXPIRED':
        break;
    }
  };
  const queue = new CheckpointQueue(policy, options.classification, { listener: onQueueEvent });

  const sim = new DiscreteEventSimulation<ModelEvent>(
    passengers.reduce((min, p) => Math.min(min, p.arrivalMs), 0),
  );
  for (const p of passengers)
    sim.scheduleAt(p.arrivalMs, ARRIVAL, { kind: ARRIVAL, passenger: p.index });
  for (const entry of schedule.slice(1)) {
    sim.scheduleAt(entry.fromMs, LANE_CHANGE, { kind: LANE_CHANGE, lanes: entry.lanes });
  }

  let open = at(schedule, 0, 'lane schedule entry').lanes;
  let estimates = estimatesFor(open);
  const busy: boolean[] = new Array<boolean>(laneCount).fill(false);
  /** Open lanes that are idle. */
  let freeOpen = open;
  /** Busy lanes that are closing (index >= open): they finish their passenger, then close. */
  let busyClosing = 0;
  /**
   * Parties who validated their ticket and wait for a lane, in the order they will be screened:
   * order of validation, except that fast-tracked parties go ahead (ADR-027).
   */
  const buffer: number[] = [];
  let bufferPeople = 0;
  /** Overtakes of each party at the moment it validated its ticket (in the call order). */
  const overtakenAtAdmission: number[] = new Array<number>(passengers.length).fill(0);
  /** People who passed each party at the lanes through the fast track. */
  const lanePasses: number[] = new Array<number>(passengers.length).fill(0);
  const fastTrackedAtLanes: boolean[] = new Array<boolean>(passengers.length).fill(false);
  let fastTrackPeople = 0;
  let lanePassedPeople = 0;
  /** Assisted parties waiting for the next free lane, which they get before the buffer. */
  const assisted: number[] = [];
  let assistedPeople = 0;
  const scheduledTimeouts = new Set<number>();

  let busyMs = 0;
  let firstArrivalMs = 0;
  let lastServiceEndMs = 0;
  let integrating = false;
  let lastMs = sim.nowMs;
  let waitingAreaMs = 0;
  let standingAreaMs = 0;
  let staffedMs = 0;
  let idleWithDemandMs = 0;
  let staffedAtLastServiceEnd = 0;
  let idleWithDemandAtLastServiceEnd = 0;
  let maxWaiting = 0;
  let maxStanding = 0;

  const uncalled = (): number => queue.waitingCount + queue.windowCount;
  /** People waiting for their call. */
  const uncalledPeople = (): number => queue.waitingPeople + queue.windowPeople;
  /** People standing in a queue: the whole physical queue, or those waiting at the lanes. */
  const standing = (): number => (physical ? uncalledPeople() : 0) + bufferPeople + assistedPeople;

  /** Integrates the piecewise-constant counts up to `now` (call before changing any of them). */
  const accumulate = (now: number): void => {
    const dt = now - lastMs;
    if (dt <= 0) return;
    if (integrating) {
      const waiting = uncalledPeople();
      waitingAreaMs += waiting * dt;
      standingAreaMs += standing() * dt;
      staffedMs += (open + busyClosing) * dt;
      // Idle lanes that the people waiting for or answering a call could have used.
      idleWithDemandMs += Math.min(freeOpen, waiting + queue.outstandingPeople) * dt;
    }
    lastMs = now;
  };

  const noteMaxima = (): void => {
    maxWaiting = Math.max(maxWaiting, uncalledPeople());
    maxStanding = Math.max(maxStanding, standing());
  };

  const issueTicket = (passengerIndex: number, now: number): void => {
    const passenger = at(passengers, passengerIndex, 'passenger');
    const s = at(state, passengerIndex, 'passenger');
    s.tickets++;
    if (s.tickets > MAX_TICKETS_PER_PASSENGER) {
      throw new Error(
        `passenger ${passenger.id} needed more than ${MAX_TICKETS_PER_PASSENGER} tickets`,
      );
    }
    s.ticketId = s.tickets === 1 ? passenger.id : `${passenger.id}#${s.tickets}`;
    ticketOwner.set(s.ticketId, passengerIndex);
    const flight = at(flights, passenger.flightIndex, 'flight');
    const view = queue.issue(
      {
        id: s.ticketId,
        segment: passenger.segment,
        deadline: flight.knownDeadline,
        walkEstimateMs: passenger.walkEstimateMs,
        partySize: passenger.partySize,
        // A new ticket after an expiry keeps the first presentation at the checkpoint.
        presentedAtMs: passenger.arrivalMs,
        scheduledDepartureMs: flight.knownDeadline.atMs === null ? null : flight.stdMs,
      },
      now,
      estimates,
    );
    s.classAtArrival ??= view.classAtIssue;
  };

  const startServices = (now: number): void => {
    while (freeOpen > 0 && (assisted.length > 0 || buffer.length > 0)) {
      const fromAssisted = assisted.length > 0;
      const passengerIndex = (fromAssisted ? assisted.shift() : buffer.shift()) as number;
      let lane = 0;
      while (lane < open && busy[lane] === true) lane++;
      if (lane >= open) throw new Error('no free open lane although one was counted');
      const passenger = at(passengers, passengerIndex, 'passenger');
      const s = at(state, passengerIndex, 'passenger');
      if (fromAssisted) assistedPeople -= passenger.partySize;
      else bufferPeople -= passenger.partySize;
      busy[lane] = true;
      freeOpen--;
      s.serviceStartMs = now;
      s.lane = lane;
      busyMs += passenger.serviceMs;
      sim.scheduleAt(now + passenger.serviceMs, SERVICE_END, {
        kind: SERVICE_END,
        lane,
        passenger: passengerIndex,
      });
    }
  };

  /** Calls tickets while the pipeline (called + at the lanes) is below free lanes + call-ahead. */
  const callTickets = (now: number): void => {
    const target = callAheadTarget(policy.queue, open, rate);
    while (
      uncalled() > 0 &&
      bufferPeople + assistedPeople + queue.outstandingPeople < freeOpen + target
    ) {
      const view = queue.callNext(now, estimates);
      if (view === null) break;
      const passengerIndex = ticketOwner.get(view.id);
      if (passengerIndex === undefined) throw new Error(`unknown ticket ${view.id}`);
      const passenger: SimPassenger = at(passengers, passengerIndex, 'passenger');
      const s = at(state, passengerIndex, 'passenger');
      const delay =
        physical || s.presented ? 0 : firstCallDelayMs(passenger, now - passenger.arrivalMs);
      sim.scheduleAt(now + delay, PRESENT, { kind: PRESENT, passenger: passengerIndex });
    }
  };

  /**
   * A party that validated its ticket joins the lanes. A fast-tracked party goes ahead of the
   * parties waiting there, but never ahead of an earlier fast-tracked party, nor of a party that
   * would then exceed K overtakes; every party it passes counts it as an overtake.
   */
  const joinLanes = (passengerIndex: number): void => {
    const s = at(state, passengerIndex, 'passenger');
    const size = at(passengers, passengerIndex, 'passenger').partySize;
    const view = queue.ticket(s.ticketId);
    overtakenAtAdmission[passengerIndex] = view?.overtakenCount ?? 0;
    let position = buffer.length;
    if (view?.fastTracked === true) {
      fastTrackedAtLanes[passengerIndex] = true;
      fastTrackPeople += size;
      while (position > 0) {
        const before = at(buffer, position - 1, 'buffer entry');
        if (fastTrackedAtLanes[before] === true) break;
        const overtaken = (overtakenAtAdmission[before] ?? 0) + (lanePasses[before] ?? 0) + size;
        if (overtaken > maxOvertakes) break;
        position--;
      }
      for (let i = position; i < buffer.length; i++) {
        const passed = at(buffer, i, 'buffer entry');
        lanePasses[passed] = (lanePasses[passed] ?? 0) + size;
        lanePassedPeople += at(passengers, passed, 'passenger').partySize;
      }
    }
    buffer.splice(position, 0, passengerIndex);
    bufferPeople += size;
  };

  const present = (passengerIndex: number, now: number): void => {
    const s = at(state, passengerIndex, 'passenger');
    s.presented = true;
    const outcome = queue.present(s.ticketId, now, estimates);
    switch (outcome) {
      case 'ADMITTED':
        s.admittedAtMs = now;
        joinLanes(passengerIndex);
        startServices(now);
        break;
      case 'REACTIVATED':
        break;
      case 'EXPIRED': {
        const expired = queue.ticket(s.ticketId);
        s.maxOvertakenExpired = Math.max(s.maxOvertakenExpired, expired?.overtakenCount ?? 0);
        issueTicket(passengerIndex, now);
        break;
      }
      case 'NOT_CALLED':
      case 'ALREADY_ADMITTED':
      case 'UNKNOWN_TICKET':
        throw new Error(`unexpected presentation outcome ${outcome} for ticket ${s.ticketId}`);
    }
    noteMaxima();
  };

  const arrive = (passengerIndex: number, now: number): void => {
    const passenger = at(passengers, passengerIndex, 'passenger');
    if (passenger.path === 'QUEUE') {
      issueTicket(passengerIndex, now);
      return;
    }
    // Assisted: staff take the party to the next free lane, without a ticket.
    const s = at(state, passengerIndex, 'passenger');
    s.classAtArrival = 'UNVERIFIED';
    s.firstCalledAtMs = now;
    s.admittedAtMs = now;
    assisted.push(passengerIndex);
    assistedPeople += passenger.partySize;
    startServices(now);
  };

  const changeLanes = (lanes: number): void => {
    for (let i = Math.min(open, lanes); i < Math.max(open, lanes); i++) {
      const opening = lanes > open;
      if (busy[i] === true) busyClosing += opening ? -1 : 1;
      else freeOpen += opening ? 1 : -1;
    }
    open = lanes;
    estimates = estimatesFor(open);
  };

  sim.run((event) => {
    const now = event.timeMs;
    const payload = event.payload;
    accumulate(now);
    switch (payload.kind) {
      case ARRIVAL:
        if (!integrating) {
          integrating = true;
          firstArrivalMs = now;
        }
        arrive(payload.passenger, now);
        noteMaxima();
        break;
      case SERVICE_END: {
        busy[payload.lane] = false;
        if (payload.lane < open) freeOpen++;
        else busyClosing--;
        at(state, payload.passenger, 'passenger').serviceEndMs = now;
        lastServiceEndMs = now;
        staffedAtLastServiceEnd = staffedMs;
        idleWithDemandAtLastServiceEnd = idleWithDemandMs;
        startServices(now);
        break;
      }
      case LANE_CHANGE:
        changeLanes(payload.lanes);
        startServices(now);
        break;
      case PRESENT:
        present(payload.passenger, now);
        break;
      case TIMEOUT:
        scheduledTimeouts.delete(now);
        queue.advance(now);
        break;
    }
    callTickets(now);
    const due = queue.nextDueMs();
    if (due !== null && !scheduledTimeouts.has(due)) {
      scheduledTimeouts.add(due);
      sim.scheduleAt(due, TIMEOUT, { kind: TIMEOUT });
    }
  });

  const outcomes: PassengerOutcome[] = passengers.map((passenger) => {
    const s = at(state, passenger.index, 'passenger');
    const isAssisted = passenger.path === 'ASSISTED';
    const ticket = isAssisted ? undefined : queue.ticket(s.ticketId);
    if (
      s.serviceEndMs < 0 ||
      s.classAtArrival === null ||
      (!isAssisted && ticket?.state !== 'ADMITTED')
    ) {
      throw new Error(`passenger ${passenger.id} was not served (conservation violated)`);
    }
    const flight = at(flights, passenger.flightIndex, 'flight');
    const gateArrivalMs = s.serviceEndMs + passenger.walkMs;
    return {
      firstCalledAtMs: s.firstCalledAtMs,
      serviceStartMs: s.serviceStartMs,
      serviceEndMs: s.serviceEndMs,
      gateArrivalMs,
      waitMs: s.serviceStartMs - passenger.arrivalMs,
      callWaitMs: s.firstCalledAtMs - passenger.arrivalMs,
      standingMs: s.serviceStartMs - (physical ? passenger.arrivalMs : s.admittedAtMs),
      missed: gateArrivalMs > flight.boardingCloseMs,
      priorityCall: s.prioritized,
      // Overtakes in the call order (queue and prepare window) plus passes at the lanes.
      overtakenCount: Math.max(
        s.maxOvertakenExpired,
        (ticket?.overtakenCount ?? 0) + (lanePasses[passenger.index] ?? 0),
      ),
      selectionReasons: ticket?.selectionReasons ?? [],
      classAtArrival: s.classAtArrival,
      laneIndex: s.lane,
      calls: s.calls,
      noShows: s.noShows,
      reactivations: s.reactivations,
      reissuedTickets: Math.max(0, s.tickets - 1),
    } satisfies PassengerOutcome;
  });

  const q = queue.stats();
  return {
    policyId: policy.id,
    outcomes,
    stats: {
      calls: q.calls,
      commitments: q.commitments,
      priorityCalls: q.priorityCommitments,
      capReachedCalls: q.capReached,
      overtakeGuardCalls: q.overtakeGuard,
      recalls: q.recalls,
      noShows: q.noShows,
      reactivations: q.reactivations,
      fastTrackPeople,
      lanePassedPeople,
      // Every queue party holds one ticket, plus one per expiry; assisted parties hold none.
      reissuedTickets: q.issued - passengers.filter((p) => p.path === 'QUEUE').length,
      firstArrivalMs,
      lastServiceEndMs,
      busyMs,
      staffedLaneMs: staffedAtLastServiceEnd,
      idleLaneWithDemandMs: idleWithDemandAtLastServiceEnd,
      waitingAreaMs,
      maxWaiting,
      standingAreaMs,
      maxStanding,
    },
  };
}
