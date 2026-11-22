# Slice S21 reports (SIMULATED, synthetic data)

Forecast backtests produced by `gateflow-sim` 0.13.0 from a clean checkout of commit
`c2ce38c31a826655dc59fc9eebed44c748f7a003` (S21.3), as recorded in each manifest. They replace
the reports of the S21 commit `8f3e195` (gateflow-sim 0.12.0), whose figures, before the
calibration, each report keeps in its last column and its `uncalibrated` summary: they are the
same.

They are **simulated results on synthetic assumptions**, not measurements, and must not be
presented as evidence of operational performance.

S21 adds GateFlow Predict, a preview (ADR-054): from what the live system knows at a checkpoint
(the arrivals of the last hour, the people not yet admitted, the lanes open), a Monte Carlo of the
next 90 minutes gives the arrivals, the people not yet admitted and the wait of a party arriving,
each as a band over 200 simulated paths. Since S21.3 (ADR-055) the band is the paths' median and
two edges calibrated on the scenario library: where 10 % and 90 % of the truths fell among the
paths on other simulated days (seeds from 2,000,001). The backtest measures the forecasts against
the full simulator: on each of 200 simulated days (seeds 1 to 200) run with GateFlow priority v3
and the lane plan, a forecast every 15 minutes from an hour after the first arrival, compared at
15, 30, 60 and 90 minutes with what happened. The arrivals of the forecasts come from 50 other
simulated days of the scenario (seeds from 1,000,001).

## The errors per horizon

Arrivals: the people arriving in the 5 minutes before the horizon, every forecast. Queue: the
people not yet admitted at the horizon. Wait: minutes from arrival to admission, the median of the
people arriving in those 5 minutes. Queue and wait are measured on the forecasts of a queue (the
median or the truth at least 1): most of the day nobody waits and none is forecast to, and those
forecasts would pass for calibrated bands. MAE and bias are of the median (bias above 0: the
forecast said more than happened); the coverage is the share of truths in the band, 80 % when it
is calibrated: before the calibration (the paths' 10th to 90th percentile) and after. Every
horizon, and the same on every forecast, are in each report.

| Scenario | Horizon | Arrivals MAE | WAPE | Coverage | Queue MAE | Bias | Coverage | Wait MAE (min) | Bias | Coverage |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Demo checkpoint (congested morning) | 15 min | 5.6 | 19 % | 76 % → 80 % | 11.3 | +1.1 | 85 % → 83 % | 1.9 | -0.5 | 73 % → 88 % |
|  | 90 min | 5.6 | 19 % | 78 % → 79 % | 20.2 | +1.5 | 88 % → 81 % | 3.4 | -0.4 | 77 % → 86 % |
| VCE-like, normal day | 15 min | 8.7 | 12 % | 77 % → 81 % | 6.9 | +5.7 | 83 % → 89 % | 1.6 | +0.7 | 43 % → 93 % |
|  | 90 min | 8.9 | 12 % | 79 % → 80 % | 7.9 | +6.6 | 87 % → 90 % | 1.7 | +1.0 | 45 % → 98 % |
| VCE-like, peak day | 15 min | 10.5 | 11 % | 76 % → 80 % | 17.4 | +5.7 | 80 % → 80 % | 1.3 | +0.4 | 60 % → 81 % |
|  | 90 min | 10.7 | 11 % | 77 % → 79 % | 27.2 | +18.6 | 80 % → 82 % | 2.1 | +1.4 | 58 % → 82 % |
| VCE-like, disrupted day | 15 min | 10.5 | 11 % | 76 % → 80 % | 17.0 | +5.7 | 81 % → 81 % | 1.4 | +0.5 | 60 % → 81 % |
|  | 90 min | 10.7 | 11 % | 77 % → 79 % | 30.0 | +19.2 | 78 % → 80 % | 2.6 | +1.6 | 55 % → 78 % |
| TSF-like, peak day | 15 min | 5.9 | 20 % | 76 % → 79 % | 10.7 | +0.7 | 82 % → 81 % | 2.2 | -0.5 | 71 % → 85 % |
|  | 90 min | 5.8 | 20 % | 77 % → 80 % | 19.3 | +1.6 | 85 % → 80 % | 4.0 | -0.3 | 75 % → 84 % |
| MX-like transfer hub | 15 min | 4.7 | 22 % | 76 % → 80 % | 7.4 | +2.6 | 82 % → 85 % | 2.9 | +0.5 | 54 % → 78 % |
|  | 90 min | 4.5 | 21 % | 78 % → 79 % | 12.3 | +6.9 | 83 % → 83 % | 5.3 | +2.6 | 61 % → 77 % |

What they say:
- **Arrivals** are forecast within 11 to 22 % (WAPE) of the people arriving in 5 minutes; their
  bands held 76 to 79 % of the truths, 77 to 81 % calibrated.
- **The queue's bands** held 78 to 88 % of the truths when there was a queue, 80 to 91 %
  calibrated. On the VCE-like days its median is high, by 6 people at 15 minutes and by 19 at 90
  minutes on the peak and disrupted days: the calibration moves the edges, not the median.
- **The wait's bands**, too narrow before (37 to 77 % of the truths when there was a queue), hold
  75 to 98 % calibrated, at every horizon: 78 to 82 % on the VCE-like peak and disrupted days, 75
  to 79 % at the MX-like hub, 83 to 88 % on the demo and the TSF-like day; 93 to 98 % on the
  VCE-like normal day, where queues are few and short and most truths are nobody waiting. The
  bands are wider for it: on the VCE-like peak, 4.3 minutes wide at 15 minutes instead of 3.2.

Part of the high queue comes from how the simulator calls people: when people wait to be called,
the queue keeps about 1.6 to 1.8 minutes of the lanes' capacity admitted and waiting at the lanes
(the call-ahead), which the forecast counts as not yet admitted. Modelling that buffer from the
policy was tried on tuning days and not adopted (ADR-054); calibrating the median as well as the
edges was tried too and not adopted (ADR-055).

## Reports

| Scenario | What it represents | Report | Data |
|---|---|---|---|
| `single-checkpoint-demo` | Demo checkpoint (congested morning) | [backtest.md](single-checkpoint-demo/backtest.md) | [backtest.json](single-checkpoint-demo/backtest.json) |
| `vce-like-normal-day` | VCE-like, normal day | [backtest.md](vce-like-normal-day/backtest.md) | [backtest.json](vce-like-normal-day/backtest.json) |
| `vce-like-peak-day` | VCE-like, peak day | [backtest.md](vce-like-peak-day/backtest.md) | [backtest.json](vce-like-peak-day/backtest.json) |
| `vce-like-disrupted-day` | VCE-like, disrupted day | [backtest.md](vce-like-disrupted-day/backtest.md) | [backtest.json](vce-like-disrupted-day/backtest.json) |
| `tsf-like-peak-day` | TSF-like, peak day | [backtest.md](tsf-like-peak-day/backtest.md) | [backtest.json](tsf-like-peak-day/backtest.json) |
| `mx-like-transfer-hub` | MX-like transfer hub | [backtest.md](mx-like-transfer-hub/backtest.md) | [backtest.json](mx-like-transfer-hub/backtest.json) |

To reproduce one, from a clean checkout of the commit:

```bash
pnpm sim backtest --scenario scenarios/vce-like-peak-day.yaml --seeds 1-200
```

The calibration itself is reproduced by `pnpm calibrate:library`, which CI checks.
