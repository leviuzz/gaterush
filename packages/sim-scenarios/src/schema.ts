import { z } from 'zod';

/** Where a parameter value comes from. Shown next to every number in reports. */
export const SOURCE_LABELS = ['SYNTHETIC', 'LITERATURE', 'AIRPORT_PROVIDED', 'MEASURED'] as const;
export type SourceLabel = (typeof SOURCE_LABELS)[number];

const SourceSchema = z.enum(SOURCE_LABELS);

const ID = /^[a-z0-9][a-z0-9-]*$/;
const ID_MESSAGE = 'lowercase letters, digits and dashes';

/**
 * Every model parameter is wrapped with its provenance, so that no number can enter a report
 * without saying whether it is synthetic, from the literature, provided by an airport or measured.
 * `ref` names the entry of `dataSources` the value comes from, when there is one.
 */
function param<T extends z.ZodType>(value: T) {
  return z.strictObject({
    value,
    source: SourceSchema,
    ref: z.string().regex(ID, ID_MESSAGE).optional(),
    note: z.string().min(1).optional(),
  });
}

/**
 * Where the data of a scenario comes from, with its licence or terms of use. Every scenario lists
 * at least one source, so that every report can say what its numbers rest on and under which
 * terms they may be used.
 */
export const DataSourceSchema = z.strictObject({
  id: z.string().regex(ID, ID_MESSAGE),
  title: z.string().min(1),
  /** Nature of the data, with the same labels as parameters. */
  kind: SourceSchema,
  /** Who publishes or provides the data. */
  provider: z.string().min(1),
  /** Licence or terms of use, including any restriction such as "non-commercial use only". */
  licence: z.string().min(1),
  url: z
    .string()
    .regex(/^https:\/\/\S+$/, 'expected an https URL')
    .optional(),
  /** Day the data was retrieved or received, YYYY-MM-DD. */
  retrieved: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/, 'expected a date YYYY-MM-DD')
    .optional(),
  note: z.string().min(1).optional(),
});
export type DataSource = z.infer<typeof DataSourceSchema>;

const ShowUpSchema = z
  .strictObject({
    /** No passenger arrives later than this many minutes before the scheduled departure. */
    minMinutesBeforeStd: z.number().min(0).max(600),
    /** Median of the log-normal part added to the minimum. */
    medianExtraMinutes: z.number().positive().max(600),
    /** Standard deviation of the underlying normal of the log-normal part. */
    sigma: z.number().min(0).max(3),
    /** Earliness is capped at this many minutes before the scheduled departure. */
    maxMinutesBeforeStd: z.number().positive().max(1440),
  })
  .refine((s) => s.maxMinutesBeforeStd > s.minMinutesBeforeStd, {
    message: 'maxMinutesBeforeStd must be greater than minMinutesBeforeStd',
  });

const HourlySchema = z
  .array(
    z.strictObject({
      hour: z.number().int().min(0).max(23),
      departures: z.number().int().min(0).max(120),
    }),
  )
  .min(1)
  .refine((rows) => new Set(rows.map((r) => r.hour)).size === rows.length, {
    message: 'each hour may appear only once',
  });

const AircraftMixSchema = z
  .array(
    z.strictObject({
      category: z.string().min(1),
      seats: z.number().int().min(1).max(1000),
      share: z.number().positive(),
    }),
  )
  .min(1);

const GateZonesSchema = z
  .array(
    z.strictObject({
      id: z.string().min(1),
      walkMinutes: z.number().min(0).max(60),
      share: z.number().positive(),
    }),
  )
  .min(1)
  .refine((zones) => new Set(zones.map((z) => z.id)).size === zones.length, {
    message: 'gate zone ids must be unique',
  });

const CLOCK = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** Minutes since midnight of a `HH:MM` clock time (validated by the schema). */
export function clockMinutes(clock: string): number {
  const match = CLOCK.exec(clock);
  if (match === null) throw new RangeError(`not a HH:MM clock time: ${clock}`);
  return Number(match[1]) * 60 + Number(match[2]);
}

const LaneScheduleSchema = z
  .array(
    z.strictObject({
      /** Local clock time from which `lanes` lanes are open, `HH:MM`. */
      from: z.string().regex(CLOCK, 'expected a clock time HH:MM between 00:00 and 23:59'),
      lanes: z.number().int().min(1).max(64),
    }),
  )
  .min(1)
  .superRefine((rows, ctx) => {
    if (rows[0]?.from !== '00:00') {
      ctx.addIssue({
        code: 'custom',
        path: [0, 'from'],
        message: 'the first entry must start at 00:00',
      });
    }
    for (let i = 1; i < rows.length; i++) {
      const previous = rows[i - 1];
      const row = rows[i];
      if (
        previous === undefined ||
        row === undefined ||
        !CLOCK.test(row.from) ||
        !CLOCK.test(previous.from)
      )
        continue;
      if (clockMinutes(row.from) <= clockMinutes(previous.from)) {
        ctx.addIssue({
          code: 'custom',
          path: [i, 'from'],
          message: 'entries must be in strictly increasing time order',
        });
      }
    }
  });

/**
 * How lanes are planned when the scenario gives no explicit schedule: in every interval of the
 * day, enough lanes to screen the expected arrivals of that interval at the given utilisation,
 * between `minLanes` and the lanes the checkpoint has. The expected arrivals are the average of
 * simulated days 1 to `planningDays`.
 */
const LanePlanRuleSchema = z.strictObject({
  utilisation: z.number().min(0.3).max(1.5),
  intervalMinutes: z.union([z.literal(15), z.literal(30), z.literal(60), z.literal(120)]),
  minLanes: z.number().int().min(1).max(64),
  /**
   * Most lanes the roster plans (default: every lane the checkpoint has). Lanes above it can only
   * be opened as extra lanes during the day (`laneStaffing`).
   */
  maxLanes: z.number().int().min(1).max(64).optional(),
  planningDays: z.number().int().min(10).max(1000),
});
export type LanePlanRule = z.infer<typeof LanePlanRuleSchema>;

/**
 * Extra lanes beyond the plan (S8) and the people who decide them: how many extra lanes the staff
 * on call can open at the same time, how long a lane takes to screen after the decision
 * (log-normal), how long it then stays open at least, and the share of GateFlow's recommendations
 * the duty manager follows. Without it no lane opens beyond the plan.
 */
const LaneStaffingSchema = z.strictObject({
  maxExtraLanes: z.number().int().min(0).max(16),
  openDelayMinutes: z.strictObject({
    median: z.number().positive().max(120),
    sigma: z.number().min(0).max(2),
  }),
  minOpenMinutes: z.number().min(0).max(480),
  followShare: z.number().min(0).max(1),
});
export type LaneStaffingSpec = z.infer<typeof LaneStaffingSchema>;

/**
 * GateFlow settings approved for this checkpoint. They replace the parameters of the policy
 * presets when this scenario is simulated: the fairness bounds, hysteresis and maximum data age of
 * every priority policy, and the call-ahead, response estimate and prepare window of every
 * virtual queue. Absent settings keep the preset values.
 */
const GateflowSettingsSchema = z
  .strictObject({
    maxOvertakes: z.number().int().min(0).max(1000).optional(),
    capMaxPriorityCalls: z.number().int().min(0).max(1000).optional(),
    capWindowCalls: z.number().int().min(1).max(1000).optional(),
    hysteresisMinutes: z.number().min(0).max(60).optional(),
    /** `null`: no maximum data age. */
    maxDeadlineAgeMinutes: z.number().min(0).max(1440).nullable().optional(),
    prepareWindowSize: z.number().int().min(0).max(1000).optional(),
    callAheadSeconds: z.number().min(0).max(3600).optional(),
    responseEstimateSeconds: z.number().min(0).max(3600).optional(),
    /** Lane recommendations (S8): the wait GateFlow keeps below, over how far ahead it looks. */
    laneTargetWaitMinutes: z.number().positive().max(120).optional(),
    laneHorizonMinutes: z.number().min(1).max(240).optional(),
  })
  .refine(
    (s) =>
      s.capMaxPriorityCalls === undefined ||
      s.capWindowCalls === undefined ||
      s.capMaxPriorityCalls <= s.capWindowCalls,
    { message: 'capMaxPriorityCalls must not exceed capWindowCalls' },
  );
export type GateflowSettings = z.infer<typeof GateflowSettingsSchema>;

/**
 * Today's practice at this checkpoint, as modelled by baseline A' (`fifo-manual`): staff
 * announce, every `announcementIntervalMinutes`, the flights whose boarding closes within
 * `callWindowMinutes`. With lane management (S8, `@reactive`), the supervisor opens an extra lane
 * when the queue shows a wait above `laneOpenWaitMinutes` and closes one below
 * `laneCloseWaitMinutes`.
 */
const TodayPracticeSchema = z
  .strictObject({
    callWindowMinutes: z.number().positive().max(180),
    announcementIntervalMinutes: z.number().positive().max(60),
    laneOpenWaitMinutes: z.number().positive().max(120).optional(),
    laneCloseWaitMinutes: z.number().min(0).max(120).optional(),
  })
  .refine(
    (p) =>
      p.laneOpenWaitMinutes === undefined ||
      p.laneCloseWaitMinutes === undefined ||
      p.laneCloseWaitMinutes < p.laneOpenWaitMinutes,
    { message: 'laneCloseWaitMinutes must be below laneOpenWaitMinutes' },
  );
export type TodayPractice = z.infer<typeof TodayPracticeSchema>;

/**
 * Fairness target of the checkpoint: at most this share of the passengers not prioritised may
 * wait more than 5 minutes longer than with the same queue in FIFO order (ADR-025: 0.1%).
 */
const FairnessTargetSchema = z.strictObject({
  maxShareDelayedOver5Min: z.number().min(0).max(1),
});
export type FairnessTarget = z.infer<typeof FairnessTargetSchema>;

const CallResponseSchema = z.strictObject({
  /** Median time from a call to presenting at the access point, for an attentive passenger. */
  medianSeconds: z.number().min(0).max(1800),
  /** Standard deviation of the underlying normal of the log-normal response time. */
  sigma: z.number().min(0).max(3),
  /** Probability that a passenger does not notice the first call. */
  absentProbability: z.number().min(0).max(1),
  /** Median of the extra delay of a passenger who did not notice the first call. */
  absentExtraMedianMinutes: z.number().positive().max(240),
  absentExtraSigma: z.number().min(0).max(3),
});

const GroupsSchema = z.strictObject({
  /**
   * Distribution of party sizes: a party of `size` people travels together, holds one ticket and
   * is screened on one lane. Shares are relative weights over parties.
   */
  partySizes: z
    .array(z.strictObject({ size: z.number().int().min(1).max(10), share: z.number().positive() }))
    .min(1)
    .refine((rows) => new Set(rows.map((r) => r.size)).size === rows.length, {
      message: 'each party size may appear only once',
    }),
});

const StrategicSchema = z
  .strictObject({
    /** Share of departing parties who arrive late on purpose, hoping to be prioritised. */
    share: z.number().min(0).max(1),
    /** They arrive uniformly between these many minutes before the scheduled departure. */
    minMinutesBeforeStd: z.number().min(0).max(600),
    maxMinutesBeforeStd: z.number().min(0).max(600),
  })
  .refine((s) => s.maxMinutesBeforeStd >= s.minMinutesBeforeStd, {
    message: 'maxMinutesBeforeStd must not be smaller than minMinutesBeforeStd',
  });

const DelaysSchema = z
  .strictObject({
    /** Share of flights that are delayed. */
    share: z.number().min(0).max(1),
    /** Log-normal delay: median and sigma, capped at the maximum. */
    medianMinutes: z.number().min(0).max(600),
    sigma: z.number().min(0).max(3),
    maxMinutes: z.number().min(0).max(720),
    /** The delay is announced uniformly between these many minutes before the scheduled departure. */
    noticeMinMinutesBeforeStd: z.number().min(0).max(600),
    noticeMaxMinutesBeforeStd: z.number().min(0).max(600),
  })
  .refine((d) => d.noticeMaxMinutesBeforeStd >= d.noticeMinMinutesBeforeStd, {
    message: 'noticeMaxMinutesBeforeStd must not be smaller than noticeMinMinutesBeforeStd',
  });

const GateChangesSchema = z
  .strictObject({
    /** Share of flights whose gate changes. */
    share: z.number().min(0).max(1),
    /** The change happens uniformly between these many minutes before the scheduled departure. */
    minMinutesBeforeStd: z.number().min(0).max(600),
    maxMinutesBeforeStd: z.number().min(0).max(600),
    /** The feed reports it uniformly between 0 and this many minutes later. */
    noticeDelayMaxMinutes: z.number().min(0).max(120),
  })
  .refine((g) => g.maxMinutesBeforeStd >= g.minMinutesBeforeStd, {
    message: 'maxMinutesBeforeStd must not be smaller than minMinutesBeforeStd',
  });

const OutagesSchema = z.strictObject({
  /** Mean number of outages per day (Poisson process over the operating day). */
  perDay: z.number().min(0).max(50),
  /** Log-normal duration: median and sigma, capped at the maximum. */
  medianMinutes: z.number().min(0).max(600),
  sigma: z.number().min(0).max(3),
  maxMinutes: z.number().min(0).max(1440),
});

const SyntheticHourlyScheduleSchema = z.strictObject({
  kind: z.literal('synthetic-hourly'),
  /** Seed of the schedule generator: the design day is the same for every replication. */
  generatorSeed: z.number().int().min(0).max(0xffffffff),
  departuresPerHour: param(HourlySchema),
  aircraftMix: param(AircraftMixSchema),
  gateZones: param(GateZonesSchema),
});

/**
 * One departure of a flight list (format `gateflow.flights/1`). Only the flight and its scheduled
 * departure are required. The number of passengers is `passengers` when given; otherwise it is
 * drawn as seats x load factor, with the seats of the row or of the aircraft type.
 */
export const FlightRowSchema = z.strictObject({
  /** Identifier of the flight, unique in the list (e.g. a flight number). */
  flight: z.string().min(1).max(32).regex(/^\S+$/, 'flight identifiers must not contain spaces'),
  /** Scheduled departure, local time of the service day, HH:MM. */
  std: z.string().regex(CLOCK, 'expected a clock time HH:MM between 00:00 and 23:59'),
  /** Aircraft type, ideally the ICAO type designator (e.g. A320, B738). */
  aircraft: z.string().min(1).max(40).optional(),
  seats: z.number().int().min(1).max(1000).optional(),
  /** Expected passengers through the checkpoint, when the airport knows them. */
  passengers: z.number().int().min(0).max(1000).optional(),
  /** Gate zone of the departure; drawn from the zone shares when absent. */
  gateZone: z.string().min(1).optional(),
  /** Destination (informative). */
  destination: z.string().min(1).max(64).optional(),
});
export type FlightRow = z.infer<typeof FlightRowSchema>;

const SeatsSchema = z
  .array(
    z.strictObject({
      aircraft: z.string().min(1).max(40),
      seats: z.number().int().min(1).max(1000),
    }),
  )
  .min(1)
  .refine((rows) => new Set(rows.map((r) => r.aircraft)).size === rows.length, {
    message: 'each aircraft type may appear only once',
  });

const FlightListScheduleSchema = z.strictObject({
  kind: z.literal('flight-list'),
  /** Seed of the draws that complete the list (gate zones not given): fixed for the design day. */
  generatorSeed: z.number().int().min(0).max(0xffffffff),
  flights: z.strictObject({
    /** The entry of `dataSources` the flight list comes from. */
    source: z.string().regex(ID, ID_MESSAGE),
    /** CSV file the rows were read from, relative to the scenario file (informative once read). */
    file: z.string().min(1).optional(),
    /** SHA-256 of the CSV file as read. */
    sha256: z
      .string()
      .regex(/^[0-9a-f]{64}$/, 'expected a hexadecimal SHA-256')
      .optional(),
    rows: z.array(FlightRowSchema).min(1).max(5000),
  }),
  /** Seats by aircraft type, for rows without seats or passengers. */
  seats: param(SeatsSchema).optional(),
  gateZones: param(GateZonesSchema),
});

/** The part of a refinement context used by the checks below. */
interface IssueSink {
  addIssue(issue: { code: 'custom'; path: (string | number)[]; message: string }): void;
}

/** Data source ids are unique, and every reference names one of them. */
function checkDataSources(
  scenario: {
    readonly dataSources: readonly { readonly id: string }[];
    readonly schedule: { readonly kind: string };
  },
  ctx: IssueSink,
): void {
  const ids = new Set<string>();
  scenario.dataSources.forEach((source, i) => {
    if (ids.has(source.id)) {
      ctx.addIssue({
        code: 'custom',
        path: ['dataSources', i, 'id'],
        message: `duplicate data source id "${source.id}"`,
      });
    }
    ids.add(source.id);
  });
  const known = [...ids].join(', ');
  const visit = (node: unknown, path: (string | number)[]): void => {
    if (typeof node !== 'object' || node === null) return;
    if (Array.isArray(node)) {
      node.forEach((child: unknown, i) => {
        visit(child, [...path, i]);
      });
      return;
    }
    const record = node as Record<string, unknown>;
    const isParam =
      'value' in record &&
      typeof record.source === 'string' &&
      (SOURCE_LABELS as readonly string[]).includes(record.source);
    if (isParam) {
      if (typeof record.ref === 'string' && !ids.has(record.ref)) {
        ctx.addIssue({
          code: 'custom',
          path: [...path, 'ref'],
          message: `unknown data source "${record.ref}" (known: ${known})`,
        });
      }
      return;
    }
    for (const [key, child] of Object.entries(record)) {
      if (key !== 'dataSources') visit(child, [...path, key]);
    }
  };
  visit(scenario, []);
  const schedule = scenario.schedule as { kind: string; flights?: { source?: unknown } };
  const source = schedule.flights?.source;
  if (schedule.kind === 'flight-list' && typeof source === 'string' && !ids.has(source)) {
    ctx.addIssue({
      code: 'custom',
      path: ['schedule', 'flights', 'source'],
      message: `unknown data source "${source}" (known: ${known})`,
    });
  }
}

/**
 * A flight list must be usable as it is: unique flights, known gate zones, and for every flight
 * a number of passengers, or seats from the row or from the aircraft type.
 */
function checkFlightList(schedule: z.infer<typeof FlightListScheduleSchema>, ctx: IssueSink): void {
  const zones = new Set(schedule.gateZones.value.map((z) => z.id));
  const seatsByType = new Map((schedule.seats?.value ?? []).map((s) => [s.aircraft, s.seats]));
  const seen = new Set<string>();
  schedule.flights.rows.forEach((row, i) => {
    const path = (...rest: string[]) => ['schedule', 'flights', 'rows', i, ...rest];
    if (seen.has(row.flight)) {
      ctx.addIssue({
        code: 'custom',
        path: path('flight'),
        message: `duplicate flight ${row.flight}`,
      });
    }
    seen.add(row.flight);
    if (row.gateZone !== undefined && !zones.has(row.gateZone)) {
      ctx.addIssue({
        code: 'custom',
        path: path('gateZone'),
        message: `flight ${row.flight}: unknown gate zone "${row.gateZone}" (known: ${[...zones].join(', ')})`,
      });
    }
    const seats =
      row.seats ?? (row.aircraft === undefined ? undefined : seatsByType.get(row.aircraft));
    if (row.passengers === undefined && seats === undefined) {
      ctx.addIssue({
        code: 'custom',
        path: path(),
        message:
          row.aircraft === undefined
            ? `flight ${row.flight}: give passengers, seats or an aircraft type`
            : `flight ${row.flight}: no seats for aircraft type "${row.aircraft}" (give seats in the file or add the type to schedule.seats)`,
      });
    }
    if (row.passengers !== undefined && seats !== undefined && row.passengers > seats) {
      ctx.addIssue({
        code: 'custom',
        path: path('passengers'),
        message: `flight ${row.flight}: ${row.passengers} passengers exceed the ${seats} seats`,
      });
    }
  });
}

/**
 * A checkpoint needs a lane schedule or a rule to plan one (with the lanes it has), and never
 * plans more lanes than it has.
 */
function checkLanes(
  checkpoint: {
    readonly lanesAvailable?: { readonly value: number } | undefined;
    readonly laneSchedule?: { readonly value: readonly { readonly lanes: number }[] } | undefined;
    readonly lanePlanRule?:
      | { readonly value: { readonly minLanes: number; readonly maxLanes?: number | undefined } }
      | undefined;
    readonly laneStaffing?: unknown;
  },
  ctx: IssueSink,
): void {
  const available = checkpoint.lanesAvailable?.value;
  if (checkpoint.laneSchedule === undefined && checkpoint.lanePlanRule === undefined) {
    ctx.addIssue({
      code: 'custom',
      path: ['checkpoint', 'laneSchedule'],
      message: 'give checkpoint.laneSchedule, or checkpoint.lanePlanRule to plan it',
    });
  }
  for (const field of ['lanePlanRule', 'laneStaffing'] as const) {
    if (checkpoint[field] !== undefined && available === undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['checkpoint', 'lanesAvailable'],
        message: `checkpoint.${field} needs checkpoint.lanesAvailable (the lanes the checkpoint has)`,
      });
    }
  }
  if (available === undefined) return;
  const rule = checkpoint.lanePlanRule?.value;
  if (rule !== undefined && rule.minLanes > Math.min(available, rule.maxLanes ?? available)) {
    ctx.addIssue({
      code: 'custom',
      path: ['checkpoint', 'lanePlanRule', 'value', 'minLanes'],
      message:
        rule.minLanes > available
          ? `minLanes exceeds the ${available} lanes the checkpoint has`
          : 'minLanes exceeds maxLanes',
    });
  }
  if (rule?.maxLanes !== undefined && rule.maxLanes > available) {
    ctx.addIssue({
      code: 'custom',
      path: ['checkpoint', 'lanePlanRule', 'value', 'maxLanes'],
      message: `maxLanes exceeds the ${available} lanes the checkpoint has`,
    });
  }
  checkpoint.laneSchedule?.value.forEach((entry, i) => {
    if (entry.lanes > available) {
      ctx.addIssue({
        code: 'custom',
        path: ['checkpoint', 'laneSchedule', 'value', i, 'lanes'],
        message: `${entry.lanes} lanes planned, but the checkpoint has ${available}`,
      });
    }
  });
}

export const ScenarioSchema = z
  .strictObject({
    schemaVersion: z.literal(5),
    id: z.string().regex(ID, ID_MESSAGE),
    title: z.string().min(1),
    description: z.string().min(1),
    /** Overall nature of the data. Reports are always labelled as simulated. */
    dataClassification: z.enum(['SYNTHETIC', 'MIXED', 'AIRPORT_PROVIDED']),
    /** Where the data comes from and under which terms it may be used. */
    dataSources: z.array(DataSourceSchema).min(1),
    /** IANA time zone of the service day (informative in this version). */
    timeZone: z.string().min(1),
    /** The airport configuration this scenario was composed from (set by the loader). */
    airport: z
      .strictObject({
        id: z.string().regex(ID, ID_MESSAGE),
        name: z.string().min(1),
        checkpoint: z.string().regex(ID, ID_MESSAGE),
        file: z.string().min(1).optional(),
        sha256: z
          .string()
          .regex(/^[0-9a-f]{64}$/, 'expected a hexadecimal SHA-256')
          .optional(),
      })
      .optional(),
    checkpoint: z.strictObject({
      id: z.string().min(1),
      kind: z.enum(['DEPARTURE_SECURITY', 'TRANSFER_SECURITY']),
      /** Lanes the checkpoint physically has: no plan or decision may open more. */
      lanesAvailable: param(z.number().int().min(1).max(64)).optional(),
      /** Planned open lanes over the day (lanes close from the highest number down). */
      laneSchedule: param(LaneScheduleSchema).optional(),
      /** How the lanes are planned when `laneSchedule` is not given. */
      lanePlanRule: param(LanePlanRuleSchema).optional(),
      /** Extra lanes beyond the plan and who decides them (S8; none when absent). */
      laneStaffing: param(LaneStaffingSchema).optional(),
      serviceTimeMeanSeconds: param(z.number().positive().max(3600)),
      serviceTimeCv: param(z.number().min(0).max(3)),
      /**
       * The mean screening time the plan and GateFlow's settings assume (S22.4, ADR-059), when the
       * day's (`serviceTimeMeanSeconds`) differs from it; absent, they assume the day's.
       */
      plannedServiceTimeMeanSeconds: param(z.number().positive().max(3600)).optional(),
    }),
    schedule: z.discriminatedUnion('kind', [
      SyntheticHourlyScheduleSchema,
      FlightListScheduleSchema,
    ]),
    passengers: z.strictObject({
      loadFactor: param(
        z
          .strictObject({
            min: z.number().min(0).max(1),
            mode: z.number().min(0).max(1),
            max: z.number().min(0).max(1),
          })
          .refine((lf) => lf.min <= lf.mode && lf.mode <= lf.max, {
            message: 'load factor requires min <= mode <= max',
          }),
      ),
      transferShare: param(z.number().min(0).max(1)),
      showUp: z.strictObject({
        departing: param(ShowUpSchema),
        transfer: param(ShowUpSchema),
      }),
      walkSpeedSigma: param(z.number().min(0).max(2)),
      /** How passengers answer calls of a virtual queue (ignored by the physical queue). */
      callResponse: param(CallResponseSchema),
      /** Groups and families travelling together. */
      groups: param(GroupsSchema),
      /** Share of parties who take the assisted path (staff take them to a lane, no ticket). */
      assistedShare: param(z.number().min(0).max(1)),
      /** Departing parties who arrive late on purpose (stress test of the presentation rule). */
      strategicLateArrival: param(StrategicSchema),
    }),
    operations: z.strictObject({
      boardingCloseMinutesBeforeStd: param(z.number().int().min(0).max(180)),
      /**
       * How the system learns the deadline: from the feed, from the closing rule applied to the
       * schedule the feed provides, or not at all (no flight feed).
       */
      deadlineKnowledge: param(z.enum(['RULE', 'FEED', 'NONE'])),
    }),
    /** Disruptions and data quality (ground truth vs what the system knows). */
    disruptions: z.strictObject({
      flightDelays: param(DelaysSchema),
      gateChanges: param(GateChangesSchema),
      /** Unplanned outages of one lane each. */
      laneOutages: param(OutagesSchema),
      /** Outages of the flight feed: the system's knowledge freezes until it recovers. */
      feedOutages: param(OutagesSchema),
    }),
    /** GateFlow settings of this checkpoint (default: the policy presets). */
    gateflow: param(GateflowSettingsSchema).optional(),
    /** Today's practice of this checkpoint, for baseline A' (default: the preset). */
    todayPractice: param(TodayPracticeSchema).optional(),
    /** Fairness target of this checkpoint, checked in the reports. */
    fairnessTarget: param(FairnessTargetSchema).optional(),
  })
  .superRefine((scenario, ctx) => {
    checkDataSources(scenario, ctx);
    checkLanes(scenario.checkpoint, ctx);
    if (scenario.schedule.kind === 'flight-list') checkFlightList(scenario.schedule, ctx);
    const close = scenario.operations.boardingCloseMinutesBeforeStd.value;
    if (scenario.passengers.strategicLateArrival.value.minMinutesBeforeStd < close) {
      ctx.addIssue({
        code: 'custom',
        path: ['passengers', 'strategicLateArrival', 'value', 'minMinutesBeforeStd'],
        message: `passengers must arrive before boarding closes (${close} min before departure)`,
      });
    }
    for (const segment of ['departing', 'transfer'] as const) {
      if (scenario.passengers.showUp[segment].value.minMinutesBeforeStd < close) {
        ctx.addIssue({
          code: 'custom',
          path: ['passengers', 'showUp', segment, 'value', 'minMinutesBeforeStd'],
          message: `passengers must arrive before boarding closes (${close} min before departure)`,
        });
      }
    }
  });

/** A scenario as written: the lane schedule may still have to be planned from its rule. */
export type ScenarioInput = z.infer<typeof ScenarioSchema>;

/** A validated scenario, with its lane schedule (given, or planned from the rule). */
export type Scenario = Omit<ScenarioInput, 'checkpoint'> & {
  readonly checkpoint: ScenarioInput['checkpoint'] & {
    readonly laneSchedule: NonNullable<ScenarioInput['checkpoint']['laneSchedule']>;
  };
};
