import { useState } from 'react';
import { clock, explainCommitment } from '@gateflow/sim-trace';
import type { ReplayModel, RunView } from '../../replay-model';
import { latestCommitments } from '../../replay-model';

interface Props {
  readonly model: ReplayModel;
  readonly view: RunView;
  readonly atMs: number;
  readonly onSelect: (party: number) => void;
}

const SHOWN = 8;

/** The latest decisions of who is called next, each with the engine's reason. */
export function CallsList({ model, view, atMs, onSelect }: Props) {
  const [onlyPriority, setOnlyPriority] = useState(false);
  const indexes = latestCommitments(view, atMs, SHOWN, onlyPriority);
  const { day } = model.doc;
  return (
    <section className="calls" aria-labelledby="h-calls">
      <div className="calls-head">
        <h3 id="h-calls">Latest calls of {view.name}</h3>
        <label className="check">
          <input
            id="calls-priority"
            type="checkbox"
            checked={onlyPriority}
            onChange={(event) => {
              setOnlyPriority(event.target.checked);
            }}
          />
          Priority calls only
        </label>
      </div>
      {indexes.length === 0 ? (
        <p className="hint">
          {onlyPriority ? 'No priority call yet at this time.' : 'Nobody has been called yet.'}
        </p>
      ) : (
        <ol className="call-list" id="calls-list">
          {indexes.map((k) => {
            const event = view.run.events[k];
            if (event?.type !== 'QUEUE' || event.event.type !== 'COMMITTED') return null;
            const commitment = event.event;
            const passenger = day.passengers[event.party];
            const flight = passenger === undefined ? undefined : day.flights[passenger.flightIndex];
            const explanation = explainCommitment(commitment, {
              policy: view.policy,
              knownDeadlineMs: view.known.get(k) ?? null,
            });
            return (
              <li key={k}>
                <button
                  type="button"
                  className="call"
                  data-reason={explanation.code}
                  onClick={() => {
                    onSelect(event.party);
                  }}
                >
                  <span className="call-time mono">{clock(event.atMs, { seconds: true })}</span>
                  <span className="call-who">
                    <code>{commitment.ticketId}</code> flight {flight?.id ?? '?'}
                    {(passenger?.partySize ?? 1) > 1 ? `, ${passenger?.partySize ?? 1} people` : ''}
                  </span>
                  <span className={`badge${explanation.priority ? ' badge-priority' : ''}`}>
                    {explanation.title}
                  </span>
                  <code className="reason-code">{explanation.code}</code>
                </button>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
