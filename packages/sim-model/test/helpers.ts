import type { KnownDeadline } from '@gateflow/domain';
import type { ConstrainedEdfPolicyParams, Policy } from '@gateflow/priority-engine';
import { FIFO_POLICY, PRIORITY_V0_POLICY, classificationOf } from '@gateflow/priority-engine';
import { exponential, streamFor } from '@gateflow/sim-kernel';
import type { CheckpointSpec, Population, SimFlight, SimPassenger } from '../src';

export const FIFO = FIFO_POLICY;
export const EDF = PRIORITY_V0_POLICY;
export const CLASSIFICATION = classificationOf(PRIORITY_V0_POLICY)!;
export const FAR_FUTURE = 1_000_000_000_000;

export function edfWith(overrides: Partial<ConstrainedEdfPolicyParams>): Policy {
  return {
    ...EDF,
    id: 'edf-test',
    params: { ...(EDF.params as ConstrainedEdfPolicyParams), ...overrides },
  };
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
    ...overrides,
  };
}

export function checkpoint(
  lanes: number,
  throughputPerHour: number,
  processMs = 0,
): CheckpointSpec {
  return { lanes, estimates: { throughputPerHour, processMs, responseMs: 0 } };
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
  return (15 + ((i * 7919) % 30)) * 60_000;
}
