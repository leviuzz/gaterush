# GateFlow simulation report: MX-like hub, transfer security checkpoint (synthetic)

> **SIMULATED RESULTS ON SYNTHETIC OR HYPOTHETICAL DATA. These numbers are model outputs, not measurements, and must not be presented as evidence of operational performance.**

Scenario `mx-like-transfer-hub` (data: SYNTHETIC), 200 simulated days, about 4473 passengers per day (3390 parties). Status quo (baseline): `fifo`.

## 1. Headline

Means per simulated day. P5-P95 is the spread across days; brackets give the 95% confidence interval of the mean (bootstrap over days).

| Policy | Missed flights per day | of which connecting | Missed per 1,000 passengers |
|---|---:|---:|---:|
| Physical FIFO queue (status quo, policy A): `fifo` 1.1.0 | 131.6 (P5-P95 80.0-201.3) | 131.6 | 29.43 |
| Physical FIFO queue with staff calling closing flights (status quo with manual handling, policy A'): `fifo-manual` 0.1.0 | 96.7 (P5-P95 50.0-145.1) | 96.7 | 21.61 |
| Physical FIFO queue with staff calling closing flights (status quo with manual handling, policy A'), with extra lanes opened by a supervisor when the queue is long (today): `fifo-manual@reactive` 0.1.0 | 81.5 (P5-P95 42.0-121.0) | 81.5 | 18.21 |
| Physical FIFO queue with staff calling closing flights (status quo with manual handling, policy A'), with extra lanes recommended by GateFlow's forecast: `fifo-manual@predict` 0.1.0 | 64.5 (P5-P95 35.0-94.0) | 64.5 | 14.42 |
| GateFlow virtual queue with constrained EDF priority v3: fast track, stale-data rule and hysteresis (policy B): `priority-v3` 0.2.0 | 87.9 (P5-P95 48.0-138.2) | 87.9 | 19.66 |
| GateFlow virtual queue with constrained EDF priority v3: fast track, stale-data rule and hysteresis (policy B), with extra lanes recommended by GateFlow's forecast: `priority-v3@predict` 0.2.0 | 61.8 (P5-P95 37.0-89.0) | 61.8 | 13.81 |

| `fifo-manual` compared with `fifo` | Mean per day [95% CI] |
|---|---:|
| Flights saved: missed with `fifo`, caught with `fifo-manual` | 39.3 [36.5, 42.1] |
| Flights lost: caught with `fifo`, missed with `fifo-manual` | 4.3 [3.5, 5.2] |
| **Net flights saved** | **35.0 [32.4, 37.7]** |
| Days with a net gain / with a net loss | 99.5% / 0.5% |
| At-risk passengers reaching the gate in time (244.1 per day classified URGENT on arrival under `fifo`) | 61.0% with `fifo`, 74.9% with `fifo-manual` |
| Change in mean time from arrival to screening (min) | 0.00 [-0.01, 0.00] |
| Change in mean time standing in a queue (min) | 0.00 [-0.01, 0.00] |

| `fifo-manual@reactive` compared with `fifo` | Mean per day [95% CI] |
|---|---:|
| Flights saved: missed with `fifo`, caught with `fifo-manual@reactive` | 52.3 [47.6, 57.3] |
| Flights lost: caught with `fifo`, missed with `fifo-manual@reactive` | 2.1 [1.7, 2.5] |
| **Net flights saved** | **50.1 [45.4, 55.4]** |
| Days with a net gain / with a net loss | 100.0% / 0.0% |
| At-risk passengers reaching the gate in time (244.1 per day classified URGENT on arrival under `fifo`) | 61.0% with `fifo`, 80.1% with `fifo-manual@reactive` |
| Change in mean time from arrival to screening (min) | -0.34 [-0.40, -0.29] |
| Change in mean time standing in a queue (min) | -0.34 [-0.40, -0.29] |

| `fifo-manual@predict` compared with `fifo` | Mean per day [95% CI] |
|---|---:|
| Flights saved: missed with `fifo`, caught with `fifo-manual@predict` | 67.7 [62.4, 73.3] |
| Flights lost: caught with `fifo`, missed with `fifo-manual@predict` | 0.6 [0.4, 0.8] |
| **Net flights saved** | **67.1 [61.9, 72.5]** |
| Days with a net gain / with a net loss | 100.0% / 0.0% |
| At-risk passengers reaching the gate in time (244.1 per day classified URGENT on arrival under `fifo`) | 61.0% with `fifo`, 86.1% with `fifo-manual@predict` |
| Change in mean time from arrival to screening (min) | -0.85 [-0.92, -0.78] |
| Change in mean time standing in a queue (min) | -0.85 [-0.93, -0.78] |

| `priority-v3` compared with `fifo` | Mean per day [95% CI] |
|---|---:|
| Flights saved: missed with `fifo`, caught with `priority-v3` | 52.8 [49.8, 55.9] |
| Flights lost: caught with `fifo`, missed with `priority-v3` | 9.1 [8.2, 10.1] |
| **Net flights saved** | **43.7 [41.1, 46.5]** |
| Days with a net gain / with a net loss | 100.0% / 0.0% |
| At-risk passengers reaching the gate in time (244.1 per day classified URGENT on arrival under `fifo`) | 61.0% with `fifo`, 81.0% with `priority-v3` |
| Change in mean time from arrival to screening (min) | 0.01 [0.00, 0.01] |
| Change in mean time standing in a queue (min) | -1.12 [-1.20, -1.05] |

| `priority-v3@predict` compared with `fifo` | Mean per day [95% CI] |
|---|---:|
| Flights saved: missed with `fifo`, caught with `priority-v3@predict` | 72.0 [67.0, 78.1] |
| Flights lost: caught with `fifo`, missed with `priority-v3@predict` | 2.2 [1.9, 2.6] |
| **Net flights saved** | **69.8 [64.8, 75.4]** |
| Days with a net gain / with a net loss | 100.0% / 0.0% |
| At-risk passengers reaching the gate in time (244.1 per day classified URGENT on arrival under `fifo`) | 61.0% with `fifo`, 88.6% with `priority-v3@predict` |
| Change in mean time from arrival to screening (min) | -0.85 [-0.92, -0.78] |
| Change in mean time standing in a queue (min) | -1.24 [-1.32, -1.17] |

| `fifo-manual@reactive` compared with `fifo-manual` | Mean per day [95% CI] |
|---|---:|
| Flights saved: missed with `fifo-manual`, caught with `fifo-manual@reactive` | 15.2 [12.3, 18.6] |
| Flights lost: caught with `fifo-manual`, missed with `fifo-manual@reactive` | 0.1 [0.0, 0.1] |
| **Net flights saved** | **15.2 [12.3, 18.4]** |
| Days with a net gain / with a net loss | 79.0% / 0.0% |
| At-risk passengers reaching the gate in time (243.7 per day classified URGENT on arrival under `fifo-manual`) | 74.9% with `fifo-manual`, 80.1% with `fifo-manual@reactive` |
| Change in mean time from arrival to screening (min) | -0.34 [-0.40, -0.29] |
| Change in mean time standing in a queue (min) | -0.34 [-0.40, -0.29] |

| `fifo-manual@predict` compared with `fifo-manual` | Mean per day [95% CI] |
|---|---:|
| Flights saved: missed with `fifo-manual`, caught with `fifo-manual@predict` | 32.3 [28.6, 36.4] |
| Flights lost: caught with `fifo-manual`, missed with `fifo-manual@predict` | 0.1 [0.0, 0.2] |
| **Net flights saved** | **32.2 [28.5, 36.4]** |
| Days with a net gain / with a net loss | 100.0% / 0.0% |
| At-risk passengers reaching the gate in time (243.7 per day classified URGENT on arrival under `fifo-manual`) | 74.9% with `fifo-manual`, 86.1% with `fifo-manual@predict` |
| Change in mean time from arrival to screening (min) | -0.85 [-0.93, -0.78] |
| Change in mean time standing in a queue (min) | -0.85 [-0.93, -0.77] |

| `fifo-manual@predict` compared with `fifo-manual@reactive` | Mean per day [95% CI] |
|---|---:|
| Flights saved: missed with `fifo-manual@reactive`, caught with `fifo-manual@predict` | 17.5 [15.8, 19.3] |
| Flights lost: caught with `fifo-manual@reactive`, missed with `fifo-manual@predict` | 0.5 [0.3, 0.8] |
| **Net flights saved** | **17.0 [15.3, 18.7]** |
| Days with a net gain / with a net loss | 97.5% / 1.5% |
| At-risk passengers reaching the gate in time (217.3 per day classified URGENT on arrival under `fifo-manual@reactive`) | 77.9% with `fifo-manual@reactive`, 84.6% with `fifo-manual@predict` |
| Change in mean time from arrival to screening (min) | -0.51 [-0.55, -0.47] |
| Change in mean time standing in a queue (min) | -0.51 [-0.55, -0.47] |

| `priority-v3` compared with `fifo-manual` | Mean per day [95% CI] |
|---|---:|
| Flights saved: missed with `fifo-manual`, caught with `priority-v3` | 22.7 [21.1, 24.4] |
| Flights lost: caught with `fifo-manual`, missed with `priority-v3` | 14.0 [12.7, 15.4] |
| **Net flights saved** | **8.7 [7.2, 10.4]** |
| Days with a net gain / with a net loss | 79.5% / 17.0% |
| At-risk passengers reaching the gate in time (243.7 per day classified URGENT on arrival under `fifo-manual`) | 74.9% with `fifo-manual`, 81.0% with `priority-v3` |
| Change in mean time from arrival to screening (min) | 0.01 [0.00, 0.01] |
| Change in mean time standing in a queue (min) | -1.12 [-1.20, -1.05] |

| `priority-v3@predict` compared with `priority-v3` | Mean per day [95% CI] |
|---|---:|
| Flights saved: missed with `priority-v3`, caught with `priority-v3@predict` | 26.6 [23.1, 31.2] |
| Flights lost: caught with `priority-v3`, missed with `priority-v3@predict` | 0.5 [0.3, 0.6] |
| **Net flights saved** | **26.2 [22.6, 30.4]** |
| Days with a net gain / with a net loss | 99.5% / 0.0% |
| At-risk passengers reaching the gate in time (313.0 per day classified URGENT on arrival under `priority-v3`) | 84.8% with `priority-v3`, 90.7% with `priority-v3@predict` |
| Change in mean time from arrival to screening (min) | -0.86 [-0.93, -0.79] |
| Change in mean time standing in a queue (min) | -0.12 [-0.13, -0.11] |

| `priority-v3@predict` compared with `fifo-manual@predict` | Mean per day [95% CI] |
|---|---:|
| Flights saved: missed with `fifo-manual@predict`, caught with `priority-v3@predict` | 8.5 [7.7, 9.5] |
| Flights lost: caught with `fifo-manual@predict`, missed with `priority-v3@predict` | 5.8 [5.3, 6.3] |
| **Net flights saved** | **2.7 [1.8, 3.6]** |
| Days with a net gain / with a net loss | 59.0% / 34.0% |
| At-risk passengers reaching the gate in time (173.2 per day classified URGENT on arrival under `fifo-manual@predict`) | 81.0% with `fifo-manual@predict`, 84.7% with `priority-v3@predict` |
| Change in mean time from arrival to screening (min) | 0.00 [-0.01, 0.01] |
| Change in mean time standing in a queue (min) | -0.39 [-0.42, -0.36] |

| `priority-v3@predict` compared with `fifo-manual@reactive` | Mean per day [95% CI] |
|---|---:|
| Flights saved: missed with `fifo-manual@reactive`, caught with `priority-v3@predict` | 24.8 [22.9, 26.5] |
| Flights lost: caught with `fifo-manual@reactive`, missed with `priority-v3@predict` | 5.0 [4.5, 5.6] |
| **Net flights saved** | **19.7 [17.8, 21.6]** |
| Days with a net gain / with a net loss | 95.5% / 3.5% |
| At-risk passengers reaching the gate in time (217.3 per day classified URGENT on arrival under `fifo-manual@reactive`) | 77.9% with `fifo-manual@reactive`, 87.4% with `priority-v3@predict` |
| Change in mean time from arrival to screening (min) | -0.51 [-0.54, -0.47] |
| Change in mean time standing in a queue (min) | -0.90 [-0.93, -0.86] |

## 2. Waiting times

*Time to screening*: minutes from arrival at the checkpoint (when the ticket is issued) to the start of screening. *Standing*: minutes spent standing in a queue: the whole wait in a physical queue; in a virtual queue only the wait at the lanes after validating the ticket. Each column is the mean over days of the daily statistic; "longest" is the longest single value over all simulated days.

| Policy | Time to screening: mean | P50 | P90 | P99 | Longest | Standing: mean | P90 | Longest |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| `fifo` | 2.0 | 0.6 | 7.0 | 12.5 | 38.7 | 2.0 | 7.0 | 38.7 |
| `fifo-manual` | 2.0 | 0.6 | 6.8 | 14.1 | 72.3 | 2.0 | 6.8 | 72.3 |
| `fifo-manual@reactive` | 1.7 | 0.5 | 5.4 | 11.4 | 28.0 | 1.7 | 5.4 | 28.0 |
| `fifo-manual@predict` | 1.2 | 0.4 | 3.7 | 8.0 | 20.9 | 1.2 | 3.7 | 20.9 |
| `priority-v3` | 2.0 | 0.6 | 6.6 | 15.2 | 109.2 | 0.9 | 2.5 | 19.6 |
| `priority-v3@predict` | 1.2 | 0.4 | 3.6 | 8.5 | 78.2 | 0.8 | 2.4 | 11.8 |

## 3. Cost for passengers not prioritised by `fifo-manual` (compared with `fifo`)

Extra wait = time to screening with the candidate minus time to screening with the reference, for the same passenger.

| Metric | Value [95% CI] |
|---|---:|
| Passengers prioritised per day | 269.6 (P5-P95 182.7-392.3) (6.11% of tickets called) |
| Mean extra wait of non-prioritised passengers (min) | 0.17 [0.16, 0.18] |
| P90 extra wait of non-prioritised passengers (min) | 0.46 [0.43, 0.49] |
| Largest extra wait of any non-prioritised passenger, worst day (min) | 45.5 |
| Share of non-prioritised passengers delayed by more than 5 min | 0.44% |
| Most people who overtook one ticket, worst day (no bound for staff flight calls) | 216 |

## 4. Cost for passengers not prioritised by `fifo-manual@reactive` (compared with `fifo`)

Extra wait = time to screening with the candidate minus time to screening with the reference, for the same passenger.

| Metric | Value [95% CI] |
|---|---:|
| Passengers prioritised per day | 236.0 (P5-P95 165.0-301.1) (5.34% of tickets called) |
| Mean extra wait of non-prioritised passengers (min) | -0.20 [-0.25, -0.15] |
| P90 extra wait of non-prioritised passengers (min) | 0.30 [0.27, 0.32] |
| Largest extra wait of any non-prioritised passenger, worst day (min) | 22.8 |
| Share of non-prioritised passengers delayed by more than 5 min | 0.16% |
| Most people who overtook one ticket, worst day (no bound for staff flight calls) | 68 |

## 5. Cost for passengers not prioritised by `fifo-manual@predict` (compared with `fifo`)

Extra wait = time to screening with the candidate minus time to screening with the reference, for the same passenger.

| Metric | Value [95% CI] |
|---|---:|
| Passengers prioritised per day | 183.8 (P5-P95 124.0-251.1) (4.16% of tickets called) |
| Mean extra wait of non-prioritised passengers (min) | -0.75 [-0.82, -0.68] |
| P90 extra wait of non-prioritised passengers (min) | 0.12 [0.10, 0.14] |
| Largest extra wait of any non-prioritised passenger, worst day (min) | 11.5 |
| Share of non-prioritised passengers delayed by more than 5 min | 0.02% |
| Most people who overtook one ticket, worst day (no bound for staff flight calls) | 44 |

## 6. Cost for passengers not prioritised by `priority-v3` (compared with `fifo`)

Extra wait = time to screening with the candidate minus time to screening with the reference, for the same passenger.

| Metric | Value [95% CI] |
|---|---:|
| Passengers prioritised per day | 305.9 (P5-P95 217.9-391.1) (6.71% of tickets called) |
| Mean extra wait of non-prioritised passengers (min) | 0.24 [0.23, 0.26] |
| P90 extra wait of non-prioritised passengers (min) | 0.74 [0.68, 0.81] |
| Largest extra wait of any non-prioritised passenger, worst day (min) | 100.5 |
| Share of non-prioritised passengers delayed by more than 5 min | 1.01% |
| Most people who overtook one ticket, worst day (bound K = 30, passes in the window and at the lanes included) | 30 |
| Calls where the cap blocked a priority call, per day | 44.0 |
| Calls where the overtake guard took precedence (a ticket had reached K overtakes), per day | 0.6 |
| People through the fast track per day | 305.2 |
| People passed at the lanes by fast-tracked parties per day | 1489.4 |

## 7. Cost for passengers not prioritised by `priority-v3@predict` (compared with `fifo`)

Extra wait = time to screening with the candidate minus time to screening with the reference, for the same passenger.

| Metric | Value [95% CI] |
|---|---:|
| Passengers prioritised per day | 252.0 (P5-P95 193.9-312.1) (5.54% of tickets called) |
| Mean extra wait of non-prioritised passengers (min) | -0.72 [-0.79, -0.66] |
| P90 extra wait of non-prioritised passengers (min) | 0.15 [0.13, 0.18] |
| Largest extra wait of any non-prioritised passenger, worst day (min) | 69.1 |
| Share of non-prioritised passengers delayed by more than 5 min | 0.14% |
| Most people who overtook one ticket, worst day (bound K = 30, passes in the window and at the lanes included) | 30 |
| Calls where the cap blocked a priority call, per day | 14.1 |
| Calls where the overtake guard took precedence (a ticket had reached K overtakes), per day | 0.0 |
| People through the fast track per day | 251.9 |
| People passed at the lanes by fast-tracked parties per day | 1145.7 |

## 8. Cost for passengers not prioritised by `priority-v3` (compared with `fifo-manual`)

Extra wait = time to screening with the candidate minus time to screening with the reference, for the same passenger.

| Metric | Value [95% CI] |
|---|---:|
| Passengers prioritised per day | 305.9 (P5-P95 217.9-391.1) (6.71% of tickets called) |
| Mean extra wait of non-prioritised passengers (min) | 0.13 [0.12, 0.14] |
| P90 extra wait of non-prioritised passengers (min) | 0.39 [0.36, 0.42] |
| Largest extra wait of any non-prioritised passenger, worst day (min) | 100.0 |
| Share of non-prioritised passengers delayed by more than 5 min | 0.88% |
| Most people who overtook one ticket, worst day (bound K = 30, passes in the window and at the lanes included) | 30 |
| Calls where the cap blocked a priority call, per day | 44.0 |
| Calls where the overtake guard took precedence (a ticket had reached K overtakes), per day | 0.6 |
| People through the fast track per day | 305.2 |
| People passed at the lanes by fast-tracked parties per day | 1489.4 |

## 9. Cost for passengers not prioritised by `priority-v3@predict` (compared with `fifo-manual@predict`)

Extra wait = time to screening with the candidate minus time to screening with the reference, for the same passenger.

| Metric | Value [95% CI] |
|---|---:|
| Passengers prioritised per day | 252.0 (P5-P95 193.9-312.1) (5.54% of tickets called) |
| Mean extra wait of non-prioritised passengers (min) | 0.04 [0.04, 0.05] |
| P90 extra wait of non-prioritised passengers (min) | 0.15 [0.14, 0.17] |
| Largest extra wait of any non-prioritised passenger, worst day (min) | 69.1 |
| Share of non-prioritised passengers delayed by more than 5 min | 0.25% |
| Most people who overtook one ticket, worst day (bound K = 30, passes in the window and at the lanes included) | 30 |
| Calls where the cap blocked a priority call, per day | 14.1 |
| Calls where the overtake guard took precedence (a ticket had reached K overtakes), per day | 0.0 |
| People through the fast track per day | 251.9 |
| People passed at the lanes by fast-tracked parties per day | 1145.7 |

## 10. Cost for passengers not prioritised by `priority-v3@predict` (compared with `fifo-manual@reactive`)

Extra wait = time to screening with the candidate minus time to screening with the reference, for the same passenger.

| Metric | Value [95% CI] |
|---|---:|
| Passengers prioritised per day | 252.0 (P5-P95 193.9-312.1) (5.54% of tickets called) |
| Mean extra wait of non-prioritised passengers (min) | -0.47 [-0.50, -0.43] |
| P90 extra wait of non-prioritised passengers (min) | 0.09 [0.07, 0.11] |
| Largest extra wait of any non-prioritised passenger, worst day (min) | 68.2 |
| Share of non-prioritised passengers delayed by more than 5 min | 0.25% |
| Most people who overtook one ticket, worst day (bound K = 30, passes in the window and at the lanes included) | 30 |
| Calls where the cap blocked a priority call, per day | 14.1 |
| Calls where the overtake guard took precedence (a ticket had reached K overtakes), per day | 0.0 |
| People through the fast track per day | 251.9 |
| People passed at the lanes by fast-tracked parties per day | 1145.7 |

## 11. Call mechanics

Virtual queues only. A *second call* is made when the passenger has not presented within the call timeout; a *no-show* (missed call) is a ticket not validated after the second timeout. A no-show who rescans within the reactivation window is *reactivated*; later, the passenger needs a *new ticket*. *Idle lane time* counts open lanes with nobody to screen while passengers were waiting for or answering a call, as a share of the staffed lane time. Means per day.

| Policy | Calls | Second calls (share of calls) | No-shows (missed-call rate) | Reactivations | New tickets | Idle lane time (min, share) |
|---|---:|---:|---:|---:|---:|---:|
| `priority-v3` | 3377 | 28.8 (0.85%) | 10.9 (0.32%) | 10.4 | 0.5 | 0.8 (0.03%) |
| `priority-v3@predict` | 3371 | 11.2 (0.33%) | 4.6 (0.14%) | 4.4 | 0.2 | 0.5 (0.02%) |

## 12. Disruptions, data quality and stability

Disruptions of the simulated days (ground truth, the same for every policy), means per day. The system learns of a delay or a gate change only when the flight feed announces it; messages sent while the feed is down arrive when it recovers.

| Disruption | Per day |
|---|---:|
| Delayed flights (mean delay of a delayed flight, min) | 14.6 (27.5) |
| Gate changes | 8.8 |
| Lane outages (lane-minutes out of service) | 1.1 (22.5) |
| Feed outages (minutes without the feed) | 1.1 (35.9) |
| Feed messages (sent while the feed was down) | 23.3 (0.6) |

*Class changes* count the changes of risk class of waiting tickets under each policy's own classification. A *reversal* is a change in the direction opposite to the previous one, e.g. ATTENTION to URGENT and back: the flapping that hysteresis prevents. *Boosts on wrong information*: people prioritised while the system's knowledge of their flight differed from the truth (a delay or a gate change not yet known). Means per day.

| Policy | Missed among passengers of delayed or re-gated flights | Boosts on wrong information (people) | Class changes per 100 parties | Reversals | People whose class flapped |
|---|---:|---:|---:|---:|---:|
| `fifo` | 22.7 of 1624 | 0.0 | not classified | - | - |
| `fifo-manual` | 17.9 of 1624 | 23.6 | not classified | - | - |
| `fifo-manual@reactive` | 15.6 of 1624 | 20.8 | not classified | - | - |
| `fifo-manual@predict` | 13.0 of 1624 | 16.6 | not classified | - | - |
| `priority-v3` | 16.6 of 1624 | 27.9 | 1.13 | 1.5 | 1.5 |
| `priority-v3@predict` | 12.6 of 1624 | 22.4 | 0.19 | 0.1 | 0.1 |

## 13. Groups, assisted passengers and late arrivals

Means per day. A group (two people or more) holds one ticket and counts as its people in every other table, in the priority cap and in the overtake bound. Assisted passengers are taken to the next free lane under every policy.

| Policy | Groups (people in groups) | Groups prioritised | Assisted passengers: people, mean time to screening (min), missed | Late on purpose: people, prioritised, missed |
|---|---:|---:|---:|---:|
| `fifo` | 738.4 (1821.4) | 0.0 | 30.8, 0.14, 0.3 | none in this scenario |
| `fifo-manual` | 738.4 (1821.4) | 43.6 | 30.8, 0.14, 0.3 | none in this scenario |
| `fifo-manual@reactive` | 738.4 (1821.4) | 38.2 | 30.8, 0.13, 0.3 | none in this scenario |
| `fifo-manual@predict` | 738.4 (1821.4) | 29.8 | 30.8, 0.12, 0.3 | none in this scenario |
| `priority-v3` | 738.4 (1821.4) | 52.7 | 30.8, 0.14, 0.3 | none in this scenario |
| `priority-v3@predict` | 738.4 (1821.4) | 43.0 | 30.8, 0.12, 0.3 | none in this scenario |

## 14. Checkpoint operations

Means per day; "longest" is the largest value over all simulated days.

| Policy | Staffed lane-hours | Lane utilisation | Tickets waiting for a call: mean (longest) | People standing in a queue: mean (longest) | URGENT on arrival | CRITICAL on arrival |
|---|---:|---:|---:|---:|---:|---:|
| `fifo` | 49.0 | 76.1% | 8.3 (181) | 8.3 (181) | 244.1 | 35.6 |
| `fifo-manual` | 49.0 | 76.1% | 8.3 (185) | 8.3 (185) | 243.7 | 35.6 |
| `fifo-manual@reactive` | 49.5 | 75.4% | 6.9 (151) | 6.9 (151) | 217.3 | 35.6 |
| `fifo-manual@predict` | 50.7 | 73.7% | 4.9 (112) | 4.9 (112) | 173.2 | 35.6 |
| `priority-v3` | 49.0 | 76.1% | 3.5 (173) | 3.8 (29) | 313.0 | 35.6 |
| `priority-v3@predict` | 50.7 | 73.6% | 1.1 (87) | 3.3 (34) | 258.8 | 35.6 |

## 15. Lane management

Extra lanes open beyond the plan, never more than the 5 lanes the checkpoint has, and at most 1 at the same time (the staff on call). A decision takes a median of 10 min to put a lane into service (varying from day to day), and an extra lane stays open at least 30 min. The supervisor of today's practice (`@reactive`) decides on the wait the queue shows; GateFlow (`@predict`) projects the queue from the forecast of arrivals and recommends lanes, and the duty manager follows 80% of its recommendations. Means per day; "most" is the largest value over all simulated days.

| Policy | Rule | Staffed lane-hours | of which extra | Extra lanes opened (closed) | Decisions (followed) | Most lanes open |
|---|---|---:|---:|---:|---:|---:|
| `fifo` | plan only | 49.0 | 0.0 | - | - | 4 |
| `fifo-manual` | plan only | 49.0 | 0.0 | - | - | 4 |
| `fifo-manual@reactive` | supervisor: opens when the queue shows more than 10 min, closes below 2 min | 49.5 | 0.6 | 1.6 (0.9) | 2.5 (2.5) | 5 |
| `fifo-manual@predict` | GateFlow: keeps the projected wait below 10 min over the next 45 min, closes below 3 min | 50.7 | 1.8 | 2.8 (2.6) | 6.6 (5.4) | 5 |
| `priority-v3` | plan only | 49.0 | 0.0 | - | - | 4 |
| `priority-v3@predict` | GateFlow: keeps the projected wait below 10 min over the next 45 min, closes below 3 min | 50.7 | 1.8 | 2.8 (2.6) | 6.7 (5.4) | 5 |

What the extra lanes buy: each policy compared with the same calls under another lane rule, passenger by passenger. Means per day [95% CI]; the last two columns divide totals over all days by the extra lane-hours (shown when the candidate only adds lane-hours).

| Comparison | Extra lane-hours | Net flights saved | Change in mean time to screening (min) | Waiting saved per extra lane-hour (person-hours) | Net flights saved per extra lane-hour |
|---|---:|---:|---:|---:|---:|
| `fifo-manual@reactive` vs `fifo-manual` | 0.6 [0.5, 0.6] | 15.2 [12.3, 18.4] | -0.34 [-0.40, -0.29] | 44.9 [38.8, 50.8] | 26.70 [22.24, 32.34] |
| `fifo-manual@predict` vs `fifo-manual` | 1.8 [1.7, 1.9] | 32.2 [28.5, 36.4] | -0.85 [-0.93, -0.78] | 34.9 [32.3, 37.5] | 17.72 [15.81, 19.87] |
| `fifo-manual@predict` vs `fifo-manual@reactive` | 1.2 [1.2, 1.3] | 17.0 [15.3, 18.7] | -0.51 [-0.55, -0.47] | - | - |
| `priority-v3@predict` vs `priority-v3` | 1.8 [1.7, 1.9] | 26.2 [22.6, 30.4] | -0.86 [-0.93, -0.79] | 35.0 [32.5, 37.6] | 14.38 [12.56, 16.50] |

## 16. Method

- Each seed is one simulated day of the same design day (same flights), with different passengers.
- All policies are run on exactly the same passengers (common random numbers), so each comparison is paired passenger by passenger: a flight is *saved* when the passenger misses it with the reference and catches it with the candidate, and *lost* in the opposite case.
- `fifo-manual` (A') adds today's manual handling to the physical queue: staff periodically call the flights closing soon and their passengers are taken first. Comparing GateFlow with A' estimates the benefit over today's real practice.
- Passengers are counted as people: a party of three that misses its flight counts as three, in every table and comparison.
- The status quo is a physical FIFO queue. GateFlow policies run a virtual queue: tickets are called so as to keep the free lanes plus a call-ahead buffer supplied; each passenger presents after their own response time (later when they miss the call), validates the ticket at the access point and queues briefly at the lanes. Comparing `virtual-fifo` with the status quo isolates the cost or benefit of the call mechanics; comparing a priority policy with `virtual-fifo` isolates the prioritisation.
- A passenger misses the flight when they reach the gate after boarding closes (ground truth).
- Confidence intervals: percentile bootstrap of the mean over days (2000 resamples, seed 20261121). Quantiles: linear interpolation between order statistics (Hyndman-Fan type 7).
- Risk classes are computed on arrival with the same parameters for every policy. URGENT means "would miss the flight if served in FIFO order, but can still make it if selected now"; CRITICAL means "cannot make it even if selected now": such passengers are escalated to staff and never boosted automatically.

## 17. Policies

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

## 18. Data sources and licences

Where the data of this scenario comes from, and the terms under which it may be used.

| Source | Kind | Provider | Licence or terms of use | Retrieved | Used for |
|---|---|---|---|---|---|
| Synthetic assumptions of this airport configuration (`gateflow-synthetic`) | SYNTHETIC | GateFlow | Created for GateFlow; contains no third-party data. | - | - |
| Synthetic flight list of the scenario library (`library-flights`) | SYNTHETIC | GateFlow (scenarios/flights/make-library-flights.mjs) | Created for GateFlow; contains no third-party schedule data. | - | flight list |

Airport configuration: `mx-like-hub` (MX-like hub (synthetic)), checkpoint `transfer`, file `../airports/mx-like-hub.yaml` (SHA-256 `8bd5741a547062ec78336670982c0578097a642715c9ebe6b2af3f82c3c6ec46`). The scenario gives only its day; every other parameter comes from this configuration.

Design day: 58 departures from the flight list `flights/mx-like-transfer-hub.csv` (SHA-256 `04e56676d49984dd3b6941c187b1b7d27532823d697116a2343139927b6d2043`), source `library-flights`.

## 19. Assumptions

Every model parameter, with its source. SYNTHETIC values are illustrative assumptions.

| Parameter | Value | Source | Note |
|---|---|---|---|
| checkpoint.lanesAvailable | 5 | SYNTHETIC | Lanes the checkpoint has (assumed): the roster plans at most 4, the others open only as extra lanes. |
| checkpoint.laneSchedule | from 00:00, lanes 1; from 05:00, lanes 2; from 06:00, lanes 4; from 07:00, lanes 3; from 08:00, lanes 2; from 09:00, lanes 4; from 10:00, lanes 3; from 11:00, lanes 2; from 12:00, lanes 4; from 13:00, lanes 2; from 14:00, lanes 1; from 15:00, lanes 4; from 16:00, lanes 2; from 18:00, lanes 4; from 19:00, lanes 3; from 20:00, lanes 2; from 21:00, lanes 4; from 22:00, lanes 1 | SYNTHETIC | Planned for this day with the lane plan rule of the checkpoint (airports/mx-like-hub.yaml): 55.0 lane-hours. gateflow-sim lanes --scenario <this file> prints the plan again. |
| checkpoint.lanePlanRule | utilisation 0.9, intervalMinutes 60, minLanes 1, maxLanes 4, planningDays 100 | SYNTHETIC | Assumed planning rule, not the airport's: every hour, enough lanes to screen the expected arrivals at 90% utilisation, at least 1 and at most 4 lanes. |
| checkpoint.laneStaffing | maxExtraLanes 1, openDelayMinutes median 10, sigma 0.4, minOpenMinutes 30, followShare 0.8 | SYNTHETIC | Assumed: staff on call can open 1 extra lane beyond the plan, about 10 minutes after the decision (5 to 20 on most days); an extra lane stays open at least 30 minutes; the duty manager follows 4 recommendations of GateFlow out of 5. |
| checkpoint.serviceTimeMeanSeconds | 30 | SYNTHETIC | About 120 passengers per hour per lane (connecting passengers carry cabin bags and purchases). |
| checkpoint.serviceTimeCv | 0.6 | SYNTHETIC |  |
| schedule.seats | aircraft B738, seats 160; aircraft B38M, seats 166; aircraft B39M, seats 180; aircraft E190, seats 99 | SYNTHETIC | Assumed two-class configurations of a network carrier, not airline data. The flight list gives the connecting passengers of each flight; seats only bound them. |
| schedule.gateZones | id A, walkMinutes 6, share 0.4; id B, walkMinutes 11, share 0.4; id C, walkMinutes 17, share 0.2 | SYNTHETIC | Nominal walk from the checkpoint exit to the domestic gates of a large terminal. |
| passengers.loadFactor | min 0.6, mode 0.82, max 0.97 | SYNTHETIC | Not used, the flight list gives the connecting passengers of every flight. |
| passengers.transferShare | 1 | SYNTHETIC | Every passenger of this checkpoint is connecting. |
| passengers.showUp.departing | minMinutesBeforeStd 25, medianExtraMinutes 35, sigma 0.6, maxMinutesBeforeStd 180 | SYNTHETIC | Not used (no departing passengers); the same curve as for connecting passengers. |
| passengers.showUp.transfer | minMinutesBeforeStd 25, medianExtraMinutes 35, sigma 0.6, maxMinutesBeforeStd 180 | SYNTHETIC | Arrival at the transfer checkpoint = STD minus (25 min + log-normal with median 35 min): after the inbound flight, immigration, customs and the bag drop. A long tail of tight connections (late inbound flights, border queues). |
| passengers.walkSpeedSigma | 0.2 | SYNTHETIC | Individual walking time = nominal zone time x log-normal(median 1, sigma). |
| passengers.callResponse | medianSeconds 75, sigma 0.5, absentProbability 0.04, absentExtraMedianMinutes 4, absentExtraSigma 0.8 | SYNTHETIC | Virtual queue only. As in the demo scenario; to be measured in a pilot. |
| passengers.groups | partySizes size 1, share 0.78; size 2, share 0.15; size 3, share 0.04; size 4, share 0.025; size 5, share 0.005 | SYNTHETIC | As in the demo scenario; about 40% of passengers travel with others. |
| passengers.assistedShare | 0.007 | SYNTHETIC | Parties taking the assisted path (PRM and similar), as in the demo scenario. |
| passengers.strategicLateArrival | share 0, minMinutesBeforeStd 25, maxMinutesBeforeStd 35 | SYNTHETIC | Nobody arrives late on purpose in this scenario. |
| operations.boardingCloseMinutesBeforeStd | 20 | SYNTHETIC | Boarding closes 20 minutes before the scheduled departure, for every flight. |
| operations.deadlineKnowledge | RULE | SYNTHETIC | The system applies the closing rule to the schedule; without disruptions it matches the ground truth exactly. |
| disruptions.flightDelays | share 0.25, medianMinutes 20, sigma 0.8, maxMinutes 180, noticeMinMinutesBeforeStd 10, noticeMaxMinutesBeforeStd 120 | SYNTHETIC | A quarter of the departures are delayed (log-normal, median 20 minutes), announced between 120 and 10 minutes before the scheduled departure. Inbound delays are part of the arrival curve above. |
| disruptions.gateChanges | share 0.15, minMinutesBeforeStd 30, maxMinutesBeforeStd 70, noticeDelayMaxMinutes 5 | SYNTHETIC | More gate changes than at an origin-and-destination airport (assumed). |
| disruptions.laneOutages | perDay 1, medianMinutes 20, sigma 0.5, maxMinutes 60 | SYNTHETIC | About one unplanned outage of one lane per day (median 20 minutes). |
| disruptions.feedOutages | perDay 1, medianMinutes 30, sigma 0.6, maxMinutes 120 | SYNTHETIC | The flight feed goes down about once a day (median 30 minutes). |
| gateflow | maxOvertakes 30, capMaxPriorityCalls 10, capWindowCalls 20, hysteresisMinutes 3, maxDeadlineAgeMinutes 60, prepareWindowSize 10, callAheadSeconds 180, responseEstimateSeconds 90, laneTargetWaitMinutes 10, laneHorizonMinutes 45 | SYNTHETIC | GateFlow defaults (priority v3 0.2.0, the virtual queue of ADR-017 and the lane recommendations of ADR-039), to be approved by the airport for this checkpoint. |
| todayPractice | callWindowMinutes 20, announcementIntervalMinutes 5, laneOpenWaitMinutes 10, laneCloseWaitMinutes 2 | SYNTHETIC | Baseline A' as in ADR-022: every 5 minutes staff call the flights closing within 20 minutes. With a supervisor (@reactive, ADR-039), an extra lane opens when the queue shows more than 10 minutes and closes below 2. To replace with how this airport handles urgent passengers and long queues. |
| fairnessTarget | maxShareDelayedOver5Min 0.001 | SYNTHETIC | The criterion of ADR-025, to be approved by the airport. |

## 20. Limitations of this model version

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

## 21. Reproducibility

| Item | Value |
|---|---|
| Scenario hash | `sha256:28845aefd9f2e1d7a74645b3700edf968f5ceb5142ef639e3e86bf2feb4c9c60` |
| Seeds | 1-200 (200) |
| Source revision | `b3c9f7e3b0fae64477fb45231fcb31cb4864982e` |
| Versions | engine 0.5.0, queue core 0.6.0, model 0.6.0, kernel 0.1.0, population generator 0.6.0, scenario schema 5 |
| Generated by | gateflow-sim 0.8.0 |

Command:

```bash
gateflow-sim run --scenario scenarios/mx-like-transfer-hub.yaml --seeds 1-200 --policies fifo,fifo-manual,fifo-manual@reactive,fifo-manual@predict,priority-v3,priority-v3@predict --baseline fifo --compare fifo-manual:fifo,fifo-manual@reactive:fifo,fifo-manual@predict:fifo,priority-v3:fifo,priority-v3@predict:fifo,fifo-manual@reactive:fifo-manual,fifo-manual@predict:fifo-manual,fifo-manual@predict:fifo-manual@reactive,priority-v3:fifo-manual,priority-v3@predict:priority-v3,priority-v3@predict:fifo-manual@predict,priority-v3@predict:fifo-manual@reactive --bootstrap-resamples 2000
```
