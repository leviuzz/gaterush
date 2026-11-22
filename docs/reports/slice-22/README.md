# Slice S22.3 reports (SIMULATED, synthetic data)

Reports produced by `gateflow-sim` 0.14.0 from a clean checkout of commit
`529b2323a5489dd0be5f8adeb13d2d64f946fad5` (S22.3), as recorded in each manifest.

They are **simulated results on synthetic assumptions**, not measurements, and must not be
presented as evidence of operational performance.

S22 gave the supervisor's console GateFlow's recommendations of lanes (ADR-056). S22.3 measures
them in the simulator (ADR-057): a third lane mode, **`@advise`**, asks the console's own rule at
every review of the simulated day, with what the live system would know then (the people who took
a number in the last hour, the people not yet admitted, the lanes open and when they last
changed). The rule is the console's, with its numbers: every 5 minutes, the forecast of the next
hour (200 paths from 50 other simulated days of the scenario, the library's calibration); open
the fewest lanes that keep the median wait of a party arriving within 10 minutes, counting the
time staff need to open one; close a lane beyond the plan when one fewer keeps it below 2 minutes;
never two recommendations within 15 minutes.

The duty manager is S8's: decides at once and follows 4 recommendations out of 5 (drawn day by
day); a lane takes about 10 minutes to open (5 to 20 on most days) and stays open at least 30;
the staff on call and the lanes the checkpoint has bound what opens (VCE-like: 14 lanes, a roster
of at most 12, 2 extra; TSF-like: 6 lanes, roster 5, 1 extra; MX-like hub: 5 lanes, roster 4, 1
extra). All of this is synthetic, in [airports/](../../../airports/README.md).

The policies are those of S8 (whose results these runs give again, day by day) and two more:
- `fifo-manual` (A', today's practice with staff calls) and `priority-v3` (GateFlow's priority),
  each with the plan only;
- `@reactive`, today's supervisor: opens a lane when the queue shows more than 10 minutes of wait
  and closes one below 2, decisions always carried out;
- `@predict`, S8's rule: a projection of the queue over 45 minutes from a forecast of arrivals;
- `@advise`, the console's rule (S22).

The calls do not change with the lane mode, so `X@advise` compared with `X` is what the console's
lanes alone buy; `priority-v3@advise` compared with `fifo-manual@reactive` is GateFlow as a whole
(priority and the console's lanes) against today's practice.

## Experiments (200 simulated days each)

Policies: `fifo` (A), `fifo-manual` (A'), `fifo-manual@reactive`, `fifo-manual@predict`,
`fifo-manual@advise`, `priority-v3`, `priority-v3@predict` and `priority-v3@advise`.

| Scenario | What it represents | Report | Page with charts | Results |
|---|---|---|---|---|
| `vce-like-normal-day` | Departures checkpoint of a VCE-like airport, average day | [report.md](vce-like-normal-day/report.md) | [report.html](vce-like-normal-day/report.html) | [results.json](vce-like-normal-day/results.json) |
| `vce-like-peak-day` | The same checkpoint on a summer peak day | [report.md](vce-like-peak-day/report.md) | [report.html](vce-like-peak-day/report.html) | [results.json](vce-like-peak-day/results.json) |
| `vce-like-disrupted-day` | The peak day with delays, gate changes, lane and feed outages | [report.md](vce-like-disrupted-day/report.md) | [report.html](vce-like-disrupted-day/report.html) | [results.json](vce-like-disrupted-day/results.json) |
| `tsf-like-peak-day` | Low-cost base, one morning bank of based aircraft | [report.md](tsf-like-peak-day/report.md) | [report.html](tsf-like-peak-day/report.html) | [results.json](tsf-like-peak-day/results.json) |
| `mx-like-transfer-hub` | Transfer security of a hub: connecting passengers in six banks | [report.md](mx-like-transfer-hub/report.md) | [report.html](mx-like-transfer-hub/report.html) | [results.json](mx-like-transfer-hub/results.json) |

The six policies of S8 give exactly S8's outcomes, day by day (missed flights, waits, extra
lane-hours, decisions and lanes opened compared on the 200 days of the five scenarios: no
difference).

## Sensitivity sweeps: recommendations followed or not (200 simulated days per point)

| Sweep | Report | Page with charts | Results |
|---|---|---|---|
| `tsf-like-peak-console`: the console's lanes on the TSF-like peak day as the share of recommendations followed varies | [sweep.md](sweeps/tsf-like-peak-console/sweep.md) | [sweep.html](sweeps/tsf-like-peak-console/sweep.html) | [sweep.json](sweeps/tsf-like-peak-console/sweep.json) |
| `mx-like-hub-console`: the same at the MX-like transfer hub | [sweep.md](sweeps/mx-like-hub-console/sweep.md) | [sweep.html](sweeps/mx-like-hub-console/sweep.html) | [sweep.json](sweeps/mx-like-hub-console/sweep.json) |

## Results at a glance

### Missed flights per day

| Scenario | People per day | A' | A' + supervisor | A' + S8 lanes | A' + console | v3 | v3 + S8 lanes | v3 + console | Extra lane-hours per day: supervisor / S8 / console |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| VCE-like normal day | 16,623 | 10.9 | 10.9 | 10.9 | 10.9 | 10.9 | 10.9 | 10.9 | 0.0 / 0.0 / 0.0 |
| VCE-like peak day | 21,792 | 18.8 | 18.7 | 18.7 | 18.7 | 18.6 | 18.4 | 18.5 | 0.1 / 0.3 / 0.1 |
| VCE-like disrupted day | 21,792 | 14.3 | 14.0 | 13.9 | 13.9 | 14.1 | 13.6 | 13.8 | 0.2 / 0.5 / 0.5 |
| TSF-like peak day | 5,981 | 0.0 | 0.0 | 0.0 | 0.0 | 2.3 | 0.1 | 0.1 | 1.1 / 1.3 / 1.7 |
| MX-like transfer hub | 4,473 | 96.7 | 81.5 | 64.5 | 63.8 | 87.9 | 61.8 | 63.5 | 0.6 / 1.8 / 2.3 |

### What the console's recommendations change

Means per day with 95% confidence intervals, passenger by passenger on the same days. "Console vs
S8's rule" compares the two GateFlow rules on the same calls (A'); "GateFlow as a whole" is
`priority-v3@advise` against today's practice, `fifo-manual@reactive`.

| Scenario | Comparison | Extra lane-hours | Net flights saved | Change in mean time to screening (min) |
|---|---|---:|---:|---:|
| VCE-like normal day | Console vs supervisor (A') | 0.0 [0.0, 0.0] | 0.0 [0.0, 0.0] | -0.00 [-0.00, 0.00] |
|  | Console vs S8's rule (A') | 0.0 [-0.0, 0.0] | 0.0 [0.0, 0.0] | +0.00 [0.00, 0.00] |
|  | GateFlow as a whole vs today | 0.0 [0.0, 0.0] | 0.0 [-0.1, 0.1] | +0.00 [-0.00, 0.00] |
| VCE-like peak day | Console vs supervisor (A') | 0.0 [0.0, 0.1] | 0.0 [-0.0, 0.0] | -0.02 [-0.03, -0.01] |
|  | Console vs S8's rule (A') | -0.1 [-0.2, -0.1] | -0.1 [-0.1, -0.0] | +0.06 [0.04, 0.08] |
|  | GateFlow as a whole vs today | 0.0 [-0.1, -0.0] | +0.2 [-0.1, 0.6] | +0.01 [0.00, 0.02] |
| VCE-like disrupted day | Console vs supervisor (A') | +0.3 [0.2, 0.4] | +0.1 [0.0, 0.2] | -0.07 [-0.10, -0.05] |
|  | Console vs S8's rule (A') | 0.0 [-0.1, 0.1] | 0.0 [-0.1, 0.0] | +0.04 [0.02, 0.07] |
|  | GateFlow as a whole vs today | +0.1 [0.0, 0.2] | +0.2 [-0.1, 0.6] | -0.03 [-0.05, -0.01] |
| TSF-like peak day | Console vs supervisor (A') | +0.7 [0.6, 0.7] | 0.0 [0.0, 0.0] | -0.93 [-0.96, -0.90] |
|  | Console vs S8's rule (A') | +0.4 [0.4, 0.5] | 0.0 [0.0, 0.0] | -0.14 [-0.16, -0.12] |
|  | GateFlow as a whole vs today | +0.5 [0.4, 0.5] | -0.1 [-0.1, -0.0] | -0.86 [-0.89, -0.83] |
| MX-like transfer hub | Console vs supervisor (A') | +1.8 [1.6, 1.9] | +17.7 [16.0, 19.4] | -0.57 [-0.61, -0.52] |
|  | Console vs S8's rule (A') | +0.5 [0.4, 0.6] | +0.7 [0.0, 1.4] | -0.06 [-0.09, -0.03] |
|  | GateFlow as a whole vs today | +1.5 [1.3, 1.6] | +18.0 [16.1, 19.9] | -0.36 [-0.41, -0.31] |

### Waits (minutes from arrival to the start of screening, mean and P90 per day)

| Scenario | A' mean / P90 | A' + supervisor | A' + S8 lanes | A' + console | v3 + console |
|---|---:|---:|---:|---:|---:|
| VCE-like normal day | 0.3 / 0.8 | 0.3 / 0.8 | 0.3 / 0.8 | 0.3 / 0.8 | 0.3 / 0.8 |
| VCE-like peak day | 1.0 / 4.4 | 1.0 / 4.3 | 0.9 / 3.9 | 1.0 / 4.2 | 1.0 / 4.2 |
| VCE-like disrupted day | 1.1 / 4.7 | 1.0 / 4.5 | 0.9 / 3.9 | 1.0 / 4.1 | 1.0 / 4.2 |
| TSF-like peak day | 3.5 / 14.9 | 1.9 / 8.3 | 1.1 / 3.9 | 0.9 / 3.3 | 1.0 / 3.6 |
| MX-like transfer hub | 2.0 / 6.8 | 1.7 / 5.4 | 1.2 / 3.7 | 1.1 / 3.5 | 1.3 / 4.1 |

### What one extra lane-hour buys

Compared with the same policy on the plan only; totals over the 200 days divided by the extra
lane-hours, with 95% bootstrap intervals. Rows with fewer than 0.05 extra lane-hours a day are
left out.

| Scenario | Policy | Extra lane-hours per day | Waiting saved per extra lane-hour (person-hours) | Net flights saved per extra lane-hour |
|---|---|---:|---:|---:|
| VCE-like peak day | A' + supervisor | 0.1 | 85 [69, 101] | 0.7 [0.2, 1.4] |
|  | A' + S8 lanes | 0.3 | 133 [118, 147] | 0.4 [0.2, 0.6] |
|  | A' + console | 0.1 | 104 [86, 125] | 0.4 [0.2, 0.7] |
| VCE-like disrupted day | A' + supervisor | 0.2 | 75 [57, 91] | 1.6 [0.7, 2.7] |
|  | A' + S8 lanes | 0.5 | 108 [94, 121] | 0.9 [0.5, 1.4] |
|  | A' + console | 0.5 | 83 [69, 98] | 0.8 [0.4, 1.3] |
|  | v3 + console | 0.3 | 86 [65, 109] | 0.9 [0.6, 1.3] |
| TSF-like peak day | A' + supervisor | 1.1 | 152 [148, 156] | 0.0 [0.0, 0.1] |
|  | A' + S8 lanes | 1.3 | 182 [177, 188] | 0.0 [0.0, 0.1] |
|  | A' + console | 1.7 | 145 [140, 150] | 0.0 [0.0, 0.0] |
|  | v3 + console | 1.5 | 160 [155, 166] | 1.4 [1.0, 2.0] |
| MX-like transfer hub | A' + supervisor | 0.6 | 45 [39, 51] | 26.7 [22.2, 32.3] |
|  | A' + S8 lanes | 1.8 | 35 [32, 37] | 17.7 [15.8, 19.9] |
|  | A' + console | 2.3 | 29 [27, 31] | 14.1 [12.6, 15.8] |
|  | v3 + console | 2.0 | 26 [24, 28] | 12.0 [10.3, 13.9] |

### Recommendations per day (A')

| Scenario | S8's rule: recommended (followed) | lanes opened | Console: recommended (followed) | lanes opened |
|---|---:|---:|---:|---:|
| VCE-like normal day | 0.0 (0.0) | 0.0 | 0.0 (0.0) | 0.0 |
| VCE-like peak day | 0.8 (0.6) | 0.3 | 0.3 (0.2) | 0.1 |
| VCE-like disrupted day | 1.6 (1.2) | 0.7 | 1.0 (0.8) | 0.4 |
| TSF-like peak day | 2.7 (2.1) | 1.1 | 2.8 (2.2) | 1.1 |
| MX-like transfer hub | 6.6 (5.4) | 2.8 | 5.2 (4.2) | 2.4 |

### Followed or not (sweeps)

Today's practice with staff calls (A') and the console's lanes, as the share of recommendations
the duty manager follows varies (none followed is the plan only); the supervisor's lanes do not
depend on it.

| Share followed | MX-like hub: missed per day | net saved vs supervisor | vs plan only | TSF-like: mean wait change vs supervisor (min) | vs plan only (min) | Extra lane-hours: MX / TSF |
|---|---:|---:|---:|---:|---:|---:|
| 0 | 96.7 | -15.2 [-18.7, -12.2] | 0.0 | +1.61 [1.53, 1.68] | 0.00 | 0.0 / 0.0 |
| 0.5 | 68.5 | +12.9 [10.9, 15.0] | +28.1 [24.7, 32.6] | -0.79 [-0.84, -0.73] | -2.40 [-2.50, -2.30] | 2.3 / 1.9 |
| **0.8 (base)** | 63.8 | +17.7 [15.9, 19.4] | +32.9 [29.2, 37.0] | -0.93 [-0.96, -0.90] | -2.54 [-2.63, -2.44] | 2.3 / 1.7 |
| 1 | 62.2 | +19.3 [17.4, 21.1] | +34.5 [30.9, 38.5] | -0.94 [-0.97, -0.92] | -2.55 [-2.65, -2.45] | 2.3 / 1.7 |

The supervisor misses 81.5 flights a day at the hub with 0.6 extra lane-hours, and A' with the
plan only 96.7; at the TSF-like base nobody misses a flight with A' and the gain is in the wait.

## What it says

- **Where queues build fast, the console's recommendations pay** (MX-like hub: connecting
  passengers in banks). Followed 4 times in 5, they save 17.7 flights a day more than today's
  supervisor, for 1.8 extra lane-hours; GateFlow as a whole (priority and the console's lanes)
  saves 18.0 a day against today's practice. At a low-cost base (TSF-like) nobody misses a flight
  with A', but the mean wait halves against the supervisor (1.9 to 0.9 minutes; P90 8.3 to 3.3).
- **Half followed is most of it:** at the hub, following one recommendation in two already saves
  12.9 flights a day more than the supervisor; at the TSF-like base it saves 2.40 minutes of wait
  a person against the plan only, of the 2.55 saved when all are followed.
- **The console's rule is as good as S8's, with lanes spent differently:** at the hub +0.7
  [0.0, 1.4] flights a day for +0.5 lane-hours; at the TSF-like base 0.14 minutes less wait for
  +0.4 lane-hours; on the VCE-like peak day it recommends less (0.3 recommendations a day against
  0.8) and the wait is 0.06 minutes longer. Its lanes stay open longer (at the hub about an hour
  each, against 40 minutes for S8's): an extra lane-hour buys less than one of the supervisor's,
  who opens few lanes once the queue is long, but together they buy more.
- **On the VCE-like days it changes little**, as S8's rule: the roster is made for the day and
  the queue rarely asks for an extra lane (none on the normal day).
- Every number is SIMULATED on synthetic airports: what an airport's own days give is for its
  data (M5).
