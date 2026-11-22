import { and, eq } from 'drizzle-orm';
import { PRIORITY_V3_POLICY } from '@gateflow/queue-core';
import { applyScenarioSettings } from '@gateflow/sim-metrics';
import { generatePopulation, generateSchedule } from '@gateflow/sim-scenarios';
import type { Scenario } from '@gateflow/sim-scenarios';
import type { Db } from './db/client';
import { airport, checkpoint, flight, organization } from './db/schema';
import type { Ids } from './ids';
import { serviceDayOf, zonedEpoch } from './time';

export interface Seeded {
  readonly airportId: string;
  readonly checkpointId: string;
  readonly serviceDay: string;
  readonly flights: number;
}

/**
 * Demo data from a scenario of the library: its airport, its checkpoint run with GateFlow priority
 * v3 and the airport's settings, and the scenario's flights on the service day of `now`. Running
 * it again adds what is missing and changes nothing else. Every flight is marked DEMO.
 */
export async function seedDemo(
  db: Db,
  scenario: Scenario,
  options: { readonly now: number; readonly ids: Ids; readonly serviceDay?: string },
): Promise<Seeded> {
  const airportCode = scenario.airport?.id ?? scenario.id;
  const airportName = scenario.airport?.name ?? scenario.title;
  const timeZone = scenario.timeZone;
  const serviceDay = options.serviceDay ?? serviceDayOf(options.now, timeZone, '03:00');
  return db.transaction(async (tx) => {
    let airportRow = (await tx.select().from(airport).where(eq(airport.code, airportCode)))[0];
    if (airportRow === undefined) {
      const orgId = options.ids.uuid();
      await tx.insert(organization).values({ id: orgId, name: 'GateFlow demo', country: 'IT' });
      airportRow = (
        await tx
          .insert(airport)
          .values({
            id: options.ids.uuid(),
            orgId,
            code: airportCode,
            name: airportName,
            timeZone,
            dataClassification: scenario.dataClassification,
          })
          .returning()
      )[0];
    }
    if (airportRow === undefined) throw new Error('the airport could not be created');
    const code = scenario.checkpoint.id;
    let checkpointRow = (
      await tx
        .select()
        .from(checkpoint)
        .where(and(eq(checkpoint.airportId, airportRow.id), eq(checkpoint.code, code)))
    )[0];
    if (checkpointRow === undefined) {
      const [policy] = applyScenarioSettings([PRIORITY_V3_POLICY], scenario);
      const spec = generatePopulation(scenario, 1).checkpoint;
      checkpointRow = (
        await tx
          .insert(checkpoint)
          .values({
            id: options.ids.uuid(),
            airportId: airportRow.id,
            code,
            name: `${airportName}, ${code}`,
            ticketPrefix: 'A',
            settings: {
              policy,
              lanesOpen: Math.max(...spec.laneSchedule.map((entry) => entry.lanes)),
              ratePerLanePerHour: spec.serviceRatePerLanePerHour,
              processEstimateMs: spec.processEstimateMs,
            },
          })
          .returning()
      )[0];
    }
    if (checkpointRow === undefined) throw new Error('the checkpoint could not be created');
    const flights = generateSchedule(scenario);
    const at = (msOfDay: number) => zonedEpoch(serviceDay, msOfDay, timeZone);
    for (const f of flights) {
      const known = f.knownDeadline;
      await tx
        .insert(flight)
        .values({
          id: options.ids.uuid(),
          airportId: airportRow.id,
          serviceDate: serviceDay,
          number: f.id,
          stdMs: at(f.stdMs),
          boardingCloseMs: known.atMs === null ? null : at(known.atMs),
          deadlineSource: known.source,
          observedAtMs: null,
          gateZone: f.gateZone,
          walkEstimateMs: f.walkEstimateMs,
          environment: 'DEMO',
        })
        .onConflictDoNothing();
    }
    return {
      airportId: airportRow.id,
      checkpointId: checkpointRow.id,
      serviceDay,
      flights: flights.length,
    };
  });
}
