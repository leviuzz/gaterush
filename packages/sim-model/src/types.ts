import type { KnownDeadline, Millis, RiskClass, Segment } from '@gateflow/domain';
import type { ClassificationParams, ReasonCode } from '@gateflow/priority-engine';
import type {
  FlightKnowledge,
  PresentOutcome,
  QueueEvent,
  TicketInput,
} from '@gateflow/queue-core';

/** A departing flight in a simulated service day. Times are ms since the start of the day. */
export interface SimFlight {
  /** Position of the flight in `Population.flights`. */
  readonly index: number;
  readonly id: string;
  /** Scheduled time of departure. */
  readonly stdMs: Millis;
  /** Ground truth: when boarding actually closes. Outcomes are judged against this. */
  readonly boardingCloseMs: Millis;
  /**
   * What the system knows about the deadline at the start of the day (may differ from the ground
   * truth). Later knowledge arrives through `updates`.
   */
  readonly knownDeadline: KnownDeadline;
  readonly gateZone: string;
  /** How much the flight is delayed (ground truth, already included in `boardingCloseMs`). */
  readonly delayMs?: Millis;
  /** Gate change (ground truth): from `atMs` the flight boards at another gate. */
  readonly gateChange?: GateChange;
  /** Knowledge the flight feed sends during the day, in time order. */
  readonly updates?: readonly FlightUpdate[];
}

/** A gate change of a flight (ground truth). */
export interface GateChange {
  /** From this instant, passengers who finish screening walk to the new gate. */
  readonly atMs: Millis;
  readonly gateZone: string;
  /**
   * Nominal walking time to the new gate. A passenger's walk scales with it: walk x (new nominal /
   * the passenger's nominal walking time).
   */
  readonly walkEstimateMs: Millis;
}

/** A message of the flight feed: new knowledge about one flight. */
export interface FlightUpdate {
  /**
   * When the feed sends it. During a feed outage it reaches the system only when the feed
   * recovers.
   */
  readonly atMs: Millis;
  /** New known deadline (e.g. a delay is announced). */
  readonly knownDeadline?: KnownDeadline;
  /** New nominal walking time to the gate (e.g. a gate change is announced). */
  readonly walkEstimateMs?: Millis;
}

/** An unplanned outage of lanes (the system sees it at once). */
export interface LaneOutage {
  readonly fromMs: Millis;
  readonly toMs: Millis;
  /** Lanes out of service. At least one planned lane always stays open. */
  readonly lanes: number;
}

/** A period during which the flight feed sends nothing. */
export interface FeedOutage {
  readonly fromMs: Millis;
  readonly toMs: Millis;
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

/**
 * The lanes and staff a checkpoint has beyond its plan (S8), and how staff respond during one
 * day. Policies that manage lanes use it; the others ignore it.
 */
export interface LaneStaffing {
  /** Lanes the checkpoint physically has: open lanes never exceed them. */
  readonly lanesAvailable: number;
  /** Extra lanes beyond the plan that can be staffed at the same time (staff on call). */
  readonly maxExtraLanes: number;
  /** The system's estimate of the time from a decision to the extra lane screening. */
  readonly openDelayEstimateMs: Millis;
  /** An extra lane stays open at least this long once it opened. */
  readonly minOpenMs: Millis;
  /**
   * Ground truth of the day: time to staff and open a lane after the n-th decision to open
   * (used in turn; a policy that decides more often starts again from the first).
   */
  readonly openDelaysMs: readonly Millis[];
  /**
   * Ground truth of the day: whether the duty manager follows GateFlow's n-th recommendation
   * (used in turn). A supervisor's own decisions are always carried out.
   */
  readonly follows: readonly boolean[];
}

/** People the system expects to arrive in each minute of the day (S8 forecast). */
export interface ArrivalForecast {
  /** Start of the first minute of `peoplePerMinute` (may be before midnight). */
  readonly startMs: Millis;
  readonly peoplePerMinute: readonly number[];
}

/** Everything a simulation run needs: the checkpoint, the flights and the passengers. */
export interface Population {
  readonly checkpoint: CheckpointSpec;
  readonly flights: readonly SimFlight[];
  readonly passengers: readonly SimPassenger[];
  /** Unplanned lane outages of the day (none when absent). */
  readonly laneOutages?: readonly LaneOutage[];
  /** Outages of the flight feed (none when absent), sorted and not overlapping. */
  readonly feedOutages?: readonly FeedOutage[];
  /** Lanes and staff beyond the plan (S8). Without it no extra lane can be opened. */
  readonly staffing?: LaneStaffing;
  /** Arrival forecast for GateFlow's lane recommendations (S8). */
  readonly forecast?: ArrivalForecast;
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
  /**
   * Changes of risk class of the passenger's tickets while they waited, under the policy's own
   * classification (0 for policies that do not classify, and for assisted passengers).
   */
  readonly classChanges: number;
  /** Changes of class opposite in direction to the previous change (flapping). */
  readonly classReversals: number;
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
  /** Changes of risk class of waiting tickets (stability, S5). */
  readonly classChanges: number;
  /** Class changes that reverse the ticket's previous change (flapping). */
  readonly classReversals: number;
  /**
   * People on priority commitments made while the system's knowledge of their flight differed
   * from the ground truth (a delay or a gate change not yet known).
   */
  readonly misinformedPriorityPeople: number;
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
  /**
   * Extra lane time beyond the plan (S8), between the first arrival and the last service end:
   * the integral of the lanes open above what the plan and the outages give.
   */
  readonly extraLaneMs: number;
  /** Decisions to open or close an extra lane: the supervisor's, or GateFlow's recommendations. */
  readonly laneDecisions: number;
  /** Recommendations the duty manager followed (every decision of a supervisor counts). */
  readonly laneDecisionsFollowed: number;
  readonly lanesOpened: number;
  readonly lanesClosed: number;
  /** Most lanes open at the same time. */
  readonly maxOpenLanes: number;
}

export interface RunResult {
  readonly policyId: string;
  /** One outcome per passenger, aligned with `Population.passengers`. */
  readonly outcomes: readonly PassengerOutcome[];
  readonly stats: RunStats;
}

/**
 * What happens during a simulated day, in the order the simulator processes it (S11). Together
 * the events tell the whole day: who arrived, every decision of the queue with what it was based
 * on, every screening, the lanes and what the system knew of the flights. Parties and flights are
 * indexes into `Population.passengers` and `Population.flights`; lanes are numbered from 0.
 */
export type DayEvent =
  /** A party reached the checkpoint (a queue party takes its ticket at once). */
  | { readonly type: 'ARRIVED'; readonly atMs: Millis; readonly party: number }
  /** An event of the queue, attributed to the party that holds the ticket. */
  | {
      readonly type: 'QUEUE';
      readonly atMs: Millis;
      readonly party: number;
      readonly event: QueueEvent;
    }
  | {
      readonly type: 'SCREENING_STARTED';
      readonly atMs: Millis;
      readonly party: number;
      readonly lane: number;
    }
  | {
      readonly type: 'SCREENING_ENDED';
      readonly atMs: Millis;
      readonly party: number;
      readonly lane: number;
    }
  /**
   * The lanes open changed (and once at the start of the day): `open` lanes 0 to open - 1, of
   * which `extra` beyond the plan; `planned` by the lane plan, `outOfService` by outages.
   */
  | {
      readonly type: 'LANES';
      readonly atMs: Millis;
      readonly open: number;
      readonly planned: number;
      readonly outOfService: number;
      readonly extra: number;
    }
  /**
   * A decision on an extra lane (S8): today's supervisor (always carried out) or a GateFlow
   * recommendation, which the duty manager follows or not. `waitMs` is what motivated it: the
   * wait the queue showed the supervisor, or the longest wait GateFlow projected (with the lanes
   * open for a decision to open, with one lane fewer for a decision to close).
   */
  | {
      readonly type: 'LANE_DECISION';
      readonly atMs: Millis;
      readonly by: 'SUPERVISOR' | 'GATEFLOW';
      readonly action: 'OPEN' | 'CLOSE';
      readonly lanes: number;
      readonly followed: boolean;
      readonly waitMs: Millis;
    }
  /** The flight feed went down: what is known stays, and grows old. */
  | { readonly type: 'FEED_DOWN'; readonly atMs: Millis }
  /** The flight feed recovered. */
  | { readonly type: 'FEED_UP'; readonly atMs: Millis }
  /** The queue was told new knowledge of a flight (from the feed, or as it went down or up). */
  | {
      readonly type: 'FLIGHT_KNOWN';
      readonly atMs: Millis;
      readonly flight: number;
      readonly deadlineMs: Millis | null;
      readonly walkEstimateMs: Millis | null;
    };

/**
 * An operation of the simulator on its queue (S18), in the order it was made: the tape that the
 * digital twin plays to the live system. Times are those of the run (ms since the start of the
 * day); a ticket and a flight are named by their ids. The result an operation got (the ticket
 * called, the outcome of a presentation) is what the live system must answer.
 */
export type TapeEntry =
  /** A party takes a ticket: on arrival, or again after its ticket expired. */
  | {
      readonly type: 'ISSUE';
      readonly atMs: Millis;
      readonly party: number;
      readonly input: TicketInput;
    }
  /** The queue is told what is now known of a flight (the feed, or the feed going down or up). */
  | {
      readonly type: 'UPDATE_FLIGHT';
      readonly atMs: Millis;
      readonly flightId: string;
      readonly knowledge: FlightKnowledge;
    }
  /**
   * The lanes open changed, and the engine's estimates with them; once at the start of the day
   * too, with the lanes open then.
   */
  | { readonly type: 'LANES'; readonly atMs: Millis; readonly lanes: number }
  /** Staff call the next ticket: the one the queue called, or null when it called none. */
  | { readonly type: 'CALL_NEXT'; readonly atMs: Millis; readonly ticketId: string | null }
  /** A passenger presents at the access point, with the outcome. */
  | {
      readonly type: 'PRESENT';
      readonly atMs: Millis;
      readonly ticketId: string;
      readonly outcome: PresentOutcome;
    }
  /** The timeouts due are applied (second calls, no-shows, expiries). */
  | { readonly type: 'ADVANCE'; readonly atMs: Millis };

export interface SimulationOptions {
  /**
   * Parameters used to classify each ticket on arrival (`classAtArrival`). Using the same values
   * for every policy keeps cohorts comparable across policies.
   */
  readonly classification: ClassificationParams;
  /** Observer of the queue's events, for tests and diagnostics (it must not change the run). */
  readonly listener?: (event: QueueEvent) => void;
  /** Observer of the whole day (S11): it receives every `DayEvent` and must not change the run. */
  readonly observer?: (event: DayEvent) => void;
  /**
   * Recorder of the tape (S18): it receives every operation on the queue, in order, with its
   * result, and must not change the run.
   */
  readonly recorder?: (entry: TapeEntry) => void;
}
