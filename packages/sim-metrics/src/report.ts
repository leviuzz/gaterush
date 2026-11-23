import type { Policy } from '@gateflow/queue-core';
import { differencesFromPreset } from './policy-settings';
import { renderDataSources, sourceLabel } from './provenance';
import type { ComparisonMetricSummary, ComparisonSummary, ResultsDocument } from './results';
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
  if (value === null) return 'none';
  if (Array.isArray(value)) return value.map(formatValue).join('; ');
  if (typeof value === 'object') {
    return Object.entries(value)
      .map(([k, v]) => `${k} ${formatValue(v)}`)
      .join(', ');
  }
  if (typeof value === 'string') return value;
  return JSON.stringify(value);
}

function formatPolicyParam(key: string, value: unknown): string {
  if (key.endsWith('Ms') && typeof value === 'number') return `${num(value / 60_000, 1)} min`;
  if (key.endsWith('Seconds') && typeof value === 'number') return `${num(value, 0)} s`;
  return formatValue(value);
}

function policyLabel(policy: Policy): string {
  return `${policy.title}: \`${policy.id}\` ${policy.version}`;
}

/** True when two policies differ only in how they manage lanes (same selection and queue). */
function differOnlyInLanes(a: Policy, b: Policy): boolean {
  return (
    JSON.stringify(a.selection) === JSON.stringify(b.selection) &&
    JSON.stringify(a.queue) === JSON.stringify(b.queue)
  );
}

function minutesOf(ms: number): string {
  return num(ms / 60_000, 0);
}

/** How a policy manages lanes, in a few words. */
function laneRule(policy: Policy): string {
  const lanes = policy.lanes;
  if (lanes === undefined) return 'plan only';
  if (lanes.kind === 'reactive') {
    return `supervisor: opens when the queue shows more than ${minutesOf(lanes.openWhenWaitMs)} min, closes below ${minutesOf(lanes.closeWhenWaitMs)} min`;
  }
  if (lanes.kind === 'advise') {
    const rule = `GateFlow's console: keeps the median wait forecast below ${minutesOf(lanes.targetWaitMs)} min over the next ${minutesOf(lanes.horizonMs)} min, closes a lane beyond the plan below ${minutesOf(lanes.closeWhenWaitMs)} min, ${minutesOf(lanes.cooldownMs)} min between recommendations`;
    const measured = lanes.measuredThroughput;
    if (measured === undefined) return rule;
    // The lanes' throughput measured from the day (S22.5).
    return `${rule}; reads the lanes' throughput measured over the last ${String(measured.windowMinutes)} min (the minutes with at least ${String(measured.busyPeoplePerLane)} people per open lane not yet admitted, once ${String(measured.minBusyMinutes)} of them and ${String(measured.minPeople)} people; else the settings')`;
  }
  return `GateFlow: keeps the projected wait below ${minutesOf(lanes.targetWaitMs)} min over the next ${minutesOf(lanes.horizonMs)} min, closes below ${minutesOf(lanes.closeWhenWaitMs)} min`;
}

interface LaneStaffingAssumption {
  readonly maxExtraLanes: number;
  readonly openDelayMinutes: { readonly median: number; readonly sigma: number };
  readonly minOpenMinutes: number;
  readonly followShare: number;
}

const QUEUE_DESCRIPTIONS: Readonly<Record<Policy['queue']['kind'], string>> = {
  physical: 'physical queue: passengers stand in line and step forward when a lane is free',
  virtual:
    'GateFlow virtual queue: passengers wait anywhere, are called on displays and validate their ticket at the access point',
};

/** Renders the Markdown report of a results document. Deterministic: same document, same text. */
export function renderReport(doc: ResultsDocument): string {
  const { manifest, summary } = doc;
  const baseline = manifest.policies.find((p) => p.id === manifest.baselinePolicyId);
  if (baseline === undefined) throw new RangeError('baseline policy missing from the manifest');
  const policyMetrics = (id: string) => {
    const m = summary.policies[id];
    if (m === undefined) throw new RangeError(`missing summary for ${id}`);
    return m;
  };
  const policyById = (id: string): Policy => {
    const p = manifest.policies.find((candidate) => candidate.id === id);
    if (p === undefined) throw new RangeError(`unknown policy ${id}`);
    return p;
  };
  const comparisons: ComparisonSummary[] = Object.values(summary.comparisons);
  const virtualPolicies = manifest.policies.filter((p) => p.queue.kind === 'virtual');
  const confidence = pct(manifest.statistics.confidenceLevel, 0);
  const lines: string[] = [];
  const push = (...text: string[]) => lines.push(...text);

  push(
    `# GateFlow simulation report: ${manifest.scenario.title}`,
    '',
    `> **${doc.disclaimer}**`,
    '',
    `Scenario \`${manifest.scenario.id}\` (data: ${manifest.scenario.dataClassification}), ` +
      `${summary.days} simulated days, about ${num(summary.peoplePerDay.mean, 0)} passengers per day ` +
      `(${num(summary.partiesPerDay.mean, 0)} parties). ` +
      `Status quo (baseline): \`${baseline.id}\`.`,
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
  for (const c of comparisons) {
    const cand = `\`${c.candidateId}\``;
    const ref = `\`${c.referenceId}\``;
    push(
      `| ${cand} compared with ${ref} | Mean per day [${confidence} CI] |`,
      '|---|---:|',
      `| Flights saved: missed with ${ref}, caught with ${cand} | ${withCi(c.metrics.saved)} |`,
      `| Flights lost: caught with ${ref}, missed with ${cand} | ${withCi(c.metrics.harmed)} |`,
      `| **Net flights saved** | **${withCi(c.metrics.net)}** |`,
      `| Days with a net gain / with a net loss | ${pct(c.shareDaysNetPositive)} / ${pct(c.shareDaysNetNegative)} |`,
      `| At-risk passengers reaching the gate in time (${num(c.metrics.atRiskCohort.mean)} per day classified URGENT on arrival under ${ref}) | ${pct(c.atRiskReachedShareReference)} with ${ref}, ${pct(c.atRiskReachedShareCandidate)} with ${cand} |`,
      `| Change in mean time from arrival to screening (min) | ${withCi(c.metrics.waitMeanDeltaMin, 2)} |`,
      `| Change in mean time standing in a queue (min) | ${withCi(c.metrics.standingMeanDeltaMin, 2)} |`,
      '',
    );
  }

  push('## 2. Waiting times', '');
  push(
    '*Time to screening*: minutes from arrival at the checkpoint (when the ticket is issued) to the ' +
      'start of screening. *Standing*: minutes spent standing in a queue: the whole wait in a ' +
      'physical queue; in a virtual queue only the wait at the lanes after validating the ticket. ' +
      'Each column is the mean over days of the daily statistic; "longest" is the longest single ' +
      'value over all simulated days.',
    '',
    '| Policy | Time to screening: mean | P50 | P90 | P99 | Longest | Standing: mean | P90 | Longest |',
    '|---|---:|---:|---:|---:|---:|---:|---:|---:|',
  );
  for (const policy of manifest.policies) {
    const m = policyMetrics(policy.id);
    push(
      `| \`${policy.id}\` | ${num(m.waitMeanMin.mean)} | ${num(m.waitP50Min.mean)} | ${num(m.waitP90Min.mean)} | ${num(m.waitP99Min.mean)} | ${num(m.waitMaxMin.max)} | ${num(m.standingMeanMin.mean)} | ${num(m.standingP90Min.mean)} | ${num(m.standingMaxMin.max)} |`,
    );
  }
  push('');

  const fairnessTarget = doc.assumptions.find((a) => a.path === 'fairnessTarget')?.value as
    { readonly maxShareDelayedOver5Min: number } | undefined;
  let section = 3;
  for (const c of comparisons) {
    const candidate = policyById(c.candidateId);
    const selection = candidate.selection;
    if (selection.kind === 'fifo') continue;
    // Same calls, different lanes: nobody is prioritised by the change (see lane management).
    if (differOnlyInLanes(candidate, policyById(c.referenceId))) continue;
    const m = policyMetrics(candidate.id);
    const bound =
      selection.kind === 'constrained-edf'
        ? selection.fastTrack
          ? `bound K = ${selection.maxOvertakes}, passes in the window and at the lanes included`
          : `bound K = ${selection.maxOvertakes}`
        : 'no bound for staff flight calls';
    push(
      `## ${section}. Cost for passengers not prioritised by \`${candidate.id}\` (compared with \`${c.referenceId}\`)`,
      '',
      'Extra wait = time to screening with the candidate minus time to screening with the reference, for the same passenger.',
      '',
      `| Metric | Value [${confidence} CI] |`,
      '|---|---:|',
      `| Passengers prioritised per day | ${withRange(m.prioritized)} (${pct(m.priorityCallShare.mean, 2)} of tickets called) |`,
      `| Mean extra wait of non-prioritised passengers (min) | ${withCi(c.metrics.nonPriorityExtraWaitMeanMin, 2)} |`,
      `| P90 extra wait of non-prioritised passengers (min) | ${withCi(c.metrics.nonPriorityExtraWaitP90Min, 2)} |`,
      `| Largest extra wait of any non-prioritised passenger, worst day (min) | ${num(c.metrics.nonPriorityExtraWaitMaxMin.max)} |`,
      `| Share of non-prioritised passengers delayed by more than 5 min | ${pct(c.metrics.nonPriorityDelayedOver5MinShare.mean, 2)} |`,
      `| Most people who overtook one ticket, worst day (${bound}) | ${num(m.maxOvertakes.max, 0)} |`,
    );
    const reference = policyById(c.referenceId);
    if (
      fairnessTarget !== undefined &&
      selection.kind === 'constrained-edf' &&
      reference.selection.kind === 'fifo' &&
      reference.queue.kind === candidate.queue.kind
    ) {
      const share = c.metrics.nonPriorityDelayedOver5MinShare.mean;
      const met = share <= fairnessTarget.maxShareDelayedOver5Min;
      push(
        `| Fairness target of this checkpoint: at most ${pct(fairnessTarget.maxShareDelayedOver5Min, 2)} delayed by more than 5 min | ${met ? 'met' : '**not met**'} (${pct(share, 2)}) |`,
      );
    }
    if (selection.kind === 'constrained-edf') {
      push(
        `| Calls where the cap blocked a priority call, per day | ${num(m.capReachedCalls.mean)} |`,
        `| Calls where the overtake guard took precedence (a ticket had reached K overtakes), per day | ${num(m.overtakeGuardCalls.mean)} |`,
      );
      if (selection.fastTrack) {
        push(
          `| People through the fast track per day | ${num(m.fastTrackPeople.mean)} |`,
          `| People passed at the lanes by fast-tracked parties per day | ${num(m.lanePassedPeople.mean)} |`,
        );
      }
    }
    push('');
    section++;
  }

  push(`## ${section}. Call mechanics`, '');
  section++;
  if (virtualPolicies.length === 0) {
    push('No virtual-queue policy was simulated: nobody is called in a physical queue.', '');
  } else {
    push(
      'Virtual queues only. A *second call* is made when the passenger has not presented within ' +
        'the call timeout; a *no-show* (missed call) is a ticket not validated after the second ' +
        'timeout. A no-show who rescans within the reactivation window is *reactivated*; later, ' +
        'the passenger needs a *new ticket*. *Idle lane time* counts open lanes with nobody to ' +
        'screen while passengers were waiting for or answering a call, as a share of the staffed ' +
        'lane time. Means per day.',
      '',
      '| Policy | Calls | Second calls (share of calls) | No-shows (missed-call rate) | Reactivations | New tickets | Idle lane time (min, share) |',
      '|---|---:|---:|---:|---:|---:|---:|',
    );
    for (const policy of virtualPolicies) {
      const m = policyMetrics(policy.id);
      push(
        `| \`${policy.id}\` | ${num(m.calls.mean, 0)} | ${num(m.recalls.mean)} (${pct(m.recallShare.mean, 2)}) | ${num(m.noShows.mean)} (${pct(m.noShowShare.mean, 2)}) | ${num(m.reactivations.mean)} | ${num(m.reissuedTickets.mean)} | ${num(m.idleLaneWithDemandMin.mean)} (${pct(m.idleLaneWithDemandShare.mean, 2)}) |`,
      );
    }
    push('');
  }

  push(`## ${section}. Disruptions, data quality and stability`, '');
  section++;
  const d = summary.disruptions;
  const disrupted =
    d.delayedFlights.max + d.gateChanges.max + d.laneOutages.max + d.feedOutages.max > 0;
  if (disrupted) {
    push(
      'Disruptions of the simulated days (ground truth, the same for every policy), means per day. The system learns of a delay or a gate change only when the flight feed announces it; messages sent while the feed is down arrive when it recovers.',
      '',
      '| Disruption | Per day |',
      '|---|---:|',
      `| Delayed flights (mean delay of a delayed flight, min) | ${num(d.delayedFlights.mean)} (${num(d.delayMeanMin.mean)}) |`,
      `| Gate changes | ${num(d.gateChanges.mean)} |`,
      `| Lane outages (lane-minutes out of service) | ${num(d.laneOutages.mean)} (${num(d.laneOutageLaneMin.mean)}) |`,
      `| Feed outages (minutes without the feed) | ${num(d.feedOutages.mean)} (${num(d.feedOutageMin.mean)}) |`,
      `| Feed messages (sent while the feed was down) | ${num(d.feedMessages.mean)} (${num(d.heldFeedMessages.mean)}) |`,
      '',
    );
  } else {
    push('No delays, gate changes, lane outages or feed outages in this scenario.', '');
  }
  push(
    "*Class changes* count the changes of risk class of waiting tickets under each policy's own " +
      'classification. A *reversal* is a change in the direction opposite to the previous one, ' +
      'e.g. ATTENTION to URGENT and back: the flapping that hysteresis prevents. *Boosts on wrong ' +
      "information*: people prioritised while the system's knowledge of their flight differed " +
      'from the truth (a delay or a gate change not yet known). Means per day.',
    '',
    '| Policy | Missed among passengers of delayed or re-gated flights | Boosts on wrong information (people) | Class changes per 100 parties | Reversals | People whose class flapped |',
    '|---|---:|---:|---:|---:|---:|',
  );
  for (const policy of manifest.policies) {
    const m = policyMetrics(policy.id);
    const classifies = policy.selection.kind === 'constrained-edf';
    const perHundred = m.parties.mean === 0 ? 0 : (100 * m.classChanges.mean) / m.parties.mean;
    const stability = classifies
      ? `${num(perHundred, 2)} | ${num(m.classReversals.mean)} | ${num(m.flappingPeople.mean)}`
      : 'not classified | - | -';
    const affected = disrupted
      ? `${num(m.disruptedMissed.mean)} of ${num(m.disruptedPeople.mean, 0)}`
      : '-';
    push(
      `| \`${policy.id}\` | ${affected} | ${num(m.misinformedPriorityPeople.mean)} | ${stability} |`,
    );
  }
  push('');

  push(
    `## ${section}. Groups, assisted passengers and late arrivals`,
    '',
    'Means per day. A group (two people or more) holds one ticket and counts as its people in every other table, in the priority cap and in the overtake bound. Assisted passengers are taken to the next free lane under every policy.',
    '',
    '| Policy | Groups (people in groups) | Groups prioritised | Assisted passengers: people, mean time to screening (min), missed | Late on purpose: people, prioritised, missed |',
    '|---|---:|---:|---:|---:|',
  );
  section++;
  for (const policy of manifest.policies) {
    const m = policyMetrics(policy.id);
    const strategic =
      m.strategicPeople.mean === 0
        ? 'none in this scenario'
        : `${num(m.strategicPeople.mean)}, ${num(m.strategicPrioritized.mean)}, ${num(m.strategicMissed.mean)}`;
    push(
      `| \`${policy.id}\` | ${num(m.groups.mean)} (${num(m.peopleInGroups.mean)}) | ${num(m.groupsPrioritized.mean)} | ${num(m.assistedPeople.mean)}, ${num(m.assistedWaitMeanMin.mean, 2)}, ${num(m.assistedMissed.mean)} | ${strategic} |`,
    );
  }
  push('');

  push(
    `## ${section}. Checkpoint operations`,
    '',
    'Means per day; "longest" is the largest value over all simulated days.',
    '',
    '| Policy | Staffed lane-hours | Lane utilisation | Tickets waiting for a call: mean (longest) | People standing in a queue: mean (longest) | URGENT on arrival | CRITICAL on arrival |',
    '|---|---:|---:|---:|---:|---:|---:|',
  );
  section++;
  for (const policy of manifest.policies) {
    const m = policyMetrics(policy.id);
    push(
      `| \`${policy.id}\` | ${num(m.staffedLaneHours.mean)} | ${pct(m.laneUtilization.mean)} | ${num(m.meanQueueLength.mean)} (${num(m.maxQueueLength.max, 0)}) | ${num(m.meanStandingQueue.mean)} (${num(m.maxStandingQueue.max, 0)}) | ${num(m.urgentOnArrival.mean)} | ${num(m.criticalOnArrival.mean)} |`,
    );
  }
  push('');

  const managed = manifest.policies.filter((p) => p.lanes !== undefined);
  if (managed.length > 0) {
    const assumption = (path: string) => doc.assumptions.find((a) => a.path === path)?.value;
    const staffing = assumption('checkpoint.laneStaffing') as LaneStaffingAssumption | undefined;
    const lanesAvailable = assumption('checkpoint.lanesAvailable') as number | undefined;
    push(`## ${section}. Lane management`, '');
    section++;
    // The console's lanes (S22), on the checkpoint's settings or on the measured throughput (S22.5).
    const consoles = managed.filter((p) => p.lanes?.kind === 'advise');
    const measuring = consoles.filter(
      (p) => p.lanes?.kind === 'advise' && p.lanes.measuredThroughput !== undefined,
    );
    const asConsole =
      consoles.length === 0
        ? ''
        : measuring.length === 0
          ? ', as the console does (`@advise`, S22: its rule on the forecast of the next hour, from what the live system knows)'
          : measuring.length === consoles.length
            ? ", as the console does (`@advise-measured`, S22.5: its rule on the forecast of the next hour, from what the live system knows, with the lanes' throughput measured from the day)"
            : ", as the console does (`@advise`, S22: its rule on the forecast of the next hour, from what the live system knows; `@advise-measured`, S22.5, with the lanes' throughput measured from the day instead of the checkpoint's settings)";
    push(
      staffing === undefined
        ? 'The scenario has no staff on call (`checkpoint.laneStaffing`): no lane opens beyond the plan, whatever the policy.'
        : `Extra lanes open beyond the plan, never more than the ${lanesAvailable ?? 'planned'} lanes the checkpoint has, ` +
            `and at most ${staffing.maxExtraLanes} at the same time (the staff on call). A decision takes a median of ` +
            `${num(staffing.openDelayMinutes.median, 0)} min to put a lane into service (varying from day to day), and an extra lane ` +
            `stays open at least ${num(staffing.minOpenMinutes, 0)} min. The supervisor of today's practice (\`@reactive\`) ` +
            'decides on the wait the queue shows; GateFlow (`@predict`) projects the queue from the forecast of arrivals ' +
            'and recommends lanes' +
            asConsole +
            `, and the duty manager follows ${pct(staffing.followShare, 0)} of its recommendations. ` +
            'Means per day; "most" is the largest value over all simulated days.',
      '',
      '| Policy | Rule | Staffed lane-hours | of which extra | Extra lanes opened (closed) | Decisions (followed) | Most lanes open |',
      '|---|---|---:|---:|---:|---:|---:|',
    );
    for (const policy of manifest.policies) {
      const m = policyMetrics(policy.id);
      const decisions =
        policy.lanes === undefined
          ? '-'
          : `${num(m.laneDecisions.mean)} (${num(m.laneDecisionsFollowed.mean)})`;
      const opened =
        policy.lanes === undefined
          ? '-'
          : `${num(m.lanesOpened.mean)} (${num(m.lanesClosed.mean)})`;
      push(
        `| \`${policy.id}\` | ${cell(laneRule(policy))} | ${num(m.staffedLaneHours.mean)} | ${num(m.extraLaneHours.mean)} | ${opened} | ${decisions} | ${num(m.maxOpenLanes.max, 0)} |`,
      );
    }
    push('');
    const laneComparisons = comparisons.filter((c) =>
      differOnlyInLanes(policyById(c.candidateId), policyById(c.referenceId)),
    );
    if (laneComparisons.length > 0) {
      push(
        `What the extra lanes buy: each policy compared with the same calls under another lane rule, passenger by passenger. Means per day [${confidence} CI]; the last two columns divide totals over all days by the extra lane-hours (shown when the candidate only adds lane-hours).`,
        '',
        '| Comparison | Extra lane-hours | Net flights saved | Change in mean time to screening (min) | Waiting saved per extra lane-hour (person-hours) | Net flights saved per extra lane-hour |',
        '|---|---:|---:|---:|---:|---:|',
      );
      for (const c of laneComparisons) {
        const per = c.perExtraLaneHour;
        const ratio = (r: { estimate: number; ciLower: number; ciUpper: number }, digits: number) =>
          `${num(r.estimate, digits)} [${num(r.ciLower, digits)}, ${num(r.ciUpper, digits)}]`;
        push(
          `| \`${c.candidateId}\` vs \`${c.referenceId}\` | ${withCi(c.metrics.extraLaneHoursDelta)} | ${withCi(c.metrics.net)} | ${withCi(c.metrics.waitMeanDeltaMin, 2)} | ${per === undefined ? '-' : ratio(per.waitSavedPersonHours, 1)} | ${per === undefined ? '-' : ratio(per.netMadeFlight, 2)} |`,
        );
      }
      push('');
    }
  }

  push(
    `## ${section}. Method`,
    '',
    '- Each seed is one simulated day of the same design day (same flights), with different passengers.',
    '- All policies are run on exactly the same passengers (common random numbers), so each comparison is paired passenger by passenger: a flight is *saved* when the passenger misses it with the reference and catches it with the candidate, and *lost* in the opposite case.',
    "- `fifo-manual` (A') adds today's manual handling to the physical queue: staff periodically call the flights closing soon and their passengers are taken first. Comparing GateFlow with A' estimates the benefit over today's real practice.",
    '- Passengers are counted as people: a party of three that misses its flight counts as three, in every table and comparison.',
    '- The status quo is a physical FIFO queue. GateFlow policies run a virtual queue: tickets are called so as to keep the free lanes plus a call-ahead buffer supplied; each passenger presents after their own response time (later when they miss the call), validates the ticket at the access point and queues briefly at the lanes. Comparing `virtual-fifo` with the status quo isolates the cost or benefit of the call mechanics; comparing a priority policy with `virtual-fifo` isolates the prioritisation.',
    '- A passenger misses the flight when they reach the gate after boarding closes (ground truth).',
    `- Confidence intervals: percentile bootstrap of the mean over days (${manifest.statistics.bootstrapResamples} resamples, seed ${manifest.statistics.bootstrapSeed}). Quantiles: ${manifest.statistics.quantileMethod}.`,
    '- Risk classes are computed on arrival with the same parameters for every policy. URGENT means "would miss the flight if served in FIFO order, but can still make it if selected now"; CRITICAL means "cannot make it even if selected now": such passengers are escalated to staff and never boosted automatically.',
    '',
  );
  section++;

  push(`## ${section}. Policies`, '');
  section++;
  for (const policy of manifest.policies) {
    push(`### ${policyLabel(policy)}`, '');
    const selection = Object.entries(policy.selection).filter(([key]) => key !== 'kind');
    const queue = Object.entries(policy.queue).filter(([key]) => key !== 'kind');
    const lanes = Object.entries(policy.lanes ?? {}).filter(([key]) => key !== 'kind');
    push(
      `Selection: \`${policy.selection.kind}\`. Queue: \`${policy.queue.kind}\` (${QUEUE_DESCRIPTIONS[policy.queue.kind]}).` +
        (policy.lanes === undefined
          ? ''
          : ` Lanes: \`${policy.lanes.kind}\` (${laneRule(policy)}).`),
      '',
    );
    if (selection.length + queue.length + lanes.length > 0) {
      push('| Parameter | Value |', '|---|---|');
      for (const [key, value] of selection) {
        push(`| selection.${key} | ${cell(formatPolicyParam(key, value))} |`);
      }
      for (const [key, value] of queue) {
        push(`| queue.${key} | ${cell(formatPolicyParam(key, value))} |`);
      }
      for (const [key, value] of lanes) {
        push(`| lanes.${key} | ${cell(formatPolicyParam(key, value))} |`);
      }
      push(
        '',
        'All parameter values are initial hypotheses to be calibrated and approved, not measured optima.',
        '',
      );
    }
    const differences = differencesFromPreset(policy);
    if (differences.length > 0) {
      push(
        `Set for this checkpoint by the scenario (preset value in brackets): ${differences
          .map((d) => {
            const key = d.parameter.slice(d.parameter.indexOf('.') + 1);
            return `${d.parameter} ${formatPolicyParam(key, d.value)} (${formatPolicyParam(key, d.preset)})`;
          })
          .join('; ')}.`,
        '',
      );
    }
  }

  push(
    ...renderDataSources(
      `## ${section}. Data sources and licences`,
      manifest.scenario,
      doc.assumptions,
    ),
  );
  section++;

  push(
    `## ${section}. Assumptions`,
    '',
    'Every model parameter, with its source. SYNTHETIC values are illustrative assumptions.',
    '',
    '| Parameter | Value | Source | Note |',
    '|---|---|---|---|',
  );
  section++;
  for (const a of doc.assumptions) {
    push(
      `| ${a.path} | ${cell(formatValue(a.value))} | ${sourceLabel(a)} | ${cell(a.note ?? '')} |`,
    );
  }
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
    `| Scenario hash | \`${manifest.scenario.hash}\` |`,
    `| Seeds | ${manifest.seeds.ranges} (${manifest.seeds.count}) |`,
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
