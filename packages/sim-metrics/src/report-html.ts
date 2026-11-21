import { comparisonKey } from './experiment';
import {
  chartFigure,
  htmlPage,
  intervalsSvg,
  lineChartSvg,
  lineLegendHtml,
  markdownSections,
  markdownToHtml,
  rangeBarsSvg,
} from './html';
import type { LineSeries } from './html';
import { renderReport } from './report';
import type { ResultsDocument } from './results';
import { SWEEP_PARAMETER_LABELS, harmComparisonKey, renderSweepReport } from './sweep-report';
import type { SweepDimensionSummary, SweepDocument } from './sweep-results';

/** HTML of one `## ` section, with `inserted` right after its heading. */
function sectionHtml(markdown: string, inserted: string): string {
  const html = markdownToHtml(markdown);
  const cut = html.indexOf('\n');
  if (cut < 0 || inserted === '') return inserted === '' ? html : `${html}\n${inserted}`;
  return `${html.slice(0, cut)}\n${inserted}\n${html.slice(cut + 1)}`;
}

/** The HTML twin of the Markdown report, with charts under the headline. Deterministic. */
export function renderHtmlReport(doc: ResultsDocument): string {
  const { manifest, summary } = doc;
  const { preamble, sections } = markdownSections(renderReport(doc));
  const missed = rangeBarsSvg(
    manifest.policies.map((policy) => {
      const m = summary.policies[policy.id]?.missed;
      return {
        label: policy.id,
        value: m?.mean ?? 0,
        low: m?.p05 ?? 0,
        high: m?.p95 ?? 0,
        emphasis: policy.selection.kind === 'constrained-edf',
      };
    }),
    { label: 'Missed flights per day by policy' },
  );
  const net = intervalsSvg(
    Object.values(summary.comparisons).map((c) => ({
      label: `${c.candidateId} vs ${c.referenceId}`,
      mean: c.metrics.net.mean,
      lower: c.metrics.net.ciLower,
      upper: c.metrics.net.ciUpper,
    })),
    { label: 'Net flights saved per day, by comparison' },
  );
  const charts = [
    chartFigure(
      'Missed flights per day',
      'Mean per simulated day; the whisker spans P5 to P95 across days. GateFlow priority policies in blue, the others in grey. The values are in the tables below.',
      missed,
    ),
    chartFigure(
      'Net flights saved per day',
      `Candidate compared with reference, passenger by passenger: mean per day and ${Math.round(manifest.statistics.confidenceLevel * 100)}% confidence interval. Right of zero, the candidate catches more flights.`,
      net,
    ),
  ].join('\n');
  const body = [
    markdownToHtml(preamble),
    ...sections.map((section, i) => sectionHtml(section, i === 0 ? charts : '')),
  ].join('\n');
  return htmlPage(
    `GateFlow report: ${manifest.scenario.id}`,
    `SIMULATED results for ${manifest.scenario.title}: ${summary.days} simulated days.`,
    body,
  );
}

/** The series drawn on a sweep curve: the candidate, then up to two references. */
function sweepSeries(doc: SweepDocument): { id: string; slot: 1 | 2 | 3 }[] {
  const { candidateId, comparisons } = doc.manifest;
  const harm = harmComparisonKey(doc);
  const references = comparisons
    .filter((c) => c.candidateId === candidateId && comparisonKey(c) !== harm)
    .map((c) => c.referenceId)
    .slice(0, 2);
  return [
    { id: candidateId, slot: 1 },
    ...references.map((id, i) => ({ id, slot: (i + 2) as 2 | 3 })),
  ];
}

function sweepCharts(doc: SweepDocument, dimension: SweepDimensionSummary): string {
  const { candidateId, comparisons } = doc.manifest;
  const categories = dimension.points.map((p) => p.label);
  const baseIndex = dimension.points.findIndex((p) => p.isBase);
  const parameter = SWEEP_PARAMETER_LABELS[dimension.parameter];
  const series: LineSeries[] = sweepSeries(doc).map((s) => ({
    name: s.id,
    slot: s.slot,
    values: dimension.points.map((p) => p.policies[s.id]?.missed.mean ?? 0),
  }));
  const missed = chartFigure(
    `${parameter}: missed flights per day`,
    'Mean per simulated day at each value; everything else at the base.',
    lineChartSvg({
      label: `Missed flights per day by ${parameter}`,
      categories,
      ...(baseIndex < 0 ? {} : { baseIndex }),
      series,
    }),
    lineLegendHtml(series),
  );
  const first = comparisons.find((c) => c.candidateId === candidateId);
  if (first === undefined) return missed;
  const key = comparisonKey(first);
  const net = dimension.points.map((p) => p.comparisons[key]?.metrics.net);
  const netChart = chartFigure(
    `${parameter}: net flights saved per day by ${candidateId} compared with ${first.referenceId}`,
    `Mean per day with its ${Math.round(doc.manifest.statistics.confidenceLevel * 100)}% confidence interval (shaded). Above zero, ${candidateId} catches more flights.`,
    lineChartSvg({
      label: `Net flights saved by ${candidateId} vs ${first.referenceId}, by ${parameter}`,
      categories,
      ...(baseIndex < 0 ? {} : { baseIndex }),
      series: [
        {
          name: `${candidateId} vs ${first.referenceId}`,
          slot: 1,
          values: net.map((m) => m?.mean ?? 0),
        },
      ],
      band: { lower: net.map((m) => m?.ciLower ?? 0), upper: net.map((m) => m?.ciUpper ?? 0) },
      zero: true,
    }),
  );
  return `${missed}\n${netChart}`;
}

/** The HTML twin of the Markdown sweep report, with two charts per curve. Deterministic. */
export function renderSweepHtml(doc: SweepDocument): string {
  const { preamble, sections } = markdownSections(renderSweepReport(doc));
  const body = [
    markdownToHtml(preamble),
    ...sections.map((section, i) => {
      const dimension = doc.dimensions[i];
      return sectionHtml(section, dimension === undefined ? '' : sweepCharts(doc, dimension));
    }),
  ].join('\n');
  return htmlPage(
    `GateFlow sweep: ${doc.manifest.sweep.id}`,
    `SIMULATED sensitivity sweep: ${doc.manifest.sweep.title}.`,
    body,
  );
}
