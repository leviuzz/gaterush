# GateFlow simulation report: VCE-like departures checkpoint, disrupted summer peak day (synthetic)

> **SIMULATED RESULTS ON SYNTHETIC OR HYPOTHETICAL DATA. These numbers are model outputs, not measurements, and must not be presented as evidence of operational performance.**

Scenario `vce-like-disrupted-day` (data: SYNTHETIC), 200 simulated days, about 21792 passengers per day (14971 parties). Status quo (baseline): `fifo`.

## 1. Headline

Means per simulated day. P5-P95 is the spread across days; brackets give the 95% confidence interval of the mean (bootstrap over days).

| Policy | Missed flights per day | of which connecting | Missed per 1,000 passengers |
|---|---:|---:|---:|
| Physical FIFO queue (status quo, policy A): `fifo` 1.1.0 | 20.0 (P5-P95 9.0-35.0) | 11.8 | 0.92 |
| Physical FIFO queue with staff calling closing flights (status quo with manual handling, policy A'): `fifo-manual` 0.1.0 | 14.3 (P5-P95 6.0-26.1) | 8.5 | 0.66 |
| Physical FIFO queue with staff calling closing flights (status quo with manual handling, policy A'), with extra lanes opened by a supervisor when the queue is long (today): `fifo-manual@reactive` 0.1.0 | 14.0 (P5-P95 6.0-24.0) | 8.4 | 0.64 |
| Physical FIFO queue with staff calling closing flights (status quo with manual handling, policy A'), with extra lanes recommended by GateFlow's forecast: `fifo-manual@predict` 0.1.0 | 13.9 (P5-P95 6.0-24.0) | 8.4 | 0.64 |
| Physical FIFO queue with staff calling closing flights (status quo with manual handling, policy A'), with extra lanes recommended by GateFlow's console: `fifo-manual@advise` 0.1.0 | 13.9 (P5-P95 6.0-24.0) | 8.4 | 0.64 |
| GateFlow virtual queue with constrained EDF priority v3: fast track, stale-data rule and hysteresis (policy B): `priority-v3` 0.2.0 | 14.1 (P5-P95 6.0-24.0) | 8.4 | 0.65 |
| GateFlow virtual queue with constrained EDF priority v3: fast track, stale-data rule and hysteresis (policy B), with extra lanes recommended by GateFlow's forecast: `priority-v3@predict` 0.2.0 | 13.6 (P5-P95 6.0-24.0) | 8.3 | 0.63 |
| GateFlow virtual queue with constrained EDF priority v3: fast track, stale-data rule and hysteresis (policy B), with extra lanes recommended by GateFlow's console: `priority-v3@advise` 0.2.0 | 13.8 (P5-P95 6.0-24.0) | 8.3 | 0.63 |

| `fifo-manual` compared with `fifo` | Mean per day [95% CI] |
|---|---:|
| Flights saved: missed with `fifo`, caught with `fifo-manual` | 5.7 [5.0, 6.5] |
| Flights lost: caught with `fifo`, missed with `fifo-manual` | 0.0 [0.0, 0.1] |
| **Net flights saved** | **5.7 [5.0, 6.4]** |
| Days with a net gain / with a net loss | 87.5% / 0.5% |
| At-risk passengers reaching the gate in time (55.1 per day classified URGENT on arrival under `fifo`) | 76.8% with `fifo`, 86.4% with `fifo-manual` |
| Change in mean time from arrival to screening (min) | 0.00 [0.00, 0.00] |
| Change in mean time standing in a queue (min) | 0.00 [0.00, 0.00] |

| `fifo-manual@reactive` compared with `fifo` | Mean per day [95% CI] |
|---|---:|
| Flights saved: missed with `fifo`, caught with `fifo-manual@reactive` | 6.0 [5.2, 6.9] |
| Flights lost: caught with `fifo`, missed with `fifo-manual@reactive` | 0.0 [0.0, 0.1] |
| **Net flights saved** | **6.0 [5.2, 6.9]** |
| Days with a net gain / with a net loss | 88.5% / 0.0% |
| At-risk passengers reaching the gate in time (55.1 per day classified URGENT on arrival under `fifo`) | 76.8% with `fifo`, 86.8% with `fifo-manual@reactive` |
| Change in mean time from arrival to screening (min) | -0.04 [-0.06, -0.03] |
| Change in mean time standing in a queue (min) | -0.04 [-0.06, -0.03] |

| `fifo-manual@predict` compared with `fifo` | Mean per day [95% CI] |
|---|---:|
| Flights saved: missed with `fifo`, caught with `fifo-manual@predict` | 6.2 [5.4, 7.0] |
| Flights lost: caught with `fifo`, missed with `fifo-manual@predict` | 0.0 [0.0, 0.1] |
| **Net flights saved** | **6.2 [5.4, 7.0]** |
| Days with a net gain / with a net loss | 88.0% / 0.0% |
| At-risk passengers reaching the gate in time (55.1 per day classified URGENT on arrival under `fifo`) | 76.8% with `fifo`, 87.1% with `fifo-manual@predict` |
| Change in mean time from arrival to screening (min) | -0.16 [-0.19, -0.13] |
| Change in mean time standing in a queue (min) | -0.16 [-0.19, -0.12] |

| `fifo-manual@advise` compared with `fifo` | Mean per day [95% CI] |
|---|---:|
| Flights saved: missed with `fifo`, caught with `fifo-manual@advise` | 6.1 [5.3, 7.0] |
| Flights lost: caught with `fifo`, missed with `fifo-manual@advise` | 0.0 [0.0, 0.0] |
| **Net flights saved** | **6.1 [5.3, 7.0]** |
| Days with a net gain / with a net loss | 88.0% / 0.0% |
| At-risk passengers reaching the gate in time (55.1 per day classified URGENT on arrival under `fifo`) | 76.8% with `fifo`, 87.0% with `fifo-manual@advise` |
| Change in mean time from arrival to screening (min) | -0.12 [-0.15, -0.09] |
| Change in mean time standing in a queue (min) | -0.12 [-0.15, -0.08] |

| `priority-v3` compared with `fifo` | Mean per day [95% CI] |
|---|---:|
| Flights saved: missed with `fifo`, caught with `priority-v3` | 6.7 [5.9, 7.5] |
| Flights lost: caught with `fifo`, missed with `priority-v3` | 0.8 [0.6, 1.0] |
| **Net flights saved** | **5.9 [5.2, 6.8]** |
| Days with a net gain / with a net loss | 83.5% / 5.5% |
| At-risk passengers reaching the gate in time (55.1 per day classified URGENT on arrival under `fifo`) | 76.8% with `fifo`, 88.7% with `priority-v3` |
| Change in mean time from arrival to screening (min) | 0.00 [0.00, 0.00] |
| Change in mean time standing in a queue (min) | -0.56 [-0.60, -0.53] |

| `priority-v3@predict` compared with `fifo` | Mean per day [95% CI] |
|---|---:|
| Flights saved: missed with `fifo`, caught with `priority-v3@predict` | 6.9 [6.1, 7.8] |
| Flights lost: caught with `fifo`, missed with `priority-v3@predict` | 0.5 [0.4, 0.7] |
| **Net flights saved** | **6.4 [5.6, 7.3]** |
| Days with a net gain / with a net loss | 85.5% / 4.0% |
| At-risk passengers reaching the gate in time (55.1 per day classified URGENT on arrival under `fifo`) | 76.8% with `fifo`, 88.8% with `priority-v3@predict` |
| Change in mean time from arrival to screening (min) | -0.15 [-0.19, -0.13] |
| Change in mean time standing in a queue (min) | -0.58 [-0.62, -0.55] |

| `priority-v3@advise` compared with `fifo` | Mean per day [95% CI] |
|---|---:|
| Flights saved: missed with `fifo`, caught with `priority-v3@advise` | 6.9 [6.1, 7.8] |
| Flights lost: caught with `fifo`, missed with `priority-v3@advise` | 0.7 [0.5, 0.8] |
| **Net flights saved** | **6.2 [5.4, 7.1]** |
| Days with a net gain / with a net loss | 84.0% / 4.5% |
| At-risk passengers reaching the gate in time (55.1 per day classified URGENT on arrival under `fifo`) | 76.8% with `fifo`, 88.9% with `priority-v3@advise` |
| Change in mean time from arrival to screening (min) | -0.07 [-0.10, -0.05] |
| Change in mean time standing in a queue (min) | -0.57 [-0.61, -0.53] |

| `fifo-manual@reactive` compared with `fifo-manual` | Mean per day [95% CI] |
|---|---:|
| Flights saved: missed with `fifo-manual`, caught with `fifo-manual@reactive` | 0.3 [0.1, 0.6] |
| Flights lost: caught with `fifo-manual`, missed with `fifo-manual@reactive` | 0.0 [0.0, 0.0] |
| **Net flights saved** | **0.3 [0.1, 0.6]** |
| Days with a net gain / with a net loss | 8.0% / 0.5% |
| At-risk passengers reaching the gate in time (55.0 per day classified URGENT on arrival under `fifo-manual`) | 86.4% with `fifo-manual`, 86.8% with `fifo-manual@reactive` |
| Change in mean time from arrival to screening (min) | -0.04 [-0.06, -0.03] |
| Change in mean time standing in a queue (min) | -0.04 [-0.06, -0.03] |

| `fifo-manual@predict` compared with `fifo-manual` | Mean per day [95% CI] |
|---|---:|
| Flights saved: missed with `fifo-manual`, caught with `fifo-manual@predict` | 0.5 [0.2, 0.8] |
| Flights lost: caught with `fifo-manual`, missed with `fifo-manual@predict` | 0.0 [0.0, 0.0] |
| **Net flights saved** | **0.5 [0.2, 0.8]** |
| Days with a net gain / with a net loss | 14.0% / 0.5% |
| At-risk passengers reaching the gate in time (55.0 per day classified URGENT on arrival under `fifo-manual`) | 86.4% with `fifo-manual`, 87.1% with `fifo-manual@predict` |
| Change in mean time from arrival to screening (min) | -0.16 [-0.19, -0.13] |
| Change in mean time standing in a queue (min) | -0.16 [-0.19, -0.12] |

| `fifo-manual@predict` compared with `fifo-manual@reactive` | Mean per day [95% CI] |
|---|---:|
| Flights saved: missed with `fifo-manual@reactive`, caught with `fifo-manual@predict` | 0.2 [0.1, 0.3] |
| Flights lost: caught with `fifo-manual@reactive`, missed with `fifo-manual@predict` | 0.0 [0.0, 0.0] |
| **Net flights saved** | **0.2 [0.1, 0.3]** |
| Days with a net gain / with a net loss | 8.5% / 0.5% |
| At-risk passengers reaching the gate in time (53.0 per day classified URGENT on arrival under `fifo-manual@reactive`) | 86.3% with `fifo-manual@reactive`, 86.6% with `fifo-manual@predict` |
| Change in mean time from arrival to screening (min) | -0.12 [-0.14, -0.09] |
| Change in mean time standing in a queue (min) | -0.12 [-0.14, -0.09] |

| `fifo-manual@advise` compared with `fifo-manual` | Mean per day [95% CI] |
|---|---:|
| Flights saved: missed with `fifo-manual`, caught with `fifo-manual@advise` | 0.4 [0.2, 0.7] |
| Flights lost: caught with `fifo-manual`, missed with `fifo-manual@advise` | 0.0 [0.0, 0.0] |
| **Net flights saved** | **0.4 [0.2, 0.7]** |
| Days with a net gain / with a net loss | 12.0% / 0.0% |
| At-risk passengers reaching the gate in time (55.0 per day classified URGENT on arrival under `fifo-manual`) | 86.4% with `fifo-manual`, 87.0% with `fifo-manual@advise` |
| Change in mean time from arrival to screening (min) | -0.12 [-0.15, -0.09] |
| Change in mean time standing in a queue (min) | -0.12 [-0.15, -0.09] |

| `fifo-manual@advise` compared with `fifo-manual@reactive` | Mean per day [95% CI] |
|---|---:|
| Flights saved: missed with `fifo-manual@reactive`, caught with `fifo-manual@advise` | 0.1 [0.1, 0.2] |
| Flights lost: caught with `fifo-manual@reactive`, missed with `fifo-manual@advise` | 0.0 [0.0, 0.0] |
| **Net flights saved** | **0.1 [0.0, 0.2]** |
| Days with a net gain / with a net loss | 6.5% / 0.5% |
| At-risk passengers reaching the gate in time (53.0 per day classified URGENT on arrival under `fifo-manual@reactive`) | 86.3% with `fifo-manual@reactive`, 86.5% with `fifo-manual@advise` |
| Change in mean time from arrival to screening (min) | -0.07 [-0.10, -0.05] |
| Change in mean time standing in a queue (min) | -0.07 [-0.10, -0.05] |

| `fifo-manual@advise` compared with `fifo-manual@predict` | Mean per day [95% CI] |
|---|---:|
| Flights saved: missed with `fifo-manual@predict`, caught with `fifo-manual@advise` | 0.0 [0.0, 0.1] |
| Flights lost: caught with `fifo-manual@predict`, missed with `fifo-manual@advise` | 0.1 [0.0, 0.2] |
| **Net flights saved** | **0.0 [-0.1, 0.0]** |
| Days with a net gain / with a net loss | 2.0% / 4.0% |
| At-risk passengers reaching the gate in time (49.5 per day classified URGENT on arrival under `fifo-manual@predict`) | 85.7% with `fifo-manual@predict`, 85.7% with `fifo-manual@advise` |
| Change in mean time from arrival to screening (min) | 0.04 [0.02, 0.07] |
| Change in mean time standing in a queue (min) | 0.04 [0.02, 0.07] |

| `priority-v3` compared with `fifo-manual` | Mean per day [95% CI] |
|---|---:|
| Flights saved: missed with `fifo-manual`, caught with `priority-v3` | 1.5 [1.2, 1.9] |
| Flights lost: caught with `fifo-manual`, missed with `priority-v3` | 1.3 [1.1, 1.5] |
| **Net flights saved** | **0.3 [-0.1, 0.7]** |
| Days with a net gain / with a net loss | 34.5% / 34.5% |
| At-risk passengers reaching the gate in time (55.0 per day classified URGENT on arrival under `fifo-manual`) | 86.4% with `fifo-manual`, 88.7% with `priority-v3` |
| Change in mean time from arrival to screening (min) | 0.00 [0.00, 0.00] |
| Change in mean time standing in a queue (min) | -0.56 [-0.60, -0.53] |

| `priority-v3@predict` compared with `priority-v3` | Mean per day [95% CI] |
|---|---:|
| Flights saved: missed with `priority-v3`, caught with `priority-v3@predict` | 0.5 [0.3, 0.7] |
| Flights lost: caught with `priority-v3`, missed with `priority-v3@predict` | 0.0 [0.0, 0.1] |
| **Net flights saved** | **0.5 [0.3, 0.7]** |
| Days with a net gain / with a net loss | 19.5% / 1.0% |
| At-risk passengers reaching the gate in time (94.0 per day classified URGENT on arrival under `priority-v3`) | 92.6% with `priority-v3`, 92.7% with `priority-v3@predict` |
| Change in mean time from arrival to screening (min) | -0.15 [-0.19, -0.13] |
| Change in mean time standing in a queue (min) | -0.02 [-0.03, -0.01] |

| `priority-v3@predict` compared with `fifo-manual@predict` | Mean per day [95% CI] |
|---|---:|
| Flights saved: missed with `fifo-manual@predict`, caught with `priority-v3@predict` | 1.2 [0.9, 1.5] |
| Flights lost: caught with `fifo-manual@predict`, missed with `priority-v3@predict` | 0.9 [0.8, 1.1] |
| **Net flights saved** | **0.3 [-0.1, 0.6]** |
| Days with a net gain / with a net loss | 34.5% / 29.5% |
| At-risk passengers reaching the gate in time (49.5 per day classified URGENT on arrival under `fifo-manual@predict`) | 85.7% with `fifo-manual@predict`, 87.7% with `priority-v3@predict` |
| Change in mean time from arrival to screening (min) | 0.00 [0.00, 0.01] |
| Change in mean time standing in a queue (min) | -0.43 [-0.46, -0.40] |

| `priority-v3@predict` compared with `fifo-manual@reactive` | Mean per day [95% CI] |
|---|---:|
| Flights saved: missed with `fifo-manual@reactive`, caught with `priority-v3@predict` | 1.4 [1.1, 1.7] |
| Flights lost: caught with `fifo-manual@reactive`, missed with `priority-v3@predict` | 1.0 [0.8, 1.2] |
| **Net flights saved** | **0.4 [0.1, 0.8]** |
| Days with a net gain / with a net loss | 36.5% / 27.5% |
| At-risk passengers reaching the gate in time (53.0 per day classified URGENT on arrival under `fifo-manual@reactive`) | 86.3% with `fifo-manual@reactive`, 88.4% with `priority-v3@predict` |
| Change in mean time from arrival to screening (min) | -0.11 [-0.14, -0.09] |
| Change in mean time standing in a queue (min) | -0.54 [-0.57, -0.51] |

| `priority-v3@advise` compared with `priority-v3` | Mean per day [95% CI] |
|---|---:|
| Flights saved: missed with `priority-v3`, caught with `priority-v3@advise` | 0.3 [0.2, 0.5] |
| Flights lost: caught with `priority-v3`, missed with `priority-v3@advise` | 0.0 [0.0, 0.0] |
| **Net flights saved** | **0.3 [0.2, 0.4]** |
| Days with a net gain / with a net loss | 11.5% / 0.5% |
| At-risk passengers reaching the gate in time (94.0 per day classified URGENT on arrival under `priority-v3`) | 92.6% with `priority-v3`, 92.7% with `priority-v3@advise` |
| Change in mean time from arrival to screening (min) | -0.07 [-0.10, -0.05] |
| Change in mean time standing in a queue (min) | -0.01 [-0.01, 0.00] |

| `priority-v3@advise` compared with `priority-v3@predict` | Mean per day [95% CI] |
|---|---:|
| Flights saved: missed with `priority-v3@predict`, caught with `priority-v3@advise` | 0.1 [0.0, 0.1] |
| Flights lost: caught with `priority-v3@predict`, missed with `priority-v3@advise` | 0.3 [0.1, 0.4] |
| **Net flights saved** | **-0.2 [-0.3, -0.1]** |
| Days with a net gain / with a net loss | 3.0% / 11.5% |
| At-risk passengers reaching the gate in time (89.6 per day classified URGENT on arrival under `priority-v3@predict`) | 92.3% with `priority-v3@predict`, 92.3% with `priority-v3@advise` |
| Change in mean time from arrival to screening (min) | 0.08 [0.06, 0.11] |
| Change in mean time standing in a queue (min) | 0.01 [0.01, 0.02] |

| `priority-v3@advise` compared with `fifo-manual@advise` | Mean per day [95% CI] |
|---|---:|
| Flights saved: missed with `fifo-manual@advise`, caught with `priority-v3@advise` | 1.2 [1.0, 1.5] |
| Flights lost: caught with `fifo-manual@advise`, missed with `priority-v3@advise` | 1.1 [0.9, 1.3] |
| **Net flights saved** | **0.1 [-0.2, 0.5]** |
| Days with a net gain / with a net loss | 33.5% / 32.5% |
| At-risk passengers reaching the gate in time (50.5 per day classified URGENT on arrival under `fifo-manual@advise`) | 85.9% with `fifo-manual@advise`, 87.9% with `priority-v3@advise` |
| Change in mean time from arrival to screening (min) | 0.04 [0.03, 0.06] |
| Change in mean time standing in a queue (min) | -0.46 [-0.48, -0.43] |

| `priority-v3@advise` compared with `fifo-manual@reactive` | Mean per day [95% CI] |
|---|---:|
| Flights saved: missed with `fifo-manual@reactive`, caught with `priority-v3@advise` | 1.4 [1.1, 1.6] |
| Flights lost: caught with `fifo-manual@reactive`, missed with `priority-v3@advise` | 1.1 [0.9, 1.3] |
| **Net flights saved** | **0.2 [-0.1, 0.6]** |
| Days with a net gain / with a net loss | 34.5% / 31.0% |
| At-risk passengers reaching the gate in time (53.0 per day classified URGENT on arrival under `fifo-manual@reactive`) | 86.3% with `fifo-manual@reactive`, 88.5% with `priority-v3@advise` |
| Change in mean time from arrival to screening (min) | -0.03 [-0.05, -0.01] |
| Change in mean time standing in a queue (min) | -0.53 [-0.56, -0.50] |

## 2. Waiting times

*Time to screening*: minutes from arrival at the checkpoint (when the ticket is issued) to the start of screening. *Standing*: minutes spent standing in a queue: the whole wait in a physical queue; in a virtual queue only the wait at the lanes after validating the ticket. Each column is the mean over days of the daily statistic; "longest" is the longest single value over all simulated days.

| Policy | Time to screening: mean | P50 | P90 | P99 | Longest | Standing: mean | P90 | Longest |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| `fifo` | 1.1 | 0.2 | 4.7 | 7.8 | 21.1 | 1.1 | 4.7 | 21.1 |
| `fifo-manual` | 1.1 | 0.2 | 4.7 | 7.8 | 24.4 | 1.1 | 4.7 | 24.4 |
| `fifo-manual@reactive` | 1.0 | 0.1 | 4.5 | 7.7 | 15.6 | 1.0 | 4.5 | 15.6 |
| `fifo-manual@predict` | 0.9 | 0.1 | 3.9 | 7.0 | 11.8 | 0.9 | 3.9 | 11.8 |
| `fifo-manual@advise` | 1.0 | 0.1 | 4.1 | 7.2 | 13.0 | 1.0 | 4.1 | 13.0 |
| `priority-v3` | 1.1 | 0.2 | 4.6 | 8.1 | 79.5 | 0.5 | 1.7 | 5.5 |
| `priority-v3@predict` | 0.9 | 0.1 | 3.8 | 7.2 | 74.1 | 0.5 | 1.7 | 5.4 |
| `priority-v3@advise` | 1.0 | 0.1 | 4.2 | 7.6 | 75.5 | 0.5 | 1.7 | 5.4 |

## 3. Cost for passengers not prioritised by `fifo-manual` (compared with `fifo`)

Extra wait = time to screening with the candidate minus time to screening with the reference, for the same passenger.

| Metric | Value [95% CI] |
|---|---:|
| Passengers prioritised per day | 76.1 (P5-P95 45.0-114.2) (0.35% of tickets called) |
| Mean extra wait of non-prioritised passengers (min) | 0.01 [0.01, 0.01] |
| P90 extra wait of non-prioritised passengers (min) | 0.02 [0.01, 0.02] |
| Largest extra wait of any non-prioritised passenger, worst day (min) | 6.0 |
| Share of non-prioritised passengers delayed by more than 5 min | 0.00% |
| Most people who overtook one ticket, worst day (no bound for staff flight calls) | 46 |

## 4. Cost for passengers not prioritised by `fifo-manual@reactive` (compared with `fifo`)

Extra wait = time to screening with the candidate minus time to screening with the reference, for the same passenger.

| Metric | Value [95% CI] |
|---|---:|
| Passengers prioritised per day | 73.0 (P5-P95 44.0-106.0) (0.34% of tickets called) |
| Mean extra wait of non-prioritised passengers (min) | -0.03 [-0.05, -0.02] |
| P90 extra wait of non-prioritised passengers (min) | 0.01 [0.01, 0.01] |
| Largest extra wait of any non-prioritised passenger, worst day (min) | 2.8 |
| Share of non-prioritised passengers delayed by more than 5 min | 0.00% |
| Most people who overtook one ticket, worst day (no bound for staff flight calls) | 21 |

## 5. Cost for passengers not prioritised by `fifo-manual@predict` (compared with `fifo`)

Extra wait = time to screening with the candidate minus time to screening with the reference, for the same passenger.

| Metric | Value [95% CI] |
|---|---:|
| Passengers prioritised per day | 66.7 (P5-P95 38.0-98.0) (0.31% of tickets called) |
| Mean extra wait of non-prioritised passengers (min) | -0.15 [-0.18, -0.12] |
| P90 extra wait of non-prioritised passengers (min) | 0.01 [0.01, 0.01] |
| Largest extra wait of any non-prioritised passenger, worst day (min) | 1.9 |
| Share of non-prioritised passengers delayed by more than 5 min | 0.00% |
| Most people who overtook one ticket, worst day (no bound for staff flight calls) | 21 |

## 6. Cost for passengers not prioritised by `fifo-manual@advise` (compared with `fifo`)

Extra wait = time to screening with the candidate minus time to screening with the reference, for the same passenger.

| Metric | Value [95% CI] |
|---|---:|
| Passengers prioritised per day | 69.1 (P5-P95 39.0-103.0) (0.32% of tickets called) |
| Mean extra wait of non-prioritised passengers (min) | -0.11 [-0.14, -0.08] |
| P90 extra wait of non-prioritised passengers (min) | 0.01 [0.01, 0.01] |
| Largest extra wait of any non-prioritised passenger, worst day (min) | 1.9 |
| Share of non-prioritised passengers delayed by more than 5 min | 0.00% |
| Most people who overtook one ticket, worst day (no bound for staff flight calls) | 21 |

## 7. Cost for passengers not prioritised by `priority-v3` (compared with `fifo`)

Extra wait = time to screening with the candidate minus time to screening with the reference, for the same passenger.

| Metric | Value [95% CI] |
|---|---:|
| Passengers prioritised per day | 96.9 (P5-P95 69.0-134.1) (0.43% of tickets called) |
| Mean extra wait of non-prioritised passengers (min) | 0.01 [0.01, 0.01] |
| P90 extra wait of non-prioritised passengers (min) | 0.01 [0.00, 0.01] |
| Largest extra wait of any non-prioritised passenger, worst day (min) | 73.4 |
| Share of non-prioritised passengers delayed by more than 5 min | 0.17% |
| Most people who overtook one ticket, worst day (bound K = 30, passes in the window and at the lanes included) | 30 |
| Calls where the cap blocked a priority call, per day | 0.3 |
| Calls where the overtake guard took precedence (a ticket had reached K overtakes), per day | 0.0 |
| People through the fast track per day | 96.8 |
| People passed at the lanes by fast-tracked parties per day | 951.6 |

## 8. Cost for passengers not prioritised by `priority-v3@predict` (compared with `fifo`)

Extra wait = time to screening with the candidate minus time to screening with the reference, for the same passenger.

| Metric | Value [95% CI] |
|---|---:|
| Passengers prioritised per day | 91.5 (P5-P95 67.9-115.0) (0.41% of tickets called) |
| Mean extra wait of non-prioritised passengers (min) | -0.15 [-0.18, -0.12] |
| P90 extra wait of non-prioritised passengers (min) | 0.00 [0.00, 0.00] |
| Largest extra wait of any non-prioritised passenger, worst day (min) | 68.0 |
| Share of non-prioritised passengers delayed by more than 5 min | 0.12% |
| Most people who overtook one ticket, worst day (bound K = 30, passes in the window and at the lanes included) | 22 |
| Calls where the cap blocked a priority call, per day | 0.0 |
| Calls where the overtake guard took precedence (a ticket had reached K overtakes), per day | 0.0 |
| People through the fast track per day | 91.5 |
| People passed at the lanes by fast-tracked parties per day | 783.0 |

## 9. Cost for passengers not prioritised by `priority-v3@advise` (compared with `fifo`)

Extra wait = time to screening with the candidate minus time to screening with the reference, for the same passenger.

| Metric | Value [95% CI] |
|---|---:|
| Passengers prioritised per day | 93.7 (P5-P95 68.0-121.0) (0.41% of tickets called) |
| Mean extra wait of non-prioritised passengers (min) | -0.07 [-0.09, -0.04] |
| P90 extra wait of non-prioritised passengers (min) | 0.01 [0.00, 0.01] |
| Largest extra wait of any non-prioritised passenger, worst day (min) | 69.4 |
| Share of non-prioritised passengers delayed by more than 5 min | 0.15% |
| Most people who overtook one ticket, worst day (bound K = 30, passes in the window and at the lanes included) | 20 |
| Calls where the cap blocked a priority call, per day | 0.0 |
| Calls where the overtake guard took precedence (a ticket had reached K overtakes), per day | 0.0 |
| People through the fast track per day | 93.7 |
| People passed at the lanes by fast-tracked parties per day | 869.1 |

## 10. Cost for passengers not prioritised by `priority-v3` (compared with `fifo-manual`)

Extra wait = time to screening with the candidate minus time to screening with the reference, for the same passenger.

| Metric | Value [95% CI] |
|---|---:|
| Passengers prioritised per day | 96.9 (P5-P95 69.0-134.1) (0.43% of tickets called) |
| Mean extra wait of non-prioritised passengers (min) | 0.00 [0.00, 0.00] |
| P90 extra wait of non-prioritised passengers (min) | 0.00 [0.00, 0.01] |
| Largest extra wait of any non-prioritised passenger, worst day (min) | 73.4 |
| Share of non-prioritised passengers delayed by more than 5 min | 0.18% |
| Most people who overtook one ticket, worst day (bound K = 30, passes in the window and at the lanes included) | 30 |
| Calls where the cap blocked a priority call, per day | 0.3 |
| Calls where the overtake guard took precedence (a ticket had reached K overtakes), per day | 0.0 |
| People through the fast track per day | 96.8 |
| People passed at the lanes by fast-tracked parties per day | 951.6 |

## 11. Cost for passengers not prioritised by `priority-v3@predict` (compared with `fifo-manual@predict`)

Extra wait = time to screening with the candidate minus time to screening with the reference, for the same passenger.

| Metric | Value [95% CI] |
|---|---:|
| Passengers prioritised per day | 91.5 (P5-P95 67.9-115.0) (0.41% of tickets called) |
| Mean extra wait of non-prioritised passengers (min) | 0.00 [0.00, 0.01] |
| P90 extra wait of non-prioritised passengers (min) | 0.02 [0.00, 0.04] |
| Largest extra wait of any non-prioritised passenger, worst day (min) | 69.0 |
| Share of non-prioritised passengers delayed by more than 5 min | 0.15% |
| Most people who overtook one ticket, worst day (bound K = 30, passes in the window and at the lanes included) | 22 |
| Calls where the cap blocked a priority call, per day | 0.0 |
| Calls where the overtake guard took precedence (a ticket had reached K overtakes), per day | 0.0 |
| People through the fast track per day | 91.5 |
| People passed at the lanes by fast-tracked parties per day | 783.0 |

## 12. Cost for passengers not prioritised by `priority-v3@predict` (compared with `fifo-manual@reactive`)

Extra wait = time to screening with the candidate minus time to screening with the reference, for the same passenger.

| Metric | Value [95% CI] |
|---|---:|
| Passengers prioritised per day | 91.5 (P5-P95 67.9-115.0) (0.41% of tickets called) |
| Mean extra wait of non-prioritised passengers (min) | -0.11 [-0.14, -0.09] |
| P90 extra wait of non-prioritised passengers (min) | 0.00 [0.00, 0.00] |
| Largest extra wait of any non-prioritised passenger, worst day (min) | 68.0 |
| Share of non-prioritised passengers delayed by more than 5 min | 0.13% |
| Most people who overtook one ticket, worst day (bound K = 30, passes in the window and at the lanes included) | 22 |
| Calls where the cap blocked a priority call, per day | 0.0 |
| Calls where the overtake guard took precedence (a ticket had reached K overtakes), per day | 0.0 |
| People through the fast track per day | 91.5 |
| People passed at the lanes by fast-tracked parties per day | 783.0 |

## 13. Cost for passengers not prioritised by `priority-v3@advise` (compared with `fifo-manual@advise`)

Extra wait = time to screening with the candidate minus time to screening with the reference, for the same passenger.

| Metric | Value [95% CI] |
|---|---:|
| Passengers prioritised per day | 93.7 (P5-P95 68.0-121.0) (0.41% of tickets called) |
| Mean extra wait of non-prioritised passengers (min) | 0.04 [0.03, 0.06] |
| P90 extra wait of non-prioritised passengers (min) | 0.11 [0.07, 0.17] |
| Largest extra wait of any non-prioritised passenger, worst day (min) | 70.8 |
| Share of non-prioritised passengers delayed by more than 5 min | 0.23% |
| Most people who overtook one ticket, worst day (bound K = 30, passes in the window and at the lanes included) | 20 |
| Calls where the cap blocked a priority call, per day | 0.0 |
| Calls where the overtake guard took precedence (a ticket had reached K overtakes), per day | 0.0 |
| People through the fast track per day | 93.7 |
| People passed at the lanes by fast-tracked parties per day | 869.1 |

## 14. Cost for passengers not prioritised by `priority-v3@advise` (compared with `fifo-manual@reactive`)

Extra wait = time to screening with the candidate minus time to screening with the reference, for the same passenger.

| Metric | Value [95% CI] |
|---|---:|
| Passengers prioritised per day | 93.7 (P5-P95 68.0-121.0) (0.41% of tickets called) |
| Mean extra wait of non-prioritised passengers (min) | -0.03 [-0.05, -0.01] |
| P90 extra wait of non-prioritised passengers (min) | 0.03 [0.01, 0.05] |
| Largest extra wait of any non-prioritised passenger, worst day (min) | 69.4 |
| Share of non-prioritised passengers delayed by more than 5 min | 0.19% |
| Most people who overtook one ticket, worst day (bound K = 30, passes in the window and at the lanes included) | 20 |
| Calls where the cap blocked a priority call, per day | 0.0 |
| Calls where the overtake guard took precedence (a ticket had reached K overtakes), per day | 0.0 |
| People through the fast track per day | 93.7 |
| People passed at the lanes by fast-tracked parties per day | 869.1 |

## 15. Call mechanics

Virtual queues only. A *second call* is made when the passenger has not presented within the call timeout; a *no-show* (missed call) is a ticket not validated after the second timeout. A no-show who rescans within the reactivation window is *reactivated*; later, the passenger needs a *new ticket*. *Idle lane time* counts open lanes with nobody to screen while passengers were waiting for or answering a call, as a share of the staffed lane time. Means per day.

| Policy | Calls | Second calls (share of calls) | No-shows (missed-call rate) | Reactivations | New tickets | Idle lane time (min, share) |
|---|---:|---:|---:|---:|---:|---:|
| `priority-v3` | 14899 | 82.1 (0.55%) | 32.5 (0.22%) | 31.0 | 1.5 | 0.1 (0.00%) |
| `priority-v3@predict` | 14892 | 63.5 (0.43%) | 25.9 (0.17%) | 24.7 | 1.2 | 0.1 (0.00%) |
| `priority-v3@advise` | 14896 | 73.5 (0.49%) | 29.4 (0.20%) | 28.0 | 1.4 | 0.1 (0.00%) |

## 16. Disruptions, data quality and stability

Disruptions of the simulated days (ground truth, the same for every policy), means per day. The system learns of a delay or a gate change only when the flight feed announces it; messages sent while the feed is down arrive when it recovers.

| Disruption | Per day |
|---|---:|
| Delayed flights (mean delay of a delayed flight, min) | 34.6 (27.4) |
| Gate changes | 13.7 |
| Lane outages (lane-minutes out of service) | 2.1 (47.0) |
| Feed outages (minutes without the feed) | 1.1 (35.9) |
| Feed messages (sent while the feed was down) | 48.3 (1.3) |

*Class changes* count the changes of risk class of waiting tickets under each policy's own classification. A *reversal* is a change in the direction opposite to the previous one, e.g. ATTENTION to URGENT and back: the flapping that hysteresis prevents. *Boosts on wrong information*: people prioritised while the system's knowledge of their flight differed from the truth (a delay or a gate change not yet known). Means per day.

| Policy | Missed among passengers of delayed or re-gated flights | Boosts on wrong information (people) | Class changes per 100 parties | Reversals | People whose class flapped |
|---|---:|---:|---:|---:|---:|
| `fifo` | 2.5 of 7104 | 0.0 | not classified | - | - |
| `fifo-manual` | 1.8 of 7104 | 6.8 | not classified | - | - |
| `fifo-manual@reactive` | 1.7 of 7104 | 6.5 | not classified | - | - |
| `fifo-manual@predict` | 1.7 of 7104 | 5.9 | not classified | - | - |
| `fifo-manual@advise` | 1.7 of 7104 | 6.1 | not classified | - | - |
| `priority-v3` | 1.8 of 7104 | 9.5 | 0.06 | 0.2 | 0.2 |
| `priority-v3@predict` | 1.7 of 7104 | 8.7 | 0.04 | 0.0 | 0.0 |
| `priority-v3@advise` | 1.8 of 7104 | 9.0 | 0.05 | 0.1 | 0.1 |

## 17. Groups, assisted passengers and late arrivals

Means per day. A group (two people or more) holds one ticket and counts as its people in every other table, in the priority cap and in the overtake bound. Assisted passengers are taken to the next free lane under every policy.

| Policy | Groups (people in groups) | Groups prioritised | Assisted passengers: people, mean time to screening (min), missed | Late on purpose: people, prioritised, missed |
|---|---:|---:|---:|---:|
| `fifo` | 4467.1 (11288.7) | 0.0 | 150.4, 0.04, 0.1 | none in this scenario |
| `fifo-manual` | 4467.1 (11288.7) | 15.8 | 150.4, 0.04, 0.1 | none in this scenario |
| `fifo-manual@reactive` | 4467.1 (11288.7) | 15.1 | 150.4, 0.04, 0.1 | none in this scenario |
| `fifo-manual@predict` | 4467.1 (11288.7) | 13.8 | 150.4, 0.04, 0.1 | none in this scenario |
| `fifo-manual@advise` | 4467.1 (11288.7) | 14.3 | 150.4, 0.04, 0.1 | none in this scenario |
| `priority-v3` | 4467.1 (11288.7) | 21.1 | 150.4, 0.04, 0.1 | none in this scenario |
| `priority-v3@predict` | 4467.1 (11288.7) | 20.0 | 150.4, 0.04, 0.1 | none in this scenario |
| `priority-v3@advise` | 4467.1 (11288.7) | 20.4 | 150.4, 0.04, 0.1 | none in this scenario |

## 18. Checkpoint operations

Means per day; "longest" is the largest value over all simulated days.

| Policy | Staffed lane-hours | Lane utilisation | Tickets waiting for a call: mean (longest) | People standing in a queue: mean (longest) | URGENT on arrival | CRITICAL on arrival |
|---|---:|---:|---:|---:|---:|---:|
| `fifo` | 169.4 | 85.8% | 19.2 (443) | 19.2 (443) | 55.1 | 7.5 |
| `fifo-manual` | 169.4 | 85.8% | 19.2 (445) | 19.2 (445) | 55.0 | 7.5 |
| `fifo-manual@reactive` | 169.6 | 85.7% | 18.4 (405) | 18.4 (405) | 53.0 | 7.5 |
| `fifo-manual@predict` | 170.0 | 85.5% | 16.4 (377) | 16.4 (377) | 49.5 | 7.5 |
| `fifo-manual@advise` | 169.9 | 85.5% | 17.1 (385) | 17.1 (385) | 50.5 | 7.5 |
| `priority-v3` | 169.4 | 85.8% | 6.8 (347) | 9.2 (95) | 94.0 | 7.5 |
| `priority-v3@predict` | 170.0 | 85.5% | 5.0 (272) | 8.9 (108) | 89.6 | 7.5 |
| `priority-v3@advise` | 169.7 | 85.6% | 5.9 (286) | 9.1 (109) | 91.3 | 7.5 |

## 19. Lane management

Extra lanes open beyond the plan, never more than the 14 lanes the checkpoint has, and at most 2 at the same time (the staff on call). A decision takes a median of 10 min to put a lane into service (varying from day to day), and an extra lane stays open at least 30 min. The supervisor of today's practice (`@reactive`) decides on the wait the queue shows; GateFlow (`@predict`) projects the queue from the forecast of arrivals and recommends lanes, as the console does (`@advise`, S22: its rule on the forecast of the next hour, from what the live system knows), and the duty manager follows 80% of its recommendations. Means per day; "most" is the largest value over all simulated days.

| Policy | Rule | Staffed lane-hours | of which extra | Extra lanes opened (closed) | Decisions (followed) | Most lanes open |
|---|---|---:|---:|---:|---:|---:|
| `fifo` | plan only | 169.4 | 0.0 | - | - | 12 |
| `fifo-manual` | plan only | 169.4 | 0.0 | - | - | 12 |
| `fifo-manual@reactive` | supervisor: opens when the queue shows more than 10 min, closes below 2 min | 169.6 | 0.2 | 0.3 (0.3) | 0.6 (0.6) | 14 |
| `fifo-manual@predict` | GateFlow: keeps the projected wait below 10 min over the next 45 min, closes below 3 min | 170.0 | 0.5 | 0.7 (0.7) | 1.6 (1.2) | 14 |
| `fifo-manual@advise` | GateFlow's console: keeps the median wait forecast below 10 min over the next 60 min, closes a lane beyond the plan below 2 min, 15 min between recommendations | 169.9 | 0.5 | 0.4 (0.4) | 1.0 (0.8) | 14 |
| `priority-v3` | plan only | 169.4 | 0.0 | - | - | 12 |
| `priority-v3@predict` | GateFlow: keeps the projected wait below 10 min over the next 45 min, closes below 3 min | 170.0 | 0.5 | 0.7 (0.7) | 1.6 (1.2) | 14 |
| `priority-v3@advise` | GateFlow's console: keeps the median wait forecast below 10 min over the next 60 min, closes a lane beyond the plan below 2 min, 15 min between recommendations | 169.7 | 0.3 | 0.3 (0.3) | 0.7 (0.6) | 14 |

What the extra lanes buy: each policy compared with the same calls under another lane rule, passenger by passenger. Means per day [95% CI]; the last two columns divide totals over all days by the extra lane-hours (shown when the candidate only adds lane-hours).

| Comparison | Extra lane-hours | Net flights saved | Change in mean time to screening (min) | Waiting saved per extra lane-hour (person-hours) | Net flights saved per extra lane-hour |
|---|---:|---:|---:|---:|---:|
| `fifo-manual@reactive` vs `fifo-manual` | 0.2 [0.1, 0.3] | 0.3 [0.1, 0.6] | -0.04 [-0.06, -0.03] | 75.1 [57.1, 91.0] | 1.56 [0.66, 2.69] |
| `fifo-manual@predict` vs `fifo-manual` | 0.5 [0.4, 0.6] | 0.5 [0.2, 0.8] | -0.16 [-0.19, -0.13] | 108.0 [94.0, 121.1] | 0.89 [0.46, 1.39] |
| `fifo-manual@predict` vs `fifo-manual@reactive` | 0.3 [0.3, 0.4] | 0.2 [0.1, 0.3] | -0.12 [-0.14, -0.09] | - | - |
| `fifo-manual@advise` vs `fifo-manual` | 0.5 [0.4, 0.6] | 0.4 [0.2, 0.7] | -0.12 [-0.15, -0.09] | 82.7 [69.1, 97.9] | 0.85 [0.45, 1.33] |
| `fifo-manual@advise` vs `fifo-manual@reactive` | 0.3 [0.2, 0.4] | 0.1 [0.0, 0.2] | -0.07 [-0.10, -0.05] | - | - |
| `fifo-manual@advise` vs `fifo-manual@predict` | 0.0 [-0.1, 0.1] | 0.0 [-0.1, 0.0] | 0.04 [0.02, 0.07] | - | - |
| `priority-v3@predict` vs `priority-v3` | 0.5 [0.4, 0.6] | 0.5 [0.3, 0.7] | -0.15 [-0.19, -0.13] | 104.5 [92.0, 118.6] | 0.87 [0.58, 1.17] |
| `priority-v3@advise` vs `priority-v3` | 0.3 [0.2, 0.4] | 0.3 [0.2, 0.4] | -0.07 [-0.10, -0.05] | 86.3 [65.5, 109.4] | 0.93 [0.61, 1.29] |
| `priority-v3@advise` vs `priority-v3@predict` | -0.2 [-0.3, -0.1] | -0.2 [-0.3, -0.1] | 0.08 [0.06, 0.11] | - | - |

## 20. Method

- Each seed is one simulated day of the same design day (same flights), with different passengers.
- All policies are run on exactly the same passengers (common random numbers), so each comparison is paired passenger by passenger: a flight is *saved* when the passenger misses it with the reference and catches it with the candidate, and *lost* in the opposite case.
- `fifo-manual` (A') adds today's manual handling to the physical queue: staff periodically call the flights closing soon and their passengers are taken first. Comparing GateFlow with A' estimates the benefit over today's real practice.
- Passengers are counted as people: a party of three that misses its flight counts as three, in every table and comparison.
- The status quo is a physical FIFO queue. GateFlow policies run a virtual queue: tickets are called so as to keep the free lanes plus a call-ahead buffer supplied; each passenger presents after their own response time (later when they miss the call), validates the ticket at the access point and queues briefly at the lanes. Comparing `virtual-fifo` with the status quo isolates the cost or benefit of the call mechanics; comparing a priority policy with `virtual-fifo` isolates the prioritisation.
- A passenger misses the flight when they reach the gate after boarding closes (ground truth).
- Confidence intervals: percentile bootstrap of the mean over days (2000 resamples, seed 20261121). Quantiles: linear interpolation between order statistics (Hyndman-Fan type 7).
- Risk classes are computed on arrival with the same parameters for every policy. URGENT means "would miss the flight if served in FIFO order, but can still make it if selected now"; CRITICAL means "cannot make it even if selected now": such passengers are escalated to staff and never boosted automatically.

## 21. Policies

### Physical FIFO queue (status quo, policy A): `fifo` 1.1.0

Selection: `fifo`. Queue: `physical` (physical queue: passengers stand in line and step forward when a lane is free).

### Physical FIFO queue with staff calling closing flights (status quo with manual handling, policy A'): `fifo-manual` 0.1.0

Selection: `flight-call`. Queue: `physical` (physical queue: passengers stand in line and step forward when a lane is free).

| Parameter | Value |
|---|---|
| selection.callWindowMs | 20.0 min |
| selection.announcementIntervalMs | 5.0 min |

All parameter values are initial hypotheses to be calibrated and approved, not measured optima.

### Physical FIFO queue with staff calling closing flights (status quo with manual handling, policy A'), with extra lanes opened by a supervisor when the queue is long (today): `fifo-manual@reactive` 0.1.0

Selection: `flight-call`. Queue: `physical` (physical queue: passengers stand in line and step forward when a lane is free). Lanes: `reactive` (supervisor: opens when the queue shows more than 10 min, closes below 2 min).

| Parameter | Value |
|---|---|
| selection.callWindowMs | 20.0 min |
| selection.announcementIntervalMs | 5.0 min |
| lanes.reviewIntervalMs | 5.0 min |
| lanes.openWhenWaitMs | 10.0 min |
| lanes.closeWhenWaitMs | 2.0 min |
| lanes.cooldownMs | 10.0 min |

All parameter values are initial hypotheses to be calibrated and approved, not measured optima.

### Physical FIFO queue with staff calling closing flights (status quo with manual handling, policy A'), with extra lanes recommended by GateFlow's forecast: `fifo-manual@predict` 0.1.0

Selection: `flight-call`. Queue: `physical` (physical queue: passengers stand in line and step forward when a lane is free). Lanes: `predict` (GateFlow: keeps the projected wait below 10 min over the next 45 min, closes below 3 min).

| Parameter | Value |
|---|---|
| selection.callWindowMs | 20.0 min |
| selection.announcementIntervalMs | 5.0 min |
| lanes.reviewIntervalMs | 5.0 min |
| lanes.horizonMs | 45.0 min |
| lanes.targetWaitMs | 10.0 min |
| lanes.closeWhenWaitMs | 3.0 min |
| lanes.cooldownMs | 10.0 min |

All parameter values are initial hypotheses to be calibrated and approved, not measured optima.

### Physical FIFO queue with staff calling closing flights (status quo with manual handling, policy A'), with extra lanes recommended by GateFlow's console: `fifo-manual@advise` 0.1.0

Selection: `flight-call`. Queue: `physical` (physical queue: passengers stand in line and step forward when a lane is free). Lanes: `advise` (GateFlow's console: keeps the median wait forecast below 10 min over the next 60 min, closes a lane beyond the plan below 2 min, 15 min between recommendations).

| Parameter | Value |
|---|---|
| selection.callWindowMs | 20.0 min |
| selection.announcementIntervalMs | 5.0 min |
| lanes.reviewIntervalMs | 5.0 min |
| lanes.horizonMs | 60.0 min |
| lanes.targetWaitMs | 10.0 min |
| lanes.closeWhenWaitMs | 2.0 min |
| lanes.cooldownMs | 15.0 min |

All parameter values are initial hypotheses to be calibrated and approved, not measured optima.

### GateFlow virtual queue with constrained EDF priority v3: fast track, stale-data rule and hysteresis (policy B): `priority-v3` 0.2.0

Selection: `constrained-edf`. Queue: `virtual` (GateFlow virtual queue: passengers wait anywhere, are called on displays and validate their ticket at the access point).

| Parameter | Value |
|---|---|
| selection.capWindowCalls | 20 |
| selection.capMaxPriorityCalls | 10 |
| selection.maxOvertakes | 30 |
| selection.attentionThresholdMs | 15.0 min |
| selection.safetyBufferMs | 5.0 min |
| selection.feasibilityMarginMs | 0.0 min |
| selection.allowRuleBasedDeadline | true |
| selection.eligibleSegments | DEPARTING; TRANSFER |
| selection.latePresentationCutoffMs | none |
| selection.fastTrack | true |
| selection.maxDeadlineAgeMs | 60.0 min |
| selection.hysteresisMs | 3.0 min |
| queue.callAheadSeconds | 180 s |
| queue.responseEstimateSeconds | 90 s |
| queue.prepareWindowSize | 10 |
| queue.callTimeoutMs | 3.0 min |
| queue.recallTimeoutMs | 2.0 min |
| queue.reactivationWindowMs | 15.0 min |
| queue.maxReactivations | 1 |
| queue.reactivationPosition | ORIGINAL |

All parameter values are initial hypotheses to be calibrated and approved, not measured optima.

### GateFlow virtual queue with constrained EDF priority v3: fast track, stale-data rule and hysteresis (policy B), with extra lanes recommended by GateFlow's forecast: `priority-v3@predict` 0.2.0

Selection: `constrained-edf`. Queue: `virtual` (GateFlow virtual queue: passengers wait anywhere, are called on displays and validate their ticket at the access point). Lanes: `predict` (GateFlow: keeps the projected wait below 10 min over the next 45 min, closes below 3 min).

| Parameter | Value |
|---|---|
| selection.capWindowCalls | 20 |
| selection.capMaxPriorityCalls | 10 |
| selection.maxOvertakes | 30 |
| selection.attentionThresholdMs | 15.0 min |
| selection.safetyBufferMs | 5.0 min |
| selection.feasibilityMarginMs | 0.0 min |
| selection.allowRuleBasedDeadline | true |
| selection.eligibleSegments | DEPARTING; TRANSFER |
| selection.latePresentationCutoffMs | none |
| selection.fastTrack | true |
| selection.maxDeadlineAgeMs | 60.0 min |
| selection.hysteresisMs | 3.0 min |
| queue.callAheadSeconds | 180 s |
| queue.responseEstimateSeconds | 90 s |
| queue.prepareWindowSize | 10 |
| queue.callTimeoutMs | 3.0 min |
| queue.recallTimeoutMs | 2.0 min |
| queue.reactivationWindowMs | 15.0 min |
| queue.maxReactivations | 1 |
| queue.reactivationPosition | ORIGINAL |
| lanes.reviewIntervalMs | 5.0 min |
| lanes.horizonMs | 45.0 min |
| lanes.targetWaitMs | 10.0 min |
| lanes.closeWhenWaitMs | 3.0 min |
| lanes.cooldownMs | 10.0 min |

All parameter values are initial hypotheses to be calibrated and approved, not measured optima.

### GateFlow virtual queue with constrained EDF priority v3: fast track, stale-data rule and hysteresis (policy B), with extra lanes recommended by GateFlow's console: `priority-v3@advise` 0.2.0

Selection: `constrained-edf`. Queue: `virtual` (GateFlow virtual queue: passengers wait anywhere, are called on displays and validate their ticket at the access point). Lanes: `advise` (GateFlow's console: keeps the median wait forecast below 10 min over the next 60 min, closes a lane beyond the plan below 2 min, 15 min between recommendations).

| Parameter | Value |
|---|---|
| selection.capWindowCalls | 20 |
| selection.capMaxPriorityCalls | 10 |
| selection.maxOvertakes | 30 |
| selection.attentionThresholdMs | 15.0 min |
| selection.safetyBufferMs | 5.0 min |
| selection.feasibilityMarginMs | 0.0 min |
| selection.allowRuleBasedDeadline | true |
| selection.eligibleSegments | DEPARTING; TRANSFER |
| selection.latePresentationCutoffMs | none |
| selection.fastTrack | true |
| selection.maxDeadlineAgeMs | 60.0 min |
| selection.hysteresisMs | 3.0 min |
| queue.callAheadSeconds | 180 s |
| queue.responseEstimateSeconds | 90 s |
| queue.prepareWindowSize | 10 |
| queue.callTimeoutMs | 3.0 min |
| queue.recallTimeoutMs | 2.0 min |
| queue.reactivationWindowMs | 15.0 min |
| queue.maxReactivations | 1 |
| queue.reactivationPosition | ORIGINAL |
| lanes.reviewIntervalMs | 5.0 min |
| lanes.horizonMs | 60.0 min |
| lanes.targetWaitMs | 10.0 min |
| lanes.closeWhenWaitMs | 2.0 min |
| lanes.cooldownMs | 15.0 min |

All parameter values are initial hypotheses to be calibrated and approved, not measured optima.

## 22. Data sources and licences

Where the data of this scenario comes from, and the terms under which it may be used.

| Source | Kind | Provider | Licence or terms of use | Retrieved | Used for |
|---|---|---|---|---|---|
| Synthetic assumptions of this airport configuration (`gateflow-synthetic`) | SYNTHETIC | GateFlow | Created for GateFlow; contains no third-party data. | - | - |
| Venice Marco Polo traffic in 2025 (11.85 million passengers) (`save-traffic-2025`) | LITERATURE | SAVE S.p.A., annual figure as reported in the business plan and in the press | Published aggregate figure, cited with attribution. Used only to size the synthetic day. | 2026-11-21 | passengers.loadFactor |
| Synthetic flight list of the scenario library (`library-flights`) | SYNTHETIC | GateFlow (scenarios/flights/make-library-flights.mjs) | Created for GateFlow; contains no third-party schedule data. | - | flight list |

- `save-traffic-2025`: 11,850,336 passengers in 2025 according to the business plan (marked verified there); press coverage of SAVE's results gives 11.85 million. Not re-verified against SAVE's own publication, whose website refused automated access.

Airport configuration: `vce-like` (VCE-like airport (synthetic)), checkpoint `departures`, file `../airports/vce-like.yaml` (SHA-256 `ac6f19af1d1a9e260dfb815b1efc4bc5a41282500072bb1c70895bf978cd10ec`). The scenario gives only its day; every other parameter comes from this configuration.

Design day: 138 departures from the flight list `flights/vce-like-peak-day.csv` (SHA-256 `e3a5886b882c0135d44ff8954108f30787d51babdfa325454870803038c7ac9e`), source `library-flights`.

## 23. Assumptions

Every model parameter, with its source. SYNTHETIC values are illustrative assumptions.

| Parameter | Value | Source | Note |
|---|---|---|---|
| checkpoint.lanesAvailable | 14 | SYNTHETIC | Lanes the checkpoint has (assumed): the roster plans at most 12, the others open only as extra lanes. |
| checkpoint.laneSchedule | from 00:00, lanes 2; from 03:00, lanes 4; from 04:00, lanes 10; from 05:00, lanes 12; from 07:00, lanes 10; from 08:00, lanes 11; from 11:00, lanes 10; from 12:00, lanes 9; from 13:00, lanes 10; from 14:00, lanes 12; from 15:00, lanes 10; from 16:00, lanes 9; from 17:00, lanes 8; from 18:00, lanes 7; from 19:00, lanes 6; from 20:00, lanes 3; from 21:00, lanes 2 | SYNTHETIC | Planned for this day with the lane plan rule of the checkpoint (airports/vce-like.yaml): 177.0 lane-hours. gateflow-sim lanes --scenario <this file> prints the plan again. |
| checkpoint.lanePlanRule | utilisation 0.9, intervalMinutes 60, minLanes 2, maxLanes 12, planningDays 100 | SYNTHETIC | Assumed planning rule, not the airport's: every hour, enough lanes to screen the expected arrivals at 90% utilisation, at least 2 and at most 12 lanes. |
| checkpoint.laneStaffing | maxExtraLanes 2, openDelayMinutes median 10, sigma 0.4, minOpenMinutes 30, followShare 0.8 | SYNTHETIC | Assumed: staff on call can open 2 extra lanes beyond the plan, about 10 minutes after the decision (5 to 20 on most days); an extra lane stays open at least 30 minutes; the duty manager follows 4 recommendations of GateFlow out of 5. |
| checkpoint.serviceTimeMeanSeconds | 24 | SYNTHETIC | About 150 passengers per hour per lane (assumed modern lanes with several divesting positions). |
| checkpoint.serviceTimeCv | 0.6 | SYNTHETIC |  |
| schedule.seats | aircraft A319, seats 156; aircraft A320, seats 180; aircraft A20N, seats 186; aircraft A321, seats 200; aircraft A21N, seats 232; aircraft B738, seats 189; aircraft E190, seats 100; aircraft E195, seats 120; aircraft BCS3, seats 145; aircraft B763, seats 216; aircraft B788, seats 240; aircraft B789, seats 290; aircraft B77W, seats 360; aircraft A359, seats 300 | SYNTHETIC | Assumed typical configurations by ICAO type designator (one class on short haul, two or three on long haul), not airline data. Replace with the airport's seat data. |
| schedule.gateZones | id A, walkMinutes 5, share 0.45; id B, walkMinutes 9, share 0.35; id C, walkMinutes 15, share 0.2 | SYNTHETIC | Nominal walk from the checkpoint exit: A and B are Schengen gates, C non-Schengen gates after passport control (its queue is not modelled). Long-haul flights use zone C; the others draw a zone with these shares. |
| passengers.loadFactor | min 0.72, mode 0.9, max 1 | SYNTHETIC (save-traffic-2025) | Summer load factors, drawn per flight and day. With the flight list the day has about 22,000 departing passengers, about 1.35 times the average day of 2025 (11.85 million passengers, half of them departing, over 365 days): assumed peak-day factor. |
| passengers.transferShare | 0.02 | SYNTHETIC | Few connecting passengers cross this checkpoint (an origin-and-destination airport). |
| passengers.showUp.departing | minMinutesBeforeStd 25, medianExtraMinutes 70, sigma 0.55, maxMinutesBeforeStd 240 | SYNTHETIC | Arrival at the checkpoint = STD minus (25 min + log-normal with median 70 min), as in the demo scenario. |
| passengers.showUp.transfer | minMinutesBeforeStd 24, medianExtraMinutes 25, sigma 0.5, maxMinutesBeforeStd 180 | SYNTHETIC | Connecting passengers arrive later, after their inbound flight. |
| passengers.walkSpeedSigma | 0.2 | SYNTHETIC | Individual walking time = nominal zone time x log-normal(median 1, sigma). |
| passengers.callResponse | medianSeconds 75, sigma 0.5, absentProbability 0.04, absentExtraMedianMinutes 4, absentExtraSigma 0.8 | SYNTHETIC | Virtual queue only. As in the demo scenario; to be measured in a pilot. |
| passengers.groups | partySizes size 1, share 0.7; size 2, share 0.2; size 3, share 0.05; size 4, share 0.04; size 5, share 0.01 | SYNTHETIC | More couples and families than on a normal day (leisure season). |
| passengers.assistedShare | 0.007 | SYNTHETIC | Parties taking the assisted path (PRM and similar), as in the demo scenario. |
| passengers.strategicLateArrival | share 0, minMinutesBeforeStd 25, maxMinutesBeforeStd 35 | SYNTHETIC | Nobody arrives late on purpose. |
| operations.boardingCloseMinutesBeforeStd | 20 | SYNTHETIC | Boarding closes 20 minutes before the scheduled departure, for every flight. |
| operations.deadlineKnowledge | RULE | SYNTHETIC | The system applies the closing rule to the schedule; without disruptions it matches the ground truth exactly. |
| disruptions.flightDelays | share 0.25, medianMinutes 20, sigma 0.8, maxMinutes 180, noticeMinMinutesBeforeStd 10, noticeMaxMinutesBeforeStd 120 | SYNTHETIC | A quarter of the flights are delayed (log-normal, median 20 minutes). The delay is announced uniformly between 120 and 10 minutes before the scheduled departure; passengers still arrive for the scheduled departure. |
| disruptions.gateChanges | share 0.1, minMinutesBeforeStd 30, maxMinutesBeforeStd 70, noticeDelayMaxMinutes 5 | SYNTHETIC | A tenth of the flights change gate 70 to 30 minutes before departure; the feed reports it up to 5 minutes later. Passengers screened after the change walk to the new gate. |
| disruptions.laneOutages | perDay 2, medianMinutes 20, sigma 0.5, maxMinutes 60 | SYNTHETIC | About two unplanned outages of one lane per day (median 20 minutes); at least one lane stays open. |
| disruptions.feedOutages | perDay 1, medianMinutes 30, sigma 0.6, maxMinutes 120 | SYNTHETIC | The flight feed goes down about once a day (median 30 minutes). Messages sent meanwhile arrive when it recovers. |
| gateflow | maxOvertakes 30, capMaxPriorityCalls 10, capWindowCalls 20, hysteresisMinutes 3, maxDeadlineAgeMinutes 60, prepareWindowSize 10, callAheadSeconds 180, responseEstimateSeconds 90, laneTargetWaitMinutes 10, laneHorizonMinutes 45 | SYNTHETIC | GateFlow defaults (priority v3 0.2.0, the virtual queue of ADR-017 and the lane recommendations of ADR-039), to be approved by the airport for this checkpoint. |
| todayPractice | callWindowMinutes 20, announcementIntervalMinutes 5, laneOpenWaitMinutes 10, laneCloseWaitMinutes 2 | SYNTHETIC | Baseline A' as in ADR-022: every 5 minutes staff call the flights closing within 20 minutes. With a supervisor (@reactive, ADR-039), an extra lane opens when the queue shows more than 10 minutes and closes below 2. To replace with how this airport handles urgent passengers and long queues. |
| fairnessTarget | maxShareDelayedOver5Min 0.001 | SYNTHETIC | The criterion of ADR-025, to be approved by the airport. |

## 24. Limitations of this model version

- Single checkpoint. Lanes follow a planned schedule, minus unplanned outages when the scenario has them: a lane going out of service finishes its passenger first, at least one lane always stays open, and the system knows at once.
- Extra lanes (policies with lane management, S8) open beyond the plan only up to the lanes the checkpoint has and the staff on call. A decision to open takes the day's delay to put a lane into service, an extra lane stays open for a minimum time, and staff go back when the plan itself needs the lane. Staff on call have no other duties in the model, and their cost is counted as extra lane-hours only. The supervisor of today's practice decides on the wait the queue shows; GateFlow recommends on a forecast of arrivals (the average of 50 other simulated days with the same flights, scaled by the arrivals of the last hour), and the duty manager follows each recommendation with the scenario's probability.
- Every passenger uses the virtual queue when one is simulated: no opt-outs, no passengers without a phone or a view of the displays.
- Response times and absences are drawn per party from assumed distributions. A second call does not make an absent passenger come sooner, the prepare window does not shorten response times, and a passenger who has been at the access point once answers later calls at once.
- The access point never becomes a bottleneck, and the walk from the access point to the lanes is part of the response time.
- Fast track (priority v2): a fast-tracked party is called next and, once its ticket is validated, goes ahead of the people waiting at the lanes who still have room under K. The fast-track entry never becomes a bottleneck of its own and needs no staff in the model.
- CRITICAL passengers are flagged for staff, but staff escorts are not modelled: such passengers wait in the queue order.
- Before any disruption the system's deadline equals the ground truth (boarding close from a fixed rule). Delays and gate changes, when the scenario has them, are known only once the flight feed announces them, and messages sent while the feed is down arrive when it recovers. Delays only move boarding later; passengers still arrive for the scheduled departure. A gate change affects only passengers who finish screening after it.
- Staff of baseline A' learn of delays when the system does and keep using the last known times while the feed is down (no stale-data rule).
- Passengers never abandon the queue, even after their flight has closed.
- A group stays together: one ticket, one call, one lane, screened one person after the other. Assisted passengers always get the next free lane and are not assessed by the engine.
- Baseline A' (`fifo-manual`) is an idealised staff practice: every five minutes staff call the flights closing within 20 minutes, and every passenger of those flights comes forward at once. Real practice is less systematic, so A' may overstate today's handling where it is informal, or understate it where staff watch individual passengers.
- Strategic late arrivals are a fixed share in a stress-test scenario, not a behavioural response to the policy.
- Tickets are issued on arrival with no kiosk or scanning delay.
- The engine estimates screening time as the mean screening time per person, walking time as the nominal time of the gate zone, and the time from call to screening as the larger of the response estimate and the call-ahead time (through the fast track: the response estimate, or the time since the passenger was last at the access point when shorter).

## 25. Reproducibility

| Item | Value |
|---|---|
| Scenario hash | `sha256:faef7a1cf31930f15a4c1715fcdb428dc6007d78f99376bf67dd558d200bba44` |
| Seeds | 1-200 (200) |
| Source revision | `529b2323a5489dd0be5f8adeb13d2d64f946fad5` |
| Versions | engine 0.5.0, queue core 0.12.0, model 0.7.0, kernel 0.1.0, population generator 0.6.0, scenario schema 5 |
| Generated by | gateflow-sim 0.14.0 |

Command:

```bash
gateflow-sim run --scenario scenarios/vce-like-disrupted-day.yaml --seeds 1-200 --policies fifo,fifo-manual,fifo-manual@reactive,fifo-manual@predict,fifo-manual@advise,priority-v3,priority-v3@predict,priority-v3@advise --baseline fifo --compare fifo-manual:fifo,fifo-manual@reactive:fifo,fifo-manual@predict:fifo,fifo-manual@advise:fifo,priority-v3:fifo,priority-v3@predict:fifo,priority-v3@advise:fifo,fifo-manual@reactive:fifo-manual,fifo-manual@predict:fifo-manual,fifo-manual@predict:fifo-manual@reactive,fifo-manual@advise:fifo-manual,fifo-manual@advise:fifo-manual@reactive,fifo-manual@advise:fifo-manual@predict,priority-v3:fifo-manual,priority-v3@predict:priority-v3,priority-v3@predict:fifo-manual@predict,priority-v3@predict:fifo-manual@reactive,priority-v3@advise:priority-v3,priority-v3@advise:priority-v3@predict,priority-v3@advise:fifo-manual@advise,priority-v3@advise:fifo-manual@reactive --bootstrap-resamples 2000
```
