import { BACKTEST_SCHEMA } from './backtest';
import {
  chartFigure,
  htmlPage,
  intervalsSvg,
  markdownSections,
  markdownToHtml,
  rangeBarsSvg,
} from './html';
import { DISCLAIMER, RESULTS_SCHEMA } from './results';
import { SWEEP_SCHEMA } from './sweep-results';

/*
 * The pitch figures (after S22, ADR-058): one page of the simulated figures the pitch can say,
 * read from the JSON documents of the published reports. Every number is read at a JSON pointer
 * of its source and keeps it: the page computes nothing a report does not give, it reads, selects
 * and formats. A claim whose words its figures no longer support stops the page, and so does a
 * source that is not a clean commit's simulated report on synthetic data.
 */

export const PITCH_SCHEMA = 'gateflow.pitch.figures/1';

/** A source the page refuses, or a claim its figures no longer support. */
export class PitchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PitchError';
  }
}

/** The scenario library, in the order of the reports. */
const LIBRARY = [
  'vce-like-normal-day',
  'vce-like-peak-day',
  'vce-like-disrupted-day',
  'tsf-like-peak-day',
  'mx-like-transfer-hub',
] as const;
type LibraryId = (typeof LIBRARY)[number];

/** The backtests of S21: the demo checkpoint and the library. */
const FORECASTS = ['single-checkpoint-demo', ...LIBRARY] as const;
const HORIZONS = ['15', '30', '60', '90'] as const;

const TITLES: Readonly<Record<string, string>> = {
  'single-checkpoint-demo': 'Demo checkpoint, congested morning',
  'vce-like-normal-day': 'VCE-like normal day',
  'vce-like-peak-day': 'VCE-like peak day',
  'vce-like-disrupted-day': 'VCE-like disrupted day',
  'tsf-like-peak-day': 'TSF-like peak day',
  'mx-like-transfer-hub': 'MX-like transfer hub',
};

const titleOf = (id: string): string => TITLES[id] ?? id;

const experimentFile = (id: string) => `slice-22/${id}/results.json`;
const backtestFile = (id: string) => `slice-21/${id}/backtest.json`;
const FOLLOWED_AT_THE_HUB = 'slice-22/sweeps/mx-like-hub-console/sweep.json';
const FOLLOWED_AT_THE_BASE = 'slice-22/sweeps/tsf-like-peak-console/sweep.json';
const HARDER_DAY = 'slice-8/sweeps/vce-like-peak-lanes/sweep.json';

/** The files the page reads, relative to the reports' directory (docs/reports), in its order. */
export const PITCH_SOURCES: readonly string[] = [
  ...LIBRARY.map(experimentFile),
  FOLLOWED_AT_THE_HUB,
  FOLLOWED_AT_THE_BASE,
  HARDER_DAY,
  ...FORECASTS.map(backtestFile),
];

// The policies of the page.
/** Today's practice: staff calling the closing flights (A') and a supervisor opening lanes. */
const TODAY = 'fifo-manual@reactive';
/** Today's calls with the lanes of the plan only. */
const CALLS = 'fifo-manual';
/** Today's calls with the console's lane recommendations. */
const CONSOLE = 'fifo-manual@advise';
/** Today's calls with S8's lane recommendations. */
const S8_LANES = 'fifo-manual@predict';
/** GateFlow's priority calls with the lanes of the plan only. */
const PRIORITY = 'priority-v3';
/** GateFlow as a whole: its priority calls and its console's lanes. */
const GATEFLOW = 'priority-v3@advise';
const versus = (candidate: string, reference: string) => `${candidate} vs ${reference}`;

// ---------------------------------------------------------------------------------------------
// The document

/** A number of the page, as read from its source. */
export interface PitchFigure {
  /** What it is, with its unit. */
  readonly label: string;
  readonly value: number;
  /** The 95% confidence interval the report gives with it, if any. */
  readonly lower: number | null;
  readonly upper: number | null;
  /** The file it was read from, relative to the reports' directory. */
  readonly source: string;
  /**
   * Where in that file (RFC 6901): the number itself, or the summary it is the `mean` or the
   * `estimate` of (with `ciLower` and `ciUpper`).
   */
  readonly pointer: string;
  readonly digits: number;
  /** A change, written with its sign. */
  readonly signed: boolean;
  /** A share, written as a percentage. */
  readonly percent: boolean;
}

/** A sentence for the pitch, with its figures and what to say with it. */
export interface PitchClaim {
  readonly id: string;
  readonly title: string;
  /** The sentence (Markdown), its figures written in. */
  readonly text: string;
  /** What to say with it (Markdown). */
  readonly caveat: string;
  readonly figures: readonly PitchFigure[];
  /** The files its figures were read from, or that it speaks of, in the order of the sources. */
  readonly sources: readonly string[];
}

/** A cell of a table: text (Markdown) or a figure, written with its interval. */
export type PitchCell = string | PitchFigure;

export interface PitchTable {
  readonly id: string;
  readonly title: string;
  readonly intro: string;
  readonly columns: readonly { readonly title: string; readonly numeric: boolean }[];
  readonly rows: readonly (readonly PitchCell[])[];
  readonly notes: readonly string[];
}

/** A chart of the HTML page, shown under the heading of `section` (a table's id or `claims`). */
export type PitchChart =
  | {
      readonly kind: 'bars';
      readonly id: string;
      readonly section: string;
      readonly title: string;
      readonly note: string;
      readonly rows: readonly {
        readonly label: string;
        readonly value: PitchFigure;
        readonly low: PitchFigure;
        readonly high: PitchFigure;
        readonly emphasis: boolean;
      }[];
    }
  | {
      readonly kind: 'intervals';
      readonly id: string;
      readonly section: string;
      readonly title: string;
      readonly note: string;
      readonly rows: readonly { readonly label: string; readonly value: PitchFigure }[];
    };

/** A report the page reads. */
export interface PitchSource {
  readonly file: string;
  /** Its report for people (Markdown), beside it. */
  readonly report: string;
  readonly label: string;
  readonly title: string;
  readonly schema: string;
  readonly commit: string;
  readonly generator: string;
  readonly days: number;
  /** The command that produced it, from a clean checkout of its commit. */
  readonly reproduce: string;
}

export interface PitchDocument {
  readonly schema: typeof PITCH_SCHEMA;
  readonly disclaimer: string;
  /** Where the reports are, seen from the page: the base of its links. */
  readonly reports: string;
  readonly sources: readonly PitchSource[];
  readonly claims: readonly PitchClaim[];
  readonly tables: readonly PitchTable[];
  readonly charts: readonly PitchChart[];
  /** What the figures do not say. */
  readonly limits: readonly string[];
}

export interface PitchOptions {
  /** Where the reports are, seen from the page's directory (e.g. `../reports`). */
  readonly reports: string;
}

// ---------------------------------------------------------------------------------------------
// Reading a source

type Segment = string | number;
type SourceKind = 'results' | 'sweep' | 'backtest';

const SCHEMA_OF: Readonly<Record<SourceKind, string>> = {
  results: RESULTS_SCHEMA,
  sweep: SWEEP_SCHEMA,
  backtest: BACKTEST_SCHEMA,
};
const REPORT_OF: Readonly<Record<SourceKind, string>> = {
  results: 'report.md',
  sweep: 'sweep.md',
  backtest: 'backtest.md',
};

/** How a figure is written. */
interface Style {
  readonly digits: number;
  readonly signed?: boolean;
  readonly percent?: boolean;
}

const FLIGHTS: Style = { digits: 1, signed: true };
const FEW_FLIGHTS: Style = { digits: 2, signed: true };
const COUNT: Style = { digits: 1 };
const LANE_HOURS: Style = { digits: 1, signed: true };
const EXTRA_HOURS: Style = { digits: 1 };
const EXTRA_MINUTES: Style = { digits: 2 };
const MINUTES: Style = { digits: 2, signed: true };
const WAIT: Style = { digits: 1 };
const SHARE: Style = { digits: 1, percent: true };
const PERCENT: Style = { digits: 0, percent: true };
const WHOLE: Style = { digits: 0 };

function pointerOf(path: readonly Segment[]): string {
  return path.map((s) => `/${String(s).replace(/~/g, '~0').replace(/\//g, '~1')}`).join('');
}

function child(node: unknown, segment: Segment): unknown {
  if (typeof segment === 'number') {
    return Array.isArray(node) ? (node as readonly unknown[])[segment] : undefined;
  }
  if (typeof node !== 'object' || node === null || Array.isArray(node)) return undefined;
  return Object.hasOwn(node, segment) ? (node as Record<string, unknown>)[segment] : undefined;
}

const finite = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

class Source {
  readonly report: string;

  constructor(
    readonly file: string,
    readonly kind: SourceKind,
    readonly label: string,
    private readonly doc: unknown,
  ) {
    this.report = file.replace(/[^/]+$/, REPORT_OF[kind]);
  }

  at(path: readonly Segment[]): unknown {
    let node = this.doc;
    for (const segment of path) {
      node = child(node, segment);
      if (node === undefined)
        throw new PitchError(`${this.file} has nothing at ${pointerOf(path)}`);
    }
    return node;
  }

  text(path: readonly Segment[]): string {
    const value = this.at(path);
    if (typeof value !== 'string') {
      throw new PitchError(`${this.file} has no text at ${pointerOf(path)}`);
    }
    return value;
  }

  number(path: readonly Segment[]): number {
    const value = this.at(path);
    if (!finite(value)) throw new PitchError(`${this.file} has no number at ${pointerOf(path)}`);
    return value;
  }

  /** The index of the element of the list at `path` whose `key` is `value`. */
  indexWhere(path: readonly Segment[], key: string, value: string | number): number {
    const list = this.at(path);
    const index = Array.isArray(list)
      ? (list as readonly unknown[]).findIndex((item) => child(item, key) === value)
      : -1;
    if (index < 0) {
      throw new PitchError(`${this.file} has no ${key} ${String(value)} in ${pointerOf(path)}`);
    }
    return index;
  }

  /** A figure: the number at `path`, or the mean (or estimate) and interval of a summary there. */
  figure(path: readonly Segment[], label: string, style: Style): PitchFigure {
    const node = this.at(path);
    let value: number;
    let lower: number | null = null;
    let upper: number | null = null;
    if (finite(node)) {
      value = node;
    } else {
      const centre = child(node, 'mean') ?? child(node, 'estimate');
      if (!finite(centre)) throw new PitchError(`${this.file} has no figure at ${pointerOf(path)}`);
      value = centre;
      const lo = child(node, 'ciLower');
      const hi = child(node, 'ciUpper');
      if (finite(lo) && finite(hi)) {
        lower = lo;
        upper = hi;
      }
    }
    return {
      label,
      value,
      lower,
      upper,
      source: this.file,
      pointer: pointerOf(path),
      digits: style.digits,
      signed: style.signed ?? false,
      percent: style.percent ?? false,
    };
  }

  /** A figure of the point of a sweep where the dimension `dimension` takes `value`. */
  point(
    dimension: string,
    value: number,
    path: readonly Segment[],
    label: string,
    style: Style,
  ): PitchFigure {
    return this.figure([...this.pointPath(dimension, value), ...path], label, style);
  }

  pointPath(dimension: string, value: number): Segment[] {
    const d = this.indexWhere(['dimensions'], 'id', dimension);
    const p = this.indexWhere(['dimensions', d, 'points'], 'value', value);
    return ['dimensions', d, 'points', p];
  }

  /** The values the dimension `dimension` of a sweep takes, in its order. */
  pointValues(dimension: string): number[] {
    const d = this.indexWhere(['dimensions'], 'id', dimension);
    const points = this.at(['dimensions', d, 'points']);
    const values = Array.isArray(points)
      ? (points as readonly unknown[]).map((point) => child(point, 'value'))
      : [];
    if (values.length === 0 || !values.every(finite)) {
      throw new PitchError(`${this.file} has no points of ${dimension}`);
    }
    return values;
  }

  /** The title of the scenario the source is about. */
  get scenarioTitle(): string {
    return titleOf(this.text(['manifest', 'scenario', 'id']));
  }
}

/** Refuses a source unless it is a clean commit's simulated report on synthetic data. */
function checkSource(source: Source, scenario: string | undefined): void {
  const { file, kind } = source;
  const schema = source.at(['schema']);
  if (schema !== SCHEMA_OF[kind]) {
    throw new PitchError(
      `${file} is not a ${SCHEMA_OF[kind]} document (${JSON.stringify(schema)})`,
    );
  }
  if (source.at(['disclaimer']) !== DISCLAIMER) {
    throw new PitchError(`${file} does not carry the SIMULATED disclaimer`);
  }
  const commit = source.text(['manifest', 'commit']);
  if (!/^[0-9a-f]{40}$/.test(commit)) {
    throw new PitchError(
      `${file} was not produced from a clean commit (${commit}): publish it from a clean checkout`,
    );
  }
  const data = source.text(['manifest', 'scenario', 'dataClassification']);
  if (data !== 'SYNTHETIC') throw new PitchError(`${file} is not on synthetic data (${data})`);
  if (scenario !== undefined && source.text(['manifest', 'scenario', 'id']) !== scenario) {
    throw new PitchError(`${file} is not a report of ${scenario}`);
  }
}

function sourceOf(source: Source): PitchSource {
  const generator = `${source.text(['manifest', 'generator', 'name'])} ${source.text(['manifest', 'generator', 'version'])}`;
  const scenario = source.text(['manifest', 'scenario', 'id']);
  const seeds = source.text(['manifest', 'seeds', 'ranges']);
  let reproduce: string;
  if (source.kind === 'backtest') {
    const policy = source.text(['manifest', 'policy', 'id']);
    reproduce = `gateflow-sim backtest --scenario scenarios/${scenario}.yaml --seeds ${seeds}${policy === 'priority-v3' ? '' : ` --policy ${policy}`}`;
  } else {
    reproduce = source.text(['manifest', 'reproduce']);
  }
  return {
    file: source.file,
    report: source.report,
    label: source.label,
    title:
      source.kind === 'sweep'
        ? source.text(['manifest', 'sweep', 'title'])
        : source.text(['manifest', 'scenario', 'title']),
    schema: source.text(['schema']),
    commit: source.text(['manifest', 'commit']),
    generator,
    days: source.number(['manifest', 'seeds', 'count']),
    reproduce,
  };
}

// ---------------------------------------------------------------------------------------------
// Writing figures

function fixed(value: number, digits: number): string {
  const text = value.toFixed(digits);
  return /^-0(\.0*)?$/.test(text) ? text.slice(1) : text;
}

function groupThousands(text: string): string {
  const [whole = '', fraction] = text.split('.');
  const sign = whole.startsWith('-') ? '-' : '';
  const grouped = whole.slice(sign.length).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${sign}${grouped}${fraction === undefined ? '' : `.${fraction}`}`;
}

/**
 * A number as the reports write it: a value rounded to zero is "0.0", a bound of an interval keeps
 * its sign ("-0.0": just below zero), and a change carries its sign.
 */
function written(figure: PitchFigure, value: number, signed: boolean, bound: boolean): string {
  const scaled = figure.percent ? value * 100 : value;
  let text = groupThousands(bound ? scaled.toFixed(figure.digits) : fixed(scaled, figure.digits));
  if (signed && !text.startsWith('-') && /[1-9]/.test(text)) text = `+${text}`;
  return figure.percent ? `${text}%` : text;
}

/** The figure's value, with its sign when it is a change: "+18.0". */
export function figureValue(figure: PitchFigure): string {
  return written(figure, figure.value, figure.signed, false);
}

/** Its interval, when the report gives one: "[16.1, 19.9]". */
export function figureInterval(figure: PitchFigure): string {
  if (figure.lower === null || figure.upper === null) return '';
  return `[${written(figure, figure.lower, false, true)}, ${written(figure, figure.upper, false, true)}]`;
}

/** The value and its interval: "+18.0 [16.1, 19.9]". */
export function figureText(figure: PitchFigure): string {
  const interval = figureInterval(figure);
  return interval === '' ? figureValue(figure) : `${figureValue(figure)} ${interval}`;
}

/** The value in bold, then its interval. */
function strong(figure: PitchFigure): string {
  const interval = figureInterval(figure);
  return `**${figureValue(figure)}**${interval === '' ? '' : ` ${interval}`}`;
}

const value = figureValue;
const text = figureText;

const aboveZero = (f: PitchFigure) => f.lower !== null && f.lower > 0;
const belowZero = (f: PitchFigure) => f.upper !== null && f.upper < 0;
const acrossZero = (f: PitchFigure) =>
  f.lower !== null && f.upper !== null && f.lower <= 0 && f.upper >= 0;

/** The figure of a list with the lowest value, and the one with the highest. */
function extremes(figures: readonly PitchFigure[]): [PitchFigure, PitchFigure] {
  const [first] = figures;
  if (first === undefined) throw new PitchError('no figure to choose from');
  let low = first;
  let high = first;
  for (const f of figures) {
    if (f.value < low.value) low = f;
    if (f.value > high.value) high = f;
  }
  return [low, high];
}

function holds(condition: boolean, claim: string, why: string): void {
  if (!condition) {
    throw new PitchError(`the claim "${claim}" no longer holds: ${why}; rewrite it`);
  }
}

// ---------------------------------------------------------------------------------------------
// The page

/**
 * The pitch figures, from the published reports: `read` gives the parsed JSON of a file of
 * `PITCH_SOURCES` (relative to the reports' directory). Deterministic.
 */
export function buildPitch(read: (file: string) => unknown, options: PitchOptions): PitchDocument {
  const loaded: Source[] = [];
  const load = (file: string, kind: SourceKind, label: string, scenario?: string): Source => {
    const source = new Source(file, kind, label, read(file));
    checkSource(source, scenario);
    loaded.push(source);
    return source;
  };
  const experiments = LIBRARY.map((id) =>
    load(experimentFile(id), 'results', `${titleOf(id)} (S22.3)`, id),
  );
  const atTheHub = load(
    FOLLOWED_AT_THE_HUB,
    'sweep',
    'Recommendations followed or not, MX-like hub (S22.3)',
    'mx-like-transfer-hub',
  );
  const atTheBase = load(
    FOLLOWED_AT_THE_BASE,
    'sweep',
    'Recommendations followed or not, TSF-like base (S22.3)',
    'tsf-like-peak-day',
  );
  const harder = load(
    HARDER_DAY,
    'sweep',
    'A VCE-like peak day harder than planned (S8)',
    'vce-like-peak-day',
  );
  const backtests = FORECASTS.map((id) =>
    load(backtestFile(id), 'backtest', `Forecasts, ${titleOf(id)} (S21)`, id),
  );

  const experiment = (id: LibraryId): Source => experiments[LIBRARY.indexOf(id)] as Source;
  const backtest = (id: string): Source =>
    backtests[(FORECASTS as readonly string[]).indexOf(id)] as Source;
  const compared = (
    id: LibraryId,
    candidate: string,
    reference: string,
    metric: string,
    label: string,
    style: Style,
  ) =>
    experiment(id).figure(
      ['summary', 'comparisons', versus(candidate, reference), 'metrics', metric],
      label,
      style,
    );
  const policy = (id: LibraryId, policyId: string, metric: string, label: string, style: Style) =>
    experiment(id).figure(['summary', 'policies', policyId, metric], label, style);
  const perLaneHour = (
    id: LibraryId,
    candidate: string,
    reference: string,
    what: 'netMadeFlight' | 'waitSavedPersonHours',
    label: string,
    style: Style,
  ) =>
    experiment(id).figure(
      ['summary', 'comparisons', versus(candidate, reference), 'perExtraLaneHour', what],
      label,
      style,
    );
  const assumed = (
    id: LibraryId,
    path: string,
    keys: readonly Segment[],
    label: string,
    style: Style,
  ) => {
    const source = experiment(id);
    const index = source.indexWhere(['assumptions'], 'path', path);
    return source.figure(['assumptions', index, 'value', ...keys], label, style);
  };

  const hub: LibraryId = 'mx-like-transfer-hub';
  const base: LibraryId = 'tsf-like-peak-day';
  const vce = ['vce-like-normal-day', 'vce-like-peak-day', 'vce-like-disrupted-day'] as const;
  const claims: Omit<PitchClaim, 'sources'>[] = [];

  // 1. GateFlow as a whole at the hub.
  const hubNet = compared(
    hub,
    GATEFLOW,
    TODAY,
    'net',
    "Net flights saved per day, GateFlow against today's practice",
    FLIGHTS,
  );
  {
    const title = 'At a transfer hub, GateFlow saves flights';
    const hours = compared(
      hub,
      GATEFLOW,
      TODAY,
      'extraLaneHoursDelta',
      'Extra lane-hours per day',
      EXTRA_HOURS,
    );
    holds(hours.value > 0, title, 'it no longer opens extra lane-hours');
    const saved = compared(
      hub,
      GATEFLOW,
      TODAY,
      'saved',
      'Passengers per day who make a flight they would have missed',
      COUNT,
    );
    const harmed = compared(
      hub,
      GATEFLOW,
      TODAY,
      'harmed',
      'Passengers per day who miss a flight they would have made',
      COUNT,
    );
    const people = experiment(hub).figure(['summary', 'peoplePerDay'], 'People per day', WHOLE);
    const lanes = assumed(hub, 'checkpoint.lanesAvailable', [], 'Lanes of the checkpoint', WHOLE);
    const roster = assumed(
      hub,
      'checkpoint.lanePlanRule',
      ['maxLanes'],
      'Most lanes the roster plans',
      WHOLE,
    );
    const onCall = assumed(
      hub,
      'checkpoint.laneStaffing',
      ['maxExtraLanes'],
      'Extra lanes the staff on call can open',
      WHOLE,
    );
    const delay = assumed(
      hub,
      'checkpoint.laneStaffing',
      ['openDelayMinutes', 'median'],
      'Minutes to open a lane (median)',
      WHOLE,
    );
    const follow = assumed(
      hub,
      'checkpoint.laneStaffing',
      ['followShare'],
      'Share of the recommendations the duty manager follows',
      PERCENT,
    );
    holds(aboveZero(hubNet), title, 'the interval of the net flights saved is not above zero');
    claims.push({
      id: 'hub-gateflow',
      title,
      text: `At the MX-like transfer hub, GateFlow as a whole (its priority calls and its console's lane recommendations) saves ${strong(hubNet)} flights a day against today's practice (staff calling the closing flights, a supervisor opening lanes when the queue is long), for ${text(hours)} extra lane-hours a day: ${value(saved)} passengers a day make a flight they would have missed, ${value(harmed)} miss one they would have made.`,
      caveat: `A synthetic transfer checkpoint: ${value(people)} passengers a day, ${value(lanes)} lanes of which the roster plans at most ${value(roster)}, staff on call for ${value(onCall)} more. Today's supervisor is idealised (it sees the exact wait every 5 minutes and never forgets), so GateFlow's margin is probably understated. The staff on call, about ${value(delay)} minutes to open a lane and a duty manager following ${value(follow)} of the recommendations are assumptions.`,
      figures: [hubNet, hours, saved, harmed, people, lanes, roster, onCall, delay, follow],
    });
  }

  // 2. Most of it is the console's lanes.
  const hubLanes = compared(
    hub,
    CONSOLE,
    TODAY,
    'net',
    "Net flights saved per day, the console's lanes against today's supervisor (today's calls)",
    FLIGHTS,
  );
  const hubPriorityOnLanes = compared(
    hub,
    GATEFLOW,
    CONSOLE,
    'net',
    "Net flights saved per day by the priority calls once the console's lanes are open",
    FLIGHTS,
  );
  {
    const title = "Most of it is the console's lane recommendations";
    const hours = compared(
      hub,
      CONSOLE,
      TODAY,
      'extraLaneHoursDelta',
      'Extra lane-hours per day',
      EXTRA_HOURS,
    );
    holds(hours.value > 0, title, 'it no longer opens extra lane-hours');
    const opened = policy(hub, CONSOLE, 'lanesOpened', 'Lanes the console opens per day', COUNT);
    const extra = policy(
      hub,
      CONSOLE,
      'extraLaneHours',
      'Extra lane-hours per day of the console',
      COUNT,
    );
    const perHour = perLaneHour(
      hub,
      CONSOLE,
      CALLS,
      'netMadeFlight',
      "Net flights saved per extra lane-hour of the console's (against the plan only)",
      COUNT,
    );
    const perHourSupervisor = perLaneHour(
      hub,
      TODAY,
      CALLS,
      'netMadeFlight',
      "Net flights saved per extra lane-hour of the supervisor's (against the plan only)",
      COUNT,
    );
    holds(
      aboveZero(hubLanes),
      title,
      "the interval of the console's net flights saved is not above zero",
    );
    holds(
      hubLanes.value >= hubNet.value / 2,
      title,
      'the console gives less than half of GateFlow',
    );
    holds(
      perHour.value < perHourSupervisor.value,
      title,
      "a lane-hour of the console's no longer buys less than one of the supervisor's",
    );
    claims.push({
      id: 'hub-lanes',
      title,
      text: `The console's lane recommendations alone, with today's calls, save ${strong(hubLanes)} flights a day at the hub against today's supervisor, for ${text(hours)} extra lane-hours; once those lanes are open, GateFlow's priority calls add ${text(hubPriorityOnLanes)}.`,
      caveat: `The console opens ${value(opened)} lanes a day there, for ${value(extra)} extra lane-hours: one extra lane-hour of it saves ${text(perHour)} flights against the plan only, less than one of the supervisor's (${text(perHourSupervisor)}), who opens few lanes and only once the queue is long, but in all it saves more. The extra lanes are the airport's staff on call: GateFlow says when to open them.`,
      figures: [hubLanes, hours, hubPriorityOnLanes, opened, extra, perHour, perHourSupervisor],
    });
  }

  // 3. Followed or not.
  const followedNet = (share: number) =>
    atTheHub.point(
      'follow',
      share,
      ['comparisons', versus(CONSOLE, TODAY), 'metrics', 'net'],
      `Net flights saved per day against today's supervisor, ${String(Math.round(share * 100))}% of the recommendations followed`,
      FLIGHTS,
    );
  const halfFollowed = followedNet(0.5);
  {
    const title = 'Followed one time in two, the recommendations still pay';
    const all = followedNet(1);
    const none = followedNet(0);
    const waitAt = (share: number) =>
      atTheBase.point(
        'follow',
        share,
        ['comparisons', versus(CONSOLE, CALLS), 'metrics', 'waitMeanDeltaMin'],
        `Change in mean wait against the plan only (min), ${String(Math.round(share * 100))}% followed`,
        MINUTES,
      );
    const baseHalf = waitAt(0.5);
    const baseAll = waitAt(1);
    holds(
      aboveZero(halfFollowed),
      title,
      'with one in two followed the interval is not above zero',
    );
    holds(
      belowZero(none),
      title,
      'with none followed the plan alone no longer does worse than the supervisor',
    );
    holds(
      belowZero(baseHalf) && belowZero(baseAll),
      title,
      'at the TSF-like base the wait no longer falls',
    );
    claims.push({
      id: 'hub-followed',
      title,
      text: `If the duty manager follows one recommendation in two, the console's lanes still save ${strong(halfFollowed)} flights a day more than today's supervisor at the hub (${text(all)} when all are followed). If none is followed nothing opens beyond the plan: ${text(none)} flights a day against the supervisor.`,
      caveat: `Whether a recommendation is followed is drawn day by day; one not followed comes back 15 minutes later if it is still needed. At the TSF-like base, one in two followed already changes the mean wait by ${text(baseHalf)} minutes against the plan only, all of them by ${text(baseAll)}.`,
      figures: [halfFollowed, all, none, baseHalf, baseAll],
    });
  }

  // 4. The priority calls where lanes are short.
  const hubPriority = compared(
    hub,
    PRIORITY,
    CALLS,
    'net',
    "Net flights saved per day, GateFlow's calls against today's (the plan's lanes)",
    FLIGHTS,
  );
  const hubPriorityWait = compared(
    hub,
    PRIORITY,
    CALLS,
    'nonPriorityExtraWaitMeanMin',
    'Mean extra wait of the passengers not prioritised (min)',
    EXTRA_MINUTES,
  );
  const basePriority = compared(
    base,
    PRIORITY,
    CALLS,
    'net',
    "Net flights saved per day at the TSF-like base, GateFlow's calls against today's (the plan's lanes)",
    FLIGHTS,
  );
  {
    const title = 'Where lanes are short, the priority calls save flights';
    const saved = compared(
      hub,
      PRIORITY,
      CALLS,
      'saved',
      'Passengers per day who make a flight they would have missed',
      COUNT,
    );
    const harmed = compared(
      hub,
      PRIORITY,
      CALLS,
      'harmed',
      'Passengers per day who miss a flight they would have made',
      COUNT,
    );
    const delayed = compared(
      hub,
      PRIORITY,
      CALLS,
      'nonPriorityDelayedOver5MinShare',
      'Share of the passengers not prioritised who wait more than 5 minutes longer',
      SHARE,
    );
    holds(aboveZero(hubPriority), title, 'the interval of the net flights saved is not above zero');
    holds(hubPriorityWait.value > 0, title, 'the passengers not prioritised no longer wait longer');
    holds(
      belowZero(basePriority),
      title,
      'the priority calls no longer lose flights at the TSF-like base',
    );
    claims.push({
      id: 'hub-priority',
      title,
      text: `With the lanes of the plan only, GateFlow's priority calls save ${strong(hubPriority)} flights a day at the hub against today's staff calls, with no extra lane: ${value(saved)} passengers a day make a flight they would have missed, ${value(harmed)} miss one they would have made.`,
      caveat: `The passengers not prioritised wait ${text(hubPriorityWait)} minutes longer on average, and ${value(delayed)} of them more than 5 minutes longer. Once the console's lanes are open the priority calls add little. At the TSF-like base, where staff calling the closing flights catch everyone, the priority calls alone lose flights: ${text(basePriority)} a day.`,
      figures: [hubPriority, saved, harmed, hubPriorityWait, delayed, basePriority],
    });
  }

  // 5. The wait at the low-cost base.
  const baseWait = compared(
    base,
    CONSOLE,
    TODAY,
    'waitMeanDeltaMin',
    "Change in mean wait (min), the console's lanes against today's supervisor",
    MINUTES,
  );
  {
    const title = 'At a low-cost base, the console halves the wait';
    const before = policy(
      base,
      TODAY,
      'waitMeanMin',
      "Mean wait with today's supervisor (min)",
      WAIT,
    );
    const after = policy(
      base,
      CONSOLE,
      'waitMeanMin',
      "Mean wait with the console's lanes (min)",
      WAIT,
    );
    const beforeP90 = policy(
      base,
      TODAY,
      'waitP90Min',
      "90th percentile of the wait with today's supervisor (min)",
      WAIT,
    );
    const afterP90 = policy(
      base,
      CONSOLE,
      'waitP90Min',
      "90th percentile of the wait with the console's lanes (min)",
      WAIT,
    );
    const hours = compared(
      base,
      CONSOLE,
      TODAY,
      'extraLaneHoursDelta',
      'Extra lane-hours per day',
      EXTRA_HOURS,
    );
    holds(hours.value > 0, title, 'it no longer opens extra lane-hours');
    const missed = policy(
      base,
      TODAY,
      'missed',
      "Missed flights per day with today's practice",
      COUNT,
    );
    const perHour = perLaneHour(
      base,
      CONSOLE,
      CALLS,
      'waitSavedPersonHours',
      "Hours of waiting saved per extra lane-hour of the console's (against the plan only)",
      WHOLE,
    );
    const ratio = after.value / before.value;
    holds(
      ratio >= 0.4 && ratio <= 0.6,
      title,
      `the mean wait is ${fixed(ratio, 2)} of the supervisor's, not about half`,
    );
    holds(belowZero(baseWait), title, 'the interval of the change in mean wait is not below zero');
    holds(missed.value < 0.05, title, "flights are missed with today's practice");
    claims.push({
      id: 'base-wait',
      title,
      text: `At the TSF-like base (one morning bank of based aircraft), the console's lanes halve the mean wait against today's supervisor, from ${value(before)} to ${strong(after)} minutes (${text(baseWait)} minutes a person), and its 90th percentile from ${value(beforeP90)} to ${value(afterP90)} minutes, for ${text(hours)} extra lane-hours a day.`,
      caveat: `Nobody misses a flight there with today's practice either (${value(missed)} a day): the gain is the wait. One extra lane-hour of the console's saves ${text(perHour)} hours of passengers' waiting against the plan only.`,
      figures: [before, after, baseWait, beforeP90, afterP90, hours, missed, perHour],
    });
  }

  // 6. No flight to save at the low-cost base.
  {
    const title = 'Where staff calls already catch everyone, there is no flight to save';
    const net = compared(
      base,
      GATEFLOW,
      TODAY,
      'net',
      "Net flights saved per day, GateFlow against today's practice",
      FEW_FLIGHTS,
    );
    const wait = compared(
      base,
      GATEFLOW,
      TODAY,
      'waitMeanDeltaMin',
      "Change in mean wait (min), GateFlow against today's practice",
      MINUTES,
    );
    const plainQueue = policy(
      base,
      'fifo',
      'missed',
      'Missed flights per day with a plain queue, nobody called (A)',
      COUNT,
    );
    const calls = policy(
      base,
      CALLS,
      'missed',
      "Missed flights per day with today's staff calls (A')",
      COUNT,
    );
    holds(
      Math.abs(net.value) < 0.5,
      title,
      'GateFlow changes the missed flights by half a flight a day or more',
    );
    holds(belowZero(net), title, 'GateFlow no longer loses a few flights there');
    holds(belowZero(wait), title, 'the interval of the change in mean wait is not below zero');
    claims.push({
      id: 'base-gateflow',
      title,
      text: `At the TSF-like base GateFlow as a whole gives ${text(net)} flights a day against today's practice: there is no flight to save, and its priority calls lose a few. Its gain there is the wait: ${text(wait)} minutes a person.`,
      caveat: `Today's practice is strong there: staff calling the closing flights miss ${value(calls)} a day, a plain queue with nobody called would miss ${value(plainQueue)}. Sell GateFlow there on the wait, not on flights.`,
      figures: [net, wait, calls, plainQueue],
    });
  }

  // 7. The VCE-like days.
  {
    const title = 'Where the roster follows demand, the console stays quiet';
    const recommendations = vce.map((id) =>
      policy(id, CONSOLE, 'laneDecisions', `Recommendations per day, ${titleOf(id)}`, COUNT),
    );
    const nets = vce.map((id) =>
      compared(
        id,
        CONSOLE,
        TODAY,
        'net',
        `Net flights saved per day, the console's lanes against today's supervisor, ${titleOf(id)}`,
        FLIGHTS,
      ),
    );
    const priorities = vce.map((id) =>
      compared(
        id,
        PRIORITY,
        CALLS,
        'net',
        `Net flights saved per day, GateFlow's calls against today's, ${titleOf(id)}`,
        FLIGHTS,
      ),
    );
    holds(
      nets.every((n) => Math.abs(n.value) < 0.5),
      title,
      'the missed flights change by half a flight a day or more',
    );
    holds(
      priorities.every(acrossZero),
      title,
      "an interval of the priority calls' flights no longer spans zero",
    );
    const [r1, r2, r3] = recommendations as [PitchFigure, PitchFigure, PitchFigure];
    const [n1, n2, n3] = nets as [PitchFigure, PitchFigure, PitchFigure];
    const [p1, p2, p3] = priorities as [PitchFigure, PitchFigure, PitchFigure];
    claims.push({
      id: 'vce-quiet',
      title,
      text: `At a VCE-like departures checkpoint, whose roster follows the day's demand, the console makes ${value(r1)}, ${value(r2)} and ${value(r3)} recommendations a day (a normal, a peak and a disrupted day), and the missed flights hardly change against today's supervisor: ${text(n1)}, ${text(n2)} and ${text(n3)} a day.`,
      caveat: `That is what it should do there: no lane the queue does not need. GateFlow's priority calls do not change the missed flights measurably there either (${text(p1)}, ${text(p2)} and ${text(p3)} a day, every interval across zero): these simulated days show no gain in flights at such a checkpoint.`,
      figures: [...recommendations, ...nets, ...priorities],
    });
  }

  // 8. A day harder than planned (S8's rule).
  const harderPoint = (
    dimension: string,
    at: number,
    path: readonly Segment[],
    label: string,
    style: Style,
  ) => harder.point(dimension, at, path, label, style);
  const harderMissed = (dimension: string, at: number, policyId: string, label: string) =>
    harderPoint(dimension, at, ['policies', policyId, 'missed'], label, COUNT);
  const harderNet = (dimension: string, at: number, label: string) =>
    harderPoint(
      dimension,
      at,
      ['comparisons', versus(S8_LANES, TODAY), 'metrics', 'net'],
      label,
      FLIGHTS,
    );
  const hubVsS8 = compared(
    hub,
    CONSOLE,
    S8_LANES,
    'net',
    "Net flights saved per day at the hub, the console's lanes against S8's",
    FLIGHTS,
  );
  {
    const title = 'On a day harder than planned, extra lanes are the safety valve';
    const planned = harder.figure(
      [...harder.pointPath('screening-time', 24), 'value'],
      'Seconds of screening per person the roster assumes',
      WHOLE,
    );
    holds(
      harder.at([...harder.pointPath('screening-time', 24), 'isBase']) === true,
      title,
      'the day as planned is no longer 24 s a person',
    );
    const slow = harder.figure(
      [...harder.pointPath('screening-time', 26), 'value'],
      'Seconds of screening per person on the harder day',
      WHOLE,
    );
    const plan = harderMissed(
      'screening-time',
      26,
      CALLS,
      'Missed flights per day at 26 s, the plan only',
    );
    const supervisor = harderMissed(
      'screening-time',
      26,
      TODAY,
      "Missed flights per day at 26 s, today's supervisor",
    );
    const lanes = harderMissed(
      'screening-time',
      26,
      S8_LANES,
      "Missed flights per day at 26 s, GateFlow's lanes (S8)",
    );
    const net = harderNet(
      'screening-time',
      26,
      "Net flights saved per day at 26 s, GateFlow's lanes (S8) against the supervisor",
    );
    const planShort = harderMissed(
      'roster',
      -1,
      CALLS,
      'Missed flights per day, a roster one lane short, the plan only',
    );
    const supervisorShort = harderMissed(
      'roster',
      -1,
      TODAY,
      "Missed flights per day, a roster one lane short, today's supervisor",
    );
    const lanesShort = harderMissed(
      'roster',
      -1,
      S8_LANES,
      "Missed flights per day, a roster one lane short, GateFlow's lanes (S8)",
    );
    const netShort = harderNet(
      'roster',
      -1,
      "Net flights saved per day, a roster one lane short, GateFlow's lanes (S8) against the supervisor",
    );
    const noStaff = harderMissed(
      'staff',
      0,
      S8_LANES,
      "Missed flights per day at 26 s with no staff on call, GateFlow's lanes (S8)",
    );
    holds(
      supervisor.value < plan.value && lanes.value < supervisor.value,
      title,
      "the plan, the supervisor and GateFlow's lanes are no longer in that order",
    );
    holds(
      aboveZero(net) && aboveZero(netShort),
      title,
      "the interval of GateFlow's lanes against the supervisor is not above zero",
    );
    claims.push({
      id: 'harder-day',
      title,
      text: `On the VCE-like peak day with screening at ${value(slow)} s a person instead of the ${value(planned)} its roster assumed, the plan alone misses ${value(plan)} flights a day, today's supervisor ${value(supervisor)} and GateFlow's lanes ${strong(lanes)} (${text(net)} against the supervisor); with a roster one lane short, ${value(planShort)}, ${value(supervisorShort)} and ${value(lanesShort)} (${text(netShort)}).`,
      caveat: `Measured in S8 with S8's rule (\`@predict\`): the console's rule was not swept on such days. On the library's days the console's rule gives ${text(hubVsS8)} flights a day against S8's at the hub. Without staff on call nothing opens: ${value(noStaff)} flights a day are missed on the slower day.`,
      figures: [
        slow,
        planned,
        plan,
        supervisor,
        lanes,
        net,
        planShort,
        supervisorShort,
        lanesShort,
        netShort,
        hubVsS8,
        noStaff,
      ],
    });
  }

  // 9. The forecasts of arrivals.
  const library = LIBRARY.map((id) => backtest(id));
  const each = (
    sources: readonly Source[],
    path: (h: string) => readonly Segment[],
    label: (scenario: string, h: string) => string,
    style: Style,
  ) =>
    sources.flatMap((s) =>
      HORIZONS.map((h) => s.figure(path(h), label(s.scenarioTitle, h), style)),
    );
  {
    const title = 'The forecasts behind the recommendations hold their bands';
    const wapes = each(
      library,
      (h) => ['summary', 'arrivals', h, 'all', 'wape'],
      (s, h) => `Error of the arrivals (WAPE), ${s}, ${h} minutes ahead`,
      PERCENT,
    );
    const coverages = each(
      library,
      (h) => ['summary', 'arrivals', h, 'all', 'coverage'],
      (s, h) => `Share of the arrivals in the 80% band, ${s}, ${h} minutes ahead`,
      PERCENT,
    );
    const counts = each(
      library,
      (h) => ['summary', 'arrivals', h, 'all', 'n'],
      (s, h) => `Forecasts measured, ${s}, ${h} minutes ahead`,
      WHOLE,
    );
    const [lowWape, highWape] = extremes(wapes);
    const [lowCover, highCover] = extremes(coverages);
    const [fewest, most] = extremes(counts);
    const days = backtest(hub).figure(
      ['manifest', 'seeds', 'count'],
      'Simulated days per scenario',
      WHOLE,
    );
    const learnt = backtest(hub).figure(
      ['manifest', 'profile', 'days'],
      'Other simulated days the forecasts learn from',
      WHOLE,
    );
    holds(
      lowCover.value >= 0.75 && highCover.value <= 0.85,
      title,
      'a band no longer holds about 80% of the arrivals',
    );
    holds(
      library.every(
        (s) =>
          s.number(['manifest', 'seeds', 'count']) === days.value &&
          s.number(['manifest', 'profile', 'days']) === learnt.value,
      ),
      title,
      'the backtests no longer have the same days',
    );
    claims.push({
      id: 'forecast-arrivals',
      title,
      text: `GateFlow forecasts the people arriving in each 5 minutes, 15 to 90 minutes ahead, within ${value(lowWape)} to ${value(highWape)} of them (WAPE) at the five checkpoints of the library, and its 80% bands hold ${value(lowCover)} to ${value(highCover)} of what then happened.`,
      caveat: `Measured on ${value(fewest)} to ${value(most)} forecasts per checkpoint and horizon over ${value(days)} simulated days, against the full simulator. The forecasts learn from ${value(learnt)} other simulated days of the same model, so they are better than a real forecast would be at first; they know the day's flights, not their loads or disruptions.`,
      figures: [lowWape, highWape, lowCover, highCover, fewest, most, days, learnt],
    });
  }

  // 10. The forecasts of the wait.
  {
    const title = 'When a queue builds, the forecast of the wait is within minutes';
    const errors = each(
      library,
      (h) => ['summary', 'wait', h, 'busy', 'mae'],
      (s, h) => `Mean error of the wait's median (min), with a queue, ${s}, ${h} minutes ahead`,
      WAIT,
    );
    const coverages = each(
      library,
      (h) => ['summary', 'wait', h, 'busy', 'coverage'],
      (s, h) => `Share of the waits in the band, with a queue, ${s}, ${h} minutes ahead`,
      PERCENT,
    );
    const before = each(
      library,
      (h) => ['uncalibrated', 'wait', h, 'busy', 'coverage'],
      (s, h) => `Share of the waits in the band before the calibration, ${s}, ${h} minutes ahead`,
      PERCENT,
    );
    const [lowError, highError] = extremes(errors);
    const [lowCover, highCover] = extremes(coverages);
    const [lowBefore] = extremes(before);
    const queueBias = backtest('vce-like-peak-day').figure(
      ['summary', 'backlog', '90', 'busy', 'bias'],
      "Bias of the queue's median 90 minutes ahead, VCE-like peak day (people)",
      WHOLE,
    );
    holds(lowCover.value >= 0.75, title, 'a band of the wait holds less than 75% of the waits');
    holds(
      lowBefore.value < lowCover.value,
      title,
      'the calibration no longer widens the narrowest band',
    );
    holds(
      queueBias.value > 0,
      title,
      "the queue's median is no longer high on the VCE-like peak day",
    );
    claims.push({
      id: 'forecast-wait',
      title,
      text: `When there is a queue, GateFlow's forecast of the wait of a party arriving is off by ${value(lowError)} to ${value(highError)} minutes on average (the median's error), and its bands hold ${value(lowCover)} to ${value(highCover)} of the waits.`,
      caveat: `Before the calibration of S21.3 those bands held as little as ${value(lowBefore)} of the waits. Most of the day nobody waits: those forecasts are left out. The forecast of the queue itself runs high on the VCE-like days, by ${value(queueBias)} people 90 minutes ahead on the peak day.`,
      figures: [lowError, highError, lowCover, highCover, lowBefore, queueBias],
    });
  }

  // 11. Fairness at the hub.
  {
    const title = 'The passengers not prioritised do not pay for it';
    const wait = compared(
      hub,
      GATEFLOW,
      TODAY,
      'nonPriorityExtraWaitMeanMin',
      "Mean extra wait of the passengers not prioritised (min), GateFlow against today's practice",
      MINUTES,
    );
    const delayed = compared(
      hub,
      GATEFLOW,
      TODAY,
      'nonPriorityDelayedOver5MinShare',
      'Share of the passengers not prioritised who wait more than 5 minutes longer',
      SHARE,
    );
    const policyIndex = experiment(hub).indexWhere(['manifest', 'policies'], 'id', GATEFLOW);
    const bound = experiment(hub).figure(
      ['manifest', 'policies', policyIndex, 'selection', 'maxOvertakes'],
      "People who may pass one ticket, GateFlow's bound",
      WHOLE,
    );
    const passedGateflow = experiment(hub).figure(
      ['summary', 'policies', GATEFLOW, 'maxOvertakes', 'max'],
      'Most people who passed one ticket on a day, GateFlow, the worst of the days',
      WHOLE,
    );
    const passedToday = experiment(hub).figure(
      ['summary', 'policies', TODAY, 'maxOvertakes', 'max'],
      "Most people who passed one ticket on a day, today's practice, the worst of the days",
      WHOLE,
    );
    holds(belowZero(wait), title, 'the passengers not prioritised no longer wait less');
    holds(
      passedGateflow.value <= bound.value,
      title,
      'a ticket was passed by more people than the bound',
    );
    holds(
      passedToday.value > bound.value,
      title,
      "today's calls no longer pass a ticket more than GateFlow's bound allows",
    );
    claims.push({
      id: 'hub-fairness',
      title,
      text: `At the hub the passengers GateFlow does not prioritise wait ${strong(wait)} minutes on average against today's practice, that is less, since the console's lanes shorten the queue; ${value(delayed)} of them wait more than 5 minutes longer.`,
      caveat: `Without the console's lanes, the priority calls alone make them wait ${text(hubPriorityWait)} minutes longer on average. A priority call passes people who came before, never more than ${value(bound)} for one ticket (the policy's bound; ${value(passedGateflow)} on the worst of the 200 days); staff calling flights out of today's queue passed up to ${value(passedToday)}.`,
      figures: [wait, delayed, hubPriorityWait, bound, passedGateflow, passedToday],
    });
  }

  // ---------------------------------------------------------------------------------------------
  // The tables behind the claims.
  const link = (label: string, file: string) => `[${label}](${options.reports}/${file})`;
  const reportOf = (id: LibraryId) => link(titleOf(id), experiment(id).report);
  const tables: PitchTable[] = [];

  tables.push({
    id: 'gateflow',
    title: "GateFlow as a whole against today's practice",
    intro:
      "GateFlow's priority calls with its console's lane recommendations (`priority-v3@advise`) against today's practice: staff calling the closing flights and a supervisor opening a lane when the queue shows more than 10 minutes (`fifo-manual@reactive`). Means per day over 200 simulated days with 95% confidence intervals, passenger by passenger on the same days.",
    columns: [
      { title: 'Scenario', numeric: false },
      { title: 'People per day', numeric: true },
      { title: 'Missed per day, today', numeric: true },
      { title: 'Missed per day, GateFlow', numeric: true },
      { title: 'Net flights saved per day', numeric: true },
      { title: 'Extra lane-hours per day', numeric: true },
      { title: 'Change in mean wait (min)', numeric: true },
    ],
    rows: LIBRARY.map((id) => [
      reportOf(id),
      experiment(id).figure(['summary', 'peoplePerDay'], `People per day, ${titleOf(id)}`, WHOLE),
      policy(
        id,
        TODAY,
        'missed',
        `Missed flights per day with today's practice, ${titleOf(id)}`,
        COUNT,
      ),
      policy(id, GATEFLOW, 'missed', `Missed flights per day with GateFlow, ${titleOf(id)}`, COUNT),
      compared(id, GATEFLOW, TODAY, 'net', `Net flights saved per day, ${titleOf(id)}`, FLIGHTS),
      compared(
        id,
        GATEFLOW,
        TODAY,
        'extraLaneHoursDelta',
        `Extra lane-hours per day, ${titleOf(id)}`,
        LANE_HOURS,
      ),
      compared(
        id,
        GATEFLOW,
        TODAY,
        'waitMeanDeltaMin',
        `Change in mean wait (min), ${titleOf(id)}`,
        MINUTES,
      ),
    ]),
    notes: [],
  });

  tables.push({
    id: 'parts',
    title: 'Where it comes from',
    intro:
      "The same days, one part at a time: GateFlow's priority calls alone (`priority-v3` against `fifo-manual`, both with the plan's lanes); the console's lanes alone (`fifo-manual@advise` against `fifo-manual@reactive`, both with today's calls); the priority calls once the console's lanes are open (`priority-v3@advise` against `fifo-manual@advise`).",
    columns: [
      { title: 'Scenario', numeric: false },
      { title: 'Priority calls alone: net flights saved', numeric: true },
      { title: "Console's lanes vs supervisor: net flights saved", numeric: true },
      { title: "Console's lanes vs supervisor: extra lane-hours", numeric: true },
      { title: "Console's lanes vs supervisor: change in mean wait (min)", numeric: true },
      { title: "Priority calls on the console's lanes: net flights saved", numeric: true },
    ],
    rows: LIBRARY.map((id) => [
      reportOf(id),
      compared(
        id,
        PRIORITY,
        CALLS,
        'net',
        `Net flights saved per day by the priority calls alone, ${titleOf(id)}`,
        FLIGHTS,
      ),
      compared(
        id,
        CONSOLE,
        TODAY,
        'net',
        `Net flights saved per day, the console's lanes against the supervisor, ${titleOf(id)}`,
        FLIGHTS,
      ),
      compared(
        id,
        CONSOLE,
        TODAY,
        'extraLaneHoursDelta',
        `Extra lane-hours per day, the console's lanes against the supervisor, ${titleOf(id)}`,
        LANE_HOURS,
      ),
      compared(
        id,
        CONSOLE,
        TODAY,
        'waitMeanDeltaMin',
        `Change in mean wait (min), the console's lanes against the supervisor, ${titleOf(id)}`,
        MINUTES,
      ),
      compared(
        id,
        GATEFLOW,
        CONSOLE,
        'net',
        `Net flights saved per day by the priority calls on the console's lanes, ${titleOf(id)}`,
        FLIGHTS,
      ),
    ]),
    notes: [],
  });

  const shares = atTheHub.pointValues('follow');
  if (JSON.stringify(shares) !== JSON.stringify(atTheBase.pointValues('follow'))) {
    throw new PitchError('the two sweeps of the share followed no longer have the same points');
  }
  tables.push({
    id: 'followed',
    title: 'Recommendations followed or not',
    intro:
      "The share of the console's recommendations the duty manager follows, at the MX-like hub and at the TSF-like base; none followed is the plan only. Today's calls with the console's lanes, against today's supervisor and against the plan only. 200 simulated days per point.",
    columns: [
      { title: 'Share followed', numeric: true },
      { title: 'Hub: net flights saved vs supervisor', numeric: true },
      { title: 'Hub: extra lane-hours per day', numeric: true },
      { title: 'TSF-like: change in mean wait vs supervisor (min)', numeric: true },
      { title: 'TSF-like: vs plan only (min)', numeric: true },
    ],
    rows: shares.map((share) => {
      const assumedShare = atTheHub.at([...atTheHub.pointPath('follow', share), 'isBase']) === true;
      return [
        `${atTheHub.text([...atTheHub.pointPath('follow', share), 'label'])}${assumedShare ? ' (as assumed)' : ''}`,
        atTheHub.point(
          'follow',
          share,
          ['comparisons', versus(CONSOLE, TODAY), 'metrics', 'net'],
          `Net flights saved per day at the hub against the supervisor, ${String(share)} followed`,
          FLIGHTS,
        ),
        atTheHub.point(
          'follow',
          share,
          ['policies', CONSOLE, 'extraLaneHours'],
          `Extra lane-hours per day at the hub, ${String(share)} followed`,
          COUNT,
        ),
        atTheBase.point(
          'follow',
          share,
          ['comparisons', versus(CONSOLE, TODAY), 'metrics', 'waitMeanDeltaMin'],
          `Change in mean wait at the TSF-like base against the supervisor (min), ${String(share)} followed`,
          MINUTES,
        ),
        atTheBase.point(
          'follow',
          share,
          ['comparisons', versus(CONSOLE, CALLS), 'metrics', 'waitMeanDeltaMin'],
          `Change in mean wait at the TSF-like base against the plan only (min), ${String(share)} followed`,
          MINUTES,
        ),
      ];
    }),
    notes: [
      `Sources: ${link(atTheHub.label, atTheHub.report)}, ${link(atTheBase.label, atTheBase.report)}.`,
    ],
  });

  const harderRows: { dimension: string; at: number; label: string }[] = [
    { dimension: 'screening-time', at: 24, label: 'As planned: 24 s a person' },
    { dimension: 'screening-time', at: 25, label: 'Screening at 25 s a person' },
    { dimension: 'screening-time', at: 26, label: 'Screening at 26 s a person' },
    { dimension: 'screening-time', at: 27, label: 'Screening at 27 s a person' },
    { dimension: 'roster', at: -1, label: 'A roster one lane short (24 s a person)' },
  ];
  tables.push({
    id: 'harder',
    title: 'A day harder than planned',
    intro:
      "The VCE-like peak day of S8, made harder one assumption at a time: screening slower than the roster assumed, or a roster one lane short. Today's calls with the plan only, with today's supervisor, and with GateFlow's lanes as S8 recommended them (`@predict`, S8's rule: the console's rule was not swept on such days). 200 simulated days per point.",
    columns: [
      { title: 'Day', numeric: false },
      { title: 'Missed per day: plan only', numeric: true },
      { title: 'Supervisor', numeric: true },
      { title: "GateFlow's lanes (S8)", numeric: true },
      { title: "GateFlow's lanes vs supervisor: net flights saved", numeric: true },
      { title: 'Extra lane-hours: supervisor', numeric: true },
      { title: "Extra lane-hours: GateFlow's lanes", numeric: true },
    ],
    rows: harderRows.map(({ dimension, at, label }) => [
      label,
      harderMissed(dimension, at, CALLS, `Missed flights per day, plan only, ${label}`),
      harderMissed(dimension, at, TODAY, `Missed flights per day, today's supervisor, ${label}`),
      harderMissed(
        dimension,
        at,
        S8_LANES,
        `Missed flights per day, GateFlow's lanes (S8), ${label}`,
      ),
      harderNet(dimension, at, `Net flights saved per day against the supervisor, ${label}`),
      harderPoint(
        dimension,
        at,
        ['policies', TODAY, 'extraLaneHours'],
        `Extra lane-hours per day, today's supervisor, ${label}`,
        COUNT,
      ),
      harderPoint(
        dimension,
        at,
        ['policies', S8_LANES, 'extraLaneHours'],
        `Extra lane-hours per day, GateFlow's lanes (S8), ${label}`,
        COUNT,
      ),
    ]),
    notes: [`Source: ${link(harder.label, harder.report)}.`],
  });

  tables.push({
    id: 'forecasts',
    title: 'The forecasts behind the recommendations',
    intro:
      'GateFlow Predict (S21), measured on 200 simulated days a scenario: a forecast every 15 minutes, compared 15 and 90 minutes later with what happened. Arrivals: the people arriving in the 5 minutes before the horizon; the WAPE is the error as a share of them, the coverage the share of the truths in the 80% band. Wait: minutes from arrival to admission, on the forecasts of a queue.',
    columns: [
      { title: 'Scenario', numeric: false },
      { title: 'Minutes ahead', numeric: true },
      { title: 'Arrivals: WAPE', numeric: true },
      { title: 'Arrivals: in the band', numeric: true },
      { title: 'Wait: mean error (min)', numeric: true },
      { title: 'Wait: in the band', numeric: true },
      { title: 'Forecasts', numeric: true },
    ],
    rows: FORECASTS.flatMap((id) =>
      (['15', '90'] as const).map((h) => {
        const s = backtest(id);
        return [
          link(titleOf(id), s.report),
          h,
          s.figure(
            ['summary', 'arrivals', h, 'all', 'wape'],
            `Error of the arrivals (WAPE), ${titleOf(id)}, ${h} minutes ahead`,
            PERCENT,
          ),
          s.figure(
            ['summary', 'arrivals', h, 'all', 'coverage'],
            `Share of the arrivals in the band, ${titleOf(id)}, ${h} minutes ahead`,
            PERCENT,
          ),
          s.figure(
            ['summary', 'wait', h, 'busy', 'mae'],
            `Mean error of the wait (min), with a queue, ${titleOf(id)}, ${h} minutes ahead`,
            WAIT,
          ),
          s.figure(
            ['summary', 'wait', h, 'busy', 'coverage'],
            `Share of the waits in the band, with a queue, ${titleOf(id)}, ${h} minutes ahead`,
            PERCENT,
          ),
          s.figure(
            ['summary', 'arrivals', h, 'all', 'n'],
            `Forecasts measured, ${titleOf(id)}, ${h} minutes ahead`,
            WHOLE,
          ),
        ];
      }),
    ),
    notes: [
      'The demo checkpoint is a congested morning made for the simulator, not a library scenario: the claims above leave it out.',
    ],
  });

  const sources = loaded.map(sourceOf);
  tables.push({
    id: 'sources',
    title: 'Sources',
    intro:
      "The reports the page reads, each produced from a clean checkout of its commit; each says how to reproduce it, and `figures.json` gives every figure's file and JSON pointer.",
    columns: [
      { title: 'Report', numeric: false },
      { title: 'What it is', numeric: false },
      { title: 'Commit', numeric: false },
      { title: 'Generator', numeric: false },
      { title: 'Simulated days (per point of a sweep)', numeric: true },
    ],
    rows: sources.map((s) => [
      link(s.label, s.report),
      s.title,
      `\`${s.commit.slice(0, 7)}\``,
      s.generator,
      String(s.days),
    ]),
    notes: [
      `From a clean checkout of a report's commit, the command its manifest records reproduces it (\`figures.json\` gives them all); for the sweep of the recommendations followed at the hub:\n\n\`\`\`bash\n${atTheHub.text(['manifest', 'reproduce'])}\n\`\`\``,
    ],
  });

  // ---------------------------------------------------------------------------------------------
  // The charts of the HTML page.
  const missedBar = (policyId: string, label: string, emphasis: boolean) => ({
    label,
    value: policy(hub, policyId, 'missed', `Missed flights per day at the hub, ${label}`, COUNT),
    low: experiment(hub).figure(
      ['summary', 'policies', policyId, 'missed', 'p05'],
      `5th percentile of the days, ${label}`,
      COUNT,
    ),
    high: experiment(hub).figure(
      ['summary', 'policies', policyId, 'missed', 'p95'],
      `95th percentile of the days, ${label}`,
      COUNT,
    ),
    emphasis,
  });
  const charts: PitchChart[] = [
    {
      kind: 'intervals',
      id: 'hub-net',
      section: 'claims',
      title: 'Net flights saved per day at the MX-like transfer hub',
      note: 'Means over 200 simulated days with 95% confidence intervals, passenger by passenger on the same days. SIMULATED.',
      rows: [
        { label: "GateFlow vs today's practice", value: hubNet },
        { label: "Console's lanes vs supervisor", value: hubLanes },
        { label: 'Same, half followed', value: halfFollowed },
        { label: 'Priority calls alone', value: hubPriority },
        { label: "Priority calls on console's lanes", value: hubPriorityOnLanes },
      ],
    },
    {
      kind: 'bars',
      id: 'hub-missed',
      section: 'gateflow',
      title: 'Missed flights per day at the MX-like transfer hub',
      note: 'Mean over 200 simulated days; the whisker spans the 5th to the 95th percentile of the days. In blue, with a part of GateFlow. SIMULATED.',
      rows: [
        missedBar(CALLS, "Today's calls, plan's lanes", false),
        missedBar(TODAY, "Today's practice (supervisor)", false),
        missedBar(PRIORITY, "GateFlow's calls, plan's lanes", true),
        missedBar(CONSOLE, "Today's calls, console's lanes", true),
        missedBar(GATEFLOW, 'GateFlow as a whole', true),
      ],
    },
  ];

  // A claim on the forecasts speaks of every checkpoint of the library, not only of its extremes.
  const claimSources = (c: Omit<PitchClaim, 'sources'>): string[] =>
    PITCH_SOURCES.filter(
      (file) =>
        c.figures.some((f) => f.source === file) ||
        (c.id.startsWith('forecast-') && library.some((s) => s.file === file)),
    );

  const limits = [
    "They are simulated, on synthetic airports made to look like three kinds of checkpoint (a VCE-like departures checkpoint, a TSF-like low-cost base, an MX-like transfer hub): they are not those airports' data. An airport's own figures come from its own days (M5).",
    "Today's practice is idealised: staff call every closing flight, and the supervisor sees the exact wait every 5 minutes and never forgets. A real supervisor reacts later, so GateFlow's margin is probably understated.",
    'The staff on call, the time to open a lane and the share of recommendations followed are assumptions; the data request asks the airport for them.',
    'An extra lane costs only its lane-hours here: no other duty of the staff on call is modelled, and the airport prices the lane-hours.',
    'The forecasts learn from other simulated days of the same model: a real forecast will be worse at first.',
    "The rules simulated are GateFlow's own code: the console's lane recommendations are the rule the live console runs, reading what the live system would know, and the live system calls the simulator's numbers in the simulator's order (S18). What is simulated is the airport, not GateFlow.",
  ];

  return {
    schema: PITCH_SCHEMA,
    disclaimer: DISCLAIMER,
    reports: options.reports,
    sources,
    claims: claims.map((c) => ({ ...c, sources: claimSources(c) })),
    tables,
    charts,
    limits,
  };
}

// ---------------------------------------------------------------------------------------------
// Rendering

const PAGE_TITLE = 'GateFlow pitch figures';

function cell(c: PitchCell): string {
  return typeof c === 'string' ? c : figureText(c);
}

function tableMarkdown(table: PitchTable): string[] {
  const escape = (s: string) => s.replace(/\|/g, '\\|');
  return [
    `| ${table.columns.map((c) => escape(c.title)).join(' | ')} |`,
    `|${table.columns.map((c) => (c.numeric ? '---:' : '---')).join('|')}|`,
    ...table.rows.map((row) => `| ${row.map((c) => escape(cell(c))).join(' | ')} |`),
  ];
}

function sourcesOf(doc: PitchDocument, claim: PitchClaim): string {
  return claim.sources
    .map((file) => {
      const source = doc.sources.find((s) => s.file === file);
      if (source === undefined) throw new PitchError(`no source ${file}`);
      return `[${source.label}](${doc.reports}/${source.report})`;
    })
    .join(', ');
}

/** The page in Markdown (docs/pitch/README.md). Deterministic. */
export function renderPitchMarkdown(doc: PitchDocument): string {
  const lines: string[] = [
    `# ${PAGE_TITLE} (SIMULATED)`,
    '',
    `> **SIMULATED RESULTS ON SYNTHETIC DATA.** These figures are model outputs on synthetic airports, not measurements, and must not be presented as evidence of operational performance: in the pitch, say them as what GateFlow's simulator gives, with their caveats.`,
    '',
    "The figures GateFlow's simulations give for the pitch, on one page. Every number is read from a published report, linked, with its 95% confidence interval where the report gives one; `figures.json` gives each with the file and the place it was read. The page is written by `gateflow-sim pitch` (`pnpm pitch`) and CI checks it is what the reports give: a report published again changes it in the same commit.",
    '',
    'Words of the page:',
    "- **Today's practice:** staff calling the passengers of closing flights out of the queue (A'), and a supervisor who opens an extra lane when the queue shows more than 10 minutes of wait (`fifo-manual@reactive`).",
    "- **GateFlow as a whole:** GateFlow's priority calls (`priority-v3`) with its console's lane recommendations (`@advise`), followed 4 times in 5 by the duty manager.",
    '- **Net flights saved:** passengers who make a flight they would have missed, minus those who miss one they would have made, per day.',
    "- **Extra lane-hours:** the hours of lanes open beyond the roster's plan, per day; the staff on call open them.",
    '',
    '## Claims for the pitch',
    '',
  ];
  doc.claims.forEach((claim, i) => {
    lines.push(
      `### ${String(i + 1)}. ${claim.title}`,
      '',
      claim.text,
      '',
      `**Say it with:** ${claim.caveat}`,
      '',
      `Sources: ${sourcesOf(doc, claim)}.`,
      '',
    );
  });
  for (const table of doc.tables) {
    lines.push(`## ${table.title}`, '', table.intro, '', ...tableMarkdown(table), '');
    for (const note of table.notes) lines.push(note, '');
    if (table.id === 'forecasts') {
      lines.push('## What the figures do not say', '', ...doc.limits.map((l) => `- ${l}`), '');
    }
  }
  return `${lines.join('\n').trimEnd()}\n`;
}

function chartHtml(chart: PitchChart): string {
  if (chart.kind === 'bars') {
    const svg = rangeBarsSvg(
      chart.rows.map((r) => ({
        label: r.label,
        value: r.value.value,
        low: r.low.value,
        high: r.high.value,
        emphasis: r.emphasis,
      })),
      { label: chart.title },
    );
    return chartFigure(chart.title, chart.note, svg);
  }
  const svg = intervalsSvg(
    chart.rows.map((r) => ({
      label: r.label,
      mean: r.value.value,
      lower: r.value.lower ?? r.value.value,
      upper: r.value.upper ?? r.value.value,
    })),
    { label: chart.title },
  );
  return chartFigure(chart.title, chart.note, svg);
}

/** The page in HTML, with its charts (docs/pitch/figures.html). Deterministic, self-contained. */
export function renderPitchHtml(doc: PitchDocument): string {
  const { preamble, sections } = markdownSections(renderPitchMarkdown(doc));
  const headings = new Map<string, string>([
    ['Claims for the pitch', 'claims'],
    ...doc.tables.map((t): [string, string] => [t.title, t.id]),
  ]);
  const body = [
    markdownToHtml(preamble),
    ...sections.map((section) => {
      const heading = /^## (.*)$/m.exec(section)?.[1] ?? '';
      const id = headings.get(heading);
      const charts = doc.charts.filter((c) => c.section === id).map(chartHtml);
      const html = markdownToHtml(section);
      if (charts.length === 0) return html;
      const cut = html.indexOf('\n');
      return cut < 0
        ? `${html}\n${charts.join('\n')}`
        : `${html.slice(0, cut)}\n${charts.join('\n')}\n${html.slice(cut + 1)}`;
    }),
  ].join('\n');
  return htmlPage(
    PAGE_TITLE,
    "SIMULATED figures for GateFlow's pitch, each read from a published report with its interval, source and caveat.",
    body,
  );
}

/** The document as JSON (docs/pitch/figures.json). */
export function stringifyPitch(doc: PitchDocument): string {
  return `${JSON.stringify(doc, null, 2)}\n`;
}
