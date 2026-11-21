import type { KnownDeadline, Millis, RiskClass, Segment } from '@gateflow/domain';
import type {
  CheckpointEstimates,
  ClassificationParams,
  ReasonCode,
} from '@gateflow/priority-engine';

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

/** A passenger crossing the checkpoint. Durations are ground truth unless named "estimate". */
export interface SimPassenger {
  /** Position of the passenger in `Population.passengers`. */
  readonly index: number;
  readonly id: string;
  readonly flightIndex: number;
  readonly segment: Segment;
  /** Arrival at the checkpoint, which is also when the ticket is issued (no scan delay). */
  readonly arrivalMs: Millis;
  /** Screening duration at the lane. */
  readonly serviceMs: Millis;
  /** Walking time from the checkpoint exit to the gate. */
  readonly walkMs: Millis;
  /** The system's estimate of `walkMs` (e.g. the nominal time of the gate zone). */
  readonly walkEstimateMs: Millis;
}

export interface CheckpointSpec {
  /** Number of lanes, all open for the whole day (lane schedules arrive in a later slice). */
  readonly lanes: number;
  /** Estimates given to the priority engine. */
  readonly estimates: CheckpointEstimates;
}

/** Everything a simulation run needs: the checkpoint, the flights and the passengers. */
export interface Population {
  readonly checkpoint: CheckpointSpec;
  readonly flights: readonly SimFlight[];
  readonly passengers: readonly SimPassenger[];
}

/** What happened to one passenger in one run. */
export interface PassengerOutcome {
  readonly calledAtMs: Millis;
  readonly serviceEndMs: Millis;
  readonly gateArrivalMs: Millis;
  /** Time between ticket issue and call. */
  readonly waitMs: Millis;
  /** True when the passenger reached the gate after boarding closed (ground truth). */
  readonly missed: boolean;
  /** True when the call jumped the FIFO order because of urgency. */
  readonly priorityCall: boolean;
  /** How many times the passenger was overtaken while waiting. */
  readonly overtakenCount: number;
  readonly selectionReasons: readonly ReasonCode[];
  /** Risk class when the ticket was issued (same classification parameters for every policy). */
  readonly classAtArrival: RiskClass;
  readonly laneIndex: number;
}

export interface RunStats {
  readonly calls: number;
  readonly priorityCalls: number;
  /** Calls made while at least one boost-eligible URGENT ticket existed but the cap was full. */
  readonly capReachedCalls: number;
  readonly overtakeGuardCalls: number;
  readonly firstArrivalMs: Millis;
  readonly lastServiceEndMs: Millis;
  /** Total screening time over all lanes. */
  readonly busyMs: Millis;
  /** Integral of the number of waiting tickets over time (person-milliseconds). */
  readonly waitingAreaMs: number;
  readonly maxWaiting: number;
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
