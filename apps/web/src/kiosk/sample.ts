import { syntheticBoardingPass } from '@gateflow/bcbp';
import type { DemoFlightsResponse } from '@gateflow/contracts';
import { browserRandom } from '../random';

/**
 * A sample boarding pass for one of the demo flights of the next 24 hours, for demonstrations
 * without a real pass: a sample name and booking reference, never a real person. Flights that
 * leave in more than half an hour come first: their boarding is still open.
 */
export function samplePass(iata: string, demo: DemoFlightsResponse, nowMs: number): string | null {
  const later = demo.flights.filter((f) => Date.parse(f.departure) > nowMs + 30 * 60_000);
  const pool = later.length > 0 ? later : demo.flights;
  const random = browserRandom();
  const flight = pool[Math.floor(random.nextFloat() * pool.length)];
  if (flight === undefined) return null;
  const [year = 0, month = 0, day = 0] = flight.date.split('-').map(Number);
  return syntheticBoardingPass(random, [
    {
      from: iata,
      to: iata === 'ZZZ' ? 'XXX' : 'ZZZ',
      carrier: flight.carrier,
      flightNumber: flight.flightNumber,
      date: { year, month, day },
    },
  ]).text;
}
