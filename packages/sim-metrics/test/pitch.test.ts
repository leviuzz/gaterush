import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  PITCH_SCHEMA,
  PITCH_SOURCES,
  PitchError,
  buildPitch,
  figureText,
  figureValue,
  renderPitchHtml,
  renderPitchMarkdown,
  stringifyPitch,
} from '../src';
import type { PitchDocument, PitchFigure } from '../src';
import { balancedTags } from './html-check';

/*
 * The pitch figures (ADR-058): one page of the simulated figures the pitch can say, read from the
 * published reports. Every figure must be the number its report gives at the place it names; a
 * claim must say its figures; a source that is not a clean commit's simulated report on synthetic
 * data is refused; a claim whose figures no longer support its words stops the page.
 */

const REPORTS = fileURLToPath(new URL('../../../docs/reports/', import.meta.url));
const PAGE = fileURLToPath(new URL('../../../docs/pitch/', import.meta.url));

const published = new Map<string, unknown>(
  PITCH_SOURCES.map((file) => [file, JSON.parse(readFileSync(join(REPORTS, file), 'utf8'))]),
);

function readPublished(file: string): unknown {
  if (!published.has(file)) throw new Error(`the page reads no ${file}`);
  return published.get(file);
}

/** The published reports, with one of them changed (on a copy). */
function withChange(file: string, change: (doc: Record<string, unknown>) => void) {
  const changed = structuredClone(readPublished(file)) as Record<string, unknown>;
  change(changed);
  return (name: string): unknown => (name === file ? changed : readPublished(name));
}

/** What a JSON pointer (RFC 6901) names in a document, resolved independently of the page. */
function atPointer(doc: unknown, pointer: string): unknown {
  return pointer
    .split('/')
    .slice(1)
    .map((s) => s.replace(/~1/g, '/').replace(/~0/g, '~'))
    .reduce<unknown>((node, key) => (node as Record<string, unknown> | undefined)?.[key], doc);
}

/** A member of a document, by path, for the changes of the tests. */
function member(doc: unknown, ...path: string[]): Record<string, unknown> {
  return path.reduce<unknown>((node, key) => (node as Record<string, unknown>)[key], doc) as Record<
    string,
    unknown
  >;
}

function everyFigure(doc: PitchDocument): PitchFigure[] {
  return [
    ...doc.claims.flatMap((c) => c.figures),
    ...doc.tables.flatMap((t) =>
      t.rows.flat().filter((c): c is PitchFigure => typeof c !== 'string'),
    ),
    ...doc.charts.flatMap((c) =>
      c.kind === 'bars'
        ? c.rows.flatMap((r) => [r.value, r.low, r.high])
        : c.rows.map((r) => r.value),
    ),
  ];
}

const doc = buildPitch(readPublished, { reports: '../reports' });
const HUB = 'slice-22/mx-like-transfer-hub/results.json';
const BASE = 'slice-22/tsf-like-peak-day/results.json';
const HARDER = 'slice-22/sweeps/vce-like-peak-console-harder/sweep.json';

describe('the pitch figures (ADR-058)', () => {
  it('reads every figure where it says, in a published report', () => {
    const figures = everyFigure(doc);
    expect(figures.length).toBeGreaterThan(200);
    for (const f of figures) {
      expect(PITCH_SOURCES).toContain(f.source);
      const node = atPointer(readPublished(f.source), f.pointer);
      if (typeof node === 'number') {
        expect(f.value).toBe(node);
        expect([f.lower, f.upper]).toEqual([null, null]);
      } else {
        const summary = node as Record<string, number | undefined>;
        expect(f.value).toBe(summary.mean ?? summary.estimate);
        expect([f.lower, f.upper]).toEqual([summary.ciLower ?? null, summary.ciUpper ?? null]);
      }
    }
    // The headline, as the report gives it: GateFlow as a whole against today at the hub.
    const [headline] = doc.claims[0]?.figures ?? [];
    expect(headline?.pointer).toBe(
      '/summary/comparisons/priority-v3@advise vs fifo-manual@reactive/metrics/net',
    );
    expect(headline?.source).toBe(HUB);
  });

  it('writes each claim from its figures, with a caveat and its sources', () => {
    expect(doc.claims.map((c) => c.id)).toEqual([
      'hub-gateflow',
      'hub-lanes',
      'hub-followed',
      'hub-priority',
      'base-wait',
      'base-gateflow',
      'vce-quiet',
      'harder-day',
      'vce-harder-gateflow',
      'forecast-arrivals',
      'forecast-wait',
      'hub-fairness',
    ]);
    for (const claim of doc.claims) {
      expect(claim.caveat.length).toBeGreaterThan(50);
      for (const f of claim.figures)
        expect(`${claim.text} ${claim.caveat}`).toContain(figureValue(f));
      // Its sources: every file its figures come from, in the order of the page's sources.
      for (const f of claim.figures) expect(claim.sources).toContain(f.source);
      expect(claim.sources).toEqual(PITCH_SOURCES.filter((s) => claim.sources.includes(s)));
    }
    // A claim on the forecasts speaks of the five checkpoints of the library, not only of its extremes.
    const forecasts = doc.claims.find((c) => c.id === 'forecast-arrivals');
    expect(forecasts?.sources.filter((s) => s.startsWith('slice-21/'))).toHaveLength(5);
  });

  it('writes figures as the reports do', () => {
    const f = (
      value: number,
      lower: number | null,
      upper: number | null,
      style: Partial<PitchFigure>,
    ): PitchFigure => ({
      label: 'x',
      value,
      lower,
      upper,
      source: 's',
      pointer: '/x',
      digits: 1,
      signed: false,
      percent: false,
      ...style,
    });
    expect(figureText(f(17.96, 16.0947, 19.9255, { signed: true }))).toBe('+18.0 [16.1, 19.9]');
    // A value rounded to zero is 0.0; a bound keeps its sign: just below zero.
    expect(figureText(f(-0.001, -0.04, -0.01, { signed: true }))).toBe('0.0 [-0.0, -0.0]');
    expect(figureText(f(-15.2, -18.7, -12.2, { signed: true }))).toBe('-15.2 [-18.7, -12.2]');
    expect(figureText(f(0.0062, 0.005, 0.0075, { percent: true }))).toBe('0.6% [0.5%, 0.8%]');
    expect(figureText(f(16623.28, null, null, { digits: 0 }))).toBe('16,623');
    expect(figureValue(f(0.93, null, null, { digits: 2, signed: true }))).toBe('+0.93');
  });

  it('is the page in docs/pitch, written and checked from the reports', () => {
    expect(readFileSync(join(PAGE, 'README.md'), 'utf8')).toBe(renderPitchMarkdown(doc));
    expect(readFileSync(join(PAGE, 'figures.html'), 'utf8')).toBe(renderPitchHtml(doc));
    expect(readFileSync(join(PAGE, 'figures.json'), 'utf8')).toBe(stringifyPitch(doc));
    // The same reports give the same page.
    expect(stringifyPitch(buildPitch(readPublished, { reports: '../reports' }))).toBe(
      stringifyPitch(doc),
    );
  });

  it('says SIMULATED, links only to files of the repository, and its HTML is self-contained', () => {
    const markdown = renderPitchMarkdown(doc);
    expect(markdown).toContain('**SIMULATED RESULTS ON SYNTHETIC DATA.**');
    expect(markdown).toContain('## What the figures do not say');
    const links = [...markdown.matchAll(/\]\(([^)]+)\)/g)].map((m) => m[1] ?? '');
    expect(links.length).toBeGreaterThan(30);
    for (const link of links) expect(existsSync(resolve(PAGE, link)), link).toBe(true);
    const html = renderPitchHtml(doc);
    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(balancedTags(html)).toBe(true);
    expect(html.match(/<svg /g)).toHaveLength(3);
    expect(html).not.toMatch(/(src|href)="(https?:)?\/\//);
    expect(html).not.toContain('<script');
    expect(html).toContain('SIMULATED RESULTS ON SYNTHETIC DATA.');
    const json = JSON.parse(stringifyPitch(doc)) as { schema: string; sources: unknown[] };
    expect(json.schema).toBe(PITCH_SCHEMA);
    expect(json.sources).toHaveLength(PITCH_SOURCES.length);
  });

  it('refuses a report that is not a clean commit simulated on synthetic data', () => {
    const refused = (file: string, change: (d: Record<string, unknown>) => void) => {
      try {
        buildPitch(withChange(file, change), { reports: '../reports' });
      } catch (error) {
        expect(error).toBeInstanceOf(PitchError);
        return (error as Error).message;
      }
      throw new Error('the page was written');
    };
    expect(
      refused(HUB, (d) => {
        member(d, 'manifest').commit = `${String(member(d, 'manifest').commit)}-dirty`;
      }),
    ).toMatch(/not produced from a clean commit/);
    expect(refused(BASE, (d) => (d.disclaimer = 'Results.'))).toMatch(/SIMULATED disclaimer/);
    expect(
      refused('slice-21/vce-like-peak-day/backtest.json', (d) => {
        member(d, 'manifest', 'scenario').dataClassification = 'OPERATIONAL';
      }),
    ).toMatch(/not on synthetic data/);
    expect(refused(HUB, (d) => (d.schema = 'gateflow.sim.results/6'))).toMatch(
      /not a gateflow\.sim\.results\/7 document/,
    );
    expect(
      refused(HUB, (d) => {
        delete member(d, 'summary', 'comparisons')['priority-v3@advise vs fifo-manual@reactive'];
      }),
    ).toMatch(/has nothing at \/summary\/comparisons\/priority-v3@advise vs fifo-manual@reactive/);
    expect(
      refused(HUB, (d) => {
        member(d, 'manifest', 'scenario').id = 'tsf-like-peak-day';
      }),
    ).toMatch(/not a report of mx-like-transfer-hub/);
  });

  it('stops when a claim is no longer what its figures say', () => {
    const stopped = (file: string, change: (d: Record<string, unknown>) => void): string => {
      try {
        buildPitch(withChange(file, change), { reports: '../reports' });
      } catch (error) {
        expect(error).toBeInstanceOf(PitchError);
        return (error as Error).message;
      }
      throw new Error('the page was written');
    };
    // The headline's interval reaches zero.
    expect(
      stopped(HUB, (d) => {
        member(
          d,
          'summary',
          'comparisons',
          'priority-v3@advise vs fifo-manual@reactive',
          'metrics',
          'net',
        ).ciLower = -0.5;
      }),
    ).toMatch(/"At a transfer hub, GateFlow saves flights" no longer holds/);
    // The wait no longer halves at the TSF-like base.
    expect(
      stopped(BASE, (d) => {
        member(d, 'summary', 'policies', 'fifo-manual@advise', 'waitMeanMin').mean = 1.5;
      }),
    ).toMatch(/"At a low-cost base, the console halves the wait" no longer holds/);
    // The priority calls change the missed flights measurably on a VCE-like day.
    expect(
      stopped('slice-22/vce-like-peak-day/results.json', (d) => {
        member(
          d,
          'summary',
          'comparisons',
          'priority-v3 vs fifo-manual',
          'metrics',
          'net',
        ).ciLower = 0.05;
      }),
    ).toMatch(/"Where the roster follows demand, the console stays quiet" no longer holds/);
    // A forecast's band no longer holds about 80% of the arrivals.
    expect(
      stopped('slice-21/tsf-like-peak-day/backtest.json', (d) => {
        member(d, 'summary', 'arrivals', '60', 'all').coverage = 0.7;
      }),
    ).toMatch(/hold their bands" no longer holds/);
    // GateFlow no longer saves flights on a VCE-like day with a roster one lane short.
    expect(
      stopped(HARDER, (d) => {
        const roster = (d.dimensions as { id: string; points: { value: number }[] }[]).find(
          (x) => x.id === 'roster',
        );
        const short = roster?.points.find((p) => p.value === -1) as unknown;
        member(
          short,
          'comparisons',
          'priority-v3@advise vs fifo-manual@reactive',
          'metrics',
          'net',
        ).ciLower = -0.2;
      }),
    ).toMatch(
      /"When a departures checkpoint is short of lanes, GateFlow saves flights" no longer holds/,
    );
    // A ticket passed by more people than GateFlow's bound.
    expect(
      stopped(HUB, (d) => {
        member(d, 'summary', 'policies', 'priority-v3@advise', 'maxOvertakes').max = 31;
      }),
    ).toMatch(/do not pay for it" no longer holds/);
  });
});
