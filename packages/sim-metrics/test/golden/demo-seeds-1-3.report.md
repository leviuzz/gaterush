# GateFlow simulation report: Single departure checkpoint, synthetic day with a congested morning peak

> **SIMULATED RESULTS ON SYNTHETIC OR HYPOTHETICAL DATA. These numbers are model outputs, not measurements, and must not be presented as evidence of operational performance.**

Scenario `single-checkpoint-demo` (data: SYNTHETIC), 3 simulated days, about 6353 passengers per day (4803 parties). Status quo (baseline): `fifo`.

## 1. Headline

Means per simulated day. P5-P95 is the spread across days; brackets give the 95% confidence interval of the mean (bootstrap over days).

| Policy | Missed flights per day | of which connecting | Missed per 1,000 passengers |
|---|---:|---:|---:|
| Physical FIFO queue (status quo, policy A): `fifo` 1.1.0 | 71.7 (P5-P95 56.1-97.5) | 31.7 | 11.28 |
| Physical FIFO queue with staff calling closing flights (status quo with manual handling, policy A'): `fifo-manual` 0.1.0 | 15.0 (P5-P95 11.6-17.0) | 5.0 | 2.36 |
| GateFlow virtual queue in FIFO order: `virtual-fifo` 0.1.0 | 72.0 (P5-P95 61.0-90.7) | 31.3 | 11.33 |
| GateFlow virtual queue with constrained EDF priority v2 and fast track (policy B): `priority-v2` 0.1.0 | 13.0 (P5-P95 3.5-26.0) | 4.3 | 2.05 |
| GateFlow virtual queue with constrained EDF priority v3: fast track, stale-data rule and hysteresis (policy B): `priority-v3` 0.2.0 | 12.7 (P5-P95 3.5-25.1) | 4.3 | 1.99 |

| `fifo-manual` compared with `fifo` | Mean per day [95% CI] |
|---|---:|
| Flights saved: missed with `fifo`, caught with `fifo-manual` | 57.0 [41.3, 86.0] |
| Flights lost: caught with `fifo`, missed with `fifo-manual` | 0.3 [0.0, 0.7] |
| **Net flights saved** | **56.7 [39.0, 85.0]** |
| Days with a net gain / with a net loss | 100.0% / 0.0% |
| At-risk passengers reaching the gate in time (120.7 per day classified URGENT on arrival under `fifo`) | 42.5% with `fifo`, 89.5% with `fifo-manual` |
| Change in mean time from arrival to screening (min) | 0.00 [0.00, 0.00] |
| Change in mean time standing in a queue (min) | 0.00 [0.00, 0.00] |

| `virtual-fifo` compared with `fifo` | Mean per day [95% CI] |
|---|---:|
| Flights saved: missed with `fifo`, caught with `virtual-fifo` | 4.3 [0.0, 13.0] |
| Flights lost: caught with `fifo`, missed with `virtual-fifo` | 4.7 [4.0, 5.0] |
| **Net flights saved** | **-0.3 [-5.0, 8.0]** |
| Days with a net gain / with a net loss | 33.3% / 66.7% |
| At-risk passengers reaching the gate in time (120.7 per day classified URGENT on arrival under `fifo`) | 42.5% with `fifo`, 42.8% with `virtual-fifo` |
| Change in mean time from arrival to screening (min) | 0.01 [0.00, 0.01] |
| Change in mean time standing in a queue (min) | -2.83 [-3.51, -2.44] |

| `priority-v2` compared with `fifo` | Mean per day [95% CI] |
|---|---:|
| Flights saved: missed with `fifo`, caught with `priority-v2` | 60.0 [49.0, 69.7] |
| Flights lost: caught with `fifo`, missed with `priority-v2` | 1.3 [0.0, 4.0] |
| **Net flights saved** | **58.7 [49.0, 74.0]** |
| Days with a net gain / with a net loss | 100.0% / 0.0% |
| At-risk passengers reaching the gate in time (120.7 per day classified URGENT on arrival under `fifo`) | 42.5% with `fifo`, 91.7% with `priority-v2` |
| Change in mean time from arrival to screening (min) | 0.00 [0.00, 0.01] |
| Change in mean time standing in a queue (min) | -2.81 [-3.50, -2.42] |

| `priority-v3` compared with `fifo` | Mean per day [95% CI] |
|---|---:|
| Flights saved: missed with `fifo`, caught with `priority-v3` | 60.3 [49.0, 70.5] |
| Flights lost: caught with `fifo`, missed with `priority-v3` | 1.3 [0.0, 2.7] |
| **Net flights saved** | **59.0 [49.0, 75.0]** |
| Days with a net gain / with a net loss | 100.0% / 0.0% |
| At-risk passengers reaching the gate in time (120.7 per day classified URGENT on arrival under `fifo`) | 42.5% with `fifo`, 92.0% with `priority-v3` |
| Change in mean time from arrival to screening (min) | 0.00 [0.00, 0.01] |
| Change in mean time standing in a queue (min) | -2.81 [-3.50, -2.33] |

| `priority-v2` compared with `virtual-fifo` | Mean per day [95% CI] |
|---|---:|
| Flights saved: missed with `virtual-fifo`, caught with `priority-v2` | 59.7 [54.6, 68.0] |
| Flights lost: caught with `virtual-fifo`, missed with `priority-v2` | 0.7 [0.0, 2.0] |
| **Net flights saved** | **59.0 [53.0, 63.3]** |
| Days with a net gain / with a net loss | 100.0% / 0.0% |
| At-risk passengers reaching the gate in time (135.7 per day classified URGENT on arrival under `virtual-fifo`) | 48.9% with `virtual-fifo`, 92.1% with `priority-v2` |
| Change in mean time from arrival to screening (min) | -0.01 [-0.01, 0.00] |
| Change in mean time standing in a queue (min) | 0.01 [0.01, 0.02] |

| `priority-v2` compared with `fifo-manual` | Mean per day [95% CI] |
|---|---:|
| Flights saved: missed with `fifo-manual`, caught with `priority-v2` | 7.0 [3.0, 10.7] |
| Flights lost: caught with `fifo-manual`, missed with `priority-v2` | 5.0 [0.3, 9.8] |
| **Net flights saved** | **2.0 [-11.0, 14.0]** |
| Days with a net gain / with a net loss | 66.7% / 33.3% |
| At-risk passengers reaching the gate in time (120.7 per day classified URGENT on arrival under `fifo-manual`) | 89.5% with `fifo-manual`, 91.7% with `priority-v2` |
| Change in mean time from arrival to screening (min) | 0.00 [-0.01, 0.00] |
| Change in mean time standing in a queue (min) | -2.82 [-3.50, -2.33] |

| `priority-v3` compared with `virtual-fifo` | Mean per day [95% CI] |
|---|---:|
| Flights saved: missed with `virtual-fifo`, caught with `priority-v3` | 60.0 [53.0, 69.0] |
| Flights lost: caught with `virtual-fifo`, missed with `priority-v3` | 0.7 [0.0, 2.0] |
| **Net flights saved** | **59.3 [54.6, 67.0]** |
| Days with a net gain / with a net loss | 100.0% / 0.0% |
| At-risk passengers reaching the gate in time (135.7 per day classified URGENT on arrival under `virtual-fifo`) | 48.9% with `virtual-fifo`, 92.4% with `priority-v3` |
| Change in mean time from arrival to screening (min) | 0.00 [-0.01, 0.00] |
| Change in mean time standing in a queue (min) | 0.01 [0.01, 0.02] |

| `priority-v3` compared with `fifo-manual` | Mean per day [95% CI] |
|---|---:|
| Flights saved: missed with `fifo-manual`, caught with `priority-v3` | 7.0 [3.3, 10.7] |
| Flights lost: caught with `fifo-manual`, missed with `priority-v3` | 4.7 [0.0, 13.0] |
| **Net flights saved** | **2.3 [-5.8, 14.0]** |
| Days with a net gain / with a net loss | 66.7% / 33.3% |
| At-risk passengers reaching the gate in time (120.7 per day classified URGENT on arrival under `fifo-manual`) | 89.5% with `fifo-manual`, 92.0% with `priority-v3` |
| Change in mean time from arrival to screening (min) | 0.00 [-0.01, 0.01] |
| Change in mean time standing in a queue (min) | -2.82 [-3.21, -2.33] |

| `priority-v3` compared with `priority-v2` | Mean per day [95% CI] |
|---|---:|
| Flights saved: missed with `priority-v2`, caught with `priority-v3` | 0.3 [0.0, 0.7] |
| Flights lost: caught with `priority-v2`, missed with `priority-v3` | 0.0 [0.0, 0.0] |
| **Net flights saved** | **0.3 [0.0, 1.0]** |
| Days with a net gain / with a net loss | 33.3% / 0.0% |
| At-risk passengers reaching the gate in time (136.0 per day classified URGENT on arrival under `priority-v2`) | 92.4% with `priority-v2`, 92.7% with `priority-v3` |
| Change in mean time from arrival to screening (min) | 0.00 [0.00, 0.01] |
| Change in mean time standing in a queue (min) | 0.00 [0.00, 0.00] |

## 2. Waiting times

*Time to screening*: minutes from arrival at the checkpoint (when the ticket is issued) to the start of screening. *Standing*: minutes spent standing in a queue: the whole wait in a physical queue; in a virtual queue only the wait at the lanes after validating the ticket. Each column is the mean over days of the daily statistic; "longest" is the longest single value over all simulated days.

| Policy | Time to screening: mean | P50 | P90 | P99 | Longest | Standing: mean | P90 | Longest |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| `fifo` | 3.4 | 0.0 | 15.8 | 20.7 | 26.2 | 3.4 | 15.8 | 26.2 |
| `fifo-manual` | 3.5 | 0.0 | 15.0 | 23.1 | 32.2 | 3.5 | 15.0 | 32.2 |
| `virtual-fifo` | 3.5 | 0.0 | 15.8 | 21.1 | 79.7 | 0.6 | 1.9 | 4.1 |
| `priority-v2` | 3.4 | 0.0 | 15.7 | 23.5 | 82.8 | 0.6 | 2.1 | 4.1 |
| `priority-v3` | 3.5 | 0.0 | 15.6 | 23.6 | 83.3 | 0.6 | 2.1 | 4.1 |

## 3. Cost for passengers not prioritised by `fifo-manual` (compared with `fifo`)

Extra wait = time to screening with the candidate minus time to screening with the reference, for the same passenger.

| Metric | Value [95% CI] |
|---|---:|
| Passengers prioritised per day | 188.7 (P5-P95 162.9-220.5) (2.93% of tickets called) |
| Mean extra wait of non-prioritised passengers (min) | 0.19 [0.15, 0.27] |
| P90 extra wait of non-prioritised passengers (min) | 0.69 [0.57, 0.90] |
| Largest extra wait of any non-prioritised passenger, worst day (min) | 6.9 |
| Share of non-prioritised passengers delayed by more than 5 min | 0.14% |
| Most people who overtook one ticket, worst day (no bound for staff flight calls) | 59 |

## 4. Cost for passengers not prioritised by `priority-v2` (compared with `fifo`)

Extra wait = time to screening with the candidate minus time to screening with the reference, for the same passenger.

| Metric | Value [95% CI] |
|---|---:|
| Passengers prioritised per day | 144.0 (P5-P95 124.3-169.3) (2.17% of tickets called) |
| Mean extra wait of non-prioritised passengers (min) | 0.26 [0.20, 0.35] |
| P90 extra wait of non-prioritised passengers (min) | 0.95 [0.73, 1.39] |
| Largest extra wait of any non-prioritised passenger, worst day (min) | 62.8 |
| Share of non-prioritised passengers delayed by more than 5 min | 0.58% |
| Most people who overtook one ticket, worst day (bound K = 30, passes in the window and at the lanes included) | 30 |
| Calls where the cap blocked a priority call, per day | 9.3 |
| Calls where the overtake guard took precedence (a ticket had reached K overtakes), per day | 17.0 |
| People through the fast track per day | 143.7 |
| People passed at the lanes by fast-tracked parties per day | 960.7 |

## 5. Cost for passengers not prioritised by `priority-v3` (compared with `fifo`)

Extra wait = time to screening with the candidate minus time to screening with the reference, for the same passenger.

| Metric | Value [95% CI] |
|---|---:|
| Passengers prioritised per day | 145.3 (P5-P95 125.5-169.6) (2.19% of tickets called) |
| Mean extra wait of non-prioritised passengers (min) | 0.26 [0.20, 0.35] |
| P90 extra wait of non-prioritised passengers (min) | 0.96 [0.72, 1.18] |
| Largest extra wait of any non-prioritised passenger, worst day (min) | 63.3 |
| Share of non-prioritised passengers delayed by more than 5 min | 0.59% |
| Most people who overtook one ticket, worst day (bound K = 30, passes in the window and at the lanes included) | 30 |
| Calls where the cap blocked a priority call, per day | 10.7 |
| Calls where the overtake guard took precedence (a ticket had reached K overtakes), per day | 9.7 |
| People through the fast track per day | 145.0 |
| People passed at the lanes by fast-tracked parties per day | 973.0 |

## 6. Cost for passengers not prioritised by `priority-v2` (compared with `virtual-fifo`)

Extra wait = time to screening with the candidate minus time to screening with the reference, for the same passenger.

| Metric | Value [95% CI] |
|---|---:|
| Passengers prioritised per day | 144.0 (P5-P95 124.3-169.3) (2.17% of tickets called) |
| Mean extra wait of non-prioritised passengers (min) | 0.26 [0.19, 0.35] |
| P90 extra wait of non-prioritised passengers (min) | 1.14 [0.75, 1.80] |
| Largest extra wait of any non-prioritised passenger, worst day (min) | 4.8 |
| Share of non-prioritised passengers delayed by more than 5 min | 0.00% |
| Most people who overtook one ticket, worst day (bound K = 30, passes in the window and at the lanes included) | 30 |
| Calls where the cap blocked a priority call, per day | 9.3 |
| Calls where the overtake guard took precedence (a ticket had reached K overtakes), per day | 17.0 |
| People through the fast track per day | 143.7 |
| People passed at the lanes by fast-tracked parties per day | 960.7 |

## 7. Cost for passengers not prioritised by `priority-v2` (compared with `fifo-manual`)

Extra wait = time to screening with the candidate minus time to screening with the reference, for the same passenger.

| Metric | Value [95% CI] |
|---|---:|
| Passengers prioritised per day | 144.0 (P5-P95 124.3-169.3) (2.17% of tickets called) |
| Mean extra wait of non-prioritised passengers (min) | 0.10 [0.08, 0.11] |
| P90 extra wait of non-prioritised passengers (min) | 0.24 [0.11, 0.35] |
| Largest extra wait of any non-prioritised passenger, worst day (min) | 60.9 |
| Share of non-prioritised passengers delayed by more than 5 min | 0.66% |
| Most people who overtook one ticket, worst day (bound K = 30, passes in the window and at the lanes included) | 30 |
| Calls where the cap blocked a priority call, per day | 9.3 |
| Calls where the overtake guard took precedence (a ticket had reached K overtakes), per day | 17.0 |
| People through the fast track per day | 143.7 |
| People passed at the lanes by fast-tracked parties per day | 960.7 |

## 8. Cost for passengers not prioritised by `priority-v3` (compared with `virtual-fifo`)

Extra wait = time to screening with the candidate minus time to screening with the reference, for the same passenger.

| Metric | Value [95% CI] |
|---|---:|
| Passengers prioritised per day | 145.3 (P5-P95 125.5-169.6) (2.19% of tickets called) |
| Mean extra wait of non-prioritised passengers (min) | 0.26 [0.19, 0.35] |
| P90 extra wait of non-prioritised passengers (min) | 1.15 [0.75, 1.52] |
| Largest extra wait of any non-prioritised passenger, worst day (min) | 4.5 |
| Share of non-prioritised passengers delayed by more than 5 min | 0.00% |
| Most people who overtook one ticket, worst day (bound K = 30, passes in the window and at the lanes included) | 30 |
| Calls where the cap blocked a priority call, per day | 10.7 |
| Calls where the overtake guard took precedence (a ticket had reached K overtakes), per day | 9.7 |
| People through the fast track per day | 145.0 |
| People passed at the lanes by fast-tracked parties per day | 973.0 |

## 9. Cost for passengers not prioritised by `priority-v3` (compared with `fifo-manual`)

Extra wait = time to screening with the candidate minus time to screening with the reference, for the same passenger.

| Metric | Value [95% CI] |
|---|---:|
| Passengers prioritised per day | 145.3 (P5-P95 125.5-169.6) (2.19% of tickets called) |
| Mean extra wait of non-prioritised passengers (min) | 0.10 [0.08, 0.12] |
| P90 extra wait of non-prioritised passengers (min) | 0.23 [0.18, 0.29] |
| Largest extra wait of any non-prioritised passenger, worst day (min) | 61.4 |
| Share of non-prioritised passengers delayed by more than 5 min | 0.63% |
| Most people who overtook one ticket, worst day (bound K = 30, passes in the window and at the lanes included) | 30 |
| Calls where the cap blocked a priority call, per day | 10.7 |
| Calls where the overtake guard took precedence (a ticket had reached K overtakes), per day | 9.7 |
| People through the fast track per day | 145.0 |
| People passed at the lanes by fast-tracked parties per day | 973.0 |

## 10. Cost for passengers not prioritised by `priority-v3` (compared with `priority-v2`)

Extra wait = time to screening with the candidate minus time to screening with the reference, for the same passenger.

| Metric | Value [95% CI] |
|---|---:|
| Passengers prioritised per day | 145.3 (P5-P95 125.5-169.6) (2.19% of tickets called) |
| Mean extra wait of non-prioritised passengers (min) | 0.00 [0.00, 0.01] |
| P90 extra wait of non-prioritised passengers (min) | 0.00 [0.00, 0.00] |
| Largest extra wait of any non-prioritised passenger, worst day (min) | 1.5 |
| Share of non-prioritised passengers delayed by more than 5 min | 0.00% |
| Most people who overtook one ticket, worst day (bound K = 30, passes in the window and at the lanes included) | 30 |
| Calls where the cap blocked a priority call, per day | 10.7 |
| Calls where the overtake guard took precedence (a ticket had reached K overtakes), per day | 9.7 |
| People through the fast track per day | 145.0 |
| People passed at the lanes by fast-tracked parties per day | 973.0 |

## 11. Call mechanics

Virtual queues only. A *second call* is made when the passenger has not presented within the call timeout; a *no-show* (missed call) is a ticket not validated after the second timeout. A no-show who rescans within the reactivation window is *reactivated*; later, the passenger needs a *new ticket*. *Idle lane time* counts open lanes with nobody to screen while passengers were waiting for or answering a call, as a share of the staffed lane time. Means per day.

| Policy | Calls | Second calls (share of calls) | No-shows (missed-call rate) | Reactivations | New tickets | Idle lane time (min, share) |
|---|---:|---:|---:|---:|---:|---:|
| `virtual-fifo` | 4788 | 77.0 (1.61%) | 24.7 (0.51%) | 21.7 | 3.0 | 0.0 (0.00%) |
| `priority-v2` | 4787 | 73.7 (1.54%) | 23.7 (0.49%) | 21.0 | 2.7 | 0.0 (0.00%) |
| `priority-v3` | 4787 | 73.7 (1.54%) | 23.7 (0.49%) | 21.0 | 2.7 | 0.0 (0.00%) |

## 12. Disruptions, data quality and stability

No delays, gate changes, lane outages or feed outages in this scenario.

*Class changes* count the changes of risk class of waiting tickets under each policy's own classification. A *reversal* is a change in the direction opposite to the previous one, e.g. ATTENTION to URGENT and back: the flapping that hysteresis prevents. *Boosts on wrong information*: people prioritised while the system's knowledge of their flight differed from the truth (a delay or a gate change not yet known). Means per day.

| Policy | Missed among passengers of delayed or re-gated flights | Boosts on wrong information (people) | Class changes per 100 parties | Reversals | People whose class flapped |
|---|---:|---:|---:|---:|---:|
| `fifo` | - | 0.0 | not classified | - | - |
| `fifo-manual` | - | 0.0 | not classified | - | - |
| `virtual-fifo` | - | 0.0 | not classified | - | - |
| `priority-v2` | - | 0.0 | 5.74 | 231.0 | 41.0 |
| `priority-v3` | - | 0.0 | 0.78 | 0.0 | 0.0 |

## 13. Groups, assisted passengers and late arrivals

Means per day. A group (two people or more) holds one ticket and counts as its people in every other table, in the priority cap and in the overtake bound. Assisted passengers are taken to the next free lane under every policy.

| Policy | Groups (people in groups) | Groups prioritised | Assisted passengers: people, mean time to screening (min), missed | Late on purpose: people, prioritised, missed |
|---|---:|---:|---:|---:|
| `fifo` | 1055.0 (2605.7) | 0.0 | 52.7, 0.05, 0.0 | none in this scenario |
| `fifo-manual` | 1055.0 (2605.7) | 33.3 | 52.7, 0.05, 0.0 | none in this scenario |
| `virtual-fifo` | 1055.0 (2605.7) | 0.0 | 52.7, 0.06, 0.0 | none in this scenario |
| `priority-v2` | 1055.0 (2605.7) | 27.3 | 52.7, 0.05, 0.0 | none in this scenario |
| `priority-v3` | 1055.0 (2605.7) | 27.7 | 52.7, 0.06, 0.0 | none in this scenario |

## 14. Checkpoint operations

Means per day; "longest" is the largest value over all simulated days.

| Policy | Staffed lane-hours | Lane utilisation | Tickets waiting for a call: mean (longest) | People standing in a queue: mean (longest) | URGENT on arrival | CRITICAL on arrival |
|---|---:|---:|---:|---:|---:|---:|
| `fifo` | 112.4 | 62.7% | 19.5 (238) | 19.5 (238) | 120.7 | 1.3 |
| `fifo-manual` | 112.4 | 62.7% | 19.5 (242) | 19.5 (242) | 120.7 | 1.3 |
| `virtual-fifo` | 112.4 | 62.7% | 13.9 (212) | 3.5 (30) | 135.7 | 1.3 |
| `priority-v2` | 112.4 | 62.7% | 13.9 (210) | 3.6 (30) | 136.0 | 1.3 |
| `priority-v3` | 112.4 | 62.7% | 13.9 (209) | 3.6 (30) | 134.7 | 1.3 |

## 15. Method

- Each seed is one simulated day of the same design day (same flights), with different passengers.
- All policies are run on exactly the same passengers (common random numbers), so each comparison is paired passenger by passenger: a flight is *saved* when the passenger misses it with the reference and catches it with the candidate, and *lost* in the opposite case.
- `fifo-manual` (A') adds today's manual handling to the physical queue: staff periodically call the flights closing soon and their passengers are taken first. Comparing GateFlow with A' estimates the benefit over today's real practice.
- Passengers are counted as people: a party of three that misses its flight counts as three, in every table and comparison.
- The status quo is a physical FIFO queue. GateFlow policies run a virtual queue: tickets are called so as to keep the free lanes plus a call-ahead buffer supplied; each passenger presents after their own response time (later when they miss the call), validates the ticket at the access point and queues briefly at the lanes. Comparing `virtual-fifo` with the status quo isolates the cost or benefit of the call mechanics; comparing a priority policy with `virtual-fifo` isolates the prioritisation.
- A passenger misses the flight when they reach the gate after boarding closes (ground truth).
- Confidence intervals: percentile bootstrap of the mean over days (200 resamples, seed 20261121). Quantiles: linear interpolation between order statistics (Hyndman-Fan type 7).
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

Design day: 40 departures generated from the hourly profile of the scenario (`schedule.departuresPerHour`).

## 18. Assumptions

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
| passengers.strategicLateArrival | share 0, minMinutesBeforeStd 25, maxMinutesBeforeStd 35 | SYNTHETIC | Nobody arrives late on purpose in this scenario. |
| operations.boardingCloseMinutesBeforeStd | 20 | SYNTHETIC | Boarding closes 20 minutes before the scheduled departure, for every flight. |
| operations.deadlineKnowledge | RULE | SYNTHETIC | The system applies the closing rule to the schedule; without disruptions it matches the ground truth exactly. |
| disruptions.flightDelays | share 0, medianMinutes 20, sigma 0.8, maxMinutes 180, noticeMinMinutesBeforeStd 10, noticeMaxMinutesBeforeStd 120 | SYNTHETIC | No delays in this scenario (see single-checkpoint-disrupted). |
| disruptions.gateChanges | share 0, minMinutesBeforeStd 30, maxMinutesBeforeStd 70, noticeDelayMaxMinutes 5 | SYNTHETIC | No gate changes in this scenario. |
| disruptions.laneOutages | perDay 0, medianMinutes 20, sigma 0.5, maxMinutes 60 | SYNTHETIC | No unplanned lane outages in this scenario. |
| disruptions.feedOutages | perDay 0, medianMinutes 30, sigma 0.6, maxMinutes 120 | SYNTHETIC | The flight feed never goes down in this scenario. |

## 19. Limitations of this model version

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

## 20. Reproducibility

| Item | Value |
|---|---|
| Scenario hash | `sha256:25ef984b088cdc721b971fbab531aff7beddbd636f43a9dee5c00297a8fadceb` |
| Seeds | 1-3 (3) |
| Source revision | `test` |
| Versions | engine 0.5.0, queue core 0.9.0, model 0.6.0, kernel 0.1.0, population generator 0.6.0, scenario schema 5 |
| Generated by | test 0.0.0 |

Command:

```bash
gateflow-sim run --scenario scenarios/single-checkpoint-demo.yaml --seeds 1-3 --policies fifo,fifo-manual,virtual-fifo,priority-v2,priority-v3 --baseline fifo --compare fifo-manual:fifo,virtual-fifo:fifo,priority-v2:fifo,priority-v3:fifo,priority-v2:virtual-fifo,priority-v2:fifo-manual,priority-v3:virtual-fifo,priority-v3:fifo-manual,priority-v3:priority-v2 --bootstrap-resamples 200
```
