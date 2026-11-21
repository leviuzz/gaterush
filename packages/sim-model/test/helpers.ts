import type { KnownDeadline } from '@gateflow/domain';
import type { ConstrainedEdfSelection, SelectionParams } from '@gateflow/priority-engine';
import {
  DEFAULT_VIRTUAL_QUEUE,
  FIFO_POLICY,
  PRIORITY_V0_POLICY,
  PRIORITY_V0_SELECTION,
  classificationOf,
} from '@gateflow/queue-core';
import type { Policy, QueueOperation, VirtualQueue } from '@gateflow/queue-core';
import { exponential, streamFor } from '@gateflow/sim-kernel';
import type { CheckpointSpec, Population, SimFlight, SimPassenger } from '../src';

export const MINUTE = 60_000;
export const FIFO = FIFO_POLICY;
export const CLASSIFICATION = classificationOf(PRIORITY_V0_POLICY)!;
export const OPTIONS = { classification: CLASSIFICATION };
export const FAR_FUTURE = 1_000_000_000_000;

/** A virtual queue whose calls are answered at once: no call-ahead and no prepare window. */
export const INSTANT_QUEUE: VirtualQueue = {
  ...DEFAULT_VIRTUAL_QUEUE,
  callAheadSeconds: 0,
  responseEstimateSeconds: 0,
  prepareWindowSize: 0,
};

export function policy(
  selection: SelectionParams,
  queue: QueueOperation,
  id = 'test-policy',
): Policy {
  return { id, version: '0', title: id, selection, queue };
}

/** Constrained EDF v0 with `overrides`, on a virtual queue with instant calls by default. */
export function edfWith(
  overrides: Partial<ConstrainedEdfSelection> = {},
  queue: QueueOperation = INSTANT_QUEUE,
): Policy {
  return policy({ ...PRIORITY_V0_SELECTION, ...overrides }, queue, 'edf-test');
}

/** Virtual queue in FIFO order with `overrides` on top of the instant queue. */
export function virtualFifo(overrides: Partial<VirtualQueue> = {}): Policy {
  return policy({ kind: 'fifo' }, { ...INSTANT_QUEUE, ...overrides }, 'virtual-fifo-test');
}

export function flight(
  index: number,
  boardingCloseMs = FAR_FUTURE,
  knownDeadline: KnownDeadline = { atMs: boardingCloseMs, source: 'FEED' },
): SimFlight {
  return {
    index,
    id: `F${index}`,
    stdMs: boardingCloseMs,
    boardingCloseMs,
    knownDeadline,
    gateZone: 'A',
  };
}

export function passenger(
  index: number,
  arrivalMs: number,
  serviceMs: number,
  overrides: Partial<SimPassenger> = {},
): SimPassenger {
  return {
    index,
    id: `p${index}`,
    flightIndex: 0,
    segment: 'DEPARTING',
    arrivalMs,
    serviceMs,
    walkMs: 0,
    walkEstimateMs: 0,
    callResponseMs: 0,
    absenceDelayMs: 0,
    ...overrides,
  };
}

/** All lanes open all day. */
export function checkpoint(
  lanes: number,
  throughputPerHour: number,
  processMs = 0,
): CheckpointSpec {
  return {
    laneSchedule: [{ fromMs: 0, lanes }],
    serviceRatePerLanePerHour: throughputPerHour / lanes,
    processEstimateMs: processMs,
  };
}

/**
 * M/M/c population: Poisson arrivals with rate lambda = rho * c / meanServiceMs and exponential
 * service times. Deadlines are unknown, so every policy behaves as FIFO.
 */
export function mmcPopulation(
  lanes: number,
  rho: number,
  meanServiceMs: number,
  customers: number,
  seed: number,
): Population {
  const arrivals = streamFor(seed, [1]);
  const services = streamFor(seed, [2]);
  const meanInterarrival = meanServiceMs / (rho * lanes);
  let clock = 0;
  const passengers: SimPassenger[] = [];
  for (let i = 0; i < customers; i++) {
    clock += exponential(arrivals, meanInterarrival);
    passengers.push(
      passenger(i, Math.round(clock), Math.round(exponential(services, meanServiceMs))),
    );
  }
  return {
    checkpoint: checkpoint(lanes, (lanes * 3_600_000) / meanServiceMs, meanServiceMs),
    flights: [flight(0, FAR_FUTURE, { atMs: null, source: 'NONE' })],
    passengers,
  };
}

/**
 * Gives every passenger their own flight whose boarding closes `slackMs(i)` after the passenger's
 * arrival (known to the system through a feed), so that queueing creates urgent passengers.
 */
export function withPersonalDeadlines(
  base: Population,
  slackMs: (i: number) => number,
): Population {
  return {
    ...base,
    flights: base.passengers.map((p, i) => flight(i, p.arrivalMs + slackMs(i))),
    passengers: base.passengers.map((p, i) => ({ ...p, flightIndex: i })),
  };
}

/** Deterministic spread of slacks between 15 and 44 minutes. */
export function spreadSlack(i: number): number {
  return (15 + ((i * 7919) % 30)) * MINUTE;
}

/**
 * Deterministic call behaviour: responses between 20 s and 2 min 40 s, and one passenger in 25
 * missing the first call by 2 to 26 minutes (so some are recalled, some become no-shows, some are
 * reactivated and some must take a new ticket).
 */
export function withCallBehaviour(base: Population): Population {
  return {
    ...base,
    passengers: base.passengers.map((p, i) => ({
      ...p,
      callResponseMs: (20 + ((i * 37) % 141)) * 1000,
      absenceDelayMs: i % 25 === 7 ? (2 + ((Math.floor(i / 25) * 7) % 25)) * MINUTE : 0,
    })),
  };
}
