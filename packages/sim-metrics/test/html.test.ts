import { describe, expect, it } from 'vitest';
import {
  escapeHtml,
  intervalsSvg,
  lineChartSvg,
  markdownSections,
  markdownToHtml,
  niceTicks,
  rangeBarsSvg,
} from '../src';
import { balancedTags } from './html-check';

describe('markdownToHtml', () => {
  it('converts the subset our reports use, escaping everything else', () => {
    const md = [
      '# Title with `code` & <b>tags</b>',
      '',
      '> **SIMULATED RESULTS** only.',
      '',
      'A paragraph with **bold**, `x | y` and a [link](docs/a.md).',
      'It continues on a second line.',
      '',
      '- first',
      '  - nested',
      '- second',
      '',
      '| Name | Value |',
      '|---|---:|',
      '| a \\| b | 1.5 |',
      '',
      '```bash',
      'gateflow-sim run --scenario <file>',
      '```',
    ].join('\n');
    expect(markdownToHtml(md)).toBe(
      [
        '<h1 id="title-with-code-b-tags-b">Title with <code>code</code> &amp; &lt;b&gt;tags&lt;/b&gt;</h1>',
        '<blockquote><p><strong>SIMULATED RESULTS</strong> only.</p></blockquote>',
        '<p>A paragraph with <strong>bold</strong>, <code>x | y</code> and a <a href="docs/a.md">link</a>. It continues on a second line.</p>',
        '<ul>\n<li>first<ul><li>nested</li></ul></li>\n<li>second</li>\n</ul>',
        '<div class="table"><table><thead><tr><th>Name</th><th class="right">Value</th></tr></thead><tbody>\n<tr><td>a | b</td><td class="right">1.5</td></tr>\n</tbody></table></div>',
        '<pre><code class="language-bash">gateflow-sim run --scenario &lt;file&gt;</code></pre>',
      ].join('\n'),
    );
  });

  it('splits a report into its preamble and its level-2 sections', () => {
    const { preamble, sections } = markdownSections(
      '# T\n\nintro\n\n## 1. A\n\na\n\n## 2. B\n\nb\n',
    );
    expect(preamble).toBe('# T\n\nintro\n');
    expect(sections).toEqual(['## 1. A\n\na\n', '## 2. B\n\nb\n']);
    expect(escapeHtml('<"&>')).toBe('&lt;&quot;&amp;&gt;');
  });
});

describe('charts', () => {
  it('chooses clean ticks covering the data', () => {
    expect(niceTicks(0, 55)).toEqual([0, 20, 40, 60]);
    expect(niceTicks(0, 55, 10)).toEqual([0, 10, 20, 30, 40, 50, 60]);
    expect(niceTicks(-3, 4.2)).toEqual([-4, -2, 0, 2, 4, 6]);
    expect(niceTicks(0.011, 0.07)).toEqual([0, 0.02, 0.04, 0.06, 0.08]);
    expect(niceTicks(5, 5)).toEqual([4, 4.5, 5, 5.5, 6]);
  });

  it('draws well-formed, deterministic SVG with a text alternative for every mark', () => {
    const bars = rangeBarsSvg(
      [
        { label: 'fifo', value: 55.1, low: 30, high: 90, emphasis: false },
        { label: 'priority-v3', value: 11.5, low: 4, high: 22, emphasis: true },
      ],
      { label: 'Missed flights' },
    );
    const forest = intervalsSvg([{ label: 'v3 vs A&apos;', mean: 3.2, lower: 2.4, upper: 4 }], {
      label: 'Net saved',
    });
    const lines = lineChartSvg({
      label: 'Missed by K',
      categories: ['10', '30', '60'],
      baseIndex: 1,
      series: [
        { name: 'priority-v3', slot: 1, values: [20, 11.5, 11.4] },
        { name: 'fifo-manual', slot: 2, values: [14.7, 14.7, 14.7] },
      ],
      band: { lower: [18, 10, 10], upper: [22, 13, 13] },
    });
    for (const svg of [bars, forest, lines]) {
      expect(balancedTags(svg)).toBe(true);
      expect(svg).not.toMatch(/NaN|undefined|Infinity/);
      expect(svg).toContain('<title>');
    }
    expect(bars).toContain('fill="var(--series-1)"');
    expect(bars).toContain('fill="var(--deemph)"');
    expect(bars).toContain('priority-v3: 11.5 (spread 4.0 to 22.0)');
    expect(forest).toContain('3.2 [2.4, 4.0]');
    expect(forest).toContain('&amp;apos;');
    expect(lines).toContain('(base)');
    expect(lines).toContain('priority-v3, 30: 11.5 [10.0, 13.0]');
    expect(
      lineChartSvg({
        label: 'x',
        categories: ['10', '30', '60'],
        series: [{ name: 'a', slot: 1, values: [1, 2, 3] }],
      }),
    ).toBe(
      lineChartSvg({
        label: 'x',
        categories: ['10', '30', '60'],
        series: [{ name: 'a', slot: 1, values: [1, 2, 3] }],
      }),
    );
  });

  it('labels line ends only when they do not collide', () => {
    const chart = (second: number) =>
      lineChartSvg({
        label: 'x',
        categories: ['a', 'b'],
        series: [
          { name: 'one', slot: 1, values: [10, 10] },
          { name: 'two', slot: 2, values: [0, second] },
        ],
      });
    expect(chart(0)).toContain('>two</text>');
    expect(chart(10)).not.toContain('>two</text>');
  });
});
