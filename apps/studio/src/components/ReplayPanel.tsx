import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { comparisonKey } from '@gateflow/sim-metrics';
import type { PolicyComparison } from '@gateflow/sim-metrics';
import { clock, stringifyTrace } from '@gateflow/sim-trace';
import { notableDays, replayComparison } from '@gateflow/studio-core';
import { COMMIT, STUDIO_VERSION, WORKER_SOURCE } from '../env';
import { copyText, saveFile } from '../exports';
import { signed, thousands } from '../format';
import { policyName } from '../policies';
import { RunCancelled, traceOfDay } from '../pool';
import { replayModel } from '../replay-model';
import type { ReplayModel } from '../replay-model';
import { CallsList } from './replay/CallsList';
import { CheckpointCard } from './replay/CheckpointCard';
import { PassengerDetail } from './replay/PassengerDetail';
import { PassengerLists } from './replay/PassengerLists';
import { TimeChart } from './replay/TimeChart';
import type { Run } from './ResultsPanel';

interface Props {
  readonly run: Run;
  readonly canSave: boolean;
}

type DayChoice = 'typical' | 'best' | 'worst' | 'other';

type Status =
  | { readonly kind: 'idle' }
  | { readonly kind: 'tracing'; readonly seed: number }
  | {
      readonly kind: 'ready';
      readonly model: ReplayModel;
      readonly fingerprint: string | null;
    }
  | { readonly kind: 'error'; readonly message: string };

const SPEEDS = [
  { minutesPerSecond: 2, label: '2 min/s' },
  { minutesPerSecond: 10, label: '10 min/s' },
  { minutesPerSecond: 30, label: '30 min/s' },
] as const;

/** Replay of one simulated day: the checkpoint over time, every call and every passenger. */
export function ReplayPanel({ run, canSave }: Props) {
  const { doc, job } = run;
  const comparisons = doc.manifest.comparisons;
  const [comparison, setComparison] = useState<PolicyComparison | undefined>(() =>
    replayComparison(doc),
  );
  const [choice, setChoice] = useState<DayChoice>('typical');
  const [otherSeed, setOtherSeed] = useState('');
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const days = useMemo(
    () => (comparison === undefined ? null : notableDays(doc, comparison)),
    [doc, comparison],
  );
  const seeds = useMemo(() => new Set(doc.perSeed.map((d) => d.seed)), [doc]);
  const other = Number(otherSeed);
  const seed =
    choice === 'other'
      ? Number.isSafeInteger(other) && seeds.has(other)
        ? other
        : undefined
      : days?.[choice].seed;

  useEffect(() => {
    if (job === null || comparison === undefined || seed === undefined) return;
    const controller = new AbortController();
    setStatus({ kind: 'tracing', seed });
    const traced = traceOfDay(
      job,
      seed,
      comparison,
      { version: STUDIO_VERSION, commit: COMMIT },
      WORKER_SOURCE,
      controller.signal,
    );
    let model: ReplayModel | undefined;
    traced.trace
      .then((trace) => {
        model = replayModel(trace);
        setStatus({ kind: 'ready', model, fingerprint: null });
        return traced.fingerprint;
      })
      .then((fingerprint) => {
        if (model !== undefined) setStatus({ kind: 'ready', model, fingerprint });
      })
      .catch((error: unknown) => {
        if (error instanceof RunCancelled) return;
        setStatus({
          kind: 'error',
          message: error instanceof Error ? error.message : String(error),
        });
      });
    return () => {
      controller.abort();
    };
  }, [job, comparison, seed]);

  const dayNet = (s: number | undefined) => {
    if (s === undefined || comparison === undefined) return undefined;
    return doc.perSeed.find((d) => d.seed === s)?.comparisons[comparisonKey(comparison)]?.net;
  };

  return (
    <section id="replay" className="panel" aria-labelledby="h-replay">
      <h2 id="h-replay">
        Replay a day
        <span className="sim-badge aside">Simulated</span>
      </h2>
      {job === null ? (
        <p className="hint">
          A results file can be compared, not replayed: run its scenario in the page to replay a
          day.
        </p>
      ) : comparison === undefined ? (
        <p className="hint">
          Choose at least two policies to replay a day of one against the other.
        </p>
      ) : (
        <>
          <p className="hint">
            One day of the run, minute by minute: the same passengers with both policies. Every call
            shows the reason the engine gave; choose a passenger to follow them.
          </p>
          <div className="replay-pick">
            <div className="field">
              <label htmlFor="replay-comparison">Policies</label>
              <select
                id="replay-comparison"
                value={comparisonKey(comparison)}
                onChange={(event) => {
                  setComparison(comparisons.find((c) => comparisonKey(c) === event.target.value));
                }}
              >
                {comparisons.map((c) => (
                  <option key={comparisonKey(c)} value={comparisonKey(c)}>
                    {policyName(c.candidateId)} against {policyName(c.referenceId)}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <span className="label">Day</span>
              <div className="chips" role="radiogroup" aria-label="Day to replay">
                {(['typical', 'best', 'worst'] as const).map((id) => (
                  <button
                    key={id}
                    id={`day-${id}`}
                    type="button"
                    role="radio"
                    className="chip"
                    aria-checked={choice === id}
                    aria-pressed={choice === id}
                    onClick={() => {
                      setChoice(id);
                    }}
                  >
                    {id === 'typical' ? 'Typical' : id === 'best' ? 'Best' : 'Worst'}
                    {days === null ? '' : `: day ${days[id].seed}, ${signed(days[id].net, 0)}`}
                  </button>
                ))}
                <label className="chip chip-input">
                  Day
                  <input
                    id="day-other"
                    type="number"
                    inputMode="numeric"
                    min={1}
                    value={otherSeed}
                    placeholder="#"
                    onChange={(event) => {
                      setOtherSeed(event.target.value);
                      setChoice('other');
                    }}
                  />
                </label>
              </div>
              <span className="hint">
                Net flights saved on the day, in people. The typical day is the median of the{' '}
                {doc.perSeed.length} days simulated.
                {choice === 'other' && seed === undefined ? ' That day is not in this run.' : ''}
              </span>
            </div>
          </div>
          {status.kind === 'tracing' && (
            <p className="status" id="replay-status" data-state="tracing">
              Simulating day {status.seed} again, event by event…
            </p>
          )}
          {status.kind === 'error' && <p className="error">{status.message}</p>}
          {status.kind === 'ready' && (
            <ReplayView
              key={`${status.model.doc.manifest.seed}-${comparisonKey(comparison)}`}
              model={status.model}
              fingerprint={status.fingerprint}
              net={dayNet(status.model.doc.manifest.seed)}
              canSave={canSave}
            />
          )}
        </>
      )}
    </section>
  );
}

interface ViewProps {
  readonly model: ReplayModel;
  readonly fingerprint: string | null;
  readonly net: number | undefined;
  readonly canSave: boolean;
}

function ReplayView({ model, fingerprint, net, canSave }: ViewProps) {
  const { doc, reference, candidate, summary, span, samples } = model;
  const [atMs, setAtMs] = useState(model.busiestMs);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<number>(SPEEDS[1].minutesPerSecond);
  const [party, setParty] = useState<number | null>(null);
  const [message, setMessage] = useState('');
  const frame = useRef<number | null>(null);

  useEffect(() => {
    if (!playing) return;
    let last = performance.now();
    let shownAt = last;
    let t = atMs;
    const tick = (now: number) => {
      t = Math.min(span.toMs, t + ((now - last) / 1000) * speed * 60_000);
      last = now;
      if (now - shownAt > 50 || t >= span.toMs) {
        shownAt = now;
        setAtMs(t);
      }
      if (t >= span.toMs) {
        setPlaying(false);
        return;
      }
      frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
    return () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    };
    // Restarts only when playing starts or the speed changes, from the moment shown.
  }, [playing, speed]);

  const seek = useCallback((ms: number) => {
    setPlaying(false);
    setAtMs(ms);
  }, []);
  const select = useCallback((p: number) => {
    setParty(p);
  }, []);
  const refSeries = { name: reference.name, slot: 2 as const };
  const candSeries = { name: candidate.name, slot: 1 as const };
  const standingSeries = useMemo(
    () => [
      { ...candSeries, values: samples.standing[1] },
      { ...refSeries, values: samples.standing[0] },
    ],
    [samples],
  );
  const missedSeries = useMemo(
    () => [
      { ...candSeries, values: samples.missed[1] },
      { ...refSeries, values: samples.missed[0] },
    ],
    [samples],
  );
  const lanesSeries = useMemo(
    () =>
      model.lanesDiffer
        ? [
            { ...candSeries, values: samples.lanes[1] },
            { ...refSeries, values: samples.lanes[0] },
          ]
        : [{ name: 'Both policies', slot: 3 as const, values: samples.lanes[0] }],
    [samples, model.lanesDiffer],
  );
  const traceName = `${doc.manifest.scenario.id}.day-${doc.manifest.seed}.trace.json`;
  const events = reference.run.events.length + candidate.run.events.length;
  const hours = useMemo(() => {
    const rows: { hour: number; values: number[] }[] = [];
    samples.times.forEach((t, i) => {
      if (t % 3_600_000 !== 0) return;
      rows.push({
        hour: t,
        values: [
          samples.standing[1][i] ?? 0,
          samples.standing[0][i] ?? 0,
          samples.missed[1][i] ?? 0,
          samples.missed[0][i] ?? 0,
          samples.lanes[1][i] ?? 0,
          samples.lanes[0][i] ?? 0,
        ],
      });
    });
    return rows;
  }, [samples]);

  return (
    <div className="replay" data-seed={doc.manifest.seed}>
      <div className="facts" id="replay-summary">
        <span>
          day <b>{doc.manifest.seed}</b>
          {net === undefined ? '' : `, net ${signed(net, 0)} people`}
        </span>
        <span>
          <b>{thousands(summary.people)}</b> people on <b>{summary.flights}</b> flights
        </span>
        <span>
          missed: <b>{summary.missedReference}</b> with <code>{reference.policy.id}</code>,{' '}
          <b>{summary.missedCandidate}</b> with <code>{candidate.policy.id}</code>
        </span>
        <span>
          saved{' '}
          <b className="better" id="replay-saved">
            {summary.saved}
          </b>
          , lost{' '}
          <b className={summary.harmed > 0 ? 'worse' : ''} id="replay-harmed">
            {summary.harmed}
          </b>
        </span>
        <span>
          <b>{candidate.run.stats.priorityCalls}</b> priority calls ({summary.priorityPeople}{' '}
          people)
        </span>
      </div>

      <div className="player">
        <span className="clock mono" id="replay-clock" aria-live="off">
          {clock(atMs)}
        </span>
        <button
          id="replay-play"
          type="button"
          className="btn btn-primary"
          onClick={() => {
            if (!playing && atMs >= span.toMs) setAtMs(span.fromMs);
            setPlaying((p) => !p);
          }}
        >
          {playing ? 'Pause' : 'Play'}
        </button>
        <select
          aria-label="Speed"
          value={speed}
          onChange={(event) => {
            setSpeed(Number(event.target.value));
          }}
        >
          {SPEEDS.map((s) => (
            <option key={s.minutesPerSecond} value={s.minutesPerSecond}>
              {s.label}
            </option>
          ))}
        </select>
        <input
          id="replay-time"
          type="range"
          aria-label="Time of day"
          min={span.fromMs}
          max={span.toMs}
          step={60_000}
          value={Math.min(span.toMs, Math.max(span.fromMs, atMs))}
          onChange={(event) => {
            seek(Number(event.target.value));
          }}
        />
      </div>

      <div className="ckpts">
        <CheckpointCard
          model={model}
          view={reference}
          slot={2}
          role="reference"
          atMs={atMs}
          onSelect={select}
        />
        <CheckpointCard
          model={model}
          view={candidate}
          slot={1}
          role="candidate"
          atMs={atMs}
          onSelect={select}
        />
      </div>

      <div className="charts">
        <div className="legend" aria-label="Legend">
          <span>
            <i style={{ background: 'var(--series-1)' }} /> {candidate.name}
          </span>
          <span>
            <i style={{ background: 'var(--series-2)' }} /> {reference.name}
          </span>
        </div>
        <TimeChart
          id="chart-standing"
          title="People standing in a queue"
          unit="people"
          times={samples.times}
          series={standingSeries}
          cursorMs={atMs}
          onSeek={seek}
        />
        <TimeChart
          id="chart-missed"
          title="People who missed their flight, as boarding closed"
          unit="people"
          times={samples.times}
          series={missedSeries}
          cursorMs={atMs}
          onSeek={seek}
          step
        />
        <TimeChart
          id="chart-lanes"
          title={model.lanesDiffer ? 'Lanes open' : 'Lanes open, the same with both policies'}
          unit="lanes"
          times={samples.times}
          series={lanesSeries}
          cursorMs={atMs}
          onSeek={seek}
          step
        />
        <details>
          <summary className="hint">Hour by hour</summary>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th scope="col">Time</th>
                  <th scope="col" className="num">
                    Standing, {candidate.policy.id}
                  </th>
                  <th scope="col" className="num">
                    Standing, {reference.policy.id}
                  </th>
                  <th scope="col" className="num">
                    Missed so far, {candidate.policy.id}
                  </th>
                  <th scope="col" className="num">
                    Missed so far, {reference.policy.id}
                  </th>
                  <th scope="col" className="num">
                    Lanes, {candidate.policy.id}
                  </th>
                  <th scope="col" className="num">
                    Lanes, {reference.policy.id}
                  </th>
                </tr>
              </thead>
              <tbody>
                {hours.map((row) => (
                  <tr key={row.hour}>
                    <td>{clock(row.hour)}</td>
                    {row.values.map((v, i) => (
                      <td key={i} className="num">
                        {v}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </div>

      <CallsList model={model} view={candidate} atMs={atMs} onSelect={select} />
      {party !== null && (
        <PassengerDetail
          model={model}
          party={party}
          onClose={() => {
            setParty(null);
          }}
          onSeek={seek}
        />
      )}
      <PassengerLists model={model} selected={party} onSelect={select} />

      <details className="trace-proof">
        <summary className="hint">Check this replay with the CLI</summary>
        <p className="hint">
          The replay is the trace of the day: {thousands(events)} events of the simulator, from
          which every number above is computed. The CLI gives the same fingerprint for the same day
          (save the scenario from the results to run it).
        </p>
        <p
          className="mono"
          id="replay-fingerprint"
          data-ready={fingerprint === null ? 'no' : 'yes'}
        >
          {fingerprint ?? 'fingerprint: computing…'}
        </p>
        <pre className="mono reproduce">{doc.manifest.reproduce}</pre>
        <div className="row">
          <button
            type="button"
            className="btn btn-small"
            onClick={() => {
              void copyText(doc.manifest.reproduce).then((ok) => {
                setMessage(ok ? 'Command copied.' : 'Select the command above to copy it.');
              });
            }}
          >
            Copy the command
          </button>
          {canSave && (
            <button
              id="replay-save"
              type="button"
              className="btn btn-small"
              onClick={() => {
                void saveFile(traceName, stringifyTrace(doc), 'application/json').then(
                  (outcome) => {
                    setMessage(
                      outcome === 'saved'
                        ? ''
                        : outcome === 'declined'
                          ? 'Not saved.'
                          : 'Saving files is not available here.',
                    );
                  },
                );
              }}
            >
              Save the trace (JSON)
            </button>
          )}
        </div>
        {message !== '' && <p className="hint">{message}</p>}
      </details>
    </div>
  );
}
