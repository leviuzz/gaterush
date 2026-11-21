import { MS_PER_HOUR, minutesToMs, secondsToMs } from '@gateflow/domain';
import type { Segment } from '@gateflow/domain';
import {
  bernoulli,
  categorical,
  labelCode,
  lognormalFromMeanCv,
  lognormalFromMedian,
  streamFor,
  triangular,
} from '@gateflow/sim-kernel';
import type { Population, SimFlight, SimPassenger } from '@gateflow/sim-model';
import { clockMinutes } from './schema';
import type { Scenario } from './schema';

/** Version of the population generator. Bump on any change that can alter generated data. */
export const GENERATOR_VERSION = '0.2.0';

const DOMAIN = labelCode('gateflow.population');
const KEY = {
  aircraft: labelCode('flight.aircraft'),
  gateZone: labelCode('flight.gateZone'),
  loadFactor: labelCode('flight.loadFactor'),
  segment: labelCode('pax.segment'),
  arrival: labelCode('pax.arrival'),
  service: labelCode('pax.service'),
  walk: labelCode('pax.walk'),
  // Added in generator 0.2.0. Every attribute has its own stream, so the attributes above are
  // generated exactly as in 0.1.0.
  response: labelCode('pax.response'),
  absent: labelCode('pax.absent'),
  absentExtra: labelCode('pax.absentExtra'),
} as const;

/** A flight of the design day, with the descriptive attributes used to generate passengers. */
export interface ScheduledFlight extends SimFlight {
  readonly aircraftCategory: string;
  readonly seats: number;
  readonly walkEstimateMs: number;
}

function pick<T>(items: readonly T[], index: number): T {
  const item = items[index];
  if (item === undefined) throw new RangeError(`index ${index} out of range`);
  return item;
}

/**
 * Builds the flights of the design day. The schedule depends only on the scenario (including
 * `schedule.generatorSeed`), never on the replication seed: every replication simulates the same
 * day with different passengers.
 */
export function generateSchedule(scenario: Scenario): ScheduledFlight[] {
  const { schedule, operations } = scenario;
  const genSeed = schedule.generatorSeed;
  const mix = schedule.aircraftMix.value;
  const zones = schedule.gateZones.value;
  const closeOffsetMs = minutesToMs(operations.boardingCloseMinutesBeforeStd.value);
  const knowledge = operations.deadlineKnowledge.value;
  const rows = [...schedule.departuresPerHour.value].sort((a, b) => a.hour - b.hour);

  const flights: ScheduledFlight[] = [];
  for (const { hour, departures } of rows) {
    for (let i = 0; i < departures; i++) {
      const index = flights.length;
      // Departures are spread evenly within the hour, at whole minutes.
      const minute = Math.floor(((i + 0.5) * 60) / departures);
      const stdMs = hour * MS_PER_HOUR + minutesToMs(minute);
      const aircraft = pick(
        mix,
        categorical(
          streamFor(genSeed, [DOMAIN, KEY.aircraft, index]),
          mix.map((m) => m.share),
        ),
      );
      const zone = pick(
        zones,
        categorical(
          streamFor(genSeed, [DOMAIN, KEY.gateZone, index]),
          zones.map((z) => z.share),
        ),
      );
      const boardingCloseMs = stdMs - closeOffsetMs;
      flights.push({
        index,
        id: `F${String(index + 1).padStart(3, '0')}`,
        stdMs,
        boardingCloseMs,
        // In this generator version the system's knowledge equals the ground truth.
        knownDeadline: { atMs: boardingCloseMs, source: knowledge },
        gateZone: zone.id,
        aircraftCategory: aircraft.category,
        seats: aircraft.seats,
        walkEstimateMs: minutesToMs(zone.walkMinutes),
      });
    }
  }
  return flights;
}

/**
 * Generates the population of one replication. Each random attribute has its own stream keyed by
 * (seed, attribute, flight, passenger), so the same passenger gets the same arrival, service and
 * walking times under every policy (common random numbers), and adding attributes in future
 * versions does not perturb existing ones.
 */
export function generatePopulation(scenario: Scenario, seed: number): Population {
  const flights = generateSchedule(scenario);
  const { passengers: spec, checkpoint } = scenario;
  const lf = spec.loadFactor.value;
  const transferShare = spec.transferShare.value;
  const walkSigma = spec.walkSpeedSigma.value;
  const serviceMeanMs = secondsToMs(checkpoint.serviceTimeMeanSeconds.value);
  const serviceCv = checkpoint.serviceTimeCv.value;
  const response = spec.callResponse.value;

  const passengers: SimPassenger[] = [];
  for (const flight of flights) {
    const loadFactor = triangular(
      streamFor(seed, [DOMAIN, KEY.loadFactor, flight.index]),
      lf.min,
      lf.mode,
      lf.max,
    );
    const count = Math.round(flight.seats * loadFactor);
    for (let j = 0; j < count; j++) {
      const key = (attribute: number) => streamFor(seed, [DOMAIN, attribute, flight.index, j]);
      const segment: Segment = bernoulli(key(KEY.segment), transferShare)
        ? 'TRANSFER'
        : 'DEPARTING';
      const showUp =
        segment === 'TRANSFER' ? spec.showUp.transfer.value : spec.showUp.departing.value;
      const earlinessMin = Math.min(
        showUp.maxMinutesBeforeStd,
        showUp.minMinutesBeforeStd +
          lognormalFromMedian(key(KEY.arrival), showUp.medianExtraMinutes, showUp.sigma),
      );
      const serviceMs = Math.max(
        1,
        Math.round(lognormalFromMeanCv(key(KEY.service), serviceMeanMs, serviceCv)),
      );
      const walkMs = Math.round(
        flight.walkEstimateMs * lognormalFromMedian(key(KEY.walk), 1, walkSigma),
      );
      const callResponseMs =
        response.medianSeconds === 0
          ? 0
          : Math.round(
              lognormalFromMedian(
                key(KEY.response),
                secondsToMs(response.medianSeconds),
                response.sigma,
              ),
            );
      const absenceDelayMs = bernoulli(key(KEY.absent), response.absentProbability)
        ? Math.round(
            lognormalFromMedian(
              key(KEY.absentExtra),
              minutesToMs(response.absentExtraMedianMinutes),
              response.absentExtraSigma,
            ),
          )
        : 0;
      passengers.push({
        index: passengers.length,
        id: `${flight.id}-${String(j + 1).padStart(3, '0')}`,
        flightIndex: flight.index,
        segment,
        arrivalMs: flight.stdMs - minutesToMs(earlinessMin),
        serviceMs,
        walkMs,
        walkEstimateMs: flight.walkEstimateMs,
        callResponseMs,
        absenceDelayMs,
      });
    }
  }

  return {
    checkpoint: {
      laneSchedule: checkpoint.laneSchedule.value.map(({ from, lanes }) => ({
        fromMs: minutesToMs(clockMinutes(from)),
        lanes,
      })),
      serviceRatePerLanePerHour: 3600 / checkpoint.serviceTimeMeanSeconds.value,
      processEstimateMs: serviceMeanMs,
    },
    flights: flights.map(
      ({ index, id, stdMs, boardingCloseMs, knownDeadline, gateZone }): SimFlight => ({
        index,
        id,
        stdMs,
        boardingCloseMs,
        knownDeadline,
        gateZone,
      }),
    ),
    passengers,
  };
}
