# GateFlow simulation report: Single departure checkpoint, congested morning peak with strategic late arrivals

> **SIMULATED RESULTS ON SYNTHETIC OR HYPOTHETICAL DATA. These numbers are model outputs, not measurements, and must not be presented as evidence of operational performance.**

Scenario `single-checkpoint-strategic` (data: SYNTHETIC), 200 simulated days, about 4695 passengers per day. Status quo (baseline): `fifo`.

## 1. Headline

Means per simulated day. P5-P95 is the spread across days; brackets give the 95% confidence interval of the mean (bootstrap over days).

| Policy | Missed flights per day | of which connecting | Missed per 1,000 passengers |
|---|---:|---:|---:|
| Physical FIFO queue (status quo, policy A): `fifo` 1.1.0 | 204.5 (P5-P95 149.8-269.1) | 25.5 | 32.92 |
| Physical FIFO queue with staff calling closing flights (status quo with manual handling, policy A'): `fifo-manual` 0.1.0 | 132.0 (P5-P95 107.0-159.1) | 7.3 | 21.27 |
| GateFlow virtual queue in FIFO order: `virtual-fifo` 0.1.0 | 205.1 (P5-P95 148.0-267.0) | 25.5 | 33.02 |
| GateFlow virtual queue with constrained EDF priority v2 and fast track (policy B): `priority-v2` 0.1.0 | 141.6 (P5-P95 114.0-175.2) | 6.9 | 22.80 |
| GateFlow virtual queue with constrained EDF priority v3: fast track, stale-data rule and hysteresis (policy B): `priority-v3` 0.2.0 | 141.6 (P5-P95 114.0-177.1) | 6.8 | 22.80 |

| `fifo-manual` compared with `fifo` | Mean per day [95% CI] |
|---|---:|
| Flights saved: missed with `fifo`, caught with `fifo-manual` | 73.4 [69.8, 76.9] |
| Flights lost: caught with `fifo`, missed with `fifo-manual` | 0.9 [0.7, 1.2] |
| **Net flights saved** | **72.5 [68.9, 76.1]** |
| Days with a net gain / with a net loss | 100.0% / 0.0% |
| At-risk passengers reaching the gate in time (220.1 per day classified URGENT on arrival under `fifo`) | 56.9% with `fifo`, 87.7% with `fifo-manual` |
| Change in mean time from arrival to screening (min) | 0.00 [0.00, 0.00] |
| Change in mean time standing in a queue (min) | 0.00 [0.00, 0.00] |

| `virtual-fifo` compared with `fifo` | Mean per day [95% CI] |
|---|---:|
| Flights saved: missed with `fifo`, caught with `virtual-fifo` | 2.7 [2.4, 3.1] |
| Flights lost: caught with `fifo`, missed with `virtual-fifo` | 3.3 [3.0, 3.7] |
| **Net flights saved** | **-0.6 [-1.1, -0.2]** |
| Days with a net gain / with a net loss | 31.5% / 54.0% |
| At-risk passengers reaching the gate in time (220.1 per day classified URGENT on arrival under `fifo`) | 56.9% with `fifo`, 57.1% with `virtual-fifo` |
| Change in mean time from arrival to screening (min) | 0.00 [0.00, 0.00] |
| Change in mean time standing in a queue (min) | -2.21 [-2.32, -2.10] |

| `priority-v2` compared with `fifo` | Mean per day [95% CI] |
|---|---:|
| Flights saved: missed with `fifo`, caught with `priority-v2` | 64.9 [61.8, 67.9] |
| Flights lost: caught with `fifo`, missed with `priority-v2` | 2.0 [1.7, 2.3] |
| **Net flights saved** | **62.9 [60.0, 65.8]** |
| Days with a net gain / with a net loss | 100.0% / 0.0% |
| At-risk passengers reaching the gate in time (220.1 per day classified URGENT on arrival under `fifo`) | 56.9% with `fifo`, 86.1% with `priority-v2` |
| Change in mean time from arrival to screening (min) | 0.00 [0.00, 0.00] |
| Change in mean time standing in a queue (min) | -2.19 [-2.30, -2.08] |

| `priority-v3` compared with `fifo` | Mean per day [95% CI] |
|---|---:|
| Flights saved: missed with `fifo`, caught with `priority-v3` | 64.8 [61.9, 67.7] |
| Flights lost: caught with `fifo`, missed with `priority-v3` | 1.9 [1.7, 2.2] |
| **Net flights saved** | **62.9 [60.0, 65.8]** |
| Days with a net gain / with a net loss | 100.0% / 0.0% |
| At-risk passengers reaching the gate in time (220.1 per day classified URGENT on arrival under `fifo`) | 56.9% with `fifo`, 86.1% with `priority-v3` |
| Change in mean time from arrival to screening (min) | 0.00 [0.00, 0.00] |
| Change in mean time standing in a queue (min) | -2.19 [-2.30, -2.08] |

| `priority-v2` compared with `virtual-fifo` | Mean per day [95% CI] |
|---|---:|
| Flights saved: missed with `virtual-fifo`, caught with `priority-v2` | 64.6 [61.5, 67.5] |
| Flights lost: caught with `virtual-fifo`, missed with `priority-v2` | 1.1 [0.9, 1.3] |
| **Net flights saved** | **63.5 [60.7, 66.3]** |
| Days with a net gain / with a net loss | 100.0% / 0.0% |
| At-risk passengers reaching the gate in time (263.7 per day classified URGENT on arrival under `virtual-fifo`) | 64.1% with `virtual-fifo`, 88.3% with `priority-v2` |
| Change in mean time from arrival to screening (min) | 0.00 [0.00, 0.00] |
| Change in mean time standing in a queue (min) | 0.02 [0.02, 0.02] |

| `priority-v2` compared with `fifo-manual` | Mean per day [95% CI] |
|---|---:|
| Flights saved: missed with `fifo-manual`, caught with `priority-v2` | 5.5 [5.0, 6.1] |
| Flights lost: caught with `fifo-manual`, missed with `priority-v2` | 15.1 [13.7, 16.5] |
| **Net flights saved** | **-9.6 [-10.9, -8.2]** |
| Days with a net gain / with a net loss | 10.5% / 87.0% |
| At-risk passengers reaching the gate in time (220.0 per day classified URGENT on arrival under `fifo-manual`) | 87.7% with `fifo-manual`, 86.1% with `priority-v2` |
| Change in mean time from arrival to screening (min) | 0.00 [0.00, 0.00] |
| Change in mean time standing in a queue (min) | -2.19 [-2.30, -2.08] |

| `priority-v3` compared with `virtual-fifo` | Mean per day [95% CI] |
|---|---:|
| Flights saved: missed with `virtual-fifo`, caught with `priority-v3` | 64.6 [61.6, 67.6] |
| Flights lost: caught with `virtual-fifo`, missed with `priority-v3` | 1.1 [0.9, 1.3] |
| **Net flights saved** | **63.5 [60.8, 66.4]** |
| Days with a net gain / with a net loss | 100.0% / 0.0% |
| At-risk passengers reaching the gate in time (263.7 per day classified URGENT on arrival under `virtual-fifo`) | 64.1% with `virtual-fifo`, 88.3% with `priority-v3` |
| Change in mean time from arrival to screening (min) | 0.00 [0.00, 0.00] |
| Change in mean time standing in a queue (min) | 0.02 [0.02, 0.02] |

| `priority-v3` compared with `fifo-manual` | Mean per day [95% CI] |
|---|---:|
| Flights saved: missed with `fifo-manual`, caught with `priority-v3` | 5.5 [4.9, 6.1] |
| Flights lost: caught with `fifo-manual`, missed with `priority-v3` | 15.1 [13.7, 16.4] |
| **Net flights saved** | **-9.6 [-10.9, -8.4]** |
| Days with a net gain / with a net loss | 10.0% / 86.5% |
| At-risk passengers reaching the gate in time (220.0 per day classified URGENT on arrival under `fifo-manual`) | 87.7% with `fifo-manual`, 86.0% with `priority-v3` |
| Change in mean time from arrival to screening (min) | 0.00 [0.00, 0.00] |
| Change in mean time standing in a queue (min) | -2.19 [-2.31, -2.08] |

| `priority-v3` compared with `priority-v2` | Mean per day [95% CI] |
|---|---:|
| Flights saved: missed with `priority-v2`, caught with `priority-v3` | 1.4 [1.1, 1.7] |
| Flights lost: caught with `priority-v2`, missed with `priority-v3` | 1.4 [1.2, 1.7] |
| **Net flights saved** | **0.0 [-0.3, 0.3]** |
| Days with a net gain / with a net loss | 33.0% / 29.5% |
| At-risk passengers reaching the gate in time (263.6 per day classified URGENT on arrival under `priority-v2`) | 88.3% with `priority-v2`, 88.3% with `priority-v3` |
| Change in mean time from arrival to screening (min) | 0.00 [0.00, 0.00] |
| Change in mean time standing in a queue (min) | 0.00 [0.00, 0.00] |

## 2. Waiting times

*Time to screening*: minutes from arrival at the checkpoint (when the ticket is issued) to the start of screening. *Standing*: minutes spent standing in a queue: the whole wait in a physical queue; in a virtual queue only the wait at the lanes after validating the ticket. Each column is the mean over days of the daily statistic; "longest" is the longest single value over all simulated days.

| Policy | Time to screening: mean | P50 | P90 | P99 | Longest | Standing: mean | P90 | Longest |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| `fifo` | 2.8 | 0.0 | 13.0 | 17.7 | 29.9 | 2.8 | 13.0 | 29.9 |
| `fifo-manual` | 2.8 | 0.0 | 13.1 | 20.4 | 39.9 | 2.8 | 13.1 | 39.9 |
| `virtual-fifo` | 2.8 | 0.0 | 12.9 | 18.0 | 111.5 | 0.6 | 1.9 | 4.7 |
| `priority-v2` | 2.8 | 0.0 | 13.0 | 20.1 | 112.6 | 0.6 | 2.0 | 5.9 |
| `priority-v3` | 2.8 | 0.0 | 13.0 | 20.1 | 112.4 | 0.6 | 2.0 | 5.8 |

## 3. Cost for passengers not prioritised by `fifo-manual` (compared with `fifo`)

Extra wait = time to screening with the candidate minus time to screening with the reference, for the same passenger.

| Metric | Value [95% CI] |
|---|---:|
| Passengers prioritised per day | 266.7 (P5-P95 173.0-383.1) (4.32% of tickets called) |
| Mean extra wait of non-prioritised passengers (min) | 0.28 [0.26, 0.29] |
| P90 extra wait of non-prioritised passengers (min) | 1.17 [1.10, 1.25] |
| Largest extra wait of any non-prioritised passenger, worst day (min) | 14.1 |
| Share of non-prioritised passengers delayed by more than 5 min | 0.50% |
| Most people who overtook one ticket, worst day (no bound for staff flight calls) | 116 |

## 4. Cost for passengers not prioritised by `priority-v2` (compared with `fifo`)

Extra wait = time to screening with the candidate minus time to screening with the reference, for the same passenger.

| Metric | Value [95% CI] |
|---|---:|
| Passengers prioritised per day | 270.0 (P5-P95 209.9-338.0) (4.37% of tickets called) |
| Mean extra wait of non-prioritised passengers (min) | 0.22 [0.21, 0.24] |
| P90 extra wait of non-prioritised passengers (min) | 0.79 [0.72, 0.87] |
| Largest extra wait of any non-prioritised passenger, worst day (min) | 103.1 |
| Share of non-prioritised passengers delayed by more than 5 min | 0.55% |
| Most people who overtook one ticket, worst day (bound K = 30, passes in the window and at the lanes included) | 30 |
| Calls where the cap blocked a priority call, per day | 7.1 |
| Calls where the overtake guard took precedence (a ticket had reached K overtakes), per day | 10.0 |
| People through the fast track per day | 269.5 |
| People passed at the lanes by fast-tracked parties per day | 1162.8 |

## 5. Cost for passengers not prioritised by `priority-v3` (compared with `fifo`)

Extra wait = time to screening with the candidate minus time to screening with the reference, for the same passenger.

| Metric | Value [95% CI] |
|---|---:|
| Passengers prioritised per day | 270.9 (P5-P95 211.0-339.1) (4.38% of tickets called) |
| Mean extra wait of non-prioritised passengers (min) | 0.22 [0.21, 0.24] |
| P90 extra wait of non-prioritised passengers (min) | 0.79 [0.72, 0.87] |
| Largest extra wait of any non-prioritised passenger, worst day (min) | 103.0 |
| Share of non-prioritised passengers delayed by more than 5 min | 0.55% |
| Most people who overtook one ticket, worst day (bound K = 30, passes in the window and at the lanes included) | 30 |
| Calls where the cap blocked a priority call, per day | 7.4 |
| Calls where the overtake guard took precedence (a ticket had reached K overtakes), per day | 10.3 |
| People through the fast track per day | 270.4 |
| People passed at the lanes by fast-tracked parties per day | 1167.8 |

## 6. Cost for passengers not prioritised by `priority-v2` (compared with `virtual-fifo`)

Extra wait = time to screening with the candidate minus time to screening with the reference, for the same passenger.

| Metric | Value [95% CI] |
|---|---:|
| Passengers prioritised per day | 270.0 (P5-P95 209.9-338.0) (4.37% of tickets called) |
| Mean extra wait of non-prioritised passengers (min) | 0.23 [0.21, 0.24] |
| P90 extra wait of non-prioritised passengers (min) | 0.94 [0.86, 1.03] |
| Largest extra wait of any non-prioritised passenger, worst day (min) | 16.4 |
| Share of non-prioritised passengers delayed by more than 5 min | 0.01% |
| Most people who overtook one ticket, worst day (bound K = 30, passes in the window and at the lanes included) | 30 |
| Calls where the cap blocked a priority call, per day | 7.1 |
| Calls where the overtake guard took precedence (a ticket had reached K overtakes), per day | 10.0 |
| People through the fast track per day | 269.5 |
| People passed at the lanes by fast-tracked parties per day | 1162.8 |

## 7. Cost for passengers not prioritised by `priority-v2` (compared with `fifo-manual`)

Extra wait = time to screening with the candidate minus time to screening with the reference, for the same passenger.

| Metric | Value [95% CI] |
|---|---:|
| Passengers prioritised per day | 270.0 (P5-P95 209.9-338.0) (4.37% of tickets called) |
| Mean extra wait of non-prioritised passengers (min) | 0.05 [0.04, 0.05] |
| P90 extra wait of non-prioritised passengers (min) | 0.04 [0.03, 0.04] |
| Largest extra wait of any non-prioritised passenger, worst day (min) | 101.1 |
| Share of non-prioritised passengers delayed by more than 5 min | 1.13% |
| Most people who overtook one ticket, worst day (bound K = 30, passes in the window and at the lanes included) | 30 |
| Calls where the cap blocked a priority call, per day | 7.1 |
| Calls where the overtake guard took precedence (a ticket had reached K overtakes), per day | 10.0 |
| People through the fast track per day | 269.5 |
| People passed at the lanes by fast-tracked parties per day | 1162.8 |

## 8. Cost for passengers not prioritised by `priority-v3` (compared with `virtual-fifo`)

Extra wait = time to screening with the candidate minus time to screening with the reference, for the same passenger.

| Metric | Value [95% CI] |
|---|---:|
| Passengers prioritised per day | 270.9 (P5-P95 211.0-339.1) (4.38% of tickets called) |
| Mean extra wait of non-prioritised passengers (min) | 0.23 [0.21, 0.24] |
| P90 extra wait of non-prioritised passengers (min) | 0.95 [0.87, 1.03] |
| Largest extra wait of any non-prioritised passenger, worst day (min) | 16.4 |
| Share of non-prioritised passengers delayed by more than 5 min | 0.01% |
| Most people who overtook one ticket, worst day (bound K = 30, passes in the window and at the lanes included) | 30 |
| Calls where the cap blocked a priority call, per day | 7.4 |
| Calls where the overtake guard took precedence (a ticket had reached K overtakes), per day | 10.3 |
| People through the fast track per day | 270.4 |
| People passed at the lanes by fast-tracked parties per day | 1167.8 |

## 9. Cost for passengers not prioritised by `priority-v3` (compared with `fifo-manual`)

Extra wait = time to screening with the candidate minus time to screening with the reference, for the same passenger.

| Metric | Value [95% CI] |
|---|---:|
| Passengers prioritised per day | 270.9 (P5-P95 211.0-339.1) (4.38% of tickets called) |
| Mean extra wait of non-prioritised passengers (min) | 0.05 [0.04, 0.05] |
| P90 extra wait of non-prioritised passengers (min) | 0.04 [0.03, 0.04] |
| Largest extra wait of any non-prioritised passenger, worst day (min) | 100.9 |
| Share of non-prioritised passengers delayed by more than 5 min | 1.12% |
| Most people who overtook one ticket, worst day (bound K = 30, passes in the window and at the lanes included) | 30 |
| Calls where the cap blocked a priority call, per day | 7.4 |
| Calls where the overtake guard took precedence (a ticket had reached K overtakes), per day | 10.3 |
| People through the fast track per day | 270.4 |
| People passed at the lanes by fast-tracked parties per day | 1167.8 |

## 10. Cost for passengers not prioritised by `priority-v3` (compared with `priority-v2`)

Extra wait = time to screening with the candidate minus time to screening with the reference, for the same passenger.

| Metric | Value [95% CI] |
|---|---:|
| Passengers prioritised per day | 270.9 (P5-P95 211.0-339.1) (4.38% of tickets called) |
| Mean extra wait of non-prioritised passengers (min) | 0.00 [0.00, 0.01] |
| P90 extra wait of non-prioritised passengers (min) | 0.00 [0.00, 0.00] |
| Largest extra wait of any non-prioritised passenger, worst day (min) | 49.7 |
| Share of non-prioritised passengers delayed by more than 5 min | 0.02% |
| Most people who overtook one ticket, worst day (bound K = 30, passes in the window and at the lanes included) | 30 |
| Calls where the cap blocked a priority call, per day | 7.4 |
| Calls where the overtake guard took precedence (a ticket had reached K overtakes), per day | 10.3 |
| People through the fast track per day | 270.4 |
| People passed at the lanes by fast-tracked parties per day | 1167.8 |

## 11. Call mechanics

Virtual queues only. A *second call* is made when the passenger has not presented within the call timeout; a *no-show* (missed call) is a ticket not validated after the second timeout. A no-show who rescans within the reactivation window is *reactivated*; later, the passenger needs a *new ticket*. *Idle lane time* counts open lanes with nobody to screen while passengers were waiting for or answering a call, as a share of the staffed lane time. Means per day.

| Policy | Calls | Second calls (share of calls) | No-shows (missed-call rate) | Reactivations | New tickets | Idle lane time (min, share) |
|---|---:|---:|---:|---:|---:|---:|
| `virtual-fifo` | 4685 | 63.2 (1.35%) | 22.6 (0.48%) | 21.6 | 1.0 | 0.0 (0.00%) |
| `priority-v2` | 4683 | 59.0 (1.26%) | 21.1 (0.45%) | 20.2 | 0.9 | 0.0 (0.00%) |
| `priority-v3` | 4683 | 58.9 (1.26%) | 21.1 (0.45%) | 20.2 | 0.9 | 0.0 (0.00%) |

## 12. Disruptions, data quality and stability

No delays, gate changes, lane outages or feed outages in this scenario.

*Class changes* count the changes of risk class of waiting tickets under each policy's own classification. A *reversal* is a change in the direction opposite to the previous one, e.g. ATTENTION to URGENT and back: the flapping that hysteresis prevents. *Boosts on wrong information*: people prioritised while the system's knowledge of their flight differed from the truth (a delay or a gate change not yet known). Means per day.

| Policy | Missed among passengers of delayed or re-gated flights | Boosts on wrong information (people) | Class changes per 100 parties | Reversals | People whose class flapped |
|---|---:|---:|---:|---:|---:|
| `fifo` | - | 0.0 | not classified | - | - |
| `fifo-manual` | - | 0.0 | not classified | - | - |
| `virtual-fifo` | - | 0.0 | not classified | - | - |
| `priority-v2` | - | 0.0 | 3.73 | 138.7 | 31.2 |
| `priority-v3` | - | 0.0 | 0.67 | 0.0 | 0.0 |

## 13. Groups, assisted passengers and late arrivals

Means per day. A group (two people or more) holds one ticket and counts as its people in every other table, in the priority cap and in the overtake bound. Assisted passengers are taken to the next free lane under every policy.

| Policy | Groups (people in groups) | Groups prioritised | Assisted passengers: people, mean time to screening (min), missed | Late on purpose: people, prioritised, missed |
|---|---:|---:|---:|---:|
| `fifo` | 1027.2 (2539.0) | 0.0 | 43.3, 0.06, 0.9 | 296.1, 0.0, 160.1 |
| `fifo-manual` | 1027.2 (2539.0) | 44.3 | 43.3, 0.07, 0.9 | 296.1, 132.1, 118.1 |
| `virtual-fifo` | 1027.2 (2539.0) | 0.0 | 43.3, 0.07, 0.9 | 296.1, 0.0, 159.8 |
| `priority-v2` | 1027.2 (2539.0) | 45.0 | 43.3, 0.07, 0.9 | 296.1, 162.6, 128.9 |
| `priority-v3` | 1027.2 (2539.0) | 45.2 | 43.3, 0.07, 0.9 | 296.1, 162.6, 128.9 |

## 14. Checkpoint operations

Means per day; "longest" is the largest value over all simulated days.

| Policy | Staffed lane-hours | Lane utilisation | Tickets waiting for a call: mean (longest) | People standing in a queue: mean (longest) | URGENT on arrival | CRITICAL on arrival |
|---|---:|---:|---:|---:|---:|---:|
| `fifo` | 113.6 | 60.8% | 15.2 (261) | 15.2 (261) | 220.1 | 117.5 |
| `fifo-manual` | 113.6 | 60.8% | 15.2 (259) | 15.2 (259) | 220.0 | 117.5 |
| `virtual-fifo` | 113.6 | 60.8% | 10.3 (230) | 3.1 (32) | 263.7 | 117.5 |
| `priority-v2` | 113.6 | 60.8% | 10.3 (226) | 3.2 (33) | 263.6 | 117.5 |
| `priority-v3` | 113.6 | 60.8% | 10.3 (226) | 3.2 (33) | 263.6 | 117.5 |

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

## 17. Assumptions

Every model parameter, with its source. SYNTHETIC values are illustrative assumptions.

| Parameter | Value | Source | Note |
|---|---|---|---|
| checkpoint.laneSchedule | from 00:00, lanes 6 | SYNTHETIC | Six lanes open all day, as in slice S1, so that results remain comparable. |
| checkpoint.serviceTimeMeanSeconds | 40 | SYNTHETIC | About 90 passengers per hour per lane. |
| checkpoint.serviceTimeCv | 0.6 | SYNTHETIC |  |
| schedule.departuresPerHour | hour 6, departures 5; hour 7, departures 5; hour 8, departures 3; hour 9, departures 2; hour 10, departures 2; hour 11, departures 2; hour 12, departures 2; hour 13, departures 2; hour 14, departures 2; hour 15, departures 2; hour 16, departures 2; hour 17, departures 3; hour 18, departures 3; hour 19, departures 2; hour 20, departures 2; hour 21, departures 1 | SYNTHETIC | Design day with a morning bank of departures, typical of low-cost bases. |
| schedule.aircraftMix | category regional-jet, seats 100, share 0.15; category narrow-body, seats 180, share 0.6; category narrow-body-large, seats 220, share 0.2; category wide-body, seats 300, share 0.05 | SYNTHETIC |  |
| schedule.gateZones | id A, walkMinutes 4, share 0.4; id B, walkMinutes 8, share 0.4; id C, walkMinutes 14, share 0.2 | SYNTHETIC | Nominal walking time from the checkpoint exit to the gate zone. |
| passengers.loadFactor | min 0.6, mode 0.85, max 0.98 | SYNTHETIC | Triangular distribution, drawn per flight and replication. |
| passengers.transferShare | 0.05 | SYNTHETIC | Connecting passengers who cross this checkpoint. Not an official statistic. |
| passengers.showUp.departing | minMinutesBeforeStd 25, medianExtraMinutes 70, sigma 0.55, maxMinutesBeforeStd 240 | SYNTHETIC | Arrival at the checkpoint = STD minus (25 min + log-normal with median 70 min). |
| passengers.showUp.transfer | minMinutesBeforeStd 24, medianExtraMinutes 25, sigma 0.5, maxMinutesBeforeStd 180 | SYNTHETIC | Connecting passengers arrive later, after their inbound flight. |
| passengers.walkSpeedSigma | 0.2 | SYNTHETIC | Individual walking time = nominal zone time x log-normal(median 1, sigma). |
| passengers.callResponse | medianSeconds 75, sigma 0.5, absentProbability 0.04, absentExtraMedianMinutes 4, absentExtraSigma 0.8 | SYNTHETIC | Virtual queue only. Time from a call to presenting at the access point is log-normal with a median of 75 s (passengers wait near the checkpoint); 4% do not notice the first call and present later by a log-normal extra delay with a median of 4 minutes. Hypotheses to measure in a pilot. |
| passengers.groups | partySizes size 1, share 0.78; size 2, share 0.15; size 3, share 0.04; size 4, share 0.025; size 5, share 0.005 | SYNTHETIC | Shares over parties: about 40% of passengers travel with others. A party holds one ticket, is called together and is screened on one lane, one person after the other. |
| passengers.assistedShare | 0.007 | SYNTHETIC | Parties taking the assisted path (PRM and similar): staff take them to the next free lane, ahead of the queue, under every policy. The reason is never recorded. |
| passengers.strategicLateArrival | share 0.05, minMinutesBeforeStd 25, maxMinutesBeforeStd 35 | SYNTHETIC | Stress test, not an estimate: 5% of departing parties arrive late on purpose, uniformly between 35 and 25 minutes before departure. |
| operations.boardingCloseMinutesBeforeStd | 20 | SYNTHETIC | Boarding closes 20 minutes before the scheduled departure, for every flight. |
| operations.deadlineKnowledge | RULE | SYNTHETIC | The system applies the closing rule to the schedule; without disruptions it matches the ground truth exactly. |
| disruptions.flightDelays | share 0, medianMinutes 20, sigma 0.8, maxMinutes 180, noticeMinMinutesBeforeStd 10, noticeMaxMinutesBeforeStd 120 | SYNTHETIC | No delays in this scenario (see single-checkpoint-disrupted). |
| disruptions.gateChanges | share 0, minMinutesBeforeStd 30, maxMinutesBeforeStd 70, noticeDelayMaxMinutes 5 | SYNTHETIC | No gate changes in this scenario. |
| disruptions.laneOutages | perDay 0, medianMinutes 20, sigma 0.5, maxMinutes 60 | SYNTHETIC | No unplanned lane outages in this scenario. |
| disruptions.feedOutages | perDay 0, medianMinutes 30, sigma 0.6, maxMinutes 120 | SYNTHETIC | The flight feed never goes down in this scenario. |

## 18. Limitations of this model version

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

## 19. Reproducibility

| Item | Value |
|---|---|
| Scenario hash | `sha256:5adfce73e90293165e83d769543e9a35f576435a8ad526e6ea32ede9f3f8fe52` |
| Seeds | 1-200 (200) |
| Source revision | `7e26b4fbe3d2238c424e09223e602632aa6cc18d` |
| Versions | engine 0.5.0, queue core 0.5.0, model 0.5.0, kernel 0.1.0, population generator 0.4.0, scenario schema 4 |
| Generated by | gateflow-sim 0.6.0 |

Command:

```bash
gateflow-sim run --scenario scenarios/single-checkpoint-strategic.yaml --seeds 1-200 --policies fifo,fifo-manual,virtual-fifo,priority-v2,priority-v3 --baseline fifo --compare fifo-manual:fifo,virtual-fifo:fifo,priority-v2:fifo,priority-v3:fifo,priority-v2:virtual-fifo,priority-v2:fifo-manual,priority-v3:virtual-fifo,priority-v3:fifo-manual,priority-v3:priority-v2 --bootstrap-resamples 2000
```
