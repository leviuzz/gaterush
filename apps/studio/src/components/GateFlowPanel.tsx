import { useCallback, useEffect, useState } from 'react';
import type { SimulationRun, StaffRole } from '@gateflow/contracts';
import type { ResultsDocument } from '@gateflow/sim-metrics';
import { parseResultsFile } from '@gateflow/studio-core';
import { GateFlowError, gateflow, saveRun } from '../gateflow';
import type { Run } from './ResultsPanel';

interface Member {
  readonly login: string;
  readonly role: StaffRole;
}

interface Props {
  /** The run on screen: saved when it was simulated in this page. */
  readonly shown: Run | undefined;
  /** Opens the results of a run saved in GateFlow among the runs of the page. */
  readonly onOpen: (doc: ResultsDocument, label: string) => void;
}

const POLL_MS = 2000;

const messageOf = (error: unknown): string =>
  error instanceof GateFlowError || error instanceof Error ? error.message : String(error);

/** What a saved run says of the page's results, once GateFlow has simulated it again. */
function matchText(run: SimulationRun): string {
  if (run.expected === null) return '';
  if (run.expected.matches === true) return 'same results as the page';
  if (run.expected.matches === false) return 'DIFFERENT results from the page';
  return 'checking against the page';
}

/**
 * GateFlow, when the page is served by it (S19): sign in as an analyst, save the run on screen,
 * and open the runs of the airport. The page sends nothing until a person signs in and saves.
 */
export function GateFlowPanel(props: Props) {
  const [member, setMember] = useState<Member | null | undefined>(undefined);
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [runs, setRuns] = useState<readonly SimulationRun[]>([]);
  const [saved, setSaved] = useState<ReadonlyMap<number, string>>(new Map());

  useEffect(() => {
    gateflow.me().then(
      (me) => {
        setMember(me.member);
      },
      () => {
        setMember(null);
      },
    );
  }, []);

  const simulates = member?.role === 'ANALYST' || member?.role === 'ADMIN';

  /** An answer that says the session has ended: sign in again. */
  const failed = useCallback((e: unknown) => {
    if (e instanceof GateFlowError && e.status === 401) {
      setMember(null);
      setRuns([]);
      setError('The session has ended: sign in again.');
      return;
    }
    setError(messageOf(e));
  }, []);

  const refresh = useCallback(async () => {
    try {
      setRuns((await gateflow.simulations()).runs);
    } catch (e) {
      failed(e);
    }
  }, [failed]);

  useEffect(() => {
    if (simulates) void refresh();
  }, [simulates, refresh]);

  // While GateFlow simulates, follow it.
  const waiting = runs.some((r) => r.state === 'QUEUED' || r.state === 'RUNNING');
  useEffect(() => {
    if (!waiting) return;
    const timer = setInterval(() => {
      void refresh();
    }, POLL_MS);
    return () => {
      clearInterval(timer);
    };
  }, [waiting, refresh]);

  const signIn = async () => {
    setError(null);
    try {
      const signed = await gateflow.signIn(login, password);
      setPassword('');
      setMember(signed.member);
    } catch (e) {
      setError(
        e instanceof GateFlowError && e.status === 401
          ? 'The login or the password is not right.'
          : messageOf(e),
      );
    }
  };

  const signOut = async () => {
    await gateflow.signOut().catch(() => undefined);
    setMember(null);
    setRuns([]);
    setNotice(null);
  };

  const shown = props.shown;
  const save = async () => {
    if (shown === undefined || shown.scenario === null) return;
    const { id, doc, scenario, label } = { ...shown, scenario: shown.scenario };
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const run = await saveRun({ doc, scenario, label });
      setSaved((current) => new Map(current).set(id, run.id));
      setNotice('Saved. GateFlow simulates it again, to check the page’s results.');
      await refresh();
    } catch (e) {
      failed(e);
    } finally {
      setSaving(false);
    }
  };

  const open = async (run: SimulationRun) => {
    setError(null);
    try {
      const doc = parseResultsFile(await gateflow.results(run.id));
      props.onOpen(doc, `GateFlow: ${run.label ?? run.scenario.title}`);
    } catch (e) {
      failed(e);
    }
  };

  return (
    <section className="panel" id="gateflow" aria-labelledby="h-gateflow">
      <h2 id="h-gateflow">
        GateFlow
        {member !== undefined && member !== null && (
          <span className="aside" id="gateflow-member">
            {member.login} ({member.role.toLowerCase()})
          </span>
        )}
      </h2>
      {member === undefined && <p className="hint">Asking GateFlow who is signed in…</p>}
      {member === null && (
        <form
          className="field"
          onSubmit={(event) => {
            event.preventDefault();
            void signIn();
          }}
        >
          <p className="hint">
            Sign in as an analyst of your airport to save runs in GateFlow and open its runs.
          </p>
          <label htmlFor="gateflow-login">Login</label>
          <input
            id="gateflow-login"
            type="text"
            autoComplete="username"
            value={login}
            onChange={(event) => {
              setLogin(event.target.value);
            }}
          />
          <label htmlFor="gateflow-password">Password</label>
          <input
            id="gateflow-password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => {
              setPassword(event.target.value);
            }}
          />
          <div className="row">
            <button
              id="gateflow-sign-in"
              type="submit"
              className="btn btn-primary"
              disabled={login === '' || password === ''}
            >
              Sign in
            </button>
          </div>
        </form>
      )}
      {member !== undefined && member !== null && !simulates && (
        <p className="error" id="gateflow-not-allowed">
          This account cannot simulate: simulations are for analysts and administrators.
        </p>
      )}
      {simulates && (
        <>
          <div className="row">
            <button
              id="gateflow-save"
              type="button"
              className="btn btn-primary"
              disabled={
                saving || shown === undefined || shown.scenario === null || saved.has(shown.id)
              }
              onClick={() => {
                void save();
              }}
            >
              {shown !== undefined && saved.has(shown.id) ? 'Saved in GateFlow' : 'Save this run'}
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => {
                void signOut();
              }}
            >
              Sign out
            </button>
          </div>
          {shown !== undefined && shown.scenario === null && (
            <p className="hint">Only a run simulated in this page can be saved.</p>
          )}
          {notice !== null && (
            <p className="status" id="gateflow-notice" role="status">
              {notice}
            </p>
          )}
          <h3 className="label">Runs of the airport</h3>
          {runs.length === 0 ? (
            <p className="hint">No run saved yet.</p>
          ) : (
            <ul className="gateflow-runs" id="gateflow-runs">
              {runs.map((run) => (
                <li
                  key={run.id}
                  data-run={run.id}
                  data-state={run.state}
                  data-matches={String(run.expected?.matches ?? '')}
                >
                  <span className="gateflow-run-title">{run.label ?? run.scenario.title}</span>
                  <span className="status">
                    {run.state.toLowerCase()}, {run.days.done}/{run.days.total} days
                    {matchText(run) === '' ? '' : `, ${matchText(run)}`}
                  </span>
                  {run.state === 'DONE' && (
                    <button
                      type="button"
                      className="btn btn-small gateflow-open"
                      onClick={() => {
                        void open(run);
                      }}
                    >
                      Open
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      {error !== null && (
        <p className="error" id="gateflow-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
