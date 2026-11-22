import { t } from '@gateflow/i18n';
import type { Locale } from '@gateflow/i18n';
import type {
  AdmissionResponse,
  CallNextResponse,
  CheckpointMode,
  CheckpointResponse,
  FlightsResponse,
  IssueTicketResponse,
  ManualReason,
  MeResponse,
  QueueResponse,
  StaffActionResponse,
  StaffMemberResponse,
  Ticket,
} from '@gateflow/contracts';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode, SyntheticEvent } from 'react';
import { api, randomKey } from '../api';
import { coalesced } from '../common/coalesce';
import { timeOfDay, useDocumentLanguage } from '../common/format';
import { LanguageSwitch } from '../common/LanguageSwitch';
import { follow } from '../common/stream';
import { QrCode } from '../common/QrCode';
import { SignIn } from '../common/SignIn';
import { presented } from './scan';

/*
 * The lane station (S15): staff sign in, call the next passenger, validate tickets at the access
 * point (QR code, boarding pass or number), act on called passengers, absences and reviews, and
 * issue manual tickets with a reason. It follows the checkpoint's stream (S16): it asks for the
 * queue whenever it changes, and every 20 seconds in case the stream is down. It shows the mode the
 * supervisor set (S17): while calls are paused or stopped, the station calls nobody.
 */

const REFRESH_MS = 20_000;
/** Without news from the server for this long, the station says it is not up to date. */
const STALE_MS = 30_000;
const LIST_LIMIT = 30;
const REASONS: readonly ManualReason[] = [
  'NO_BOARDING_PASS',
  'PASS_UNREADABLE',
  'ASSISTANCE',
  'GROUP',
  'OTHER',
];

type Member = StaffMemberResponse['member'];
type Outcome = { readonly kind: 'ok' | 'warn' | 'stop'; readonly text: string } | null;

const supervises = (m: Member) => m.role === 'SUPERVISOR' || m.role === 'ADMIN';

function TicketRow({
  ticket,
  flight,
  locale,
  now,
  children,
}: {
  readonly ticket: Ticket;
  readonly flight: string;
  readonly locale: Locale;
  readonly now: number;
  readonly children?: ReactNode;
}) {
  const calledAt = ticket.lastCalledAt === null ? null : Date.parse(ticket.lastCalledAt);
  return (
    <li className="ticket-row" data-ticket={ticket.number}>
      <span className="row-number">{ticket.number}</span>
      <span className="row-detail">
        {flight}
        {ticket.partySize > 1 ? ` · ${t(locale, 'lane.people', { count: ticket.partySize })}` : ''}
        {ticket.overridden ? ` · ${t(locale, 'lane.overridden')}` : ''}
        {calledAt === null || ticket.state === 'QUEUED' || ticket.state === 'PREPARE'
          ? ''
          : ` · ${t(locale, 'lane.minutesAgo', {
              minutes: Math.max(0, Math.floor((now - calledAt) / 60_000)),
            })}`}
      </span>
      <span className="row-actions">{children}</span>
    </li>
  );
}

function Section({
  title,
  count,
  id,
  locale,
  readOnly,
  children,
}: {
  readonly title: string;
  readonly count: number;
  readonly id: string;
  readonly locale: Locale;
  /** A checkpoint of the digital twin (S18): its lists only show. */
  readonly readOnly: boolean;
  readonly children: ReactNode;
}) {
  return (
    <section className="card lane-list" id={id} aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`}>
        {title} <span className="count">{count}</span>
      </h2>
      {count === 0 ? (
        <p className="muted">{t(locale, 'lane.empty')}</p>
      ) : (
        <fieldset className="plain" disabled={readOnly}>
          <ul>{children}</ul>
        </fieldset>
      )}
    </section>
  );
}

export function Lane({
  checkpointId,
  defaultLocale,
}: {
  readonly checkpointId: string;
  readonly defaultLocale: Locale;
}) {
  const [locale, setLocale] = useState<Locale>(defaultLocale);
  const [member, setMember] = useState<Member | null>(null);
  const [phase, setPhase] = useState<'starting' | 'sign-in' | 'not-allowed' | 'ready'>('starting');
  const [place, setPlace] = useState<CheckpointResponse | null>(null);
  const [tickets, setTickets] = useState<readonly Ticket[]>([]);
  const [flights, setFlights] = useState<FlightsResponse['flights']>([]);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  /** The time of the checkpoint's latest command: a twin's checkpoint reads its own clock (S18). */
  const [virtualNow, setVirtualNow] = useState<number | null>(null);
  const [last, setLast] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<Outcome>(null);
  const [code, setCode] = useState('');
  const [manual, setManual] = useState<{
    flightId: string;
    segment: 'DEPARTING' | 'TRANSFER';
    partySize: number;
    reason: ManualReason;
  }>({ flightId: '', segment: 'DEPARTING', partySize: 1, reason: 'NO_BOARDING_PASS' });
  const [issued, setIssued] = useState<IssueTicketResponse | null>(null);
  /** The mode of the checkpoint (S17), with the queue. */
  const [mode, setMode] = useState<CheckpointMode>('NORMAL');
  const field = useRef<HTMLInputElement>(null);
  useDocumentLanguage(locale);

  const base = `/v1/checkpoints/${checkpointId}`;

  // Who is signed in, and may they work here?
  const enter = useCallback(
    async (signedIn: Member | null) => {
      let who = signedIn;
      if (who === null) {
        const me = await api<MeResponse>('/v1/auth/me', { session: true });
        if (!me.ok || me.body.member === null) {
          setPhase('sign-in');
          return;
        }
        who = me.body.member;
      }
      setMember(who);
      const here = await api<CheckpointResponse>(base, { session: true });
      if (!here.ok) {
        setPhase(here.status === 401 ? 'sign-in' : 'not-allowed');
        return;
      }
      setPlace(here.body);
      setPhase('ready');
    },
    [base],
  );
  useEffect(() => {
    void enter(null);
  }, [enter]);

  const refresh = useCallback(async () => {
    // The tickets still in play: a day has thousands of others (S18).
    const answer = await api<QueueResponse>(`${base}/queue?inPlay=true`, { session: true });
    if (answer.ok) {
      setTickets(answer.body.tickets);
      setMode(answer.body.mode);
      setVirtualNow(answer.body.updatedAt === null ? null : Date.parse(answer.body.updatedAt));
      setUpdatedAt(Date.now());
    } else if (answer.status === 401) {
      setPhase('sign-in');
    }
    setNow(Date.now());
  }, [base]);

  useEffect(() => {
    if (phase !== 'ready') return;
    void refresh();
    void api<FlightsResponse>(`${base}/flights`, { session: true }).then((answer) => {
      if (answer.ok) {
        setFlights(answer.body.flights);
        const first = answer.body.flights.find((f) => Date.parse(f.departure) > Date.now());
        setManual((m) =>
          m.flightId === '' && first !== undefined ? { ...m, flightId: first.id } : m,
        );
      }
    });
    const timer = window.setInterval(() => {
      void refresh();
    }, REFRESH_MS);
    // The queue changed: another station called, a kiosk issued, a timeout fell due. One question
    // at a time, however fast the checkpoint changes (S18).
    const again = coalesced(refresh);
    const stop = follow(`${base}/stream`, {
      session: true,
      onMessage: (message) => {
        if (message.event === 'changed') void again();
        else setUpdatedAt(Date.now());
      },
      onRefused: (status) => {
        setPhase(status === 401 ? 'sign-in' : 'not-allowed');
      },
    });
    field.current?.focus();
    return () => {
      window.clearInterval(timer);
      stop();
    };
  }, [phase, refresh, base]);

  const flightOf = useMemo(() => {
    const labels = new Map(flights.map((f) => [f.id, f.label]));
    return (ticket: Ticket) => labels.get(ticket.flightId) ?? '';
  }, [flights]);

  const command = async <T,>(path: string, body?: unknown) => {
    const answer = await api<T>(`${base}/${path}`, {
      method: 'POST',
      session: true,
      idempotencyKey: randomKey(),
      ...(body === undefined ? {} : { body }),
    });
    if (!answer.ok && answer.status === 401) setPhase('sign-in');
    await refresh();
    field.current?.focus();
    return answer;
  };

  const callNext = async () => {
    // No answer stays on screen while the next one is awaited.
    setLast(null);
    const answer = await command<CallNextResponse>('calls');
    if (!answer.ok) {
      // The supervisor paused the calls since the station last heard.
      setLast(t(locale, answer.code === 'CALLS_PAUSED' ? 'lane.callsPaused' : 'lane.error'));
    } else
      setLast(
        answer.body.called === null
          ? t(locale, 'lane.nobody')
          : t(locale, 'lane.called', { number: answer.body.called.number }),
      );
  };

  const validate = async (event: SyntheticEvent) => {
    event.preventDefault();
    const what = presented(code);
    setCode('');
    setOutcome(null);
    if (what === null) {
      setOutcome({ kind: 'stop', text: t(locale, 'lane.outcome.UNKNOWN') });
      return;
    }
    const answer = await command<AdmissionResponse>('admissions', what);
    if (!answer.ok) {
      setOutcome({
        kind: 'stop',
        text: t(locale, answer.status === 404 ? 'lane.outcome.UNKNOWN' : 'lane.error'),
      });
      return;
    }
    const { outcome: result, ticket } = answer.body;
    setOutcome({
      kind:
        result === 'ADMITTED'
          ? 'ok'
          : result === 'REACTIVATED' || result === 'NOT_CALLED'
            ? 'warn'
            : 'stop',
      text: t(locale, `lane.outcome.${result}`, { number: ticket.number }),
    });
  };

  const act = async (ticket: Ticket, path: string, body?: unknown) => {
    const answer = await command<StaffActionResponse>(`tickets/${ticket.id}/${path}`, body);
    if (!answer.ok) setOutcome({ kind: 'stop', text: t(locale, 'lane.error') });
  };

  const issue = async (event: SyntheticEvent) => {
    event.preventDefault();
    const answer = await command<IssueTicketResponse>('tickets', manual);
    if (answer.ok) setIssued(answer.body);
    else {
      setOutcome({
        kind: 'stop',
        text: t(locale, answer.code === 'EMERGENCY' ? 'lane.emergency' : 'lane.error'),
      });
    }
  };

  const signOut = async () => {
    await api('/v1/auth/sign-out', { method: 'POST', session: true });
    setMember(null);
    setPlace(null);
    setTickets([]);
    setPhase('sign-in');
  };

  const by = (states: readonly Ticket['state'][]) =>
    tickets.filter((x) => states.includes(x.state));
  const called = by(['CALLED', 'RECALLED']).sort(
    (a, b) => Date.parse(b.lastCalledAt ?? '') - Date.parse(a.lastCalledAt ?? ''),
  );
  const prepare = by(['PREPARE']);
  const waiting = by(['QUEUED']);
  const absent = by(['NO_SHOW']);
  const review = by(['REVIEW']);
  const stale = updatedAt !== null && now - updatedAt > STALE_MS;
  /** A checkpoint of the digital twin (S18): the station only shows it, on its virtual clock. */
  const twin = (place?.checkpoint.twin ?? null) !== null;
  const shownNow = twin && virtualNow !== null ? virtualNow : now;
  const boss = member !== null && supervises(member);
  const callsStopped = mode === 'PAUSED' || mode === 'EMERGENCY';

  const header = (
    <header className="bar">
      <div className="place">
        <span className="brand">GateFlow</span>
        <span className="where">{place?.checkpoint.label ?? t(locale, 'lane.title')}</span>
        {member === null ? null : (
          <span className="who" id="lane-member">
            {member.login} · {t(locale, `lane.role.${member.role}`)}
          </span>
        )}
      </div>
      <div className="bar-actions">
        <LanguageSwitch locale={locale} onChange={setLocale} />
        {member === null ? null : (
          <button
            type="button"
            className="link-button"
            id="lane-sign-out"
            onClick={() => void signOut()}
          >
            {t(locale, 'lane.signOut')}
          </button>
        )}
      </div>
    </header>
  );

  if (phase !== 'ready' || member === null) {
    return (
      <div className="lane" data-phase={phase}>
        {header}
        <main className="page-main">
          {phase === 'starting' ? (
            <div className="spinner" role="progressbar" aria-label="GateFlow" />
          ) : null}
          {phase === 'sign-in' ? (
            <SignIn locale={locale} prefix="lane" onSignedIn={(m) => void enter(m)} />
          ) : null}
          {phase === 'not-allowed' ? (
            <section className="card message-card" id="lane-not-allowed">
              <p className="message">{t(locale, 'lane.signIn.notAllowed')}</p>
            </section>
          ) : null}
        </main>
      </div>
    );
  }

  return (
    <div className="lane" data-phase="ready" data-twin={twin}>
      {header}
      {twin ? (
        <p className="twin-banner" role="note" id="lane-twin">
          {t(locale, 'twin.banner')}
        </p>
      ) : null}
      {stale ? (
        <p className="stale" role="alert" id="lane-stale">
          {t(locale, 'lane.stale', { time: timeOfDay(updatedAt, locale) })}
        </p>
      ) : null}
      {mode === 'NORMAL' ? null : (
        <p className="mode-banner" role="status" id="lane-mode" data-mode={mode}>
          {t(locale, `lane.mode.${mode}`)}
        </p>
      )}
      <main className="lane-main">
        <section className="card lane-actions">
          <fieldset className="plain" disabled={twin}>
            <button
              type="button"
              className="button primary call-next"
              id="lane-call"
              disabled={callsStopped}
              onClick={() => void callNext()}
            >
              {t(locale, 'lane.callNext')}
            </button>
            <p className="last" role="status" id="lane-last">
              {last ?? ''}
            </p>
            <form className="validate" onSubmit={(e) => void validate(e)}>
              <label htmlFor="lane-code">{t(locale, 'lane.validate.label')}</label>
              <div className="scan-row">
                <input
                  id="lane-code"
                  ref={field}
                  value={code}
                  onChange={(e) => {
                    setCode(e.target.value);
                  }}
                  autoComplete="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  maxLength={1100}
                />
                <button type="submit" className="button secondary" id="lane-validate">
                  {t(locale, 'lane.validate.submit')}
                </button>
              </div>
            </form>
            <p className="outcome" role="status" id="lane-outcome" data-kind={outcome?.kind ?? ''}>
              {outcome?.text ?? ''}
            </p>
          </fieldset>
        </section>

        <Section
          title={t(locale, 'lane.section.called')}
          count={called.length}
          id="lane-called"
          locale={locale}
          readOnly={twin}
        >
          {called.map((x) => (
            <TicketRow key={x.id} ticket={x} flight={flightOf(x)} locale={locale} now={shownNow}>
              <button type="button" className="small-button" onClick={() => void act(x, 'recall')}>
                {t(locale, 'lane.action.recall')}
              </button>
              <button type="button" className="small-button" onClick={() => void act(x, 'no-show')}>
                {t(locale, 'lane.action.noShow')}
              </button>
            </TicketRow>
          ))}
        </Section>

        <Section
          title={t(locale, 'lane.section.prepare')}
          count={prepare.length}
          id="lane-prepare"
          locale={locale}
          readOnly={twin}
        >
          {prepare.map((x) => (
            <TicketRow key={x.id} ticket={x} flight={flightOf(x)} locale={locale} now={shownNow}>
              <button type="button" className="small-button" onClick={() => void act(x, 'review')}>
                {t(locale, 'lane.action.review')}
              </button>
            </TicketRow>
          ))}
        </Section>

        <Section
          title={t(locale, 'lane.section.waiting')}
          count={waiting.length}
          id="lane-waiting"
          locale={locale}
          readOnly={twin}
        >
          {waiting.slice(0, LIST_LIMIT).map((x) => (
            <TicketRow key={x.id} ticket={x} flight={flightOf(x)} locale={locale} now={shownNow}>
              <button type="button" className="small-button" onClick={() => void act(x, 'review')}>
                {t(locale, 'lane.action.review')}
              </button>
              {boss ? (
                <button
                  type="button"
                  className="small-button danger"
                  onClick={() => void act(x, 'cancel')}
                >
                  {t(locale, 'lane.action.cancel')}
                </button>
              ) : null}
            </TicketRow>
          ))}
        </Section>

        <Section
          title={t(locale, 'lane.section.noShows')}
          count={absent.length}
          id="lane-absent"
          locale={locale}
          readOnly={twin}
        >
          {absent.map((x) => (
            <TicketRow key={x.id} ticket={x} flight={flightOf(x)} locale={locale} now={shownNow}>
              <button
                type="button"
                className="small-button"
                onClick={() => void act(x, 'reactivate')}
              >
                {t(locale, 'lane.action.reactivate')}
              </button>
            </TicketRow>
          ))}
        </Section>

        <Section
          title={t(locale, 'lane.section.review')}
          count={review.length}
          id="lane-review"
          locale={locale}
          readOnly={twin}
        >
          {review.map((x) => (
            <TicketRow key={x.id} ticket={x} flight={flightOf(x)} locale={locale} now={shownNow}>
              {boss ? (
                <>
                  <button
                    type="button"
                    className="small-button"
                    onClick={() => void act(x, 'resolve', { decision: 'QUEUE' })}
                  >
                    {t(locale, 'lane.action.release')}
                  </button>
                  <button
                    type="button"
                    className="small-button danger"
                    onClick={() => void act(x, 'resolve', { decision: 'CANCEL' })}
                  >
                    {t(locale, 'lane.action.cancel')}
                  </button>
                </>
              ) : null}
            </TicketRow>
          ))}
        </Section>

        <section className="card manual" id="lane-manual" aria-labelledby="lane-manual-title">
          <fieldset className="plain" disabled={twin}>
            <h2 id="lane-manual-title">{t(locale, 'lane.manual.title')}</h2>
            <form onSubmit={(e) => void issue(e)}>
              <label htmlFor="manual-flight">{t(locale, 'lane.manual.flight')}</label>
              <select
                id="manual-flight"
                value={manual.flightId}
                onChange={(e) => {
                  setManual({ ...manual, flightId: e.target.value });
                }}
                required
              >
                {flights.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.label} ·{' '}
                    {timeOfDay(Date.parse(f.departure), locale, place?.airport.timeZone)}
                  </option>
                ))}
              </select>
              <fieldset>
                <legend>{t(locale, 'lane.manual.segment')}</legend>
                {(['DEPARTING', 'TRANSFER'] as const).map((segment) => (
                  <label key={segment} className="choice">
                    <input
                      type="radio"
                      name="manual-segment"
                      value={segment}
                      checked={manual.segment === segment}
                      onChange={() => {
                        setManual({ ...manual, segment });
                      }}
                    />
                    {t(locale, `lane.manual.${segment}`)}
                  </label>
                ))}
              </fieldset>
              <label htmlFor="manual-party">{t(locale, 'lane.manual.party')}</label>
              <input
                id="manual-party"
                type="number"
                min={1}
                max={20}
                value={manual.partySize}
                onChange={(e) => {
                  setManual({
                    ...manual,
                    partySize: Math.min(20, Math.max(1, Number(e.target.value) || 1)),
                  });
                }}
              />
              <label htmlFor="manual-reason">{t(locale, 'lane.manual.reason')}</label>
              <select
                id="manual-reason"
                value={manual.reason}
                onChange={(e) => {
                  setManual({ ...manual, reason: e.target.value as ManualReason });
                }}
              >
                {REASONS.map((r) => (
                  <option key={r} value={r}>
                    {t(locale, `lane.manual.reason.${r}`)}
                  </option>
                ))}
              </select>
              <button
                type="submit"
                className="button primary"
                id="manual-issue"
                disabled={mode === 'EMERGENCY'}
              >
                {t(locale, 'lane.manual.issue')}
              </button>
            </form>
            {issued === null ? null : (
              <div className="issued print-area" id="manual-issued">
                <p className="eyebrow">
                  {t(locale, 'lane.manual.issued', { number: issued.ticket.number })}
                </p>
                <p className="number" data-length={issued.ticket.number.length}>
                  {issued.ticket.number}
                </p>
                <QrCode
                  text={`${window.location.origin}/t/${issued.ref}`}
                  label={issued.ticket.number}
                />
                <button
                  type="button"
                  className="button secondary"
                  onClick={() => {
                    window.print();
                  }}
                >
                  {t(locale, 'kiosk.print')}
                </button>
              </div>
            )}
          </fieldset>
        </section>
      </main>
    </div>
  );
}
