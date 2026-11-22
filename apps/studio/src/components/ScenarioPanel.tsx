import type { Library, LibraryEntry } from '@gateflow/studio-core';
import { thousands } from '../format';

interface Props {
  readonly library: Library;
  readonly userLibrary: Library;
  readonly userFiles: readonly string[];
  readonly selected: LibraryEntry;
  readonly onSelect: (path: string) => void;
  readonly onAddFiles: (files: FileList) => void;
  readonly onClearFiles: () => void;
}

function groups(library: Library, userLibrary: Library) {
  const byAirport = new Map<string, LibraryEntry[]>();
  for (const entry of library.entries) {
    const label = entry.airport === null ? 'Demo checkpoints' : entry.airport.name;
    byAirport.set(label, [...(byAirport.get(label) ?? []), entry]);
  }
  const list = [...byAirport.entries()].map(([label, entries]) => ({ label, entries }));
  if (userLibrary.entries.length > 0)
    list.push({ label: 'Your files', entries: [...userLibrary.entries] });
  return list;
}

export function ScenarioPanel(props: Props) {
  const { selected } = props;
  const scenario = selected.scenario;
  const planned = Math.max(...scenario.checkpoint.laneSchedule.value.map((e) => e.lanes));
  const staff = scenario.checkpoint.laneStaffing?.value;
  return (
    <section className="panel" aria-labelledby="h-scenario">
      <h2 id="h-scenario">
        <span className="step">1</span> Checkpoint and day
      </h2>
      <div className="field">
        <label htmlFor="scenario">Scenario</label>
        <select
          id="scenario"
          value={selected.path}
          onChange={(event) => {
            props.onSelect(event.target.value);
          }}
        >
          {groups(props.library, props.userLibrary).map((group) => (
            <optgroup key={group.label} label={group.label}>
              {group.entries.map((entry) => (
                <option key={entry.path} value={entry.path}>
                  {entry.scenario.title}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>
      <details>
        <summary className="hint">About this scenario</summary>
        <p className="hint">{scenario.description}</p>
      </details>
      <div className="facts">
        <span>
          <b>{thousands(selected.flights)}</b> departures
        </span>
        <span>
          <b>{planned}</b> lanes planned at most
          {scenario.checkpoint.lanesAvailable === undefined
            ? ''
            : `, ${scenario.checkpoint.lanesAvailable.value} at the checkpoint`}
        </span>
        <span>
          {staff === undefined ? (
            'no staff on call for extra lanes'
          ) : (
            <>
              staff on call for <b>{staff.maxExtraLanes}</b> extra lane
              {staff.maxExtraLanes === 1 ? '' : 's'}
            </>
          )}
        </span>
        <span>
          data <b>{scenario.dataClassification}</b>
        </span>
      </div>
      <details>
        <summary>Use your own files</summary>
        <div className="field">
          <p className="hint">
            Add an airport configuration, its days and their flight lists (YAML, JSON or CSV, as in
            the repository). They stay in this browser: the page has no network access.
          </p>
          <label htmlFor="user-files" className="visually-hidden">
            Files of your airport
          </label>
          <input
            id="user-files"
            type="file"
            multiple
            accept=".yaml,.yml,.json,.csv"
            onChange={(event) => {
              if (event.target.files !== null && event.target.files.length > 0) {
                props.onAddFiles(event.target.files);
              }
              event.target.value = '';
            }}
          />
          {props.userFiles.length > 0 && (
            <div className="row">
              <span className="hint">{props.userFiles.join(', ')}</span>
              <button type="button" className="btn btn-small" onClick={props.onClearFiles}>
                Remove your files
              </button>
            </div>
          )}
          {props.userLibrary.errors.map((error) => (
            <p key={error.path} className="error">
              {error.path.replace(/^user\//, '')}: {error.message}
            </p>
          ))}
        </div>
      </details>
    </section>
  );
}
