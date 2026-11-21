import { MS_PER_MINUTE } from '@gateflow/domain';
import type { ArrivalForecast } from '@gateflow/sim-model';
import { generatePopulation } from './generate';
import type { Scenario } from './schema';

/**
 * Days the arrival forecast learns from. Their seeds start at {@link FORECAST_FIRST_SEED}, far
 * from the days simulated in the reports (1 to a few hundred), so that the forecast of a day never
 * contains that day.
 */
export const FORECAST_DAYS = 50;
export const FORECAST_FIRST_SEED = 1_000_001;

/**
 * GateFlow's forecast of the people arriving at the checkpoint in each minute of the day: the
 * average over {@link FORECAST_DAYS} simulated days of the same scenario that are not simulated in
 * the reports (as an airport forecasts from past days with the same flights). It knows the flights
 * and how passengers usually arrive, not the load factors or the disruptions of the day; lane
 * management scales it by the arrivals it sees (sim-model).
 */
export function arrivalForecast(scenario: Scenario, days = FORECAST_DAYS): ArrivalForecast {
  if (!Number.isSafeInteger(days) || days < 1) {
    throw new RangeError(`days must be a positive integer, got ${days}`);
  }
  const people = new Map<number, number>();
  for (let i = 0; i < days; i++) {
    for (const p of generatePopulation(scenario, FORECAST_FIRST_SEED + i).passengers) {
      const minute = Math.floor(p.arrivalMs / MS_PER_MINUTE);
      people.set(minute, (people.get(minute) ?? 0) + p.partySize);
    }
  }
  if (people.size === 0) return { startMs: 0, peoplePerMinute: [] };
  const minutes = [...people.keys()];
  const first = Math.min(...minutes);
  const last = Math.max(...minutes);
  const peoplePerMinute: number[] = [];
  for (let minute = first; minute <= last; minute++) {
    peoplePerMinute.push((people.get(minute) ?? 0) / days);
  }
  return { startMs: first * MS_PER_MINUTE, peoplePerMinute };
}
