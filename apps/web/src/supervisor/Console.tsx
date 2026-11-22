import { MESSAGES, t } from '@gateflow/i18n';
import type { Locale, MessageKey } from '@gateflow/i18n';
import type {
  ActivatePolicyResponse,
  Advice,
  AdviceDecisionResponse,
  AdviceDecisionValue,
  AdviceDeclineReason,
  AdviceResponse,
  AuditEntry,
  AuditResponse,
  AuditVerifyResponse,
  CheckpointMode,
  CheckpointResponse,
  FlightsResponse,
  ForecastResponse,
  MeResponse,
  OverrideReason,
  OverrideResponse,
  OverviewResponse,
  OverviewVerifyResponse,
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
import { coalesced } from '../common/coalesce';
import { timeOfDay, useDocumentLanguage } from '../common/format';
import { LanguageSwitch } from '../common/LanguageSwitch';
import { SignIn } from '../common/SignIn';
import { follow } from '../common/stream';

/*
 * The supervisor's console (S17, ADR-048 to ADR-050), `/supervisor/<checkpoint>`: the overview of
 * the day (S20, ADR-053: waiting, waits, at risk, lanes, fairness, flight data, alerts, and their
 * check against the log), GateFlow's recommendations of lanes (S22, ADR-056: why, when, the
 * interval and the expected benefit; accept, postpone or decline with a reason; the outcome), the
 * mode of the checkpoint (an emergency asks for a confirmation, and
 * resuming chooses between the same order and the order of arrival), the lanes open, the queue
 * with the overrides and their coded reason, today's and the next day's policy (administrators
 * activate a version from the next service day), and the audit view of the day with the check of
 * the log's chain. It follows the checkpoint's stream, as the lane station does. GateFlow Predict
 * (S21, ADR-054), a preview, forecasts the next 90 minutes from simulated days, once a minute.
 */

const REFRESH_MS = 20_000;
/** The forecast changes slowly: once a minute is enough. */
const FORECAST_MS = 60_000;
const LIST_LIMIT = 30;
const MODES: readonly CheckpointMode[] = ['NORMAL', 'FIFO_ONLY', 'PAUSED', 'EMERGENCY'];
const REASONS: readonly OverrideReason[] = [
  'FLIGHT_CLOSING',
  'ASSISTANCE',
  'AIRLINE_REQUEST',
  'OPERATIONAL',
  'OTHER',
];
const DECLINE_REASONS: readonly AdviceDeclineReason[] = ['NO_STAFF', 'NOT_NEEDED', 'OTHER'];
/** The status a decision gives a recommendation. */
const DECIDED = { ACCEPT: 'ACCEPTED', POSTPONE: 'POSTPONED', DECLINE: 'DECLINED' } as const;

type Member = StaffMemberResponse['member'];
type Notice = { readonly kind: 'ok' | 'warn' | 'stop'; readonly text: string } | null;

const stoppedMode = (mode: CheckpointMode) => mode === 'PAUSED' || mode === 'EMERGENCY';

/** Minutes, rounded, of a duration in milliseconds. */
const minutes = (ms: number) => Math.round(ms / 60_000);

/** A band of a forecast, as the console shows it: the median, and 8 paths in 10 around it. */
const bandText = (
  locale: Locale,
  band: { readonly p10: number; readonly p50: number; readonly p90: number },
) =>
  t(locale, 'supervisor.forecast.band', {
    p50: Math.round(band.p50),
    p10: Math.round(band.p10),
    p90: Math.round(band.p90),
  });

/** What a recommendation asks: open one lane or more, or close one. */
function adviceAction(locale: Locale, action: Advice['action'], lanes: number): string {
  if (action === 'CLOSE') return t(locale, 'supervisor.advice.close');
  return lanes === 1
    ? t(locale, 'supervisor.advice.openOne')
    : t(locale, 'supervisor.advice.openMany', { lanes });
}

/** A share in per cent, rounded; 0 of nothing. */
const percent = (part: number, whole: number) =>
  whole === 0 ? 0 : Math.round((100 * part) / whole);

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
  if (d.action !== undefined) parts.push(adviceAction(locale, d.action, d.lanes ?? 1));
  if (d.decision !== undefined && entry.command === 'DECIDE_ADVICE') {
    const status = DECIDED[d.decision as AdviceDecisionValue] as string | undefined;
    parts.push(label(locale, `supervisor.advice.status.${status ?? ''}`, d.decision));
  }
  const lanesShown = entry.command !== 'OPEN_DAY' && entry.command !== 'ADVISE_LANES';
  if (d.lanesOpen !== undefined && lanesShown) parts.push(String(d.lanesOpen));
  if (d.policy !== undefined) parts.push(d.policy);
  return parts.join(' · ');
}

/** The reason of an audit entry: an override's, a manual ticket's, or a declined recommendation's. */
function auditWhy(locale: Locale, entry: AuditEntry): string | null {
  if (entry.reason === null) return null;
  if (entry.command === 'OVERRIDE') {
    return label(locale, `supervisor.reason.${entry.reason}`, entry.reason);
  }
  if (entry.command === 'DECIDE_ADVICE') {
    return label(locale, `supervisor.advice.reason.${entry.reason}`, entry.reason);
  }
  return label(locale, `lane.manual.reason.${entry.reason}`, entry.reason);
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
  const [overview, setOverview] = useState<OverviewResponse | null>(null);
  const [check, setCheck] = useState<OverviewVerifyResponse | null>(null);
  /** The forecast (S21); `none` when the checkpoint names no scenario, `failed` otherwise. */
  const [forecast, setForecast] = useState<ForecastResponse | 'none' | 'failed' | null>(null);
  /** GateFlow's recommendations of lanes of the day (S22). */
  const [advice, setAdvice] = useState<AdviceResponse | null>(null);
  const [declineReason, setDeclineReason] = useState<AdviceDeclineReason | ''>('');
  const [adviceNotice, setAdviceNotice] = useState<Notice>(null);
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
    const [q, p, o, a] = await Promise.all([
      api<QueueResponse>(`${base}/queue?inPlay=true`, { session: true }),
      api<PolicyStatusResponse>(`${base}/policy`, { session: true }),
      api<OverviewResponse>(`${base}/overview`, { session: true }),
      api<AdviceResponse>(`${base}/advice`, { session: true }),
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
    if (o.ok) setOverview(o.body);
    if (a.ok) setAdvice(a.body);
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
    // One question at a time, however fast the checkpoint changes (S18).
    const again = coalesced(refresh);
    const stop = follow(`${base}/stream`, {
      session: true,
      onMessage: (message) => {
        if (message.event === 'changed') void again();
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

  // The forecast: when the console opens, then once a minute.
  useEffect(() => {
    if (phase !== 'ready') return;
    const load = async () => {
      const answer = await api<ForecastResponse>(`${base}/forecast`, { session: true });
      if (answer.ok) setForecast(answer.body);
      else setForecast(answer.status === 409 ? 'none' : 'failed');
    };
    void load();
    const timer = window.setInterval(() => {
      void load();
    }, FORECAST_MS);
    return () => {
      window.clearInterval(timer);
    };
  }, [phase, base]);

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

  /** The supervisor's decision on the open recommendation (S22): declining takes a reason. */
  const decide = async (adviceId: string, decision: AdviceDecisionValue) => {
    if (decision === 'DECLINE' && declineReason === '') return;
    setAdviceNotice(null);
    const answer = await command<AdviceDecisionResponse>(
      `advice/${adviceId}/decision`,
      decision === 'DECLINE' ? { decision, reason: declineReason } : { decision },
    );
    setDeclineReason('');
    if (!answer.ok) {
      setAdviceNotice(
        answer.status === 409
          ? { kind: 'warn', text: t(locale, 'supervisor.advice.notOpen') }
          : { kind: 'stop', text: t(locale, 'lane.error') },
      );
    } else if (decision === 'ACCEPT') {
      setAdviceNotice({ kind: 'ok', text: t(locale, 'supervisor.advice.accepted') });
    }
  };

  const activate = async (versionId: string) => {
    const answer = await command<ActivatePolicyResponse>('policy/activations', { versionId });
    if (!answer.ok) setNotice({ kind: 'stop', text: t(locale, 'lane.error') });
  };

  const verify = async () => {
    const answer = await api<AuditVerifyResponse>(`${base}/audit/verify`, { session: true });
    if (answer.ok) setChain(answer.body);
  };

  /** The overview against the log (S20): the day replayed, every figure and ticket compared. */
  const verifyOverview = async () => {
    setCheck(null);
    const answer = await api<OverviewVerifyResponse>(`${base}/overview/verify`, {
      session: true,
    });
    if (answer.ok) setCheck(answer.body);
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

  /** A checkpoint of the digital twin (S18): the console only shows it. */
  const twin = (place?.checkpoint.twin ?? null) !== null;
  const tickets = queue?.tickets ?? [];
  const prepare = tickets.filter((x) => x.state === 'PREPARE');
  const waiting = tickets.filter((x) => x.state === 'QUEUED');
  const timeZone = place?.airport.timeZone;
  const admin = member.role === 'ADMIN';
  /** Now, for ages: the figures' time (a twin's virtual time), else the device's. */
  const nowMs = overview === null ? Date.now() : Date.parse(overview.at);
  /** The open recommendation, if any, and the day's, the latest first. */
  const advices = advice?.advices ?? [];
  const openAdvice = advices.find((a) => a.status === 'OPEN');
  const hhmm = (iso: string) => timeOfDay(Date.parse(iso), locale, timeZone);
  const adviceWhy = (a: Advice) =>
    a.reason === 'WAIT_ABOVE_TARGET'
      ? t(locale, 'supervisor.advice.why.WAIT_ABOVE_TARGET', {
          target: advice?.rule.targetWaitMinutes ?? 10,
          lead: a.leadMinutes,
          time: hhmm(a.crossesAt),
        })
      : t(locale, 'supervisor.advice.why.WAIT_LOW_WITH_FEWER_LANES', {
          below: advice?.rule.closeBelowMinutes ?? 2,
        });
  const adviceOutcome = (a: Advice) => {
    const o = a.outcome;
    if (o === null) return t(locale, 'supervisor.advice.outcomeDue', { time: hhmm(a.outcomeDue) });
    return o.waitMinutes === null
      ? t(locale, 'supervisor.advice.outcomeNobody', {
          time: hhmm(a.outcomeDue),
          lanes: o.lanesOpen,
          backlog: o.backlog,
        })
      : t(locale, 'supervisor.advice.outcome', {
          time: hhmm(a.outcomeDue),
          lanes: o.lanesOpen,
          backlog: o.backlog,
          wait: Math.round(o.waitMinutes),
          admitted: o.admitted,
        });
  };
  const row = (x: Ticket, boost: boolean) => (
    <li key={x.id} className="ticket-row" data-ticket={x.number} data-risk={x.riskClass}>
      <span className="row-number">{x.number}</span>
      <span className="row-detail">
        {flightOf(x)}
        {` · ${t(locale, 'supervisor.row.waiting', {
          minutes: Math.max(0, minutes(nowMs - Date.parse(x.presentedAt))),
        })}`}
        {x.partySize > 1 ? ` · ${t(locale, 'lane.people', { count: x.partySize })}` : ''}
        {x.riskClass === 'NORMAL' ? null : (
          <span className="risk" data-risk={x.riskClass}>
            {t(locale, `supervisor.risk.${x.riskClass}`)}
          </span>
        )}
        {x.priority ? ` · ${t(locale, 'supervisor.row.ahead')}` : ''}
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
    <div className="console" data-phase="ready" data-mode={mode} data-twin={twin}>
      {header}
      {twin ? (
        <p className="twin-banner" role="note" id="console-twin">
          {t(locale, 'twin.banner')}
        </p>
      ) : null}
      {mode === 'NORMAL' ? null : (
        <p className="mode-banner" role="status" id="console-mode-banner" data-mode={mode}>
          {t(locale, `lane.mode.${mode}`)}
        </p>
      )}
      <main className="console-main">
        <section
          className="card console-overview"
          id="console-overview"
          aria-labelledby="overview-title"
          data-seq={overview?.seq ?? ''}
        >
          <h2 id="overview-title">
            {t(locale, 'supervisor.overview.title')}
            {overview === null ? null : (
              <span className="muted" id="console-overview-at">
                {' '}
                {t(locale, 'supervisor.overview.at', {
                  time: timeOfDay(Date.parse(overview.at), locale, timeZone),
                })}
              </span>
            )}
          </h2>
          {overview === null ? (
            <div className="spinner" role="progressbar" aria-label="GateFlow" />
          ) : (
            <>
              {overview.alerts.length === 0 ? (
                <p className="muted" id="console-alerts-none">
                  {t(locale, 'supervisor.overview.noAlerts')}
                </p>
              ) : (
                <ul className="alerts" id="console-alerts">
                  {overview.alerts.map((a) => (
                    <li key={a.code} data-alert={a.code} data-severity={a.severity}>
                      {t(locale, `supervisor.alert.${a.code}`, { count: a.count ?? 0 })}
                    </li>
                  ))}
                </ul>
              )}
              <div className="kpis">
                <div
                  className="kpi"
                  id="kpi-waiting"
                  data-people={
                    overview.tickets.waiting.people +
                    overview.tickets.prepare.people +
                    overview.tickets.called.people
                  }
                >
                  <span className="kpi-label">{t(locale, 'supervisor.overview.waitingNow')}</span>
                  <span className="kpi-value">
                    {overview.tickets.waiting.people +
                      overview.tickets.prepare.people +
                      overview.tickets.called.people}{' '}
                    <small>{t(locale, 'supervisor.overview.people')}</small>
                  </span>
                  <span className="kpi-detail">
                    {t(locale, 'supervisor.overview.waitingDetail', {
                      tickets:
                        overview.tickets.waiting.tickets +
                        overview.tickets.prepare.tickets +
                        overview.tickets.called.tickets,
                      minutes: minutes(overview.waitingNow?.maxMs ?? 0),
                    })}
                  </span>
                </div>
                <div className="kpi" id="kpi-waits">
                  <span className="kpi-label">{t(locale, 'supervisor.overview.waits')}</span>
                  <span className="kpi-value">
                    {overview.waits.lastHour === null
                      ? '–'
                      : t(locale, 'supervisor.overview.minutesPair', {
                          p50: minutes(overview.waits.lastHour.p50Ms),
                          p90: minutes(overview.waits.lastHour.p90Ms),
                        })}
                  </span>
                  <span className="kpi-detail">
                    {overview.waits.day === null
                      ? t(locale, 'supervisor.overview.noWaits')
                      : t(locale, 'supervisor.overview.waitsDetail', {
                          p50: minutes(overview.waits.day.p50Ms),
                          p90: minutes(overview.waits.day.p90Ms),
                        })}
                  </span>
                </div>
                <div
                  className="kpi"
                  id="kpi-risk"
                  data-critical={overview.atRisk.CRITICAL.people}
                  data-people={
                    overview.atRisk.CRITICAL.people +
                    overview.atRisk.URGENT.people +
                    overview.atRisk.ATTENTION.people
                  }
                >
                  <span className="kpi-label">{t(locale, 'supervisor.overview.atRisk')}</span>
                  <span className="kpi-value">
                    {overview.atRisk.CRITICAL.people +
                      overview.atRisk.URGENT.people +
                      overview.atRisk.ATTENTION.people}{' '}
                    <small>{t(locale, 'supervisor.overview.people')}</small>
                  </span>
                  <span className="kpi-detail">
                    {t(locale, 'supervisor.overview.atRiskDetail', {
                      critical: overview.atRisk.CRITICAL.people,
                      urgent: overview.atRisk.URGENT.people,
                      attention: overview.atRisk.ATTENTION.people,
                    })}
                  </span>
                </div>
                <div className="kpi" id="kpi-lanes" data-lanes={overview.lanesOpen}>
                  <span className="kpi-label">{t(locale, 'supervisor.lanes.title')}</span>
                  <span className="kpi-value">{overview.lanesOpen}</span>
                  <span className="kpi-detail">
                    {t(locale, `supervisor.mode.${overview.mode}`)}
                  </span>
                </div>
              </div>
              <div className="overview-columns">
                <section id="console-fairness" aria-labelledby="fairness-title">
                  <h3 id="fairness-title">{t(locale, 'supervisor.overview.fairness')}</h3>
                  <p data-figure="calledAhead">
                    {t(locale, 'supervisor.overview.calledAhead', {
                      count: overview.fairness.priorityCommitments,
                      total: overview.fairness.commitments,
                      share: percent(
                        overview.fairness.priorityCommitments,
                        overview.fairness.commitments,
                      ),
                    })}
                  </p>
                  <p data-figure="passed">
                    {t(locale, 'supervisor.overview.passed', {
                      count: overview.fairness.passedPeople,
                    })}
                  </p>
                  <p data-figure="mostOvertaken">
                    {overview.fairness.overtakeBound === null
                      ? t(locale, 'supervisor.overview.mostOvertakenNoBound', {
                          count: overview.fairness.mostOvertaken,
                        })
                      : t(locale, 'supervisor.overview.mostOvertaken', {
                          count: overview.fairness.mostOvertaken,
                          bound: overview.fairness.overtakeBound,
                        })}
                  </p>
                  <p data-figure="overrides">
                    {t(locale, 'supervisor.overview.overrides', {
                      count: overview.fairness.overrides,
                    })}
                  </p>
                </section>
                <section id="console-data" aria-labelledby="data-title">
                  <h3 id="data-title">{t(locale, 'supervisor.overview.data')}</h3>
                  <p data-figure="flights">
                    {t(locale, 'supervisor.overview.flights', {
                      flights: overview.dataQuality.flights,
                      feed: overview.dataQuality.feed,
                      rule: overview.dataQuality.rule,
                      none: overview.dataQuality.none,
                    })}
                  </p>
                  <p data-figure="stale">
                    {overview.dataQuality.stale === null ||
                    overview.dataQuality.staleAfterMs === null
                      ? t(locale, 'supervisor.overview.noStaleRule')
                      : t(locale, 'supervisor.overview.stale', {
                          minutes: minutes(overview.dataQuality.staleAfterMs),
                          count: overview.dataQuality.stale,
                        })}
                  </p>
                  <p data-figure="unverified">
                    {t(locale, 'supervisor.overview.unverified', {
                      count: overview.dataQuality.unverified.people,
                    })}
                  </p>
                </section>
              </div>
              <div className="actions">
                <button
                  type="button"
                  className="button secondary"
                  id="console-overview-verify"
                  onClick={() => void verifyOverview()}
                >
                  {t(locale, 'supervisor.overview.verify')}
                </button>
              </div>
              {check === null ? null : (
                <div id="console-overview-check" data-kind={check.intact ? 'ok' : 'stop'}>
                  <p className="outcome" data-kind={check.intact ? 'ok' : 'stop'}>
                    {check.intact
                      ? t(locale, 'supervisor.overview.intact', { commands: check.commands })
                      : t(locale, 'supervisor.overview.differs', {
                          count: check.differences.length,
                        })}
                  </p>
                  {check.intact ? null : (
                    <ul className="differences">
                      {check.differences.slice(0, 5).map((d) => (
                        <li key={d.what}>
                          <code>{d.what}</code>: {d.live} ≠ {d.log}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </>
          )}
        </section>

        <section
          className="card console-advice"
          id="console-advice"
          aria-labelledby="advice-title"
          data-state={advice === null ? 'loading' : 'ready'}
          data-open={openAdvice?.id ?? ''}
        >
          <h2 id="advice-title">
            {t(locale, 'supervisor.advice.title')}{' '}
            <span className="badge">{t(locale, 'supervisor.forecast.preview')}</span>
          </h2>
          {advice === null ? (
            <p className="muted">…</p>
          ) : (
            <>
              {openAdvice === undefined ? (
                <p className="muted" id="console-advice-none">
                  {t(
                    locale,
                    advices.length === 0 ? 'supervisor.advice.none' : 'supervisor.advice.noneOpen',
                  )}
                </p>
              ) : (
                <div
                  className="advice-open"
                  id="console-advice-open"
                  data-advice={openAdvice.id}
                  data-action={openAdvice.action}
                  role="status"
                >
                  <p className="advice-action" id="console-advice-action">
                    {adviceAction(locale, openAdvice.action, openAdvice.lanes)}
                  </p>
                  <p data-figure="why">{adviceWhy(openAdvice)}</p>
                  <p data-figure="interval">
                    {t(locale, 'supervisor.advice.interval', {
                      time: hhmm(openAdvice.benefitAt),
                      without: bandText(locale, openAdvice.waitWithout),
                      with: bandText(locale, openAdvice.waitWith),
                    })}
                  </p>
                  <p data-figure="benefit">
                    {t(locale, 'supervisor.advice.benefit', {
                      without: Math.round(openAdvice.peakWithoutMinutes),
                      with: Math.round(openAdvice.peakWithMinutes),
                    })}
                  </p>
                  <p className="muted" data-figure="lanes">
                    {t(locale, 'supervisor.advice.lanesOpen', { lanes: openAdvice.lanesOpen })}
                    {' · '}
                    {t(locale, 'supervisor.advice.validUntil', {
                      time: hhmm(openAdvice.validUntil),
                    })}
                  </p>
                  {twin ? (
                    <p className="muted" id="console-advice-twin">
                      {t(locale, 'supervisor.advice.twin')}
                    </p>
                  ) : (
                    <div className="advice-actions">
                      <button
                        type="button"
                        className="button primary"
                        id="console-advice-accept"
                        onClick={() => void decide(openAdvice.id, 'ACCEPT')}
                      >
                        {t(locale, 'supervisor.advice.accept')}
                      </button>
                      <button
                        type="button"
                        className="button secondary"
                        id="console-advice-postpone"
                        onClick={() => void decide(openAdvice.id, 'POSTPONE')}
                      >
                        {t(locale, 'supervisor.advice.postpone', {
                          minutes: advice.rule.postponeMinutes,
                        })}
                      </button>
                      <span className="advice-decline">
                        <label className="visually-hidden" htmlFor="console-advice-reason">
                          {t(locale, 'supervisor.advice.declineReason')}
                        </label>
                        <select
                          id="console-advice-reason"
                          value={declineReason}
                          onChange={(e) => {
                            setDeclineReason(e.target.value as AdviceDeclineReason | '');
                          }}
                        >
                          <option value="">{t(locale, 'supervisor.advice.reason.none')}</option>
                          {DECLINE_REASONS.map((r) => (
                            <option key={r} value={r}>
                              {t(locale, `supervisor.advice.reason.${r}`)}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          className="button secondary"
                          id="console-advice-decline"
                          disabled={declineReason === ''}
                          onClick={() => void decide(openAdvice.id, 'DECLINE')}
                        >
                          {t(locale, 'supervisor.advice.decline')}
                        </button>
                      </span>
                    </div>
                  )}
                </div>
              )}
              <p
                className="outcome"
                role="status"
                id="console-advice-notice"
                data-kind={adviceNotice?.kind ?? ''}
              >
                {adviceNotice?.text ?? ''}
              </p>
              {advices.length === 0 ? null : (
                <>
                  <h3 id="advice-history-title">{t(locale, 'supervisor.advice.history')}</h3>
                  <ul
                    className="advice-history"
                    id="console-advice-history"
                    aria-labelledby="advice-history-title"
                  >
                    {advices.map((a) => (
                      <li
                        key={a.id}
                        data-advice={a.id}
                        data-status={a.status}
                        data-action={a.action}
                      >
                        <span className="audit-when">{hhmm(a.at)}</span>
                        <span className="advice-what">
                          {adviceAction(locale, a.action, a.lanes)}
                        </span>
                        <span className="advice-status" data-status={a.status}>
                          {t(locale, `supervisor.advice.status.${a.status}`)}
                          {a.decision?.reason === undefined || a.decision.reason === null
                            ? ''
                            : ` · ${t(locale, `supervisor.advice.reason.${a.decision.reason}`)}`}
                        </span>
                        <span className="advice-outcome muted" data-outcome={a.outcome !== null}>
                          {adviceOutcome(a)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
              <p className="muted forecast-note" id="console-advice-note">
                {t(locale, 'supervisor.advice.note', {
                  every: advice.rule.reviewEveryMinutes,
                  target: advice.rule.targetWaitMinutes,
                  below: advice.rule.closeBelowMinutes,
                  cooldown: advice.rule.cooldownMinutes,
                })}
              </p>
            </>
          )}
        </section>

        <section
          className="card console-forecast"
          id="console-forecast"
          aria-labelledby="forecast-title"
          data-state={
            forecast === null || typeof forecast === 'string' ? (forecast ?? 'loading') : 'ready'
          }
        >
          <h2 id="forecast-title">
            {t(locale, 'supervisor.forecast.title')}{' '}
            <span className="badge">{t(locale, 'supervisor.forecast.preview')}</span>
          </h2>
          {forecast === null ? (
            <p className="muted">…</p>
          ) : forecast === 'none' ? (
            <p className="muted" id="console-forecast-none">
              {t(locale, 'supervisor.forecast.none')}
            </p>
          ) : forecast === 'failed' ? (
            <p className="muted">{t(locale, 'supervisor.forecast.unavailable')}</p>
          ) : (
            <>
              <div className="table-scroll">
                <table className="forecast-table">
                  <thead>
                    <tr>
                      <th scope="col" />
                      {forecast.horizons.map((h) => (
                        <th scope="col" key={h.minutes}>
                          {t(locale, 'supervisor.forecast.in', { minutes: h.minutes })}
                          <small className="muted">
                            {' '}
                            {timeOfDay(Date.parse(h.at), locale, timeZone)}
                          </small>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(
                      [
                        ['arrivals', (h: ForecastResponse['horizons'][number]) => h.arrivals],
                        ['backlog', (h: ForecastResponse['horizons'][number]) => h.backlog],
                        ['wait', (h: ForecastResponse['horizons'][number]) => h.waitMinutes],
                      ] as const
                    ).map(([key, pick]) => (
                      <tr key={key} data-quantity={key}>
                        <th scope="row">{t(locale, `supervisor.forecast.${key}`)}</th>
                        {forecast.horizons.map((h) => (
                          <td key={h.minutes} data-p50={pick(h).p50}>
                            {bandText(locale, pick(h))}
                          </td>
                        ))}
                      </tr>
                    ))}
                    <tr data-quantity="lanes">
                      <th scope="row">{t(locale, 'supervisor.forecast.lanes')}</th>
                      {forecast.horizons.map((h) => (
                        <td key={h.minutes}>{h.lanes}</td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>
              <p className="muted forecast-note" id="console-forecast-note">
                {t(locale, 'supervisor.forecast.note', {
                  paths: forecast.model.paths,
                  scenario: forecast.model.scenario.title,
                  seen: forecast.state.arrivalsLastHour,
                  expected: Math.round(forecast.state.expectedLastHour),
                })}
              </p>
            </>
          )}
        </section>

        <section className="card console-mode" id="console-mode" aria-labelledby="mode-title">
          <fieldset className="plain" disabled={twin}>
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
          </fieldset>
        </section>

        <section className="card console-lanes" id="console-lanes" aria-labelledby="lanes-title">
          <fieldset className="plain" disabled={twin}>
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
          </fieldset>
        </section>

        <section className="card console-queue" id="console-queue" aria-labelledby="queue-title">
          <fieldset className="plain" disabled={twin}>
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
          </fieldset>
        </section>

        <section className="card console-policy" id="console-policy" aria-labelledby="policy-title">
          <fieldset className="plain" disabled={twin}>
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
          </fieldset>
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
                      {e.by.kind === 'SYSTEM' && (e.by.label === 'timer' || e.by.label === 'twin')
                        ? t(locale, `supervisor.by.${e.by.label}`)
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
