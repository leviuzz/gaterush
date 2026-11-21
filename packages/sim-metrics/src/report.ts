import type { Policy } from '@gateflow/priority-engine';
import type { ComparisonMetricSummary, ResultsDocument } from './results';
import type { AcrossDays } from './stats';

function num(value: number, digits = 1): string {
  const fixed = value.toFixed(digits);
  return fixed === `-${(0).toFixed(digits)}` ? (0).toFixed(digits) : fixed;
}

function pct(share: number, digits = 1): string {
  return `${num(share * 100, digits)}%`;
}

function withRange(a: AcrossDays, digits = 1): string {
  return `${num(a.mean, digits)} (P5-P95 ${num(a.p05, digits)}-${num(a.p95, digits)})`;
}

function withCi(m: ComparisonMetricSummary, digits = 1): string {
  return `${num(m.mean, digits)} [${num(m.ciLower, digits)}, ${num(m.ciUpper, digits)}]`;
}

function cell(text: string): string {
  return text.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

/** Compact, human-readable rendering of a parameter value (objects and arrays included). */
function formatValue(value: unknown): string {
  if (Array.isArray(value)) return value.map(formatValue).join('; ');
  if (typeof value === 'object' && value !== null) {
    return Object.entries(value)
      .map(([k, v]) => `${k} ${formatValue(v)}`)
      .join(', ');
  }
  if (typeof value === 'string') return value;
  return JSON.stringify(value);
}

function formatPolicyParam(key: string, value: unknown): string {
  if (key.endsWith('Ms') && typeof value === 'number') return `${num(value / 60_000, 1)} min`;
  return formatValue(value);
}

function policyLabel(policy: Policy): string {
  return `${policy.title}: \`${policy.id}\` ${policy.version}`;
}

/** Renders the Markdown report of a results document. Deterministic: same document, same text. */
export function renderReport(doc: ResultsDocument): string {
  const { manifest, summary } = doc;
  const baseline = manifest.policies.find((p) => p.id === manifest.baselinePolicyId);
  if (baseline === undefined) throw new RangeError('baseline policy missing from the manifest');
  const candidates = manifest.policies.filter((p) => p.id !== baseline.id);
  const policyMetrics = (id: string) => {
    const m = summary.policies[id];
    if (m === undefined) throw new RangeError(`missing summary for ${id}`);
    return m;
  };
  const comparison = (id: string) => {
    const c = summary.comparisons[id];
    if (c === undefined) throw new RangeError(`missing comparison for ${id}`);
    return c;
  };
  const confidence = pct(manifest.statistics.confidenceLevel, 0);
  const lines: string[] = [];
  const push = (...text: string[]) => lines.push(...text);

  push(
    `# GateFlow simulation report: ${manifest.scenario.title}`,
    '',
    `> **${doc.disclaimer}**`,
    '',
    `Scenario \`${manifest.scenario.id}\` (data: ${manifest.scenario.dataClassification}), ` +
      `${summary.days} simulated days, about ${num(summary.passengersPerDay.mean, 0)} passengers per day. ` +
      `Baseline policy: \`${baseline.id}\`.`,
    '',
  );

  push('## 1. Headline', '');
  push(
    'Means per simulated day. P5-P95 is the spread across days; brackets give the ' +
      `${confidence} confidence interval of the mean (bootstrap over days).`,
    '',
  );
  const header = [
    'Policy',
    'Missed flights per day',
    'of which connecting',
    'Missed per 1,000 passengers',
  ];
  push(
    `| ${header.join(' | ')} |`,
    `|${header.map((_, i) => (i === 0 ? '---' : '---:')).join('|')}|`,
  );
  for (const policy of manifest.policies) {
    const m = policyMetrics(policy.id);
    push(
      `| ${cell(policyLabel(policy))} | ${withRange(m.missed)} | ${num(m.missedTransfer.mean)} | ${num(m.missedPer1000.mean, 2)} |`,
    );
  }
  push('');
  for (const candidate of candidates) {
    const c = comparison(candidate.id);
    push(
      `| \`${candidate.id}\` compared with \`${baseline.id}\` | Mean per day [${confidence} CI] |`,
      '|---|---:|',
      `| Flights saved: missed with \`${baseline.id}\`, caught with \`${candidate.id}\` | ${withCi(c.metrics.saved)} |`,
      `| Flights lost: caught with \`${baseline.id}\`, missed with \`${candidate.id}\` | ${withCi(c.metrics.harmed)} |`,
      `| **Net flights saved** | **${withCi(c.metrics.net)}** |`,
      `| Days with a net gain / with a net loss | ${pct(c.shareDaysNetPositive)} / ${pct(c.shareDaysNetNegative)} |`,
      `| At-risk passengers reaching the gate in time (${num(c.metrics.atRiskCohort.mean)} per day classified URGENT on arrival under \`${baseline.id}\`) | ${pct(c.atRiskReachedShareBaseline)} with \`${baseline.id}\`, ${pct(c.atRiskReachedShareCandidate)} with \`${candidate.id}\` |`,
      '',
    );
  }

  push('## 2. Waiting times', '');
  push(
    'Minutes from ticket to call. Each column is the mean over days of the daily statistic; ' +
      'the last column is the longest single wait over all simulated days.',
    '',
    '| Policy | Mean | P50 | P90 | P99 | Longest |',
    '|---|---:|---:|---:|---:|---:|',
  );
  for (const policy of manifest.policies) {
    const m = policyMetrics(policy.id);
    push(
      `| \`${policy.id}\` | ${num(m.waitMeanMin.mean)} | ${num(m.waitP50Min.mean)} | ${num(m.waitP90Min.mean)} | ${num(m.waitP99Min.mean)} | ${num(m.waitMaxMin.max)} |`,
    );
  }
  push('');

  for (const candidate of candidates) {
    const c = comparison(candidate.id);
    const m = policyMetrics(candidate.id);
    const k =
      candidate.params.kind === 'constrained-edf' ? String(candidate.params.maxOvertakes) : 'n/a';
    push(
      `## 3. Cost for passengers not prioritised by \`${candidate.id}\``,
      '',
      'Extra wait = wait with the candidate minus wait with the baseline, for the same passenger.',
      '',
      `| Metric | Value [${confidence} CI] |`,
      '|---|---:|',
      `| Passengers prioritised per day | ${withRange(m.prioritized)} (${pct(m.priorityCallShare.mean, 2)} of calls) |`,
      `| Mean extra wait of non-prioritised passengers (min) | ${withCi(c.metrics.nonPriorityExtraWaitMeanMin, 2)} |`,
      `| P90 extra wait of non-prioritised passengers (min) | ${withCi(c.metrics.nonPriorityExtraWaitP90Min, 2)} |`,
      `| Largest extra wait of any non-prioritised passenger, worst day (min) | ${num(c.metrics.nonPriorityExtraWaitMaxMin.max)} |`,
      `| Share of non-prioritised passengers delayed by more than 5 min | ${pct(c.metrics.nonPriorityDelayedOver5MinShare.mean, 2)} |`,
      `| Most overtakes suffered by one passenger, worst day (bound K = ${k}) | ${num(m.maxOvertakes.max, 0)} |`,
      `| Calls where the cap blocked a priority call, per day | ${num(m.capReachedCalls.mean)} |`,
      `| Calls where the overtake guard took precedence (a passenger had reached K overtakes), per day | ${num(m.overtakeGuardCalls.mean)} |`,
      '',
    );
  }

  push(
    '## 4. Checkpoint operations',
    '',
    '| Policy | Lane utilisation | Mean queue (people) | Longest queue | URGENT on arrival per day | CRITICAL on arrival per day |',
    '|---|---:|---:|---:|---:|---:|',
  );
  for (const policy of manifest.policies) {
    const m = policyMetrics(policy.id);
    push(
      `| \`${policy.id}\` | ${pct(m.laneUtilization.mean)} | ${num(m.meanQueueLength.mean)} | ${num(m.maxQueueLength.max, 0)} | ${num(m.urgentOnArrival.mean)} | ${num(m.criticalOnArrival.mean)} |`,
    );
  }
  push('');

  push(
    '## 5. Method',
    '',
    '- Each seed is one simulated day of the same design day (same flights), with different passengers.',
    '- All policies are run on exactly the same passengers (common random numbers), so the comparison is paired passenger by passenger: a flight is *saved* when the passenger misses it with the baseline and catches it with the candidate, and *lost* in the opposite case.',
    '- A passenger misses the flight when they reach the gate after boarding closes (ground truth).',
    `- Confidence intervals: percentile bootstrap of the mean over days (${manifest.statistics.bootstrapResamples} resamples, seed ${manifest.statistics.bootstrapSeed}). Quantiles: ${manifest.statistics.quantileMethod}.`,
    '- Risk classes are computed on arrival with the same parameters for every policy. URGENT means "would miss the flight if served in FIFO order, but can still make it if called now"; CRITICAL means "cannot make it even if called now": such passengers are escalated to staff and never boosted automatically.',
    '',
  );

  push('## 6. Policies', '');
  for (const policy of manifest.policies) {
    push(`### ${policyLabel(policy)}`, '');
    const entries = Object.entries(policy.params).filter(([key]) => key !== 'kind');
    push(`Strategy: \`${policy.params.kind}\`.`, '');
    if (entries.length > 0) {
      push('| Parameter | Value |', '|---|---|');
      for (const [key, value] of entries)
        push(`| ${key} | ${cell(formatPolicyParam(key, value))} |`);
      push(
        '',
        'All parameter values are initial hypotheses to be calibrated and approved, not measured optima.',
        '',
      );
    }
  }

  push(
    '## 7. Assumptions',
    '',
    'Every model parameter, with its source. SYNTHETIC values are illustrative assumptions.',
    '',
    '| Parameter | Value | Source | Note |',
    '|---|---|---|---|',
  );
  for (const a of doc.assumptions) {
    push(`| ${a.path} | ${cell(formatValue(a.value))} | ${a.source} | ${cell(a.note ?? '')} |`);
  }
  push('');

  push('## 8. Limitations of this model version', '');
  for (const limitation of doc.modelLimitations) push(`- ${limitation}`);
  push('');

  push(
    '## 9. Reproducibility',
    '',
    '| Item | Value |',
    '|---|---|',
    `| Scenario hash | \`${manifest.scenario.hash}\` |`,
    `| Seeds | ${manifest.seeds.ranges} (${manifest.seeds.count}) |`,
    `| Source revision | \`${manifest.commit}\` |`,
    `| Versions | engine ${manifest.versions.engine}, model ${manifest.versions.model}, kernel ${manifest.versions.kernel}, population generator ${manifest.versions.populationGenerator}, scenario schema ${manifest.versions.scenarioSchema} |`,
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
