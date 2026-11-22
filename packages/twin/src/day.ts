import type { ClassificationParams } from '@gateflow/priority-engine';
import { OperationError, ticketNumber, validateLivePolicy } from '@gateflow/operations';
import type { Policy } from '@gateflow/queue-core';
import { arrivalClassification } from '@gateflow/sim-metrics';
import { simulateCheckpoint } from '@gateflow/sim-model';
import type { Population, RunStats, TapeEntry } from '@gateflow/sim-model';
import { generatePopulation } from '@gateflow/sim-scenarios';
import type { Scenario } from '@gateflow/sim-scenarios';

/** Thrown when a day cannot be played by the twin. */
export class TwinError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TwinError';
  }
}

/**
 * A day for the digital twin (S18): the simulator's run of a scenario on one seed with one policy,
 * and its tape, every operation on the queue in order. The live system is given the same
 * operations; it must call the same tickets.
 */
export interface TwinDay {
  readonly scenarioId: string;
  readonly seed: number;
  readonly policy: Policy;
  /** The classification of tickets on arrival, as the live day gets it from its policy. */
  readonly classification: ClassificationParams;
  readonly population: Population;
  readonly tape: readonly TapeEntry[];
  /** The lanes open when the day starts: the live checkpoint opens with them. */
  readonly lanesAtStart: number;
  /** The first and the last operation of the tape, in the run's time (ms since midnight). */
  readonly startMs: number;
  readonly endMs: number;
  /** The simulator's figures of the day. */
  readonly stats: RunStats;
}

/**
 * Simulates `scenario` on day `seed` with `policy` and records its tape. The policy must be one the
 * live system runs: a virtual queue, with the lanes staff open (no simulated lane management).
 * The day starts at its local midnight: a scenario with operations before it cannot be played.
 */
export function twinDay(scenario: Scenario, seed: number, policy: Policy): TwinDay {
  try {
    validateLivePolicy(policy);
  } catch (error) {
    if (error instanceof OperationError) throw new TwinError(error.message);
    throw error;
  }
  const population = generatePopulation(scenario, seed);
  const classification = arrivalClassification([policy]);
  const tape: TapeEntry[] = [];
  const run = simulateCheckpoint(population, policy, {
    classification,
    recorder: (entry) => {
      tape.push(entry);
    },
  });
  const first = tape[0];
  const last = tape.at(-1);
  if (first?.type !== 'LANES' || last === undefined) {
    throw new TwinError('the tape of a day starts with the lanes open');
  }
  if (first.atMs < 0) {
    throw new TwinError('the twin plays a day from its local midnight: this one starts before it');
  }
  return {
    scenarioId: scenario.id,
    seed,
    policy,
    classification,
    population,
    tape,
    lanesAtStart: first.lanes,
    startMs: first.atMs,
    endMs: last.atMs,
    stats: run.stats,
  };
}

/** The tickets the simulator called, in order, with the time of each call. */
export function simulatedCalls(
  day: TwinDay,
): { readonly atMs: number; readonly ticketId: string }[] {
  const calls: { atMs: number; ticketId: string }[] = [];
  for (const entry of day.tape) {
    if (entry.type === 'CALL_NEXT' && entry.ticketId !== null) {
      calls.push({ atMs: entry.atMs, ticketId: entry.ticketId });
    }
  }
  return calls;
}

/** How the live checkpoint of a twin runs: the scenario's lanes and screening rate, the policy. */
export interface TwinSettings {
  readonly policy: Policy;
  readonly lanesOpen: number;
  readonly ratePerLanePerHour: number;
  readonly processEstimateMs: number;
}

/** The settings of the twin's live checkpoint: what its days open with. */
export function twinSettings(day: TwinDay): TwinSettings {
  return {
    policy: day.policy,
    lanesOpen: day.lanesAtStart,
    ratePerLanePerHour: day.population.checkpoint.serviceRatePerLanePerHour,
    processEstimateMs: day.population.checkpoint.processEstimateMs,
  };
}

/**
 * The numbers the live system must call, in order, on a checkpoint whose tickets have `prefix`:
 * the live day numbers its tickets in the order of issue, which is the tape's. With `untilMs`, the
 * calls up to that time of the day.
 */
export function expectedCallNumbers(day: TwinDay, prefix: string, untilMs = Infinity): string[] {
  const numbers = new Map<string, string>();
  const calls: string[] = [];
  for (const entry of day.tape) {
    if (entry.atMs > untilMs) break;
    if (entry.type === 'ISSUE') numbers.set(entry.input.id, ticketNumber(prefix, numbers.size + 1));
    if (entry.type === 'CALL_NEXT' && entry.ticketId !== null) {
      const number = numbers.get(entry.ticketId);
      if (number === undefined)
        throw new TwinError(`a call of ticket ${entry.ticketId} before its issue`);
      calls.push(number);
    }
  }
  return calls;
}
