import type { KnownDeadline, Millis, RiskClass, Segment } from '@gateflow/domain';
import type { ClassificationParams, ReasonCode } from '@gateflow/priority-engine';

/** A departing flight in a simulated service day. Times are ms since the start of the day. */
export interface SimFlight {
  /** Position of the flight in `Population.flights`. */
  readonly index: number;
  readonly id: string;
  /** Scheduled time of departure. */
  readonly stdMs: Millis;
  /** Ground truth: when boarding actually closes. Outcomes are judged against this. */
  readonly boardingCloseMs: Millis;
  /** What the system knows about the deadline (may differ from the ground truth). */
  readonly knownDeadline: KnownDeadline;
  readonly gateZone: string;
}

/** How a party crosses the checkpoint. */
export type PassengerPath =
  /** Through the queue (physical or virtual) like everybody else. */
  | 'QUEUE'
  /**
   * Assisted passengers (PRM and similar): staff take them to the next free lane, ahead of the
   * queue, under every policy. They never hold a ticket and are never assessed by the engine.
   */
  | 'ASSISTED';

/**
 * A party crossing the checkpoint: one passenger, or a group travelling together (one ticket,
 * one call, screened one after the other on the same lane). Durations are ground truth unless
 * named "estimate".
 */
export interface SimPassenger {
  /** Position of the party in `Population.passengers`. */
  readonly index: number;
  /** Unique; must not contain `#` (reserved for re-issued tickets). */
  readonly id: string;
  readonly flightIndex: number;
  readonly segment: Segment;
  /** People in the party (1 for a single passenger). */
  readonly partySize: number;
  readonly path: PassengerPath;
  /**
   * Ground truth for metrics only: the party arrived late on purpose (to exploit priority). The
   * system never sees it.
   */
  readonly strategic: boolean;
  /** Arrival at the checkpoint, which is also when the ticket is issued (no scan delay). */
  readonly arrivalMs: Millis;
  /** Screening duration of the whole party at the lane. */
  readonly serviceMs: Millis;
  /** Walking time from the checkpoint exit to the gate. */
  readonly walkMs: Millis;
  /** The system's estimate of `walkMs` (e.g. the nominal time of the gate zone). */
  readonly walkEstimateMs: Millis;
  /**
   * Virtual queue only: time from the first call to presenting at the access point, for an
   * attentive passenger who has had time to walk away. A passenger called sooner after taking the
   * ticket is still on the way and answers sooner (see `firstCallDelayMs`). Ignored by the
   * physical queue.
   */
  readonly callResponseMs: Millis;
  /**
   * Virtual queue only: extra delay when the passenger does not notice the first call (0 when they
   * do), once they have walked away. A passenger who presents late may find the ticket recalled, a
   * no-show or expired.
   */
  readonly absenceDelayMs: Millis;
}

/** From `fromMs` on, `lanes` lanes are open. */
export interface LaneScheduleEntry {
  readonly fromMs: Millis;
  readonly lanes: number;
}

export interface CheckpointSpec {
  /**
   * Open lanes over the day, sorted by `fromMs`. The first entry starts at 0 and also applies to
   * any arrival before 0. When lanes close, the highest-numbered ones close first; a closing lane
   * finishes the passenger it is screening.
   */
  readonly laneSchedule: readonly LaneScheduleEntry[];
  /** Nominal screening rate of one lane, for the engine's throughput estimate (passengers/h). */
  readonly serviceRatePerLanePerHour: number;
  /** The engine's estimate of the screening time (P). */
  readonly processEstimateMs: Millis;
}

/** Everything a simulation run needs: the checkpoint, the flights and the passengers. */
export interface Population {
  readonly checkpoint: CheckpointSpec;
  readonly flights: readonly SimFlight[];
  readonly passengers: readonly SimPassenger[];
}

/** What happened to one passenger in one run. */
export interface PassengerOutcome {
  /** First call of the passenger (the start of screening in a physical queue). */
  readonly firstCalledAtMs: Millis;
  readonly serviceStartMs: Millis;
  readonly serviceEndMs: Millis;
  readonly gateArrivalMs: Millis;
  /** From arrival at the checkpoint to the start of screening. */
  readonly waitMs: Millis;
  /** From arrival to the first call (in a virtual queue, the time free to wait anywhere). */
  readonly callWaitMs: Millis;
  /**
   * Time spent standing in a queue: the whole wait in a physical queue; in a virtual queue, the
   * wait at the lanes after validating the ticket at the access point.
   */
  readonly standingMs: Millis;
  /** True when the passenger reached the gate after boarding closed (ground truth). */
  readonly missed: boolean;
  /** True when any commitment of the passenger's tickets jumped the FIFO order. */
  readonly priorityCall: boolean;
  /**
   * Most people who overtook one of the passenger's tickets (the bound K applies per ticket): in
   * the call order, in the prepare window and, through the fast track, at the lanes.
   */
  readonly overtakenCount: number;
  /** Reasons of the latest commitment of the ticket that was admitted. */
  readonly selectionReasons: readonly ReasonCode[];
  /**
   * Risk class when the first ticket was issued (same classification for every policy).
   * `UNVERIFIED` for assisted passengers, who are not assessed.
   */
  readonly classAtArrival: RiskClass;
  readonly laneIndex: number;
  /** Calls received (second calls excluded). */
  readonly calls: number;
  readonly noShows: number;
  readonly reactivations: number;
  /** Tickets issued again because the previous one expired. */
  readonly reissuedTickets: number;
}

export interface RunStats {
  /** Calls made (second calls excluded). */
  readonly calls: number;
  /** Commitments: decisions of the engine on who is called next. */
  readonly commitments: number;
  /** Commitments that jumped the FIFO order because of urgency. */
  readonly priorityCalls: number;
  /** Commitments made while boost-eligible URGENT tickets existed but the cap was full. */
  readonly capReachedCalls: number;
  readonly overtakeGuardCalls: number;
  readonly recalls: number;
  readonly noShows: number;
  readonly reactivations: number;
  /** People who entered the lanes through the fast track (ADR-027). */
  readonly fastTrackPeople: number;
  /** People waiting at the lanes who were passed by a fast-tracked party, counted once per pass. */
  readonly lanePassedPeople: number;
  readonly reissuedTickets: number;
  readonly firstArrivalMs: Millis;
  readonly lastServiceEndMs: Millis;
  /** Total screening time over all lanes. */
  readonly busyMs: Millis;
  /** Lane time staffed (open, or closing but still screening) between first arrival and last service end. */
  readonly staffedLaneMs: number;
  /**
   * Lane time open and idle that passengers waiting for or answering a call could have used:
   * the integral of min(idle open lanes, people not yet called + called people on their way).
   */
  readonly idleLaneWithDemandMs: number;
  /** Integral of the number of people waiting for their call over time (person-milliseconds). */
  readonly waitingAreaMs: number;
  /** Largest number of people waiting for their call. */
  readonly maxWaiting: number;
  /** Integral of the number of people standing in a queue over time (person-milliseconds). */
  readonly standingAreaMs: number;
  readonly maxStanding: number;
}

export interface RunResult {
  readonly policyId: string;
  /** One outcome per passenger, aligned with `Population.passengers`. */
  readonly outcomes: readonly PassengerOutcome[];
  readonly stats: RunStats;
}

export interface SimulationOptions {
  /**
   * Parameters used to classify each ticket on arrival (`classAtArrival`). Using the same values
   * for every policy keeps cohorts comparable across policies.
   */
  readonly classification: ClassificationParams;
}
