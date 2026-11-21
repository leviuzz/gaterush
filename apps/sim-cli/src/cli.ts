import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { POLICY_PRESETS, PRIORITY_V0_POLICY, classificationOf } from '@gateflow/priority-engine';
import type { ClassificationParams, Policy } from '@gateflow/priority-engine';
import {
  DEFAULT_BOOTSTRAP,
  buildResults,
  renderReport,
  runExperiment,
  stringifyResults,
} from '@gateflow/sim-metrics';
import type { ResultsDocument } from '@gateflow/sim-metrics';
import {
  ScenarioValidationError,
  canonicalJson,
  collectAssumptions,
  generateSchedule,
  parseScenarioText,
} from '@gateflow/sim-scenarios';
import type { Scenario } from '@gateflow/sim-scenarios';
import { UsageError, parsePolicies, parsePositiveInteger, parseSeeds } from './args';
import type { CliIo } from './io';
import { CLI_NAME, CLI_VERSION } from './version';

export const EXIT_OK = 0;
export const EXIT_FAILURE = 1;
export const EXIT_USAGE = 2;

const HELP = `${CLI_NAME} ${CLI_VERSION}: GateFlow simulation experiments

Usage:
  ${CLI_NAME} run --scenario <file> [options]   Run an experiment and write results.json + report.md
  ${CLI_NAME} validate --scenario <file>        Validate a scenario file
  ${CLI_NAME} policies                          List the available policy presets
  ${CLI_NAME} --help | --version

Options for "run":
  --scenario <file>              Scenario file (YAML or JSON)            (required)
  --seeds <spec>                 Seeds, e.g. 1-200 or 1-10,42            (default 1-200)
  --policies <ids>               Comma-separated policy presets          (default fifo,priority-v0)
  --baseline <id>                Baseline policy for paired comparisons  (default: first policy)
  --out <dir>                    Output directory                        (default out/<scenario id>)
  --bootstrap-resamples <n>      Bootstrap resamples for intervals       (default ${DEFAULT_BOOTSTRAP.resamples})
  --commit <rev>                 Source revision recorded in the manifest (default: detected)
  --quiet                        Do not print progress

All results are SIMULATED on the assumptions of the scenario and are not operational evidence.
`;

function loadScenario(io: CliIo, file: string): Scenario {
  let text: string;
  try {
    text = io.readFile(file);
  } catch (error) {
    throw new UsageError(
      `cannot read scenario file ${file}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  return parseScenarioText(text, file.toLowerCase().endsWith('.json') ? 'json' : 'yaml');
}

function scenarioHash(io: CliIo, scenario: Scenario): string {
  return `sha256:${io.sha256(canonicalJson(scenario))}`;
}

/** Classification for on-arrival risk classes: the first non-FIFO policy, else priority-v0's. */
function classificationFor(policies: readonly Policy[]): ClassificationParams {
  for (const policy of policies) {
    const classification = classificationOf(policy);
    if (classification !== null) return classification;
  }
  const fallback = classificationOf(PRIORITY_V0_POLICY);
  if (fallback === null) throw new Error('priority-v0 must define classification parameters');
  return fallback;
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
  for (const [id, comparison] of Object.entries(doc.summary.comparisons)) {
    const { net, saved, harmed } = comparison.metrics;
    lines.push(
      `${id} vs ${doc.manifest.baselinePolicyId}: net flights saved per day ${net.mean.toFixed(1)} ` +
        `[${net.ciLower.toFixed(1)}, ${net.ciUpper.toFixed(1)}] (saved ${saved.mean.toFixed(1)}, lost ${harmed.mean.toFixed(1)})`,
    );
  }
  return lines;
}

function commandRun(argv: string[], io: CliIo): number {
  const { values } = parseArgs({
    args: argv,
    options: {
      scenario: { type: 'string' },
      seeds: { type: 'string', default: '1-200' },
      policies: { type: 'string', default: 'fifo,priority-v0' },
      baseline: { type: 'string' },
      out: { type: 'string' },
      'bootstrap-resamples': { type: 'string', default: String(DEFAULT_BOOTSTRAP.resamples) },
      commit: { type: 'string' },
      quiet: { type: 'boolean', default: false },
    },
    strict: true,
    allowPositionals: false,
  });
  if (values.scenario === undefined) throw new UsageError('--scenario is required');
  const seeds = parseSeeds(values.seeds);
  const policies = parsePolicies(values.policies);
  const baselinePolicyId = values.baseline ?? (policies[0] as Policy).id;
  if (!policies.some((p) => p.id === baselinePolicyId)) {
    throw new UsageError(`baseline "${baselinePolicyId}" must be one of --policies`);
  }
  const resamples = parsePositiveInteger(values['bootstrap-resamples'], '--bootstrap-resamples');

  const scenario = loadScenario(io, values.scenario);
  const hash = scenarioHash(io, scenario);
  const commit = values.commit ?? io.commit();
  const outDir = values.out ?? join('out', scenario.id);

  const progressEvery = Math.max(1, Math.ceil(seeds.length / 4));
  const experiment = runExperiment(
    {
      scenario,
      seeds,
      policies,
      baselinePolicyId,
      classification: classificationFor(policies),
      bootstrap: { ...DEFAULT_BOOTSTRAP, resamples },
    },
    (done, total) => {
      if (!values.quiet && (done % progressEvery === 0 || done === total)) {
        io.stderr(`simulated ${done}/${total} days\n`);
      }
    },
  );
  const doc = buildResults(experiment, {
    generator: { name: CLI_NAME, version: CLI_VERSION },
    commit,
    scenarioHash: hash,
  });

  io.mkdir(outDir);
  const resultsPath = join(outDir, 'results.json');
  const reportPath = join(outDir, 'report.md');
  io.writeFile(resultsPath, stringifyResults(doc));
  io.writeFile(reportPath, renderReport(doc));

  io.stdout(
    [
      'GateFlow simulation: SIMULATED RESULTS, not operational evidence',
      ...summaryLines(doc),
      '',
      `written    ${resultsPath}`,
      `           ${reportPath}`,
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
  io.stdout(
    [
      `valid scenario ${scenario.id}: ${scenario.title}`,
      `hash           ${scenarioHash(io, scenario)}`,
      `data           ${scenario.dataClassification}`,
      `flights        ${generateSchedule(scenario).length} on the design day`,
      `assumptions    ${collectAssumptions(scenario).length} labelled parameters`,
      '',
    ].join('\n'),
  );
  return EXIT_OK;
}

function commandPolicies(io: CliIo): number {
  io.stdout(`${JSON.stringify(POLICY_PRESETS, null, 2)}\n`);
  return EXIT_OK;
}

/** Runs the CLI and returns the process exit code. Never throws. */
export function runCli(argv: readonly string[], io: CliIo): number {
  const [command, ...rest] = argv;
  try {
    switch (command) {
      case 'run':
        return commandRun(rest, io);
      case 'validate':
        return commandValidate(rest, io);
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
