import { t } from '@gateflow/i18n';
import type { Locale } from '@gateflow/i18n';
import type {
  MeResponse,
  StaffMemberResponse,
  TwinDisplayResponse,
  TwinOptionsResponse,
  TwinResponse,
  TwinRun,
} from '@gateflow/contracts';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { SyntheticEvent } from 'react';
import { api } from '../api';
import { coalesced } from '../common/coalesce';
import { timeOfDay, useDocumentLanguage } from '../common/format';
import { LanguageSwitch } from '../common/LanguageSwitch';
import { SignIn } from '../common/SignIn';

/*
 * The demo page of the digital twin (S18, ADR-051), `/demo`, for the administrators of an airport
 * whose data are synthetic: choose a scenario, a policy, a day and a speed; start, stop, start
 * again. The page shows the virtual clock, the progress, the board as the displays show it, the
 * latest calls, and the check of every call against the offline simulator; it links to the twin's
 * own display, lane station and console. Everything shown is SIMULATED.
 */

/** Virtual time per real time; null: as fast as the server goes. */
const SPEEDS: readonly (number | null)[] = [1, 10, 60, 300, 1000, null];
const LIVE_MS = 1_000;
const IDLE_MS = 5_000;

type Member = StaffMemberResponse['member'];
type Phase = 'starting' | 'sign-in' | 'not-allowed' | 'unavailable' | 'ready';

function speedLabel(locale: Locale, speed: number | null): string {
  if (speed === null) return t(locale, 'demo.speed.max');
  return speed === 1 ? `1× · ${t(locale, 'demo.speed.real')}` : `${String(speed)}×`;
}

/** The virtual clock to the second: `07:42:05`. */
function clockOf(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
    timeZone,
  }).format(new Date(iso));
}

export function Demo({ defaultLocale }: { readonly defaultLocale: Locale }) {
  const [locale, setLocale] = useState<Locale>(defaultLocale);
  const [phase, setPhase] = useState<Phase>('starting');
  const [member, setMember] = useState<Member | null>(null);
  const [options, setOptions] = useState<TwinOptionsResponse | null>(null);
  const [twin, setTwin] = useState<TwinResponse | null>(null);
  const [scenarioId, setScenarioId] = useState('');
  const [policyId, setPolicyId] = useState('');
  const [seed, setSeed] = useState('1');
  const [speed, setSpeed] = useState<number | null>(60);
  const [until, setUntil] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [display, setDisplay] = useState<TwinDisplayResponse | null>(null);
  const [timeZone, setTimeZone] = useState<string | undefined>(undefined);
  useDocumentLanguage(locale);

  const enter = useCallback(async (signedIn: Member | null) => {
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
    const answer = await api<TwinOptionsResponse>('/v1/twin/options', { session: true });
    if (!answer.ok) {
      setPhase(
        answer.status === 401 ? 'sign-in' : answer.status === 404 ? 'unavailable' : 'not-allowed',
      );
      return;
    }
    setOptions(answer.body);
    setScenarioId((s) => (s === '' ? (answer.body.scenarios[0]?.id ?? '') : s));
    setPolicyId(
      (p) =>
        p ||
        (answer.body.policies.find((x) => x.policyId === 'priority-v3') ?? answer.body.policies[0])
          ?.id ||
        '',
    );
    setPhase('ready');
  }, []);
  useEffect(() => {
    void enter(null);
  }, [enter]);

  const refresh = useMemo(
    () =>
      coalesced(async () => {
        const answer = await api<TwinResponse>('/v1/twin', { session: true });
        if (answer.ok) {
          setTwin(answer.body);
          return;
        }
        if (answer.status === 401) setPhase('sign-in');
      }),
    [],
  );

  const run: TwinRun | null = twin?.run ?? null;
  const playing = run?.state === 'RUNNING';

  // The twin's state, every second while it plays.
  useEffect(() => {
    if (phase !== 'ready') return;
    void refresh();
    const timer = window.setInterval(
      () => {
        void refresh();
      },
      playing ? LIVE_MS : IDLE_MS,
    );
    return () => {
      window.clearInterval(timer);
    };
  }, [phase, playing, refresh]);

  // The airport's time zone, from the twin's checkpoint: the virtual clock reads in it.
  const checkpointId = run?.checkpointId;
  useEffect(() => {
    if (checkpointId === undefined) return;
    void api<{ airport: { timeZone: string } }>(`/v1/checkpoints/${checkpointId}`, {
      session: true,
    }).then((answer) => {
      if (answer.ok) setTimeZone(answer.body.airport.timeZone);
    });
  }, [checkpointId]);

  const start = async (event?: SyntheticEvent) => {
    event?.preventDefault();
    setNotice(null);
    setDisplay(null);
    if (playing) await api(`/v1/twin/runs/${run.id}/stop`, { method: 'POST', session: true });
    const answer = await api<TwinRun>('/v1/twin/runs', {
      method: 'POST',
      session: true,
      body: {
        scenarioId,
        seed: Number(seed),
        policyVersionId: policyId,
        speed,
        ...(until === '' ? {} : { until }),
      },
    });
    if (!answer.ok) {
      setNotice(
        answer.code === 'TWIN_RUNNING'
          ? t(locale, 'demo.running')
          : t(locale, 'demo.refused', { code: answer.code }),
      );
    }
    await refresh();
  };

  const stop = async () => {
    if (run === null) return;
    await api(`/v1/twin/runs/${run.id}/stop`, { method: 'POST', session: true });
    await refresh();
  };

  const changeSpeed = async (next: number | null) => {
    setSpeed(next);
    if (!playing) return;
    await api(`/v1/twin/runs/${run.id}/speed`, {
      method: 'POST',
      session: true,
      body: { speed: next },
    });
    await refresh();
  };

  const makeDisplay = async () => {
    if (run === null) return;
    const answer = await api<TwinDisplayResponse>(`/v1/twin/runs/${run.id}/display`, {
      method: 'POST',
      session: true,
    });
    if (answer.ok) setDisplay(answer.body);
  };

  const signOut = async () => {
    await api('/v1/auth/sign-out', { method: 'POST', session: true });
    setMember(null);
    setTwin(null);
    setPhase('sign-in');
  };

  const header = (
    <header className="bar">
      <div className="place">
        <span className="brand">GateFlow</span>
        <span className="where">{t(locale, 'demo.title')}</span>
        {member === null ? null : (
          <span className="who" id="demo-member">
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
            id="demo-sign-out"
            onClick={() => void signOut()}
          >
            {t(locale, 'lane.signOut')}
          </button>
        )}
      </div>
    </header>
  );

  if (phase !== 'ready' || options === null) {
    return (
      <div className="demo" data-phase={phase}>
        {header}
        <main className="page-main">
          {phase === 'starting' ? (
            <div className="spinner" role="progressbar" aria-label="GateFlow" />
          ) : null}
          {phase === 'sign-in' ? (
            <SignIn locale={locale} prefix="demo" onSignedIn={(m) => void enter(m)} />
          ) : null}
          {phase === 'not-allowed' ? (
            <section className="card message-card" id="demo-not-allowed">
              <p className="message">{t(locale, 'demo.notAllowed')}</p>
            </section>
          ) : null}
          {phase === 'unavailable' ? (
            <section className="card message-card" id="demo-unavailable">
              <p className="message">{t(locale, 'demo.unavailable')}</p>
            </section>
          ) : null}
        </main>
      </div>
    );
  }

  const board = twin?.board ?? null;
  const counts = twin?.counts;
  const progress = run === null || run.steps === 0 ? 0 : run.applied / run.steps;
  const at = (iso: string) => timeOfDay(Date.parse(iso), locale, timeZone);

  return (
    <div className="demo" data-phase="ready" data-state={run?.state ?? 'NONE'}>
      {header}
      <p className="simulated-banner" role="note" id="demo-simulated">
        {t(locale, 'demo.simulated')}
      </p>
      <main className="demo-main">
        <section className="card demo-controls" aria-labelledby="demo-controls-title">
          <h2 id="demo-controls-title">{t(locale, 'demo.title')}</h2>
          <form className="demo-form" onSubmit={(e) => void start(e)}>
            <label htmlFor="demo-scenario">{t(locale, 'demo.scenario')}</label>
            <select
              id="demo-scenario"
              value={scenarioId}
              onChange={(e) => {
                setScenarioId(e.target.value);
              }}
            >
              {options.scenarios.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title}
                </option>
              ))}
            </select>
            <label htmlFor="demo-policy">{t(locale, 'demo.policy')}</label>
            <select
              id="demo-policy"
              value={policyId}
              onChange={(e) => {
                setPolicyId(e.target.value);
              }}
            >
              {options.policies.map((p) => (
                <option key={p.id} value={p.id} data-policy={p.policyId}>
                  {p.title} ({p.hash.slice(0, 8)})
                </option>
              ))}
            </select>
            <div className="demo-row">
              <div>
                <label htmlFor="demo-seed">{t(locale, 'demo.seed')}</label>
                <input
                  id="demo-seed"
                  type="number"
                  min={1}
                  max={1_000_000}
                  value={seed}
                  onChange={(e) => {
                    setSeed(e.target.value);
                  }}
                />
              </div>
              <div>
                <label htmlFor="demo-until">{t(locale, 'demo.until')}</label>
                <input
                  id="demo-until"
                  type="time"
                  value={until}
                  onChange={(e) => {
                    setUntil(e.target.value);
                  }}
                />
              </div>
            </div>
            <label htmlFor="demo-speed">{t(locale, 'demo.speed')}</label>
            <select
              id="demo-speed"
              value={speed === null ? 'max' : String(speed)}
              onChange={(e) => {
                void changeSpeed(e.target.value === 'max' ? null : Number(e.target.value));
              }}
            >
              {SPEEDS.map((s) => (
                <option key={String(s)} value={s === null ? 'max' : String(s)}>
                  {speedLabel(locale, s)}
                </option>
              ))}
            </select>
            <div className="actions">
              <button
                type="submit"
                className="button primary"
                id="demo-start"
                disabled={scenarioId === '' || policyId === ''}
              >
                {run === null ? t(locale, 'demo.start') : t(locale, 'demo.reset')}
              </button>
              <button
                type="button"
                className="button secondary"
                id="demo-stop"
                disabled={!playing}
                onClick={() => void stop()}
              >
                {t(locale, 'demo.stop')}
              </button>
            </div>
            {notice === null ? null : (
              <p className="notice" role="alert" id="demo-notice">
                {notice}
              </p>
            )}
          </form>
        </section>

        <section className="card demo-run" aria-labelledby="demo-run-title" id="demo-run">
          {run === null ? (
            <p className="muted" id="demo-none">
              {t(locale, 'demo.none')}
            </p>
          ) : (
            <>
              <h2 id="demo-run-title">
                {run.checkpoint}{' '}
                <span className="state-badge" id="demo-state" data-state={run.state}>
                  {t(locale, `demo.state.${run.state}`)}
                </span>
              </h2>
              <p className="demo-clock-label">{t(locale, 'demo.clock')}</p>
              <p className="demo-clock" id="demo-clock">
                {timeZone === undefined ? '' : clockOf(run.virtualNow, timeZone)}
              </p>
              <div
                className="progress"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={run.steps}
                aria-valuenow={run.applied}
              >
                <span style={{ width: `${(progress * 100).toFixed(1)}%` }} />
              </div>
              <p className="muted" id="demo-progress">
                {t(locale, 'demo.progress', { applied: run.applied, steps: run.steps })} ·{' '}
                {speedLabel(locale, run.speed)}
              </p>
              <p className="demo-check" id="demo-check" data-state={run.state}>
                {run.state === 'FINISHED' && run.matchedCalls === run.expectedCalls
                  ? t(locale, 'demo.same', { calls: run.matchedCalls })
                  : t(locale, 'demo.check', {
                      matched: run.matchedCalls,
                      expected: run.expectedCalls,
                    })}
              </p>
              {run.divergence === null ? null : (
                <p className="notice" role="alert" id="demo-divergence">
                  {t(locale, 'demo.divergence', {
                    time: at(run.divergence.at),
                    operation: run.divergence.operation,
                    expected: run.divergence.expected,
                    actual: run.divergence.actual,
                  })}
                </p>
              )}
              {run.error === null ? null : (
                <p className="notice" role="alert" id="demo-error">
                  {t(locale, 'demo.error', { error: run.error })}
                </p>
              )}
              {counts === undefined ? null : (
                <dl className="demo-counts" id="demo-counts">
                  {(['issued', 'waiting', 'called', 'admitted'] as const).map((k) => (
                    <div key={k} data-count={k}>
                      <dt>{t(locale, `demo.counts.${k}`)}</dt>
                      <dd>{counts[k]}</dd>
                    </div>
                  ))}
                </dl>
              )}
              <h3>{t(locale, 'demo.screens')}</h3>
              <div className="demo-links">
                {display === null ? (
                  <button
                    type="button"
                    className="button secondary"
                    id="demo-display-make"
                    onClick={() => void makeDisplay()}
                  >
                    {t(locale, 'demo.display.make')}
                  </button>
                ) : (
                  <a
                    className="button secondary"
                    id="demo-display-open"
                    href={`/display/${display.checkpointId}#device=${display.token}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {t(locale, 'demo.display.open')}
                  </a>
                )}
                <a
                  className="button secondary"
                  id="demo-lane"
                  href={`/lane/${run.checkpointId}?lang=${locale}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {t(locale, 'demo.lane')}
                </a>
                <a
                  className="button secondary"
                  id="demo-console"
                  href={`/supervisor/${run.checkpointId}?lang=${locale}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {t(locale, 'demo.console')}
                </a>
              </div>
            </>
          )}
        </section>

        <section className="card demo-board" aria-labelledby="demo-board-title" id="demo-board">
          <h2 id="demo-board-title">{t(locale, 'demo.called')}</h2>
          {(board?.called.length ?? 0) === 0 ? (
            <p className="muted">{t(locale, 'lane.empty')}</p>
          ) : null}
          <ol className="demo-numbers" id="demo-called">
            {(board?.called ?? []).slice(0, 8).map((c) => (
              <li key={c.number} data-number={c.number} className={c.second ? 'second' : ''}>
                {c.number}
              </li>
            ))}
          </ol>
          <h2>{t(locale, 'demo.prepare')}</h2>
          {(board?.prepare.length ?? 0) === 0 ? (
            <p className="muted">{t(locale, 'lane.empty')}</p>
          ) : null}
          <ol className="demo-numbers prepare" id="demo-prepare">
            {(board?.prepare ?? []).slice(0, 10).map((n) => (
              <li key={n} data-number={n}>
                {n}
              </li>
            ))}
          </ol>
        </section>

        <section className="card demo-calls" aria-labelledby="demo-calls-title" id="demo-calls">
          <h2 id="demo-calls-title">{t(locale, 'demo.calls')}</h2>
          <ul>
            {(twin?.calls ?? []).map((c) => (
              <li key={`${c.number}-${c.at}`} data-number={c.number}>
                <span className="row-number">{c.number}</span>
                <span className="muted">{at(c.at)}</span>
                {c.priority ? <span className="tag">{t(locale, 'demo.priority')}</span> : null}
                <code>{c.reasons.join(' · ')}</code>
              </li>
            ))}
          </ul>
        </section>
      </main>
    </div>
  );
}
