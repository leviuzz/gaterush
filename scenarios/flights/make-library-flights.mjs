#!/usr/bin/env node
// Writes the synthetic flight lists of the scenario library (format gateflow.flights/1).
//
//   node scenarios/flights/make-library-flights.mjs           write the CSV files next to this script
//   node scenarios/flights/make-library-flights.mjs --check   fail if a committed file differs
//
// The lists are SYNTHETIC. Their size follows public annual traffic where a scenario says so
// (see each day below and scenarios/flights/README.md); flight identifiers, times, aircraft and
// passenger counts are invented. No third-party schedule data is used.

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Small deterministic generator (mulberry32): the same lists on every machine. */
function random(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function draw(next, mix) {
  const total = mix.reduce((sum, [, share]) => sum + share, 0);
  let u = next() * total;
  for (const [item, share] of mix) {
    u -= share;
    if (u < 0) return item;
  }
  return mix[mix.length - 1][0];
}

const clock = (minute) =>
  `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;

// Short- and medium-haul mix of a VCE-like airport: low-cost and network carriers, Schengen and
// non-Schengen. Weights, not statistics.
const VCE_MIX = [
  ['A319', 0.12],
  ['A320', 0.24],
  ['A20N', 0.1],
  ['A321', 0.08],
  ['A21N', 0.1],
  ['B738', 0.12],
  ['E190', 0.1],
  ['E195', 0.04],
  ['BCS3', 0.1],
];

// The days of the library. `hours` are short- and medium-haul departures per hour, spread evenly
// within the hour; `fixed` are departures at a given time (long haul to the non-Schengen zone C).
const DAYS = [
  {
    file: 'vce-like-normal-day.csv',
    title: 'VCE-like departures, normal day (synthetic)',
    seed: 1101,
    mix: VCE_MIX,
    hours: {
      5: 1,
      6: 13,
      7: 10,
      8: 8,
      9: 7,
      10: 7,
      11: 7,
      12: 7,
      13: 6,
      14: 6,
      15: 6,
      16: 6,
      17: 7,
      18: 6,
      19: 6,
      20: 5,
      21: 3,
      22: 1,
    },
    fixed: [
      ['10:55', 'B763', 'C'],
      ['12:20', 'B789', 'C'],
      ['15:40', 'B77W', 'C'],
      ['21:30', 'A359', 'C'],
    ],
  },
  {
    file: 'vce-like-peak-day.csv',
    title: 'VCE-like departures, peak day (synthetic)',
    seed: 1102,
    mix: VCE_MIX,
    hours: {
      5: 2,
      6: 15,
      7: 12,
      8: 9,
      9: 8,
      10: 8,
      11: 8,
      12: 8,
      13: 7,
      14: 7,
      15: 7,
      16: 7,
      17: 8,
      18: 7,
      19: 7,
      20: 6,
      21: 3,
      22: 1,
    },
    fixed: [
      ['09:50', 'B763', 'C'],
      ['10:35', 'B763', 'C'],
      ['11:15', 'B789', 'C'],
      ['12:05', 'B788', 'C'],
      ['13:00', 'B763', 'C'],
      ['15:40', 'B77W', 'C'],
      ['16:25', 'A359', 'C'],
      ['21:30', 'B77W', 'C'],
    ],
  },
  {
    file: 'tsf-like-peak-day.csv',
    title: 'TSF-like departures, peak day (synthetic)',
    seed: 1103,
    // A low-cost base: mostly 737s, a few A320-family aircraft.
    mix: [
      ['B738', 0.55],
      ['B38M', 0.25],
      ['A320', 0.08],
      ['A21N', 0.12],
    ],
    hours: {
      6: 7,
      7: 2,
      8: 1,
      9: 3,
      10: 3,
      11: 2,
      12: 2,
      13: 2,
      14: 2,
      15: 3,
      16: 2,
      17: 2,
      18: 1,
      19: 1,
      20: 1,
    },
    fixed: [],
  },
  {
    file: 'mx-like-transfer-hub.csv',
    title: 'MX-like hub, domestic departures fed by international arrivals (synthetic)',
    seed: 1104,
    mix: [
      ['B738', 0.4],
      ['B38M', 0.3],
      ['E190', 0.25],
      ['B39M', 0.05],
    ],
    // Banks of a hub-and-spoke carrier: departures concentrated in waves.
    hours: { 7: 8, 8: 4, 10: 7, 11: 3, 13: 7, 14: 3, 16: 7, 17: 3, 19: 7, 20: 3, 22: 6 },
    fixed: [],
    // Only connecting passengers cross this checkpoint: their number per flight is given, a share
    // of the seats of the aircraft (two-class configurations, as in the scenario).
    connecting: { seats: { B738: 160, B38M: 166, B39M: 180, E190: 99 }, min: 0.25, max: 0.7 },
  },
];

function rowsOf(day) {
  const next = random(day.seed);
  const flights = [];
  for (const [hour, count] of Object.entries(day.hours)) {
    for (let i = 0; i < count; i++) {
      const minute = Number(hour) * 60 + Math.floor(((i + 0.5) * 60) / count);
      flights.push({ minute, aircraft: draw(next, day.mix), zone: '' });
    }
  }
  for (const [time, aircraft, zone] of day.fixed) {
    const [h, m] = time.split(':').map(Number);
    flights.push({ minute: h * 60 + m, aircraft, zone });
  }
  flights.sort((a, b) => a.minute - b.minute);
  return flights.map((f, i) => {
    const passengers =
      day.connecting === undefined
        ? ''
        : String(
            Math.round(
              day.connecting.seats[f.aircraft] *
                (day.connecting.min + next() * (day.connecting.max - day.connecting.min)),
            ),
          );
    return [
      `F${String(i + 1).padStart(3, '0')}`,
      clock(f.minute),
      f.aircraft,
      '',
      passengers,
      f.zone,
      '',
    ];
  });
}

function csvOf(day) {
  const lines = [
    `# gateflow.flights/1: ${day.title}`,
    '# SYNTHETIC: written by scenarios/flights/make-library-flights.mjs; no third-party schedule data.',
    'flight,std,aircraft,seats,passengers,gate_zone,destination',
    ...rowsOf(day).map((cells) => cells.join(',')),
  ];
  return `${lines.join('\n')}\n`;
}

const here = dirname(fileURLToPath(import.meta.url));
const check = process.argv.includes('--check');
let stale = 0;
for (const day of DAYS) {
  const path = join(here, day.file);
  const text = csvOf(day);
  if (check) {
    let current = '';
    try {
      current = readFileSync(path, 'utf8');
    } catch {
      // A missing file is stale.
    }
    if (current !== text) {
      stale++;
      console.error(`stale: ${day.file} (run node scenarios/flights/make-library-flights.mjs)`);
    }
  } else {
    writeFileSync(path, text);
    console.log(`written ${day.file}: ${text.split('\n').length - 4} flights`);
  }
}
if (stale > 0) process.exit(1);
