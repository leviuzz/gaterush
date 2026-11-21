import { generateSchedule } from '@gateflow/sim-scenarios';
import type { Assumption, DataSource, Scenario } from '@gateflow/sim-scenarios';

/** How the design day of a scenario was built, for the manifest of every result. */
export interface ScheduleSummary {
  readonly kind: Scenario['schedule']['kind'];
  readonly flights: number;
  /** Flight list file, its SHA-256 and its data source (flight lists only). */
  readonly file: string | null;
  readonly sha256: string | null;
  readonly source: string | null;
}

/** The sources of a scenario's data and how its design day was built. */
export interface ScenarioProvenance {
  readonly dataSources: readonly DataSource[];
  readonly schedule: ScheduleSummary;
}

export function scenarioProvenance(scenario: Scenario): ScenarioProvenance {
  const { schedule } = scenario;
  const flights = generateSchedule(scenario).length;
  return {
    dataSources: scenario.dataSources,
    schedule:
      schedule.kind === 'flight-list'
        ? {
            kind: schedule.kind,
            flights,
            file: schedule.flights.file ?? null,
            sha256: schedule.flights.sha256 ?? null,
            source: schedule.flights.source,
          }
        : { kind: schedule.kind, flights, file: null, sha256: null, source: null },
  };
}

function cell(text: string): string {
  return text.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

/** The source label of an assumption, with the data source it refers to. */
export function sourceLabel(assumption: Assumption): string {
  return assumption.ref === null ? assumption.source : `${assumption.source} (${assumption.ref})`;
}

/**
 * Markdown of the data sources of a scenario: one row per source with its licence and what it is
 * used for, then how the design day was built. `heading` is the full heading line.
 */
export function renderDataSources(
  heading: string,
  provenance: ScenarioProvenance,
  assumptions: readonly Assumption[],
): string[] {
  const { dataSources, schedule } = provenance;
  const lines = [
    heading,
    '',
    'Where the data of this scenario comes from, and the terms under which it may be used.',
    '',
    '| Source | Kind | Provider | Licence or terms of use | Retrieved | Used for |',
    '|---|---|---|---|---|---|',
  ];
  for (const source of dataSources) {
    const uses = [
      ...(schedule.source === source.id ? ['flight list'] : []),
      ...assumptions.filter((a) => a.ref === source.id).map((a) => a.path),
    ];
    const title =
      source.url === undefined
        ? `${source.title} (\`${source.id}\`)`
        : `[${source.title}](${source.url}) (\`${source.id}\`)`;
    lines.push(
      `| ${cell(title)} | ${source.kind} | ${cell(source.provider)} | ${cell(source.licence)} | ${source.retrieved ?? '-'} | ${uses.length === 0 ? '-' : cell(uses.join(', '))} |`,
    );
  }
  lines.push('');
  const notes = dataSources.filter((s) => s.note !== undefined);
  for (const source of notes) lines.push(`- \`${source.id}\`: ${source.note ?? ''}`);
  if (notes.length > 0) lines.push('');
  lines.push(
    schedule.kind === 'flight-list'
      ? `Design day: ${schedule.flights} departures from the flight list` +
          (schedule.file === null ? '' : ` \`${schedule.file}\``) +
          (schedule.sha256 === null ? '' : ` (SHA-256 \`${schedule.sha256}\`)`) +
          `, source \`${schedule.source ?? ''}\`.`
      : `Design day: ${schedule.flights} departures generated from the hourly profile of the scenario (\`schedule.departuresPerHour\`).`,
    '',
  );
  return lines;
}
