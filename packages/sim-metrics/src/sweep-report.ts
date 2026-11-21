import type { Policy } from '@gateflow/queue-core';
import type { ComparisonMetricSummary } from './results';
import type { SweepParameter } from './sweep';
import type { SweepDimensionSummary, SweepDocument } from './sweep-results';
import { sweepValueLabel } from './sweep-results';

/** How each sweep parameter is named in reports. */
export const SWEEP_PARAMETER_LABELS: Readonly<Record<SweepParameter, string>> = {
  maxOvertakes: 'Overtake bound K (people)',
  capMaxPriorityCalls: 'Priority people allowed among N called (k)',
  capWindowCalls: 'Cap window N (people called)',
  hysteresisMinutes: 'Hysteresis h (min)',
  maxDeadlineAgeMinutes: 'Maximum data age (min)',
  prepareWindowSize: 'Prepare window M (tickets)',
  callAheadSeconds: 'Call-ahead of the virtual queue (s)',
  responseEstimateSeconds: "Engine's estimate of the call response (s)",
  lanesDelta: 'Lanes added to every period of the schedule',
  loadFactorScale: 'Load factor (multiple of the base)',
  showUpShiftMinutes: 'Arrival shift (min; positive = earlier)',
  callResponseMedianSeconds: 'Median call response (s)',
  absentProbability: 'Share of passengers missing the first call',
  flightDelayShare: 'Share of delayed flights',
  laneOutagesPerDay: 'Lane outages per day',
  feedOutagesPerDay: 'Feed outages per day',
  feedOutageMedianMinutes: 'Median length of a feed outage (min)',
};

function num(value: number, digits = 1): string {
  const fixed = value.toFixed(digits);
  return fixed === `-${(0).toFixed(digits)}` ? (0).toFixed(digits) : fixed;
}

function pct(share: number, digits = 2): string {
  return `${num(share * 100, digits)}%`;
}

function withCi(m: ComparisonMetricSummary, digits = 1): string {
  return `${num(m.mean, digits)} [${num(m.ciLower, digits)}, ${num(m.ciUpper, digits)}]`;
}

function cell(text: string): string {
  return text.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

/** The comparison used to report the cost to other passengers: the candidate on the same queue. */
export function harmComparisonKey(doc: SweepDocument): string | undefined {
  const { candidateId, comparisons, policies } = doc.manifest;
  const candidate = policies.find((p) => p.id === candidateId);
  const sameQueue = comparisons.find((c) => {
    if (c.candidateId !== candidateId) return false;
    const reference = policies.find((p) => p.id === c.referenceId);
    return (
      reference?.selection.kind === 'fifo' &&
      reference.queue.kind === 'virtual' &&
      candidate?.queue.kind === 'virtual'
    );
  });
  return sameQueue === undefined
    ? undefined
    : `${sameQueue.candidateId} vs ${sameQueue.referenceId}`;
}

function dimensionTable(doc: SweepDocument, dimension: SweepDimensionSummary): string[] {
  const { policies, comparisons, candidateId } = doc.manifest;
  const own = comparisons.filter((c) => c.candidateId === candidateId);
  const harm = harmComparisonKey(doc);
  const header = [
    SWEEP_PARAMETER_LABELS[dimension.parameter],
    ...policies.map((p) => `Missed: \`${p.id}\``),
    ...own.map((c) => `Net saved vs \`${c.referenceId}\``),
    ...(harm === undefined ? [] : ['Others delayed > 5 min']),
    'Most overtakes',
  ];
  const lines = [
    `| ${header.join(' | ')} |`,
    `|${header.map((_, i) => (i === 0 ? '---' : '---:')).join('|')}|`,
  ];
  for (const point of dimension.points) {
    const label = point.isBase ? `**${point.label} (base)**` : point.label;
    const candidate = point.policies[candidateId];
    const row = [
      label,
      ...policies.map((p) => num(point.policies[p.id]?.missed.mean ?? 0)),
      ...own.map((c) => {
        const summary = point.comparisons[`${c.candidateId} vs ${c.referenceId}`];
        return summary === undefined ? '-' : withCi(summary.metrics.net);
      }),
      ...(harm === undefined
        ? []
        : [pct(point.comparisons[harm]?.metrics.nonPriorityDelayedOver5MinShare.mean ?? 0)]),
      num(candidate?.maxOvertakes.max ?? 0, 0),
    ];
    lines.push(`| ${row.map(cell).join(' | ')} |`);
  }
  return lines;
}

function policyLabel(policy: Policy): string {
  return `${policy.title}: \`${policy.id}\` ${policy.version}`;
}

/** Renders the Markdown report of a sweep. Deterministic: same document, same text. */
export function renderSweepReport(doc: SweepDocument): string {
  const { manifest } = doc;
  const confidence = pct(manifest.statistics.confidenceLevel, 0);
  const lines: string[] = [];
  const push = (...text: string[]) => lines.push(...text);
  push(
    `# GateFlow sensitivity sweep: ${manifest.sweep.title}`,
    '',
    `> **${doc.disclaimer}**`,
    '',
    manifest.sweep.description,
    '',
    `Base scenario \`${manifest.scenario.id}\` (data: ${manifest.scenario.dataClassification}). ` +
      `Every point is ${manifest.seeds.count} simulated days (seeds ${manifest.seeds.ranges}); ` +
      `the parameters vary for \`${manifest.candidateId}\`. Each table varies one parameter and ` +
      'keeps everything else at the base, marked **(base)**. Means per day; brackets give the ' +
      `${confidence} confidence interval of the mean (bootstrap over days). "Others delayed > ` +
      '5 min" is the share of non-prioritised passengers who wait more than 5 minutes longer ' +
      'than with the same queue in FIFO order; "most overtakes" is the largest number of people ' +
      'who overtook one ticket, on the worst day.',
    '',
  );
  let section = 1;
  for (const dimension of doc.dimensions) {
    push(`## ${section}. ${dimension.title}`, '');
    if (dimension.base.length > 0) {
      const settings = dimension.base
        .map(
          (s) =>
            `${SWEEP_PARAMETER_LABELS[s.parameter]} = ${sweepValueLabel(s.parameter, s.value)}`,
        )
        .join('; ');
      push(`On this curve only: ${settings}.`, '');
    }
    push(...dimensionTable(doc, dimension), '');
    section++;
  }

  push(
    `## ${section}. Method`,
    '',
    '- One-at-a-time sensitivity: each curve varies one parameter around the base, all else equal.',
    '- At every point all policies run on the same passengers (common random numbers), and the same seeds are used at every point, so the differences between points are not noise of different days.',
    '- Points that only change a policy share their simulated days, and the policies they do not change are simulated once.',
    '- Policy parameters change the candidate; the prepare window changes every virtual queue, so that the comparison with the same queue in FIFO order stays valid. Scenario parameters change the simulated days for every policy.',
    `- Confidence intervals: percentile bootstrap of the mean over days (${manifest.statistics.bootstrapResamples} resamples, seed ${manifest.statistics.bootstrapSeed}). Quantiles: ${manifest.statistics.quantileMethod}.`,
    '',
  );
  section++;

  push(`## ${section}. Policies at the base`, '');
  section++;
  for (const policy of manifest.policies) push(`- ${policyLabel(policy)}`);
  push('', 'Full parameters are in the `manifest` of `sweep.json`.', '');

  push(
    `## ${section}. Assumptions of the base scenario`,
    '',
    '| Parameter | Source | Note |',
    '|---|---|---|',
  );
  section++;
  for (const a of doc.assumptions) push(`| ${a.path} | ${a.source} | ${cell(a.note ?? '')} |`);
  push('');

  push(`## ${section}. Limitations of this model version`, '');
  section++;
  for (const limitation of doc.modelLimitations) push(`- ${limitation}`);
  push('');

  const v = manifest.versions;
  push(
    `## ${section}. Reproducibility`,
    '',
    '| Item | Value |',
    '|---|---|',
    `| Sweep specification hash | \`${manifest.sweep.hash}\` |`,
    `| Base scenario hash | \`${manifest.scenario.hash}\` |`,
    `| Seeds | ${manifest.seeds.ranges} (${manifest.seeds.count}) |`,
    `| Distinct simulated days | ${manifest.simulatedDays} |`,
    `| Source revision | \`${manifest.commit}\` |`,
    `| Versions | engine ${v.engine}, queue core ${v.queueCore}, model ${v.model}, kernel ${v.kernel}, population generator ${v.populationGenerator}, scenario schema ${v.scenarioSchema} |`,
    `| Generated by | ${manifest.generator.name} ${manifest.generator.version} |`,
    '',
    'Command:',
    '',
    '```bash',
    manifest.reproduce,
    '```',
    '',
  );
  return lines.join('\n');
}
