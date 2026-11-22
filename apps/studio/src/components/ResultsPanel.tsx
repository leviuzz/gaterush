import { useState } from 'react';
import { renderHtmlReport, renderReport, stringifyResults } from '@gateflow/sim-metrics';
import type { DayJob, ResultsDocument } from '@gateflow/sim-metrics';
import type { Scenario } from '@gateflow/sim-scenarios';
import { scenarioFileText } from '@gateflow/studio-core';
import { copyText, saveFile } from '../exports';
import type { SaveOutcome } from '../exports';
import { interval, num, thousands } from '../format';
import { policyName } from '../policies';
import { ReportView } from './ReportView';

export interface Run {
  readonly id: number;
  readonly label: string;
  readonly doc: ResultsDocument;
  /** The scenario simulated (null for a results file loaded to compare). */
  readonly scenario: Scenario | null;
  /** The work of one day of the run, to replay a day (null for a results file). */
  readonly job: DayJob | null;
}

interface Props {
  readonly run: Run;
  /** True when the page can save files (itself, or through the viewer). */
  readonly canSave: boolean;
}

const SAVE_MESSAGES: Readonly<Record<SaveOutcome, string>> = {
  saved: '',
  declined: 'Not saved.',
  unavailable: 'Saving files is not available here: copy the text instead.',
};

interface Export {
  readonly id: string;
  readonly label: string;
  readonly file: string;
  readonly type: string;
  readonly text: () => string;
}

function exportsOf(run: Run): Export[] {
  const { doc, scenario } = run;
  const id = doc.manifest.scenario.id;
  return [
    {
      id: 'results',
      label: 'results.json',
      file: `${id}.results.json`,
      type: 'application/json',
      text: () => stringifyResults(doc),
    },
    {
      id: 'report-html',
      label: 'report.html',
      file: `${id}.report.html`,
      type: 'text/html',
      text: () => renderHtmlReport(doc),
    },
    {
      id: 'report-md',
      label: 'report.md',
      file: `${id}.report.md`,
      type: 'text/markdown',
      text: () => renderReport(doc),
    },
    ...(scenario === null
      ? []
      : [
          {
            id: 'scenario',
            label: 'scenario for the CLI',
            file: `${id}.json`,
            type: 'application/json',
            text: () => scenarioFileText(scenario),
          },
        ]),
  ];
}

export function ResultsPanel({ run, canSave }: Props) {
  const { doc } = run;
  const { manifest, summary } = doc;
  const [copied, setCopied] = useState<{ id: string; ok: boolean; text?: string } | null>(null);
  const [saveMessage, setSaveMessage] = useState('');
  const comparisons = Object.values(summary.comparisons);
  return (
    <section id="results" className="panel" aria-labelledby="h-results" data-run-id={run.id}>
      <h2 id="h-results">
        Results: {manifest.scenario.title}
        <span className="sim-badge aside">Simulated</span>
      </h2>
      <div className="facts">
        <span>
          <b>{summary.days}</b> simulated days
        </span>
        <span>
          about <b>{thousands(summary.peoplePerDay.mean)}</b> people per day
        </span>
        <span>
          status quo <b>{policyName(manifest.baselinePolicyId)}</b>
        </span>
        <span className="mono">
          {manifest.generator.name} {manifest.generator.version}, {manifest.commit.slice(0, 12)}
        </span>
      </div>
      <div className="table-wrap">
        <table className="data" id="summary">
          <thead>
            <tr>
              <th scope="col">Policy</th>
              <th scope="col" className="num">
                Missed flights per day
              </th>
              <th scope="col" className="num">
                P5–P95 across days
              </th>
              <th scope="col" className="num">
                Waiting, P90 (min)
              </th>
              <th scope="col" className="num">
                Extra lane-hours per day
              </th>
            </tr>
          </thead>
          <tbody>
            {manifest.policies.map((policy) => {
              const m = summary.policies[policy.id];
              if (m === undefined) return null;
              return (
                <tr key={policy.id}>
                  <td>
                    {policyName(policy.id)} <code>{policy.id}</code>
                  </td>
                  <td className="num">
                    <b>{num(m.missed.mean)}</b>
                  </td>
                  <td className="num">
                    {num(m.missed.p05)}–{num(m.missed.p95)}
                  </td>
                  <td className="num">{num(m.waitP90Min.mean)}</td>
                  <td className="num">{num(m.extraLaneHours.mean)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="table-wrap">
        <table className="data" id="comparisons">
          <thead>
            <tr>
              <th scope="col">Comparison, on the same passengers</th>
              <th scope="col" className="num">
                Net flights saved per day [95% CI]
              </th>
              <th scope="col" className="num">
                Extra lane-hours
              </th>
            </tr>
          </thead>
          <tbody>
            {comparisons.map((c) => {
              const net = c.metrics.net;
              const tone = net.ciLower > 0 ? 'better' : net.ciUpper < 0 ? 'worse' : '';
              return (
                <tr key={`${c.candidateId} vs ${c.referenceId}`}>
                  <td>
                    <code>{c.candidateId}</code> vs <code>{c.referenceId}</code>
                  </td>
                  <td className={`num ${tone}`}>{interval(net.mean, net.ciLower, net.ciUpper)}</td>
                  <td className="num">{num(c.metrics.extraLaneHoursDelta.mean)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="field">
        <span className="label">
          {canSave ? 'Save or copy' : 'Copy'} the results, the report or the scenario (the CLI gives
          the same results from the same scenario)
        </span>
        <div className="row">
          {exportsOf(run).map((item) => (
            <span key={item.id} className="row">
              {canSave && (
                <button
                  id={`download-${item.id}`}
                  type="button"
                  className="btn btn-small"
                  onClick={() => {
                    void saveFile(item.file, item.text(), item.type).then((outcome) => {
                      setSaveMessage(SAVE_MESSAGES[outcome]);
                    });
                  }}
                >
                  Save {item.label}
                </button>
              )}
              {item.id !== 'report-html' && (
                <button
                  id={`copy-${item.id}`}
                  type="button"
                  className="btn btn-small"
                  onClick={() => {
                    const text = item.text();
                    void copyText(text).then((ok) => {
                      setCopied(ok ? { id: item.id, ok } : { id: item.id, ok, text });
                    });
                  }}
                >
                  {copied?.id === item.id && copied.ok ? 'Copied' : `Copy ${item.label}`}
                </button>
              )}
            </span>
          ))}
        </div>
        {saveMessage !== '' && <p className="hint">{saveMessage}</p>}
        {copied !== null && !copied.ok && copied.text !== undefined && (
          <>
            <p className="hint">
              This browser does not allow copying from the page: select the text below.
            </p>
            <textarea
              readOnly
              rows={6}
              value={copied.text}
              onFocus={(event) => {
                event.target.select();
              }}
            />
          </>
        )}
      </div>
      <p className="hint">
        <a href="#replay">Replay a day of this run</a>: every call with its reason, every passenger.
      </p>
    </section>
  );
}

/** The CLI's full report of a run. */
export function ReportPanel({ doc }: { readonly doc: ResultsDocument }) {
  return (
    <section className="panel" aria-labelledby="h-report">
      <details open>
        <summary id="h-report">Full report</summary>
        <ReportView doc={doc} />
      </details>
    </section>
  );
}
