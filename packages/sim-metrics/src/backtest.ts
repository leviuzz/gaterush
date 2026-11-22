import { MS_PER_HOUR, MS_PER_MINUTE } from '@gateflow/domain';
import {
  BUCKET_MS,
  FORECAST_VERSION,
  HORIZONS_MIN,
  QUANTITIES,
  bandAt,
  calibrationFrom,
  errorSummary,
  forecastPaths,
  isBusy,
  levelsAt,
  pitOf,
  quantile,
} from '@gateflow/forecast';
import type {
  Band,
  Calibration,
  CheckpointProfile,
  ErrorSummary,
  LiveState,
  Observation,
  PitSets,
  Quantity,
} from '@gateflow/forecast';
import type { ClassificationParams } from '@gateflow/priority-engine';
import type { Policy } from '@gateflow/queue-core';
import { MODEL_VERSION } from '@gateflow/sim-model';
import type { ArrivalForecast, DayEvent } from '@gateflow/sim-model';
import { FORECAST_DAYS, FORECAST_FIRST_SEED, GENERATOR_VERSION } from '@gateflow/sim-scenarios';
import type { Scenario } from '@gateflow/sim-scenarios';
import { dayPopulation, forecastFor, normaliseSeeds } from './experiment';
import { simulatePolicy } from './lane-advice';
import { checkpointProfile } from './profile';
import { DISCLAIMER, formatSeedRanges, roundNumbers } from './results';

/*
 * The backtest of GateFlow's forecasts on the simulated truth (S21, ADR-054). The full simulator's
 * days are the truth. From an hour after the first arrival, every 15 minutes, a forecast is made
 * from what the live system would know then (the arrivals so far, the people not yet admitted,
 * the lanes open) and compared, at each horizon, with what happened in that day: the people who
 * arrived in the 5 minutes before the horizon, the people not yet admitted at the horizon, and the
 * wait of the people who arrived in those 5 minutes.
 */

export const BACKTEST_SCHEMA = 'gateflow.forecast.backtest/2';

/** Forecasts are made every 15 minutes of the day. */
export const ORIGIN_EVERY_MS = 15 * MS_PER_MINUTE;

/** A forecast of the backtest and what happened then. */
export interface BacktestObservation extends Observation {
  /** When the forecast was made (ms since the start of the day). */
  readonly originMs: number;
  /** The band at the calibration's levels, when the backtest has a calibration (S21.3). */
  readonly calibrated?: Band;
}

/** What a backtest needs for one day: plain data, so that a worker thread can run it. */
export interface BacktestJob {
  readonly scenario: Scenario;
  readonly policy: Policy;
  readonly classification: ClassificationParams;
  readonly profile: CheckpointProfile;
  /** S8's forecast of the scenario, when the policy recommends lanes from one. */
  readonly forecast?: ArrivalForecast;
}

/** The work of a backtest, computed once for all its days. */
export function planBacktest(
  scenario: Scenario,
  policy: Policy,
  classification: ClassificationParams,
): BacktestJob {
  return {
    scenario,
    policy,
    classification,
    profile: checkpointProfile(scenario),
    ...forecastFor(scenario, [policy]),
  };
}

/** A value that changes at instants: its value at `t` is the latest set at or before `t`. */
class Timeline {
  private readonly at: number[] = [];
  private readonly values: number[] = [];
  set(atMs: number, value: number): void {
    if (this.at.length > 0 && this.at[this.at.length - 1] === atMs) {
      this.values[this.values.length - 1] = value;
      return;
    }
    this.at.push(atMs);
    this.values.push(value);
  }
  valueAt(t: number): number {
    let lo = 0;
    let hi = this.at.length - 1;
    let found = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if ((this.at[mid] ?? Infinity) <= t) {
        found = mid;
        lo = mid + 1;
      } else hi = mid - 1;
    }
    return found < 0 ? 0 : (this.values[found] ?? 0);
  }
}

/** The median of the waits of people, each counted once per person of their party. */
function medianPerPerson(waits: readonly { readonly ms: number; readonly people: number }[]) {
  const values: number[] = [];
  for (const w of waits) for (let i = 0; i < w.people; i++) values.push(w.ms);
  values.sort((a, b) => a - b);
  const mid = (values.length - 1) / 2;
  return ((values[Math.floor(mid)] ?? 0) + (values[Math.ceil(mid)] ?? 0)) / 2;
}

/**
 * A day of the full simulator as the backtest reads it (S21): what happened, and what the live
 * system knew at any time. The live system knows the people who took a number (each party once,
 * on arrival), the people not yet admitted (waiting, announced, called) and the lanes open.
 */
export class SimulatedDay {
  private constructor(
    /** Parties taking a number, by arrival. */
    private readonly arrivals: readonly { readonly atMs: number; readonly people: number }[],
    /** The waits of the people admitted, by party. */
    private readonly waits: readonly {
      readonly arrivedMs: number;
      readonly ms: number;
      readonly people: number;
    }[],
    private readonly backlog: Timeline,
    private readonly lanes: Timeline,
    readonly ratePerLanePerHour: number,
  ) {}

  /** Simulates day `seed` of the job, watching it as the live system would. */
  static run(job: BacktestJob, seed: number): SimulatedDay {
    const population = dayPopulation(job.scenario, job.forecast, seed);
    const passengers = population.passengers;
    const arrivals: { atMs: number; people: number }[] = [];
    const waits: { arrivedMs: number; ms: number; people: number }[] = [];
    const backlog = new Timeline();
    const lanes = new Timeline();
    /** The people of each ticket not yet admitted, out of play or absent. */
    const inBacklog = new Map<string, number>();
    let people = 0;
    const observer = (event: DayEvent): void => {
      if (event.type === 'ARRIVED') {
        const p = passengers[event.party];
        if (p?.path === 'QUEUE') arrivals.push({ atMs: event.atMs, people: p.partySize });
        return;
      }
      if (event.type === 'LANES') {
        lanes.set(event.atMs, event.open);
        return;
      }
      if (event.type !== 'QUEUE') return;
      const e = event.event;
      const size = passengers[event.party]?.partySize ?? 0;
      const enter = e.type === 'ISSUED' || e.type === 'REACTIVATED';
      const leave = e.type === 'ADMITTED' || e.type === 'EXPIRED' || e.type === 'NO_SHOW';
      if (!enter && !leave) return;
      const ticket = 'ticketId' in e ? e.ticketId : '';
      if (enter && !inBacklog.has(ticket)) {
        inBacklog.set(ticket, size);
        people += size;
      } else if (leave && inBacklog.has(ticket)) {
        people -= inBacklog.get(ticket) ?? 0;
        inBacklog.delete(ticket);
      }
      backlog.set(e.atMs, people);
      if (e.type === 'ADMITTED') {
        const p = passengers[event.party];
        if (p !== undefined) {
          waits.push({ arrivedMs: p.arrivalMs, ms: e.atMs - p.arrivalMs, people: p.partySize });
        }
      }
    };
    simulatePolicy(
      population,
      job.policy,
      { classification: job.classification, observer },
      job.profile,
    );
    arrivals.sort((a, b) => a.atMs - b.atMs);
    return new SimulatedDay(
      arrivals,
      waits,
      backlog,
      lanes,
      population.checkpoint.serviceRatePerLanePerHour,
    );
  }

  /** The first and the last arrival taking a number; null on a day without one. */
  get span(): { readonly firstMs: number; readonly lastMs: number } | null {
    const first = this.arrivals[0];
    const last = this.arrivals[this.arrivals.length - 1];
    return first === undefined || last === undefined
      ? null
      : { firstMs: first.atMs, lastMs: last.atMs };
  }

  /** People who took a number from `from` (included) to `to` (excluded). */
  arrivedIn(from: number, to: number): number {
    let n = 0;
    for (const a of this.arrivals) if (a.atMs >= from && a.atMs < to) n += a.people;
    return n;
  }

  /** People not yet admitted at `t`, after everything that happened at `t`. */
  backlogAt(t: number): number {
    return this.backlog.valueAt(t);
  }

  /** The median wait, per person, of the people who arrived from `from` to `to`; null: none. */
  medianWaitMs(from: number, to: number): number | null {
    const arrived = this.waits.filter((w) => w.arrivedMs >= from && w.arrivedMs < to);
    return arrived.length === 0 ? null : medianPerPerson(arrived);
  }

  /** What a forecast made at `t` reads: the live system's knowledge then. */
  stateAt(t: number): LiveState {
    return {
      nowMs: t,
      arrivalsLastHour: this.arrivedIn(t - MS_PER_HOUR, t),
      backlog: this.backlogAt(t),
      lanesOpen: Math.max(1, this.lanes.valueAt(t)),
      ratePerLanePerHour: this.ratePerLanePerHour,
    };
  }
}

/** A horizon of a forecast made in a backtest, and what happened then. */
interface HorizonOutcome {
  readonly minutes: number;
  /** The paths, sorted: people, people, and milliseconds for the wait. */
  readonly paths: Readonly<Record<Quantity, readonly number[]>>;
  /** What happened, in the same units; the wait is null when nobody arrived in those 5 minutes. */
  readonly truths: Readonly<Record<Quantity, number | null>>;
}

/**
 * Every forecast of a simulated day: from an hour after the first arrival, every 15 minutes,
 * with what the live system would have known, and what happened at each horizon up to the last
 * arrival.
 */
function forecastsOfDay(
  job: BacktestJob,
  seed: number,
  visit: (originMs: number, horizons: readonly HorizonOutcome[]) => void,
): void {
  const day = SimulatedDay.run(job, seed);
  const span = day.span;
  if (span === null) return;
  const start = Math.ceil((span.firstMs + MS_PER_HOUR) / ORIGIN_EVERY_MS) * ORIGIN_EVERY_MS;
  for (let t = start; t <= span.lastMs; t += ORIGIN_EVERY_MS) {
    const paths = forecastPaths(job.profile, day.stateAt(t));
    const outcomes: HorizonOutcome[] = [];
    for (const h of paths.horizons) {
      const end = t + h.minutes * MS_PER_MINUTE;
      if (end > span.lastMs) continue;
      const from = end - BUCKET_MS;
      outcomes.push({
        minutes: h.minutes,
        paths: { arrivals: h.arrivals, backlog: h.backlog, wait: h.waitMs },
        truths: {
          arrivals: day.arrivedIn(from, end),
          backlog: day.backlogAt(end),
          wait: day.medianWaitMs(from, end),
        },
      });
    }
    visit(t, outcomes);
  }
}

/** A band in the report's units: waits in minutes. */
const inUnits = (quantity: Quantity, band: Band): Band =>
  quantity === 'wait'
    ? {
        p10: band.p10 / MS_PER_MINUTE,
        p50: band.p50 / MS_PER_MINUTE,
        p90: band.p90 / MS_PER_MINUTE,
      }
    : band;

/**
 * One simulated day of the backtest: the truth from the full simulator, and the forecasts made
 * every 15 minutes with what the live system would have known, compared at every horizon, as the
 * paths are and, with a calibration, as calibrated. Waits are in minutes.
 */
export function backtestDay(
  job: BacktestJob,
  seed: number,
  calibration?: Calibration,
): BacktestObservation[] {
  const observations: BacktestObservation[] = [];
  forecastsOfDay(job, seed, (originMs, horizons) => {
    for (const h of horizons) {
      for (const quantity of QUANTITIES) {
        const truth = h.truths[quantity];
        if (truth === null) continue;
        const paths = h.paths[quantity];
        observations.push({
          originMs,
          horizon: h.minutes,
          quantity,
          truth: quantity === 'wait' ? truth / MS_PER_MINUTE : truth,
          band: inUnits(quantity, bandAt(paths)),
          ...(calibration === undefined
            ? {}
            : {
                calibrated: inUnits(
                  quantity,
                  bandAt(paths, levelsAt(calibration, quantity, h.minutes)),
                ),
              }),
        });
      }
    }
  });
  return observations;
}

/** Empty PIT sets: an array per quantity and horizon. */
function emptyPits(): Record<Quantity, Record<string, number[]>> {
  const pits = {} as Record<Quantity, Record<string, number[]>>;
  for (const quantity of QUANTITIES) {
    pits[quantity] = Object.fromEntries(HORIZONS_MIN.map((h) => [String(h), [] as number[]]));
  }
  return pits;
}

/**
 * Where the truths fell among the paths (their PIT) on one simulated day, for a calibration: every
 * forecast of the arrivals, and the forecasts of a queue for the queue and the wait (the median of
 * the paths or the truth at least 1, a person or a minute).
 */
export function calibrationDay(job: BacktestJob, seed: number): PitSets {
  const pits = emptyPits();
  forecastsOfDay(job, seed, (_originMs, horizons) => {
    for (const h of horizons) {
      for (const quantity of QUANTITIES) {
        const truth = h.truths[quantity];
        if (truth === null) continue;
        const paths = h.paths[quantity];
        const unit = quantity === 'wait' ? MS_PER_MINUTE : 1;
        const busy = truth >= unit || quantile(paths, 0.5) >= unit;
        if (quantity !== 'arrivals' && !busy) continue;
        pits[quantity][String(h.minutes)]?.push(pitOf(paths, truth));
      }
    }
  });
  return pits;
}

/** The calibration of the bands from the PIT values of simulated days ({@link calibrationDay}). */
export function calibrationOfDays(days: readonly PitSets[]): Calibration {
  const pits = emptyPits();
  for (const day of days) {
    for (const quantity of QUANTITIES) {
      for (const h of HORIZONS_MIN) {
        pits[quantity][String(h)]?.push(...(day[quantity][String(h)] ?? []));
      }
    }
  }
  return calibrationFrom(pits);
}

/** The errors at one horizon: of every forecast, and of the forecasts of a queue. */
export interface HorizonErrors {
  readonly all: ErrorSummary | null;
  /** The forecasts whose median or truth is at least 1 ({@link isBusy}). */
  readonly busy: ErrorSummary | null;
}

/** The errors of every quantity at every horizon (keys: the horizons in minutes). */
export type BacktestSummary = Readonly<Record<Quantity, Readonly<Record<string, HorizonErrors>>>>;

/**
 * Sums the observations of the days up per quantity and horizon: their bands as the paths are, or
 * as calibrated (the median is the same; the edges move).
 */
export function summariseBacktest(
  days: readonly (readonly BacktestObservation[])[],
  bands: 'paths' | 'calibrated' = 'paths',
): BacktestSummary {
  const summary = {} as Record<Quantity, Record<string, HorizonErrors>>;
  for (const quantity of QUANTITIES) {
    const byHorizon: Record<string, HorizonErrors> = {};
    for (const h of HORIZONS_MIN) {
      const all = days.flatMap((day) =>
        day
          .filter((o) => o.quantity === quantity && o.horizon === h)
          .map((o) => (bands === 'calibrated' ? { ...o, band: o.calibrated ?? o.band } : o)),
      );
      byHorizon[String(h)] = {
        all: errorSummary(all),
        busy: errorSummary(all.filter((o) => isBusy(o))),
      };
    }
    summary[quantity] = byHorizon;
  }
  return roundNumbers(summary);
}

/** The backtest of a scenario, as its file has it. */
export interface BacktestDocument {
  readonly schema: string;
  readonly disclaimer: string;
  readonly manifest: {
    readonly generator: { readonly name: string; readonly version: string };
    readonly commit: string;
    readonly versions: {
      readonly forecast: string;
      readonly model: string;
      readonly populationGenerator: string;
    };
    readonly scenario: {
      readonly id: string;
      readonly title: string;
      readonly hash: string;
      readonly dataClassification: string;
    };
    readonly policy: { readonly id: string; readonly version: string };
    readonly seeds: { readonly count: number; readonly ranges: string };
    readonly profile: { readonly days: number; readonly firstSeed: number };
    readonly originEveryMinutes: number;
    readonly horizonsMinutes: readonly number[];
    readonly units: { readonly arrivals: string; readonly backlog: string; readonly wait: string };
    /**
     * The calibration the bands were read with (S21.3): where it comes from and its levels; null
     * when the bands are the paths' 10th, 50th and 90th percentiles.
     */
    readonly calibration: {
      readonly source: string;
      readonly levels: Calibration['levels'];
    } | null;
  };
  /** The errors of the bands as the product shows them: calibrated when there is a calibration. */
  readonly summary: BacktestSummary;
  /** With a calibration, the errors of the paths' 10th, 50th and 90th percentiles; else null. */
  readonly uncalibrated: BacktestSummary | null;
}

export function buildBacktest(
  input: {
    readonly scenario: Scenario;
    readonly scenarioHash: string;
    readonly policy: Policy;
    readonly seeds: readonly number[];
    readonly generator: { readonly name: string; readonly version: string };
    readonly commit: string;
    /** The calibration of the days' observations (`calibrated`), and where it comes from. */
    readonly calibration?: { readonly source: string; readonly calibration: Calibration };
  },
  days: readonly (readonly BacktestObservation[])[],
): BacktestDocument {
  const seeds = normaliseSeeds(input.seeds);
  const calibrated = input.calibration !== undefined;
  return {
    schema: BACKTEST_SCHEMA,
    disclaimer: DISCLAIMER,
    manifest: {
      generator: input.generator,
      commit: input.commit,
      versions: {
        forecast: FORECAST_VERSION,
        model: MODEL_VERSION,
        populationGenerator: GENERATOR_VERSION,
      },
      scenario: {
        id: input.scenario.id,
        title: input.scenario.title,
        hash: input.scenarioHash,
        dataClassification: input.scenario.dataClassification,
      },
      policy: { id: input.policy.id, version: input.policy.version },
      seeds: { count: seeds.length, ranges: formatSeedRanges(seeds) },
      profile: { days: FORECAST_DAYS, firstSeed: FORECAST_FIRST_SEED },
      originEveryMinutes: ORIGIN_EVERY_MS / MS_PER_MINUTE,
      horizonsMinutes: [...HORIZONS_MIN],
      units: {
        arrivals: 'people arriving in the 5 minutes before the horizon',
        backlog: 'people not yet admitted at the horizon',
        wait: 'minutes from arrival to admission, the median of the people arriving in those 5 minutes',
      },
      calibration:
        input.calibration === undefined
          ? null
          : { source: input.calibration.source, levels: input.calibration.calibration.levels },
    },
    summary: summariseBacktest(days, calibrated ? 'calibrated' : 'paths'),
    uncalibrated: calibrated ? summariseBacktest(days, 'paths') : null,
  };
}

const fixed = (value: number, digits: number) => value.toFixed(digits);
const percent = (value: number | null) =>
  value === null ? 'n/a' : `${(value * 100).toFixed(1)} %`;

function errorTable(
  summary: Readonly<Record<string, HorizonErrors>>,
  horizons: readonly number[],
  which: keyof HorizonErrors,
  /** The paths as they are, when the bands are calibrated: their share in the band too. */
  before: Readonly<Record<string, HorizonErrors>> | null,
): string[] {
  const extra = before === null ? '' : ' Paths in p10-p90 |';
  const rows = [
    `| Horizon | Forecasts | MAE | WAPE | Bias | In p10-p90 | Below p10 | Above p90 | Band width |${extra}`,
    `|---|---:|---:|---:|---:|---:|---:|---:|---:|${before === null ? '' : '---:|'}`,
  ];
  for (const h of horizons) {
    const s = summary[String(h)]?.[which] ?? null;
    const b = before === null ? undefined : (before[String(h)]?.[which] ?? null);
    const tail = b === undefined ? '' : ` ${b === null ? '' : percent(b.coverage)} |`;
    rows.push(
      s === null
        ? `| ${h} min | 0 | | | | | | | |${b === undefined ? '' : ' |'}`
        : `| ${h} min | ${s.n} | ${fixed(s.mae, 1)} | ${percent(s.wape)} | ${fixed(s.bias, 1)} | ` +
            `${percent(s.coverage)} | ${percent(s.below)} | ${percent(s.above)} | ${fixed(s.width, 1)} |${tail}`,
    );
  }
  return rows;
}

/** The error report of a backtest, in Markdown. */
export function renderBacktestReport(doc: BacktestDocument): string {
  const m = doc.manifest;
  const lines = [
    `# Forecast backtest: ${m.scenario.title}`,
    '',
    `> ${doc.disclaimer}`,
    '',
    `Scenario \`${m.scenario.id}\` (${m.scenario.dataClassification}, \`${m.scenario.hash.slice(0, 19)}...\`), ` +
      `policy \`${m.policy.id}\`, ${m.seeds.count} simulated days (seeds ${m.seeds.ranges}).`,
    '',
    `The truth is the full simulator's day. Every ${m.originEveryMinutes} minutes, from an hour after ` +
      'the first arrival, GateFlow forecasts from what the live system knows then: the arrivals ' +
      'of the last hour, the people not yet admitted, the lanes open. Arrivals come from ' +
      `${m.profile.days} other simulated days of the scenario, scaled by the arrivals of the last ` +
      "hour; the lanes follow the scenario's plan, with today's difference from it.",
    '',
    'MAE and bias are of the median (p50), bias above 0 when the forecast says more than happened; ' +
      'WAPE is the absolute errors over the truths. Calibrated bands hold 80 % of the truths ' +
      'between p10 and p90, with 10 % below and 10 % above; the narrower the band, the more it says. ' +
      'Most of the day nobody waits and none is forecast to: those forecasts are right but say ' +
      'nothing of the bands, so the people not yet admitted and the waits are also measured on ' +
      'the forecasts of a queue alone (median or truth at least 1).',
    '',
    m.calibration === null
      ? "The bands are the paths' 10th, 50th and 90th percentiles."
      : `The bands' edges read the paths at the levels of a calibration (${m.calibration.source}): ` +
        'where the truths fell among the paths on other simulated days. The median is the ' +
        "paths'. The last column gives the share of the truths between the paths' 10th and 90th " +
        'percentiles, before the calibration.',
    '',
  ];
  const titles: Record<Quantity, string> = {
    arrivals: `Arrivals: ${m.units.arrivals}`,
    backlog: `Queue: ${m.units.backlog}`,
    wait: `Wait: ${m.units.wait}`,
  };
  for (const quantity of QUANTITIES) {
    const summary = doc.summary[quantity];
    const before = doc.uncalibrated === null ? null : doc.uncalibrated[quantity];
    lines.push(`## ${titles[quantity]}`, '');
    if (quantity === 'arrivals') {
      lines.push(...errorTable(summary, m.horizonsMinutes, 'all', before), '');
      continue;
    }
    lines.push(
      '### When a queue was forecast or happened',
      '',
      ...errorTable(summary, m.horizonsMinutes, 'busy', before),
      '',
      '### Every forecast',
      '',
      ...errorTable(summary, m.horizonsMinutes, 'all', before),
      '',
    );
  }
  lines.push(
    `Generated by ${m.generator.name} ${m.generator.version} (source ${m.commit}); forecast ` +
      `${m.versions.forecast}, model ${m.versions.model}, population generator ${m.versions.populationGenerator}.`,
    '',
  );
  return lines.join('\n');
}

/** Serialises a backtest deterministically. */
export function stringifyBacktest(doc: BacktestDocument): string {
  return `${JSON.stringify(doc, null, 2)}\n`;
}
