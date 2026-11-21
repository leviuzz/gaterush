import { dirname, isAbsolute, join } from 'node:path';
import { parseArgs } from 'node:util';
import type { ClassificationParams } from '@gateflow/priority-engine';
import { POLICY_PRESETS, PRIORITY_V3_POLICY, classificationOf } from '@gateflow/queue-core';
import type { Policy } from '@gateflow/queue-core';
import {
  DEFAULT_BOOTSTRAP,
  SweepConfigError,
  assembleExperiment,
  assembleSweep,
  buildResults,
  buildSweepResults,
  comparisonKey,
  defaultComparisons,
  planExperiment,
  planSweep,
  renderHtmlReport,
  renderReport,
  renderSweepHtml,
  renderSweepReport,
  stringifyResults,
  stringifySweep,
  sweepDayJob,
} from '@gateflow/sim-metrics';
import type {
  PolicyComparison,
  ResultsDocument,
  SeedResult,
  SweepConfig,
  SweepDayResult,
  SweepDocument,
  SweepPlan,
} from '@gateflow/sim-metrics';
import {
  ScenarioValidationError,
  canonicalJson,
  collectAssumptions,
  designDayRows,
  formatFlightCsv,
  generateSchedule,
  parseScenarioText,
} from '@gateflow/sim-scenarios';
import type { Scenario } from '@gateflow/sim-scenarios';
import {
  UsageError,
  parseComparisons,
  parsePolicies,
  parsePositiveInteger,
  parseSeeds,
} from './args';
import type { CliIo } from './io';
import { parseSweepSpec, sweepDimensions, sweepScenarioPath } from './sweep-spec';
import type { Task, TaskResult } from './tasks';
import { CLI_NAME, CLI_VERSION } from './version';

export const EXIT_OK = 0;
export const EXIT_FAILURE = 1;
export const EXIT_USAGE = 2;

const DEFAULT_POLICIES = 'fifo,fifo-manual,virtual-fifo,priority-v3';

const HELP = `${CLI_NAME} ${CLI_VERSION}: GateFlow simulation experiments

Usage:
  ${CLI_NAME} run --scenario <file> [options]   Run an experiment: results.json, report.md, report.html
  ${CLI_NAME} sweep --spec <file> [options]     Run a sensitivity sweep: sweep.json, sweep.md, sweep.html
  ${CLI_NAME} validate --scenario <file>        Validate a scenario file
  ${CLI_NAME} flights --scenario <file> [--out <file>]
                                                Write the design day as a flight list (CSV)
  ${CLI_NAME} policies                          List the available policy presets
  ${CLI_NAME} --help | --version

Options for "run":
  --scenario <file>              Scenario file (YAML or JSON)            (required)
  --seeds <spec>                 Seeds, e.g. 1-200 or 1-10,42            (default 1-200)
  --policies <ids>               Comma-separated policy presets          (default ${DEFAULT_POLICIES})
  --baseline <id>                Status-quo policy, listed first         (default: first policy)
  --compare <pairs>              Paired comparisons candidate:reference  (default: see below)
  --out <dir>                    Output directory                        (default out/<scenario id>)
  --bootstrap-resamples <n>      Bootstrap resamples for intervals       (default ${DEFAULT_BOOTSTRAP.resamples})
  --workers <n>                  Worker threads; results do not depend on it (default: all CPUs)
  --commit <rev>                 Source revision recorded in the manifest (default: detected)
  --quiet                        Do not print progress

Options for "sweep" (a sensitivity sweep is described in a file, see sweeps/):
  --spec <file>                  Sweep specification (YAML or JSON)      (required)
  --seeds <spec>                 Seeds of every point                    (default: from the file)
  --out <dir>                    Output directory                        (default out/sweeps/<id>)
  --bootstrap-resamples, --workers, --commit, --quiet: as for "run"

By default every policy is compared with the baseline. Each priority policy is also compared with
the FIFO policy that runs the same virtual queue (this isolates the prioritisation), with today's
practice with manual handling (fifo-manual) and with the priority policies listed before it.
Risk classes on arrival use the parameters of the first priority policy listed.

A scenario can take its flights from a CSV file (format gateflow.flights/1: columns flight, std,
aircraft, seats, passengers, gate_zone, destination); "flights" writes one for any scenario.

All results are SIMULATED on the assumptions of the scenario and are not operational evidence.
`;

function readText(io: CliIo, file: string, what: string): string {
  try {
    return io.readFile(file);
  } catch (error) {
    throw new UsageError(
      `cannot read ${what} file ${file}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/** Loads a scenario, with the flight list file it names (relative to the scenario file). */
function loadScenario(io: CliIo, file: string): Scenario {
  const text = readText(io, file, 'scenario');
  return parseScenarioText(text, file.toLowerCase().endsWith('.json') ? 'json' : 'yaml', {
    read: (path) => io.readFile(isAbsolute(path) ? path : join(dirname(file), path)),
    sha256: (content) => io.sha256(content),
  });
}

function experimentDays(results: readonly TaskResult[]): SeedResult[] {
  return results.map((r) => {
    if (r.kind !== 'experiment-day') throw new Error(`unexpected task result ${r.kind}`);
    return r.day;
  });
}

function sweepDays(plan: SweepPlan, results: readonly TaskResult[]): SweepDayResult[][] {
  const perVariant = plan.seeds.length;
  return plan.variants.map((_, v) =>
    results.slice(v * perVariant, (v + 1) * perVariant).map((r) => {
      if (r.kind !== 'sweep-day') throw new Error(`unexpected task result ${r.kind}`);
      return r.day;
    }),
  );
}

function scenarioHash(io: CliIo, scenario: Scenario): string {
  return `sha256:${io.sha256(canonicalJson(scenario))}`;
}

/** Classification for on-arrival risk classes: the first priority policy's, else priority-v3's. */
function classificationFor(policies: readonly Policy[]): ClassificationParams {
  for (const policy of policies) {
    const classification = classificationOf(policy);
    if (classification !== null) return classification;
  }
  const fallback = classificationOf(PRIORITY_V3_POLICY);
  if (fallback === null) throw new Error('priority-v3 must define classification parameters');
  return fallback;
}

/**
 * Default comparisons: every policy against the baseline; then each policy that reorders the queue
 * against the FIFO policy operating exactly the same queue (the difference is the reordering
 * alone); and each priority (constrained EDF) policy against today's practice with manual
 * handling (a physical queue with staff calls, baseline A') and against the priority policies
 * listed before it on the same queue (version against version).
 */
export function defaultCompare(
  policies: readonly Policy[],
  baselineId: string,
): PolicyComparison[] {
  const pairs = defaultComparisons(policies, baselineId);
  const keys = new Set(pairs.map(comparisonKey));
  const add = (candidateId: string, referenceId: string) => {
    const pair = { candidateId, referenceId };
    if (keys.has(comparisonKey(pair))) return;
    keys.add(comparisonKey(pair));
    pairs.push(pair);
  };
  const sameQueue = (a: Policy, b: Policy) => canonicalJson(a.queue) === canonicalJson(b.queue);
  policies.forEach((candidate, index) => {
    if (candidate.selection.kind === 'fifo' || candidate.id === baselineId) return;
    const references = policies.filter((p) => p.id !== baselineId && p.id !== candidate.id);
    for (const reference of references) {
      if (reference.selection.kind === 'fifo' && sameQueue(reference, candidate)) {
        add(candidate.id, reference.id);
      }
    }
    if (candidate.selection.kind !== 'constrained-edf') return;
    for (const reference of references) {
      if (reference.queue.kind === 'physical' && reference.selection.kind !== 'fifo') {
        add(candidate.id, reference.id);
      }
    }
    for (const reference of policies.slice(0, index)) {
      if (
        reference.id !== baselineId &&
        reference.selection.kind === 'constrained-edf' &&
        sameQueue(reference, candidate)
      ) {
        add(candidate.id, reference.id);
      }
    }
  });
  return pairs;
}

function summaryLines(doc: ResultsDocument): string[] {
  const lines: string[] = [];
  const pad = (text: string, width: number) => text.padEnd(width);
  lines.push(
    `scenario   ${doc.manifest.scenario.id} (${doc.manifest.scenario.hash.slice(0, 19)}...)`,
    `seeds      ${doc.manifest.seeds.ranges} (${doc.manifest.seeds.count} simulated days)`,
    '',
    `${pad('policy', 16)}${pad('missed/day', 14)}${pad('P90 wait (min)', 16)}longest wait (min)`,
  );
  for (const policy of doc.manifest.policies) {
    const m = doc.summary.policies[policy.id];
    if (m === undefined) continue;
    lines.push(
      `${pad(policy.id, 16)}${pad(m.missed.mean.toFixed(1), 14)}${pad(m.waitP90Min.mean.toFixed(1), 16)}${m.waitMaxMin.max.toFixed(1)}`,
    );
  }
  lines.push('');
  for (const [key, comparison] of Object.entries(doc.summary.comparisons)) {
    const { net, saved, harmed } = comparison.metrics;
    lines.push(
      `${key}: net flights saved per day ${net.mean.toFixed(1)} ` +
        `[${net.ciLower.toFixed(1)}, ${net.ciUpper.toFixed(1)}] (saved ${saved.mean.toFixed(1)}, lost ${harmed.mean.toFixed(1)})`,
    );
  }
  return lines;
}

async function commandRun(argv: string[], io: CliIo): Promise<number> {
  const { values } = parseArgs({
    args: argv,
    options: {
      scenario: { type: 'string' },
      seeds: { type: 'string', default: '1-200' },
      policies: { type: 'string', default: DEFAULT_POLICIES },
      baseline: { type: 'string' },
      compare: { type: 'string' },
      out: { type: 'string' },
      'bootstrap-resamples': { type: 'string', default: String(DEFAULT_BOOTSTRAP.resamples) },
      workers: { type: 'string' },
      commit: { type: 'string' },
      quiet: { type: 'boolean', default: false },
    },
    strict: true,
    allowPositionals: false,
  });
  if (values.scenario === undefined) throw new UsageError('--scenario is required');
  const seeds = parseSeeds(values.seeds);
  const workers =
    values.workers === undefined ? io.cpus() : parsePositiveInteger(values.workers, '--workers');
  const policies = parsePolicies(values.policies);
  const baselinePolicyId = values.baseline ?? (policies[0] as Policy).id;
  if (!policies.some((p) => p.id === baselinePolicyId)) {
    throw new UsageError(`baseline "${baselinePolicyId}" must be one of --policies`);
  }
  const comparisons =
    values.compare === undefined
      ? defaultCompare(policies, baselinePolicyId)
      : parseComparisons(values.compare, policies);
  const resamples = parsePositiveInteger(values['bootstrap-resamples'], '--bootstrap-resamples');

  const scenario = loadScenario(io, values.scenario);
  const hash = scenarioHash(io, scenario);
  const commit = values.commit ?? io.commit();
  const outDir = values.out ?? join('out', scenario.id);

  const progressEvery = Math.max(1, Math.ceil(seeds.length / 4));
  const config = {
    scenario,
    seeds,
    policies,
    baselinePolicyId,
    comparisons,
    classification: classificationFor(policies),
    bootstrap: { ...DEFAULT_BOOTSTRAP, resamples },
  };
  // Every simulated day is independent: they can run on any number of threads.
  const plan = planExperiment(config);
  const tasks: Task[] = plan.seeds.map((seed) => ({ kind: 'experiment-day', job: plan.job, seed }));
  const results = await io.runTasks(tasks, workers, (done, total) => {
    if (!values.quiet && (done % progressEvery === 0 || done === total)) {
      io.stderr(`simulated ${done}/${total} days\n`);
    }
  });
  const experiment = assembleExperiment(config, experimentDays(results));
  const doc = buildResults(experiment, {
    generator: { name: CLI_NAME, version: CLI_VERSION },
    commit,
    scenarioHash: hash,
  });

  io.mkdir(outDir);
  const resultsPath = join(outDir, 'results.json');
  const reportPath = join(outDir, 'report.md');
  const htmlPath = join(outDir, 'report.html');
  io.writeFile(resultsPath, stringifyResults(doc));
  io.writeFile(reportPath, renderReport(doc));
  io.writeFile(htmlPath, renderHtmlReport(doc));

  io.stdout(
    [
      'GateFlow simulation: SIMULATED RESULTS, not operational evidence',
      ...summaryLines(doc),
      '',
      `written    ${resultsPath}`,
      `           ${reportPath}`,
      `           ${htmlPath}`,
      '',
    ].join('\n'),
  );
  return EXIT_OK;
}

function sweepSummaryLines(doc: SweepDocument): string[] {
  const { manifest } = doc;
  const first = manifest.comparisons.find((c) => c.candidateId === manifest.candidateId);
  const key = first === undefined ? undefined : comparisonKey(first);
  const lines = [
    `sweep      ${manifest.sweep.id} (${manifest.sweep.hash.slice(0, 19)}...)`,
    `scenario   ${manifest.scenario.id} (${manifest.scenario.hash.slice(0, 19)}...)`,
    `seeds      ${manifest.seeds.ranges} (${manifest.seeds.count} days per point, ${manifest.simulatedDays} distinct simulated days)`,
    '',
    `missed flights per day with ${manifest.candidateId}` +
      (key === undefined ? '' : `; net saved vs ${first?.referenceId ?? ''}`),
  ];
  for (const dimension of doc.dimensions) {
    const points = dimension.points.map((p) => {
      const missed = p.policies[manifest.candidateId]?.missed.mean ?? 0;
      const net = key === undefined ? undefined : p.comparisons[key]?.metrics.net.mean;
      return `${p.label}${p.isBase ? '*' : ''}: ${missed.toFixed(1)}${net === undefined ? '' : ` (${net >= 0 ? '+' : ''}${net.toFixed(1)})`}`;
    });
    lines.push(`  ${dimension.id}: ${points.join(', ')}`);
  }
  lines.push('  (* = base)');
  return lines;
}

async function commandSweep(argv: string[], io: CliIo): Promise<number> {
  const { values } = parseArgs({
    args: argv,
    options: {
      spec: { type: 'string' },
      seeds: { type: 'string' },
      out: { type: 'string' },
      'bootstrap-resamples': { type: 'string', default: String(DEFAULT_BOOTSTRAP.resamples) },
      workers: { type: 'string' },
      commit: { type: 'string' },
      quiet: { type: 'boolean', default: false },
    },
    strict: true,
    allowPositionals: false,
  });
  if (values.spec === undefined) throw new UsageError('--spec is required');
  const spec = parseSweepSpec(readText(io, values.spec, 'sweep'), values.spec);
  const scenario = loadScenario(io, sweepScenarioPath(spec, values.spec));
  const policies = parsePolicies(spec.policies.join(','));
  if (!policies.some((p) => p.id === spec.baseline)) {
    throw new UsageError(`baseline "${spec.baseline}" must be one of the policies`);
  }
  const config: SweepConfig = {
    id: spec.id,
    title: spec.title,
    description: spec.description,
    scenario,
    seeds: parseSeeds(values.seeds ?? spec.seeds),
    policies,
    baselinePolicyId: spec.baseline,
    candidateId: spec.candidate,
    comparisons: parseComparisons(spec.compare.join(','), policies),
    classification: classificationFor(policies),
    bootstrap: {
      ...DEFAULT_BOOTSTRAP,
      resamples: parsePositiveInteger(values['bootstrap-resamples'], '--bootstrap-resamples'),
    },
    dimensions: sweepDimensions(spec),
  };
  const workers =
    values.workers === undefined ? io.cpus() : parsePositiveInteger(values.workers, '--workers');
  let plan: SweepPlan;
  try {
    plan = planSweep(config);
  } catch (error) {
    if (error instanceof SweepConfigError) throw new UsageError(`invalid sweep: ${error.message}`);
    throw error;
  }
  const tasks: Task[] = plan.variants.flatMap((variant) => {
    const job = sweepDayJob(config, variant);
    return plan.seeds.map((seed): Task => ({ kind: 'sweep-day', job, seed }));
  });
  const progressEvery = Math.max(1, Math.ceil(tasks.length / 4));
  const results = await io.runTasks(tasks, workers, (done, total) => {
    if (!values.quiet && (done % progressEvery === 0 || done === total)) {
      io.stderr(`simulated ${done}/${total} days (${plan.variants.length} variants)\n`);
    }
  });
  const sweep = assembleSweep(config, plan, sweepDays(plan, results));
  const doc = buildSweepResults(sweep, {
    generator: { name: CLI_NAME, version: CLI_VERSION },
    commit: values.commit ?? io.commit(),
    scenarioHash: scenarioHash(io, scenario),
    sweepHash: `sha256:${io.sha256(canonicalJson(spec))}`,
    specPath: `sweeps/${spec.id}.yaml`,
  });

  const outDir = values.out ?? join('out', 'sweeps', spec.id);
  io.mkdir(outDir);
  const jsonPath = join(outDir, 'sweep.json');
  const reportPath = join(outDir, 'sweep.md');
  const htmlPath = join(outDir, 'sweep.html');
  io.writeFile(jsonPath, stringifySweep(doc));
  io.writeFile(reportPath, renderSweepReport(doc));
  io.writeFile(htmlPath, renderSweepHtml(doc));
  io.stdout(
    [
      'GateFlow sensitivity sweep: SIMULATED RESULTS, not operational evidence',
      ...sweepSummaryLines(doc),
      '',
      `written    ${jsonPath}`,
      `           ${reportPath}`,
      `           ${htmlPath}`,
      '',
    ].join('\n'),
  );
  return EXIT_OK;
}

function commandValidate(argv: string[], io: CliIo): number {
  const { values } = parseArgs({
    args: argv,
    options: { scenario: { type: 'string' } },
    strict: true,
    allowPositionals: false,
  });
  if (values.scenario === undefined) throw new UsageError('--scenario is required');
  const scenario = loadScenario(io, values.scenario);
  const { schedule } = scenario;
  const from =
    schedule.kind === 'flight-list'
      ? `flight list ${schedule.flights.file ?? '(inline)'}, source ${schedule.flights.source}`
      : 'hourly profile';
  io.stdout(
    [
      `valid scenario ${scenario.id}: ${scenario.title}`,
      `hash           ${scenarioHash(io, scenario)}`,
      `data           ${scenario.dataClassification}`,
      `flights        ${generateSchedule(scenario).length} on the design day (${from})`,
      `assumptions    ${collectAssumptions(scenario).length} labelled parameters`,
      ...scenario.dataSources.map(
        (source, i) =>
          `${i === 0 ? 'data sources  ' : '              '} ${source.id} (${source.kind}): ${source.licence}`,
      ),
      '',
    ].join('\n'),
  );
  return EXIT_OK;
}

/** Writes the design day of a scenario as a flight list, to a file or to standard output. */
function commandFlights(argv: string[], io: CliIo): number {
  const { values } = parseArgs({
    args: argv,
    options: { scenario: { type: 'string' }, out: { type: 'string' } },
    strict: true,
    allowPositionals: false,
  });
  if (values.scenario === undefined) throw new UsageError('--scenario is required');
  const scenario = loadScenario(io, values.scenario);
  const csv = formatFlightCsv(designDayRows(scenario), [
    `gateflow.flights/1: design day of scenario ${scenario.id} (${scenario.dataClassification} data)`,
    `Scheduled departures in local time (${scenario.timeZone}). Sources: ${scenario.dataSources
      .map((s) => `${s.id} (${s.licence})`)
      .join('; ')}`,
  ]);
  if (values.out === undefined) {
    io.stdout(csv);
  } else {
    io.writeFile(values.out, csv);
    io.stdout(`written    ${values.out} (${generateSchedule(scenario).length} flights)\n`);
  }
  return EXIT_OK;
}

function commandPolicies(io: CliIo): number {
  io.stdout(`${JSON.stringify(POLICY_PRESETS, null, 2)}\n`);
  return EXIT_OK;
}

/** Runs the CLI and resolves to the process exit code. Never rejects. */
export async function runCli(argv: readonly string[], io: CliIo): Promise<number> {
  const [command, ...rest] = argv;
  try {
    switch (command) {
      case 'run':
        return await commandRun(rest, io);
      case 'sweep':
        return await commandSweep(rest, io);
      case 'validate':
        return commandValidate(rest, io);
      case 'flights':
        return commandFlights(rest, io);
      case 'policies':
        return commandPolicies(io);
      case '--version':
      case '-v':
        io.stdout(`${CLI_VERSION}\n`);
        return EXIT_OK;
      case undefined:
      case '--help':
      case '-h':
      case 'help':
        io.stdout(HELP);
        return command === undefined ? EXIT_USAGE : EXIT_OK;
      default:
        throw new UsageError(`unknown command "${command}"`);
    }
  } catch (error) {
    if (error instanceof ScenarioValidationError) {
      io.stderr(`${error.message}\n`);
      return EXIT_FAILURE;
    }
    if (error instanceof UsageError || (error instanceof TypeError && 'code' in error)) {
      // TypeErrors with a code come from util.parseArgs (unknown or malformed options).
      io.stderr(`error: ${error.message}\n\nRun "${CLI_NAME} --help" for usage.\n`);
      return EXIT_USAGE;
    }
    io.stderr(
      `error: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
    );
    return EXIT_FAILURE;
  }
}
