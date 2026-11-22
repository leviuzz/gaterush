import { clock, explainCommitment, minutes } from '@gateflow/sim-trace';
import type { Explanation } from '@gateflow/sim-trace';
import type { DayEvent } from '@gateflow/sim-model';
import type { ReplayModel, RunView } from '../../replay-model';

interface Props {
  readonly model: ReplayModel;
  readonly party: number;
  readonly onClose: () => void;
  readonly onSeek: (ms: number) => void;
}

interface Step {
  readonly atMs: number;
  readonly text: string;
  readonly explanation?: Explanation;
  /** A call in plain arrival order for a passenger not at risk: the reason, without the details. */
  readonly compact?: boolean;
}

/** The steps of a party's day under one policy, in words. */
function stepsOf(view: RunView, party: number): Step[] {
  const steps: Step[] = [];
  let tickets = 0;
  for (const k of view.byParty[party] ?? []) {
    const event: DayEvent | undefined = view.run.events[k];
    if (event === undefined) continue;
    switch (event.type) {
      case 'ARRIVED':
        steps.push({ atMs: event.atMs, text: 'Reached the checkpoint' });
        break;
      case 'QUEUE': {
        const q = event.event;
        switch (q.type) {
          case 'ISSUED':
            tickets++;
            steps.push({
              atMs: q.atMs,
              text:
                tickets === 1
                  ? `Took ticket ${q.ticketId}`
                  : `Took a new ticket, ${q.ticketId}: the previous one had expired`,
            });
            break;
          case 'COMMITTED': {
            const explanation = explainCommitment(q, {
              policy: view.policy,
              knownDeadlineMs: view.known.get(k) ?? null,
            });
            const risk = q.assessment?.riskClass;
            steps.push({
              atMs: q.atMs,
              text: view.physical
                ? explanation.priority
                  ? 'Taken out of the line by staff'
                  : 'Next in line'
                : 'Chosen to be called next',
              explanation,
              compact:
                !explanation.priority &&
                (explanation.code === 'FIFO' || explanation.code === 'POLICY_FIFO') &&
                risk !== 'URGENT' &&
                risk !== 'CRITICAL',
            });
            break;
          }
          case 'CALLED':
            steps.push({
              atMs: q.atMs,
              text: view.physical ? 'At the front of the line' : 'Called on the displays',
            });
            break;
          case 'RECALLED':
            steps.push({ atMs: q.atMs, text: 'Called a second time' });
            break;
          case 'NO_SHOW':
            steps.push({ atMs: q.atMs, text: 'Did not come in time: a no-show' });
            break;
          case 'REACTIVATED':
            steps.push({ atMs: q.atMs, text: 'Came back: the ticket was reactivated' });
            break;
          case 'EXPIRED':
            steps.push({ atMs: q.atMs, text: 'The ticket expired' });
            break;
          // Staff actions and the supervisor's modes of the live product (S15, S17): a simulated
          // day has none.
          case 'REVIEW':
          case 'RELEASED':
          case 'CANCELLED':
          case 'PARTY_GROWN':
          case 'MODE_CHANGED':
          case 'UNCOMMITTED':
            break;
          case 'ADMITTED':
            if (!view.physical) {
              steps.push({ atMs: q.atMs, text: 'Validated the ticket at the access point' });
            }
            break;
        }
        break;
      }
      case 'SCREENING_STARTED':
        steps.push({ atMs: event.atMs, text: `Screening on lane ${event.lane + 1}` });
        break;
      case 'SCREENING_ENDED':
        steps.push({ atMs: event.atMs, text: 'Screened, walking to the gate' });
        break;
      case 'LANES':
      case 'LANE_DECISION':
      case 'FEED_DOWN':
      case 'FEED_UP':
      case 'FLIGHT_KNOWN':
        break;
    }
  }
  return steps;
}

function ExplanationCard({ explanation }: { readonly explanation: Explanation }) {
  return (
    <div
      className={`explain${explanation.priority ? ' explain-priority' : ''}`}
      data-reason={explanation.code}
    >
      <p className="explain-head">
        <span className={`badge${explanation.priority ? ' badge-priority' : ''}`}>
          {explanation.title}
        </span>
        <code className="reason-code">{explanation.code}</code>
      </p>
      <p className="explain-text">{explanation.text}</p>
      <dl className="explain-facts">
        {explanation.facts.map((fact) => (
          <div key={fact.label}>
            <dt>{fact.label}</dt>
            <dd>{fact.value}</dd>
          </div>
        ))}
      </dl>
      {explanation.notes.length > 0 && (
        <ul className="explain-notes">
          {explanation.notes.map((note) => (
            <li key={note.code}>
              <code className="reason-code">{note.code}</code> {note.text}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Journey({
  model,
  view,
  party,
  onSeek,
}: {
  readonly model: ReplayModel;
  readonly view: RunView;
  readonly party: number;
  readonly onSeek: (ms: number) => void;
}) {
  const outcome = view.run.outcomes[party];
  const passenger = model.doc.day.passengers[party];
  const flight = passenger === undefined ? undefined : model.doc.day.flights[passenger.flightIndex];
  if (outcome === undefined || flight === undefined) return null;
  const k =
    view.policy.selection.kind === 'constrained-edf' ? view.policy.selection.maxOvertakes : null;
  return (
    <div className="journey" data-policy={view.policy.id}>
      <h4>
        {view.name} <code>{view.policy.id}</code>
      </h4>
      <p className={`outcome ${outcome.missed ? 'outcome-missed' : 'outcome-made'}`}>
        <span aria-hidden="true">{outcome.missed ? '✕' : '✓'}</span>{' '}
        {outcome.missed ? 'Missed the flight' : 'Made the flight'}: at the gate{' '}
        {clock(outcome.gateArrivalMs)}, boarding closed {clock(flight.boardingCloseMs)}
      </p>
      <dl className="explain-facts">
        <div>
          <dt>Waited until screening</dt>
          <dd>{minutes(outcome.waitMs)}</dd>
        </div>
        <div>
          <dt>Of which standing in a queue</dt>
          <dd>{minutes(outcome.standingMs)}</dd>
        </div>
        {k !== null && (
          <div>
            <dt>Overtaken by</dt>
            <dd>
              {outcome.overtakenCount} {outcome.overtakenCount === 1 ? 'person' : 'people'} (at most{' '}
              {k})
            </dd>
          </div>
        )}
      </dl>
      <ol className="steps">
        {stepsOf(view, party).map((step, i) => (
          <li key={i}>
            <button
              type="button"
              className="link-button mono"
              title="Show the checkpoint at this time"
              onClick={() => {
                onSeek(step.atMs);
              }}
            >
              {clock(step.atMs, { seconds: true })}
            </button>{' '}
            {step.text}
            {step.explanation !== undefined &&
              (step.compact === true ? (
                <>
                  {': '}
                  <span className="badge">{step.explanation.title}</span>{' '}
                  <code className="reason-code">{step.explanation.code}</code>
                </>
              ) : (
                <ExplanationCard explanation={step.explanation} />
              ))}
          </li>
        ))}
        <li>
          <span className="mono">{clock(outcome.gateArrivalMs, { seconds: true })}</span> At the
          gate
          {outcome.missed ? ', after boarding closed' : ''}
        </li>
      </ol>
    </div>
  );
}

/** One party's day under both policies, with the reason for every call. */
export function PassengerDetail({ model, party, onClose, onSeek }: Props) {
  const { doc, reference, candidate } = model;
  const passenger = doc.day.passengers[party];
  const flight = passenger === undefined ? undefined : doc.day.flights[passenger.flightIndex];
  if (passenger === undefined || flight === undefined) return null;
  const pair = model.pairs[party];
  const delta = pair === undefined ? 0 : pair.waitDeltaMs;
  const verdict =
    pair === undefined
      ? ''
      : pair.category === 'SAVED'
        ? `${candidate.name} saved this flight.`
        : pair.category === 'HARMED'
          ? `This flight was missed only with ${candidate.name}.`
          : pair.category === 'BOTH_MISSED'
            ? 'Missed with both policies.'
            : 'Made it with both policies.';
  return (
    <section className="passenger" id="passenger" aria-labelledby="h-passenger" data-party={party}>
      <div className="passenger-head">
        <h3 id="h-passenger">
          Passenger <code>{passenger.id}</code>
          {passenger.partySize > 1 ? `, a group of ${passenger.partySize}` : ''}
        </h3>
        <button type="button" className="btn btn-small" onClick={onClose}>
          Close
        </button>
      </div>
      <p className="facts">
        <span>
          flight <b>{flight.id}</b>, departs {clock(flight.stdMs)}, boarding closes{' '}
          <b>{clock(flight.boardingCloseMs)}</b>
          {flight.delayMs !== undefined && flight.delayMs > 0
            ? ` (delayed ${minutes(flight.delayMs)})`
            : ''}
        </span>
        <span>
          {passenger.segment.toLowerCase()}
          {passenger.path === 'ASSISTED' ? ', assisted by staff' : ''}
        </span>
        <span>reached the checkpoint {clock(passenger.arrivalMs, { seconds: true })}</span>
      </p>
      <p className="verdict">
        {verdict}{' '}
        {delta === 0
          ? 'Same wait with both.'
          : `With ${candidate.name} the wait was ${minutes(Math.abs(delta))} ${delta < 0 ? 'shorter' : 'longer'}.`}
      </p>
      <div className="journeys">
        <Journey model={model} view={reference} party={party} onSeek={onSeek} />
        <Journey model={model} view={candidate} party={party} onSeek={onSeek} />
      </div>
    </section>
  );
}
