# Slice S6 reports (SIMULATED, synthetic data)

Reports produced by `gateflow-sim` 0.6.0 from a clean checkout of commit
`7e26b4fbe3d2238c424e09223e602632aa6cc18d` (recorded in each manifest). They are **simulated
results on synthetic assumptions**, not measurements, and must not be presented as evidence of
operational performance.

Each report now comes in three forms: `results.json` (or `sweep.json`) for machines, `report.md`
(or `sweep.md`) for GitHub, and `report.html` (or `sweep.html`), a self-contained page with charts
to open in any browser, offline.

## Sensitivity sweeps (new in S6)

| Sweep (200 simulated days per point) | Report | Page with charts | Results |
|---|---|---|---|
| `sensitivity-demo`: priority v3 on the demo day, one assumption at a time (fairness bounds, prepare window, hysteresis, lanes, demand, arrival times, call response, missed calls, call-ahead with slow passengers, overload) | [sweep.md](sweeps/sensitivity-demo/sweep.md) | [sweep.html](sweeps/sensitivity-demo/sweep.html) | [sweep.json](sweeps/sensitivity-demo/sweep.json) |
| `data-quality-disrupted`: priority v3 on the disrupted day as the flight feed and the disruptions vary (maximum data age, feed outages, their length, hysteresis, delays, lane outages) | [sweep.md](sweeps/data-quality-disrupted/sweep.md) | [sweep.html](sweeps/data-quality-disrupted/sweep.html) | [sweep.json](sweeps/data-quality-disrupted/sweep.json) |

## Experiments (200 simulated days each)

| Scenario | Report | Page with charts | Results |
|---|---|---|---|
| `single-checkpoint-demo` | [report.md](single-checkpoint-demo/report.md) | [report.html](single-checkpoint-demo/report.html) | [results.json](single-checkpoint-demo/results.json) |
| `single-checkpoint-moderate` | [report.md](single-checkpoint-moderate/report.md) | [report.html](single-checkpoint-moderate/report.html) | [results.json](single-checkpoint-moderate/results.json) |
| `single-checkpoint-staffed` | [report.md](single-checkpoint-staffed/report.md) | [report.html](single-checkpoint-staffed/report.html) | [results.json](single-checkpoint-staffed/results.json) |
| `single-checkpoint-strategic` (stress test) | [report.md](single-checkpoint-strategic/report.md) | [report.html](single-checkpoint-strategic/report.html) | [results.json](single-checkpoint-strategic/results.json) |
| `single-checkpoint-disrupted` | [report.md](single-checkpoint-disrupted/report.md) | [report.html](single-checkpoint-disrupted/report.html) | [results.json](single-checkpoint-disrupted/results.json) |
| `single-checkpoint-feed-stress` (stress test) | [report.md](single-checkpoint-feed-stress/report.md) | [report.html](single-checkpoint-feed-stress/report.html) | [results.json](single-checkpoint-feed-stress/results.json) |

The policies are those of S5. `priority-v3` is now version 0.2.0: it trusts flight data for
60 minutes instead of 30 (ADR-034).

## Results at a glance

### Where GateFlow beats today's practice, and where it does not

Net flights saved per day by `priority-v3` compared with idealised manual handling (A',
`fifo-manual`), with 95% confidence intervals. Each line varies one assumption of the demo day,
all else equal; the base is the demo day itself (+3.2 [2.4, 4.0]).

| Assumption | Values (base in bold) and net saved vs A' |
|---|---|
| Lanes open | 5 lanes: **-95.1** [-101.3, -88.8] · **6: +3.2** · 7: +0.6 [0.4, 0.9] · 8: +0.1 [-0.0, 0.2] |
| Demand (load factor) | x0.8: +0.2 · x0.9: +1.1 · **x1: +3.2** · x1.1: **-10.1** [-12.1, -7.8] |
| Passengers arrive earlier (+) or later (-) | -20 min: **-40.4** · -10 min: **-11.0** · **0: +3.2** · +10 min: +2.6 · +20 min: +1.0 |
| Median call response | 45 s: +3.2 · **75 s: +3.2** · 120 s: +1.7 · 180 s: **-25.7** [-29.0, -22.3] |
| ... with 180 s responses, call-ahead raised | **180 s: -25.8** · 300 s: +2.0 [1.2, 2.8] · 420 s: +2.4 · 600 s: +2.7 |
| Passengers missing the first call | 2%: +3.7 · **4%: +3.2** · 8%: +1.8 · 12%: +1.0 [0.1, 1.8] |
| Overtake bound K | 10: **-8.4** · 15: **-3.0** · 20: +0.0 · **30: +3.2** · 40: +4.7 · 60: +6.1 |
| Priority cap k (among 20 called) | 2: **-13.8** · 5: +2.1 · **10: +3.2** · 15 or 20: +3.2 |
| Prepare window M | 0: +3.4 · 5: +3.3 · **10: +3.2** · 15: +3.0 · 20: +2.6 |
| Hysteresis h | 0 to 5 min: +3.2 at every value |

### The price of fairness

| Overtake bound K | Missed by v3 per day | Others delayed > 5 min (vs the same queue in FIFO order) |
|---|---:|---:|
| 10 | 23.1 | 0.00% |
| 20 | 14.7 | 0.00% |
| **30 (base)** | **11.5** | **0.01%** |
| 40 | 10.0 | 0.27% |
| 60 | 8.6 | 1.02% |

With one lane fewer (overload), the bound decides everything:

| K, with 5 lanes | Missed by v3 per day | Net saved vs A' | Others delayed > 5 min |
|---|---:|---:|---:|
| **30** | 199.0 | -95.1 | 0.89% |
| 60 | 139.6 | -35.8 | 14.3% |
| 120 | 98.6 | +5.3 | 12.9% |
| 240 | 86.0 | +17.8 | 12.5% |

A' has no bound: in that overload, staff calls overtake one passenger 738 times on the worst
day (A' misses 103.8 flights per day).

### Data quality

Net flights saved per day by `priority-v3` (maximum data age 60 minutes) on the disrupted day:

| Flight feed | vs A' | vs v2 (no stale-data rule) |
|---|---:|---:|
| never down | +1.6 [0.8, 2.4] | +0.0 |
| **down about once a day (base)** | **+1.6 [0.7, 2.4]** | **+0.0** |
| down 4 times a day | +1.6 [0.8, 2.3] | +0.0 |
| down 6 times a day | +1.1 [0.1, 1.9] | -0.4 [-0.8, -0.0] |
| outages of 60 minutes (median) | +0.6 [-0.8, 1.8] | -0.9 [-2.0, -0.2] |
| outages of 90 minutes (median) | +0.5 [-0.9, 1.7] | -1.0 [-2.0, -0.2] |

| Maximum data age, feed down 4 times a day | 15 min | 30 min | **60 min** | none |
|---|---:|---:|---:|---:|
| vs A' | +0.2 | +0.9 | **+1.6** | +1.6 |
| People boosted on wrong information per day | 10.6 | 11.1 | **11.6** | 11.8 |

### Experiments

| Scenario | Missed flights per day: A | A' | `priority-v2` | `priority-v3` 0.2.0 | v3 vs A' [95% CI] | Class reversals per day: v2 / v3 |
|---|---:|---:|---:|---:|---:|---:|
| demo | 55.1 | 14.7 | 11.5 | 11.5 | +3.2 [2.4, 4.0] | 162 / 0 |
| moderate | 14.3 | 7.2 | 5.6 | 5.6 | +1.5 [1.2, 1.9] | 25 / 0 |
| staffed | 65.9 | 17.8 | 16.5 | 16.6 | +1.2 [0.1, 2.2] | 190 / 0 |
| strategic (stress test) | 204.5 | 132.0 | 141.6 | 141.6 | -9.6 [-10.9, -8.4] | 139 / 0 |
| disrupted | 47.8 | 12.4 | 10.8 | 10.8 | +1.6 [0.7, 2.3] | 162 / 1.3 |
| feed stress | 47.8 | 12.4 | 11.1 | 12.3 | +0.1 [-1.0, 1.1] | 164 / 3.6 |

## What the numbers say, and what they do not

- **GateFlow's advantage holds in a band of conditions, not everywhere.** On a congested but
  manageable day it catches 1 to 3 more flights per day than idealised manual handling. When the
  checkpoint is overloaded, A' saves far more:
  - one lane fewer: -95 flights per day;
  - 10% more passengers: -10;
  - passengers arriving 10 to 20 minutes later: -11 and -40.

  With spare capacity both lose very few flights and the difference vanishes.
- **In overload the difference is fairness.** GateFlow never lets more than K = 30 people
  overtake a passenger; in those days A' lets one passenger be overtaken up to 738 times. Raising
  K to 120 matches A' (+5.3) but delays 13% of the other passengers by more than 5 minutes. That
  trade-off is the airport's decision, not the engine's. The sweeps give the airport the curve to
  decide on.
- **The virtual queue needs to be tuned to how fast people answer.** If passengers take a median
  3 minutes to come back after a call, the default call-ahead leaves lanes idle and GateFlow loses
  26 flights per day to A'. Raising the call-ahead to 300 seconds restores the advantage (+2.0),
  at the cost of 0.4 more minutes standing at the lanes. The response time must be measured
  before go-live, for instance in shadow mode.
- **K = 30 is the largest bound that meets the fairness criterion of ADR-025** (at most 0.1% of
  other passengers delayed by more than 5 minutes). K = 40 saves 1.5 more flights per day but
  delays 0.27% of the others by more than 5 minutes. The priority cap (10 among 20) does not bind
  at the base.
- **The 60-minute data age costs nothing with a reasonably reliable feed.** It degrades to FIFO
  only during outages longer than an hour. With long outages (median 60 to 90 minutes) GateFlow
  ends up level with A'.
- **The hysteresis and the prepare window are free choices** in this range: they change the
  missed flights by at most 0.7 per day (a window of 20 tickets is the worst).

These numbers rest on the same simplifications as S5, listed in every report:
- one-at-a-time curves show no interaction, except where a curve is drawn on a modified base;
- A' is idealised: every passenger of a called flight comes forward at once;
- the response, arrival and demand assumptions are synthetic.

## Open points for the founder

1. **Overload policy.** Should GateFlow offer an approved overload mode (a larger K for the
   hours when the checkpoint is overloaded), or keep the bound and accept that today's unbounded
   practice saves more flights in those hours?
2. **Measure call responses early.** The sweep shows this is the assumption the virtual queue
   is most sensitive to: shadow mode should measure it before any go-live.
3. **Where is the target checkpoint on these curves?** The demo day is congested but manageable.
   The value case must be stated for the airport's real capacity and demand (next slice, S7: real
   schedules).

To reproduce, check out the recorded commit and run the command printed at the end of each
report or sweep.
