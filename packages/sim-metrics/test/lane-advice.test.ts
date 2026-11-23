import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  FORECAST_VERSION,
  LIBRARY_CALIBRATION,
  LIBRARY_CALIBRATION_SOURCE,
  adviseLanes,
  consoleRate,
  measureThroughput,
} from '@gateflow/forecast';
import type { LiveState } from '@gateflow/forecast';
import { LANE_MODES, findPolicyPreset } from '@gateflow/queue-core';
import type { AdvisedLanes, Policy } from '@gateflow/queue-core';
import { generatePopulation, parseScenarioText } from '@gateflow/sim-scenarios';
import type { DayEvent } from '@gateflow/sim-model';
import { simulateCheckpoint } from '@gateflow/sim-model';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_BOOTSTRAP,
  LiveView,
  SimulatedDay,
  applyScenarioSettings,
  applySetting,
  arrivalClassification,
  buildResults,
  dayPopulation,
  planBacktest,
  planExperiment,
  renderReport,
  runDay,
  runExperiment,
  simulatePolicy,
  simulatedConsole,
} from '../src';

/*
 * GateFlow's console in the simulator (S22.3, ADR-057): a policy `@advise` asks, at each review,
 * the very rule of the console with what the live system would know then. The view worked out
 * while the day runs is the backtest's, read after the day by other code: they must agree at every
 * review. The recommendations are then exactly the console's on those states.
 */

const loadWithFiles = (file: string) => {
  const path = fileURLToPath(new URL(`../../../scenarios/${file}`, import.meta.url));
  return parseScenarioText(readFileSync(path, 'utf8'), 'yaml', {
    read: (p) => readFileSync(join(dirname(path), p), 'utf8'),
    sha256: (text) => createHash('sha256').update(text).digest('hex'),
  });
};

/** A TSF-like peak day: one lane on call, a morning that needs it (S22's API test). */
const tsf = loadWithFiles('tsf-like-peak-day.yaml');
const MIN = 60_000;
const ADVISE = LANE_MODES.advise?.lanes as AdvisedLanes;

const policy = (id: string): Policy => {
  const preset = findPolicyPreset(id);
  if (preset === undefined) throw new Error(`no preset ${id}`);
  const [configured] = applyScenarioSettings([preset], tsf);
  if (configured === undefined) throw new Error('no policy');
  return configured;
};

describe("GateFlow's console in the simulator (S22.3)", () => {
  it('reads at every review what the backtest reads of the same day, and recommends as the console', () => {
    const advised = policy('fifo-manual@advise');
    expect(advised.lanes).toEqual(ADVISE);
    const job = planBacktest(tsf, advised, arrivalClassification([advised]));
    // The day with the console, watched by the console and asked through it.
    const population = dayPopulation(tsf, job.forecast, 1);
    const asked: { state: LiveState; changed: number | null }[] = [];
    const gateflow = simulatedConsole(job.profile, population, (state, changed) =>
      asked.push({ state, changed }),
    );
    const events: DayEvent[] = [];
    const run = simulateCheckpoint(population, advised, {
      classification: job.classification,
      laneAdvisor: gateflow.advisor,
      observer: (event) => {
        gateflow.observe(event);
        events.push(event);
      },
    });
    // The same day as the backtest watches it, after the day, with its own code.
    const day = SimulatedDay.run(job, 1);
    const decided = events.flatMap((e) => (e.type === 'LANE_DECISION' ? [e] : []));
    expect(asked.length).toBeGreaterThan(100);
    for (const { state } of asked) {
      // The backtest reads the day after everything at that instant, the console's own decision
      // included: a lane it had closed at once is one lane fewer there.
      const closed = decided.some(
        (d) => d.atMs === state.nowMs && d.action === 'CLOSE' && d.followed,
      );
      const after = day.stateAt(state.nowMs);
      expect(state).toEqual({ ...after, lanesOpen: after.lanesOpen + (closed ? 1 : 0) });
    }
    // When the lanes last changed: the latest change of the lanes open, never the first lanes.
    const changes = events.filter(
      (e, i, all): e is Extract<DayEvent, { type: 'LANES' }> =>
        e.type === 'LANES' &&
        all.slice(0, i).some((p) => p.type === 'LANES') &&
        e.open !==
          (
            all
              .slice(0, i)
              .filter((p) => p.type === 'LANES')
              .at(-1) as { open: number }
          ).open,
    );
    for (const { state, changed } of asked) {
      // Before the console's own decision at that instant, as it read them.
      const closed = decided.some(
        (d) => d.atMs === state.nowMs && d.action === 'CLOSE' && d.followed,
      );
      const before = changes.filter(
        (c) => c.atMs < state.nowMs || (c.atMs === state.nowMs && !closed),
      );
      expect(changed).toBe(before.at(-1)?.atMs ?? null);
    }
    // Each recommendation is the console's on the state it read, at most one every 15 minutes.
    expect(decided.length).toBeGreaterThanOrEqual(2);
    expect(decided.length).toBe(run.stats.laneDecisions);
    for (const d of decided) {
      const read = asked.find((a) => a.state.nowMs === d.atMs);
      if (read === undefined) throw new Error(`no state read at ${String(d.atMs)}`);
      const advice = adviseLanes(job.profile, read.state, {
        calibration: LIBRARY_CALIBRATION,
        rule: {
          reviewEveryMs: ADVISE.reviewIntervalMs,
          horizonMs: ADVISE.horizonMs,
          targetWaitMs: ADVISE.targetWaitMs,
          closeBelowWaitMs: ADVISE.closeWhenWaitMs,
        },
        lanesChangedAtMs: read.changed,
      });
      expect(d).toMatchObject({ by: 'GATEFLOW', action: advice?.action, lanes: advice?.lanes });
    }
    for (let i = 1; i < decided.length; i++) {
      expect((decided[i]?.atMs ?? 0) - (decided[i - 1]?.atMs ?? 0)).toBeGreaterThanOrEqual(
        15 * MIN,
      );
    }
    // The console's day through simulatePolicy is the same run.
    expect(
      simulatePolicy(population, advised, { classification: job.classification }, job.profile),
    ).toEqual(run);
    expect(() =>
      simulatePolicy(population, advised, { classification: job.classification }, undefined),
    ).toThrow(/profile/);
  });

  it("reads the lanes' rate of the plan on a day slower than planned (S22.4, ADR-059)", () => {
    const advised = policy('fifo-manual@advise');
    const planned = tsf.checkpoint.serviceTimeMeanSeconds.value;
    const slower = applySetting(
      { scenario: tsf, policies: [advised] },
      { parameter: 'actualServiceTimeMeanSeconds', value: planned + 4 },
      advised.id,
    ).scenario;
    const view = new LiveView(generatePopulation(slower, 1));
    // The console's forecast reads the checkpoint's settings, made for the plan, as it does live.
    expect(view.stateNow(6 * 60 * MIN).ratePerLanePerHour).toBe(3600 / planned);
  });

  it("measures the lanes' throughput from the day as the log gives it (S22.5)", () => {
    // A TSF-like day screening 4 s a person slower than its plan and settings assume.
    const advised = policy('fifo-manual@advise-measured');
    const rule = advised.lanes?.kind === 'advise' ? advised.lanes.measuredThroughput : undefined;
    if (rule === undefined) throw new Error('no measured throughput');
    const planned = tsf.checkpoint.serviceTimeMeanSeconds.value;
    const slower = applySetting(
      { scenario: tsf, policies: [advised] },
      { parameter: 'actualServiceTimeMeanSeconds', value: planned + 4 },
      advised.id,
    ).scenario;
    const job = planBacktest(slower, advised, arrivalClassification([advised]));
    const population = dayPopulation(slower, job.forecast, 1);
    const asked: LiveState[] = [];
    const gateflow = simulatedConsole(job.profile, population, (state) => asked.push(state));
    const events: DayEvent[] = [];
    simulateCheckpoint(population, advised, {
      classification: job.classification,
      laneAdvisor: gateflow.advisor,
      observer: (event) => {
        gateflow.observe(event);
        events.push(event);
      },
    });
    const view = new LiveView(population);
    for (const event of events) view.observe(event);
    // A window's minutes are what replaying the day up to each minute's start gives.
    const replayed = (nowMs: number) =>
      Array.from({ length: rule.windowMinutes }, (_, m) => {
        const from = nowMs - (rule.windowMinutes - m) * MIN;
        const until = new LiveView(population);
        let lanes = 0;
        let admitted = 0;
        for (const e of events) {
          if (e.atMs <= from) {
            until.observe(e);
            if (e.type === 'LANES') lanes = e.open;
          }
          if (
            e.type === 'QUEUE' &&
            e.event.type === 'ADMITTED' &&
            e.atMs >= from &&
            e.atMs < from + MIN
          ) {
            admitted += population.passengers[e.party]?.partySize ?? 0;
          }
        }
        return { backlog: until.stateNow(from).backlog, lanes, admitted };
      });
    const busy = asked.filter((s) => s.backlog >= 20).map((s) => s.nowMs);
    expect(busy.length).toBeGreaterThan(3);
    for (const nowMs of [busy[0], busy[Math.floor(busy.length / 2)], busy.at(-1)] as number[]) {
      expect(view.minutesBefore(nowMs, rule.windowMinutes)).toEqual(replayed(nowMs));
    }
    // The console read the measure where there was one, else the settings, made for the plan.
    const settings = 3600 / planned;
    const truth = 3600 / (planned + 4);
    const errors: number[] = [];
    for (const state of asked) {
      const measured = measureThroughput(view.minutesBefore(state.nowMs, rule.windowMinutes), rule);
      expect(state.ratePerLanePerHour).toBe(consoleRate(measured, settings));
      if (measured.ratePerLanePerHour !== null) errors.push(state.ratePerLanePerHour / truth - 1);
    }
    // When it measures, it sees the day as it is: within a few percent of the day's throughput (on
    // 8 VCE-like days the measure's median error was under 1%, 8 in 10 within 4%).
    expect(errors.length).toBeGreaterThan(10);
    errors.sort((a, b) => a - b);
    expect(Math.abs(errors[Math.floor(errors.length / 2)] ?? 1)).toBeLessThan(0.05);
  });

  it('runs in experiments: deterministic, compared with the plan, the supervisor and S8', () => {
    const policies = [
      'fifo-manual',
      'fifo-manual@reactive',
      'fifo-manual@predict',
      'fifo-manual@advise',
      'fifo-manual@advise-measured',
    ].map(policy);
    const config = {
      scenario: tsf,
      policies,
      baselinePolicyId: 'fifo-manual',
      comparisons: [
        { candidateId: 'fifo-manual@advise', referenceId: 'fifo-manual' },
        { candidateId: 'fifo-manual@advise', referenceId: 'fifo-manual@reactive' },
        { candidateId: 'fifo-manual@advise', referenceId: 'fifo-manual@predict' },
      ],
      seeds: [1, 2],
      classification: arrivalClassification(policies),
      bootstrap: { ...DEFAULT_BOOTSTRAP, resamples: 100 },
    };
    const { job } = planExperiment(config);
    expect(job.profile?.days).toHaveLength(50);
    expect(job.forecast).toBeDefined();
    // A day is the same whenever and wherever it is computed.
    expect(runDay(job, 2)).toEqual(runDay(job, 2));
    const result = runExperiment(config);
    const day = result.perSeed[0]?.policies['fifo-manual@advise'];
    expect(day?.laneDecisions).toBeGreaterThan(0);
    expect(day?.lanesOpened).toBeGreaterThan(0);
    // The results name the forecast the console's rule read.
    const doc = buildResults(result, {
      generator: { name: 'test', version: '0' },
      commit: 'abc',
      scenarioHash: 'sha256:x',
    });
    expect(doc.manifest.versions.forecast).toBe(
      `${FORECAST_VERSION}, calibrated on ${LIBRARY_CALIBRATION_SOURCE}`,
    );
    // The report tells the console on the settings from the console on the measure (S22.5).
    const report = renderReport(doc);
    expect(report).toContain(
      "`@advise-measured`, S22.5, with the lanes' throughput measured from the day instead of the checkpoint's settings",
    );
    expect(report).toContain(
      "reads the lanes' throughput measured over the last 30 min (the minutes with at least 4 people per open lane not yet admitted, once 15 of them and 30 people; else the settings')",
    );
  });
});
