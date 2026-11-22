import { and, eq } from 'drizzle-orm';
import { PRIORITY_V3_POLICY, VIRTUAL_FIFO_POLICY } from '@gateflow/queue-core';
import { applyScenarioSettings } from '@gateflow/sim-metrics';
import { generatePopulation, generateSchedule } from '@gateflow/sim-scenarios';
import type { Scenario } from '@gateflow/sim-scenarios';
import type { Db } from './db/client';
import { airport, checkpoint, flight, organization, policyVersion } from './db/schema';
import { policyHash } from './policies';
import type { Ids } from './ids';
import { saveScenario } from './simulations';
import { localDate, serviceDayOf, zonedEpoch } from './time';

/**
 * The carrier and number of a flight of the library, as boarding passes give them. Synthetic
 * flights (`F001`) get `ZZ`, a placeholder designator of no airline.
 */
export function designatorOf(number: string): { carrier: string; flightNumber: string } | null {
  const synthetic = /^F(\d{1,4})$/.exec(number);
  if (synthetic !== null) return { carrier: 'ZZ', flightNumber: String(Number(synthetic[1])) };
  const real = /^([A-Z0-9]{2})\s?(\d{1,4})([A-Z]?)$/.exec(number);
  if (real === null) return null;
  return { carrier: real[1] ?? '', flightNumber: `${String(Number(real[2]))}${real[3] ?? ''}` };
}

/**
 * The IATA code of a library airport: `vce-like` gives `VCE`. Any other airport gets `ZZZ`, which
 * matches no real boarding pass, until its own code is configured.
 */
export function iataOf(code: string): string {
  const match = /^([a-z]{3})-like(-|$)/.exec(code);
  return match === null ? 'ZZZ' : (match[1] ?? 'zzz').toUpperCase();
}

export interface Seeded {
  readonly airportId: string;
  readonly checkpointId: string;
  readonly serviceDay: string;
  readonly flights: number;
}

/**
 * Demo data from a scenario of the library: its airport, its checkpoint run with GateFlow priority
 * v3 and the airport's settings, and the scenario's flights on the service day of `now`; the
 * scenario is saved for the airport's simulations (S19). Running it again adds what is missing and
 * changes nothing else. Every flight is marked DEMO.
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
  const seeded = await db.transaction(async (tx) => {
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
            iata: iataOf(airportCode),
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
    // The policies an administrator can activate (S17): GateFlow priority v3 and a virtual queue
    // in order of arrival, with the airport's settings, published by GateFlow itself.
    for (const policy of applyScenarioSettings(
      [PRIORITY_V3_POLICY, VIRTUAL_FIFO_POLICY],
      scenario,
    )) {
      await tx
        .insert(policyVersion)
        .values({
          id: options.ids.uuid(),
          airportId: airportRow.id,
          hash: policyHash(policy),
          policyId: policy.id,
          version: policy.version,
          title: policy.title,
          content: policy,
          createdAtMs: options.now,
          createdBy: 'system',
        })
        .onConflictDoNothing();
    }
    const flights = generateSchedule(scenario);
    const at = (msOfDay: number) => zonedEpoch(serviceDay, msOfDay, timeZone);
    const two = (n: number) => String(n).padStart(2, '0');
    for (const f of flights) {
      const designator = designatorOf(f.id);
      const departure = localDate(at(f.stdMs), timeZone);
      const known = f.knownDeadline;
      await tx
        .insert(flight)
        .values({
          id: options.ids.uuid(),
          airportId: airportRow.id,
          serviceDate: serviceDay,
          number: f.id,
          carrier: designator?.carrier ?? null,
          flightNumber: designator?.flightNumber ?? null,
          departureDate: `${String(departure.year)}-${two(departure.month)}-${two(departure.day)}`,
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
  // The scenario, for the airport's simulations (S19).
  await saveScenario(db, options.ids, {
    airportId: seeded.airportId,
    scenario,
    by: 'system',
    nowMs: options.now,
  });
  return seeded;
}
