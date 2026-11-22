import { compareRuns } from '@gateflow/studio-core';
import { interval, num, signed, valueText } from '../format';
import type { Run } from './ResultsPanel';

interface Props {
  readonly runs: readonly Run[];
  readonly pair: readonly [number | null, number | null];
  readonly onPair: (pair: readonly [number | null, number | null]) => void;
  readonly onAddFiles: (files: FileList) => void;
  readonly fileErrors: readonly string[];
}

export function ComparePanel({ runs, pair, onPair, onAddFiles, fileErrors }: Props) {
  const a = runs.find((run) => run.id === pair[0]);
  const b = runs.find((run) => run.id === pair[1]);
  const comparison =
    a !== undefined && b !== undefined && a !== b ? compareRuns(a.doc, b.doc) : null;
  const picker = (side: 0 | 1, label: string) => (
    <div className="field">
      <label htmlFor={`compare-${side === 0 ? 'a' : 'b'}`}>{label}</label>
      <select
        id={`compare-${side === 0 ? 'a' : 'b'}`}
        value={pair[side] ?? ''}
        onChange={(event) => {
          const id = event.target.value === '' ? null : Number(event.target.value);
          onPair(side === 0 ? [id, pair[1]] : [pair[0], id]);
        }}
      >
        <option value="">Choose a run</option>
        {runs.map((run) => (
          <option key={run.id} value={run.id}>
            {run.label}
          </option>
        ))}
      </select>
    </div>
  );
  return (
    <section className="panel" aria-labelledby="h-compare">
      <h2 id="h-compare">Compare two runs</h2>
      <p className="hint">
        Runs of this session, or results files of the CLI or of the Studio (for instance the
        published reports). The table shows what changed between them.
      </p>
      <div className="compare-pick">
        {picker(0, 'First run')}
        {picker(1, 'Second run')}
      </div>
      <div className="field">
        <label htmlFor="results-files">Add results files (results.json)</label>
        <input
          id="results-files"
          type="file"
          multiple
          accept=".json"
          onChange={(event) => {
            if (event.target.files !== null && event.target.files.length > 0)
              onAddFiles(event.target.files);
            event.target.value = '';
          }}
        />
        {fileErrors.map((error) => (
          <p key={error} className="error">
            {error}
          </p>
        ))}
      </div>
      {comparison !== null && (
        <>
          <div className="table-wrap">
            <table className="data" id="compare-policies">
              <thead>
                <tr>
                  <th scope="col">Missed flights per day</th>
                  <th scope="col" className="num">
                    First
                  </th>
                  <th scope="col" className="num">
                    Second
                  </th>
                  <th scope="col" className="num">
                    Change
                  </th>
                </tr>
              </thead>
              <tbody>
                {comparison.policies.map((row) => {
                  const [x, y] = row.missed;
                  const change = x === null || y === null ? null : y - x;
                  return (
                    <tr key={row.id}>
                      <td>
                        <code>{row.id}</code>
                      </td>
                      <td className="num">{x === null ? '–' : num(x)}</td>
                      <td className="num">{y === null ? '–' : num(y)}</td>
                      <td
                        className={
                          change === null
                            ? 'num'
                            : change < 0
                              ? 'num better'
                              : change > 0
                                ? 'num worse'
                                : 'num'
                        }
                      >
                        {change === null ? '–' : signed(change)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th scope="col">Net flights saved per day [95% CI]</th>
                  <th scope="col" className="num">
                    First
                  </th>
                  <th scope="col" className="num">
                    Second
                  </th>
                </tr>
              </thead>
              <tbody>
                {comparison.comparisons.map((row) => (
                  <tr key={row.key}>
                    <td>
                      <code>{row.key}</code>
                    </td>
                    {row.net.map((value, i) => (
                      <td key={i} className="num">
                        {value === null ? '–' : interval(value.mean, value.lower, value.upper)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="table-wrap">
            <table className="data" id="compare-parameters">
              <thead>
                <tr>
                  <th scope="col">Assumption that differs</th>
                  <th scope="col">First</th>
                  <th scope="col">Second</th>
                </tr>
              </thead>
              <tbody>
                {comparison.parameters.length === 0 && (
                  <tr>
                    <td colSpan={3}>None: the two runs make the same assumptions.</td>
                  </tr>
                )}
                {comparison.parameters.map((row) => (
                  <tr key={row.path}>
                    <td>
                      <code>{row.path}</code>
                    </td>
                    <td className="mono">
                      {row.values[0] === undefined ? '–' : valueText(row.values[0], 120)}
                    </td>
                    <td className="mono">
                      {row.values[1] === undefined ? '–' : valueText(row.values[1], 120)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="hint">
            {comparison.runs[0].days} and {comparison.runs[1].days} simulated days; scenarios{' '}
            <code>{comparison.runs[0].scenarioId}</code> and{' '}
            <code>{comparison.runs[1].scenarioId}</code>.
          </p>
        </>
      )}
    </section>
  );
}
