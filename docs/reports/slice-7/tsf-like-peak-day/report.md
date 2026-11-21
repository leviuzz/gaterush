# GateFlow simulation report: TSF-like low-cost base, summer peak day (synthetic)

> **SIMULATED RESULTS ON SYNTHETIC OR HYPOTHETICAL DATA. These numbers are model outputs, not measurements, and must not be presented as evidence of operational performance.**

Scenario `tsf-like-peak-day` (data: SYNTHETIC), 200 simulated days, about 5981 passengers per day (4108 parties). Status quo (baseline): `fifo`.

## 1. Headline

Means per simulated day. P5-P95 is the spread across days; brackets give the 95% confidence interval of the mean (bootstrap over days).

| Policy | Missed flights per day | of which connecting | Missed per 1,000 passengers |
|---|---:|---:|---:|
| Physical FIFO queue (status quo, policy A): `fifo` 1.1.0 | 25.8 (P5-P95 3.0-67.3) | 0.0 | 4.31 |
| Physical FIFO queue with staff calling closing flights (status quo with manual handling, policy A'): `fifo-manual` 0.1.0 | 0.0 (P5-P95 0.0-0.0) | 0.0 | 0.01 |
| GateFlow virtual queue in FIFO order: `virtual-fifo` 0.1.0 | 27.2 (P5-P95 3.0-71.2) | 0.0 | 4.55 |
| GateFlow virtual queue with constrained EDF priority v2 and fast track (policy B): `priority-v2` 0.1.0 | 2.2 (P5-P95 0.0-10.1) | 0.0 | 0.37 |
| GateFlow virtual queue with constrained EDF priority v3: fast track, stale-data rule and hysteresis (policy B): `priority-v3` 0.2.0 | 2.3 (P5-P95 0.0-11.0) | 0.0 | 0.38 |

| `fifo-manual` compared with `fifo` | Mean per day [95% CI] |
|---|---:|
| Flights saved: missed with `fifo`, caught with `fifo-manual` | 25.7 [22.8, 28.8] |
| Flights lost: caught with `fifo`, missed with `fifo-manual` | 0.0 [0.0, 0.0] |
| **Net flights saved** | **25.7 [22.9, 29.0]** |
| Days with a net gain / with a net loss | 96.0% / 0.0% |
| At-risk passengers reaching the gate in time (39.9 per day classified URGENT on arrival under `fifo`) | 43.1% with `fifo`, 99.9% with `fifo-manual` |
| Change in mean time from arrival to screening (min) | 0.00 [-0.01, 0.01] |
| Change in mean time standing in a queue (min) | 0.00 [0.00, 0.01] |

| `virtual-fifo` compared with `fifo` | Mean per day [95% CI] |
|---|---:|
| Flights saved: missed with `fifo`, caught with `virtual-fifo` | 1.7 [1.4, 1.9] |
| Flights lost: caught with `fifo`, missed with `virtual-fifo` | 3.1 [2.8, 3.5] |
| **Net flights saved** | **-1.4 [-1.9, -1.1]** |
| Days with a net gain / with a net loss | 19.0% / 60.5% |
| At-risk passengers reaching the gate in time (39.9 per day classified URGENT on arrival under `fifo`) | 43.1% with `fifo`, 43.4% with `virtual-fifo` |
| Change in mean time from arrival to screening (min) | 0.01 [0.00, 0.01] |
| Change in mean time standing in a queue (min) | -2.77 [-2.88, -2.66] |

| `priority-v2` compared with `fifo` | Mean per day [95% CI] |
|---|---:|
| Flights saved: missed with `fifo`, caught with `priority-v2` | 24.7 [21.9, 27.5] |
| Flights lost: caught with `fifo`, missed with `priority-v2` | 1.2 [0.9, 1.4] |
| **Net flights saved** | **23.6 [21.1, 26.1]** |
| Days with a net gain / with a net loss | 95.0% / 1.0% |
| At-risk passengers reaching the gate in time (39.9 per day classified URGENT on arrival under `fifo`) | 43.1% with `fifo`, 97.9% with `priority-v2` |
| Change in mean time from arrival to screening (min) | 0.00 [0.00, 0.01] |
| Change in mean time standing in a queue (min) | -2.77 [-2.88, -2.66] |

| `priority-v3` compared with `fifo` | Mean per day [95% CI] |
|---|---:|
| Flights saved: missed with `fifo`, caught with `priority-v3` | 24.7 [22.1, 27.4] |
| Flights lost: caught with `fifo`, missed with `priority-v3` | 1.2 [0.9, 1.4] |
| **Net flights saved** | **23.5 [21.0, 26.2]** |
| Days with a net gain / with a net loss | 95.0% / 1.0% |
| At-risk passengers reaching the gate in time (39.9 per day classified URGENT on arrival under `fifo`) | 43.1% with `fifo`, 97.8% with `priority-v3` |
| Change in mean time from arrival to screening (min) | 0.00 [0.00, 0.01] |
| Change in mean time standing in a queue (min) | -2.77 [-2.88, -2.66] |

| `priority-v2` compared with `virtual-fifo` | Mean per day [95% CI] |
|---|---:|
| Flights saved: missed with `virtual-fifo`, caught with `priority-v2` | 25.3 [22.7, 28.0] |
| Flights lost: caught with `virtual-fifo`, missed with `priority-v2` | 0.3 [0.2, 0.5] |
| **Net flights saved** | **25.0 [22.4, 27.5]** |
| Days with a net gain / with a net loss | 96.5% / 0.0% |
| At-risk passengers reaching the gate in time (39.2 per day classified URGENT on arrival under `virtual-fifo`) | 42.8% with `virtual-fifo`, 97.9% with `priority-v2` |
| Change in mean time from arrival to screening (min) | 0.00 [-0.01, 0.00] |
| Change in mean time standing in a queue (min) | 0.00 [0.00, 0.01] |

| `priority-v2` compared with `fifo-manual` | Mean per day [95% CI] |
|---|---:|
| Flights saved: missed with `fifo-manual`, caught with `priority-v2` | 0.0 [0.0, 0.0] |
| Flights lost: caught with `fifo-manual`, missed with `priority-v2` | 2.2 [1.5, 2.9] |
| **Net flights saved** | **-2.2 [-3.0, -1.5]** |
| Days with a net gain / with a net loss | 0.0% / 51.0% |
| At-risk passengers reaching the gate in time (39.7 per day classified URGENT on arrival under `fifo-manual`) | 99.9% with `fifo-manual`, 97.9% with `priority-v2` |
| Change in mean time from arrival to screening (min) | 0.00 [0.00, 0.01] |
| Change in mean time standing in a queue (min) | -2.77 [-2.88, -2.65] |

| `priority-v3` compared with `virtual-fifo` | Mean per day [95% CI] |
|---|---:|
| Flights saved: missed with `virtual-fifo`, caught with `priority-v3` | 25.3 [22.8, 28.0] |
| Flights lost: caught with `virtual-fifo`, missed with `priority-v3` | 0.4 [0.2, 0.6] |
| **Net flights saved** | **24.9 [22.4, 27.5]** |
| Days with a net gain / with a net loss | 96.5% / 0.0% |
| At-risk passengers reaching the gate in time (39.2 per day classified URGENT on arrival under `virtual-fifo`) | 42.8% with `virtual-fifo`, 97.7% with `priority-v3` |
| Change in mean time from arrival to screening (min) | 0.00 [-0.01, 0.00] |
| Change in mean time standing in a queue (min) | 0.00 [0.00, 0.01] |

| `priority-v3` compared with `fifo-manual` | Mean per day [95% CI] |
|---|---:|
| Flights saved: missed with `fifo-manual`, caught with `priority-v3` | 0.0 [0.0, 0.0] |
| Flights lost: caught with `fifo-manual`, missed with `priority-v3` | 2.3 [1.5, 3.1] |
| **Net flights saved** | **-2.3 [-3.1, -1.6]** |
| Days with a net gain / with a net loss | 0.0% / 49.0% |
| At-risk passengers reaching the gate in time (39.7 per day classified URGENT on arrival under `fifo-manual`) | 99.9% with `fifo-manual`, 97.8% with `priority-v3` |
| Change in mean time from arrival to screening (min) | 0.00 [0.00, 0.01] |
| Change in mean time standing in a queue (min) | -2.77 [-2.88, -2.66] |

| `priority-v3` compared with `priority-v2` | Mean per day [95% CI] |
|---|---:|
| Flights saved: missed with `priority-v2`, caught with `priority-v3` | 0.2 [0.1, 0.3] |
| Flights lost: caught with `priority-v2`, missed with `priority-v3` | 0.3 [0.1, 0.5] |
| **Net flights saved** | **-0.1 [-0.2, 0.1]** |
| Days with a net gain / with a net loss | 9.0% / 8.5% |
| At-risk passengers reaching the gate in time (39.0 per day classified URGENT on arrival under `priority-v2`) | 97.9% with `priority-v2`, 97.8% with `priority-v3` |
| Change in mean time from arrival to screening (min) | 0.00 [0.00, 0.00] |
| Change in mean time standing in a queue (min) | 0.00 [0.00, 0.00] |

## 2. Waiting times

*Time to screening*: minutes from arrival at the checkpoint (when the ticket is issued) to the start of screening. *Standing*: minutes spent standing in a queue: the whole wait in a physical queue; in a virtual queue only the wait at the lanes after validating the ticket. Each column is the mean over days of the daily statistic; "longest" is the longest single value over all simulated days.

| Policy | Time to screening: mean | P50 | P90 | P99 | Longest | Standing: mean | P90 | Longest |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| `fifo` | 3.5 | 0.3 | 15.4 | 24.7 | 41.5 | 3.5 | 15.4 | 41.5 |
| `fifo-manual` | 3.5 | 0.3 | 14.9 | 26.9 | 56.2 | 3.5 | 14.9 | 56.2 |
| `virtual-fifo` | 3.5 | 0.3 | 15.2 | 24.9 | 118.3 | 0.7 | 2.0 | 7.0 |
| `priority-v2` | 3.5 | 0.3 | 15.0 | 27.2 | 118.3 | 0.7 | 2.0 | 8.7 |
| `priority-v3` | 3.5 | 0.3 | 15.0 | 27.3 | 118.2 | 0.7 | 2.0 | 7.9 |

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

## 4. Cost for passengers not prioritised by `priority-v2` (compared with `fifo`)

Extra wait = time to screening with the candidate minus time to screening with the reference, for the same passenger.

| Metric | Value [95% CI] |
|---|---:|
| Passengers prioritised per day | 64.8 (P5-P95 12.0-136.0) (1.07% of tickets called) |
| Mean extra wait of non-prioritised passengers (min) | 0.16 [0.14, 0.17] |
| P90 extra wait of non-prioritised passengers (min) | 0.36 [0.31, 0.41] |
| Largest extra wait of any non-prioritised passenger, worst day (min) | 104.6 |
| Share of non-prioritised passengers delayed by more than 5 min | 0.83% |
| Most people who overtook one ticket, worst day (bound K = 30, passes in the window and at the lanes included) | 30 |
| Calls where the cap blocked a priority call, per day | 11.9 |
| Calls where the overtake guard took precedence (a ticket had reached K overtakes), per day | 3.4 |
| People through the fast track per day | 64.5 |
| People passed at the lanes by fast-tracked parties per day | 356.2 |

## 5. Cost for passengers not prioritised by `priority-v3` (compared with `fifo`)

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

## 6. Cost for passengers not prioritised by `priority-v2` (compared with `virtual-fifo`)

Extra wait = time to screening with the candidate minus time to screening with the reference, for the same passenger.

| Metric | Value [95% CI] |
|---|---:|
| Passengers prioritised per day | 64.8 (P5-P95 12.0-136.0) (1.07% of tickets called) |
| Mean extra wait of non-prioritised passengers (min) | 0.16 [0.14, 0.17] |
| P90 extra wait of non-prioritised passengers (min) | 0.36 [0.31, 0.42] |
| Largest extra wait of any non-prioritised passenger, worst day (min) | 21.0 |
| Share of non-prioritised passengers delayed by more than 5 min | 0.51% |
| Most people who overtook one ticket, worst day (bound K = 30, passes in the window and at the lanes included) | 30 |
| Calls where the cap blocked a priority call, per day | 11.9 |
| Calls where the overtake guard took precedence (a ticket had reached K overtakes), per day | 3.4 |
| People through the fast track per day | 64.5 |
| People passed at the lanes by fast-tracked parties per day | 356.2 |

## 7. Cost for passengers not prioritised by `priority-v2` (compared with `fifo-manual`)

Extra wait = time to screening with the candidate minus time to screening with the reference, for the same passenger.

| Metric | Value [95% CI] |
|---|---:|
| Passengers prioritised per day | 64.8 (P5-P95 12.0-136.0) (1.07% of tickets called) |
| Mean extra wait of non-prioritised passengers (min) | 0.05 [0.04, 0.05] |
| P90 extra wait of non-prioritised passengers (min) | 0.09 [0.07, 0.10] |
| Largest extra wait of any non-prioritised passenger, worst day (min) | 104.4 |
| Share of non-prioritised passengers delayed by more than 5 min | 0.74% |
| Most people who overtook one ticket, worst day (bound K = 30, passes in the window and at the lanes included) | 30 |
| Calls where the cap blocked a priority call, per day | 11.9 |
| Calls where the overtake guard took precedence (a ticket had reached K overtakes), per day | 3.4 |
| People through the fast track per day | 64.5 |
| People passed at the lanes by fast-tracked parties per day | 356.2 |

## 8. Cost for passengers not prioritised by `priority-v3` (compared with `virtual-fifo`)

Extra wait = time to screening with the candidate minus time to screening with the reference, for the same passenger.

| Metric | Value [95% CI] |
|---|---:|
| Passengers prioritised per day | 65.8 (P5-P95 12.9-136.1) (1.08% of tickets called) |
| Mean extra wait of non-prioritised passengers (min) | 0.16 [0.14, 0.17] |
| P90 extra wait of non-prioritised passengers (min) | 0.37 [0.31, 0.42] |
| Largest extra wait of any non-prioritised passenger, worst day (min) | 20.5 |
| Share of non-prioritised passengers delayed by more than 5 min | 0.52% |
| Most people who overtook one ticket, worst day (bound K = 30, passes in the window and at the lanes included) | 30 |
| Calls where the cap blocked a priority call, per day | 13.0 |
| Calls where the overtake guard took precedence (a ticket had reached K overtakes), per day | 4.3 |
| People through the fast track per day | 65.6 |
| People passed at the lanes by fast-tracked parties per day | 359.3 |

## 9. Cost for passengers not prioritised by `priority-v3` (compared with `fifo-manual`)

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

## 10. Cost for passengers not prioritised by `priority-v3` (compared with `priority-v2`)

Extra wait = time to screening with the candidate minus time to screening with the reference, for the same passenger.

| Metric | Value [95% CI] |
|---|---:|
| Passengers prioritised per day | 65.8 (P5-P95 12.9-136.1) (1.08% of tickets called) |
| Mean extra wait of non-prioritised passengers (min) | 0.00 [0.00, 0.01] |
| P90 extra wait of non-prioritised passengers (min) | 0.02 [0.01, 0.03] |
| Largest extra wait of any non-prioritised passenger, worst day (min) | 34.7 |
| Share of non-prioritised passengers delayed by more than 5 min | 0.01% |
| Most people who overtook one ticket, worst day (bound K = 30, passes in the window and at the lanes included) | 30 |
| Calls where the cap blocked a priority call, per day | 13.0 |
| Calls where the overtake guard took precedence (a ticket had reached K overtakes), per day | 4.3 |
| People through the fast track per day | 65.6 |
| People passed at the lanes by fast-tracked parties per day | 359.3 |

## 11. Call mechanics

Virtual queues only. A *second call* is made when the passenger has not presented within the call timeout; a *no-show* (missed call) is a ticket not validated after the second timeout. A no-show who rescans within the reactivation window is *reactivated*; later, the passenger needs a *new ticket*. *Idle lane time* counts open lanes with nobody to screen while passengers were waiting for or answering a call, as a share of the staffed lane time. Means per day.

| Policy | Calls | Second calls (share of calls) | No-shows (missed-call rate) | Reactivations | New tickets | Idle lane time (min, share) |
|---|---:|---:|---:|---:|---:|---:|
| `virtual-fifo` | 4099 | 56.3 (1.37%) | 19.5 (0.48%) | 18.7 | 0.9 | 0.3 (0.01%) |
| `priority-v2` | 4098 | 54.9 (1.34%) | 19.1 (0.46%) | 18.2 | 0.8 | 0.2 (0.01%) |
| `priority-v3` | 4098 | 54.9 (1.34%) | 19.1 (0.46%) | 18.2 | 0.8 | 0.2 (0.01%) |

## 12. Disruptions, data quality and stability

No delays, gate changes, lane outages or feed outages in this scenario.

*Class changes* count the changes of risk class of waiting tickets under each policy's own classification. A *reversal* is a change in the direction opposite to the previous one, e.g. ATTENTION to URGENT and back: the flapping that hysteresis prevents. *Boosts on wrong information*: people prioritised while the system's knowledge of their flight differed from the truth (a delay or a gate change not yet known). Means per day.

| Policy | Missed among passengers of delayed or re-gated flights | Boosts on wrong information (people) | Class changes per 100 parties | Reversals | People whose class flapped |
|---|---:|---:|---:|---:|---:|
| `fifo` | - | 0.0 | not classified | - | - |
| `fifo-manual` | - | 0.0 | not classified | - | - |
| `virtual-fifo` | - | 0.0 | not classified | - | - |
| `priority-v2` | - | 0.0 | 5.16 | 165.9 | 37.0 |
| `priority-v3` | - | 0.0 | 0.96 | 0.1 | 0.1 |

## 13. Groups, assisted passengers and late arrivals

Means per day. A group (two people or more) holds one ticket and counts as its people in every other table, in the priority cap and in the overtake bound. Assisted passengers are taken to the next free lane under every policy.

| Policy | Groups (people in groups) | Groups prioritised | Assisted passengers: people, mean time to screening (min), missed | Late on purpose: people, prioritised, missed |
|---|---:|---:|---:|---:|
| `fifo` | 1225.7 (3098.5) | 0.0 | 41.3, 0.11, 0.0 | none in this scenario |
| `fifo-manual` | 1225.7 (3098.5) | 26.8 | 41.3, 0.11, 0.0 | none in this scenario |
| `virtual-fifo` | 1225.7 (3098.5) | 0.0 | 41.3, 0.11, 0.0 | none in this scenario |
| `priority-v2` | 1225.7 (3098.5) | 13.8 | 41.3, 0.11, 0.0 | none in this scenario |
| `priority-v3` | 1225.7 (3098.5) | 14.0 | 41.3, 0.11, 0.0 | none in this scenario |

## 14. Checkpoint operations

Means per day; "longest" is the largest value over all simulated days.

| Policy | Staffed lane-hours | Lane utilisation | Tickets waiting for a call: mean (longest) | People standing in a queue: mean (longest) | URGENT on arrival | CRITICAL on arrival |
|---|---:|---:|---:|---:|---:|---:|
| `fifo` | 62.8 | 79.4% | 19.5 (262) | 19.5 (262) | 39.9 | 0.0 |
| `fifo-manual` | 62.8 | 79.4% | 19.5 (258) | 19.5 (258) | 39.7 | 0.0 |
| `virtual-fifo` | 62.8 | 79.4% | 13.7 (230) | 3.9 (34) | 39.2 | 0.0 |
| `priority-v2` | 62.8 | 79.4% | 13.7 (229) | 4.0 (34) | 39.0 | 0.0 |
| `priority-v3` | 62.8 | 79.4% | 13.7 (229) | 4.0 (34) | 38.9 | 0.0 |

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
| Treviso Canova traffic in 2025 (3.2 million passengers) (`save-traffic-2025`) | LITERATURE | SAVE S.p.A., annual figure as reported in the business plan and in the press | Published aggregate figure, cited with attribution. Used only to size the synthetic day. | 2026-11-21 | passengers.loadFactor |

- `save-traffic-2025`: 3,200,130 passengers in 2025 according to the business plan (marked verified there); press coverage of SAVE's results gives over 3.2 million. Not re-verified against SAVE's own publication, whose website refused automated access.

Design day: 34 departures from the flight list `flights/tsf-like-peak-day.csv` (SHA-256 `cb6cd9c8a623daec1e15158a0f3ac583c4ee2fd75ca0f775955fb82c1a5513a9`), source `library-flights`.

## 18. Assumptions

Every model parameter, with its source. SYNTHETIC values are illustrative assumptions.

| Parameter | Value | Source | Note |
|---|---|---|---|
| checkpoint.laneSchedule | from 00:00, lanes 1; from 03:00, lanes 2; from 04:00, lanes 5; from 06:00, lanes 3; from 07:00, lanes 4; from 08:00, lanes 5; from 09:00, lanes 4; from 13:00, lanes 5; from 15:00, lanes 4; from 16:00, lanes 3; from 17:00, lanes 2; from 19:00, lanes 1 | SYNTHETIC | Planned from the expected arrivals of the day: in every hour, enough lanes to screen the passengers arriving in it at 90% utilisation, at least 1 and at most 5 (the lanes the checkpoint has). 69.0 lane-hours. Assumed planning rule, not the airport's. |
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
| Scenario hash | `sha256:09872486b740f72818b48ec193e389c630ff09cc15dc9f2314dbd04f6d752930` |
| Seeds | 1-200 (200) |
| Source revision | `44eaeca5076ca2d3f342160edffdc650600a3e7a` |
| Versions | engine 0.5.0, queue core 0.5.0, model 0.5.0, kernel 0.1.0, population generator 0.5.0, scenario schema 5 |
| Generated by | gateflow-sim 0.7.0 |

Command:

```bash
gateflow-sim run --scenario scenarios/tsf-like-peak-day.yaml --seeds 1-200 --policies fifo,fifo-manual,virtual-fifo,priority-v2,priority-v3 --baseline fifo --compare fifo-manual:fifo,virtual-fifo:fifo,priority-v2:fifo,priority-v3:fifo,priority-v2:virtual-fifo,priority-v2:fifo-manual,priority-v3:virtual-fifo,priority-v3:fifo-manual,priority-v3:priority-v2 --bootstrap-resamples 2000
```
