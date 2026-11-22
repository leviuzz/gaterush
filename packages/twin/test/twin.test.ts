import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, isAbsolute, join } from 'node:path';
import type { DayConfig } from '@gateflow/operations';
import {
  FIFO_MANUAL_POLICY,
  PRIORITY_V3_POLICY,
  VIRTUAL_FIFO_POLICY,
  withLaneMode,
} from '@gateflow/queue-core';
import type { Policy, QueueEvent } from '@gateflow/queue-core';
import { applyScenarioSettings } from '@gateflow/sim-metrics';
import { simulateCheckpoint } from '@gateflow/sim-model';
import { parseScenarioText } from '@gateflow/sim-scenarios';
import type { Scenario } from '@gateflow/sim-scenarios';
import { describe, expect, it } from 'vitest';
import {
  TwinError,
  TwinScript,
  expectedCallNumbers,
  playInMemory,
  simulatedCalls,
  twinDay,
  twinSettings,
} from '../src';
import type { TwinDay } from '../src';

/*
 * The digital twin in memory (S18): library days played on an operations day, as the API plays
 * them on the database. The acceptance of S18 at the level of the pure packages: the same calls,
 * in the same order, and the same events as the simulator's own queue.
 */

const SCENARIOS = join(import.meta.dirname, '../../../scenarios');
/** Midnight in Rome on 2026-11-23, in epoch milliseconds: the start of a virtual day. */
const MIDNIGHT = Date.UTC(2026, 10, 22, 23, 0, 0);
const MIN = 60_000;

function scenario(name: string): Scenario {
  const file = join(SCENARIOS, name);
  return parseScenarioText(readFileSync(file, 'utf8'), 'yaml', {
    read: (path) => readFileSync(isAbsolute(path) ? path : join(dirname(file), path), 'utf8'),
    sha256: (content) => createHash('sha256').update(content).digest('hex'),
  });
}

const ids = {
  ticketId: () => randomUUID(),
  opaqueRef: () => randomUUID().replaceAll('-', ''),
  flightId: () => randomUUID(),
};

/** The day the API would open for a twin checkpoint, from its settings. */
function configOf(day: TwinDay, overrides: Partial<DayConfig> = {}): DayConfig {
  const settings = twinSettings(day);
  return {
    checkpointId: 'twin-1',
    serviceDay: '2026-11-23',
    ticketPrefix: 'T',
    policy: settings.policy,
    classification: day.classification,
    lanesOpen: settings.lanesOpen,
    ratePerLanePerHour: settings.ratePerLanePerHour,
    processEstimateMs: settings.processEstimateMs,
    ...overrides,
  };
}

/** An event with every instant moved by `shiftMs`. */
function moved(event: QueueEvent, shiftMs: number): QueueEvent {
  const atMs = event.atMs + shiftMs;
  if (event.type !== 'COMMITTED' || event.assessment === null) return { ...event, atMs };
  const latest = event.assessment.latestCallMs;
  return {
    ...event,
    atMs,
    assessment: { ...event.assessment, latestCallMs: latest === null ? null : latest + shiftMs },
  };
}

/** The simulator's queue events of the day, with the live ids of the script's tickets. */
function simulatedEvents(day: TwinDay, script: TwinScript): QueueEvent[] {
  const events: QueueEvent[] = [];
  simulateCheckpoint(day.population, day.policy, {
    classification: day.classification,
    listener: (e) => events.push(e),
  });
  const live = (simId: string): string => {
    const id = script.liveTicketId(simId);
    if (id === undefined) throw new Error(`no live ticket for ${simId}`);
    return id;
  };
  return events.map((e) => {
    if (!('ticketId' in e)) return e;
    // The engine's assessment of a commitment names its ticket too.
    if (e.type === 'COMMITTED' && e.assessment !== null) {
      return {
        ...e,
        ticketId: live(e.ticketId),
        assessment: { ...e.assessment, ticketId: live(e.assessment.ticketId) },
      };
    }
    return { ...e, ticketId: live(e.ticketId) };
  });
}

const LIBRARY: readonly { readonly file: string; readonly seeds: readonly number[] }[] = [
  { file: 'single-checkpoint-demo.yaml', seeds: [1, 2] },
  // Feed messages and outages: the feed's knowledge reaches the tickets.
  { file: 'single-checkpoint-disrupted.yaml', seeds: [1, 3] },
  // Lanes opening and closing through the day.
  { file: 'single-checkpoint-staffed.yaml', seeds: [1] },
  { file: 'mx-like-transfer-hub.yaml', seeds: [1, 2] },
  { file: 'tsf-like-peak-day.yaml', seeds: [1] },
  // The busiest disrupted day of the library: about 15,000 parties.
  { file: 'vce-like-disrupted-day.yaml', seeds: [1] },
];

describe('the digital twin in memory (S18)', () => {
  for (const { file, seeds } of LIBRARY) {
    for (const seed of seeds) {
      for (const base of [PRIORITY_V3_POLICY, VIRTUAL_FIFO_POLICY]) {
        it(`calls in the simulator's order: ${file}, seed ${String(seed)}, ${base.id}`, () => {
          const s = scenario(file);
          const [policy] = applyScenarioSettings([base], s) as [Policy];
          const day = twinDay(s, seed, policy);
          const script = new TwinScript(day, { originMs: MIDNIGHT, ids });
          const played = playInMemory(script, configOf(day));
          expect(played.divergence).toBeNull();
          expect(played.applied).toBe(script.steps.length);
          // Every call of the simulator, in its order.
          const calls = simulatedCalls(day);
          expect(played.calls).toBe(calls.length);
          expect(script.expectedCalls()).toEqual(calls.map((c) => script.liveTicketId(c.ticketId)));
          // The numbers called, as the displays show them: the live day's, computed from the tape.
          const live = played.events.filter((e): e is QueueEvent => e.type !== 'DAY_OPENED');
          const numberOf = new Map<string, string>();
          // The live day numbers its tickets as it issues them.
          for (const e of live) {
            if (e.type === 'ISSUED') {
              numberOf.set(e.ticketId, `T${String(numberOf.size + 1).padStart(3, '0')}`);
            }
          }
          expect(
            live.filter((e) => e.type === 'CALLED').map((e) => numberOf.get(e.ticketId)),
          ).toEqual(expectedCallNumbers(day, 'T'));
          // The live day's events are the simulator's queue's, every instant moved to the day.
          expect(live.map((e) => moved(e, -MIDNIGHT))).toEqual(simulatedEvents(day, script));
        });
      }
    }
  }

  it('sends what the live system needs: the feed, the lanes, the first presentation', () => {
    const disrupted = twinDay(scenario('single-checkpoint-disrupted.yaml'), 1, PRIORITY_V3_POLICY);
    const staffed = twinDay(scenario('single-checkpoint-staffed.yaml'), 1, PRIORITY_V3_POLICY);
    const kinds = (day: TwinDay) => {
      const script = new TwinScript(day, { originMs: MIDNIGHT, ids });
      return script.steps.map((s) => s.command);
    };
    const commands = [...kinds(disrupted), ...kinds(staffed)];
    expect(commands.filter((c) => c?.type === 'UPDATE_FLIGHT').length).toBeGreaterThan(50);
    expect(commands.filter((c) => c?.type === 'SET_LANES').length).toBeGreaterThan(5);
    // A ticket issued again after an expiry keeps the first presentation, before the issue.
    const again = commands.filter(
      (c) => c?.type === 'ISSUE_TICKET' && c.presentedAtMs !== undefined,
    );
    expect(again.length).toBeGreaterThan(0);
    // Every ticket comes from the twin, with no boarding pass.
    for (const c of commands) {
      if (c?.type === 'ISSUE_TICKET') expect(c).toMatchObject({ source: 'TWIN', dedupKey: null });
    }
  });

  it('stops at the first call that differs, and says which', () => {
    const s = scenario('single-checkpoint-disrupted.yaml');
    const day = twinDay(s, 1, PRIORITY_V3_POLICY);
    const script = new TwinScript(day, { originMs: MIDNIGHT, ids });
    // The live checkpoint runs another policy: the order of arrival.
    const played = playInMemory(script, configOf(day, { policy: VIRTUAL_FIFO_POLICY }));
    expect(played.divergence).not.toBeNull();
    const divergence = played.divergence!;
    expect(divergence.operation).toBe('CALL_NEXT');
    expect(divergence.expected).not.toBe(divergence.actual);
    expect(played.applied).toBeLessThan(script.steps.length);
    expect(divergence.atMs).toBe(script.steps[played.applied + 1]?.atMs ?? divergence.atMs);
  });

  it('plays the day up to a time, and moves every instant by the origin', () => {
    const day = twinDay(scenario('single-checkpoint-demo.yaml'), 1, PRIORITY_V3_POLICY);
    const untilMs = 9 * 60 * MIN;
    const script = new TwinScript(day, { originMs: MIDNIGHT, ids, untilMs });
    expect(script.steps.every((s) => s.entry.atMs <= untilMs)).toBe(true);
    expect(script.steps.every((s) => s.atMs === MIDNIGHT + s.entry.atMs)).toBe(true);
    const calls = simulatedCalls(day).filter((c) => c.atMs <= untilMs);
    expect(script.expectedCalls().length).toBe(calls.length);
    expect(playInMemory(script, configOf(day)).calls).toBe(calls.length);
    // The flights of the virtual day.
    const first = script.flights[0]!;
    const flight = day.population.flights[0]!;
    expect(first).toMatchObject({ simId: flight.id, stdMs: MIDNIGHT + flight.stdMs });
  });

  it('refuses what the live system does not run, and a day before its midnight', () => {
    const s = scenario('single-checkpoint-demo.yaml');
    expect(() => twinDay(s, 1, FIFO_MANUAL_POLICY)).toThrow(TwinError);
    expect(() => twinDay(s, 1, withLaneMode(PRIORITY_V3_POLICY, 'reactive'))).toThrow(TwinError);
    const day = twinDay(s, 1, PRIORITY_V3_POLICY);
    expect(() => new TwinScript(day, { originMs: -1, ids })).toThrow(TwinError);
    expect(() => new TwinScript(day, { originMs: 0.5, ids })).toThrow(TwinError);
  });
});
