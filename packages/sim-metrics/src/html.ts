/**
 * Self-contained, deterministic HTML for reports: a page shell with light and dark colour tokens,
 * a converter for the Markdown subset our reports use, and inline SVG charts. No script, no
 * external resource: the same document always renders the same bytes, offline.
 *
 * Charts follow the data-visualisation rules of the project: thin marks, hairline grid, one axis,
 * a legend for two or more series, selective direct labels, colours by entity in a fixed,
 * colour-blind-validated order, and a table view (the report tables) for every chart.
 */

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Inline Markdown of our reports: `code`, **bold** and [links](url), on escaped text. */
function inline(text: string): string {
  return text
    .split('`')
    .map((part, i) => {
      const safe = escapeHtml(part);
      if (i % 2 === 1) return `<code>${safe}</code>`;
      return safe
        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
        .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2">$1</a>');
    })
    .join('');
}

function slug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Splits a table row on unescaped pipes; `\|` becomes a literal pipe. */
function tableCells(row: string): string[] {
  const trimmed = row.trim().replace(/^\|/, '').replace(/\|$/, '');
  return trimmed.split(/(?<!\\)\|/).map((cell) => cell.trim().replace(/\\\|/g, '|'));
}

function tableHtml(rows: readonly string[]): string {
  const header = tableCells(rows[0] ?? '');
  const align = tableCells(rows[1] ?? '').map((spec) => {
    if (spec.startsWith(':') && spec.endsWith(':')) return 'center';
    if (spec.endsWith(':')) return 'right';
    return 'left';
  });
  const attr = (i: number) => (align[i] === 'left' ? '' : ` class="${align[i] ?? 'left'}"`);
  const head = header.map((cell, i) => `<th${attr(i)}>${inline(cell)}</th>`).join('');
  const body = rows
    .slice(2)
    .map(
      (row) =>
        `<tr>${tableCells(row)
          .map((cell, i) => `<td${attr(i)}>${inline(cell)}</td>`)
          .join('')}</tr>`,
    )
    .join('\n');
  return `<div class="table"><table><thead><tr>${head}</tr></thead><tbody>\n${body}\n</tbody></table></div>`;
}

/**
 * Converts the Markdown our report renderers write (headings, paragraphs, a blockquote, lists with
 * one level of nesting, tables, fenced code) to HTML. Not a general Markdown parser.
 */
export function markdownToHtml(markdown: string): string {
  const lines = markdown.split('\n');
  const out: string[] = [];
  let i = 0;
  const isBlockStart = (line: string) =>
    line.startsWith('#') ||
    line.startsWith('|') ||
    line.startsWith('> ') ||
    line.startsWith('```') ||
    /^\s*- /.test(line);
  while (i < lines.length) {
    const line = lines[i] ?? '';
    if (line.trim() === '') {
      i++;
      continue;
    }
    if (line.startsWith('```')) {
      const lang = line.slice(3).trim();
      const code: string[] = [];
      i++;
      while (i < lines.length && !(lines[i] ?? '').startsWith('```')) code.push(lines[i++] ?? '');
      i++;
      const cls = lang === '' ? '' : ` class="language-${escapeHtml(lang)}"`;
      out.push(`<pre><code${cls}>${escapeHtml(code.join('\n'))}</code></pre>`);
      continue;
    }
    const heading = /^(#{1,4}) (.*)$/.exec(line);
    if (heading !== null) {
      const level = (heading[1] ?? '#').length;
      const text = heading[2] ?? '';
      out.push(`<h${level} id="${slug(text)}">${inline(text)}</h${level}>`);
      i++;
      continue;
    }
    if (line.startsWith('> ')) {
      const quote: string[] = [];
      while (i < lines.length && (lines[i] ?? '').startsWith('> '))
        quote.push((lines[i++] ?? '').slice(2));
      out.push(`<blockquote><p>${inline(quote.join(' '))}</p></blockquote>`);
      continue;
    }
    if (line.startsWith('|')) {
      const rows: string[] = [];
      while (i < lines.length && (lines[i] ?? '').startsWith('|')) rows.push(lines[i++] ?? '');
      out.push(tableHtml(rows));
      continue;
    }
    if (/^\s*- /.test(line)) {
      const items: { text: string; children: string[] }[] = [];
      while (i < lines.length && /^\s*- /.test(lines[i] ?? '')) {
        const item = lines[i++] ?? '';
        const nested = /^\s{2,}- /.test(item);
        const text = item.replace(/^\s*- /, '');
        const last = items[items.length - 1];
        if (nested && last !== undefined) last.children.push(text);
        else items.push({ text, children: [] });
      }
      const li = items.map((item) => {
        const children =
          item.children.length === 0
            ? ''
            : `<ul>${item.children.map((c) => `<li>${inline(c)}</li>`).join('')}</ul>`;
        return `<li>${inline(item.text)}${children}</li>`;
      });
      out.push(`<ul>\n${li.join('\n')}\n</ul>`);
      continue;
    }
    const paragraph: string[] = [];
    while (i < lines.length && (lines[i] ?? '').trim() !== '' && !isBlockStart(lines[i] ?? '')) {
      paragraph.push(lines[i++] ?? '');
    }
    out.push(`<p>${inline(paragraph.join(' '))}</p>`);
  }
  return out.join('\n');
}

/** Splits Markdown into the part before the first `## ` heading and the `## ` sections. */
export function markdownSections(markdown: string): { preamble: string; sections: string[] } {
  const parts = markdown.split(/\n(?=## )/);
  const [first = '', ...rest] = parts;
  if (first.startsWith('## ')) return { preamble: '', sections: parts };
  return { preamble: first, sections: rest };
}

const TOKENS_LIGHT = `
  color-scheme: light;
  --page: #f9f9f7;
  --surface: #fcfcfb;
  --text-primary: #0b0b0b;
  --text-secondary: #52514e;
  --muted: #898781;
  --grid: #e1e0d9;
  --axis: #c3c2b7;
  --border: rgba(11, 11, 11, 0.1);
  --deemph: #a9a79f;
  --series-1: #2a78d6;
  --series-2: #eb6834;
  --series-3: #1baf7a;`;

const TOKENS_DARK = `
  color-scheme: dark;
  --page: #0d0d0d;
  --surface: #1a1a19;
  --text-primary: #f0efec;
  --text-secondary: #c3c2b7;
  --muted: #898781;
  --grid: #2c2c2a;
  --axis: #383835;
  --border: rgba(255, 255, 255, 0.1);
  --deemph: #6e6d67;
  --series-1: #3987e5;
  --series-2: #d95926;
  --series-3: #199e70;`;

const STYLE = `
:root {${TOKENS_LIGHT}
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {${TOKENS_DARK}
  }
}
:root[data-theme="dark"] {${TOKENS_DARK}
}
* { box-sizing: border-box; }
body {
  margin: 0;
  background: var(--page);
  color: var(--text-primary);
  font: 15px/1.55 system-ui, -apple-system, "Segoe UI", sans-serif;
}
main { max-width: 1040px; margin: 0 auto; padding: 24px 16px 48px; }
h1 { font-size: 26px; line-height: 1.25; margin: 8px 0 16px; }
h2 { font-size: 20px; margin: 36px 0 12px; }
h3 { font-size: 16px; margin: 24px 0 8px; }
p, li { color: var(--text-primary); }
a { color: var(--series-1); }
blockquote {
  margin: 16px 0;
  padding: 12px 16px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 8px;
}
blockquote p { margin: 0; }
code {
  font: 13px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 0 4px;
  overflow-wrap: anywhere;
}
pre { background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 12px; overflow-x: auto; }
pre code { border: 0; padding: 0; background: none; white-space: pre; overflow-wrap: normal; }
.table { overflow-x: auto; margin: 12px 0 20px; border: 1px solid var(--border); border-radius: 8px; background: var(--surface); }
table { border-collapse: collapse; width: 100%; font-size: 13px; font-variant-numeric: tabular-nums; }
th, td { padding: 6px 10px; border-bottom: 1px solid var(--grid); text-align: left; vertical-align: top; }
th { color: var(--text-secondary); font-weight: 600; }
tr:last-child td { border-bottom: 0; }
.right { text-align: right; }
.center { text-align: center; }
td code { white-space: nowrap; overflow-wrap: normal; }
td.right { white-space: nowrap; }
figure.chart { margin: 16px 0 24px; padding: 16px; background: var(--surface); border: 1px solid var(--border); border-radius: 8px; overflow-x: auto; }
figure.chart figcaption { font-weight: 600; margin-bottom: 4px; }
figure.chart .note { color: var(--text-secondary); font-size: 13px; margin: 0 0 8px; }
figure.chart svg { display: block; width: 100%; min-width: 560px; height: auto; }
.legend { display: flex; flex-wrap: wrap; gap: 4px 16px; margin: 4px 0 8px; font-size: 13px; color: var(--text-secondary); }
.legend span { display: inline-flex; align-items: center; gap: 6px; }
.legend i { display: inline-block; width: 16px; height: 2px; border-radius: 1px; }
svg text { font-family: system-ui, -apple-system, "Segoe UI", sans-serif; }
`;

/** A complete HTML page. */
export function htmlPage(title: string, description: string, body: string): string {
  return [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${escapeHtml(title)}</title>`,
    `<meta name="description" content="${escapeHtml(description)}">`,
    `<style>${STYLE}</style>`,
    '</head>',
    '<body>',
    '<main>',
    body,
    '</main>',
    '</body>',
    '</html>',
    '',
  ].join('\n');
}

// ---------------------------------------------------------------------------------------------
// Charts

/** Coordinates rounded to 0.1 px, so the markup is compact and identical on every platform. */
function px(n: number): string {
  const rounded = Math.round(n * 10) / 10;
  return String(rounded === 0 ? 0 : rounded);
}

function fixed(value: number, digits: number): string {
  const text = value.toFixed(digits);
  return text === `-${(0).toFixed(digits)}` ? (0).toFixed(digits) : text;
}

/** About 1, 2, 2.5 or 5 times a power of ten, at least `span / count`. */
function niceStep(span: number, count: number): number {
  const raw = span / Math.max(1, count);
  if (!(raw > 0)) return 1;
  // Power of ten by exact arithmetic (no logarithms: they are implementation-approximated).
  let power = 1;
  while (power > raw) power /= 10;
  while (power * 10 <= raw) power *= 10;
  for (const m of [1, 2, 2.5, 5, 10]) if (m * power >= raw) return m * power;
  return 10 * power;
}

/** Ticks covering [min, max] with clean steps (the scale is extended to the outer ticks). */
export function niceTicks(min: number, max: number, count = 5): number[] {
  let lo = Math.min(min, max);
  let hi = Math.max(min, max);
  if (lo === hi) {
    lo -= 1;
    hi += 1;
  }
  const step = niceStep(hi - lo, count);
  const start = Math.floor(lo / step) * step;
  const end = Math.ceil(hi / step) * step;
  const ticks: number[] = [];
  for (let k = 0; start + k * step <= end + step * 1e-9; k++) {
    ticks.push(Math.round((start + k * step) * 1e9) / 1e9);
  }
  return ticks;
}

/** Thousands separated by commas (locale-independent, so output never depends on the runtime). */
function groupThousands(text: string): string {
  const [whole = '', fraction] = text.split('.');
  const sign = whole.startsWith('-') ? '-' : '';
  const digitsOnly = sign === '' ? whole : whole.slice(1);
  const grouped = digitsOnly.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${sign}${grouped}${fraction === undefined ? '' : `.${fraction}`}`;
}

function tickLabel(value: number, step: number): string {
  const digits = step >= 1 ? 0 : step >= 0.1 ? 1 : 2;
  const text = fixed(value, digits);
  return Math.abs(value) >= 10_000 ? groupThousands(text) : text;
}

/** Rough width of a label at 12px (layout only: SVG cannot measure text without a browser). */
function textWidth(text: string): number {
  return text.length * 6.6;
}

function svgOpen(width: number, height: number, label: string): string {
  return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(label)}">`;
}

export interface RangeBar {
  readonly label: string;
  readonly value: number;
  /** Spread shown as a whisker, e.g. P5 and P95 across days. */
  readonly low: number;
  readonly high: number;
  /** Drawn in the accent colour; the others in the de-emphasis grey. */
  readonly emphasis: boolean;
}

/**
 * Horizontal bars from a zero baseline, one per row in the given order, with a whisker for the
 * spread and the value at the tip. Emphasis form: accent bars carry the point, grey bars context.
 */
export function rangeBarsSvg(
  rows: readonly RangeBar[],
  options: { readonly label: string; readonly digits?: number },
): string {
  const digits = options.digits ?? 1;
  const labelWidth = Math.min(300, Math.max(...rows.map((r) => textWidth(r.label)), 60) + 12);
  const width = 720;
  const plotLeft = labelWidth;
  const plotRight = width - 64;
  const row = 34;
  const top = 8;
  const axisBand = 28;
  const height = top + rows.length * row + axisBand;
  const max = Math.max(...rows.map((r) => Math.max(r.high, r.value)), 0);
  const ticks = niceTicks(0, max, 5);
  const xMax = ticks[ticks.length - 1] ?? 1;
  const x = (v: number) => plotLeft + ((plotRight - plotLeft) * v) / (xMax === 0 ? 1 : xMax);
  const step = ticks.length > 1 ? (ticks[1] ?? 1) - (ticks[0] ?? 0) : 1;
  const out = [svgOpen(width, height, options.label)];
  for (const t of ticks) {
    out.push(
      `<line x1="${px(x(t))}" y1="${top}" x2="${px(x(t))}" y2="${px(top + rows.length * row)}" stroke="var(--grid)" stroke-width="1"/>`,
      `<text x="${px(x(t))}" y="${px(height - 8)}" text-anchor="middle" font-size="11" fill="var(--muted)">${tickLabel(t, step)}</text>`,
    );
  }
  rows.forEach((r, i) => {
    const cy = top + i * row + row / 2;
    const h = 16;
    const y0 = cy - h / 2;
    const x0 = x(0);
    const x1 = Math.max(x0, x(r.value));
    const radius = Math.min(4, (x1 - x0) / 2);
    const fill = r.emphasis ? 'var(--series-1)' : 'var(--deemph)';
    const bar =
      x1 - x0 < 0.5
        ? ''
        : `<path d="M${px(x0)} ${px(y0)}H${px(x1 - radius)}Q${px(x1)} ${px(y0)} ${px(x1)} ${px(y0 + radius)}V${px(y0 + h - radius)}Q${px(x1)} ${px(y0 + h)} ${px(x1 - radius)} ${px(y0 + h)}H${px(x0)}Z" fill="${fill}"/>`;
    const lo = x(Math.max(0, r.low));
    const hi = x(r.high);
    const tip = Math.max(x1, hi);
    out.push(
      `<g><title>${escapeHtml(`${r.label}: ${fixed(r.value, digits)} (spread ${fixed(r.low, digits)} to ${fixed(r.high, digits)})`)}</title>`,
      `<rect x="0" y="${px(top + i * row)}" width="${width}" height="${row}" fill="transparent"/>`,
      `<text x="${px(plotLeft - 10)}" y="${px(cy + 4)}" text-anchor="end" font-size="12" fill="var(--text-primary)">${escapeHtml(r.label)}</text>`,
      bar,
      `<line x1="${px(lo)}" y1="${px(cy)}" x2="${px(hi)}" y2="${px(cy)}" stroke="var(--text-secondary)" stroke-width="1.5"/>`,
      `<line x1="${px(lo)}" y1="${px(cy - 4)}" x2="${px(lo)}" y2="${px(cy + 4)}" stroke="var(--text-secondary)" stroke-width="1.5"/>`,
      `<line x1="${px(hi)}" y1="${px(cy - 4)}" x2="${px(hi)}" y2="${px(cy + 4)}" stroke="var(--text-secondary)" stroke-width="1.5"/>`,
      `<text x="${px(tip + 6)}" y="${px(cy + 4)}" font-size="12" fill="var(--text-primary)">${fixed(r.value, digits)}</text>`,
      '</g>',
    );
  });
  out.push(
    `<line x1="${px(x(0))}" y1="${top}" x2="${px(x(0))}" y2="${px(top + rows.length * row)}" stroke="var(--axis)" stroke-width="1"/>`,
    '</svg>',
  );
  return out.filter((s) => s !== '').join('\n');
}

export interface IntervalRow {
  readonly label: string;
  readonly mean: number;
  readonly lower: number;
  readonly upper: number;
}

/** Means with confidence intervals around a zero line (a forest plot), one row per estimate. */
export function intervalsSvg(
  rows: readonly IntervalRow[],
  options: { readonly label: string; readonly digits?: number },
): string {
  const digits = options.digits ?? 1;
  const labelWidth = Math.min(340, Math.max(...rows.map((r) => textWidth(r.label)), 60) + 12);
  const width = 720;
  const plotLeft = labelWidth;
  const plotRight = width - 120;
  const row = 30;
  const top = 8;
  const axisBand = 28;
  const height = top + rows.length * row + axisBand;
  const ticks = niceTicks(
    Math.min(0, ...rows.map((r) => r.lower)),
    Math.max(0, ...rows.map((r) => r.upper)),
    6,
  );
  const lo = ticks[0] ?? 0;
  const hi = ticks[ticks.length - 1] ?? 1;
  const x = (v: number) =>
    plotLeft + ((plotRight - plotLeft) * (v - lo)) / (hi - lo === 0 ? 1 : hi - lo);
  const step = ticks.length > 1 ? (ticks[1] ?? 1) - (ticks[0] ?? 0) : 1;
  const out = [svgOpen(width, height, options.label)];
  for (const t of ticks) {
    out.push(
      `<line x1="${px(x(t))}" y1="${top}" x2="${px(x(t))}" y2="${px(top + rows.length * row)}" stroke="${t === 0 ? 'var(--axis)' : 'var(--grid)'}" stroke-width="1"/>`,
      `<text x="${px(x(t))}" y="${px(height - 8)}" text-anchor="middle" font-size="11" fill="var(--muted)">${tickLabel(t, step)}</text>`,
    );
  }
  rows.forEach((r, i) => {
    const cy = top + i * row + row / 2;
    const text = `${fixed(r.mean, digits)} [${fixed(r.lower, digits)}, ${fixed(r.upper, digits)}]`;
    out.push(
      `<g><title>${escapeHtml(`${r.label}: ${text}`)}</title>`,
      `<rect x="0" y="${px(top + i * row)}" width="${width}" height="${row}" fill="transparent"/>`,
      `<text x="${px(plotLeft - 10)}" y="${px(cy + 4)}" text-anchor="end" font-size="12" fill="var(--text-primary)">${escapeHtml(r.label)}</text>`,
      `<line x1="${px(x(r.lower))}" y1="${px(cy)}" x2="${px(x(r.upper))}" y2="${px(cy)}" stroke="var(--series-1)" stroke-width="2" stroke-linecap="round"/>`,
      `<circle cx="${px(x(r.mean))}" cy="${px(cy)}" r="5" fill="var(--series-1)" stroke="var(--surface)" stroke-width="2"/>`,
      `<text x="${px(plotRight + 10)}" y="${px(cy + 4)}" font-size="12" fill="var(--text-primary)">${escapeHtml(text)}</text>`,
      '</g>',
    );
  });
  out.push('</svg>');
  return out.join('\n');
}

export interface LineSeries {
  readonly name: string;
  /** Categorical slot 1 to 3 (colour follows the entity, never its rank). */
  readonly slot: 1 | 2 | 3;
  readonly values: readonly number[];
}

export interface LineChartOptions {
  readonly label: string;
  readonly categories: readonly string[];
  /** Index of the base category, labelled "(base)". */
  readonly baseIndex?: number;
  readonly series: readonly LineSeries[];
  /** Confidence band of the first series. */
  readonly band?: { readonly lower: readonly number[]; readonly upper: readonly number[] };
  /** Draws the zero line and keeps zero on the axis. */
  readonly zero?: boolean;
  readonly digits?: number;
}

/** Legend of a line chart, above it: a short line key and the name of each series. */
export function lineLegendHtml(series: readonly LineSeries[]): string {
  if (series.length < 2) return '';
  return `<div class="legend">${series
    .map(
      (s) =>
        `<span><i style="background: var(--series-${s.slot})"></i>${escapeHtml(s.name)}</span>`,
    )
    .join('')}</div>`;
}

/**
 * Lines over ordered categories (the values of a swept parameter), with markers, an optional
 * confidence band for the first series, and direct labels at the line ends when they do not
 * collide (the legend always names the series).
 */
export function lineChartSvg(options: LineChartOptions): string {
  const { categories, series } = options;
  const digits = options.digits ?? 1;
  const width = 720;
  const left = 52;
  // Room for direct end labels only where there are several series to tell apart.
  const endLabelWidth =
    series.length > 1 ? Math.max(...series.map((s) => textWidth(s.name)), 0) + 16 : 24;
  const right = width - Math.min(200, endLabelWidth);
  const top = 12;
  const plotHeight = 200;
  const axisBand = 40;
  const height = top + plotHeight + axisBand;
  const values = series.flatMap((s) => s.values);
  const bandValues =
    options.band === undefined ? [] : [...options.band.lower, ...options.band.upper];
  const all = [...values, ...bandValues, ...(options.zero === true ? [0] : [])];
  const ticks = niceTicks(Math.min(...all), Math.max(...all), 5);
  const lo = ticks[0] ?? 0;
  const hi = ticks[ticks.length - 1] ?? 1;
  const y = (v: number) =>
    top + plotHeight - (plotHeight * (v - lo)) / (hi - lo === 0 ? 1 : hi - lo);
  const n = categories.length;
  const x = (i: number) =>
    n === 1 ? (left + right) / 2 : left + 12 + ((right - left - 24) * i) / (n - 1);
  const step = ticks.length > 1 ? (ticks[1] ?? 1) - (ticks[0] ?? 0) : 1;
  const out = [svgOpen(width, height, options.label)];
  for (const t of ticks) {
    out.push(
      `<line x1="${left}" y1="${px(y(t))}" x2="${px(right)}" y2="${px(y(t))}" stroke="${options.zero === true && t === 0 ? 'var(--axis)' : 'var(--grid)'}" stroke-width="1"/>`,
      `<text x="${left - 8}" y="${px(y(t) + 4)}" text-anchor="end" font-size="11" fill="var(--muted)">${tickLabel(t, step)}</text>`,
    );
  }
  categories.forEach((c, i) => {
    const isBase = i === options.baseIndex;
    out.push(
      `<text x="${px(x(i))}" y="${px(top + plotHeight + 18)}" text-anchor="middle" font-size="12" fill="var(--text-secondary)"${isBase ? ' font-weight="600"' : ''}>${escapeHtml(c)}</text>`,
    );
    if (isBase) {
      out.push(
        `<text x="${px(x(i))}" y="${px(top + plotHeight + 33)}" text-anchor="middle" font-size="11" fill="var(--muted)">(base)</text>`,
      );
    }
  });
  if (options.band !== undefined && n > 1) {
    const upper = options.band.upper.map((v, i) => `${px(x(i))},${px(y(v))}`);
    const lower = options.band.lower.map((v, i) => `${px(x(i))},${px(y(v))}`).reverse();
    out.push(
      `<polygon points="${[...upper, ...lower].join(' ')}" fill="var(--series-${series[0]?.slot ?? 1})" fill-opacity="0.1"/>`,
    );
  }
  for (const s of series) {
    const color = `var(--series-${s.slot})`;
    if (n > 1) {
      const points = s.values.map((v, i) => `${px(x(i))},${px(y(v))}`).join(' ');
      out.push(
        `<polyline points="${points}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`,
      );
    }
    s.values.forEach((v, i) => {
      const band =
        options.band !== undefined && s === series[0]
          ? ` [${fixed(options.band.lower[i] ?? v, digits)}, ${fixed(options.band.upper[i] ?? v, digits)}]`
          : '';
      out.push(
        `<g><title>${escapeHtml(`${s.name}, ${categories[i] ?? ''}: ${fixed(v, digits)}${band}`)}</title>`,
        `<circle cx="${px(x(i))}" cy="${px(y(v))}" r="12" fill="transparent"/>`,
        `<circle cx="${px(x(i))}" cy="${px(y(v))}" r="4" fill="${color}" stroke="var(--surface)" stroke-width="2"/>`,
        '</g>',
      );
    });
  }
  // Direct end labels, only when no two collide.
  const ends = series.map((s) => ({ name: s.name, y: y(s.values[s.values.length - 1] ?? 0) }));
  const sorted = [...ends].sort((a, b) => a.y - b.y);
  const apart = sorted.every((e, i) => i === 0 || e.y - (sorted[i - 1]?.y ?? 0) >= 14);
  if (series.length > 1 && apart) {
    for (const e of ends) {
      out.push(
        `<text x="${px(x(n - 1) + 10)}" y="${px(e.y + 4)}" font-size="12" fill="var(--text-primary)">${escapeHtml(e.name)}</text>`,
      );
    }
  }
  out.push('</svg>');
  return out.join('\n');
}

/** A chart in its card: caption, note, legend (for two or more series) and the SVG. */
export function chartFigure(caption: string, note: string, svg: string, legend = ''): string {
  return [
    '<figure class="chart">',
    `<figcaption>${escapeHtml(caption)}</figcaption>`,
    note === '' ? '' : `<p class="note">${inline(note)}</p>`,
    legend,
    svg,
    '</figure>',
  ]
    .filter((s) => s !== '')
    .join('\n');
}
