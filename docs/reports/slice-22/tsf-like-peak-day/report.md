# GateFlow simulation report: TSF-like low-cost base, summer peak day (synthetic)

> **SIMULATED RESULTS ON SYNTHETIC OR HYPOTHETICAL DATA. These numbers are model outputs, not measurements, and must not be presented as evidence of operational performance.**

Scenario `tsf-like-peak-day` (data: SYNTHETIC), 200 simulated days, about 5981 passengers per day (4108 parties). Status quo (baseline): `fifo`.

## 1. Headline

Means per simulated day. P5-P95 is the spread across days; brackets give the 95% confidence interval of the mean (bootstrap over days).

| Policy | Missed flights per day | of which connecting | Missed per 1,000 passengers |
|---|---:|---:|---:|
| Physical FIFO queue (status quo, policy A): `fifo` 1.1.0 | 25.8 (P5-P95 3.0-67.3) | 0.0 | 4.31 |
| Physical FIFO queue with staff calling closing flights (status quo with manual handling, policy A'): `fifo-manual` 0.1.0 | 0.0 (P5-P95 0.0-0.0) | 0.0 | 0.01 |
| Physical FIFO queue with staff calling closing flights (status quo with manual handling, policy A'), with extra lanes opened by a supervisor when the queue is long (today): `fifo-manual@reactive` 0.1.0 | 0.0 (P5-P95 0.0-0.0) | 0.0 | 0.00 |
| Physical FIFO queue with staff calling closing flights (status quo with manual handling, policy A'), with extra lanes recommended by GateFlow's forecast: `fifo-manual@predict` 0.1.0 | 0.0 (P5-P95 0.0-0.0) | 0.0 | 0.00 |
| Physical FIFO queue with staff calling closing flights (status quo with manual handling, policy A'), with extra lanes recommended by GateFlow's console: `fifo-manual@advise` 0.1.0 | 0.0 (P5-P95 0.0-0.0) | 0.0 | 0.00 |
| GateFlow virtual queue with constrained EDF priority v3: fast track, stale-data rule and hysteresis (policy B): `priority-v3` 0.2.0 | 2.3 (P5-P95 0.0-11.0) | 0.0 | 0.38 |
| GateFlow virtual queue with constrained EDF priority v3: fast track, stale-data rule and hysteresis (policy B), with extra lanes recommended by GateFlow's forecast: `priority-v3@predict` 0.2.0 | 0.1 (P5-P95 0.0-1.0) | 0.0 | 0.02 |
| GateFlow virtual queue with constrained EDF priority v3: fast track, stale-data rule and hysteresis (policy B), with extra lanes recommended by GateFlow's console: `priority-v3@advise` 0.2.0 | 0.1 (P5-P95 0.0-0.0) | 0.0 | 0.01 |

| `fifo-manual` compared with `fifo` | Mean per day [95% CI] |
|---|---:|
| Flights saved: missed with `fifo`, caught with `fifo-manual` | 25.7 [22.8, 28.8] |
| Flights lost: caught with `fifo`, missed with `fifo-manual` | 0.0 [0.0, 0.0] |
| **Net flights saved** | **25.7 [22.9, 29.0]** |
| Days with a net gain / with a net loss | 96.0% / 0.0% |
| At-risk passengers reaching the gate in time (39.9 per day classified URGENT on arrival under `fifo`) | 43.1% with `fifo`, 99.9% with `fifo-manual` |
| Change in mean time from arrival to screening (min) | 0.00 [-0.01, 0.01] |
| Change in mean time standing in a queue (min) | 0.00 [0.00, 0.01] |

| `fifo-manual@reactive` compared with `fifo` | Mean per day [95% CI] |
|---|---:|
| Flights saved: missed with `fifo`, caught with `fifo-manual@reactive` | 25.8 [22.8, 28.9] |
| Flights lost: caught with `fifo`, missed with `fifo-manual@reactive` | 0.0 [0.0, 0.0] |
| **Net flights saved** | **25.8 [22.7, 29.0]** |
| Days with a net gain / with a net loss | 96.0% / 0.0% |
| At-risk passengers reaching the gate in time (39.9 per day classified URGENT on arrival under `fifo`) | 43.1% with `fifo`, 100.0% with `fifo-manual@reactive` |
| Change in mean time from arrival to screening (min) | -1.61 [-1.68, -1.53] |
| Change in mean time standing in a queue (min) | -1.61 [-1.69, -1.53] |

| `fifo-manual@predict` compared with `fifo` | Mean per day [95% CI] |
|---|---:|
| Flights saved: missed with `fifo`, caught with `fifo-manual@predict` | 25.8 [22.9, 29.0] |
| Flights lost: caught with `fifo`, missed with `fifo-manual@predict` | 0.0 [0.0, 0.0] |
| **Net flights saved** | **25.8 [22.9, 28.8]** |
| Days with a net gain / with a net loss | 96.0% / 0.0% |
| At-risk passengers reaching the gate in time (39.9 per day classified URGENT on arrival under `fifo`) | 43.1% with `fifo`, 100.0% with `fifo-manual@predict` |
| Change in mean time from arrival to screening (min) | -2.40 [-2.49, -2.30] |
| Change in mean time standing in a queue (min) | -2.40 [-2.49, -2.31] |

| `fifo-manual@advise` compared with `fifo` | Mean per day [95% CI] |
|---|---:|
| Flights saved: missed with `fifo`, caught with `fifo-manual@advise` | 25.8 [22.8, 28.8] |
| Flights lost: caught with `fifo`, missed with `fifo-manual@advise` | 0.0 [0.0, 0.0] |
| **Net flights saved** | **25.8 [22.7, 29.0]** |
| Days with a net gain / with a net loss | 96.0% / 0.0% |
| At-risk passengers reaching the gate in time (39.9 per day classified URGENT on arrival under `fifo`) | 43.1% with `fifo`, 100.0% with `fifo-manual@advise` |
| Change in mean time from arrival to screening (min) | -2.54 [-2.63, -2.44] |
| Change in mean time standing in a queue (min) | -2.54 [-2.63, -2.44] |

| `priority-v3` compared with `fifo` | Mean per day [95% CI] |
|---|---:|
| Flights saved: missed with `fifo`, caught with `priority-v3` | 24.7 [22.1, 27.4] |
| Flights lost: caught with `fifo`, missed with `priority-v3` | 1.2 [0.9, 1.4] |
| **Net flights saved** | **23.5 [21.0, 26.2]** |
| Days with a net gain / with a net loss | 95.0% / 1.0% |
| At-risk passengers reaching the gate in time (39.9 per day classified URGENT on arrival under `fifo`) | 43.1% with `fifo`, 97.8% with `priority-v3` |
| Change in mean time from arrival to screening (min) | 0.00 [0.00, 0.01] |
| Change in mean time standing in a queue (min) | -2.77 [-2.88, -2.66] |

| `priority-v3@predict` compared with `fifo` | Mean per day [95% CI] |
|---|---:|
| Flights saved: missed with `fifo`, caught with `priority-v3@predict` | 25.8 [22.8, 28.8] |
| Flights lost: caught with `fifo`, missed with `priority-v3@predict` | 0.1 [0.0, 0.2] |
| **Net flights saved** | **25.6 [22.7, 28.7]** |
| Days with a net gain / with a net loss | 96.0% / 0.0% |
| At-risk passengers reaching the gate in time (39.9 per day classified URGENT on arrival under `fifo`) | 43.1% with `fifo`, 99.8% with `priority-v3@predict` |
| Change in mean time from arrival to screening (min) | -2.39 [-2.48, -2.31] |
| Change in mean time standing in a queue (min) | -2.85 [-2.97, -2.74] |

| `priority-v3@advise` compared with `fifo` | Mean per day [95% CI] |
|---|---:|
| Flights saved: missed with `fifo`, caught with `priority-v3@advise` | 25.8 [22.8, 28.8] |
| Flights lost: caught with `fifo`, missed with `priority-v3@advise` | 0.0 [0.0, 0.1] |
| **Net flights saved** | **25.7 [22.6, 29.0]** |
| Days with a net gain / with a net loss | 96.0% / 0.0% |
| At-risk passengers reaching the gate in time (39.9 per day classified URGENT on arrival under `fifo`) | 43.1% with `fifo`, 99.9% with `priority-v3@advise` |
| Change in mean time from arrival to screening (min) | -2.46 [-2.56, -2.37] |
| Change in mean time standing in a queue (min) | -2.87 [-2.98, -2.75] |

| `fifo-manual@reactive` compared with `fifo-manual` | Mean per day [95% CI] |
|---|---:|
| Flights saved: missed with `fifo-manual`, caught with `fifo-manual@reactive` | 0.0 [0.0, 0.1] |
| Flights lost: caught with `fifo-manual`, missed with `fifo-manual@reactive` | 0.0 [0.0, 0.0] |
| **Net flights saved** | **0.0 [0.0, 0.1]** |
| Days with a net gain / with a net loss | 0.5% / 0.0% |
| At-risk passengers reaching the gate in time (39.7 per day classified URGENT on arrival under `fifo-manual`) | 99.9% with `fifo-manual`, 100.0% with `fifo-manual@reactive` |
| Change in mean time from arrival to screening (min) | -1.61 [-1.69, -1.53] |
| Change in mean time standing in a queue (min) | -1.61 [-1.68, -1.53] |

| `fifo-manual@predict` compared with `fifo-manual` | Mean per day [95% CI] |
|---|---:|
| Flights saved: missed with `fifo-manual`, caught with `fifo-manual@predict` | 0.0 [0.0, 0.1] |
| Flights lost: caught with `fifo-manual`, missed with `fifo-manual@predict` | 0.0 [0.0, 0.0] |
| **Net flights saved** | **0.0 [0.0, 0.1]** |
| Days with a net gain / with a net loss | 0.5% / 0.0% |
| At-risk passengers reaching the gate in time (39.7 per day classified URGENT on arrival under `fifo-manual`) | 99.9% with `fifo-manual`, 100.0% with `fifo-manual@predict` |
| Change in mean time from arrival to screening (min) | -2.40 [-2.48, -2.31] |
| Change in mean time standing in a queue (min) | -2.40 [-2.48, -2.31] |

| `fifo-manual@predict` compared with `fifo-manual@reactive` | Mean per day [95% CI] |
|---|---:|
| Flights saved: missed with `fifo-manual@reactive`, caught with `fifo-manual@predict` | 0.0 [0.0, 0.0] |
| Flights lost: caught with `fifo-manual@reactive`, missed with `fifo-manual@predict` | 0.0 [0.0, 0.0] |
| **Net flights saved** | **0.0 [0.0, 0.0]** |
| Days with a net gain / with a net loss | 0.0% / 0.0% |
| At-risk passengers reaching the gate in time (6.6 per day classified URGENT on arrival under `fifo-manual@reactive`) | 100.0% with `fifo-manual@reactive`, 100.0% with `fifo-manual@predict` |
| Change in mean time from arrival to screening (min) | -0.79 [-0.82, -0.77] |
| Change in mean time standing in a queue (min) | -0.79 [-0.82, -0.76] |

| `fifo-manual@advise` compared with `fifo-manual` | Mean per day [95% CI] |
|---|---:|
| Flights saved: missed with `fifo-manual`, caught with `fifo-manual@advise` | 0.0 [0.0, 0.1] |
| Flights lost: caught with `fifo-manual`, missed with `fifo-manual@advise` | 0.0 [0.0, 0.0] |
| **Net flights saved** | **0.0 [0.0, 0.1]** |
| Days with a net gain / with a net loss | 0.5% / 0.0% |
| At-risk passengers reaching the gate in time (39.7 per day classified URGENT on arrival under `fifo-manual`) | 99.9% with `fifo-manual`, 100.0% with `fifo-manual@advise` |
| Change in mean time from arrival to screening (min) | -2.54 [-2.63, -2.44] |
| Change in mean time standing in a queue (min) | -2.54 [-2.63, -2.44] |

| `fifo-manual@advise` compared with `fifo-manual@reactive` | Mean per day [95% CI] |
|---|---:|
| Flights saved: missed with `fifo-manual@reactive`, caught with `fifo-manual@advise` | 0.0 [0.0, 0.0] |
| Flights lost: caught with `fifo-manual@reactive`, missed with `fifo-manual@advise` | 0.0 [0.0, 0.0] |
| **Net flights saved** | **0.0 [0.0, 0.0]** |
| Days with a net gain / with a net loss | 0.0% / 0.0% |
| At-risk passengers reaching the gate in time (6.6 per day classified URGENT on arrival under `fifo-manual@reactive`) | 100.0% with `fifo-manual@reactive`, 100.0% with `fifo-manual@advise` |
| Change in mean time from arrival to screening (min) | -0.93 [-0.96, -0.90] |
| Change in mean time standing in a queue (min) | -0.93 [-0.96, -0.90] |

| `fifo-manual@advise` compared with `fifo-manual@predict` | Mean per day [95% CI] |
|---|---:|
| Flights saved: missed with `fifo-manual@predict`, caught with `fifo-manual@advise` | 0.0 [0.0, 0.0] |
| Flights lost: caught with `fifo-manual@predict`, missed with `fifo-manual@advise` | 0.0 [0.0, 0.0] |
| **Net flights saved** | **0.0 [0.0, 0.0]** |
| Days with a net gain / with a net loss | 0.0% / 0.0% |
| At-risk passengers reaching the gate in time (1.1 per day classified URGENT on arrival under `fifo-manual@predict`) | 100.0% with `fifo-manual@predict`, 100.0% with `fifo-manual@advise` |
| Change in mean time from arrival to screening (min) | -0.14 [-0.16, -0.12] |
| Change in mean time standing in a queue (min) | -0.14 [-0.16, -0.12] |

| `priority-v3` compared with `fifo-manual` | Mean per day [95% CI] |
|---|---:|
| Flights saved: missed with `fifo-manual`, caught with `priority-v3` | 0.0 [0.0, 0.0] |
| Flights lost: caught with `fifo-manual`, missed with `priority-v3` | 2.3 [1.5, 3.1] |
| **Net flights saved** | **-2.3 [-3.1, -1.6]** |
| Days with a net gain / with a net loss | 0.0% / 49.0% |
| At-risk passengers reaching the gate in time (39.7 per day classified URGENT on arrival under `fifo-manual`) | 99.9% with `fifo-manual`, 97.8% with `priority-v3` |
| Change in mean time from arrival to screening (min) | 0.00 [0.00, 0.01] |
| Change in mean time standing in a queue (min) | -2.77 [-2.88, -2.66] |

| `priority-v3@predict` compared with `priority-v3` | Mean per day [95% CI] |
|---|---:|
| Flights saved: missed with `priority-v3`, caught with `priority-v3@predict` | 2.2 [1.5, 3.1] |
| Flights lost: caught with `priority-v3`, missed with `priority-v3@predict` | 0.1 [0.0, 0.1] |
| **Net flights saved** | **2.2 [1.4, 3.0]** |
| Days with a net gain / with a net loss | 45.5% / 2.5% |
| At-risk passengers reaching the gate in time (38.9 per day classified URGENT on arrival under `priority-v3`) | 97.8% with `priority-v3`, 99.8% with `priority-v3@predict` |
| Change in mean time from arrival to screening (min) | -2.39 [-2.48, -2.31] |
| Change in mean time standing in a queue (min) | -0.09 [-0.09, -0.08] |

| `priority-v3@predict` compared with `fifo-manual@predict` | Mean per day [95% CI] |
|---|---:|
| Flights saved: missed with `fifo-manual@predict`, caught with `priority-v3@predict` | 0.0 [0.0, 0.0] |
| Flights lost: caught with `fifo-manual@predict`, missed with `priority-v3@predict` | 0.1 [0.1, 0.2] |
| **Net flights saved** | **-0.1 [-0.2, -0.1]** |
| Days with a net gain / with a net loss | 0.0% / 7.0% |
| At-risk passengers reaching the gate in time (1.1 per day classified URGENT on arrival under `fifo-manual@predict`) | 100.0% with `fifo-manual@predict`, 100.0% with `priority-v3@predict` |
| Change in mean time from arrival to screening (min) | 0.00 [0.00, 0.01] |
| Change in mean time standing in a queue (min) | -0.46 [-0.50, -0.42] |

| `priority-v3@predict` compared with `fifo-manual@reactive` | Mean per day [95% CI] |
|---|---:|
| Flights saved: missed with `fifo-manual@reactive`, caught with `priority-v3@predict` | 0.0 [0.0, 0.0] |
| Flights lost: caught with `fifo-manual@reactive`, missed with `priority-v3@predict` | 0.1 [0.1, 0.2] |
| **Net flights saved** | **-0.1 [-0.2, -0.1]** |
| Days with a net gain / with a net loss | 0.0% / 7.0% |
| At-risk passengers reaching the gate in time (6.6 per day classified URGENT on arrival under `fifo-manual@reactive`) | 100.0% with `fifo-manual@reactive`, 99.8% with `priority-v3@predict` |
| Change in mean time from arrival to screening (min) | -0.79 [-0.81, -0.76] |
| Change in mean time standing in a queue (min) | -1.25 [-1.29, -1.21] |

| `priority-v3@advise` compared with `priority-v3` | Mean per day [95% CI] |
|---|---:|
| Flights saved: missed with `priority-v3`, caught with `priority-v3@advise` | 2.2 [1.5, 3.2] |
| Flights lost: caught with `priority-v3`, missed with `priority-v3@advise` | 0.0 [0.0, 0.1] |
| **Net flights saved** | **2.2 [1.5, 3.1]** |
| Days with a net gain / with a net loss | 47.0% / 1.5% |
| At-risk passengers reaching the gate in time (38.9 per day classified URGENT on arrival under `priority-v3`) | 97.8% with `priority-v3`, 99.9% with `priority-v3@advise` |
| Change in mean time from arrival to screening (min) | -2.47 [-2.56, -2.38] |
| Change in mean time standing in a queue (min) | -0.10 [-0.11, -0.09] |

| `priority-v3@advise` compared with `priority-v3@predict` | Mean per day [95% CI] |
|---|---:|
| Flights saved: missed with `priority-v3@predict`, caught with `priority-v3@advise` | 0.1 [0.0, 0.1] |
| Flights lost: caught with `priority-v3@predict`, missed with `priority-v3@advise` | 0.0 [0.0, 0.0] |
| **Net flights saved** | **0.1 [0.0, 0.1]** |
| Days with a net gain / with a net loss | 3.5% / 0.5% |
| At-risk passengers reaching the gate in time (1.6 per day classified URGENT on arrival under `priority-v3@predict`) | 99.7% with `priority-v3@predict`, 99.7% with `priority-v3@advise` |
| Change in mean time from arrival to screening (min) | -0.07 [-0.10, -0.05] |
| Change in mean time standing in a queue (min) | -0.01 [-0.02, -0.01] |

| `priority-v3@advise` compared with `fifo-manual@advise` | Mean per day [95% CI] |
|---|---:|
| Flights saved: missed with `fifo-manual@advise`, caught with `priority-v3@advise` | 0.0 [0.0, 0.0] |
| Flights lost: caught with `fifo-manual@advise`, missed with `priority-v3@advise` | 0.1 [0.0, 0.1] |
| **Net flights saved** | **-0.1 [-0.1, 0.0]** |
| Days with a net gain / with a net loss | 0.0% / 4.0% |
| At-risk passengers reaching the gate in time (0.8 per day classified URGENT on arrival under `fifo-manual@advise`) | 100.0% with `fifo-manual@advise`, 100.0% with `priority-v3@advise` |
| Change in mean time from arrival to screening (min) | 0.07 [0.06, 0.09] |
| Change in mean time standing in a queue (min) | -0.33 [-0.37, -0.30] |

| `priority-v3@advise` compared with `fifo-manual@reactive` | Mean per day [95% CI] |
|---|---:|
| Flights saved: missed with `fifo-manual@reactive`, caught with `priority-v3@advise` | 0.0 [0.0, 0.0] |
| Flights lost: caught with `fifo-manual@reactive`, missed with `priority-v3@advise` | 0.1 [0.0, 0.1] |
| **Net flights saved** | **-0.1 [-0.1, 0.0]** |
| Days with a net gain / with a net loss | 0.0% / 4.0% |
| At-risk passengers reaching the gate in time (6.6 per day classified URGENT on arrival under `fifo-manual@reactive`) | 100.0% with `fifo-manual@reactive`, 99.8% with `priority-v3@advise` |
| Change in mean time from arrival to screening (min) | -0.86 [-0.89, -0.83] |
| Change in mean time standing in a queue (min) | -1.26 [-1.31, -1.22] |

## 2. Waiting times

*Time to screening*: minutes from arrival at the checkpoint (when the ticket is issued) to the start of screening. *Standing*: minutes spent standing in a queue: the whole wait in a physical queue; in a virtual queue only the wait at the lanes after validating the ticket. Each column is the mean over days of the daily statistic; "longest" is the longest single value over all simulated days.

| Policy | Time to screening: mean | P50 | P90 | P99 | Longest | Standing: mean | P90 | Longest |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| `fifo` | 3.5 | 0.3 | 15.4 | 24.7 | 41.5 | 3.5 | 15.4 | 41.5 |
| `fifo-manual` | 3.5 | 0.3 | 14.9 | 26.9 | 56.2 | 3.5 | 14.9 | 56.2 |
| `fifo-manual@reactive` | 1.9 | 0.2 | 8.3 | 13.7 | 23.6 | 1.9 | 8.3 | 23.6 |
| `fifo-manual@predict` | 1.1 | 0.2 | 3.9 | 7.7 | 16.8 | 1.1 | 3.9 | 16.8 |
| `fifo-manual@advise` | 0.9 | 0.2 | 3.3 | 6.9 | 18.0 | 0.9 | 3.3 | 18.0 |
| `priority-v3` | 3.5 | 0.3 | 15.0 | 27.3 | 118.2 | 0.7 | 2.0 | 7.9 |
| `priority-v3@predict` | 1.1 | 0.2 | 3.9 | 7.8 | 106.5 | 0.6 | 1.9 | 7.0 |
| `priority-v3@advise` | 1.0 | 0.2 | 3.6 | 7.4 | 106.0 | 0.6 | 1.9 | 7.0 |

## 3. Cost for passengers not prioritised by `fifo-manual` (compared with `fifo`)

Extra wait = time to screening with the candidate minus time to screening with the reference, for the same passenger.

| Metric | Value [95% CI] |
|---|---:|
| Passengers prioritised per day | 132.0 (P5-P95 51.0-232.0) (2.24% of tickets called) |
| Mean extra wait of non-prioritised passengers (min) | 0.14 [0.13, 0.15] |
| P90 extra wait of non-prioritised passengers (min) | 0.16 [0.14, 0.19] |
| Largest extra wait of any non-prioritised passenger, worst day (min) | 22.7 |
| Share of non-prioritised passengers delayed by more than 5 min | 0.52% |
| Most people who overtook one ticket, worst day (no bound for staff flight calls) | 122 |

## 4. Cost for passengers not prioritised by `fifo-manual@reactive` (compared with `fifo`)

Extra wait = time to screening with the candidate minus time to screening with the reference, for the same passenger.

| Metric | Value [95% CI] |
|---|---:|
| Passengers prioritised per day | 39.4 (P5-P95 16.0-78.2) (0.66% of tickets called) |
| Mean extra wait of non-prioritised passengers (min) | -1.54 [-1.62, -1.47] |
| P90 extra wait of non-prioritised passengers (min) | 0.00 [0.00, 0.00] |
| Largest extra wait of any non-prioritised passenger, worst day (min) | 1.9 |
| Share of non-prioritised passengers delayed by more than 5 min | 0.00% |
| Most people who overtook one ticket, worst day (no bound for staff flight calls) | 41 |

## 5. Cost for passengers not prioritised by `fifo-manual@predict` (compared with `fifo`)

Extra wait = time to screening with the candidate minus time to screening with the reference, for the same passenger.

| Metric | Value [95% CI] |
|---|---:|
| Passengers prioritised per day | 15.5 (P5-P95 4.0-32.0) (0.26% of tickets called) |
| Mean extra wait of non-prioritised passengers (min) | -2.37 [-2.47, -2.29] |
| P90 extra wait of non-prioritised passengers (min) | 0.00 [0.00, 0.00] |
| Largest extra wait of any non-prioritised passenger, worst day (min) | 1.9 |
| Share of non-prioritised passengers delayed by more than 5 min | 0.00% |
| Most people who overtook one ticket, worst day (no bound for staff flight calls) | 14 |

## 6. Cost for passengers not prioritised by `fifo-manual@advise` (compared with `fifo`)

Extra wait = time to screening with the candidate minus time to screening with the reference, for the same passenger.

| Metric | Value [95% CI] |
|---|---:|
| Passengers prioritised per day | 13.4 (P5-P95 4.0-26.0) (0.22% of tickets called) |
| Mean extra wait of non-prioritised passengers (min) | -2.52 [-2.61, -2.43] |
| P90 extra wait of non-prioritised passengers (min) | 0.00 [0.00, 0.00] |
| Largest extra wait of any non-prioritised passenger, worst day (min) | 1.9 |
| Share of non-prioritised passengers delayed by more than 5 min | 0.00% |
| Most people who overtook one ticket, worst day (no bound for staff flight calls) | 13 |

## 7. Cost for passengers not prioritised by `priority-v3` (compared with `fifo`)

Extra wait = time to screening with the candidate minus time to screening with the reference, for the same passenger.

| Metric | Value [95% CI] |
|---|---:|
| Passengers prioritised per day | 65.8 (P5-P95 12.9-136.1) (1.08% of tickets called) |
| Mean extra wait of non-prioritised passengers (min) | 0.16 [0.14, 0.17] |
| P90 extra wait of non-prioritised passengers (min) | 0.36 [0.30, 0.41] |
| Largest extra wait of any non-prioritised passenger, worst day (min) | 104.4 |
| Share of non-prioritised passengers delayed by more than 5 min | 0.83% |
| Most people who overtook one ticket, worst day (bound K = 30, passes in the window and at the lanes included) | 30 |
| Calls where the cap blocked a priority call, per day | 13.0 |
| Calls where the overtake guard took precedence (a ticket had reached K overtakes), per day | 4.3 |
| People through the fast track per day | 65.6 |
| People passed at the lanes by fast-tracked parties per day | 359.3 |

## 8. Cost for passengers not prioritised by `priority-v3@predict` (compared with `fifo`)

Extra wait = time to screening with the candidate minus time to screening with the reference, for the same passenger.

| Metric | Value [95% CI] |
|---|---:|
| Passengers prioritised per day | 2.1 (P5-P95 0.0-7.0) (0.03% of tickets called) |
| Mean extra wait of non-prioritised passengers (min) | -2.39 [-2.48, -2.30] |
| P90 extra wait of non-prioritised passengers (min) | 0.00 [0.00, 0.00] |
| Largest extra wait of any non-prioritised passenger, worst day (min) | 92.7 |
| Share of non-prioritised passengers delayed by more than 5 min | 0.03% |
| Most people who overtook one ticket, worst day (bound K = 30, passes in the window and at the lanes included) | 13 |
| Calls where the cap blocked a priority call, per day | 0.0 |
| Calls where the overtake guard took precedence (a ticket had reached K overtakes), per day | 0.0 |
| People through the fast track per day | 2.1 |
| People passed at the lanes by fast-tracked parties per day | 17.4 |

## 9. Cost for passengers not prioritised by `priority-v3@advise` (compared with `fifo`)

Extra wait = time to screening with the candidate minus time to screening with the reference, for the same passenger.

| Metric | Value [95% CI] |
|---|---:|
| Passengers prioritised per day | 1.9 (P5-P95 0.0-6.0) (0.03% of tickets called) |
| Mean extra wait of non-prioritised passengers (min) | -2.46 [-2.55, -2.37] |
| P90 extra wait of non-prioritised passengers (min) | 0.00 [0.00, 0.00] |
| Largest extra wait of any non-prioritised passenger, worst day (min) | 92.3 |
| Share of non-prioritised passengers delayed by more than 5 min | 0.02% |
| Most people who overtook one ticket, worst day (bound K = 30, passes in the window and at the lanes included) | 12 |
| Calls where the cap blocked a priority call, per day | 0.0 |
| Calls where the overtake guard took precedence (a ticket had reached K overtakes), per day | 0.0 |
| People through the fast track per day | 1.9 |
| People passed at the lanes by fast-tracked parties per day | 13.9 |

## 10. Cost for passengers not prioritised by `priority-v3` (compared with `fifo-manual`)

Extra wait = time to screening with the candidate minus time to screening with the reference, for the same passenger.

| Metric | Value [95% CI] |
|---|---:|
| Passengers prioritised per day | 65.8 (P5-P95 12.9-136.1) (1.08% of tickets called) |
| Mean extra wait of non-prioritised passengers (min) | 0.05 [0.04, 0.05] |
| P90 extra wait of non-prioritised passengers (min) | 0.08 [0.07, 0.10] |
| Largest extra wait of any non-prioritised passenger, worst day (min) | 104.3 |
| Share of non-prioritised passengers delayed by more than 5 min | 0.73% |
| Most people who overtook one ticket, worst day (bound K = 30, passes in the window and at the lanes included) | 30 |
| Calls where the cap blocked a priority call, per day | 13.0 |
| Calls where the overtake guard took precedence (a ticket had reached K overtakes), per day | 4.3 |
| People through the fast track per day | 65.6 |
| People passed at the lanes by fast-tracked parties per day | 359.3 |

## 11. Cost for passengers not prioritised by `priority-v3@predict` (compared with `fifo-manual@predict`)

Extra wait = time to screening with the candidate minus time to screening with the reference, for the same passenger.

| Metric | Value [95% CI] |
|---|---:|
| Passengers prioritised per day | 2.1 (P5-P95 0.0-7.0) (0.03% of tickets called) |
| Mean extra wait of non-prioritised passengers (min) | 0.00 [0.00, 0.01] |
| P90 extra wait of non-prioritised passengers (min) | 0.00 [0.00, 0.00] |
| Largest extra wait of any non-prioritised passenger, worst day (min) | 100.5 |
| Share of non-prioritised passengers delayed by more than 5 min | 0.15% |
| Most people who overtook one ticket, worst day (bound K = 30, passes in the window and at the lanes included) | 13 |
| Calls where the cap blocked a priority call, per day | 0.0 |
| Calls where the overtake guard took precedence (a ticket had reached K overtakes), per day | 0.0 |
| People through the fast track per day | 2.1 |
| People passed at the lanes by fast-tracked parties per day | 17.4 |

## 12. Cost for passengers not prioritised by `priority-v3@predict` (compared with `fifo-manual@reactive`)

Extra wait = time to screening with the candidate minus time to screening with the reference, for the same passenger.

| Metric | Value [95% CI] |
|---|---:|
| Passengers prioritised per day | 2.1 (P5-P95 0.0-7.0) (0.03% of tickets called) |
| Mean extra wait of non-prioritised passengers (min) | -0.79 [-0.82, -0.76] |
| P90 extra wait of non-prioritised passengers (min) | 0.00 [0.00, 0.00] |
| Largest extra wait of any non-prioritised passenger, worst day (min) | 92.9 |
| Share of non-prioritised passengers delayed by more than 5 min | 0.07% |
| Most people who overtook one ticket, worst day (bound K = 30, passes in the window and at the lanes included) | 13 |
| Calls where the cap blocked a priority call, per day | 0.0 |
| Calls where the overtake guard took precedence (a ticket had reached K overtakes), per day | 0.0 |
| People through the fast track per day | 2.1 |
| People passed at the lanes by fast-tracked parties per day | 17.4 |

## 13. Cost for passengers not prioritised by `priority-v3@advise` (compared with `fifo-manual@advise`)

Extra wait = time to screening with the candidate minus time to screening with the reference, for the same passenger.

| Metric | Value [95% CI] |
|---|---:|
| Passengers prioritised per day | 1.9 (P5-P95 0.0-6.0) (0.03% of tickets called) |
| Mean extra wait of non-prioritised passengers (min) | 0.07 [0.06, 0.08] |
| P90 extra wait of non-prioritised passengers (min) | 0.05 [0.03, 0.08] |
| Largest extra wait of any non-prioritised passenger, worst day (min) | 100.6 |
| Share of non-prioritised passengers delayed by more than 5 min | 0.43% |
| Most people who overtook one ticket, worst day (bound K = 30, passes in the window and at the lanes included) | 12 |
| Calls where the cap blocked a priority call, per day | 0.0 |
| Calls where the overtake guard took precedence (a ticket had reached K overtakes), per day | 0.0 |
| People through the fast track per day | 1.9 |
| People passed at the lanes by fast-tracked parties per day | 13.9 |

## 14. Cost for passengers not prioritised by `priority-v3@advise` (compared with `fifo-manual@reactive`)

Extra wait = time to screening with the candidate minus time to screening with the reference, for the same passenger.

| Metric | Value [95% CI] |
|---|---:|
| Passengers prioritised per day | 1.9 (P5-P95 0.0-6.0) (0.03% of tickets called) |
| Mean extra wait of non-prioritised passengers (min) | -0.86 [-0.89, -0.83] |
| P90 extra wait of non-prioritised passengers (min) | 0.00 [0.00, 0.00] |
| Largest extra wait of any non-prioritised passenger, worst day (min) | 92.5 |
| Share of non-prioritised passengers delayed by more than 5 min | 0.09% |
| Most people who overtook one ticket, worst day (bound K = 30, passes in the window and at the lanes included) | 12 |
| Calls where the cap blocked a priority call, per day | 0.0 |
| Calls where the overtake guard took precedence (a ticket had reached K overtakes), per day | 0.0 |
| People through the fast track per day | 1.9 |
| People passed at the lanes by fast-tracked parties per day | 13.9 |

## 15. Call mechanics

Virtual queues only. A *second call* is made when the passenger has not presented within the call timeout; a *no-show* (missed call) is a ticket not validated after the second timeout. A no-show who rescans within the reactivation window is *reactivated*; later, the passenger needs a *new ticket*. *Idle lane time* counts open lanes with nobody to screen while passengers were waiting for or answering a call, as a share of the staffed lane time. Means per day.

| Policy | Calls | Second calls (share of calls) | No-shows (missed-call rate) | Reactivations | New tickets | Idle lane time (min, share) |
|---|---:|---:|---:|---:|---:|---:|
| `priority-v3` | 4098 | 54.9 (1.34%) | 19.1 (0.46%) | 18.2 | 0.8 | 0.2 (0.01%) |
| `priority-v3@predict` | 4086 | 17.5 (0.43%) | 6.8 (0.17%) | 6.6 | 0.3 | 0.2 (0.01%) |
| `priority-v3@advise` | 4085 | 15.3 (0.37%) | 6.2 (0.15%) | 6.0 | 0.3 | 0.2 (0.00%) |

## 16. Disruptions, data quality and stability

No delays, gate changes, lane outages or feed outages in this scenario.

*Class changes* count the changes of risk class of waiting tickets under each policy's own classification. A *reversal* is a change in the direction opposite to the previous one, e.g. ATTENTION to URGENT and back: the flapping that hysteresis prevents. *Boosts on wrong information*: people prioritised while the system's knowledge of their flight differed from the truth (a delay or a gate change not yet known). Means per day.

| Policy | Missed among passengers of delayed or re-gated flights | Boosts on wrong information (people) | Class changes per 100 parties | Reversals | People whose class flapped |
|---|---:|---:|---:|---:|---:|
| `fifo` | - | 0.0 | not classified | - | - |
| `fifo-manual` | - | 0.0 | not classified | - | - |
| `fifo-manual@reactive` | - | 0.0 | not classified | - | - |
| `fifo-manual@predict` | - | 0.0 | not classified | - | - |
| `fifo-manual@advise` | - | 0.0 | not classified | - | - |
| `priority-v3` | - | 0.0 | 0.96 | 0.1 | 0.1 |
| `priority-v3@predict` | - | 0.0 | 0.04 | 0.0 | 0.0 |
| `priority-v3@advise` | - | 0.0 | 0.03 | 0.0 | 0.0 |

## 17. Groups, assisted passengers and late arrivals

Means per day. A group (two people or more) holds one ticket and counts as its people in every other table, in the priority cap and in the overtake bound. Assisted passengers are taken to the next free lane under every policy.

| Policy | Groups (people in groups) | Groups prioritised | Assisted passengers: people, mean time to screening (min), missed | Late on purpose: people, prioritised, missed |
|---|---:|---:|---:|---:|
| `fifo` | 1225.7 (3098.5) | 0.0 | 41.3, 0.11, 0.0 | none in this scenario |
| `fifo-manual` | 1225.7 (3098.5) | 26.8 | 41.3, 0.11, 0.0 | none in this scenario |
| `fifo-manual@reactive` | 1225.7 (3098.5) | 8.1 | 41.3, 0.10, 0.0 | none in this scenario |
| `fifo-manual@predict` | 1225.7 (3098.5) | 3.3 | 41.3, 0.10, 0.0 | none in this scenario |
| `fifo-manual@advise` | 1225.7 (3098.5) | 2.9 | 41.3, 0.10, 0.0 | none in this scenario |
| `priority-v3` | 1225.7 (3098.5) | 14.0 | 41.3, 0.11, 0.0 | none in this scenario |
| `priority-v3@predict` | 1225.7 (3098.5) | 0.5 | 41.3, 0.10, 0.0 | none in this scenario |
| `priority-v3@advise` | 1225.7 (3098.5) | 0.5 | 41.3, 0.10, 0.0 | none in this scenario |

## 18. Checkpoint operations

Means per day; "longest" is the largest value over all simulated days.

| Policy | Staffed lane-hours | Lane utilisation | Tickets waiting for a call: mean (longest) | People standing in a queue: mean (longest) | URGENT on arrival | CRITICAL on arrival |
|---|---:|---:|---:|---:|---:|---:|
| `fifo` | 62.8 | 79.4% | 19.5 (262) | 19.5 (262) | 39.9 | 0.0 |
| `fifo-manual` | 62.8 | 79.4% | 19.5 (258) | 19.5 (258) | 39.7 | 0.0 |
| `fifo-manual@reactive` | 63.8 | 78.1% | 10.5 (233) | 10.5 (233) | 6.6 | 0.0 |
| `fifo-manual@predict` | 64.1 | 77.8% | 6.1 (203) | 6.1 (203) | 1.1 | 0.0 |
| `fifo-manual@advise` | 64.5 | 77.3% | 5.3 (211) | 5.3 (211) | 0.8 | 0.0 |
| `priority-v3` | 62.8 | 79.4% | 13.7 (229) | 4.0 (34) | 38.9 | 0.0 |
| `priority-v3@predict` | 64.1 | 77.8% | 1.8 (163) | 3.5 (40) | 1.6 | 0.0 |
| `priority-v3@advise` | 64.3 | 77.5% | 1.5 (171) | 3.4 (41) | 1.4 | 0.0 |

## 19. Lane management

Extra lanes open beyond the plan, never more than the 6 lanes the checkpoint has, and at most 1 at the same time (the staff on call). A decision takes a median of 10 min to put a lane into service (varying from day to day), and an extra lane stays open at least 30 min. The supervisor of today's practice (`@reactive`) decides on the wait the queue shows; GateFlow (`@predict`) projects the queue from the forecast of arrivals and recommends lanes, as the console does (`@advise`, S22: its rule on the forecast of the next hour, from what the live system knows), and the duty manager follows 80% of its recommendations. Means per day; "most" is the largest value over all simulated days.

| Policy | Rule | Staffed lane-hours | of which extra | Extra lanes opened (closed) | Decisions (followed) | Most lanes open |
|---|---|---:|---:|---:|---:|---:|
| `fifo` | plan only | 62.8 | 0.0 | - | - | 5 |
| `fifo-manual` | plan only | 62.8 | 0.0 | - | - | 5 |
| `fifo-manual@reactive` | supervisor: opens when the queue shows more than 10 min, closes below 2 min | 63.8 | 1.1 | 1.1 (1.0) | 2.1 (2.1) | 6 |
| `fifo-manual@predict` | GateFlow: keeps the projected wait below 10 min over the next 45 min, closes below 3 min | 64.1 | 1.3 | 1.1 (1.0) | 2.7 (2.1) | 6 |
| `fifo-manual@advise` | GateFlow's console: keeps the median wait forecast below 10 min over the next 60 min, closes a lane beyond the plan below 2 min, 15 min between recommendations | 64.5 | 1.7 | 1.1 (1.0) | 2.8 (2.2) | 6 |
| `priority-v3` | plan only | 62.8 | 0.0 | - | - | 5 |
| `priority-v3@predict` | GateFlow: keeps the projected wait below 10 min over the next 45 min, closes below 3 min | 64.1 | 1.3 | 1.1 (1.0) | 2.7 (2.1) | 6 |
| `priority-v3@advise` | GateFlow's console: keeps the median wait forecast below 10 min over the next 60 min, closes a lane beyond the plan below 2 min, 15 min between recommendations | 64.3 | 1.5 | 1.0 (1.0) | 2.8 (2.2) | 6 |

What the extra lanes buy: each policy compared with the same calls under another lane rule, passenger by passenger. Means per day [95% CI]; the last two columns divide totals over all days by the extra lane-hours (shown when the candidate only adds lane-hours).

| Comparison | Extra lane-hours | Net flights saved | Change in mean time to screening (min) | Waiting saved per extra lane-hour (person-hours) | Net flights saved per extra lane-hour |
|---|---:|---:|---:|---:|---:|
| `fifo-manual@reactive` vs `fifo-manual` | 1.1 [1.0, 1.1] | 0.0 [0.0, 0.1] | -1.61 [-1.69, -1.53] | 152.0 [148.0, 155.9] | 0.02 [0.00, 0.07] |
| `fifo-manual@predict` vs `fifo-manual` | 1.3 [1.3, 1.3] | 0.0 [0.0, 0.1] | -2.40 [-2.48, -2.31] | 182.3 [176.6, 187.7] | 0.02 [0.00, 0.06] |
| `fifo-manual@predict` vs `fifo-manual@reactive` | 0.3 [0.2, 0.3] | 0.0 [0.0, 0.0] | -0.79 [-0.82, -0.77] | - | - |
| `fifo-manual@advise` vs `fifo-manual` | 1.7 [1.7, 1.8] | 0.0 [0.0, 0.1] | -2.54 [-2.63, -2.44] | 144.9 [139.9, 150.0] | 0.01 [0.00, 0.04] |
| `fifo-manual@advise` vs `fifo-manual@reactive` | 0.7 [0.6, 0.7] | 0.0 [0.0, 0.0] | -0.93 [-0.96, -0.90] | 134.1 [124.5, 144.9] | 0.00 [0.00, 0.00] |
| `fifo-manual@advise` vs `fifo-manual@predict` | 0.4 [0.4, 0.5] | 0.0 [0.0, 0.0] | -0.14 [-0.16, -0.12] | - | - |
| `priority-v3@predict` vs `priority-v3` | 1.3 [1.3, 1.3] | 2.2 [1.4, 3.0] | -2.39 [-2.48, -2.31] | 182.9 [177.3, 188.3] | 1.65 [1.09, 2.29] |
| `priority-v3@advise` vs `priority-v3` | 1.5 [1.5, 1.6] | 2.2 [1.5, 3.1] | -2.47 [-2.56, -2.38] | 160.2 [154.6, 165.7] | 1.45 [0.98, 1.99] |
| `priority-v3@advise` vs `priority-v3@predict` | 0.2 [0.2, 0.3] | 0.1 [0.0, 0.1] | -0.07 [-0.10, -0.05] | - | - |

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
| Treviso Canova traffic in 2025 (3.2 million passengers) (`save-traffic-2025`) | LITERATURE | SAVE S.p.A., annual figure as reported in the business plan and in the press | Published aggregate figure, cited with attribution. Used only to size the synthetic day. | 2026-11-21 | passengers.loadFactor |
| Synthetic flight list of the scenario library (`library-flights`) | SYNTHETIC | GateFlow (scenarios/flights/make-library-flights.mjs) | Created for GateFlow; contains no third-party schedule data. | - | flight list |

- `save-traffic-2025`: 3,200,130 passengers in 2025 according to the business plan (marked verified there); press coverage of SAVE's results gives over 3.2 million. Not re-verified against SAVE's own publication, whose website refused automated access.

Airport configuration: `tsf-like` (TSF-like airport (synthetic)), checkpoint `departures`, file `../airports/tsf-like.yaml` (SHA-256 `9be8f777574c7e2f62ebf33d44507485e4ced2dee49bdbe07893f4a97fe040a3`). The scenario gives only its day; every other parameter comes from this configuration.

Design day: 34 departures from the flight list `flights/tsf-like-peak-day.csv` (SHA-256 `cb6cd9c8a623daec1e15158a0f3ac583c4ee2fd75ca0f775955fb82c1a5513a9`), source `library-flights`.

## 23. Assumptions

Every model parameter, with its source. SYNTHETIC values are illustrative assumptions.

| Parameter | Value | Source | Note |
|---|---|---|---|
| checkpoint.lanesAvailable | 6 | SYNTHETIC | Lanes the checkpoint has (assumed): the roster plans at most 5, the others open only as extra lanes. |
| checkpoint.laneSchedule | from 00:00, lanes 1; from 03:00, lanes 2; from 04:00, lanes 5; from 06:00, lanes 3; from 07:00, lanes 4; from 08:00, lanes 5; from 09:00, lanes 4; from 13:00, lanes 5; from 15:00, lanes 4; from 16:00, lanes 3; from 17:00, lanes 2; from 19:00, lanes 1 | SYNTHETIC | Planned for this day with the lane plan rule of the checkpoint (airports/tsf-like.yaml): 69.0 lane-hours. gateflow-sim lanes --scenario <this file> prints the plan again. |
| checkpoint.lanePlanRule | utilisation 0.9, intervalMinutes 60, minLanes 1, maxLanes 5, planningDays 100 | SYNTHETIC | Assumed planning rule, not the airport's: every hour, enough lanes to screen the expected arrivals at 90% utilisation, at least 1 and at most 5 lanes. |
| checkpoint.laneStaffing | maxExtraLanes 1, openDelayMinutes median 10, sigma 0.4, minOpenMinutes 30, followShare 0.8 | SYNTHETIC | Assumed: staff on call can open 1 extra lane beyond the plan, about 10 minutes after the decision (5 to 20 on most days); an extra lane stays open at least 30 minutes; the duty manager follows 4 recommendations of GateFlow out of 5. |
| checkpoint.serviceTimeMeanSeconds | 30 | SYNTHETIC | About 120 passengers per hour per lane (assumed conventional lanes of a smaller airport). |
| checkpoint.serviceTimeCv | 0.6 | SYNTHETIC |  |
| schedule.seats | aircraft A320, seats 180; aircraft A21N, seats 239; aircraft B738, seats 189; aircraft B38M, seats 197 | SYNTHETIC | Assumed single-class high-density configurations by ICAO type designator, not airline data. Replace with the airport's seat data. |
| schedule.gateZones | id A, walkMinutes 4, share 0.85; id B, walkMinutes 8, share 0.15 | SYNTHETIC | Nominal walk from the checkpoint exit; B are non-Schengen gates after passport control (its queue is not modelled). |
| passengers.loadFactor | min 0.8, mode 0.94, max 1 | SYNTHETIC (save-traffic-2025) | Summer load factors of a low-cost base, drawn per flight and day. With the flight list the day has about 6,000 departing passengers, about 1.35 times the average day of 2025 (3.2 million passengers, half of them departing, over 365 days): assumed peak-day factor. |
| passengers.transferShare | 0 | SYNTHETIC | A point-to-point low-cost airport; no connecting passengers. |
| passengers.showUp.departing | minMinutesBeforeStd 25, medianExtraMinutes 70, sigma 0.55, maxMinutesBeforeStd 240 | SYNTHETIC | Arrival at the checkpoint = STD minus (25 min + log-normal with median 70 min), as in the demo scenario. |
| passengers.showUp.transfer | minMinutesBeforeStd 24, medianExtraMinutes 25, sigma 0.5, maxMinutesBeforeStd 180 | SYNTHETIC | Connecting passengers arrive later, after their inbound flight. |
| passengers.walkSpeedSigma | 0.2 | SYNTHETIC | Individual walking time = nominal zone time x log-normal(median 1, sigma). |
| passengers.callResponse | medianSeconds 75, sigma 0.5, absentProbability 0.04, absentExtraMedianMinutes 4, absentExtraSigma 0.8 | SYNTHETIC | Virtual queue only. As in the demo scenario; to be measured in a pilot. |
| passengers.groups | partySizes size 1, share 0.7; size 2, share 0.2; size 3, share 0.05; size 4, share 0.04; size 5, share 0.01 | SYNTHETIC | More couples and families than on a normal day (leisure season). |
| passengers.assistedShare | 0.007 | SYNTHETIC | Parties taking the assisted path (PRM and similar), as in the demo scenario. |
| passengers.strategicLateArrival | share 0, minMinutesBeforeStd 25, maxMinutesBeforeStd 35 | SYNTHETIC | Nobody arrives late on purpose in this scenario. |
| operations.boardingCloseMinutesBeforeStd | 20 | SYNTHETIC | Boarding closes 20 minutes before the scheduled departure, for every flight. |
| operations.deadlineKnowledge | RULE | SYNTHETIC | The system applies the closing rule to the schedule; without disruptions it matches the ground truth exactly. |
| disruptions.flightDelays | share 0, medianMinutes 20, sigma 0.8, maxMinutes 180, noticeMinMinutesBeforeStd 10, noticeMaxMinutesBeforeStd 120 | SYNTHETIC | No delays in this scenario. |
| disruptions.gateChanges | share 0, minMinutesBeforeStd 30, maxMinutesBeforeStd 70, noticeDelayMaxMinutes 5 | SYNTHETIC | No gate changes in this scenario. |
| disruptions.laneOutages | perDay 0, medianMinutes 20, sigma 0.5, maxMinutes 60 | SYNTHETIC | No unplanned lane outages in this scenario. |
| disruptions.feedOutages | perDay 0, medianMinutes 30, sigma 0.6, maxMinutes 120 | SYNTHETIC | The flight feed never goes down in this scenario. |
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
| Scenario hash | `sha256:d305399bbbdf94f7f8d6f51ac2bdc95e28ae264f990090c55c6706ddd79aed8e` |
| Seeds | 1-200 (200) |
| Source revision | `529b2323a5489dd0be5f8adeb13d2d64f946fad5` |
| Versions | engine 0.5.0, queue core 0.12.0, model 0.7.0, kernel 0.1.0, population generator 0.6.0, scenario schema 5 |
| Generated by | gateflow-sim 0.14.0 |

Command:

```bash
gateflow-sim run --scenario scenarios/tsf-like-peak-day.yaml --seeds 1-200 --policies fifo,fifo-manual,fifo-manual@reactive,fifo-manual@predict,fifo-manual@advise,priority-v3,priority-v3@predict,priority-v3@advise --baseline fifo --compare fifo-manual:fifo,fifo-manual@reactive:fifo,fifo-manual@predict:fifo,fifo-manual@advise:fifo,priority-v3:fifo,priority-v3@predict:fifo,priority-v3@advise:fifo,fifo-manual@reactive:fifo-manual,fifo-manual@predict:fifo-manual,fifo-manual@predict:fifo-manual@reactive,fifo-manual@advise:fifo-manual,fifo-manual@advise:fifo-manual@reactive,fifo-manual@advise:fifo-manual@predict,priority-v3:fifo-manual,priority-v3@predict:priority-v3,priority-v3@predict:fifo-manual@predict,priority-v3@predict:fifo-manual@reactive,priority-v3@advise:priority-v3,priority-v3@advise:priority-v3@predict,priority-v3@advise:fifo-manual@advise,priority-v3@advise:fifo-manual@reactive --bootstrap-resamples 2000
```
