import { dirname, isAbsolute, join } from 'node:path';
import { SWEEP_PARAMETERS } from '@gateflow/sim-metrics';
import type { SweepDimension, SweepSetting } from '@gateflow/sim-metrics';
import { parse as parseYaml } from 'yaml';
import { z } from 'zod';
import { UsageError } from './args';

/**
 * A sensitivity sweep as written in a file (YAML or JSON). Policies are preset ids; the scenario
 * is a path relative to the file. Values are numbers, or "none" for no maximum data age.
 */
const ValueSchema = z.union([z.number(), z.literal('none')]);
const ParameterSchema = z.enum(SWEEP_PARAMETERS);

const SettingSchema = z.strictObject({ parameter: ParameterSchema, value: ValueSchema });

export const SweepSpecSchema = z.strictObject({
  schemaVersion: z.literal(1),
  id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/, 'lowercase letters, digits and dashes'),
  title: z.string().min(1),
  description: z.string().min(1),
  scenario: z.string().min(1),
  seeds: z.string().min(1),
  policies: z.array(z.string().min(1)).min(2),
  baseline: z.string().min(1),
  candidate: z.string().min(1),
  /** Paired comparisons as `candidate:reference`. */
  compare: z.array(z.string().regex(/^[^:]+:[^:]+$/, 'expected candidate:reference')).min(1),
  dimensions: z
    .array(
      z.strictObject({
        id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/, 'lowercase letters, digits and dashes'),
        title: z.string().min(1),
        parameter: ParameterSchema,
        values: z.array(ValueSchema).min(1),
        base: z.array(SettingSchema).optional(),
      }),
    )
    .min(1),
});
export type SweepSpec = z.infer<typeof SweepSpecSchema>;

/** Parses and validates a sweep specification; throws a UsageError listing every problem. */
export function parseSweepSpec(text: string, file: string): SweepSpec {
  let data: unknown;
  try {
    data = file.toLowerCase().endsWith('.json')
      ? JSON.parse(text)
      : parseYaml(text, { uniqueKeys: true });
  } catch (error) {
    throw new UsageError(
      `cannot parse sweep ${file}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  const result = SweepSpecSchema.safeParse(data);
  if (!result.success) {
    const issues = result.error.issues.map((issue) => {
      const path = issue.path.map(String).join('.');
      return `  - ${path === '' ? '(root)' : path}: ${issue.message}`;
    });
    throw new UsageError(`invalid sweep ${file}:\n${issues.join('\n')}`);
  }
  return result.data;
}

const toValue = (value: number | 'none') => (value === 'none' ? null : value);

/** The dimensions of a specification, with "none" turned into `null`. */
export function sweepDimensions(spec: SweepSpec): SweepDimension[] {
  return spec.dimensions.map((d) => ({
    id: d.id,
    title: d.title,
    parameter: d.parameter,
    values: d.values.map(toValue),
    ...(d.base === undefined
      ? {}
      : {
          base: d.base.map((s): SweepSetting => ({
            parameter: s.parameter,
            value: toValue(s.value),
          })),
        }),
  }));
}

/** The scenario path of a specification, resolved relative to the specification file. */
export function sweepScenarioPath(spec: SweepSpec, file: string): string {
  return isAbsolute(spec.scenario) ? spec.scenario : join(dirname(file), spec.scenario);
}
