# GateFlow pitch figures (SIMULATED)

> **SIMULATED RESULTS ON SYNTHETIC DATA.** These figures are model outputs on synthetic airports, not measurements, and must not be presented as evidence of operational performance: in the pitch, say them as what GateFlow's simulator gives, with their caveats.

The figures GateFlow's simulations give for the pitch, on one page. Every number is read from a published report, linked, with its 95% confidence interval where the report gives one; `figures.json` gives each with the file and the place it was read. The page is written by `gateflow-sim pitch` (`pnpm pitch`) and CI checks it is what the reports give: a report published again changes it in the same commit.

Words of the page:
- **Today's practice:** staff calling the passengers of closing flights out of the queue (A'), and a supervisor who opens an extra lane when the queue shows more than 10 minutes of wait (`fifo-manual@reactive`).
- **GateFlow as a whole:** GateFlow's priority calls (`priority-v3`) with its console's lane recommendations (`@advise`), followed 4 times in 5 by the duty manager.
- **Net flights saved:** passengers who make a flight they would have missed, minus those who miss one they would have made, per day.
- **Extra lane-hours:** the hours of lanes open beyond the roster's plan, per day; the staff on call open them.

## Claims for the pitch

### 1. At a transfer hub, GateFlow saves flights

At the MX-like transfer hub, GateFlow as a whole (its priority calls and its console's lane recommendations) saves **+18.0** [16.1, 19.9] flights a day against today's practice (staff calling the closing flights, a supervisor opening lanes when the queue is long), for 1.5 [1.3, 1.6] extra lane-hours a day: 24.2 passengers a day make a flight they would have missed, 6.2 miss one they would have made.

**Say it with:** A synthetic transfer checkpoint: 4,473 passengers a day, 5 lanes of which the roster plans at most 4, staff on call for 1 more. Today's supervisor is idealised (it sees the exact wait every 5 minutes and never forgets), so GateFlow's margin is probably understated. The staff on call, about 10 minutes to open a lane and a duty manager following 80% of the recommendations are assumptions.

Sources: [MX-like transfer hub (S22.3)](../reports/slice-22/mx-like-transfer-hub/report.md).

### 2. Most of it is the console's lane recommendations

The console's lane recommendations alone, with today's calls, save **+17.7** [16.0, 19.4] flights a day at the hub against today's supervisor, for 1.8 [1.6, 1.9] extra lane-hours; once those lanes are open, GateFlow's priority calls add +0.3 [-0.8, 1.3].

**Say it with:** The console opens 2.4 lanes a day there, for 2.3 extra lane-hours: one extra lane-hour of it saves 14.1 [12.6, 15.8] flights against the plan only, less than one of the supervisor's (26.7 [22.2, 32.3]), who opens few lanes and only once the queue is long, but in all it saves more. The extra lanes are the airport's staff on call: GateFlow says when to open them.

Sources: [MX-like transfer hub (S22.3)](../reports/slice-22/mx-like-transfer-hub/report.md).

### 3. Followed one time in two, the recommendations still pay

If the duty manager follows one recommendation in two, the console's lanes still save **+12.9** [10.9, 15.0] flights a day more than today's supervisor at the hub (+19.3 [17.4, 21.1] when all are followed). If none is followed nothing opens beyond the plan: -15.2 [-18.7, -12.2] flights a day against the supervisor.

**Say it with:** Whether a recommendation is followed is drawn day by day; one not followed comes back 15 minutes later if it is still needed. At the TSF-like base, one in two followed already changes the mean wait by -2.40 [-2.50, -2.30] minutes against the plan only, all of them by -2.55 [-2.65, -2.45].

Sources: [Recommendations followed or not, MX-like hub (S22.3)](../reports/slice-22/sweeps/mx-like-hub-console/sweep.md), [Recommendations followed or not, TSF-like base (S22.3)](../reports/slice-22/sweeps/tsf-like-peak-console/sweep.md).

### 4. Where lanes are short, the priority calls save flights

With the lanes of the plan only, GateFlow's priority calls save **+8.7** [7.2, 10.4] flights a day at the hub against today's staff calls, with no extra lane: 22.7 passengers a day make a flight they would have missed, 14.0 miss one they would have made.

**Say it with:** The passengers not prioritised wait 0.13 [0.12, 0.14] minutes longer on average, and 0.9% of them more than 5 minutes longer. Once the console's lanes are open the priority calls add little. At the TSF-like base, where staff calling the closing flights catch everyone, the priority calls alone lose flights: -2.3 [-3.1, -1.6] a day.

Sources: [TSF-like peak day (S22.3)](../reports/slice-22/tsf-like-peak-day/report.md), [MX-like transfer hub (S22.3)](../reports/slice-22/mx-like-transfer-hub/report.md).

### 5. At a low-cost base, the console halves the wait

At the TSF-like base (one morning bank of based aircraft), the console's lanes halve the mean wait against today's supervisor, from 1.9 to **0.9** minutes (-0.93 [-0.96, -0.90] minutes a person), and its 90th percentile from 8.3 to 3.3 minutes, for 0.7 [0.6, 0.7] extra lane-hours a day.

**Say it with:** Nobody misses a flight there with today's practice either (0.0 a day): the gain is the wait. One extra lane-hour of the console's saves 145 [140, 150] hours of passengers' waiting against the plan only.

Sources: [TSF-like peak day (S22.3)](../reports/slice-22/tsf-like-peak-day/report.md).

### 6. Where staff calls already catch everyone, there is no flight to save

At the TSF-like base GateFlow as a whole gives -0.06 [-0.10, -0.02] flights a day against today's practice: there is no flight to save, and its priority calls lose a few. Its gain there is the wait: -0.86 [-0.89, -0.83] minutes a person.

**Say it with:** Today's practice is strong there: staff calling the closing flights miss 0.0 a day, a plain queue with nobody called would miss 25.8. Sell GateFlow there on the wait, not on flights.

Sources: [TSF-like peak day (S22.3)](../reports/slice-22/tsf-like-peak-day/report.md).

### 7. Where the roster follows demand, the console stays quiet

At a VCE-like departures checkpoint, whose roster follows the day's demand, the console makes 0.0, 0.3 and 1.0 recommendations a day (a normal, a peak and a disrupted day), and the missed flights hardly change against today's supervisor: 0.0 [0.0, 0.0], 0.0 [-0.0, 0.0] and +0.1 [0.0, 0.2] a day.

**Say it with:** That is what it should do there: no lane the queue does not need. GateFlow's priority calls do not change the missed flights measurably there either (0.0 [-0.1, 0.1], +0.2 [-0.1, 0.6] and +0.3 [-0.1, 0.7] a day, every interval across zero): these simulated days show no gain in flights at such a checkpoint.

Sources: [VCE-like normal day (S22.3)](../reports/slice-22/vce-like-normal-day/report.md), [VCE-like peak day (S22.3)](../reports/slice-22/vce-like-peak-day/report.md), [VCE-like disrupted day (S22.3)](../reports/slice-22/vce-like-disrupted-day/report.md).

### 8. On a day harder than planned, extra lanes are the safety valve

On the VCE-like peak day with screening at 26 s a person instead of the 24 its roster assumed, the plan alone misses 33.1 flights a day, today's supervisor 22.2 and GateFlow's lanes **20.9** (+1.3 [1.1, 1.6] against the supervisor); with a roster one lane short, 84.9, 24.9 and 21.4 (+3.5 [3.1, 4.0]).

**Say it with:** Measured in S8 with S8's rule (`@predict`): the console's rule was not swept on such days. On the library's days the console's rule gives +0.7 [0.0, 1.4] flights a day against S8's at the hub. Without staff on call nothing opens: 33.1 flights a day are missed on the slower day.

Sources: [MX-like transfer hub (S22.3)](../reports/slice-22/mx-like-transfer-hub/report.md), [A VCE-like peak day harder than planned (S8)](../reports/slice-8/sweeps/vce-like-peak-lanes/sweep.md).

### 9. The forecasts behind the recommendations hold their bands

GateFlow forecasts the people arriving in each 5 minutes, 15 to 90 minutes ahead, within 11% to 22% of them (WAPE) at the five checkpoints of the library, and its 80% bands hold 77% to 81% of what then happened.

**Say it with:** Measured on 12,145 to 15,524 forecasts per checkpoint and horizon over 200 simulated days, against the full simulator. The forecasts learn from 50 other simulated days of the same model, so they are better than a real forecast would be at first; they know the day's flights, not their loads or disruptions.

Sources: [Forecasts, VCE-like normal day (S21)](../reports/slice-21/vce-like-normal-day/backtest.md), [Forecasts, VCE-like peak day (S21)](../reports/slice-21/vce-like-peak-day/backtest.md), [Forecasts, VCE-like disrupted day (S21)](../reports/slice-21/vce-like-disrupted-day/backtest.md), [Forecasts, TSF-like peak day (S21)](../reports/slice-21/tsf-like-peak-day/backtest.md), [Forecasts, MX-like transfer hub (S21)](../reports/slice-21/mx-like-transfer-hub/backtest.md).

### 10. When a queue builds, the forecast of the wait is within minutes

When there is a queue, GateFlow's forecast of the wait of a party arriving is off by 1.3 to 5.3 minutes on average (the median's error), and its bands hold 75% to 98% of the waits.

**Say it with:** Before the calibration of S21.3 those bands held as little as 37% of the waits. Most of the day nobody waits: those forecasts are left out. The forecast of the queue itself runs high on the VCE-like days, by 19 people 90 minutes ahead on the peak day.

Sources: [Forecasts, VCE-like normal day (S21)](../reports/slice-21/vce-like-normal-day/backtest.md), [Forecasts, VCE-like peak day (S21)](../reports/slice-21/vce-like-peak-day/backtest.md), [Forecasts, VCE-like disrupted day (S21)](../reports/slice-21/vce-like-disrupted-day/backtest.md), [Forecasts, TSF-like peak day (S21)](../reports/slice-21/tsf-like-peak-day/backtest.md), [Forecasts, MX-like transfer hub (S21)](../reports/slice-21/mx-like-transfer-hub/backtest.md).

### 11. The passengers not prioritised do not pay for it

At the hub the passengers GateFlow does not prioritise wait **-0.30** [-0.36, -0.25] minutes on average against today's practice, that is less, since the console's lanes shorten the queue; 0.6% of them wait more than 5 minutes longer.

**Say it with:** Without the console's lanes, the priority calls alone make them wait 0.13 [0.12, 0.14] minutes longer on average. A priority call passes people who came before, never more than 30 for one ticket (the policy's bound; 30 on the worst of the 200 days); staff calling flights out of today's queue passed up to 68.

Sources: [MX-like transfer hub (S22.3)](../reports/slice-22/mx-like-transfer-hub/report.md).

## GateFlow as a whole against today's practice

GateFlow's priority calls with its console's lane recommendations (`priority-v3@advise`) against today's practice: staff calling the closing flights and a supervisor opening a lane when the queue shows more than 10 minutes (`fifo-manual@reactive`). Means per day over 200 simulated days with 95% confidence intervals, passenger by passenger on the same days.

| Scenario | People per day | Missed per day, today | Missed per day, GateFlow | Net flights saved per day | Extra lane-hours per day | Change in mean wait (min) |
|---|---:|---:|---:|---:|---:|---:|
| [VCE-like normal day](../reports/slice-22/vce-like-normal-day/report.md) | 16,623 | 10.9 | 10.9 | 0.0 [-0.1, 0.1] | 0.0 [0.0, 0.0] | 0.00 [-0.00, 0.00] |
| [VCE-like peak day](../reports/slice-22/vce-like-peak-day/report.md) | 21,792 | 18.7 | 18.5 | +0.2 [-0.1, 0.6] | 0.0 [-0.1, -0.0] | +0.01 [0.00, 0.02] |
| [VCE-like disrupted day](../reports/slice-22/vce-like-disrupted-day/report.md) | 21,792 | 14.0 | 13.8 | +0.2 [-0.1, 0.6] | +0.1 [0.0, 0.2] | -0.03 [-0.05, -0.01] |
| [TSF-like peak day](../reports/slice-22/tsf-like-peak-day/report.md) | 5,981 | 0.0 | 0.1 | -0.1 [-0.1, -0.0] | +0.5 [0.4, 0.5] | -0.86 [-0.89, -0.83] |
| [MX-like transfer hub](../reports/slice-22/mx-like-transfer-hub/report.md) | 4,473 | 81.5 | 63.5 | +18.0 [16.1, 19.9] | +1.5 [1.3, 1.6] | -0.36 [-0.41, -0.31] |

## Where it comes from

The same days, one part at a time: GateFlow's priority calls alone (`priority-v3` against `fifo-manual`, both with the plan's lanes); the console's lanes alone (`fifo-manual@advise` against `fifo-manual@reactive`, both with today's calls); the priority calls once the console's lanes are open (`priority-v3@advise` against `fifo-manual@advise`).

| Scenario | Priority calls alone: net flights saved | Console's lanes vs supervisor: net flights saved | Console's lanes vs supervisor: extra lane-hours | Console's lanes vs supervisor: change in mean wait (min) | Priority calls on the console's lanes: net flights saved |
|---|---:|---:|---:|---:|---:|
| [VCE-like normal day](../reports/slice-22/vce-like-normal-day/report.md) | 0.0 [-0.1, 0.1] | 0.0 [0.0, 0.0] | 0.0 [0.0, 0.0] | 0.00 [-0.00, 0.00] | 0.0 [-0.1, 0.1] |
| [VCE-like peak day](../reports/slice-22/vce-like-peak-day/report.md) | +0.2 [-0.1, 0.6] | 0.0 [-0.0, 0.0] | 0.0 [0.0, 0.1] | -0.02 [-0.03, -0.01] | +0.2 [-0.1, 0.5] |
| [VCE-like disrupted day](../reports/slice-22/vce-like-disrupted-day/report.md) | +0.3 [-0.1, 0.7] | +0.1 [0.0, 0.2] | +0.3 [0.2, 0.4] | -0.07 [-0.10, -0.05] | +0.1 [-0.2, 0.5] |
| [TSF-like peak day](../reports/slice-22/tsf-like-peak-day/report.md) | -2.3 [-3.1, -1.6] | 0.0 [0.0, 0.0] | +0.7 [0.6, 0.7] | -0.93 [-0.96, -0.90] | -0.1 [-0.1, -0.0] |
| [MX-like transfer hub](../reports/slice-22/mx-like-transfer-hub/report.md) | +8.7 [7.2, 10.4] | +17.7 [16.0, 19.4] | +1.8 [1.6, 1.9] | -0.57 [-0.61, -0.52] | +0.3 [-0.8, 1.3] |

## Recommendations followed or not

The share of the console's recommendations the duty manager follows, at the MX-like hub and at the TSF-like base; none followed is the plan only. Today's calls with the console's lanes, against today's supervisor and against the plan only. 200 simulated days per point.

| Share followed | Hub: net flights saved vs supervisor | Hub: extra lane-hours per day | TSF-like: change in mean wait vs supervisor (min) | TSF-like: vs plan only (min) |
|---:|---:|---:|---:|---:|
| 0 | -15.2 [-18.7, -12.2] | 0.0 | +1.61 [1.53, 1.68] | 0.00 [0.00, 0.00] |
| 0.5 | +12.9 [10.9, 15.0] | 2.3 | -0.79 [-0.84, -0.73] | -2.40 [-2.50, -2.30] |
| 0.8 (as assumed) | +17.7 [15.9, 19.4] | 2.3 | -0.93 [-0.96, -0.90] | -2.54 [-2.63, -2.44] |
| 1 | +19.3 [17.4, 21.1] | 2.3 | -0.94 [-0.97, -0.92] | -2.55 [-2.65, -2.45] |

Sources: [Recommendations followed or not, MX-like hub (S22.3)](../reports/slice-22/sweeps/mx-like-hub-console/sweep.md), [Recommendations followed or not, TSF-like base (S22.3)](../reports/slice-22/sweeps/tsf-like-peak-console/sweep.md).

## A day harder than planned

The VCE-like peak day of S8, made harder one assumption at a time: screening slower than the roster assumed, or a roster one lane short. Today's calls with the plan only, with today's supervisor, and with GateFlow's lanes as S8 recommended them (`@predict`, S8's rule: the console's rule was not swept on such days). 200 simulated days per point.

| Day | Missed per day: plan only | Supervisor | GateFlow's lanes (S8) | GateFlow's lanes vs supervisor: net flights saved | Extra lane-hours: supervisor | Extra lane-hours: GateFlow's lanes |
|---|---:|---:|---:|---:|---:|---:|
| As planned: 24 s a person | 18.8 | 18.7 | 18.7 | +0.1 [0.0, 0.1] | 0.1 | 0.3 |
| Screening at 25 s a person | 22.1 | 20.2 | 19.4 | +0.8 [0.6, 1.0] | 1.0 | 1.4 |
| Screening at 26 s a person | 33.1 | 22.2 | 20.9 | +1.3 [1.1, 1.6] | 2.2 | 2.6 |
| Screening at 27 s a person | 108.0 | 26.5 | 23.6 | +2.9 [2.5, 3.3] | 3.4 | 4.0 |
| A roster one lane short (24 s a person) | 84.9 | 24.9 | 21.4 | +3.5 [3.1, 4.0] | 3.7 | 4.5 |

Source: [A VCE-like peak day harder than planned (S8)](../reports/slice-8/sweeps/vce-like-peak-lanes/sweep.md).

## The forecasts behind the recommendations

GateFlow Predict (S21), measured on 200 simulated days a scenario: a forecast every 15 minutes, compared 15 and 90 minutes later with what happened. Arrivals: the people arriving in the 5 minutes before the horizon; the WAPE is the error as a share of them, the coverage the share of the truths in the 80% band. Wait: minutes from arrival to admission, on the forecasts of a queue.

| Scenario | Minutes ahead | Arrivals: WAPE | Arrivals: in the band | Wait: mean error (min) | Wait: in the band | Forecasts |
|---|---:|---:|---:|---:|---:|---:|
| [Demo checkpoint, congested morning](../reports/slice-21/single-checkpoint-demo/backtest.md) | 15 | 19% | 80% | 1.9 | 88% | 13,950 |
| [Demo checkpoint, congested morning](../reports/slice-21/single-checkpoint-demo/backtest.md) | 90 | 19% | 79% | 3.4 | 86% | 12,950 |
| [VCE-like normal day](../reports/slice-21/vce-like-normal-day/backtest.md) | 15 | 12% | 81% | 1.6 | 93% | 15,348 |
| [VCE-like normal day](../reports/slice-21/vce-like-normal-day/backtest.md) | 90 | 12% | 80% | 1.7 | 98% | 14,348 |
| [VCE-like peak day](../reports/slice-21/vce-like-peak-day/backtest.md) | 15 | 11% | 80% | 1.3 | 81% | 15,524 |
| [VCE-like peak day](../reports/slice-21/vce-like-peak-day/backtest.md) | 90 | 11% | 79% | 2.1 | 82% | 14,524 |
| [VCE-like disrupted day](../reports/slice-21/vce-like-disrupted-day/backtest.md) | 15 | 11% | 80% | 1.4 | 81% | 15,524 |
| [VCE-like disrupted day](../reports/slice-21/vce-like-disrupted-day/backtest.md) | 90 | 11% | 79% | 2.6 | 78% | 14,524 |
| [TSF-like peak day](../reports/slice-21/tsf-like-peak-day/backtest.md) | 15 | 20% | 79% | 2.2 | 85% | 13,145 |
| [TSF-like peak day](../reports/slice-21/tsf-like-peak-day/backtest.md) | 90 | 20% | 80% | 4.0 | 84% | 12,145 |
| [MX-like transfer hub](../reports/slice-21/mx-like-transfer-hub/backtest.md) | 15 | 22% | 80% | 2.9 | 78% | 13,514 |
| [MX-like transfer hub](../reports/slice-21/mx-like-transfer-hub/backtest.md) | 90 | 21% | 79% | 5.3 | 77% | 12,514 |

The demo checkpoint is a congested morning made for the simulator, not a library scenario: the claims above leave it out.

## What the figures do not say

- They are simulated, on synthetic airports made to look like three kinds of checkpoint (a VCE-like departures checkpoint, a TSF-like low-cost base, an MX-like transfer hub): they are not those airports' data. An airport's own figures come from its own days (M5).
- Today's practice is idealised: staff call every closing flight, and the supervisor sees the exact wait every 5 minutes and never forgets. A real supervisor reacts later, so GateFlow's margin is probably understated.
- The staff on call, the time to open a lane and the share of recommendations followed are assumptions; the data request asks the airport for them.
- An extra lane costs only its lane-hours here: no other duty of the staff on call is modelled, and the airport prices the lane-hours.
- The forecasts learn from other simulated days of the same model: a real forecast will be worse at first.
- The rules simulated are GateFlow's own code: the console's lane recommendations are the rule the live console runs, reading what the live system would know, and the live system calls the simulator's numbers in the simulator's order (S18). What is simulated is the airport, not GateFlow.

## Sources

The reports the page reads, each produced from a clean checkout of its commit; each says how to reproduce it, and `figures.json` gives every figure's file and JSON pointer.

| Report | What it is | Commit | Generator | Simulated days (per point of a sweep) |
|---|---|---|---|---:|
| [VCE-like normal day (S22.3)](../reports/slice-22/vce-like-normal-day/report.md) | VCE-like departures checkpoint, normal day (synthetic) | `529b232` | gateflow-sim 0.14.0 | 200 |
| [VCE-like peak day (S22.3)](../reports/slice-22/vce-like-peak-day/report.md) | VCE-like departures checkpoint, summer peak day (synthetic) | `529b232` | gateflow-sim 0.14.0 | 200 |
| [VCE-like disrupted day (S22.3)](../reports/slice-22/vce-like-disrupted-day/report.md) | VCE-like departures checkpoint, disrupted summer peak day (synthetic) | `529b232` | gateflow-sim 0.14.0 | 200 |
| [TSF-like peak day (S22.3)](../reports/slice-22/tsf-like-peak-day/report.md) | TSF-like low-cost base, summer peak day (synthetic) | `529b232` | gateflow-sim 0.14.0 | 200 |
| [MX-like transfer hub (S22.3)](../reports/slice-22/mx-like-transfer-hub/report.md) | MX-like hub, transfer security checkpoint (synthetic) | `529b232` | gateflow-sim 0.14.0 | 200 |
| [Recommendations followed or not, MX-like hub (S22.3)](../reports/slice-22/sweeps/mx-like-hub-console/sweep.md) | The console's lane recommendations on the MX-like transfer hub, followed or not | `529b232` | gateflow-sim 0.14.0 | 200 |
| [Recommendations followed or not, TSF-like base (S22.3)](../reports/slice-22/sweeps/tsf-like-peak-console/sweep.md) | The console's lane recommendations on the TSF-like peak day, followed or not | `529b232` | gateflow-sim 0.14.0 | 200 |
| [A VCE-like peak day harder than planned (S8)](../reports/slice-8/sweeps/vce-like-peak-lanes/sweep.md) | Extra lanes on the VCE-like peak day, recommended by GateFlow or opened by a supervisor | `b3c9f7e` | gateflow-sim 0.8.0 | 200 |
| [Forecasts, Demo checkpoint, congested morning (S21)](../reports/slice-21/single-checkpoint-demo/backtest.md) | Single departure checkpoint, synthetic day with a congested morning peak | `c2ce38c` | gateflow-sim 0.13.0 | 200 |
| [Forecasts, VCE-like normal day (S21)](../reports/slice-21/vce-like-normal-day/backtest.md) | VCE-like departures checkpoint, normal day (synthetic) | `c2ce38c` | gateflow-sim 0.13.0 | 200 |
| [Forecasts, VCE-like peak day (S21)](../reports/slice-21/vce-like-peak-day/backtest.md) | VCE-like departures checkpoint, summer peak day (synthetic) | `c2ce38c` | gateflow-sim 0.13.0 | 200 |
| [Forecasts, VCE-like disrupted day (S21)](../reports/slice-21/vce-like-disrupted-day/backtest.md) | VCE-like departures checkpoint, disrupted summer peak day (synthetic) | `c2ce38c` | gateflow-sim 0.13.0 | 200 |
| [Forecasts, TSF-like peak day (S21)](../reports/slice-21/tsf-like-peak-day/backtest.md) | TSF-like low-cost base, summer peak day (synthetic) | `c2ce38c` | gateflow-sim 0.13.0 | 200 |
| [Forecasts, MX-like transfer hub (S21)](../reports/slice-21/mx-like-transfer-hub/backtest.md) | MX-like hub, transfer security checkpoint (synthetic) | `c2ce38c` | gateflow-sim 0.13.0 | 200 |

From a clean checkout of a report's commit, the command its manifest records reproduces it (`figures.json` gives them all); for the sweep of the recommendations followed at the hub:

```bash
gateflow-sim sweep --spec sweeps/mx-like-hub-console.yaml --seeds 1-200 --bootstrap-resamples 2000
```
