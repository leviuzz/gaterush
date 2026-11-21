import { SEGMENTS } from '@gateflow/domain';
import type { RiskClass } from '@gateflow/domain';
import {
  assessTicket,
  selectNext,
  validateClassificationParams,
  validatePolicyParams,
} from '@gateflow/priority-engine';
import type { Policy, ReasonCode, WaitingTicket } from '@gateflow/priority-engine';
import { DiscreteEventSimulation } from '@gateflow/sim-kernel';
import type {
  PassengerOutcome,
  Population,
  RunResult,
  SimPassenger,
  SimulationOptions,
} from './types';

/** Service ends are processed before arrivals at the same instant, so a freed lane is reused. */
const SERVICE_END = 0;
const ARRIVAL = 1;

interface ArrivalEvent {
  readonly kind: typeof ARRIVAL;
  readonly passenger: number;
}

interface ServiceEndEvent {
  readonly kind: typeof SERVICE_END;
  readonly passenger: number;
}

type ModelEvent = ArrivalEvent | ServiceEndEvent;

/** A waiting ticket plus the bookkeeping the model needs. */
interface QueueEntry extends Omit<WaitingTicket, 'overtakenCount'> {
  overtakenCount: number;
  readonly passenger: number;
}

interface CallRecord {
  readonly calledAtMs: number;
  readonly laneIndex: number;
  readonly priorityCall: boolean;
  readonly overtakenCount: number;
  readonly reasons: readonly ReasonCode[];
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

export function validatePopulation(population: Population): void {
  const { checkpoint, flights, passengers } = population;
  requireInteger(checkpoint.lanes, 'checkpoint.lanes', 1);
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
  });
}

/**
 * Simulates one service day at a checkpoint operated as a virtual queue.
 *
 * Each passenger receives a ticket on arrival and waits in the waiting area. Whenever a lane is
 * free and somebody is waiting, the policy (through the priority engine) chooses who to call; the
 * call is answered immediately (no call latency, no no-shows in this model version), the passenger
 * is screened for `serviceMs` and then walks to the gate. A passenger misses the flight when they
 * reach the gate after boarding closed.
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
  validatePolicyParams(policy.params);
  validateClassificationParams(options.classification);

  const { checkpoint, flights, passengers } = population;
  const estimates = checkpoint.estimates;
  const laneCount = checkpoint.lanes;
  const historyLimit = policy.params.kind === 'constrained-edf' ? policy.params.capWindowCalls : 1;

  const sim = new DiscreteEventSimulation<ModelEvent>(
    passengers.reduce((min, p) => Math.min(min, p.arrivalMs), 0),
  );
  for (const p of passengers)
    sim.scheduleAt(p.arrivalMs, ARRIVAL, { kind: ARRIVAL, passenger: p.index });

  const laneFree: boolean[] = Array.from({ length: laneCount }, () => true);
  const waiting: QueueEntry[] = [];
  const recentPriorityCalls: boolean[] = [];
  const classAtArrival: RiskClass[] = new Array<RiskClass>(passengers.length);
  const calls: (CallRecord | undefined)[] = new Array<CallRecord | undefined>(passengers.length);
  const serviceEnds: number[] = new Array<number>(passengers.length).fill(-1);

  let nextFifoKey = 0;
  let callCount = 0;
  let priorityCalls = 0;
  let capReachedCalls = 0;
  let overtakeGuardCalls = 0;
  let busyMs = 0;
  let waitingAreaMs = 0;
  let lastWaitingChangeMs = sim.nowMs;
  let maxWaiting = 0;
  let firstArrivalMs = Number.POSITIVE_INFINITY;
  let lastServiceEndMs = Number.NEGATIVE_INFINITY;

  /** Integrates the waiting count up to `now`; call before changing the queue length. */
  const accumulateWaiting = (now: number): void => {
    waitingAreaMs += waiting.length * (now - lastWaitingChangeMs);
    lastWaitingChangeMs = now;
  };

  const dispatch = (now: number): void => {
    for (let lane = 0; lane < laneCount && waiting.length > 0; lane++) {
      if (!laneFree[lane]) continue;
      const selection = selectNext({
        nowMs: now,
        checkpoint: estimates,
        waiting,
        recentPriorityCalls,
        policy: policy.params,
      });
      if (selection === null) break;
      const position = selection.positionInFifo;
      const entry = waiting[position];
      if (entry?.id !== selection.ticketId) {
        throw new Error(
          `engine selected ${selection.ticketId} at an unexpected position ${position}`,
        );
      }
      for (let i = 0; i < position; i++) (waiting[i] as QueueEntry).overtakenCount++;
      accumulateWaiting(now);
      waiting.splice(position, 1);

      recentPriorityCalls.push(selection.priorityCall);
      if (recentPriorityCalls.length > 2 * historyLimit + 64) {
        recentPriorityCalls.splice(0, recentPriorityCalls.length - historyLimit);
      }
      callCount++;
      if (selection.priorityCall) priorityCalls++;
      if (selection.reasons.includes('CAP_REACHED')) capReachedCalls++;
      if (selection.reasons.includes('OVERTAKE_LIMIT_GUARD')) overtakeGuardCalls++;

      const passenger = passengers[entry.passenger] as SimPassenger;
      calls[entry.passenger] = {
        calledAtMs: now,
        laneIndex: lane,
        priorityCall: selection.priorityCall,
        overtakenCount: entry.overtakenCount,
        reasons: selection.reasons,
      };
      laneFree[lane] = false;
      busyMs += passenger.serviceMs;
      sim.scheduleAt(now + passenger.serviceMs, SERVICE_END, {
        kind: SERVICE_END,
        passenger: entry.passenger,
      });
    }
  };

  sim.run((event) => {
    const now = event.timeMs;
    const payload = event.payload;
    if (payload.kind === ARRIVAL) {
      const passenger = passengers[payload.passenger] as SimPassenger;
      const flight = flights[passenger.flightIndex];
      if (flight === undefined) throw new PopulationError(`unknown flight for ${passenger.id}`);
      const entry: QueueEntry = {
        id: passenger.id,
        fifoKey: nextFifoKey++,
        segment: passenger.segment,
        deadline: flight.knownDeadline,
        walkEstimateMs: passenger.walkEstimateMs,
        overtakenCount: 0,
        passenger: passenger.index,
      };
      classAtArrival[passenger.index] = assessTicket(
        entry,
        waiting.length,
        now,
        estimates,
        options.classification,
      ).riskClass;
      firstArrivalMs = Math.min(firstArrivalMs, now);
      accumulateWaiting(now);
      waiting.push(entry);
      maxWaiting = Math.max(maxWaiting, waiting.length);
    } else {
      const call = calls[payload.passenger];
      if (call === undefined)
        throw new Error(`service ended for uncalled passenger ${payload.passenger}`);
      laneFree[call.laneIndex] = true;
      serviceEnds[payload.passenger] = now;
      lastServiceEndMs = Math.max(lastServiceEndMs, now);
    }
    dispatch(now);
  });

  const outcomes: PassengerOutcome[] = passengers.map((passenger) => {
    const call = calls[passenger.index];
    const serviceEndMs = serviceEnds[passenger.index] ?? -1;
    const arrivalClass = classAtArrival[passenger.index];
    const flight = flights[passenger.flightIndex];
    if (
      call === undefined ||
      serviceEndMs < 0 ||
      arrivalClass === undefined ||
      flight === undefined
    ) {
      throw new Error(`passenger ${passenger.id} was not served (conservation violated)`);
    }
    const gateArrivalMs = serviceEndMs + passenger.walkMs;
    return {
      calledAtMs: call.calledAtMs,
      serviceEndMs,
      gateArrivalMs,
      waitMs: call.calledAtMs - passenger.arrivalMs,
      missed: gateArrivalMs > flight.boardingCloseMs,
      priorityCall: call.priorityCall,
      overtakenCount: call.overtakenCount,
      selectionReasons: call.reasons,
      classAtArrival: arrivalClass,
      laneIndex: call.laneIndex,
    };
  });

  const empty = passengers.length === 0;
  return {
    policyId: policy.id,
    outcomes,
    stats: {
      calls: callCount,
      priorityCalls,
      capReachedCalls,
      overtakeGuardCalls,
      firstArrivalMs: empty ? 0 : firstArrivalMs,
      lastServiceEndMs: empty ? 0 : lastServiceEndMs,
      busyMs,
      waitingAreaMs,
      maxWaiting,
    },
  };
}
