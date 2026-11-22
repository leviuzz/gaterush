import { LANE_MODE_COLUMNS, POLICY_ROWS, policyName } from '../policies';
import type { PolicyRow } from '../policies';

interface Props {
  readonly chosen: ReadonlySet<string>;
  readonly ordered: readonly string[];
  readonly onToggle: (id: string) => void;
  readonly baselineId: string | undefined;
  readonly onBaseline: (id: string) => void;
  /** False when the checkpoint has no staff on call: extra lanes cannot open. */
  readonly extraLanes: boolean;
}

function rows(list: readonly PolicyRow[], props: Props) {
  return list.map((row) => (
    <tr key={row.id}>
      <td>
        <span className="name">{row.name}</span>
        <code className="id">{row.id}</code>
      </td>
      {LANE_MODE_COLUMNS.map((mode) => {
        const id = `${row.id}${mode.suffix}`;
        const disabled = mode.suffix !== '' && !props.extraLanes;
        return (
          <td key={mode.suffix} className="mode">
            <input
              type="checkbox"
              id={`policy-${id}`}
              aria-label={`${row.name}: ${mode.label}`}
              checked={props.chosen.has(id)}
              disabled={disabled}
              onChange={() => {
                props.onToggle(id);
              }}
            />
          </td>
        );
      })}
    </tr>
  ));
}

export function PoliciesPanel(props: Props) {
  const main = POLICY_ROWS.filter((row) => row.earlier !== true);
  const earlier = POLICY_ROWS.filter((row) => row.earlier === true);
  const earlierChosen = earlier.some((row) =>
    LANE_MODE_COLUMNS.some((mode) => props.chosen.has(`${row.id}${mode.suffix}`)),
  );
  return (
    <section className="panel" aria-labelledby="h-policies">
      <h2 id="h-policies">
        <span className="step">3</span> Policies to compare
      </h2>
      <p className="hint">
        Every policy runs on the same passengers. Lanes follow the plan, or open beyond it: by a
        supervisor who sees a long queue (today), or on GateFlow&apos;s recommendation.
        {props.extraLanes
          ? ''
          : ' This checkpoint has no staff on call, so no lane opens beyond the plan.'}
      </p>
      <div className="table-wrap">
        <table className="policies">
          <thead>
            <tr>
              <th scope="col">Policy</th>
              {LANE_MODE_COLUMNS.map((mode) => (
                <th key={mode.suffix} scope="col" title={mode.label}>
                  {mode.short}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>{rows(main, props)}</tbody>
        </table>
      </div>
      <details open={earlierChosen}>
        <summary>Earlier GateFlow versions</summary>
        <div className="table-wrap">
          <table className="policies">
            <tbody>{rows(earlier, props)}</tbody>
          </table>
        </div>
      </details>
      <div className="field">
        <label htmlFor="baseline">Status quo (the reference of the headline)</label>
        <select
          id="baseline"
          value={props.baselineId ?? ''}
          disabled={props.ordered.length === 0}
          onChange={(event) => {
            props.onBaseline(event.target.value);
          }}
        >
          {props.ordered.map((id) => (
            <option key={id} value={id}>
              {policyName(id)}
            </option>
          ))}
        </select>
      </div>
    </section>
  );
}
