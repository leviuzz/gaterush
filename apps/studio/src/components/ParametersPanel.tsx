import { useState } from 'react';
import { SOURCE_LABELS, ScenarioValidationError } from '@gateflow/sim-scenarios';
import type { Scenario, SourceLabel } from '@gateflow/sim-scenarios';
import { scenarioParameters, withParameter } from '@gateflow/studio-core';
import type { ParameterChange } from '@gateflow/studio-core';
import { valueText } from '../format';

interface Props {
  /** The scenario with the what-if settings, before the edits of this panel. */
  readonly scenario: Scenario;
  readonly edits: Readonly<Record<string, ParameterChange>>;
  readonly onEdit: (path: string, change: ParameterChange | undefined) => void;
}

interface Draft {
  readonly path: string;
  readonly value: string;
  readonly source: SourceLabel;
  readonly note: string;
  readonly issues: readonly string[];
}

/** Every labelled parameter of the scenario, each editable with its source. */
export function ParametersPanel({ scenario, edits, onEdit }: Props) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const parameters = scenarioParameters(scenario);
  const apply = (d: Draft) => {
    let value: unknown;
    try {
      value = JSON.parse(d.value);
    } catch {
      setDraft({
        ...d,
        issues: ['The value is not valid JSON (numbers, "text", [lists], {objects}).'],
      });
      return;
    }
    const change: ParameterChange = { value, source: d.source, note: d.note.trim() };
    try {
      withParameter(scenario, d.path, change);
    } catch (error) {
      setDraft({
        ...d,
        issues:
          error instanceof ScenarioValidationError
            ? error.issues
            : [error instanceof Error ? error.message : String(error)],
      });
      return;
    }
    onEdit(d.path, change);
    setDraft(null);
  };
  return (
    <details className="panel">
      <summary>
        All parameters ({parameters.length})
        {Object.keys(edits).length > 0 ? `, ${Object.keys(edits).length} edited` : ''}
      </summary>
      <p className="hint">
        Every value of the scenario with its source. Edit one to enter your airport&apos;s figure:
        give its source (AIRPORT_PROVIDED, MEASURED) so that the report says where it comes from.
      </p>
      <div className="params">
        {parameters.map((parameter) => {
          const edit = edits[parameter.path];
          const shown = edit === undefined ? parameter : { ...parameter, ...edit };
          const editing = draft?.path === parameter.path ? draft : null;
          return (
            <div key={parameter.path} className="param">
              <div className="param-head">
                <code>{parameter.path}</code>
                <span className={edit === undefined ? 'src' : 'src edited'}>{shown.source}</span>
                {editing === null && (
                  <button
                    type="button"
                    className="btn btn-small"
                    onClick={() => {
                      setDraft({
                        path: parameter.path,
                        value: JSON.stringify(shown.value, null, 1),
                        source: edit?.source ?? 'AIRPORT_PROVIDED',
                        note: edit?.note ?? '',
                        issues: [],
                      });
                    }}
                  >
                    Edit
                  </button>
                )}
                {edit !== undefined && editing === null && (
                  <button
                    type="button"
                    className="btn btn-small"
                    onClick={() => {
                      onEdit(parameter.path, undefined);
                    }}
                  >
                    Undo
                  </button>
                )}
              </div>
              {editing === null ? (
                <>
                  <span className="val">{valueText(shown.value)}</span>
                  {shown.note !== null && shown.note !== '' && (
                    <span className="note">{shown.note}</span>
                  )}
                </>
              ) : (
                <div className="field">
                  <label htmlFor="param-value">Value (JSON)</label>
                  <textarea
                    id="param-value"
                    rows={Math.min(10, editing.value.split('\n').length + 1)}
                    value={editing.value}
                    onChange={(event) => {
                      setDraft({ ...editing, value: event.target.value, issues: [] });
                    }}
                  />
                  <label htmlFor="param-source">Source</label>
                  <select
                    id="param-source"
                    value={editing.source}
                    onChange={(event) => {
                      setDraft({ ...editing, source: event.target.value as SourceLabel });
                    }}
                  >
                    {SOURCE_LABELS.map((label) => (
                      <option key={label} value={label}>
                        {label}
                      </option>
                    ))}
                  </select>
                  <label htmlFor="param-note">Note</label>
                  <input
                    id="param-note"
                    type="text"
                    value={editing.note}
                    placeholder="Where the value comes from"
                    onChange={(event) => {
                      setDraft({ ...editing, note: event.target.value });
                    }}
                  />
                  {editing.issues.length > 0 && (
                    <p className="error">{editing.issues.join('\n')}</p>
                  )}
                  <div className="row">
                    <button
                      type="button"
                      className="btn btn-primary btn-small"
                      onClick={() => {
                        apply(editing);
                      }}
                    >
                      Apply
                    </button>
                    <button
                      type="button"
                      className="btn btn-small"
                      onClick={() => {
                        setDraft(null);
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </details>
  );
}
