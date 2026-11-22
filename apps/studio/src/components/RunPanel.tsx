import { seconds } from '../format';

export interface ActiveRun {
  readonly phase: 'plan' | 'days' | 'statistics';
  readonly done: number;
  readonly total: number;
  readonly where: string;
  readonly controller: AbortController;
}

export type RunStatus =
  | { readonly kind: 'idle' }
  | {
      readonly kind: 'done';
      readonly days: number;
      readonly elapsedMs: number;
      readonly where: string;
    }
  | { readonly kind: 'cancelled' }
  | { readonly kind: 'error'; readonly message: string };

interface Props {
  readonly days: number;
  readonly onDays: (days: number) => void;
  readonly blocked: string | null;
  readonly active: ActiveRun | null;
  readonly status: RunStatus;
  readonly cores: number;
  readonly onRun: () => void;
  readonly onCancel: () => void;
}

const DAY_CHOICES = [10, 30, 100, 200];

function phaseText(active: ActiveRun): string {
  switch (active.phase) {
    case 'plan':
      return 'Preparing the run (arrival forecast)…';
    case 'days':
      return `Simulating day ${active.done} of ${active.total}${active.where === '' ? '' : ` on ${active.where}`}…`;
    case 'statistics':
      return 'Computing the statistics…';
  }
}

export function RunPanel(props: Props) {
  const { active, status } = props;
  const state = active !== null ? 'running' : status.kind;
  return (
    <section className="panel" aria-labelledby="h-run">
      <h2 id="h-run">
        <span className="step">4</span> Simulate
      </h2>
      <div className="field">
        <span className="label" id="days-label">
          Days to simulate (each with different passengers)
        </span>
        <div className="row" role="group" aria-labelledby="days-label">
          <div className="chips">
            {DAY_CHOICES.map((choice) => (
              <button
                key={choice}
                type="button"
                className="chip"
                aria-pressed={props.days === choice}
                onClick={() => {
                  props.onDays(choice);
                }}
              >
                {choice}
              </button>
            ))}
          </div>
          <label htmlFor="days" className="visually-hidden">
            Number of days
          </label>
          <input
            id="days"
            type="number"
            min={1}
            max={1000}
            step={1}
            value={props.days}
            style={{ width: '6.5em' }}
            onChange={(event) => {
              const value = Math.round(Number(event.target.value));
              if (Number.isFinite(value) && value >= 1) props.onDays(Math.min(1000, value));
            }}
          />
        </div>
      </div>
      <div className="row">
        <button
          id="run"
          type="button"
          className="btn btn-primary"
          disabled={active !== null || props.blocked !== null}
          onClick={props.onRun}
        >
          Simulate {props.days} day{props.days === 1 ? '' : 's'}
        </button>
        {active !== null && (
          <button id="cancel" type="button" className="btn" onClick={props.onCancel}>
            Cancel
          </button>
        )}
      </div>
      {props.blocked !== null && <p className="error">{props.blocked}</p>}
      <div id="run-status" data-state={state} className="status" aria-live="polite">
        {active !== null && (
          <>
            <div
              className="progress"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={active.total}
              aria-valuenow={active.done}
            >
              <div
                style={{ width: `${active.total === 0 ? 0 : (100 * active.done) / active.total}%` }}
              />
            </div>
            <span>{phaseText(active)}</span>
          </>
        )}
        {active === null && status.kind === 'done' && (
          <span>
            {status.days} days simulated in {seconds(status.elapsedMs)}
            {status.where === '' ? '' : ` on ${status.where}`}.{' '}
            <a href="#results">See the results</a>
          </span>
        )}
        {active === null && status.kind === 'cancelled' && <span>Cancelled.</span>}
        {active === null && status.kind === 'error' && <p className="error">{status.message}</p>}
        {active === null && status.kind === 'idle' && (
          <span>
            Runs here, on the {props.cores} processor cores of this device. Nothing leaves the page.
          </span>
        )}
      </div>
    </section>
  );
}
