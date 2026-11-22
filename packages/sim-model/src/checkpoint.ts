import { DEADLINE_SOURCES, MS_PER_HOUR, MS_PER_MINUTE, SEGMENTS } from '@gateflow/domain';
import type { KnownDeadline, RiskClass } from '@gateflow/domain';
import type { CheckpointEstimates } from '@gateflow/priority-engine';
import {
  CheckpointQueue,
  callAheadTarget,
  fastTrackResponseEstimateMs,
  responseEstimateMs,
} from '@gateflow/queue-core';
import type { Policy, PredictiveLanes, QueueEvent, ReactiveLanes } from '@gateflow/queue-core';
import { DiscreteEventSimulation } from '@gateflow/sim-kernel';
import type {
  CheckpointSpec,
  LaneOutage,
  PassengerOutcome,
  Population,
  RunResult,
  SimFlight,
  SimPassenger,
  SimulationOptions,
} from './types';

/**
 * Order of events at the same instant: the flight feed comes first, so that every decision at t
 * uses what is known at t (the feed recovers, then goes down, then its messages arrive: a message
 * sent when the feed goes down is held). Then lanes open or close (a lane closing at t takes
 * nobody at t); then lanes are freed; then passengers present at the access point; then timeouts
 * are applied (so presenting exactly at a deadline is on time); arrivals come last. With a
 * physical queue (or a virtual queue whose calls are answered instantly) this reproduces the S1
 * model exactly.
 */
const FEED_UP = -3;
const FEED_DOWN = -2;
const FLIGHT_UPDATE = -1;
const LANE_CHANGE = 0;
const SERVICE_END = 1;
const PRESENT = 2;
const TIMEOUT = 3;
const ARRIVAL = 4;
/** An extra lane decided earlier is staffed (scheduled with the priority of LANE_CHANGE). */
const LANE_READY = 5;
/** Lane management looks at the queue after everything else that happens at the same instant. */
const LANE_REVIEW = 6;

/**
 * A passenger answers every call after the first one at once, so they need at most two tickets.
 * The bound turns a modelling error into an exception instead of an endless loop.
 */
const MAX_TICKETS_PER_PASSENGER = 100;

type ModelEvent =
  | { readonly kind: typeof FEED_UP }
  | { readonly kind: typeof FEED_DOWN; readonly fromMs: number }
  | { readonly kind: typeof FLIGHT_UPDATE; readonly flight: number; readonly update: number }
  | { readonly kind: typeof SERVICE_END; readonly lane: number; readonly passenger: number }
  | { readonly kind: typeof LANE_CHANGE }
  | { readonly kind: typeof LANE_READY }
  | { readonly kind: typeof LANE_REVIEW }
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
  /** Class changes and reversals of the passenger's expired tickets. */
  classChangesExpired: number;
  classReversalsExpired: number;
}

/** What the system currently knows about a flight (S5: it changes with the flight feed). */
interface FlightKnowledgeState {
  deadline: KnownDeadline;
  /** Nominal walking time to the gate, once the feed has announced a gate; null before. */
  walkEstimateMs: number | null;
  /** Messages sent while the feed is down, merged: they arrive when it recovers. */
  heldDeadline: KnownDeadline | null;
  heldWalkEstimateMs: number | null;
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

function validateKnownDeadline(deadline: KnownDeadline, what: string): void {
  // Widened: callers may pass untyped data.
  const source: string = deadline.source;
  if (!(DEADLINE_SOURCES as readonly string[]).includes(source)) {
    throw new PopulationError(`${what} has unknown source ${source}`);
  }
  if (deadline.atMs === null) {
    if (source !== 'NONE') throw new PopulationError(`${what} has no time but source ${source}`);
  } else {
    if (source === 'NONE') throw new PopulationError(`${what} has a time but source NONE`);
    requireInteger(deadline.atMs, `${what}.atMs`);
  }
  if (deadline.observedAtMs !== undefined) {
    requireInteger(deadline.observedAtMs, `${what}.observedAtMs`);
  }
}

function validateFlight(flight: SimFlight): void {
  const id = flight.id;
  requireInteger(flight.stdMs, `stdMs of ${id}`);
  requireInteger(flight.boardingCloseMs, `boardingCloseMs of ${id}`);
  validateKnownDeadline(flight.knownDeadline, `knownDeadline of ${id}`);
  if (flight.delayMs !== undefined) requireInteger(flight.delayMs, `delayMs of ${id}`, 0);
  const change = flight.gateChange;
  if (change !== undefined) {
    requireInteger(change.atMs, `gateChange.atMs of ${id}`);
    requireInteger(change.walkEstimateMs, `gateChange.walkEstimateMs of ${id}`, 0);
  }
  let previousMs = -Infinity;
  (flight.updates ?? []).forEach((update, i) => {
    const what = `updates[${i}] of ${id}`;
    requireInteger(update.atMs, `${what}.atMs`);
    if (update.atMs < previousMs) throw new PopulationError(`updates of ${id} must be sorted`);
    previousMs = update.atMs;
    if (update.knownDeadline === undefined && update.walkEstimateMs === undefined) {
      throw new PopulationError(`${what} carries no knowledge`);
    }
    if (update.knownDeadline !== undefined) {
      validateKnownDeadline(update.knownDeadline, `${what}.knownDeadline`);
      if (update.knownDeadline.observedAtMs !== undefined) {
        throw new PopulationError(`${what}.knownDeadline must not carry observedAtMs`);
      }
    }
    if (update.walkEstimateMs !== undefined) {
      requireInteger(update.walkEstimateMs, `${what}.walkEstimateMs`, 0);
    }
  });
}

function validateOutages(population: Population): void {
  (population.laneOutages ?? []).forEach((outage, i) => {
    requireInteger(outage.fromMs, `laneOutages[${i}].fromMs`);
    requireInteger(outage.toMs, `laneOutages[${i}].toMs`, outage.fromMs + 1);
    requireInteger(outage.lanes, `laneOutages[${i}].lanes`, 1);
  });
  let previousEndMs = -Infinity;
  (population.feedOutages ?? []).forEach((outage, i) => {
    requireInteger(outage.fromMs, `feedOutages[${i}].fromMs`);
    requireInteger(outage.toMs, `feedOutages[${i}].toMs`, outage.fromMs + 1);
    if (outage.fromMs <= previousEndMs) {
      throw new PopulationError('feedOutages must be sorted and separated (merge touching ones)');
    }
    previousEndMs = outage.toMs;
  });
}

/** Lanes and staff beyond the plan, and the arrival forecast (S8). */
function validateLaneData(population: Population): void {
  const { staffing, forecast } = population;
  if (staffing !== undefined) {
    requireInteger(staffing.lanesAvailable, 'staffing.lanesAvailable', 1);
    const planned = population.checkpoint.laneSchedule.reduce((m, e) => Math.max(m, e.lanes), 0);
    if (planned > staffing.lanesAvailable) {
      throw new PopulationError(
        `the plan opens ${planned} lanes but the checkpoint has ${staffing.lanesAvailable}`,
      );
    }
    requireInteger(staffing.maxExtraLanes, 'staffing.maxExtraLanes', 0);
    requireInteger(staffing.openDelayEstimateMs, 'staffing.openDelayEstimateMs', 0);
    requireInteger(staffing.minOpenMs, 'staffing.minOpenMs', 0);
    if (staffing.openDelaysMs.length === 0 || staffing.follows.length === 0) {
      throw new PopulationError('staffing needs at least one open delay and one follow decision');
    }
    staffing.openDelaysMs.forEach((d, i) => {
      requireInteger(d, `staffing.openDelaysMs[${i}]`, 0);
    });
    staffing.follows.forEach((f, i) => {
      if (typeof (f as unknown) !== 'boolean') {
        throw new PopulationError(`staffing.follows[${i}] must be a boolean`);
      }
    });
  }
  if (forecast !== undefined) {
    requireInteger(forecast.startMs, 'forecast.startMs');
    forecast.peoplePerMinute.forEach((n, i) => {
      if (!Number.isFinite(n) || n < 0) {
        throw new PopulationError(`forecast.peoplePerMinute[${i}] must be a number >= 0`);
      }
    });
  }
}

export function validatePopulation(population: Population): void {
  const { checkpoint, flights, passengers } = population;
  validateCheckpointSpec(checkpoint);
  validateLaneData(population);
  flights.forEach((flight, i) => {
    if (flight.index !== i)
      throw new PopulationError(`flight ${flight.id} has index ${flight.index}, expected ${i}`);
    validateFlight(flight);
  });
  if (new Set(flights.map((f) => f.id)).size !== flights.length) {
    throw new PopulationError('flight ids must be unique');
  }
  validateOutages(population);
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

/**
 * Lanes open at `t`: the planned lanes minus those out of service (S5), never fewer than one.
 * The first entry of the schedule also applies before 0.
 */
export function openLanesAt(
  spec: CheckpointSpec,
  outages: readonly LaneOutage[],
  t: number,
): number {
  let planned = 0;
  for (const entry of spec.laneSchedule) {
    if (entry.fromMs <= t || planned === 0) planned = entry.lanes;
  }
  let out = 0;
  for (const outage of outages) if (outage.fromMs <= t && t < outage.toMs) out += outage.lanes;
  return Math.max(1, planned - out);
}

/**
 * Walking time of a passenger who finished screening at `serviceEndMs` (ground truth): after a
 * gate change, the walk scales with the nominal walking time of the new gate.
 */
export function trueWalkMs(
  passenger: SimPassenger,
  flight: SimFlight,
  serviceEndMs: number,
): number {
  const change = flight.gateChange;
  if (change === undefined || serviceEndMs < change.atMs) return passenger.walkMs;
  if (passenger.walkEstimateMs === 0) return change.walkEstimateMs;
  return Math.round((passenger.walkMs * change.walkEstimateMs) / passenger.walkEstimateMs);
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
  /** Lane management (S8): only for a policy that manages lanes, with staff to do it. */
  const management = policy.lanes;
  const staffing = management === undefined ? undefined : population.staffing;
  if (management?.kind === 'predict' && population.forecast === undefined) {
    throw new PopulationError('predictive lane management needs an arrival forecast');
  }
  const lanesAvailable = Math.max(laneCount, staffing?.lanesAvailable ?? 0);

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
    classChangesExpired: 0,
    classReversalsExpired: 0,
  }));
  const knowledge: FlightKnowledgeState[] = flights.map((f) => ({
    deadline: f.knownDeadline,
    walkEstimateMs: null,
    heldDeadline: null,
    heldWalkEstimateMs: null,
  }));
  /**
   * True when what the system knows about the passenger's flight differs from the ground truth at
   * `now`: the deadline, or the walking time estimated for the passenger after a gate change.
   */
  const misinformed = (passenger: SimPassenger, now: number): boolean => {
    const flight = at(flights, passenger.flightIndex, 'flight');
    const known = at(knowledge, flight.index, 'flight');
    if (known.deadline.atMs !== null && known.deadline.atMs !== flight.boardingCloseMs) return true;
    const change = flight.gateChange;
    if (change === undefined || now < change.atMs) return false;
    return (known.walkEstimateMs ?? passenger.walkEstimateMs) !== change.walkEstimateMs;
  };
  let misinformedPriorityPeople = 0;
  const ticketOwner = new Map<string, number>();
  const ownerOf = (ticketId: string): PassengerState => {
    const index = ticketOwner.get(ticketId);
    if (index === undefined) throw new Error(`unknown ticket ${ticketId}`);
    return at(state, index, 'passenger');
  };

  const onQueueEvent = (event: QueueEvent): void => {
    switch (event.type) {
      case 'COMMITTED':
        if (event.priority) {
          const index = ticketOwner.get(event.ticketId);
          if (index === undefined) throw new Error(`unknown ticket ${event.ticketId}`);
          at(state, index, 'passenger').prioritized = true;
          const passenger = at(passengers, index, 'passenger');
          if (misinformed(passenger, event.atMs)) misinformedPriorityPeople += passenger.partySize;
        }
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
      // Staff's actions, a party growing at the kiosk, the supervisor's modes and overrides
      // happen in the live product only (S15, S17).
      case 'REVIEW':
      case 'RELEASED':
      case 'CANCELLED':
      case 'PARTY_GROWN':
      case 'MODE_CHANGED':
      case 'UNCOMMITTED':
      case 'OVERRIDDEN':
        throw new Error(`${event.type} in a simulated day: only the live product has it`);
    }
  };
  const observe = options.listener;
  /** Observer of the day (S11): told everything, it never changes the run. */
  const observer = options.observer;
  const queue = new CheckpointQueue(policy, options.classification, {
    listener:
      observe === undefined && observer === undefined
        ? onQueueEvent
        : (event) => {
            onQueueEvent(event);
            observe?.(event);
            if (observer !== undefined) {
              // A simulated day has only events of tickets: the checkpoint's own are live (S17).
              if (!('ticketId' in event)) throw new Error(`${event.type} in a simulated day`);
              const party = ticketOwner.get(event.ticketId);
              if (party === undefined) throw new Error(`unknown ticket ${event.ticketId}`);
              observer({ type: 'QUEUE', atMs: event.atMs, party, event });
            }
          },
  });

  const laneOutages = population.laneOutages ?? [];
  const feedOutages = population.feedOutages ?? [];
  // The day starts with the first event: an arrival, a feed message or an outage (0 at the latest).
  let startMs = 0;
  for (const p of passengers) startMs = Math.min(startMs, p.arrivalMs);
  for (const f of flights) for (const u of f.updates ?? []) startMs = Math.min(startMs, u.atMs);
  for (const o of [...laneOutages, ...feedOutages]) startMs = Math.min(startMs, o.fromMs);
  const sim = new DiscreteEventSimulation<ModelEvent>(startMs);
  for (const p of passengers)
    sim.scheduleAt(p.arrivalMs, ARRIVAL, { kind: ARRIVAL, passenger: p.index });
  // Lanes change at every planned change and at every start and end of a lane outage.
  const laneChanges = new Set(schedule.slice(1).map((entry) => entry.fromMs));
  for (const o of laneOutages) laneChanges.add(o.fromMs).add(o.toMs);
  for (const t of [...laneChanges].sort((a, b) => a - b)) {
    sim.scheduleAt(t, LANE_CHANGE, { kind: LANE_CHANGE });
  }
  // Lane management looks at the queue at every multiple of its interval from the start of the
  // day, as long as passengers are still to come or to be screened (see LANE_REVIEW).
  const lastArrivalMs = passengers.reduce((max, p) => Math.max(max, p.arrivalMs), -Infinity);
  if (management !== undefined) {
    const interval = management.reviewIntervalMs;
    sim.scheduleAt(Math.ceil(startMs / interval) * interval, LANE_REVIEW, { kind: LANE_REVIEW });
  }
  for (const o of feedOutages) {
    sim.scheduleAt(o.fromMs, FEED_DOWN, { kind: FEED_DOWN, fromMs: o.fromMs });
    sim.scheduleAt(o.toMs, FEED_UP, { kind: FEED_UP });
  }
  for (const f of flights) {
    (f.updates ?? []).forEach((u, update) => {
      sim.scheduleAt(u.atMs, FLIGHT_UPDATE, { kind: FLIGHT_UPDATE, flight: f.index, update });
    });
  }

  let open = at(schedule, 0, 'lane schedule entry').lanes;
  let estimates = estimatesFor(open);
  const busy: boolean[] = new Array<boolean>(lanesAvailable).fill(false);
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
  let feedDown = false;

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

  // Lane management (S8).
  /** Extra lanes staffed beyond the plan. */
  let extraOpen = 0;
  /** When the lanes decided but not yet staffed will be ready. */
  const pendingReady: number[] = [];
  let lastOpenedAtMs = -Infinity;
  let lastDecisionMs = -Infinity;
  /** Decisions to open so far (index of the day's open delays). */
  let openDecisionIndex = 0;
  /** GateFlow recommendations so far (index of the duty manager's answers). */
  let recommendationIndex = 0;
  let laneDecisions = 0;
  let laneDecisionsFollowed = 0;
  let lanesOpened = 0;
  let lanesClosed = 0;
  let maxOpenLanes = open;
  /** Lanes open above what the plan and the outages give. */
  let extraEffective = 0;
  let extraLaneMs = 0;
  let extraAtLastServiceEnd = 0;
  /** People arriving in the last hour, for the forecast's scale: [time, people]. */
  const recentArrivals: [number, number][] = [];

  const plannedAt = (t: number): number => {
    let planned = 0;
    for (const entry of schedule) if (entry.fromMs <= t || planned === 0) planned = entry.lanes;
    return planned;
  };
  const outAt = (t: number): number => {
    let out = 0;
    for (const outage of laneOutages)
      if (outage.fromMs <= t && t < outage.toMs) out += outage.lanes;
    return out;
  };
  /**
   * Lanes open at `t`: the plan plus the extra lanes, never more than the checkpoint has, minus
   * the lanes out of service, never fewer than one. Without extra lanes this is `openLanesAt`.
   */
  const lanesAt = (t: number, extra: number): number =>
    Math.max(1, Math.min(plannedAt(t) + extra, lanesAvailable) - outAt(t));

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
      extraLaneMs += extraEffective * dt;
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
    const known = at(knowledge, flight.index, 'flight');
    const view = queue.issue(
      {
        id: s.ticketId,
        segment: passenger.segment,
        deadline: known.deadline,
        walkEstimateMs: known.walkEstimateMs ?? passenger.walkEstimateMs,
        partySize: passenger.partySize,
        // A new ticket after an expiry keeps the first presentation at the checkpoint.
        presentedAtMs: passenger.arrivalMs,
        scheduledDepartureMs: known.deadline.atMs === null ? null : flight.stdMs,
        flightId: flight.id,
      },
      now,
      estimates,
    );
    s.classAtArrival ??= view.classAtIssue;
  };

  /** Tells the queue what is now known about a flight. */
  const publish = (flight: SimFlight, now: number): void => {
    const known = at(knowledge, flight.index, 'flight');
    if (observer !== undefined) {
      observer({
        type: 'FLIGHT_KNOWN',
        atMs: now,
        flight: flight.index,
        deadlineMs: known.deadline.atMs,
        walkEstimateMs: known.walkEstimateMs,
      });
    }
    queue.updateFlight(
      flight.id,
      {
        deadline: known.deadline,
        ...(known.walkEstimateMs === null ? {} : { walkEstimateMs: known.walkEstimateMs }),
      },
      now,
      estimates,
    );
  };

  /** A message of the flight feed: delivered now, or held until the feed recovers. */
  const receive = (flightIndex: number, updateIndex: number, now: number): void => {
    const flight = at(flights, flightIndex, 'flight');
    const update = at(flight.updates ?? [], updateIndex, 'flight update');
    const known = at(knowledge, flightIndex, 'flight');
    if (feedDown) {
      if (update.knownDeadline !== undefined) known.heldDeadline = update.knownDeadline;
      if (update.walkEstimateMs !== undefined) known.heldWalkEstimateMs = update.walkEstimateMs;
      return;
    }
    if (update.knownDeadline !== undefined) known.deadline = update.knownDeadline;
    if (update.walkEstimateMs !== undefined) known.walkEstimateMs = update.walkEstimateMs;
    publish(flight, now);
  };

  /**
   * The feed goes down: what is known stays, but is now as old as the outage, so policies with a
   * maximum data age stop trusting it once that age is exceeded (ADR-029).
   */
  const feedGoesDown = (fromMs: number, now: number): void => {
    feedDown = true;
    observer?.({ type: 'FEED_DOWN', atMs: now });
    for (const flight of flights) {
      const known = at(knowledge, flight.index, 'flight');
      if (known.deadline.atMs === null) continue;
      known.deadline = { ...known.deadline, observedAtMs: fromMs };
      publish(flight, now);
    }
  };

  /** The feed recovers: the held messages arrive and the knowledge is live again. */
  const feedComesBack = (now: number): void => {
    feedDown = false;
    observer?.({ type: 'FEED_UP', atMs: now });
    for (const flight of flights) {
      const known = at(knowledge, flight.index, 'flight');
      const { observedAtMs, ...live } = known.heldDeadline ?? known.deadline;
      const changed =
        observedAtMs !== undefined ||
        known.heldDeadline !== null ||
        known.heldWalkEstimateMs !== null;
      if (!changed) continue;
      known.deadline = live;
      if (known.heldWalkEstimateMs !== null) known.walkEstimateMs = known.heldWalkEstimateMs;
      known.heldDeadline = null;
      known.heldWalkEstimateMs = null;
      publish(flight, now);
    }
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
      observer?.({ type: 'SCREENING_STARTED', atMs: now, party: passengerIndex, lane });
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
        s.classChangesExpired += expired?.classChanges ?? 0;
        s.classReversalsExpired += expired?.classReversals ?? 0;
        issueTicket(passengerIndex, now);
        break;
      }
      case 'NOT_CALLED':
      case 'ALREADY_ADMITTED':
      case 'UNKNOWN_TICKET':
      case 'UNDER_REVIEW':
      case 'CANCELLED':
        throw new Error(`unexpected presentation outcome ${outcome} for ticket ${s.ticketId}`);
    }
    noteMaxima();
  };

  const arrive = (passengerIndex: number, now: number): void => {
    const passenger = at(passengers, passengerIndex, 'passenger');
    observer?.({ type: 'ARRIVED', atMs: now, party: passengerIndex });
    if (management?.kind === 'predict') recentArrivals.push([now, passenger.partySize]);
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

  /** Opens or closes lanes to match the plan, the outages and the extra lanes at `now`. */
  const updateLanes = (now: number): void => {
    const lanes = lanesAt(now, extraOpen);
    if (lanes > lanesAvailable) throw new Error('more lanes open than the checkpoint has');
    const before = open;
    const extraBefore = extraEffective;
    if (lanes !== open) changeLanes(lanes);
    extraEffective = open - lanesAt(now, 0);
    maxOpenLanes = Math.max(maxOpenLanes, open);
    if (observer !== undefined && (open !== before || extraEffective !== extraBefore)) {
      observer({
        type: 'LANES',
        atMs: now,
        open,
        planned: plannedAt(now),
        outOfService: outAt(now),
        extra: extraEffective,
      });
    }
  };

  /** People waiting for a lane: not yet called, on their way after a call, or at the lanes. */
  const waitingPeople = (): number =>
    uncalledPeople() + queue.outstandingPeople + bufferPeople + assistedPeople;

  /** Extra lanes that could still be decided: physical lanes free and staff on call. */
  const room = (now: number): number =>
    staffing === undefined
      ? 0
      : Math.min(
          lanesAvailable - plannedAt(now) - extraOpen - pendingReady.length,
          staffing.maxExtraLanes - extraOpen - pendingReady.length,
        );

  /** Lanes decided at `now`: staffed after the delay of this decision to open. */
  const decideOpen = (now: number, lanes: number): void => {
    if (staffing === undefined) return;
    const delays = staffing.openDelaysMs;
    const delay = at(delays, openDecisionIndex++ % delays.length, 'open delay');
    for (let i = 0; i < lanes; i++) {
      pendingReady.push(now + delay);
      sim.scheduleAt(now + delay, LANE_CHANGE, { kind: LANE_READY });
    }
  };

  const closeExtraLane = (now: number): void => {
    extraOpen--;
    lanesClosed++;
    updateLanes(now);
  };

  /** A lane decided earlier is staffed: it opens if the checkpoint still has room for it. */
  const laneReady = (now: number): void => {
    const i = pendingReady.indexOf(now);
    if (i < 0) throw new Error('a lane became ready without a decision');
    pendingReady.splice(i, 1);
    if (staffing === undefined) return;
    if (plannedAt(now) + extraOpen < lanesAvailable && extraOpen < staffing.maxExtraLanes) {
      extraOpen++;
      lanesOpened++;
      lastOpenedAtMs = now;
      updateLanes(now);
    }
  };

  /** Tells the observer of a decision on an extra lane. */
  const decision = (
    by: 'SUPERVISOR' | 'GATEFLOW',
    action: 'OPEN' | 'CLOSE',
    lanes: number,
    followed: boolean,
    waitMs: number,
    now: number,
  ): void => {
    observer?.({ type: 'LANE_DECISION', atMs: now, by, action, lanes, followed, waitMs });
  };

  /** Today's supervisor: decides on the wait the queue shows now. */
  const reviewReactive = (now: number, lanes: ReactiveLanes): void => {
    if (staffing === undefined || now - lastDecisionMs < lanes.cooldownMs) return;
    const waitMs = (waitingPeople() / (open * rate)) * MS_PER_HOUR;
    if (waitMs > lanes.openWhenWaitMs && room(now) > 0) {
      laneDecisions++;
      laneDecisionsFollowed++;
      lastDecisionMs = now;
      decision('SUPERVISOR', 'OPEN', 1, true, waitMs, now);
      decideOpen(now, 1);
    } else if (
      waitMs < lanes.closeWhenWaitMs &&
      extraOpen > 0 &&
      now - lastOpenedAtMs >= staffing.minOpenMs
    ) {
      laneDecisions++;
      laneDecisionsFollowed++;
      lastDecisionMs = now;
      decision('SUPERVISOR', 'CLOSE', 1, true, waitMs, now);
      closeExtraLane(now);
    }
  };

  /** People the forecast expects in the minute that starts at `t`. */
  const forecastAt = (t: number): number => {
    const forecast = population.forecast;
    if (forecast === undefined) return 0;
    const i = Math.floor((t - forecast.startMs) / MS_PER_MINUTE);
    return forecast.peoplePerMinute[i] ?? 0;
  };

  /** GateFlow: decides on a projection of the queue over the horizon. */
  const reviewPredictive = (now: number, lanes: PredictiveLanes): void => {
    if (staffing === undefined || now - lastDecisionMs < lanes.cooldownMs) return;
    // Scale the forecast by the arrivals of the last hour.
    while (recentArrivals.length > 0 && (recentArrivals[0]?.[0] ?? now) < now - MS_PER_HOUR) {
      recentArrivals.shift();
    }
    let observed = 0;
    for (const [, people] of recentArrivals) observed += people;
    let expected = 0;
    for (let t = now - MS_PER_HOUR; t < now; t += MS_PER_MINUTE) expected += forecastAt(t);
    const scale = Math.min(2, Math.max(0.5, (observed + 5) / (expected + 5)));
    const minutes = Math.ceil(lanes.horizonMs / MS_PER_MINUTE);
    const perLaneMinute = rate / 60;
    const out = outAt(now);
    /** Longest projected wait (ms) with `added` lanes more from `fromMs` (negative: fewer). */
    const project = (added: number, fromMs: number): number => {
      let backlog = waitingPeople();
      let longest = 0;
      for (let m = 0; m < minutes; m++) {
        const t = now + m * MS_PER_MINUTE;
        let ready = 0;
        for (const r of pendingReady) if (r <= t) ready++;
        const extra = Math.max(0, extraOpen + ready + (t >= fromMs ? added : 0));
        const lanesOpen = Math.max(1, Math.min(plannedAt(t) + extra, lanesAvailable) - out);
        const capacity = lanesOpen * perLaneMinute;
        longest = Math.max(longest, backlog / capacity);
        backlog = Math.max(0, backlog + forecastAt(t) * scale - capacity);
      }
      return longest * MS_PER_MINUTE;
    };
    /** Whether the duty manager follows the next recommendation. */
    const follows = (): boolean =>
      at(staffing.follows, recommendationIndex++ % staffing.follows.length, 'follow decision');
    const projectedMs = project(0, now);
    if (projectedMs > lanes.targetWaitMs) {
      const free = room(now);
      if (free <= 0) return;
      const readyAt = now + staffing.openDelayEstimateMs;
      let wanted = 1;
      while (wanted < free && project(wanted, readyAt) > lanes.targetWaitMs) wanted++;
      laneDecisions++;
      lastDecisionMs = now;
      const followed = follows();
      decision('GATEFLOW', 'OPEN', wanted, followed, projectedMs, now);
      if (!followed) return;
      laneDecisionsFollowed++;
      decideOpen(now, wanted);
      return;
    }
    if (extraOpen <= 0 || pendingReady.length > 0 || now - lastOpenedAtMs < staffing.minOpenMs) {
      return;
    }
    const withOneFewerMs = project(-1, now);
    if (withOneFewerMs <= lanes.closeWhenWaitMs) {
      laneDecisions++;
      lastDecisionMs = now;
      const followed = follows();
      decision('GATEFLOW', 'CLOSE', 1, followed, withOneFewerMs, now);
      if (!followed) return;
      laneDecisionsFollowed++;
      closeExtraLane(now);
    }
  };

  observer?.({
    type: 'LANES',
    atMs: startMs,
    open,
    planned: plannedAt(startMs),
    outOfService: outAt(startMs),
    extra: 0,
  });
  sim.run((event) => {
    const now = event.timeMs;
    const payload = event.payload;
    accumulate(now);
    switch (payload.kind) {
      case FEED_UP:
        feedComesBack(now);
        break;
      case FEED_DOWN:
        feedGoesDown(payload.fromMs, now);
        break;
      case FLIGHT_UPDATE:
        receive(payload.flight, payload.update, now);
        break;
      case ARRIVAL:
        if (!integrating) {
          integrating = true;
          firstArrivalMs = now;
        }
        arrive(payload.passenger, now);
        noteMaxima();
        break;
      case SERVICE_END: {
        observer?.({
          type: 'SCREENING_ENDED',
          atMs: now,
          party: payload.passenger,
          lane: payload.lane,
        });
        busy[payload.lane] = false;
        if (payload.lane < open) freeOpen++;
        else busyClosing--;
        at(state, payload.passenger, 'passenger').serviceEndMs = now;
        lastServiceEndMs = now;
        staffedAtLastServiceEnd = staffedMs;
        idleWithDemandAtLastServiceEnd = idleWithDemandMs;
        extraAtLastServiceEnd = extraLaneMs;
        startServices(now);
        break;
      }
      case LANE_CHANGE:
        // Staff beyond the lanes the plan leaves free go back (the plan grew).
        if (staffing !== undefined) {
          extraOpen = Math.min(extraOpen, Math.max(0, lanesAvailable - plannedAt(now)));
        }
        updateLanes(now);
        startServices(now);
        break;
      case LANE_READY:
        laneReady(now);
        startServices(now);
        break;
      case LANE_REVIEW: {
        if (management === undefined) break;
        if (management.kind === 'reactive') reviewReactive(now, management);
        else reviewPredictive(now, management);
        const screening = open - freeOpen + busyClosing;
        if (now < lastArrivalMs || waitingPeople() > 0 || screening > 0) {
          sim.scheduleAt(now + management.reviewIntervalMs, LANE_REVIEW, { kind: LANE_REVIEW });
        }
        break;
      }
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
    const gateArrivalMs = s.serviceEndMs + trueWalkMs(passenger, flight, s.serviceEndMs);
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
      classChanges: s.classChangesExpired + (ticket?.classChanges ?? 0),
      classReversals: s.classReversalsExpired + (ticket?.classReversals ?? 0),
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
      classChanges: q.classChanges,
      classReversals: q.classReversals,
      misinformedPriorityPeople,
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
      extraLaneMs: extraAtLastServiceEnd,
      laneDecisions,
      laneDecisionsFollowed,
      lanesOpened,
      lanesClosed,
      maxOpenLanes,
    },
  };
}
