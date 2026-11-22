import type { Scenario } from '@gateflow/sim-scenarios';
import { LEVERS } from '@gateflow/studio-core';
import type { Lever } from '@gateflow/studio-core';
import { num, signed } from '../format';

interface Props {
  readonly base: Scenario;
  readonly values: Readonly<Record<string, number>>;
  readonly onChange: (id: string, value: number | undefined) => void;
  readonly onReset: () => void;
}

const RELATIVE = new Set(['lanes', 'arrivals']);

function show(lever: Lever, value: number): string {
  if (lever.unit === 'share') return `${Math.round(value * 100)}%`;
  if (lever.unit === '×') return `×${num(value, 2)}`;
  const digits = Number.isInteger(value) ? 0 : 1;
  return `${RELATIVE.has(lever.id) ? signed(value, digits) : num(value, digits)} ${lever.unit}`;
}

export function LeversPanel({ base, values, onChange, onReset }: Props) {
  const levers = LEVERS.flatMap((lever) => {
    const original = lever.base(base);
    return original === null ? [] : [{ lever, original }];
  });
  const changed = levers.some(({ lever, original }) => (values[lever.id] ?? original) !== original);
  return (
    <section className="panel" aria-labelledby="h-levers">
      <h2 id="h-levers">
        <span className="step">2</span> What if
        {changed && (
          <button type="button" className="btn btn-small aside" onClick={onReset}>
            Back to the scenario
          </button>
        )}
      </h2>
      <p className="hint">
        Change a condition of the day and see what it does to each policy. Changed values are marked
        as assumptions in the report.
      </p>
      <div className="levers">
        {levers.map(({ lever, original }) => {
          const value = values[lever.id] ?? original;
          const isChanged = value !== original;
          return (
            <div key={lever.id} className={isChanged ? 'lever changed' : 'lever'}>
              <label htmlFor={`lever-${lever.id}`}>{lever.label}</label>
              <span className="value">{show(lever, value)}</span>
              <input
                id={`lever-${lever.id}`}
                type="range"
                min={Math.min(lever.min, original)}
                max={Math.max(lever.max, original)}
                step={lever.step}
                value={value}
                onChange={(event) => {
                  const next = Number(event.target.value);
                  onChange(lever.id, next === original ? undefined : next);
                }}
              />
              <span className="base">
                {isChanged ? `The scenario says ${show(lever, original)}` : 'As in the scenario'}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
