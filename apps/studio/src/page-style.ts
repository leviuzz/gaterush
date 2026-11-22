import { REPORT_TOKENS_DARK, REPORT_TOKENS_LIGHT } from '@gateflow/sim-metrics';

/*
 * Styles of the Studio page. The colour tokens are those of the HTML reports, so a report looks the
 * same inside the Studio and on its own; the Studio adds an accent, status colours and its layout.
 */

const STUDIO_LIGHT = `
  --accent: #1f6fcf;
  --accent-ink: #ffffff;
  --accent-soft: #e6effa;
  --sim: #7a4b00;
  --sim-soft: #fbeccb;
  --danger: #a4231b;
  --danger-soft: #fbe4e2;
  --font: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  --mono: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;`;

const STUDIO_DARK = `
  --accent: #5b9df0;
  --accent-ink: #0b1220;
  --accent-soft: #19283b;
  --sim: #f3c46c;
  --sim-soft: #3a2b10;
  --danger: #f3a7a1;
  --danger-soft: #3d1715;`;

/** Layout: a set-up column beside the results on wide screens, one column on a phone. */
const LAYOUT = `
* { box-sizing: border-box; }
body {
  margin: 0;
  background: var(--page);
  color: var(--text-primary);
  font: 15px/1.5 var(--font);
  padding-left: max(16px, env(safe-area-inset-left, 0px));
  padding-right: max(16px, env(safe-area-inset-right, 0px));
}
.app { max-width: 1320px; margin: 0 auto; padding-block: 18px 56px; display: flex; flex-direction: column; gap: 18px; }
.topbar { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px 16px; }
.brand { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.brand h1 { font-size: 22px; line-height: 1.2; margin: 0; letter-spacing: -0.01em; text-wrap: balance; }
.brand p { margin: 0; color: var(--text-secondary); font-size: 14px; max-width: 70ch; }
.sim-badge { display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px; border-radius: 999px; background: var(--sim-soft); color: var(--sim); font-size: 12px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; white-space: nowrap; }
.layout { display: grid; grid-template-columns: minmax(0, 1fr); gap: 18px; align-items: start; }
@media (min-width: 1040px) { .layout { grid-template-columns: 410px minmax(0, 1fr); } }
.column { display: flex; flex-direction: column; gap: 14px; min-width: 0; }
.panel { background: var(--surface); border: 1px solid var(--border); border-radius: 10px; padding: 14px 16px 16px; display: flex; flex-direction: column; gap: 12px; min-width: 0; }
.panel > h2 { font-size: 15px; line-height: 1.3; margin: 0; display: flex; align-items: baseline; gap: 8px; }
.panel > h2 .step { color: var(--muted); font-variant-numeric: tabular-nums; font-weight: 600; }
.panel > h2 .aside { margin-left: auto; font-weight: 400; font-size: 13px; color: var(--text-secondary); }
.hint { margin: 0; font-size: 13px; color: var(--text-secondary); }
.field { display: grid; gap: 4px; min-width: 0; }
.field > label, .label { font-size: 13px; color: var(--text-secondary); }
select, input[type="number"], input[type="text"], textarea {
  font: inherit; font-size: 14px; color: var(--text-primary); background: var(--page);
  border: 1px solid var(--border); border-radius: 6px; padding: 6px 8px; width: 100%; min-width: 0;
}
textarea { font-family: var(--mono); font-size: 13px; resize: vertical; }
:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
code, .mono { font-family: var(--mono); font-size: 12.5px; }
.btn { font: inherit; font-size: 14px; border-radius: 6px; padding: 7px 12px; border: 1px solid var(--border); background: var(--page); color: var(--text-primary); cursor: pointer; white-space: nowrap; }
.btn:hover:not(:disabled) { border-color: var(--accent); }
.btn-primary { background: var(--accent); color: var(--accent-ink); border-color: transparent; font-weight: 600; }
.btn-small { font-size: 13px; padding: 3px 8px; }
.btn:disabled { opacity: 0.5; cursor: not-allowed; }
.row { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.chips { display: flex; flex-wrap: wrap; gap: 6px; }
.chip { font: inherit; font-size: 13px; padding: 3px 10px; border-radius: 999px; border: 1px solid var(--border); background: var(--page); color: var(--text-primary); cursor: pointer; font-variant-numeric: tabular-nums; }
.chip[aria-pressed="true"] { background: var(--accent-soft); border-color: var(--accent); color: var(--text-primary); font-weight: 600; }
.lever { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 2px 12px; align-items: baseline; }
.lever > label { font-size: 14px; }
.lever .value { font-variant-numeric: tabular-nums; font-weight: 600; white-space: nowrap; }
.lever.changed .value { color: var(--accent); }
.lever .base { grid-column: 1 / -1; font-size: 12px; color: var(--muted); }
.lever input[type="range"] { grid-column: 1 / -1; width: 100%; accent-color: var(--accent); margin: 2px 0 0; }
.levers { display: grid; gap: 14px; }
.policies { width: 100%; border-collapse: collapse; font-size: 14px; }
.policies th { font-size: 12px; font-weight: 600; color: var(--text-secondary); text-align: center; padding: 0 4px 6px; }
.policies th:first-child { text-align: left; }
.policies td { padding: 5px 4px; border-top: 1px solid var(--grid); vertical-align: middle; }
.policies td.mode { text-align: center; width: 1%; }
.policies .name { display: block; }
.policies .id { display: block; color: var(--muted); }
.policies input { width: 18px; height: 18px; accent-color: var(--accent); }
.progress { height: 6px; background: var(--grid); border-radius: 999px; overflow: hidden; }
.progress > div { height: 100%; background: var(--accent); transition: width 0.2s ease; }
.status { font-size: 13px; color: var(--text-secondary); font-variant-numeric: tabular-nums; }
.error { margin: 0; color: var(--danger); background: var(--danger-soft); border-radius: 6px; padding: 8px 10px; font-size: 13px; white-space: pre-wrap; overflow-wrap: anywhere; }
.facts { display: flex; flex-wrap: wrap; gap: 6px 18px; font-size: 13px; color: var(--text-secondary); }
.facts b { color: var(--text-primary); font-weight: 600; font-variant-numeric: tabular-nums; }
.table-wrap { overflow-x: auto; border: 1px solid var(--border); border-radius: 8px; background: var(--page); }
table.data { border-collapse: collapse; width: 100%; font-size: 13px; font-variant-numeric: tabular-nums; }
table.data th, table.data td { padding: 6px 10px; border-bottom: 1px solid var(--grid); text-align: left; vertical-align: top; }
table.data th { color: var(--text-secondary); font-weight: 600; }
table.data tr:last-child td { border-bottom: 0; }
table.data .num { text-align: right; white-space: nowrap; }
table.data td code { white-space: nowrap; }
.better { color: var(--series-3); font-weight: 600; }
.worse { color: var(--danger); font-weight: 600; }
.params { display: flex; flex-direction: column; gap: 0; }
.param { border-top: 1px solid var(--grid); padding: 8px 0; display: grid; gap: 4px; min-width: 0; }
.param:first-child { border-top: 0; }
.param-head { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 8px; min-width: 0; }
.param-head code { overflow-wrap: anywhere; }
.param .src { font-size: 11px; font-weight: 700; letter-spacing: 0.05em; color: var(--text-secondary); border: 1px solid var(--border); border-radius: 4px; padding: 0 5px; }
.param .src.edited { color: var(--accent); border-color: var(--accent); }
.param .val { font-family: var(--mono); font-size: 12.5px; color: var(--text-secondary); overflow-wrap: anywhere; }
.param .note { font-size: 12px; color: var(--muted); }
details > summary { cursor: pointer; font-size: 14px; font-weight: 600; }
details > summary.hint { font-weight: 400; }
a { color: var(--accent); }
details[open] > summary { margin-bottom: 8px; }
.runs { display: flex; flex-direction: column; gap: 6px; }
.run-item { display: flex; align-items: center; gap: 8px; padding: 6px 8px; border: 1px solid var(--border); border-radius: 6px; background: var(--page); font: inherit; font-size: 13px; color: var(--text-primary); text-align: left; cursor: pointer; width: 100%; }
.run-item[aria-current="true"] { border-color: var(--accent); background: var(--accent-soft); }
.run-item .when { margin-left: auto; color: var(--muted); white-space: nowrap; font-variant-numeric: tabular-nums; }
.report-frame { border-top: 1px solid var(--grid); padding-top: 4px; min-width: 0; }
.compare-pick { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 10px; }
.footer { color: var(--muted); font-size: 12px; display: flex; flex-wrap: wrap; gap: 4px 16px; }
.visually-hidden { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
@media (prefers-reduced-motion: reduce) { * { transition: none !important; } }
`;

/** The page's `<style>`: theme tokens (light, dark by preference, dark by choice), then layout. */
export const PAGE_STYLE = `
:root {${REPORT_TOKENS_LIGHT}${STUDIO_LIGHT}
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {${REPORT_TOKENS_DARK}${STUDIO_DARK}
  }
}
:root[data-theme="dark"] {${REPORT_TOKENS_DARK}${STUDIO_DARK}
}
${LAYOUT}`;

/** Styles inside the shadow root of a report: the report's own, on the page's tokens. */
export const REPORT_HOST_STYLE = `
:host { display: block; color: var(--text-primary); font: 15px/1.55 var(--font); }
.report { max-width: 1040px; }
`;
