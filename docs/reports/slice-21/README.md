# Slice S21 reports (SIMULATED, synthetic data)

Forecast backtests produced by `gateflow-sim` 0.12.0 from a clean checkout of commit
`8f3e19552ec27f4b60318968985e3a873486362e`, as recorded in each manifest.

They are **simulated results on synthetic assumptions**, not measurements, and must not be
presented as evidence of operational performance.

S21 adds GateFlow Predict, a preview (ADR-054): from what the live system knows at a checkpoint
(the arrivals of the last hour, the people not yet admitted, the lanes open), a Monte Carlo of the
next 90 minutes gives the arrivals, the people not yet admitted and the wait of a party arriving,
each as a band: the 10th, 50th and 90th percentile of 200 simulated paths. The backtest measures
it against the full simulator: on each of 200 simulated days (seeds 1 to 200) run with GateFlow
priority v3 and the lane plan, a forecast every 15 minutes from an hour after the first arrival,
compared at 15, 30, 60 and 90 minutes with what happened. The arrivals of the forecasts come from
50 other simulated days of the scenario (seeds from 1,000,001).

## The errors per horizon

Arrivals: the people arriving in the 5 minutes before the horizon, every forecast. Queue: the
people not yet admitted at the horizon. Wait: minutes from arrival to admission, the median of the
people arriving in those 5 minutes. Queue and wait are measured on the forecasts of a queue (the
median or the truth at least 1): most of the day nobody waits and none is forecast to, and those
forecasts would pass for calibrated bands. MAE and bias are of the median (bias above 0: the
forecast said more than happened); coverage is the share of truths between p10 and p90, 80 % when
the bands are calibrated. Every horizon, and the same on every forecast, are in each report.

| Scenario | Horizon | Arrivals MAE | WAPE | Coverage | Queue MAE | Bias | Coverage | Wait MAE (min) | Bias | Coverage |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Demo checkpoint (congested morning) | 15 min | 5.6 | 19 % | 76 % | 11.3 | +1.1 | 85 % | 1.9 | -0.5 | 73 % |
|  | 90 min | 5.6 | 19 % | 78 % | 20.2 | +1.5 | 88 % | 3.4 | -0.4 | 77 % |
| VCE-like, normal day | 15 min | 8.7 | 12 % | 77 % | 6.9 | +5.7 | 83 % | 1.6 | +0.7 | 43 % |
|  | 90 min | 8.9 | 12 % | 79 % | 7.9 | +6.6 | 87 % | 1.7 | +1.0 | 45 % |
| VCE-like, peak day | 15 min | 10.5 | 11 % | 76 % | 17.4 | +5.7 | 80 % | 1.3 | +0.4 | 60 % |
|  | 90 min | 10.7 | 11 % | 77 % | 27.2 | +18.6 | 80 % | 2.1 | +1.4 | 58 % |
| VCE-like, disrupted day | 15 min | 10.5 | 11 % | 76 % | 17.0 | +5.7 | 81 % | 1.4 | +0.5 | 60 % |
|  | 90 min | 10.7 | 11 % | 77 % | 30.0 | +19.2 | 78 % | 2.6 | +1.6 | 55 % |
| TSF-like, peak day | 15 min | 5.9 | 20 % | 76 % | 10.7 | +0.7 | 82 % | 2.2 | -0.5 | 71 % |
|  | 90 min | 5.8 | 20 % | 77 % | 19.3 | +1.6 | 85 % | 4.0 | -0.3 | 75 % |
| MX-like transfer hub | 15 min | 4.7 | 22 % | 76 % | 7.4 | +2.6 | 82 % | 2.9 | +0.5 | 54 % |
|  | 90 min | 4.5 | 21 % | 78 % | 12.3 | +6.9 | 83 % | 5.3 | +2.6 | 61 % |

What they say:
- **Arrivals** are forecast within 11 to 22 % (WAPE) of the people arriving in 5 minutes, with
  bands that hold 76 to 79 % of the truths: close to calibrated (a band between two whole numbers
  loses part of the truths at its ends).
- **The queue's bands** hold 78 to 88 % of the truths when there is a queue. On the VCE-like days
  the median is high: +6 people at 15 minutes, +19 at 90 minutes on the peak and disrupted days.
- **The wait's bands are too narrow** when there is a queue: 37 to 77 % of the truths across the
  horizons, most of the
  misses below the band on the VCE-like days and the MX-like hub, where the median is high by 0.4
  to 2.6 minutes. Not yet to be read as "8 in 10".

Part of the high queue comes from how the simulator calls people: when people wait to be called,
the queue keeps about 1.6 to 1.8 minutes of the lanes' capacity admitted and waiting at the lanes
(the call-ahead), which the forecast counts as not yet admitted. Modelling that buffer from the
policy (its call-ahead less its response estimate) was tried on 20 tuning days (seeds 1001 to
1020): it turned the queue's bias negative (-5 to -8 people) and raised its MAE by 30 to 60 %, so
it was not adopted. A recalibration of the bands per quantity and horizon, fitted on days apart
from these, is the proposed next step (IMPLEMENTATION_PLAN.md, S21).

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
