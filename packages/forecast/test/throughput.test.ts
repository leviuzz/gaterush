import { describe, expect, it } from 'vitest';
import { ForecastError, consoleRate, measureThroughput } from '../src';
import type { ThroughputMinute, ThroughputRule } from '../src';

/*
 * The lanes' throughput measured from the day (S22.5): the people admitted per lane in the busy
 * minutes of the window, once there are enough of them.
 */

const RULE: ThroughputRule = {
  windowMinutes: 30,
  busyPeoplePerLane: 4,
  minBusyMinutes: 15,
  minPeople: 30,
};

const minute = (backlog: number, lanes: number, admitted: number): ThroughputMinute => ({
  backlog,
  lanes,
  admitted,
});

describe("the lanes' measured throughput (S22.5)", () => {
  it('counts only the minutes that start with enough people per open lane', () => {
    // 20 busy minutes with 3 lanes screening 7 people a minute, and 10 quiet ones with fewer.
    const minutes = [
      ...Array.from({ length: 20 }, () => minute(40, 3, 7)),
      ...Array.from({ length: 10 }, () => minute(5, 3, 2)),
    ];
    const measured = measureThroughput(minutes, RULE);
    expect(measured.busyMinutes).toBe(20);
    expect(measured.people).toBe(140);
    // 140 people in 60 lane-minutes: 140 an hour per lane.
    expect(measured.ratePerLanePerHour).toBe(140);
    // The busy threshold is per open lane: 12 people for 3 lanes is busy, 11 is not.
    expect(
      measureThroughput([minute(12, 3, 7)], { ...RULE, minBusyMinutes: 1, minPeople: 1 })
        .busyMinutes,
    ).toBe(1);
    expect(
      measureThroughput([minute(11, 3, 7)], { ...RULE, minBusyMinutes: 1, minPeople: 1 })
        .busyMinutes,
    ).toBe(0);
    // A minute with no lane open says nothing.
    expect(
      measureThroughput([minute(50, 0, 0)], { ...RULE, minBusyMinutes: 1, minPeople: 1 })
        .busyMinutes,
    ).toBe(0);
  });

  it('says nothing until there are enough busy minutes and people', () => {
    const fewMinutes = Array.from({ length: 14 }, () => minute(40, 2, 5));
    expect(measureThroughput(fewMinutes, RULE)).toEqual({
      ratePerLanePerHour: null,
      busyMinutes: 14,
      people: 70,
    });
    const fewPeople = Array.from({ length: 20 }, () => minute(40, 1, 1));
    expect(measureThroughput(fewPeople, RULE).ratePerLanePerHour).toBeNull();
    expect(() => measureThroughput([], { ...RULE, busyPeoplePerLane: 0 })).toThrow(ForecastError);
    expect(() => measureThroughput([], { ...RULE, minBusyMinutes: 0 })).toThrow(ForecastError);
  });

  it("gives the console the measure, kept within half and one and a half times the settings'", () => {
    const of = (rate: number | null) => ({
      ratePerLanePerHour: rate,
      busyMinutes: 20,
      people: 100,
    });
    expect(consoleRate(of(null), 150)).toBe(150);
    expect(consoleRate(of(138.5), 150)).toBe(138.5);
    expect(consoleRate(of(40), 150)).toBe(75);
    expect(consoleRate(of(400), 150)).toBe(225);
  });
});
