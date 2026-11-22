import { MESSAGES, t } from '@gateflow/i18n';
import type { Locale, MessageKey } from '@gateflow/i18n';
import type {
  ActivatePolicyResponse,
  AuditEntry,
  AuditResponse,
  AuditVerifyResponse,
  CheckpointMode,
  CheckpointResponse,
  FlightsResponse,
  MeResponse,
  OverrideReason,
  OverrideResponse,
  PolicyStatusResponse,
  QueueResponse,
  SetLanesResponse,
  SetModeResponse,
  StaffMemberResponse,
  Ticket,
} from '@gateflow/contracts';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { SyntheticEvent } from 'react';
import { api, randomKey } from '../api';
import { timeOfDay, useDocumentLanguage } from '../common/format';
import { LanguageSwitch } from '../common/LanguageSwitch';
import { SignIn } from '../common/SignIn';
import { follow } from '../common/stream';

/*
 * The supervisor's console (S17, ADR-048 to ADR-050), `/supervisor/<checkpoint>`: the mode of the
 * checkpoint (an emergency asks for a confirmation, and resuming chooses between the same order
 * and the order of arrival), the lanes open, the queue with the overrides and their coded reason,
 * today's and the next day's policy (administrators activate a version from the next service
 * day), and the audit view of the day with the check of the log's chain. It follows the
 * checkpoint's stream, as the lane station does.
 */

const REFRESH_MS = 20_000;
const LIST_LIMIT = 30;
const MODES: readonly CheckpointMode[] = ['NORMAL', 'FIFO_ONLY', 'PAUSED', 'EMERGENCY'];
const REASONS: readonly OverrideReason[] = [
  'FLIGHT_CLOSING',
  'ASSISTANCE',
  'AIRLINE_REQUEST',
  'OPERATIONAL',
  'OTHER',
];

type Member = StaffMemberResponse['member'];
type Notice = { readonly kind: 'ok' | 'warn' | 'stop'; readonly text: string } | null;

const stoppedMode = (mode: CheckpointMode) => mode === 'PAUSED' || mode === 'EMERGENCY';

/** A text of the catalogue by a key the server gave (a command, a reason), or the key itself. */
function label(locale: Locale, key: string, fallback: string): string {
  return key in MESSAGES[locale] ? t(locale, key as MessageKey) : fallback;
}

/** How an entry of the audit reads: the command, its ticket and what it carried. */
function auditWhat(locale: Locale, entry: AuditEntry): string {
  const parts = [label(locale, `supervisor.command.${entry.command}`, entry.command)];
  if (entry.ticket !== null) parts.push(entry.ticket);
  const d = entry.detail;
  if (d.mode !== undefined) {
    parts.push(t(locale, `supervisor.mode.${d.mode}`));
    if (d.reset === true) parts.push(t(locale, 'supervisor.resume.reset'));
  }
  if (d.override !== undefined) {
    parts.push(t(locale, d.override === 'BOOST' ? 'supervisor.boost' : 'supervisor.callNow'));
  }
  if (d.lanesOpen !== undefined && entry.command !== 'OPEN_DAY') parts.push(String(d.lanesOpen));
  if (d.policy !== undefined) parts.push(d.policy);
  return parts.join(' · ');
}

/** The reason of an audit entry: an override's, or a manual ticket's. */
function auditWhy(locale: Locale, entry: AuditEntry): string | null {
  if (entry.reason === null) return null;
  return entry.command === 'OVERRIDE'
    ? label(locale, `supervisor.reason.${entry.reason}`, entry.reason)
    : label(locale, `lane.manual.reason.${entry.reason}`, entry.reason);
}

export function Console({
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
  const [queue, setQueue] = useState<QueueResponse | null>(null);
  const [flights, setFlights] = useState<FlightsResponse['flights']>([]);
  const [policy, setPolicy] = useState<PolicyStatusResponse | null>(null);
  const [audit, setAudit] = useState<readonly AuditEntry[]>([]);
  const [auditMore, setAuditMore] = useState(false);
  /** The number the audit shows the history of; empty for every command. */
  const [filter, setFilter] = useState('');
  const [shown, setShown] = useState('');
  const [reason, setReason] = useState<OverrideReason | ''>('');
  const [confirming, setConfirming] = useState(false);
  const [lanes, setLanes] = useState('');
  const [notice, setNotice] = useState<Notice>(null);
  const [chain, setChain] = useState<AuditVerifyResponse | null>(null);
  useDocumentLanguage(locale);

  const base = `/v1/checkpoints/${checkpointId}`;

  // Who is signed in, and are they a supervisor of this checkpoint?
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
      if (who.role !== 'SUPERVISOR' && who.role !== 'ADMIN') {
        setPhase('not-allowed');
        return;
      }
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

  const loadAudit = useCallback(
    async (number: string, before?: number) => {
      const query = new URLSearchParams();
      if (number !== '') query.set('number', number);
      if (before !== undefined) query.set('before', String(before));
      const answer = await api<AuditResponse>(`${base}/audit?${query.toString()}`, {
        session: true,
      });
      if (!answer.ok) return;
      setAudit((previous) =>
        before === undefined ? answer.body.entries : [...previous, ...answer.body.entries],
      );
      setAuditMore(answer.body.more);
    },
    [base],
  );

  const refresh = useCallback(async () => {
    const [q, p] = await Promise.all([
      api<QueueResponse>(`${base}/queue`, { session: true }),
      api<PolicyStatusResponse>(`${base}/policy`, { session: true }),
    ]);
    if (!q.ok && q.status === 401) {
      setPhase('sign-in');
      return;
    }
    if (q.ok) {
      setQueue(q.body);
      setLanes((l) => (l === '' ? String(q.body.lanesOpen) : l));
    }
    if (p.ok) setPolicy(p.body);
    await loadAudit(shown);
  }, [base, loadAudit, shown]);

  useEffect(() => {
    if (phase !== 'ready') return;
    void refresh();
    void api<FlightsResponse>(`${base}/flights`, { session: true }).then((answer) => {
      if (answer.ok) setFlights(answer.body.flights);
    });
    const timer = window.setInterval(() => {
      void refresh();
    }, REFRESH_MS);
    const stop = follow(`${base}/stream`, {
      session: true,
      onMessage: (message) => {
        if (message.event === 'changed') void refresh();
      },
      onRefused: (status) => {
        setPhase(status === 401 ? 'sign-in' : 'not-allowed');
      },
    });
    return () => {
      window.clearInterval(timer);
      stop();
    };
  }, [phase, refresh, base]);

  const flightOf = useMemo(() => {
    const labels = new Map(flights.map((f) => [f.id, f.label]));
    return (ticket: Ticket) => labels.get(ticket.flightId) ?? '';
  }, [flights]);

  /** Sends a command of the console; the screen follows the stream, and asks once more. */
  const command = async <T,>(path: string, body: unknown) => {
    const answer = await api<T>(`${base}/${path}`, {
      method: 'POST',
      session: true,
      idempotencyKey: randomKey(),
      body,
    });
    if (!answer.ok && answer.status === 401) setPhase('sign-in');
    await refresh();
    return answer;
  };

  const mode: CheckpointMode = queue?.mode ?? 'NORMAL';
  const stopped = stoppedMode(mode);

  const setMode = async (next: CheckpointMode, reset = false) => {
    setConfirming(false);
    setNotice(null);
    const answer = await command<SetModeResponse>('mode', { mode: next, reset });
    if (!answer.ok) setNotice({ kind: 'stop', text: t(locale, 'lane.error') });
    else if (answer.body.outcome !== 'DONE') {
      setNotice({ kind: 'warn', text: t(locale, 'supervisor.override.refused') });
    }
  };

  const override = async (ticket: Ticket, path: 'boost' | 'call-now') => {
    if (reason === '') return;
    setNotice(null);
    const answer = await command<OverrideResponse>(`tickets/${ticket.id}/${path}`, { reason });
    setReason('');
    if (!answer.ok) setNotice({ kind: 'stop', text: t(locale, 'lane.error') });
    else if (answer.body.outcome !== 'DONE') {
      setNotice({ kind: 'warn', text: t(locale, 'supervisor.override.refused') });
    } else {
      const done = path === 'boost' ? 'supervisor.boost' : 'supervisor.callNow';
      setNotice({ kind: 'ok', text: `${answer.body.ticket.number}: ${t(locale, done)}` });
    }
  };

  const setLanesOpen = async (event: SyntheticEvent) => {
    event.preventDefault();
    const lanesOpen = Number(lanes);
    if (!Number.isInteger(lanesOpen) || lanesOpen < 1 || lanesOpen > 200) return;
    const answer = await command<SetLanesResponse>('lanes', { lanesOpen });
    if (!answer.ok) setNotice({ kind: 'stop', text: t(locale, 'lane.error') });
    else setLanes(String(answer.body.lanesOpen));
  };

  const activate = async (versionId: string) => {
    const answer = await command<ActivatePolicyResponse>('policy/activations', { versionId });
    if (!answer.ok) setNotice({ kind: 'stop', text: t(locale, 'lane.error') });
  };

  const verify = async () => {
    const answer = await api<AuditVerifyResponse>(`${base}/audit/verify`, { session: true });
    if (answer.ok) setChain(answer.body);
  };

  const showHistory = (event: SyntheticEvent) => {
    event.preventDefault();
    const number = filter.trim().toUpperCase();
    setShown(number);
    void loadAudit(number);
  };

  const signOut = async () => {
    await api('/v1/auth/sign-out', { method: 'POST', session: true });
    setMember(null);
    setPlace(null);
    setQueue(null);
    setPhase('sign-in');
  };

  const header = (
    <header className="bar">
      <div className="place">
        <span className="brand">GateFlow</span>
        <span className="where">{place?.checkpoint.label ?? t(locale, 'supervisor.title')}</span>
        {member === null ? null : (
          <span className="who" id="console-member">
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
            id="console-sign-out"
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
      <div className="console" data-phase={phase}>
        {header}
        <main className="page-main">
          {phase === 'starting' ? (
            <div className="spinner" role="progressbar" aria-label="GateFlow" />
          ) : null}
          {phase === 'sign-in' ? (
            <SignIn locale={locale} prefix="supervisor" onSignedIn={(m) => void enter(m)} />
          ) : null}
          {phase === 'not-allowed' ? (
            <section className="card message-card" id="console-not-allowed">
              <p className="message">{t(locale, 'supervisor.notAllowed')}</p>
            </section>
          ) : null}
        </main>
      </div>
    );
  }

  const tickets = queue?.tickets ?? [];
  const prepare = tickets.filter((x) => x.state === 'PREPARE');
  const waiting = tickets.filter((x) => x.state === 'QUEUED');
  const timeZone = place?.airport.timeZone;
  const admin = member.role === 'ADMIN';
  const row = (x: Ticket, boost: boolean) => (
    <li key={x.id} className="ticket-row" data-ticket={x.number}>
      <span className="row-number">{x.number}</span>
      <span className="row-detail">
        {flightOf(x)}
        {x.partySize > 1 ? ` · ${t(locale, 'lane.people', { count: x.partySize })}` : ''}
        {x.overridden ? ` · ${t(locale, 'lane.overridden')}` : ''}
      </span>
      <span className="row-actions">
        {boost ? (
          <button
            type="button"
            className="small-button"
            disabled={reason === '' || mode === 'FIFO_ONLY' || mode === 'EMERGENCY'}
            onClick={() => void override(x, 'boost')}
          >
            {t(locale, 'supervisor.boost')}
          </button>
        ) : null}
        <button
          type="button"
          className="small-button"
          disabled={reason === '' || mode !== 'NORMAL'}
          onClick={() => void override(x, 'call-now')}
        >
          {t(locale, 'supervisor.callNow')}
        </button>
      </span>
    </li>
  );

  return (
    <div className="console" data-phase="ready" data-mode={mode}>
      {header}
      {mode === 'NORMAL' ? null : (
        <p className="mode-banner" role="status" id="console-mode-banner" data-mode={mode}>
          {t(locale, `lane.mode.${mode}`)}
        </p>
      )}
      <main className="console-main">
        <section className="card console-mode" id="console-mode" aria-labelledby="mode-title">
          <h2 id="mode-title">
            {t(locale, 'supervisor.mode.title')}:{' '}
            <span id="console-mode-now" data-mode={mode}>
              {t(locale, `supervisor.mode.${mode}`)}
            </span>
          </h2>
          <div className="mode-buttons">
            {MODES.filter((m) => m !== mode && !(stopped && m === 'NORMAL')).map((m) => (
              <button
                key={m}
                type="button"
                className={m === 'EMERGENCY' ? 'button danger' : 'button secondary'}
                id={`console-set-${m}`}
                onClick={() => {
                  if (m === 'EMERGENCY') setConfirming(true);
                  else void setMode(m);
                }}
              >
                {t(locale, `supervisor.set.${m}`)}
              </button>
            ))}
          </div>
          {confirming ? (
            <div className="confirm" role="alertdialog" id="console-emergency-confirm">
              <p>{t(locale, 'supervisor.emergency.confirm')}</p>
              <div className="actions">
                <button
                  type="button"
                  className="button danger"
                  id="console-emergency-yes"
                  onClick={() => void setMode('EMERGENCY')}
                >
                  {t(locale, 'supervisor.emergency.yes')}
                </button>
                <button
                  type="button"
                  className="button secondary"
                  id="console-emergency-cancel"
                  onClick={() => {
                    setConfirming(false);
                  }}
                >
                  {t(locale, 'supervisor.cancel')}
                </button>
              </div>
            </div>
          ) : null}
          {stopped ? (
            <div className="resume" id="console-resume">
              <h3>{t(locale, 'supervisor.resume.title')}</h3>
              <div className="actions">
                <button
                  type="button"
                  className="button primary"
                  id="console-resume-same"
                  onClick={() => void setMode('NORMAL')}
                >
                  {t(locale, 'supervisor.resume.same')}
                </button>
                <button
                  type="button"
                  className="button secondary"
                  id="console-resume-reset"
                  onClick={() => void setMode('NORMAL', true)}
                >
                  {t(locale, 'supervisor.resume.reset')}
                </button>
              </div>
              <p className="muted">{t(locale, 'supervisor.resume.hint')}</p>
            </div>
          ) : null}
        </section>

        <section className="card console-lanes" id="console-lanes" aria-labelledby="lanes-title">
          <h2 id="lanes-title">{t(locale, 'supervisor.lanes.title')}</h2>
          <form className="scan-row" onSubmit={(e) => void setLanesOpen(e)}>
            <input
              id="console-lanes-input"
              type="number"
              min={1}
              max={200}
              value={lanes}
              aria-labelledby="lanes-title"
              onChange={(e) => {
                setLanes(e.target.value);
              }}
            />
            <button type="submit" className="button secondary" id="console-lanes-set">
              {t(locale, 'supervisor.lanes.set')}
            </button>
          </form>
          <p className="muted">{t(locale, 'supervisor.lanes.hint')}</p>
        </section>

        <section className="card console-queue" id="console-queue" aria-labelledby="queue-title">
          <h2 id="queue-title">{t(locale, 'supervisor.queue.title')}</h2>
          <label htmlFor="console-reason">{t(locale, 'supervisor.reason.label')}</label>
          <select
            id="console-reason"
            value={reason}
            onChange={(e) => {
              setReason(e.target.value as OverrideReason | '');
            }}
          >
            <option value="">{t(locale, 'supervisor.reason.none')}</option>
            {REASONS.map((r) => (
              <option key={r} value={r}>
                {t(locale, `supervisor.reason.${r}`)}
              </option>
            ))}
          </select>
          <p className="outcome" role="status" id="console-notice" data-kind={notice?.kind ?? ''}>
            {notice?.text ?? ''}
          </p>
          <h3>
            {t(locale, 'lane.section.prepare')} <span className="count">{prepare.length}</span>
          </h3>
          {prepare.length === 0 ? (
            <p className="muted">{t(locale, 'lane.empty')}</p>
          ) : (
            <ul id="console-prepare">{prepare.map((x) => row(x, false))}</ul>
          )}
          <h3>
            {t(locale, 'lane.section.waiting')} <span className="count">{waiting.length}</span>
          </h3>
          {waiting.length === 0 ? (
            <p className="muted">{t(locale, 'lane.empty')}</p>
          ) : (
            <ul id="console-waiting">{waiting.slice(0, LIST_LIMIT).map((x) => row(x, true))}</ul>
          )}
        </section>

        <section className="card console-policy" id="console-policy" aria-labelledby="policy-title">
          <h2 id="policy-title">{t(locale, 'supervisor.policy.title')}</h2>
          {policy === null ? null : (
            <>
              <dl className="policy-days">
                <dt>{t(locale, 'supervisor.policy.today', { day: policy.today.serviceDay })}</dt>
                <dd id="console-policy-today" data-policy={policy.today.policy.policyId}>
                  {policy.today.policy.title} <code>{policy.today.policy.hash.slice(0, 12)}</code>
                </dd>
                <dt>{t(locale, 'supervisor.policy.next', { day: policy.next.serviceDay })}</dt>
                <dd id="console-policy-next" data-policy={policy.next.policy.policyId}>
                  {policy.next.policy.title} <code>{policy.next.policy.hash.slice(0, 12)}</code>
                </dd>
              </dl>
              <h3>{t(locale, 'supervisor.policy.versions')}</h3>
              <ul className="versions" id="console-versions">
                {policy.versions.map((v) => (
                  <li key={v.id} data-version={v.id} data-policy={v.policyId}>
                    <span>
                      {v.title} <code>{v.hash.slice(0, 12)}</code>
                    </span>
                    {admin && v.hash !== policy.next.policy.hash ? (
                      <button
                        type="button"
                        className="small-button"
                        onClick={() => void activate(v.id)}
                      >
                        {t(locale, 'supervisor.policy.activate', {
                          day: policy.next.serviceDay,
                        })}
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
              {admin ? null : <p className="muted">{t(locale, 'supervisor.policy.adminOnly')}</p>}
            </>
          )}
        </section>

        <section className="card console-audit" id="console-audit" aria-labelledby="audit-title">
          <h2 id="audit-title">{t(locale, 'supervisor.audit.title')}</h2>
          <form className="scan-row" onSubmit={showHistory}>
            <input
              id="console-audit-number"
              value={filter}
              placeholder={t(locale, 'supervisor.audit.filter')}
              aria-label={t(locale, 'supervisor.audit.filter')}
              autoComplete="off"
              maxLength={10}
              onChange={(e) => {
                setFilter(e.target.value);
              }}
            />
            <button type="submit" className="button secondary" id="console-audit-show">
              {t(locale, 'supervisor.audit.filter')}
            </button>
            <button
              type="button"
              className="button secondary"
              id="console-audit-all"
              onClick={() => {
                setFilter('');
                setShown('');
                void loadAudit('');
              }}
            >
              {t(locale, 'supervisor.audit.all')}
            </button>
          </form>
          {audit.length === 0 ? (
            <p className="muted">{t(locale, 'supervisor.audit.empty')}</p>
          ) : (
            <ol className="audit-list" id="console-audit-list">
              {audit.map((e) => {
                const why = auditWhy(locale, e);
                return (
                  <li key={e.seq} data-seq={e.seq} data-command={e.command}>
                    <time className="audit-when">
                      {timeOfDay(Date.parse(e.at), locale, timeZone)}
                    </time>
                    <span className="audit-what">{auditWhat(locale, e)}</span>
                    <span className="audit-who">
                      {e.by.kind === 'SYSTEM' && e.by.label === 'timer'
                        ? t(locale, 'supervisor.by.timer')
                        : e.by.label}
                    </span>
                    {why === null ? null : <span className="audit-why">{why}</span>}
                    {e.outcome === null ? null : (
                      <span className="audit-outcome" data-outcome={e.outcome}>
                        {e.outcome}
                      </span>
                    )}
                  </li>
                );
              })}
            </ol>
          )}
          <div className="actions">
            {auditMore ? (
              <button
                type="button"
                className="button secondary"
                id="console-audit-older"
                onClick={() => void loadAudit(shown, audit.at(-1)?.seq)}
              >
                {t(locale, 'supervisor.audit.older')}
              </button>
            ) : null}
            <button
              type="button"
              className="button secondary"
              id="console-audit-verify"
              onClick={() => void verify()}
            >
              {t(locale, 'supervisor.audit.verify')}
            </button>
          </div>
          {chain === null ? null : (
            <p
              className="outcome"
              id="console-audit-chain"
              data-kind={chain.intact ? 'ok' : 'stop'}
            >
              {chain.intact
                ? t(locale, 'supervisor.audit.intact', { commands: chain.commands })
                : t(locale, 'supervisor.audit.broken', { seq: chain.firstBrokenSeq ?? 0 })}
            </p>
          )}
        </section>
      </main>
    </div>
  );
}
