import { z } from 'zod';

/** Where a parameter value comes from. Shown next to every number in reports. */
export const SOURCE_LABELS = ['SYNTHETIC', 'LITERATURE', 'AIRPORT_PROVIDED', 'MEASURED'] as const;
export type SourceLabel = (typeof SOURCE_LABELS)[number];

const SourceSchema = z.enum(SOURCE_LABELS);

/**
 * Every model parameter is wrapped with its provenance, so that no number can enter a report
 * without saying whether it is synthetic, from the literature, provided by an airport or measured.
 */
function param<T extends z.ZodType>(value: T) {
  return z.strictObject({
    value,
    source: SourceSchema,
    note: z.string().min(1).optional(),
  });
}

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

const SyntheticHourlyScheduleSchema = z.strictObject({
  kind: z.literal('synthetic-hourly'),
  /** Seed of the schedule generator: the design day is the same for every replication. */
  generatorSeed: z.number().int().min(0).max(0xffffffff),
  departuresPerHour: param(HourlySchema),
  aircraftMix: param(AircraftMixSchema),
  gateZones: param(GateZonesSchema),
});

export const ScenarioSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/, 'lowercase letters, digits and dashes'),
    title: z.string().min(1),
    description: z.string().min(1),
    /** Overall nature of the data. Reports are always labelled as simulated. */
    dataClassification: z.enum(['SYNTHETIC', 'MIXED', 'AIRPORT_PROVIDED']),
    /** IANA time zone of the service day (informative in this version). */
    timeZone: z.string().min(1),
    checkpoint: z.strictObject({
      id: z.string().min(1),
      kind: z.enum(['DEPARTURE_SECURITY', 'TRANSFER_SECURITY']),
      lanes: param(z.number().int().min(1).max(64)),
      serviceTimeMeanSeconds: param(z.number().positive().max(3600)),
      serviceTimeCv: param(z.number().min(0).max(3)),
    }),
    schedule: z.discriminatedUnion('kind', [SyntheticHourlyScheduleSchema]),
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
    }),
    operations: z.strictObject({
      boardingCloseMinutesBeforeStd: param(z.number().int().min(0).max(180)),
      /** How the system learns the deadline. In this version ground truth equals the rule. */
      deadlineKnowledge: param(z.enum(['RULE', 'FEED'])),
    }),
  })
  .superRefine((scenario, ctx) => {
    const close = scenario.operations.boardingCloseMinutesBeforeStd.value;
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

export type Scenario = z.infer<typeof ScenarioSchema>;
