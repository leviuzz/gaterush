import { countUntil, lanesAt, stateAt } from '@gateflow/sim-trace';
import type { ReplayModel, RunView } from '../../replay-model';
import { priorityAt } from '../../replay-model';

interface Props {
  readonly model: ReplayModel;
  readonly view: RunView;
  /** Colour slot of the policy in the charts. */
  readonly slot: 1 | 2;
  readonly role: 'reference' | 'candidate';
  readonly atMs: number;
  readonly onSelect: (party: number) => void;
}

interface StageRow {
  readonly id: string;
  readonly label: string;
  readonly people: number;
  readonly standing: boolean;
}

/** The checkpoint of one policy at one moment: people in each stage, the lanes, the misses. */
export function CheckpointCard({ model, view, slot, role, atMs, onSelect }: Props) {
  const state = stateAt(view.timeline, atMs);
  const rows: StageRow[] = view.physical
    ? [{ id: 'line', label: 'In line, standing', people: state.waiting, standing: true }]
    : [
        {
          id: 'waiting',
          label: 'Waiting freely, not standing',
          people: state.waiting,
          standing: false,
        },
        { id: 'called', label: 'Called, on their way', people: state.called, standing: false },
        {
          id: 'absent',
          label: 'Missed the call, not back yet',
          people: state.absent,
          standing: false,
        },
        { id: 'lanes', label: 'At the lanes, standing', people: state.atLanes, standing: true },
      ];
  const lanes = lanesAt(view.screenings, atMs);
  const missed = countUntil(view.missed, atMs);
  const doc = model.doc;
  return (
    <article className={`ckpt ckpt-${role}`} aria-label={`${view.name} at this moment`}>
      <header className="ckpt-head">
        <i className="swatch" style={{ background: `var(--series-${slot})` }} aria-hidden="true" />
        <span className="ckpt-name">{view.name}</span>
        <code>{view.policy.id}</code>
      </header>
      <div className="stages">
        {rows.map((row) => (
          <div
            key={row.id}
            className={`stage${row.standing ? ' standing' : ''}`}
            data-stage={row.id}
          >
            <span className="stage-label">{row.label}</span>
            <span className="stage-value">{row.people}</span>
            <span className="stage-bar" aria-hidden="true">
              <span
                style={{
                  width: `${Math.min(100, (row.people / model.peak) * 100)}%`,
                  background: row.standing ? `var(--series-${slot})` : 'var(--deemph)',
                }}
              />
            </span>
          </div>
        ))}
      </div>
      <div className="lane-row">
        <span className="stage-label">
          Lanes: {state.lanesOpen} open
          {state.extraLanes > 0 ? `, ${state.extraLanes} extra` : ''}
        </span>
        <ul className="lanes">
          {Array.from({ length: model.lanes }, (_, lane) => {
            const party = lanes[lane] ?? null;
            const open = lane < state.lanesOpen;
            const passenger = party === null ? undefined : doc.day.passengers[party];
            const flight =
              passenger === undefined ? undefined : doc.day.flights[passenger.flightIndex];
            const priority = party !== null && priorityAt(view, party, atMs);
            const kind = party === null ? (open ? 'idle' : 'closed') : open ? 'busy' : 'closing';
            const label =
              party === null
                ? `Lane ${lane + 1}: ${open ? 'open, free' : 'closed'}`
                : `Lane ${lane + 1}: screening ${passenger?.id ?? ''} (flight ${flight?.id ?? ''})` +
                  (priority ? ', called by priority' : '') +
                  (open ? '' : ', closing after this party');
            return (
              <li key={lane}>
                <button
                  type="button"
                  className={`lane lane-${kind}${priority ? ' lane-priority' : ''}`}
                  style={party === null ? undefined : { background: `var(--series-${slot})` }}
                  title={label}
                  aria-label={label}
                  disabled={party === null}
                  onClick={() => {
                    if (party !== null) onSelect(party);
                  }}
                />
              </li>
            );
          })}
        </ul>
      </div>
      <div className="ckpt-foot">
        <span>
          Missed their flight so far: <b>{missed}</b>
        </span>
        {role === 'candidate' && (
          <span>
            Saved: <b className="better">{countUntil(model.saved, atMs)}</b>, lost:{' '}
            <b className={countUntil(model.harmed, atMs) > 0 ? 'worse' : ''}>
              {countUntil(model.harmed, atMs)}
            </b>
          </span>
        )}
      </div>
    </article>
  );
}
