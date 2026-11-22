# Slice S8 reports (SIMULATED, synthetic data)

Reports produced by `gateflow-sim` 0.8.0 from a clean checkout of commit
`b3c9f7e3b0fae64477fb45231fcb31cb4864982e`, as recorded in each manifest. A first run from
`b9429887` (the S8 code, before a fix to the HTML tables and the order of the sweep's comparisons)
gave the same results value by value.

They are **simulated results on synthetic assumptions**, not measurements, and must not be
presented as evidence of operational performance.

S8 adds **extra lanes during the day** (ADR-039). Each checkpoint of the library now has more
lanes than its roster plans, and staff on call who can open some of them:
- VCE-like: 14 lanes, a roster of at most 12, 2 extra lanes;
- TSF-like: 6 lanes, roster 5, 1 extra lane;
- MX-like hub: 5 lanes, roster 4, 1 extra lane.

A lane takes about 10 minutes to open after the decision (5 to 20 on most days) and then stays
open at least 30 minutes. All of this is synthetic, in [airports/](../../../airports/README.md).

The policies are run in three ways:
- **plan only**: no lane opens beyond the roster;
- **`@reactive`, today's supervisor**: every 5 minutes the supervisor looks at the wait the queue
  shows. A lane opens above 10 minutes and closes below 2. The decisions are always carried out;
- **`@predict`, GateFlow's recommendations**: every 5 minutes GateFlow projects the queue over the
  next 45 minutes from a forecast of arrivals, and recommends the fewest lanes that keep the wait
  below 10 minutes. The duty manager follows 4 recommendations out of 5. The forecast comes from
  other simulated days: it knows the flights, not the day's loads or disruptions.

The calls do not change with the lane mode, so `X@predict` compared with `X` is what the extra
lanes alone buy. The supervisor sees the exact wait, every 5 minutes: like A', it is an
idealised version of today's practice.

## Experiments (200 simulated days each)

Policies: `fifo` (A), `fifo-manual` (A'), `fifo-manual@reactive`, `fifo-manual@predict`,
`priority-v3` and `priority-v3@predict`.

| Scenario | What it represents | Report | Page with charts | Results |
|---|---|---|---|---|
| `vce-like-normal-day` | Departures checkpoint of a VCE-like airport, average day | [report.md](vce-like-normal-day/report.md) | [report.html](vce-like-normal-day/report.html) | [results.json](vce-like-normal-day/results.json) |
| `vce-like-peak-day` | The same checkpoint on a summer peak day | [report.md](vce-like-peak-day/report.md) | [report.html](vce-like-peak-day/report.html) | [results.json](vce-like-peak-day/results.json) |
| `vce-like-disrupted-day` | The peak day with delays, gate changes, lane and feed outages | [report.md](vce-like-disrupted-day/report.md) | [report.html](vce-like-disrupted-day/report.html) | [results.json](vce-like-disrupted-day/results.json) |
| `tsf-like-peak-day` | Low-cost base, one morning bank of based aircraft | [report.md](tsf-like-peak-day/report.md) | [report.html](tsf-like-peak-day/report.html) | [results.json](tsf-like-peak-day/results.json) |
| `mx-like-transfer-hub` | Transfer security of a hub: connecting passengers in six banks | [report.md](mx-like-transfer-hub/report.md) | [report.html](mx-like-transfer-hub/report.html) | [results.json](mx-like-transfer-hub/results.json) |

## Sensitivity sweep (200 simulated days per point)

| Sweep | Report | Page with charts | Results |
|---|---|---|---|
| `vce-like-peak-lanes`: extra lanes on the VCE-like peak day as the screening time, the roster, the lane outages, the staff on call, the time to open a lane, the share of recommendations followed and GateFlow's target wait vary | [sweep.md](sweeps/vce-like-peak-lanes/sweep.md) | [sweep.html](sweeps/vce-like-peak-lanes/sweep.html) | [sweep.json](sweeps/vce-like-peak-lanes/sweep.json) |

## Results at a glance

### Missed flights per day

| Scenario | People per day | A' | A' + supervisor | A' + GateFlow lanes | v3 | v3 + GateFlow lanes | Extra lane-hours per day: supervisor / GateFlow |
|---|---:|---:|---:|---:|---:|---:|---:|
| VCE-like normal day | 16,623 | 10.9 | 10.9 | 10.9 | 10.9 | 10.9 | 0.0 / 0.0 |
| VCE-like peak day | 21,792 | 18.8 | 18.7 | 18.7 | 18.6 | 18.4 | 0.1 / 0.3 |
| VCE-like disrupted day | 21,792 | 14.3 | 14.0 | 13.9 | 14.1 | 13.6 | 0.2 / 0.5 |
| TSF-like peak day | 5,981 | 0.0 | 0.0 | 0.0 | 2.3 | 0.1 | 1.1 / 1.3 |
| MX-like transfer hub | 4,473 | 96.7 | 81.5 | 64.5 | 87.9 | 61.8 | 0.6 / 1.8 |

The policies without a lane mode give the outcomes of S7, day by day. Only the risk classes on
arrival differ, on the disrupted day and at the hub: these runs classify with v3 (the first
priority policy listed), those of S7 with v2. The roster staffs 136 lane-hours on the VCE-like
normal day, 170 on its peak days, 63 at the TSF-like base and 49 at the hub.

### What GateFlow's lane recommendations change

Means per day with 95% confidence intervals, passenger by passenger on the same days.

| Scenario | Comparison | Extra lane-hours | Net flights saved | Change in mean time to screening (min) |
|---|---|---:|---:|---:|
| VCE-like peak day | GateFlow lanes vs supervisor (A') | +0.2 [0.1, 0.2] | +0.1 [0.0, 0.1] | -0.08 [-0.10, -0.06] |
| | GateFlow as a whole vs today (v3@predict vs A'@reactive) | +0.2 [0.1, 0.2] | +0.4 [0.0, 0.7] | -0.08 [-0.10, -0.06] |
| VCE-like disrupted day | GateFlow lanes vs supervisor (A') | +0.3 [0.3, 0.4] | +0.2 [0.1, 0.3] | -0.12 [-0.14, -0.09] |
| | GateFlow as a whole vs today | +0.3 [0.3, 0.4] | +0.4 [0.1, 0.8] | -0.11 [-0.14, -0.09] |
| TSF-like peak day | GateFlow lanes vs supervisor (A') | +0.3 [0.2, 0.3] | 0.0 [0.0, 0.0] | -0.79 [-0.82, -0.77] |
| | GateFlow as a whole vs today | +0.3 [0.2, 0.3] | **-0.1** [-0.2, -0.1] | -0.79 [-0.81, -0.76] |
| MX-like transfer hub | GateFlow lanes vs supervisor (A') | +1.2 [1.2, 1.3] | **+17.0** [15.3, 18.7] | -0.51 [-0.55, -0.47] |
| | GateFlow as a whole vs today | +1.3 [1.2, 1.3] | **+19.7** [17.8, 21.6] | -0.51 [-0.54, -0.47] |

On the VCE-like normal day nothing changes: the queue never asks for an extra lane (GateFlow
opens one on about one day in a hundred).

### What one extra lane-hour buys

Compared with the same policy on the plan only; totals over the 200 days divided by the extra
lane-hours, with 95% bootstrap intervals.

| Scenario | Policy | Extra lane-hours per day | Waiting saved per extra lane-hour (person-hours) | Net flights saved per extra lane-hour |
|---|---|---:|---:|---:|
| VCE-like peak day | A' + supervisor | 0.1 | 85 [69, 101] | 0.7 [0.2, 1.4] |
| | A' + GateFlow lanes | 0.3 | 133 [118, 147] | 0.4 [0.2, 0.6] |
| VCE-like disrupted day | A' + supervisor | 0.2 | 75 [57, 91] | 1.6 [0.7, 2.7] |
| | A' + GateFlow lanes | 0.5 | 108 [94, 121] | 0.9 [0.5, 1.4] |
| TSF-like peak day | A' + supervisor | 1.1 | 152 [148, 156] | 0.0 [0.0, 0.1] |
| | A' + GateFlow lanes | 1.3 | 182 [177, 188] | 0.0 [0.0, 0.1] |
| | v3 + GateFlow lanes | 1.3 | 183 [177, 188] | 1.7 [1.1, 2.3] |
| MX-like transfer hub | A' + supervisor | 0.6 | 45 [39, 51] | 26.7 [22.2, 32.3] |
| | A' + GateFlow lanes | 1.8 | 35 [32, 38] | 17.7 [15.8, 19.9] |
| | v3 + GateFlow lanes | 1.8 | 35 [33, 38] | 14.4 [12.6, 16.5] |

### When the day is harder than planned (sweep, 200 simulated days per point)

**VCE-like peak day** (`vce-like-peak-lanes`). The plan of the day is made for 24 s of screening
per person. Each line varies one assumption, all else equal; the base is in bold. The last five
lines start from a day of 26 s per person, 8% slower than planned.

| Assumption | Value | Missed per day: plan only / supervisor / GateFlow lanes | GateFlow lanes vs supervisor [95% CI] | Extra lane-hours per day: supervisor / GateFlow |
|---|---|---:|---:|---:|
| Screening time per person | **24 s** | 18.8 / 18.7 / 18.7 | +0.1 [0.0, 0.1] | 0.1 / 0.3 |
| | 25 s | 22.1 / 20.2 / 19.4 | +0.8 [0.6, 1.0] | 1.0 / 1.4 |
| | 26 s | 33.1 / 22.2 / 20.9 | +1.3 [1.1, 1.6] | 2.2 / 2.6 |
| | 27 s | 108.0 / 26.5 / 23.6 | +2.9 [2.5, 3.3] | 3.4 / 4.0 |
| Roster | one lane short | 84.9 / 24.9 / 21.4 | +3.5 [3.1, 4.0] | 3.7 / 4.5 |
| Lane outages per day (26 s) | **0** / 1 / 2 / 4 | plan only 33.1 / 34.8 / 37.0 / 40.3; GateFlow 20.9 / 21.0 / 21.0 / 21.3 | +1.3 / +1.5 / +1.6 / +1.9 | 2.2-2.4 / 2.6-3.2 |
| Staff on call (26 s) | 0 / 1 / **2** / 3 extra lanes | GateFlow 33.1 / 21.5 / 20.9 / 20.9 | 0.0 / +2.0 / +1.3 / +1.3 | GateFlow 0.0 / 2.0 / 2.6 / 2.7 |
| Time to open a lane (26 s) | 5 / **10** / 15 / 20 min | supervisor 21.9-22.5; GateFlow 20.7 / 20.9 / 21.1 / 21.2 | +1.2 to +1.3 | 2.1-2.2 / 2.5-2.7 |
| Recommendations followed (26 s) | 40% / 60% / **80%** / 100% | GateFlow 21.4 / 21.1 / 20.9 / 20.7 | +0.8 [0.4, 1.1] / +1.1 / +1.3 / +1.4 | GateFlow 2.9 / 2.6 / 2.6 / 2.5 |
| GateFlow's target wait (26 s) | 5 / 8 / **10** / 15 min | GateFlow 19.1 / 19.9 / 20.9 / 24.3 | +3.1 / +2.3 / +1.3 / **-2.1** | GateFlow 3.9 / 3.2 / 2.6 / 1.4 |

The plan-only numbers at 25, 26 and 27 s and with one lane short are those of A' in the
S7 sweep (22.1, 33.1, 108.0 and 84.9): the same days, before any extra lane.

## What the numbers say, and what they do not

- **At the hub, the lanes matter more than the calls.** The transfer checkpoint has 4 lanes in
  its roster and staff for a fifth. Connecting passengers arrive in waves:
  - a supervisor opens the fifth lane once a wave has built the queue, and it is ready about
    10 minutes later: 15.2 fewer missed flights per day than the plan alone [12.3, 18.4], for
    0.6 extra lane-hours;
  - GateFlow sees the next wave in its forecast and opens before it: 32.2 fewer [28.5, 36.4],
    for 1.8 extra lane-hours, that is 17.0 more flights per day than the supervisor;
  - GateFlow as a whole (priority calls and lanes) catches **19.7 more flights per day** than
    today's practice with a supervisor [17.8, 21.6]. That costs 1.25 more lane-hours per day
    (about 2.5% of the 49.5 staffed), or about 4 lane-minutes per flight;
  - the priority calls alone gave +8.7 in S7. With GateFlow's lanes they add +2.7 [1.8, 3.6]
    (61.8 missed instead of 64.5 with today's calls): the extra lane removes most of the queue
    that the priority had to jump.
- **At the low-cost base, the lanes close the gap of S7.** There, staff calling the six o'clock
  flights catch everyone (A' misses none), and GateFlow without extra lanes (v3) lost 2.3 flights
  per day.
  With GateFlow's lanes, v3 misses 0.1 per day: 0.1 more than A' with a supervisor
  [0.1, 0.2]. The 90th percentile of the wait falls from 15 minutes (A') to 8 with a supervisor
  and to 4 with GateFlow's lanes, for 1.1 and 1.3 extra lane-hours per day.
- **Extra lanes are the safety valve of a day harder than planned.** With screening 4% to 12.5%
  slower than the plan assumed, or a roster one lane short, the plan alone misses 22 to 108
  flights per day (19 on a day as planned). Extra lanes keep it between 19 and 27:
  - the supervisor already does most of it;
  - GateFlow adds 0.8 to 3.5 flights per day by opening earlier, for 0.4 to 0.8 more
    lane-hours;
  - lane outages widen GateFlow's margin (+1.3 to +1.9 with up to four per day), while the plan
    alone loses 7 more flights.
- **One extra lane does most of the work** on such a day: staff for one lane bring the 33.1
  missed flights to 21.5, staff for two to 20.9, a third changes nothing. With a single extra
  lane, when it opens matters more: GateFlow's margin over the supervisor is +2.0, against +1.3
  with two.
- **The operator model matters less than expected.** The time to open a lane (5 to 20 minutes)
  hardly changes the outcome. A duty manager who follows only 40% of the recommendations still
  leaves GateFlow ahead of the supervisor (+0.8 [0.4, 1.1]), because a recommendation that was
  not followed comes back 10 minutes later if it is still needed.
- **The target wait is the airport's lever** between lane-hours and flights. A target of 5
  minutes catches 3.1 more flights per day than the supervisor for 1.7 more lane-hours. A
  target of 15 minutes saves 0.8 lane-hours and loses 2.1 flights: GateFlow then opens later
  than a supervisor who acts at 10 minutes. It is a setting of each checkpoint
  (`gateflow.laneTargetWaitMinutes`).
- **Where the roster follows demand, extra lanes are rarely needed.** On the VCE-like peak days
  GateFlow opens 0.3 to 0.7 lanes per day (0.3 to 0.5 lane-hours, against 170 staffed), and the
  missed flights hardly change (0.1 to 0.5 per day). On the normal day it opens one lane in a
  hundred days.
- **One extra lane-hour saves 35 to 180 hours of passenger waiting**, depending on the
  checkpoint. Per extra lane-hour, the supervisor's lanes save more flights (26.7 at the hub,
  against 17.7 for GateFlow's), because the supervisor opens only when the queue is already
  long. GateFlow opens more often and earlier, and saves more in total.
- **The limits of the scenario hold.** Over the 1,000 simulated days the most lanes open are 14,
  6 and 5, the lanes of the three checkpoints. The duty manager followed 77-81% of GateFlow's
  recommendations (as set: 80%).
- **What the numbers do not say:**
  - the staff on call, the time to open a lane and the share of recommendations followed are
    assumptions. The airport's practice decides them (the data request now asks for them);
  - the supervisor sees the exact wait the queue implies, every 5 minutes, and never forgets: a
    real one reacts later or less often, so the margin of GateFlow over today's practice is
    probably understated here;
  - staff on call cost only their lane-hours: no other duty is modelled, and the airport prices
    the lane-hours;
  - the forecast knows the flights of the day (from the schedule) and how passengers usually
    arrive, not the day's loads or disruptions. It is learnt from other simulated days of the
    same model, so it is better than a real forecast would be at first;
  - an extra lane counts as open from its opening to the decision to close it. The last
    passenger it screens after that decision is counted in the staffed lane-hours only.
    "Closed" counts decisions to close: a lane still open when the last passenger has been
    screened is not counted as closed.
