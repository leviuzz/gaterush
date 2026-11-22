import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ScenarioValidationError } from '@gateflow/sim-scenarios';
import type { Scenario } from '@gateflow/sim-scenarios';
import {
  defaultPolicyIds,
  experimentConfig,
  loadLibrary,
  markWhatIf,
  parseResultsFile,
  withLevers,
  withParameter,
} from '@gateflow/studio-core';
import type { LibraryEntry, ParameterChange } from '@gateflow/studio-core';
import { ComparePanel } from './components/ComparePanel';
import { GateFlowPanel } from './components/GateFlowPanel';
import { LeversPanel } from './components/LeversPanel';
import { ParametersPanel } from './components/ParametersPanel';
import { PoliciesPanel } from './components/PoliciesPanel';
import { ReplayPanel } from './components/ReplayPanel';
import { ReportPanel, ResultsPanel } from './components/ResultsPanel';
import type { Run } from './components/ResultsPanel';
import { RunPanel } from './components/RunPanel';
import type { ActiveRun, RunStatus } from './components/RunPanel';
import { ScenarioPanel } from './components/ScenarioPanel';
import { COMMIT, LIBRARY_FILES, STUDIO_VERSION, WORKER_SOURCE } from './env';
import { canSaveFiles, readFiles } from './exports';
import { orderedPolicyIds } from './policies';
import { RunCancelled, planRun, resultsOfRun, runDays } from './pool';

const LIBRARY = loadLibrary(LIBRARY_FILES);
/** The page opens on the case where GateFlow matters most in simulation: a transfer hub. */
const START = 'scenarios/mx-like-transfer-hub.yaml';
const CORES = Math.max(
  1,
  Math.min(8, typeof navigator === 'undefined' ? 2 : navigator.hardwareConcurrency || 2),
);

/** The record with `key` set to `value`, or without `key` when `value` is undefined. */
function withEntry<T>(
  record: Readonly<Record<string, T>>,
  key: string,
  value: T | undefined,
): Record<string, T> {
  const entries = Object.entries(record).filter(([k]) => k !== key);
  return Object.fromEntries(value === undefined ? entries : [...entries, [key, value]]);
}

function issuesOf(error: unknown): string[] {
  if (error instanceof ScenarioValidationError) return [...error.issues];
  return [error instanceof Error ? error.message : String(error)];
}

/** The scenario with the what-if settings, then with the parameters edited by hand. */
function deriveScenario(
  base: Scenario,
  levers: Readonly<Record<string, number>>,
  edits: Readonly<Record<string, ParameterChange>>,
): {
  readonly withLevers: Scenario | null;
  readonly scenario: Scenario | null;
  readonly issues: string[];
} {
  let afterLevers: Scenario;
  try {
    afterLevers = withLevers(base, levers);
  } catch (error) {
    return { withLevers: null, scenario: null, issues: issuesOf(error) };
  }
  try {
    let scenario = afterLevers;
    for (const [path, change] of Object.entries(edits))
      scenario = withParameter(scenario, path, change);
    if (Object.keys(edits).length > 0) scenario = markWhatIf(scenario, new Map());
    return { withLevers: afterLevers, scenario, issues: [] };
  } catch (error) {
    return { withLevers: afterLevers, scenario: null, issues: issuesOf(error) };
  }
}

export function App() {
  const [userFiles, setUserFiles] = useState<Record<string, string>>({});
  const userLibrary = useMemo(
    () => loadLibrary(userFiles, 'user', { looseFolder: 'user' }),
    [userFiles],
  );
  const entries = useMemo(() => [...LIBRARY.entries, ...userLibrary.entries], [userLibrary]);
  const [selectedPath, setSelectedPath] = useState(START);
  const entry: LibraryEntry | undefined =
    entries.find((e) => e.path === selectedPath) ??
    entries.find((e) => e.path === START) ??
    entries[0];

  const [levers, setLevers] = useState<Record<string, number>>({});
  const [edits, setEdits] = useState<Record<string, ParameterChange>>({});
  const [chosen, setChosen] = useState<ReadonlySet<string>>(
    () => new Set(entry === undefined ? [] : defaultPolicyIds(entry.scenario)),
  );
  const [baseline, setBaseline] = useState<string | undefined>(undefined);
  const [days, setDays] = useState(30);
  const [runs, setRuns] = useState<Run[]>([]);
  const [shownRun, setShownRun] = useState<number | null>(null);
  const [pair, setPair] = useState<readonly [number | null, number | null]>([null, null]);
  const [active, setActive] = useState<ActiveRun | null>(null);
  const [status, setStatus] = useState<RunStatus>({ kind: 'idle' });
  const [fileErrors, setFileErrors] = useState<string[]>([]);
  const [canSave, setCanSave] = useState(false);
  const nextRunId = useRef(1);

  useEffect(() => {
    void canSaveFiles().then(setCanSave);
  }, []);

  const derived = useMemo(
    () =>
      entry === undefined
        ? { withLevers: null, scenario: null, issues: ['no scenario'] }
        : deriveScenario(entry.scenario, levers, edits),
    [entry, levers, edits],
  );
  const ordered = orderedPolicyIds(chosen);
  const baselineId = baseline !== undefined && ordered.includes(baseline) ? baseline : ordered[0];
  const setup = useMemo(() => {
    if (derived.scenario === null) return { config: null, blocked: derived.issues.join('\n') };
    try {
      return {
        config: experimentConfig({
          scenario: derived.scenario,
          policyIds: ordered,
          days,
          ...(baselineId === undefined ? {} : { baselineId }),
        }),
        blocked: null,
      };
    } catch (error) {
      return { config: null, blocked: issuesOf(error).join('\n') };
    }
  }, [derived, ordered.join(','), baselineId, days]);

  const selectScenario = (path: string) => {
    const next = entries.find((e) => e.path === path);
    if (next === undefined) return;
    setSelectedPath(path);
    setLevers({});
    setEdits({});
    setChosen(new Set(defaultPolicyIds(next.scenario)));
    setBaseline(undefined);
  };

  const addRun = (run: Run) => {
    setRuns((list) => [run, ...list]);
    setShownRun(run.id);
    setPair(([first]) => [run.id, first ?? null]);
  };

  const run = useCallback(async () => {
    const config = setup.config;
    if (config === null || active !== null) return;
    const controller = new AbortController();
    const started = performance.now();
    let where = '';
    setActive({ phase: 'plan', done: 0, total: config.seeds.length, where, controller });
    try {
      const plan = await planRun(config, WORKER_SOURCE, controller.signal);
      setActive((a) => (a === null ? a : { ...a, phase: 'days' }));
      const simulated = await runDays(plan.job, plan.seeds, {
        workerSource: WORKER_SOURCE,
        workers: CORES,
        signal: controller.signal,
        onProgress: (done, total) => {
          setActive((a) => (a === null ? a : { ...a, done, total }));
        },
        onMode: (mode) => {
          where =
            mode.kind === 'workers'
              ? `${mode.count} worker${mode.count === 1 ? '' : 's'}`
              : 'the page';
          setActive((a) => (a === null ? a : { ...a, where }));
        },
      });
      setActive((a) => (a === null ? a : { ...a, phase: 'statistics' }));
      const doc = await resultsOfRun(
        config,
        simulated,
        { version: STUDIO_VERSION, commit: COMMIT },
        WORKER_SOURCE,
        controller.signal,
      );
      const id = nextRunId.current++;
      addRun({
        id,
        label: `#${id} ${doc.manifest.scenario.title}, ${doc.summary.days} days`,
        doc,
        scenario: config.scenario,
        job: plan.job,
      });
      setStatus({
        kind: 'done',
        days: config.seeds.length,
        elapsedMs: performance.now() - started,
        where,
      });
    } catch (error) {
      setStatus(
        error instanceof RunCancelled
          ? { kind: 'cancelled' }
          : { kind: 'error', message: issuesOf(error).join('\n') },
      );
    } finally {
      setActive(null);
    }
  }, [setup, active]);

  // The page opens in a working state: it simulates the opening scenario once, unless the link
  // asks for a quiet start (#manual).
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (typeof location !== 'undefined' && location.hash === '#manual') return;
    void run();
  }, [run]);

  const addUserFiles = (files: FileList) => {
    void readFiles(files).then((read) => {
      setUserFiles((current) => {
        const next = { ...current };
        for (const file of read) next[`user/${file.name}`] = file.text;
        return next;
      });
    });
  };

  const addResultsFiles = (files: FileList) => {
    void readFiles(files).then((read) => {
      const errors: string[] = [];
      for (const file of read) {
        try {
          const doc = parseResultsFile(file.text);
          const id = nextRunId.current++;
          addRun({
            id,
            label: `#${id} ${file.name} (${doc.manifest.scenario.id})`,
            doc,
            scenario: null,
            job: null,
          });
        } catch (error) {
          errors.push(`${file.name}: ${issuesOf(error).join('; ')}`);
        }
      }
      setFileErrors(errors);
    });
  };

  const shown = runs.find((r) => r.id === shownRun) ?? runs[0];
  if (entry === undefined) {
    return <p className="error">The scenario library is empty: the page was built without it.</p>;
  }
  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <h1>GateFlow Simulator Studio</h1>
          <p>
            Simulate a security checkpoint day by day and compare today&apos;s practice with
            GateFlow, on the same passengers. Every number here is simulated, not measured.
          </p>
        </div>
        <span className="sim-badge">Simulated results</span>
      </header>
      <div className="layout">
        <div className="column">
          <ScenarioPanel
            library={LIBRARY}
            userLibrary={userLibrary}
            userFiles={Object.keys(userFiles).map((path) => path.replace(/^user\//, ''))}
            selected={entry}
            onSelect={selectScenario}
            onAddFiles={addUserFiles}
            onClearFiles={() => {
              setUserFiles({});
              if (selectedPath.startsWith('user/')) selectScenario(START);
            }}
          />
          <LeversPanel
            base={entry.scenario}
            values={levers}
            onChange={(id, value) => {
              setLevers((current) => withEntry(current, id, value));
            }}
            onReset={() => {
              setLevers({});
            }}
          />
          <ParametersPanel
            scenario={derived.withLevers ?? entry.scenario}
            edits={edits}
            onEdit={(path, change) => {
              setEdits((current) => withEntry(current, path, change));
            }}
          />
          <PoliciesPanel
            chosen={chosen}
            ordered={ordered}
            baselineId={baselineId}
            extraLanes={derived.scenario?.checkpoint.laneStaffing !== undefined}
            onToggle={(id) => {
              setChosen((current) => {
                const next = new Set(current);
                if (next.has(id)) next.delete(id);
                else next.add(id);
                return next;
              });
            }}
            onBaseline={setBaseline}
          />
          <RunPanel
            days={days}
            onDays={setDays}
            blocked={setup.blocked}
            active={active}
            status={status}
            cores={CORES}
            onRun={() => {
              void run();
            }}
            onCancel={() => {
              active?.controller.abort();
            }}
          />
        </div>
        <div className="column">
          {/* In the page GateFlow serves only: the build leaves it out of the offline pages. */}
          {__STUDIO_SERVER__ && (
            <GateFlowPanel
              shown={runs.find((r) => r.id === shownRun) ?? runs[0]}
              onOpen={(doc, label) => {
                const id = nextRunId.current++;
                addRun({ id, label: `#${id} ${label}`, doc, scenario: null, job: null });
              }}
            />
          )}
          {runs.length > 1 && (
            <section className="panel" aria-labelledby="h-runs">
              <h2 id="h-runs">Runs of this session</h2>
              <div className="runs">
                {runs.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    className="run-item"
                    aria-current={r.id === shown?.id}
                    onClick={() => {
                      setShownRun(r.id);
                    }}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            </section>
          )}
          {shown === undefined ? (
            <section className="panel">
              <h2>Results</h2>
              <p className="hint">The results of a run appear here, with the full report.</p>
            </section>
          ) : (
            <>
              <ResultsPanel run={shown} canSave={canSave} />
              <ReplayPanel key={shown.id} run={shown} canSave={canSave} />
              <ReportPanel doc={shown.doc} />
            </>
          )}
          <ComparePanel
            runs={runs}
            pair={pair}
            onPair={setPair}
            onAddFiles={addResultsFiles}
            fileErrors={fileErrors}
          />
        </div>
      </div>
      <footer className="footer">
        <span>GateFlow Simulator Studio {STUDIO_VERSION}</span>
        <span className="mono">source {COMMIT}</span>
        <span>
          {__STUDIO_SERVER__
            ? 'Served by GateFlow: the page connects to this server only, when you sign in and save.'
            : 'Runs offline: the page never connects to the network.'}
        </span>
      </footer>
    </div>
  );
}
