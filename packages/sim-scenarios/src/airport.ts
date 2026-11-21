import { z } from 'zod';
import { ScenarioValidationError } from './errors';
import { DataSourceSchema } from './schema';

const ID = /^[a-z0-9][a-z0-9-]*$/;
const ID_MESSAGE = 'lowercase letters, digits and dashes';

/** Part of a scenario, written in an airport configuration and checked once composed. */
const ScenarioPartSchema = z.record(z.string(), z.unknown());

/**
 * An airport configuration (`airports/<id>.yaml`): every parameter of an airport that does not
 * change from one day to the next, with its sources. `defaults` apply to every checkpoint; each
 * checkpoint adds its own part. A scenario then names the airport and the checkpoint
 * (`extends`) and gives only what belongs to the day: its flights, load factors and disruptions.
 */
export const AirportSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    kind: z.literal('airport'),
    id: z.string().regex(ID, ID_MESSAGE),
    name: z.string().min(1),
    description: z.string().min(1),
    dataClassification: z.enum(['SYNTHETIC', 'MIXED', 'AIRPORT_PROVIDED']),
    /** IANA time zone of the airport. */
    timeZone: z.string().min(1),
    dataSources: z.array(DataSourceSchema).min(1),
    /** Scenario fields shared by every checkpoint and day of the airport. */
    defaults: ScenarioPartSchema.optional(),
    checkpoints: z
      .array(
        z.strictObject({
          id: z.string().regex(ID, ID_MESSAGE),
          title: z.string().min(1),
          kind: z.enum(['DEPARTURE_SECURITY', 'TRANSFER_SECURITY']),
          /** Scenario fields of this checkpoint; they override the defaults. */
          scenario: ScenarioPartSchema.optional(),
        }),
      )
      .min(1)
      .refine((cps) => new Set(cps.map((c) => c.id)).size === cps.length, {
        message: 'checkpoint ids must be unique',
      }),
  })
  .superRefine((airport, ctx) => {
    const ids = airport.dataSources.map((s) => s.id);
    ids.forEach((id, i) => {
      if (ids.indexOf(id) !== i) {
        ctx.addIssue({
          code: 'custom',
          path: ['dataSources', i, 'id'],
          message: `duplicate data source id "${id}"`,
        });
      }
    });
  });
export type Airport = z.infer<typeof AirportSchema>;

/** Validates an airport configuration; throws a ScenarioValidationError listing every problem. */
export function parseAirport(data: unknown): Airport {
  const result = AirportSchema.safeParse(data);
  if (!result.success) {
    throw new ScenarioValidationError(
      result.error.issues.map((issue) => {
        const path = issue.path.map(String).join('.');
        return `${path === '' ? '(root)' : path}: ${issue.message}`;
      }),
    );
  }
  return result.data;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** A labelled parameter (`value` and `source`) is replaced as a whole, never merged. */
function isParam(value: Record<string, unknown>): boolean {
  return 'value' in value && 'source' in value;
}

/**
 * Deep merge of scenario parts: objects merge key by key; parameters, arrays and plain values
 * of `over` replace those of `base`.
 */
export function mergeScenarioParts(base: unknown, over: unknown): unknown {
  if (isRecord(base) && isRecord(over) && !isParam(base) && !isParam(over)) {
    const out: Record<string, unknown> = { ...base };
    for (const [key, value] of Object.entries(over)) {
      out[key] = key in out ? mergeScenarioParts(out[key], value) : value;
    }
    return out;
  }
  return over;
}

/** Where a scenario says it belongs. */
export interface ScenarioExtends {
  readonly airport: string;
  readonly checkpoint: string;
}

const ExtendsSchema = z.strictObject({
  airport: z.string().min(1),
  checkpoint: z.string().regex(ID, ID_MESSAGE),
});

/** The `extends` of a scenario, validated, or `undefined` when it has none. */
export function scenarioExtends(data: unknown): ScenarioExtends | undefined {
  if (!isRecord(data) || !('extends' in data)) return undefined;
  const result = ExtendsSchema.safeParse(data.extends);
  if (!result.success) {
    throw new ScenarioValidationError(
      result.error.issues.map((issue) => {
        const path = ['extends', ...issue.path.map(String)].join('.');
        return `${path}: ${issue.message}`;
      }),
    );
  }
  return result.data;
}

/**
 * Composes a scenario from an airport configuration, one of its checkpoints and a day: the
 * airport's defaults, then the checkpoint's part, then the day, merged in that order (see
 * {@link mergeScenarioParts}). Data sources are those of the airport followed by those of the
 * day. The result records where it came from (`airport`) and is then validated as any scenario.
 */
export function composeScenario(
  airport: Airport,
  day: Record<string, unknown>,
  source: { readonly file?: string; readonly sha256?: string } = {},
): Record<string, unknown> {
  const ext = scenarioExtends(day);
  if (ext === undefined) throw new RangeError('the scenario does not extend an airport');
  const checkpoint = airport.checkpoints.find((c) => c.id === ext.checkpoint);
  if (checkpoint === undefined) {
    throw new ScenarioValidationError([
      `extends.checkpoint: airport ${airport.id} has no checkpoint "${ext.checkpoint}" (known: ${airport.checkpoints
        .map((c) => c.id)
        .join(', ')})`,
    ]);
  }
  const base: Record<string, unknown> = {
    schemaVersion: 5,
    dataClassification: airport.dataClassification,
    timeZone: airport.timeZone,
    checkpoint: { id: checkpoint.id, kind: checkpoint.kind },
  };
  const dayPart = Object.fromEntries(
    Object.entries(day).filter(([key]) => key !== 'extends' && key !== 'dataSources'),
  );
  const dayDataSources = day.dataSources;
  let merged = mergeScenarioParts(base, airport.defaults ?? {});
  merged = mergeScenarioParts(merged, checkpoint.scenario ?? {});
  merged = mergeScenarioParts(merged, dayPart);
  if (!isRecord(merged)) throw new RangeError('composition must give an object');
  return {
    ...merged,
    dataSources: [
      ...airport.dataSources,
      ...(Array.isArray(dayDataSources) ? (dayDataSources as unknown[]) : []),
    ],
    airport: {
      id: airport.id,
      name: airport.name,
      checkpoint: checkpoint.id,
      ...(source.file === undefined ? {} : { file: source.file }),
      ...(source.sha256 === undefined ? {} : { sha256: source.sha256 }),
    },
  };
}
