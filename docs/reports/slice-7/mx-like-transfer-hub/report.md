# GateFlow simulation report: MX-like hub, transfer security checkpoint (synthetic)

> **SIMULATED RESULTS ON SYNTHETIC OR HYPOTHETICAL DATA. These numbers are model outputs, not measurements, and must not be presented as evidence of operational performance.**

Scenario `mx-like-transfer-hub` (data: SYNTHETIC), 200 simulated days, about 4473 passengers per day (3390 parties). Status quo (baseline): `fifo`.

## 1. Headline

Means per simulated day. P5-P95 is the spread across days; brackets give the 95% confidence interval of the mean (bootstrap over days).

| Policy | Missed flights per day | of which connecting | Missed per 1,000 passengers |
|---|---:|---:|---:|
| Physical FIFO queue (status quo, policy A): `fifo` 1.1.0 | 131.6 (P5-P95 80.0-201.3) | 131.6 | 29.43 |
| Physical FIFO queue with staff calling closing flights (status quo with manual handling, policy A'): `fifo-manual` 0.1.0 | 96.7 (P5-P95 50.0-145.1) | 96.7 | 21.61 |
| GateFlow virtual queue in FIFO order: `virtual-fifo` 0.1.0 | 132.7 (P5-P95 82.0-198.7) | 132.7 | 29.66 |
| GateFlow virtual queue with constrained EDF priority v2 and fast track (policy B): `priority-v2` 0.1.0 | 87.8 (P5-P95 48.0-138.1) | 87.8 | 19.63 |
| GateFlow virtual queue with constrained EDF priority v3: fast track, stale-data rule and hysteresis (policy B): `priority-v3` 0.2.0 | 87.9 (P5-P95 48.0-138.2) | 87.9 | 19.66 |

| `fifo-manual` compared with `fifo` | Mean per day [95% CI] |
|---|---:|
| Flights saved: missed with `fifo`, caught with `fifo-manual` | 39.3 [36.5, 42.1] |
| Flights lost: caught with `fifo`, missed with `fifo-manual` | 4.3 [3.5, 5.2] |
| **Net flights saved** | **35.0 [32.4, 37.7]** |
| Days with a net gain / with a net loss | 99.5% / 0.5% |
| At-risk passengers reaching the gate in time (245.2 per day classified URGENT on arrival under `fifo`) | 61.0% with `fifo`, 74.9% with `fifo-manual` |
| Change in mean time from arrival to screening (min) | 0.00 [-0.01, 0.00] |
| Change in mean time standing in a queue (min) | 0.00 [-0.01, 0.00] |

| `virtual-fifo` compared with `fifo` | Mean per day [95% CI] |
|---|---:|
| Flights saved: missed with `fifo`, caught with `virtual-fifo` | 5.1 [4.5, 5.6] |
| Flights lost: caught with `fifo`, missed with `virtual-fifo` | 6.1 [5.6, 6.6] |
| **Net flights saved** | **-1.1 [-1.7, -0.5]** |
| Days with a net gain / with a net loss | 31.0% / 58.5% |
| At-risk passengers reaching the gate in time (245.2 per day classified URGENT on arrival under `fifo`) | 61.0% with `fifo`, 61.2% with `virtual-fifo` |
| Change in mean time from arrival to screening (min) | 0.01 [0.00, 0.01] |
| Change in mean time standing in a queue (min) | -1.14 [-1.22, -1.06] |

| `priority-v2` compared with `fifo` | Mean per day [95% CI] |
|---|---:|
| Flights saved: missed with `fifo`, caught with `priority-v2` | 52.9 [49.7, 56.2] |
| Flights lost: caught with `fifo`, missed with `priority-v2` | 9.1 [8.2, 10.2] |
| **Net flights saved** | **43.8 [41.1, 46.7]** |
| Days with a net gain / with a net loss | 100.0% / 0.0% |
| At-risk passengers reaching the gate in time (245.2 per day classified URGENT on arrival under `fifo`) | 61.0% with `fifo`, 81.1% with `priority-v2` |
| Change in mean time from arrival to screening (min) | 0.01 [0.00, 0.01] |
| Change in mean time standing in a queue (min) | -1.12 [-1.20, -1.05] |

| `priority-v3` compared with `fifo` | Mean per day [95% CI] |
|---|---:|
| Flights saved: missed with `fifo`, caught with `priority-v3` | 52.8 [49.8, 55.9] |
| Flights lost: caught with `fifo`, missed with `priority-v3` | 9.1 [8.2, 10.1] |
| **Net flights saved** | **43.7 [41.1, 46.5]** |
| Days with a net gain / with a net loss | 100.0% / 0.0% |
| At-risk passengers reaching the gate in time (245.2 per day classified URGENT on arrival under `fifo`) | 61.0% with `fifo`, 81.0% with `priority-v3` |
| Change in mean time from arrival to screening (min) | 0.01 [0.00, 0.01] |
| Change in mean time standing in a queue (min) | -1.12 [-1.20, -1.05] |

| `priority-v2` compared with `virtual-fifo` | Mean per day [95% CI] |
|---|---:|
| Flights saved: missed with `virtual-fifo`, caught with `priority-v2` | 52.7 [49.6, 55.8] |
| Flights lost: caught with `virtual-fifo`, missed with `priority-v2` | 7.8 [6.9, 8.8] |
| **Net flights saved** | **44.9 [42.1, 47.6]** |
| Days with a net gain / with a net loss | 100.0% / 0.0% |
| At-risk passengers reaching the gate in time (314.1 per day classified URGENT on arrival under `virtual-fifo`) | 69.1% with `virtual-fifo`, 84.8% with `priority-v2` |
| Change in mean time from arrival to screening (min) | 0.00 [0.00, 0.00] |
| Change in mean time standing in a queue (min) | 0.02 [0.02, 0.02] |

| `priority-v2` compared with `fifo-manual` | Mean per day [95% CI] |
|---|---:|
| Flights saved: missed with `fifo-manual`, caught with `priority-v2` | 22.7 [21.0, 24.4] |
| Flights lost: caught with `fifo-manual`, missed with `priority-v2` | 13.9 [12.6, 15.3] |
| **Net flights saved** | **8.8 [7.4, 10.3]** |
| Days with a net gain / with a net loss | 79.0% / 16.5% |
| At-risk passengers reaching the gate in time (244.8 per day classified URGENT on arrival under `fifo-manual`) | 74.9% with `fifo-manual`, 81.1% with `priority-v2` |
| Change in mean time from arrival to screening (min) | 0.01 [0.00, 0.01] |
| Change in mean time standing in a queue (min) | -1.12 [-1.20, -1.04] |

| `priority-v3` compared with `virtual-fifo` | Mean per day [95% CI] |
|---|---:|
| Flights saved: missed with `virtual-fifo`, caught with `priority-v3` | 52.6 [49.6, 55.6] |
| Flights lost: caught with `virtual-fifo`, missed with `priority-v3` | 7.8 [6.9, 8.8] |
| **Net flights saved** | **44.8 [42.1, 47.6]** |
| Days with a net gain / with a net loss | 100.0% / 0.0% |
| At-risk passengers reaching the gate in time (314.1 per day classified URGENT on arrival under `virtual-fifo`) | 69.1% with `virtual-fifo`, 84.7% with `priority-v3` |
| Change in mean time from arrival to screening (min) | 0.00 [-0.01, 0.00] |
| Change in mean time standing in a queue (min) | 0.02 [0.02, 0.02] |

| `priority-v3` compared with `fifo-manual` | Mean per day [95% CI] |
|---|---:|
| Flights saved: missed with `fifo-manual`, caught with `priority-v3` | 22.7 [21.1, 24.4] |
| Flights lost: caught with `fifo-manual`, missed with `priority-v3` | 14.0 [12.7, 15.4] |
| **Net flights saved** | **8.7 [7.2, 10.4]** |
| Days with a net gain / with a net loss | 79.5% / 17.0% |
| At-risk passengers reaching the gate in time (244.8 per day classified URGENT on arrival under `fifo-manual`) | 74.9% with `fifo-manual`, 80.9% with `priority-v3` |
| Change in mean time from arrival to screening (min) | 0.01 [0.00, 0.01] |
| Change in mean time standing in a queue (min) | -1.12 [-1.20, -1.05] |

| `priority-v3` compared with `priority-v2` | Mean per day [95% CI] |
|---|---:|
| Flights saved: missed with `priority-v2`, caught with `priority-v3` | 2.3 [1.9, 2.8] |
| Flights lost: caught with `priority-v2`, missed with `priority-v3` | 2.4 [1.9, 3.0] |
| **Net flights saved** | **-0.1 [-0.5, 0.3]** |
| Days with a net gain / with a net loss | 33.0% / 30.5% |
| At-risk passengers reaching the gate in time (314.1 per day classified URGENT on arrival under `priority-v2`) | 84.8% with `priority-v2`, 84.7% with `priority-v3` |
| Change in mean time from arrival to screening (min) | 0.00 [0.00, 0.00] |
| Change in mean time standing in a queue (min) | 0.00 [0.00, 0.00] |

## 2. Waiting times

*Time to screening*: minutes from arrival at the checkpoint (when the ticket is issued) to the start of screening. *Standing*: minutes spent standing in a queue: the whole wait in a physical queue; in a virtual queue only the wait at the lanes after validating the ticket. Each column is the mean over days of the daily statistic; "longest" is the longest single value over all simulated days.

| Policy | Time to screening: mean | P50 | P90 | P99 | Longest | Standing: mean | P90 | Longest |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| `fifo` | 2.0 | 0.6 | 7.0 | 12.5 | 38.7 | 2.0 | 7.0 | 38.7 |
| `fifo-manual` | 2.0 | 0.6 | 6.8 | 14.1 | 72.3 | 2.0 | 6.8 | 72.3 |
| `virtual-fifo` | 2.0 | 0.6 | 6.9 | 13.1 | 101.7 | 0.9 | 2.3 | 10.5 |
| `priority-v2` | 2.0 | 0.6 | 6.6 | 15.3 | 108.1 | 0.9 | 2.5 | 19.6 |
| `priority-v3` | 2.0 | 0.6 | 6.6 | 15.2 | 109.2 | 0.9 | 2.5 | 19.6 |

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

## 4. Cost for passengers not prioritised by `priority-v2` (compared with `fifo`)

Extra wait = time to screening with the candidate minus time to screening with the reference, for the same passenger.

| Metric | Value [95% CI] |
|---|---:|
| Passengers prioritised per day | 305.6 (P5-P95 224.7-389.3) (6.71% of tickets called) |
| Mean extra wait of non-prioritised passengers (min) | 0.24 [0.23, 0.26] |
| P90 extra wait of non-prioritised passengers (min) | 0.74 [0.68, 0.81] |
| Largest extra wait of any non-prioritised passenger, worst day (min) | 99.4 |
| Share of non-prioritised passengers delayed by more than 5 min | 1.01% |
| Most people who overtook one ticket, worst day (bound K = 30, passes in the window and at the lanes included) | 30 |
| Calls where the cap blocked a priority call, per day | 42.6 |
| Calls where the overtake guard took precedence (a ticket had reached K overtakes), per day | 0.6 |
| People through the fast track per day | 304.9 |
| People passed at the lanes by fast-tracked parties per day | 1491.2 |

## 5. Cost for passengers not prioritised by `priority-v3` (compared with `fifo`)

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

## 6. Cost for passengers not prioritised by `priority-v2` (compared with `virtual-fifo`)

Extra wait = time to screening with the candidate minus time to screening with the reference, for the same passenger.

| Metric | Value [95% CI] |
|---|---:|
| Passengers prioritised per day | 305.6 (P5-P95 224.7-389.3) (6.71% of tickets called) |
| Mean extra wait of non-prioritised passengers (min) | 0.24 [0.23, 0.26] |
| P90 extra wait of non-prioritised passengers (min) | 0.75 [0.69, 0.82] |
| Largest extra wait of any non-prioritised passenger, worst day (min) | 23.5 |
| Share of non-prioritised passengers delayed by more than 5 min | 0.80% |
| Most people who overtook one ticket, worst day (bound K = 30, passes in the window and at the lanes included) | 30 |
| Calls where the cap blocked a priority call, per day | 42.6 |
| Calls where the overtake guard took precedence (a ticket had reached K overtakes), per day | 0.6 |
| People through the fast track per day | 304.9 |
| People passed at the lanes by fast-tracked parties per day | 1491.2 |

## 7. Cost for passengers not prioritised by `priority-v2` (compared with `fifo-manual`)

Extra wait = time to screening with the candidate minus time to screening with the reference, for the same passenger.

| Metric | Value [95% CI] |
|---|---:|
| Passengers prioritised per day | 305.6 (P5-P95 224.7-389.3) (6.71% of tickets called) |
| Mean extra wait of non-prioritised passengers (min) | 0.13 [0.12, 0.14] |
| P90 extra wait of non-prioritised passengers (min) | 0.39 [0.36, 0.42] |
| Largest extra wait of any non-prioritised passenger, worst day (min) | 98.9 |
| Share of non-prioritised passengers delayed by more than 5 min | 0.88% |
| Most people who overtook one ticket, worst day (bound K = 30, passes in the window and at the lanes included) | 30 |
| Calls where the cap blocked a priority call, per day | 42.6 |
| Calls where the overtake guard took precedence (a ticket had reached K overtakes), per day | 0.6 |
| People through the fast track per day | 304.9 |
| People passed at the lanes by fast-tracked parties per day | 1491.2 |

## 8. Cost for passengers not prioritised by `priority-v3` (compared with `virtual-fifo`)

Extra wait = time to screening with the candidate minus time to screening with the reference, for the same passenger.

| Metric | Value [95% CI] |
|---|---:|
| Passengers prioritised per day | 305.9 (P5-P95 217.9-391.1) (6.71% of tickets called) |
| Mean extra wait of non-prioritised passengers (min) | 0.24 [0.23, 0.26] |
| P90 extra wait of non-prioritised passengers (min) | 0.75 [0.68, 0.81] |
| Largest extra wait of any non-prioritised passenger, worst day (min) | 24.7 |
| Share of non-prioritised passengers delayed by more than 5 min | 0.81% |
| Most people who overtook one ticket, worst day (bound K = 30, passes in the window and at the lanes included) | 30 |
| Calls where the cap blocked a priority call, per day | 44.0 |
| Calls where the overtake guard took precedence (a ticket had reached K overtakes), per day | 0.6 |
| People through the fast track per day | 305.2 |
| People passed at the lanes by fast-tracked parties per day | 1489.4 |

## 9. Cost for passengers not prioritised by `priority-v3` (compared with `fifo-manual`)

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

## 10. Cost for passengers not prioritised by `priority-v3` (compared with `priority-v2`)

Extra wait = time to screening with the candidate minus time to screening with the reference, for the same passenger.

| Metric | Value [95% CI] |
|---|---:|
| Passengers prioritised per day | 305.9 (P5-P95 217.9-391.1) (6.71% of tickets called) |
| Mean extra wait of non-prioritised passengers (min) | 0.01 [0.00, 0.01] |
| P90 extra wait of non-prioritised passengers (min) | 0.00 [0.00, 0.00] |
| Largest extra wait of any non-prioritised passenger, worst day (min) | 22.9 |
| Share of non-prioritised passengers delayed by more than 5 min | 0.06% |
| Most people who overtook one ticket, worst day (bound K = 30, passes in the window and at the lanes included) | 30 |
| Calls where the cap blocked a priority call, per day | 44.0 |
| Calls where the overtake guard took precedence (a ticket had reached K overtakes), per day | 0.6 |
| People through the fast track per day | 305.2 |
| People passed at the lanes by fast-tracked parties per day | 1489.4 |

## 11. Call mechanics

Virtual queues only. A *second call* is made when the passenger has not presented within the call timeout; a *no-show* (missed call) is a ticket not validated after the second timeout. A no-show who rescans within the reactivation window is *reactivated*; later, the passenger needs a *new ticket*. *Idle lane time* counts open lanes with nobody to screen while passengers were waiting for or answering a call, as a share of the staffed lane time. Means per day.

| Policy | Calls | Second calls (share of calls) | No-shows (missed-call rate) | Reactivations | New tickets | Idle lane time (min, share) |
|---|---:|---:|---:|---:|---:|---:|
| `virtual-fifo` | 3378 | 31.7 (0.94%) | 11.9 (0.35%) | 11.3 | 0.6 | 0.8 (0.03%) |
| `priority-v2` | 3377 | 28.7 (0.85%) | 10.9 (0.32%) | 10.4 | 0.5 | 0.8 (0.03%) |
| `priority-v3` | 3377 | 28.8 (0.85%) | 10.9 (0.32%) | 10.4 | 0.5 | 0.8 (0.03%) |

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
| `virtual-fifo` | 23.1 of 1624 | 0.0 | not classified | - | - |
| `priority-v2` | 16.6 of 1624 | 28.3 | 2.69 | 50.5 | 20.2 |
| `priority-v3` | 16.6 of 1624 | 27.9 | 1.13 | 1.5 | 1.5 |

## 13. Groups, assisted passengers and late arrivals

Means per day. A group (two people or more) holds one ticket and counts as its people in every other table, in the priority cap and in the overtake bound. Assisted passengers are taken to the next free lane under every policy.

| Policy | Groups (people in groups) | Groups prioritised | Assisted passengers: people, mean time to screening (min), missed | Late on purpose: people, prioritised, missed |
|---|---:|---:|---:|---:|
| `fifo` | 738.4 (1821.4) | 0.0 | 30.8, 0.14, 0.3 | none in this scenario |
| `fifo-manual` | 738.4 (1821.4) | 43.6 | 30.8, 0.14, 0.3 | none in this scenario |
| `virtual-fifo` | 738.4 (1821.4) | 0.0 | 30.8, 0.14, 0.3 | none in this scenario |
| `priority-v2` | 738.4 (1821.4) | 52.6 | 30.8, 0.14, 0.3 | none in this scenario |
| `priority-v3` | 738.4 (1821.4) | 52.7 | 30.8, 0.14, 0.3 | none in this scenario |

## 14. Checkpoint operations

Means per day; "longest" is the largest value over all simulated days.

| Policy | Staffed lane-hours | Lane utilisation | Tickets waiting for a call: mean (longest) | People standing in a queue: mean (longest) | URGENT on arrival | CRITICAL on arrival |
|---|---:|---:|---:|---:|---:|---:|
| `fifo` | 49.0 | 76.1% | 8.3 (181) | 8.3 (181) | 245.2 | 35.7 |
| `fifo-manual` | 49.0 | 76.1% | 8.3 (185) | 8.3 (185) | 244.8 | 35.7 |
| `virtual-fifo` | 49.0 | 76.1% | 3.5 (172) | 3.7 (28) | 314.1 | 35.7 |
| `priority-v2` | 49.0 | 76.1% | 3.5 (172) | 3.8 (29) | 314.1 | 35.7 |
| `priority-v3` | 49.0 | 76.1% | 3.5 (173) | 3.8 (29) | 314.2 | 35.7 |

## 15. Method

- Each seed is one simulated day of the same design day (same flights), with different passengers.
- All policies are run on exactly the same passengers (common random numbers), so each comparison is paired passenger by passenger: a flight is *saved* when the passenger misses it with the reference and catches it with the candidate, and *lost* in the opposite case.
- `fifo-manual` (A') adds today's manual handling to the physical queue: staff periodically call the flights closing soon and their passengers are taken first. Comparing GateFlow with A' estimates the benefit over today's real practice.
- Passengers are counted as people: a party of three that misses its flight counts as three, in every table and comparison.
- The status quo is a physical FIFO queue. GateFlow policies run a virtual queue: tickets are called so as to keep the free lanes plus a call-ahead buffer supplied; each passenger presents after their own response time (later when they miss the call), validates the ticket at the access point and queues briefly at the lanes. Comparing `virtual-fifo` with the status quo isolates the cost or benefit of the call mechanics; comparing a priority policy with `virtual-fifo` isolates the prioritisation.
- A passenger misses the flight when they reach the gate after boarding closes (ground truth).
- Confidence intervals: percentile bootstrap of the mean over days (2000 resamples, seed 20261121). Quantiles: linear interpolation between order statistics (Hyndman-Fan type 7).
- Risk classes are computed on arrival with the same parameters for every policy. URGENT means "would miss the flight if served in FIFO order, but can still make it if selected now"; CRITICAL means "cannot make it even if selected now": such passengers are escalated to staff and never boosted automatically.

## 16. Policies

### Physical FIFO queue (status quo, policy A): `fifo` 1.1.0

Selection: `fifo`. Queue: `physical` (physical queue: passengers stand in line and step forward when a lane is free).

### Physical FIFO queue with staff calling closing flights (status quo with manual handling, policy A'): `fifo-manual` 0.1.0

Selection: `flight-call`. Queue: `physical` (physical queue: passengers stand in line and step forward when a lane is free).

| Parameter | Value |
|---|---|
| selection.callWindowMs | 20.0 min |
| selection.announcementIntervalMs | 5.0 min |

All parameter values are initial hypotheses to be calibrated and approved, not measured optima.

### GateFlow virtual queue in FIFO order: `virtual-fifo` 0.1.0

Selection: `fifo`. Queue: `virtual` (GateFlow virtual queue: passengers wait anywhere, are called on displays and validate their ticket at the access point).

| Parameter | Value |
|---|---|
| queue.callAheadSeconds | 180 s |
| queue.responseEstimateSeconds | 90 s |
| queue.prepareWindowSize | 10 |
| queue.callTimeoutMs | 3.0 min |
| queue.recallTimeoutMs | 2.0 min |
| queue.reactivationWindowMs | 15.0 min |
| queue.maxReactivations | 1 |
| queue.reactivationPosition | ORIGINAL |

All parameter values are initial hypotheses to be calibrated and approved, not measured optima.

### GateFlow virtual queue with constrained EDF priority v2 and fast track (policy B): `priority-v2` 0.1.0

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
| selection.maxDeadlineAgeMs | none |
| selection.hysteresisMs | 0.0 min |
| queue.callAheadSeconds | 180 s |
| queue.responseEstimateSeconds | 90 s |
| queue.prepareWindowSize | 10 |
| queue.callTimeoutMs | 3.0 min |
| queue.recallTimeoutMs | 2.0 min |
| queue.reactivationWindowMs | 15.0 min |
| queue.maxReactivations | 1 |
| queue.reactivationPosition | ORIGINAL |

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

## 17. Data sources and licences

Where the data of this scenario comes from, and the terms under which it may be used.

| Source | Kind | Provider | Licence or terms of use | Retrieved | Used for |
|---|---|---|---|---|---|
| Synthetic assumptions of this scenario (`gateflow-synthetic`) | SYNTHETIC | GateFlow | Created for GateFlow; contains no third-party data. | - | - |
| Synthetic flight list of the scenario library (`library-flights`) | SYNTHETIC | GateFlow (scenarios/flights/make-library-flights.mjs) | Created for GateFlow; contains no third-party schedule data. | - | flight list |

Design day: 58 departures from the flight list `flights/mx-like-transfer-hub.csv` (SHA-256 `04e56676d49984dd3b6941c187b1b7d27532823d697116a2343139927b6d2043`), source `library-flights`.

## 18. Assumptions

Every model parameter, with its source. SYNTHETIC values are illustrative assumptions.

| Parameter | Value | Source | Note |
|---|---|---|---|
| checkpoint.laneSchedule | from 00:00, lanes 1; from 05:00, lanes 2; from 06:00, lanes 4; from 07:00, lanes 3; from 08:00, lanes 2; from 09:00, lanes 4; from 10:00, lanes 3; from 11:00, lanes 2; from 12:00, lanes 4; from 13:00, lanes 2; from 14:00, lanes 1; from 15:00, lanes 4; from 16:00, lanes 2; from 18:00, lanes 4; from 19:00, lanes 3; from 20:00, lanes 2; from 21:00, lanes 4; from 22:00, lanes 1 | SYNTHETIC | Planned from the expected arrivals of the day: in every hour, enough lanes to screen the passengers arriving in it at 90% utilisation, at least 1 and at most 4 (the lanes the checkpoint has). 55.0 lane-hours. Assumed planning rule, not the airport's. |
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

## 19. Limitations of this model version

- Single checkpoint. Lanes follow a planned schedule, minus unplanned outages when the scenario has them: a lane going out of service finishes its passenger first, at least one lane always stays open, and the system knows at once. No lanes are opened in reaction to the queue.
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

## 20. Reproducibility

| Item | Value |
|---|---|
| Scenario hash | `sha256:45ab6a047491daf6300594c03bc0a48e6d12f4e302c7559816adddf280a7c9ed` |
| Seeds | 1-200 (200) |
| Source revision | `44eaeca5076ca2d3f342160edffdc650600a3e7a` |
| Versions | engine 0.5.0, queue core 0.5.0, model 0.5.0, kernel 0.1.0, population generator 0.5.0, scenario schema 5 |
| Generated by | gateflow-sim 0.7.0 |

Command:

```bash
gateflow-sim run --scenario scenarios/mx-like-transfer-hub.yaml --seeds 1-200 --policies fifo,fifo-manual,virtual-fifo,priority-v2,priority-v3 --baseline fifo --compare fifo-manual:fifo,virtual-fifo:fifo,priority-v2:fifo,priority-v3:fifo,priority-v2:virtual-fifo,priority-v2:fifo-manual,priority-v3:virtual-fifo,priority-v3:fifo-manual,priority-v3:priority-v2 --bootstrap-resamples 2000
```
