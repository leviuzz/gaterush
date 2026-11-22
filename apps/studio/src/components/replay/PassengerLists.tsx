import { useState } from 'react';
import { clock } from '@gateflow/sim-trace';
import type { PartyPair } from '@gateflow/sim-trace';
import { num } from '../../format';
import type { ReplayModel } from '../../replay-model';

interface Props {
  readonly model: ReplayModel;
  readonly selected: number | null;
  readonly onSelect: (party: number) => void;
}

type ListId = 'saved' | 'harmed' | 'delayed';

const PAGE = 25;
const MINUTE = 60_000;

/** The passengers a day is about: saved, lost, and those who waited longer for others. */
export function PassengerLists({ model, selected, onSelect }: Props) {
  const [list, setList] = useState<ListId>('saved');
  const [shown, setShown] = useState(PAGE);
  const { doc, pairs, candidate, reference } = model;
  const closes = (pair: PartyPair) => {
    const passenger = doc.day.passengers[pair.party];
    return passenger === undefined
      ? 0
      : (doc.day.flights[passenger.flightIndex]?.boardingCloseMs ?? 0);
  };
  const lists: Record<ListId, { label: string; hint: string; rows: PartyPair[] }> = {
    saved: {
      label: 'Saved',
      hint: `Missed the flight with ${reference.name}, made it with ${candidate.name}: the same passengers on the same day.`,
      rows: pairs.filter((p) => p.category === 'SAVED').sort((a, b) => closes(a) - closes(b)),
    },
    harmed: {
      label: `Missed only with ${candidate.policy.id}`,
      hint: `Made it with ${reference.name}, missed it with ${candidate.name}. They count against the policy.`,
      rows: pairs.filter((p) => p.category === 'HARMED').sort((a, b) => closes(a) - closes(b)),
    },
    delayed: {
      label: 'Waited longer for others',
      hint: `Never called by priority, and waited longer with ${candidate.name}: the price of the priority calls, which K bounds.`,
      rows: pairs
        .filter((p) => !p.candidatePriority && p.waitDeltaMs > 0)
        .sort((a, b) => b.waitDeltaMs - a.waitDeltaMs || a.party - b.party),
    },
  };
  const current = lists[list];
  const people = (rows: PartyPair[]) =>
    rows.reduce((n, p) => n + (doc.day.passengers[p.party]?.partySize ?? 0), 0);
  return (
    <section className="lists" aria-labelledby="h-lists">
      <h3 id="h-lists">Passengers of the day</h3>
      <div className="chips" role="tablist" aria-label="Lists of passengers">
        {(Object.keys(lists) as ListId[]).map((id) => (
          <button
            key={id}
            id={`list-${id}`}
            type="button"
            role="tab"
            className="chip"
            aria-selected={list === id}
            aria-pressed={list === id}
            onClick={() => {
              setList(id);
              setShown(PAGE);
            }}
          >
            {lists[id].label} ({people(lists[id].rows)})
          </button>
        ))}
      </div>
      <p className="hint">{current.hint} Counts are in people; a row is a ticket.</p>
      {current.rows.length === 0 ? (
        <p className="hint">Nobody on this day.</p>
      ) : (
        <div className="table-wrap">
          <table className="data" id={`table-${list}`}>
            <thead>
              <tr>
                <th scope="col">Ticket</th>
                <th scope="col">Flight, boarding closes</th>
                <th scope="col" className="num">
                  Arrived
                </th>
                <th scope="col" className="num">
                  Wait (min): {reference.policy.id} → {candidate.policy.id}
                </th>
              </tr>
            </thead>
            <tbody>
              {current.rows.slice(0, shown).map((pair) => {
                const passenger = doc.day.passengers[pair.party];
                const flight =
                  passenger === undefined ? undefined : doc.day.flights[passenger.flightIndex];
                return (
                  <tr key={pair.party} aria-selected={selected === pair.party}>
                    <td>
                      <button
                        type="button"
                        className="link-button"
                        onClick={() => {
                          onSelect(pair.party);
                        }}
                      >
                        <code>{passenger?.id ?? pair.party}</code>
                      </button>
                      {(passenger?.partySize ?? 1) > 1
                        ? ` ${passenger?.partySize ?? 1} people`
                        : ''}
                    </td>
                    <td>
                      {flight?.id ?? '?'},{' '}
                      {flight === undefined ? '' : clock(flight.boardingCloseMs)}
                    </td>
                    <td className="num">
                      {passenger === undefined ? '' : clock(passenger.arrivalMs)}
                    </td>
                    <td className="num">
                      {num(pair.referenceWaitMs / MINUTE)} → {num(pair.candidateWaitMs / MINUTE)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {current.rows.length > shown && (
        <button
          type="button"
          className="btn btn-small"
          onClick={() => {
            setShown((n) => n + PAGE);
          }}
        >
          {current.rows.length - shown > PAGE
            ? `Show ${PAGE} more (${current.rows.length - shown} not shown)`
            : `Show the last ${current.rows.length - shown}`}
        </button>
      )}
    </section>
  );
}
