import { LIBRARY_CALIBRATION, adviseLanes } from '@gateflow/forecast';
import type { CheckpointProfile, LiveState } from '@gateflow/forecast';
import type { Policy } from '@gateflow/queue-core';
import { simulateCheckpoint } from '@gateflow/sim-model';
import type {
  DayEvent,
  LaneAdvisor,
  Population,
  RunResult,
  SimulationOptions,
} from '@gateflow/sim-model';
import { LiveView } from './live';

/*
 * GateFlow's console in the simulator (S22.3, ADR-057): the very rule the console runs (S22,
 * `adviseLanes`, on the forecast of S21 with the library's calibration), asked at each review of a
 * policy `@advise` with what the live system would know of the simulated day then. The simulator
 * itself knows nothing of forecasts: it asks the advisor, which this module builds.
 */

/** The console of a simulated day: the advisor, and the observer of the day that feeds it. */
export interface SimulatedConsole {
  readonly advisor: LaneAdvisor;
  readonly observe: (event: DayEvent) => void;
}

/**
 * The console's rule on a simulated day: the scenario's profile (what the forecasts know of it)
 * and what the live system knows of the day so far. `onState`, for tests, sees each state read.
 */
export function simulatedConsole(
  profile: CheckpointProfile,
  population: Population,
  onState?: (state: LiveState, lanesChangedAtMs: number | null) => void,
): SimulatedConsole {
  const view = new LiveView(population);
  const advisor: LaneAdvisor = (nowMs, rule) => {
    const state = view.stateNow(nowMs);
    onState?.(state, view.lanesChangedAtMs);
    const advice = adviseLanes(profile, state, {
      calibration: LIBRARY_CALIBRATION,
      rule: {
        reviewEveryMs: rule.reviewIntervalMs,
        horizonMs: rule.horizonMs,
        targetWaitMs: rule.targetWaitMs,
        closeBelowWaitMs: rule.closeWhenWaitMs,
      },
      lanesChangedAtMs: view.lanesChangedAtMs,
    });
    if (advice === null) return null;
    return {
      action: advice.action,
      lanes: advice.lanes,
      // What motivated it: the longest median wait, as things are or with one lane fewer.
      waitMs: advice.action === 'OPEN' ? advice.peakWithoutMs : advice.peakWithMs,
    };
  };
  return { advisor, observe: view.observe };
}

/** True when a policy's lanes are recommended by the console (`@advise`), which needs a profile. */
export function needsProfile(policies: readonly Policy[]): boolean {
  return policies.some((policy) => policy.lanes?.kind === 'advise');
}

/**
 * Simulates a policy on a day: as `simulateCheckpoint`, with GateFlow's console for a policy
 * `@advise` (from the scenario's profile); the caller's observer sees the same events.
 */
export function simulatePolicy(
  population: Population,
  policy: Policy,
  options: SimulationOptions,
  profile: CheckpointProfile | undefined,
): RunResult {
  if (policy.lanes?.kind !== 'advise') return simulateCheckpoint(population, policy, options);
  if (profile === undefined) {
    throw new Error(`policy ${policy.id} needs the scenario's profile for the console's rule`);
  }
  const gateflow = simulatedConsole(profile, population);
  const outer = options.observer;
  return simulateCheckpoint(population, policy, {
    ...options,
    laneAdvisor: gateflow.advisor,
    observer:
      outer === undefined
        ? gateflow.observe
        : (event) => {
            gateflow.observe(event);
            outer(event);
          },
  });
}
