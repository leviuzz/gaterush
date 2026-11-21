import { MS_PER_HOUR, minutesToMs, secondsToMs } from '@gateflow/domain';
import type { Segment } from '@gateflow/domain';
import {
  bernoulli,
  categorical,
  exponential,
  labelCode,
  lognormalFromMeanCv,
  lognormalFromMedian,
  streamFor,
  triangular,
  uniform,
} from '@gateflow/sim-kernel';
import type { KnownDeadline } from '@gateflow/domain';
import type {
  FeedOutage,
  FlightUpdate,
  GateChange,
  LaneOutage,
  Population,
  SimFlight,
  SimPassenger,
} from '@gateflow/sim-model';
import { clockMinutes } from './schema';
import type { Scenario } from './schema';

/** Version of the population generator. Bump on any change that can alter generated data. */
export const GENERATOR_VERSION = '0.4.0';

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
  // Added in generator 0.3.0, again without moving the attributes above.
  party: labelCode('pax.party'),
  assisted: labelCode('pax.assisted'),
  strategic: labelCode('pax.strategic'),
  strategicArrival: labelCode('pax.strategicArrival'),
  // Added in generator 0.4.0 (disruptions), drawn per replication on streams of their own.
  delay: labelCode('flight.delay'),
  delayLength: labelCode('flight.delayLength'),
  delayNotice: labelCode('flight.delayNotice'),
  gateChange: labelCode('flight.gateChange'),
  gateChangeTime: labelCode('flight.gateChangeTime'),
  gateChangeZone: labelCode('flight.gateChangeZone'),
  gateChangeNotice: labelCode('flight.gateChangeNotice'),
  laneOutageGap: labelCode('day.laneOutageGap'),
  laneOutageLength: labelCode('day.laneOutageLength'),
  feedOutageGap: labelCode('day.feedOutageGap'),
  feedOutageLength: labelCode('day.feedOutageLength'),
} as const;

/** A flight of the design day, with the descriptive attributes used to generate passengers. */
export interface ScheduledFlight extends SimFlight {
  readonly aircraftCategory: string;
  readonly seats: number;
  readonly walkEstimateMs: number;
}

/** What the system knows of a boarding close at `atMs` with the scenario's source. */
function knownDeadlineAt(atMs: number, source: 'RULE' | 'FEED' | 'NONE'): KnownDeadline {
  return source === 'NONE' ? { atMs: null, source: 'NONE' } : { atMs, source };
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
        // Before any disruption the system's knowledge equals the ground truth (or is absent).
        knownDeadline: knownDeadlineAt(boardingCloseMs, knowledge),
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
 * (seed, attribute, flight, passenger slot), so the same passenger gets the same arrival, service
 * and walking times under every policy (common random numbers), and adding attributes in future
 * versions does not perturb existing ones.
 *
 * Passengers are grouped into parties that fill the slots of a flight in order. A party draws its
 * attributes from the streams of its first slot, and its screening time is the sum of its
 * members' screening times. With parties of one person only, the population is exactly the one
 * of generator 0.2.0.
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
  const partySizes = spec.groups.value.partySizes;
  const partyShares = partySizes.map((p) => p.share);
  const assistedShare = spec.assistedShare.value;
  const strategicSpec = spec.strategicLateArrival.value;

  const passengers: SimPassenger[] = [];
  for (const flight of flights) {
    const loadFactor = triangular(
      streamFor(seed, [DOMAIN, KEY.loadFactor, flight.index]),
      lf.min,
      lf.mode,
      lf.max,
    );
    const count = Math.round(flight.seats * loadFactor);
    let j = 0;
    while (j < count) {
      const slot = j;
      const key = (attribute: number, at = slot) =>
        streamFor(seed, [DOMAIN, attribute, flight.index, at]);
      const drawn = pick(partySizes, categorical(key(KEY.party), partyShares)).size;
      const partySize = Math.min(drawn, count - slot);
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
      const strategic =
        segment === 'DEPARTING' && bernoulli(key(KEY.strategic), strategicSpec.share);
      const arrivalEarlinessMin = strategic
        ? uniform(
            key(KEY.strategicArrival),
            strategicSpec.minMinutesBeforeStd,
            strategicSpec.maxMinutesBeforeStd,
          )
        : earlinessMin;
      let serviceMs = 0;
      for (let m = 0; m < partySize; m++) {
        serviceMs += Math.max(
          1,
          Math.round(lognormalFromMeanCv(key(KEY.service, slot + m), serviceMeanMs, serviceCv)),
        );
      }
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
      const path = bernoulli(key(KEY.assisted), assistedShare) ? 'ASSISTED' : 'QUEUE';
      passengers.push({
        index: passengers.length,
        id: `${flight.id}-${String(slot + 1).padStart(3, '0')}`,
        flightIndex: flight.index,
        segment,
        partySize,
        path,
        strategic,
        arrivalMs: flight.stdMs - minutesToMs(arrivalEarlinessMin),
        serviceMs,
        walkMs,
        walkEstimateMs: flight.walkEstimateMs,
        callResponseMs,
        absenceDelayMs,
      });
      j += partySize;
    }
  }

  // The operating day for unplanned outages: from the first arrival to the last departure.
  const dayStartMs = passengers.reduce((min, p) => Math.min(min, p.arrivalMs), Infinity);
  const dayEndMs = flights.reduce((max, f) => Math.max(max, f.stdMs), -Infinity);
  const laneOutages = outagesOf(
    seed,
    scenario.disruptions.laneOutages.value,
    dayStartMs,
    dayEndMs,
    KEY.laneOutageGap,
    KEY.laneOutageLength,
  ).map((o): LaneOutage => ({ ...o, lanes: 1 }));
  const feedOutages = mergeOutages(
    outagesOf(
      seed,
      scenario.disruptions.feedOutages.value,
      dayStartMs,
      dayEndMs,
      KEY.feedOutageGap,
      KEY.feedOutageLength,
    ),
  );

  return {
    checkpoint: {
      laneSchedule: checkpoint.laneSchedule.value.map(({ from, lanes }) => ({
        fromMs: minutesToMs(clockMinutes(from)),
        lanes,
      })),
      serviceRatePerLanePerHour: 3600 / checkpoint.serviceTimeMeanSeconds.value,
      processEstimateMs: serviceMeanMs,
    },
    flights: flights.map((flight) => disrupt(scenario, seed, flight)),
    passengers,
    ...(laneOutages.length > 0 ? { laneOutages } : {}),
    ...(feedOutages.length > 0 ? { feedOutages } : {}),
  };
}

/**
 * Applies the delay and the gate change of one replication to a flight: the ground truth
 * (`boardingCloseMs`, `gateChange`) and the feed messages that tell the system (`updates`).
 * Passengers still arrive for the scheduled departure.
 */
function disrupt(scenario: Scenario, seed: number, flight: ScheduledFlight): SimFlight {
  const { flightDelays, gateChanges } = scenario.disruptions;
  const zones = scenario.schedule.gateZones.value;
  const knowledge = scenario.operations.deadlineKnowledge.value;
  const key = (attribute: number) => streamFor(seed, [DOMAIN, attribute, flight.index]);
  const updates: FlightUpdate[] = [];
  let boardingCloseMs = flight.boardingCloseMs;
  let delayMs = 0;
  const delays = flightDelays.value;
  if (delays.share > 0 && bernoulli(key(KEY.delay), delays.share)) {
    delayMs = minutesToMs(
      Math.min(
        delays.maxMinutes,
        lognormalFromMedian(key(KEY.delayLength), delays.medianMinutes, delays.sigma),
      ),
    );
    if (delayMs > 0) {
      boardingCloseMs += delayMs;
      const noticeMin = uniform(
        key(KEY.delayNotice),
        delays.noticeMinMinutesBeforeStd,
        delays.noticeMaxMinutesBeforeStd,
      );
      if (knowledge !== 'NONE') {
        updates.push({
          atMs: flight.stdMs - minutesToMs(noticeMin),
          knownDeadline: knownDeadlineAt(boardingCloseMs, knowledge),
        });
      }
    }
  }
  let gateChange: GateChange | undefined;
  const changes = gateChanges.value;
  const others = zones.filter((z) => z.id !== flight.gateZone);
  if (changes.share > 0 && others.length > 0 && bernoulli(key(KEY.gateChange), changes.share)) {
    const zone = pick(
      others,
      categorical(
        key(KEY.gateChangeZone),
        others.map((z) => z.share),
      ),
    );
    const atMs =
      flight.stdMs -
      minutesToMs(
        uniform(key(KEY.gateChangeTime), changes.minMinutesBeforeStd, changes.maxMinutesBeforeStd),
      );
    const walkEstimateMs = minutesToMs(zone.walkMinutes);
    gateChange = { atMs, gateZone: zone.id, walkEstimateMs };
    updates.push({
      atMs:
        atMs + minutesToMs(uniform(key(KEY.gateChangeNotice), 0, changes.noticeDelayMaxMinutes)),
      walkEstimateMs,
    });
  }
  updates.sort((a, b) => a.atMs - b.atMs);
  return {
    index: flight.index,
    id: flight.id,
    stdMs: flight.stdMs,
    boardingCloseMs,
    knownDeadline: flight.knownDeadline,
    gateZone: flight.gateZone,
    ...(delayMs > 0 ? { delayMs } : {}),
    ...(gateChange === undefined ? {} : { gateChange }),
    ...(updates.length > 0 ? { updates } : {}),
  };
}

/**
 * Outages as a Poisson process over the operating day, with log-normal durations. The i-th outage
 * draws its gap and its duration from streams of its own.
 */
function outagesOf(
  seed: number,
  spec: { perDay: number; medianMinutes: number; sigma: number; maxMinutes: number },
  dayStartMs: number,
  dayEndMs: number,
  gapKey: number,
  lengthKey: number,
): FeedOutage[] {
  const outages: FeedOutage[] = [];
  if (spec.perDay <= 0 || !(dayEndMs > dayStartMs)) return outages;
  const meanGapMs = (dayEndMs - dayStartMs) / spec.perDay;
  let t = dayStartMs;
  for (let i = 0; ; i++) {
    t += exponential(streamFor(seed, [DOMAIN, gapKey, i]), meanGapMs);
    if (t >= dayEndMs) return outages;
    const length = minutesToMs(
      Math.min(
        spec.maxMinutes,
        lognormalFromMedian(
          streamFor(seed, [DOMAIN, lengthKey, i]),
          spec.medianMinutes,
          spec.sigma,
        ),
      ),
    );
    const fromMs = Math.round(t);
    if (length > 0) outages.push({ fromMs, toMs: fromMs + length });
  }
}

/** Sorted, non-overlapping union of `outages` (which come sorted by start). */
function mergeOutages(outages: readonly FeedOutage[]): FeedOutage[] {
  const merged: FeedOutage[] = [];
  for (const outage of outages) {
    const last = merged[merged.length - 1];
    if (last !== undefined && outage.fromMs <= last.toMs) {
      merged[merged.length - 1] = { fromMs: last.fromMs, toMs: Math.max(last.toMs, outage.toMs) };
    } else {
      merged.push(outage);
    }
  }
  return merged;
}
