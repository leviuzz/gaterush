# GateFlow simulation report: Single departure checkpoint, synthetic day with a congested morning peak

> **SIMULATED RESULTS ON SYNTHETIC OR HYPOTHETICAL DATA. These numbers are model outputs, not measurements, and must not be presented as evidence of operational performance.**

Scenario `single-checkpoint-demo` (data: SYNTHETIC), 200 simulated days, about 4695 passengers per day. Status quo (baseline): `fifo`.

## 1. Headline

Means per simulated day. P5-P95 is the spread across days; brackets give the 95% confidence interval of the mean (bootstrap over days).

| Policy | Missed flights per day | of which connecting | Missed per 1,000 passengers |
|---|---:|---:|---:|
| Physical FIFO queue (status quo, policy A): `fifo` 1.1.0 | 55.1 (P5-P95 15.9-112.2) | 29.3 | 8.85 |
| Physical FIFO queue with staff calling closing flights (status quo with manual handling, policy A'): `fifo-manual` 0.1.0 | 14.7 (P5-P95 4.0-29.0) | 7.5 | 2.37 |
| GateFlow virtual queue in FIFO order: `virtual-fifo` 0.1.0 | 55.8 (P5-P95 16.0-111.0) | 29.2 | 8.96 |
| GateFlow virtual queue with constrained EDF priority v1 (policy B): `priority-v1` 0.1.0 | 18.0 (P5-P95 6.0-35.0) | 10.5 | 2.90 |
| GateFlow virtual queue with constrained EDF priority v2 and fast track (policy B): `priority-v2` 0.1.0 | 11.5 (P5-P95 2.0-30.1) | 6.1 | 1.85 |

| `fifo-manual` compared with `fifo` | Mean per day [95% CI] |
|---|---:|
| Flights saved: missed with `fifo`, caught with `fifo-manual` | 40.6 [37.2, 44.0] |
| Flights lost: caught with `fifo`, missed with `fifo-manual` | 0.3 [0.2, 0.4] |
| **Net flights saved** | **40.3 [36.9, 43.9]** |
| Days with a net gain / with a net loss | 100.0% / 0.0% |
| At-risk passengers reaching the gate in time (95.7 per day classified URGENT on arrival under `fifo`) | 46.0% with `fifo`, 88.0% with `fifo-manual` |
| Change in mean time from arrival to screening (min) | 0.00 [0.00, 0.00] |
| Change in mean time standing in a queue (min) | 0.00 [0.00, 0.00] |

| `virtual-fifo` compared with `fifo` | Mean per day [95% CI] |
|---|---:|
| Flights saved: missed with `fifo`, caught with `virtual-fifo` | 2.9 [2.6, 3.3] |
| Flights lost: caught with `fifo`, missed with `virtual-fifo` | 3.6 [3.3, 4.0] |
| **Net flights saved** | **-0.7 [-1.1, -0.2]** |
| Days with a net gain / with a net loss | 34.5% / 51.0% |
| At-risk passengers reaching the gate in time (95.7 per day classified URGENT on arrival under `fifo`) | 46.0% with `fifo`, 46.6% with `virtual-fifo` |
| Change in mean time from arrival to screening (min) | 0.00 [0.00, 0.00] |
| Change in mean time standing in a queue (min) | -2.50 [-2.61, -2.38] |

| `priority-v1` compared with `fifo` | Mean per day [95% CI] |
|---|---:|
| Flights saved: missed with `fifo`, caught with `priority-v1` | 39.3 [36.1, 42.9] |
| Flights lost: caught with `fifo`, missed with `priority-v1` | 2.3 [2.0, 2.6] |
| **Net flights saved** | **37.1 [33.9, 40.2]** |
| Days with a net gain / with a net loss | 98.0% / 1.5% |
| At-risk passengers reaching the gate in time (95.7 per day classified URGENT on arrival under `fifo`) | 46.0% with `fifo`, 86.3% with `priority-v1` |
| Change in mean time from arrival to screening (min) | 0.00 [0.00, 0.00] |
| Change in mean time standing in a queue (min) | -2.49 [-2.61, -2.38] |

| `priority-v2` compared with `fifo` | Mean per day [95% CI] |
|---|---:|
| Flights saved: missed with `fifo`, caught with `priority-v2` | 45.3 [41.8, 48.9] |
| Flights lost: caught with `fifo`, missed with `priority-v2` | 1.8 [1.5, 2.0] |
| **Net flights saved** | **43.6 [40.2, 47.0]** |
| Days with a net gain / with a net loss | 100.0% / 0.0% |
| At-risk passengers reaching the gate in time (95.7 per day classified URGENT on arrival under `fifo`) | 46.0% with `fifo`, 92.7% with `priority-v2` |
| Change in mean time from arrival to screening (min) | 0.00 [0.00, 0.00] |
| Change in mean time standing in a queue (min) | -2.48 [-2.59, -2.37] |

| `priority-v1` compared with `virtual-fifo` | Mean per day [95% CI] |
|---|---:|
| Flights saved: missed with `virtual-fifo`, caught with `priority-v1` | 38.7 [35.4, 41.9] |
| Flights lost: caught with `virtual-fifo`, missed with `priority-v1` | 1.0 [0.8, 1.2] |
| **Net flights saved** | **37.7 [34.8, 40.8]** |
| Days with a net gain / with a net loss | 99.0% / 0.5% |
| At-risk passengers reaching the gate in time (101.3 per day classified URGENT on arrival under `virtual-fifo`) | 55.4% with `virtual-fifo`, 92.9% with `priority-v1` |
| Change in mean time from arrival to screening (min) | 0.00 [0.00, 0.00] |
| Change in mean time standing in a queue (min) | 0.00 [0.00, 0.00] |

| `priority-v1` compared with `fifo-manual` | Mean per day [95% CI] |
|---|---:|
| Flights saved: missed with `fifo-manual`, caught with `priority-v1` | 5.2 [4.7, 5.8] |
| Flights lost: caught with `fifo-manual`, missed with `priority-v1` | 8.5 [7.7, 9.3] |
| **Net flights saved** | **-3.3 [-4.1, -2.5]** |
| Days with a net gain / with a net loss | 23.0% / 69.5% |
| At-risk passengers reaching the gate in time (95.8 per day classified URGENT on arrival under `fifo-manual`) | 88.0% with `fifo-manual`, 86.4% with `priority-v1` |
| Change in mean time from arrival to screening (min) | 0.00 [0.00, 0.00] |
| Change in mean time standing in a queue (min) | -2.49 [-2.61, -2.38] |

| `priority-v2` compared with `virtual-fifo` | Mean per day [95% CI] |
|---|---:|
| Flights saved: missed with `virtual-fifo`, caught with `priority-v2` | 45.1 [41.5, 48.4] |
| Flights lost: caught with `virtual-fifo`, missed with `priority-v2` | 0.9 [0.7, 1.1] |
| **Net flights saved** | **44.2 [41.0, 47.4]** |
| Days with a net gain / with a net loss | 100.0% / 0.0% |
| At-risk passengers reaching the gate in time (101.3 per day classified URGENT on arrival under `virtual-fifo`) | 55.4% with `virtual-fifo`, 95.5% with `priority-v2` |
| Change in mean time from arrival to screening (min) | 0.00 [0.00, 0.00] |
| Change in mean time standing in a queue (min) | 0.01 [0.01, 0.01] |

| `priority-v2` compared with `fifo-manual` | Mean per day [95% CI] |
|---|---:|
| Flights saved: missed with `fifo-manual`, caught with `priority-v2` | 6.9 [6.2, 7.6] |
| Flights lost: caught with `fifo-manual`, missed with `priority-v2` | 3.7 [3.1, 4.3] |
| **Net flights saved** | **3.2 [2.5, 4.0]** |
| Days with a net gain / with a net loss | 73.5% / 21.0% |
| At-risk passengers reaching the gate in time (95.8 per day classified URGENT on arrival under `fifo-manual`) | 88.0% with `fifo-manual`, 92.7% with `priority-v2` |
| Change in mean time from arrival to screening (min) | 0.00 [0.00, 0.00] |
| Change in mean time standing in a queue (min) | -2.48 [-2.59, -2.37] |

| `priority-v2` compared with `priority-v1` | Mean per day [95% CI] |
|---|---:|
| Flights saved: missed with `priority-v1`, caught with `priority-v2` | 7.0 [6.5, 7.6] |
| Flights lost: caught with `priority-v1`, missed with `priority-v2` | 0.5 [0.4, 0.7] |
| **Net flights saved** | **6.5 [6.0, 7.1]** |
| Days with a net gain / with a net loss | 97.5% / 1.0% |
| At-risk passengers reaching the gate in time (101.2 per day classified URGENT on arrival under `priority-v1`) | 93.0% with `priority-v1`, 95.5% with `priority-v2` |
| Change in mean time from arrival to screening (min) | 0.00 [0.00, 0.00] |
| Change in mean time standing in a queue (min) | 0.01 [0.01, 0.01] |

## 2. Waiting times

*Time to screening*: minutes from arrival at the checkpoint (when the ticket is issued) to the start of screening. *Standing*: minutes spent standing in a queue: the whole wait in a physical queue; in a virtual queue only the wait at the lanes after validating the ticket. Each column is the mean over days of the daily statistic; "longest" is the longest single value over all simulated days.

| Policy | Time to screening: mean | P50 | P90 | P99 | Longest | Standing: mean | P90 | Longest |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| `fifo` | 3.1 | 0.0 | 14.4 | 19.1 | 31.0 | 3.1 | 14.4 | 31.0 |
| `fifo-manual` | 3.1 | 0.0 | 14.2 | 20.7 | 38.3 | 3.1 | 14.2 | 38.3 |
| `virtual-fifo` | 3.1 | 0.0 | 14.2 | 19.5 | 113.5 | 0.6 | 1.9 | 4.8 |
| `priority-v1` | 3.1 | 0.0 | 14.3 | 21.1 | 113.6 | 0.6 | 1.9 | 4.8 |
| `priority-v2` | 3.1 | 0.0 | 14.5 | 21.3 | 114.2 | 0.6 | 2.0 | 5.2 |

## 3. Cost for passengers not prioritised by `fifo-manual` (compared with `fifo`)

Extra wait = time to screening with the candidate minus time to screening with the reference, for the same passenger.

| Metric | Value [95% CI] |
|---|---:|
| Passengers prioritised per day | 144.4 (P5-P95 65.0-244.1) (2.33% of tickets called) |
| Mean extra wait of non-prioritised passengers (min) | 0.14 [0.13, 0.15] |
| P90 extra wait of non-prioritised passengers (min) | 0.47 [0.43, 0.51] |
| Largest extra wait of any non-prioritised passenger, worst day (min) | 10.7 |
| Share of non-prioritised passengers delayed by more than 5 min | 0.10% |
| Most people who overtook one ticket, worst day (no bound for staff flight calls) | 86 |

## 4. Cost for passengers not prioritised by `priority-v1` (compared with `fifo`)

Extra wait = time to screening with the candidate minus time to screening with the reference, for the same passenger.

| Metric | Value [95% CI] |
|---|---:|
| Passengers prioritised per day | 91.0 (P5-P95 26.0-164.1) (1.43% of tickets called) |
| Mean extra wait of non-prioritised passengers (min) | 0.15 [0.14, 0.16] |
| P90 extra wait of non-prioritised passengers (min) | 0.46 [0.40, 0.53] |
| Largest extra wait of any non-prioritised passenger, worst day (min) | 101.8 |
| Share of non-prioritised passengers delayed by more than 5 min | 0.53% |
| Most people who overtook one ticket, worst day (bound K = 30) | 30 |
| Calls where the cap blocked a priority call, per day | 4.8 |
| Calls where the overtake guard took precedence (a ticket had reached K overtakes), per day | 44.1 |

## 5. Cost for passengers not prioritised by `priority-v2` (compared with `fifo`)

Extra wait = time to screening with the candidate minus time to screening with the reference, for the same passenger.

| Metric | Value [95% CI] |
|---|---:|
| Passengers prioritised per day | 125.6 (P5-P95 64.0-197.2) (1.95% of tickets called) |
| Mean extra wait of non-prioritised passengers (min) | 0.20 [0.19, 0.22] |
| P90 extra wait of non-prioritised passengers (min) | 0.73 [0.65, 0.81] |
| Largest extra wait of any non-prioritised passenger, worst day (min) | 102.3 |
| Share of non-prioritised passengers delayed by more than 5 min | 0.55% |
| Most people who overtook one ticket, worst day (bound K = 30, passes in the window and at the lanes included) | 30 |
| Calls where the cap blocked a priority call, per day | 6.0 |
| Calls where the overtake guard took precedence (a ticket had reached K overtakes), per day | 11.6 |
| People through the fast track per day | 125.3 |
| People passed at the lanes by fast-tracked parties per day | 815.0 |

## 6. Cost for passengers not prioritised by `priority-v1` (compared with `virtual-fifo`)

Extra wait = time to screening with the candidate minus time to screening with the reference, for the same passenger.

| Metric | Value [95% CI] |
|---|---:|
| Passengers prioritised per day | 91.0 (P5-P95 26.0-164.1) (1.43% of tickets called) |
| Mean extra wait of non-prioritised passengers (min) | 0.15 [0.14, 0.16] |
| P90 extra wait of non-prioritised passengers (min) | 0.56 [0.49, 0.63] |
| Largest extra wait of any non-prioritised passenger, worst day (min) | 7.0 |
| Share of non-prioritised passengers delayed by more than 5 min | 0.00% |
| Most people who overtook one ticket, worst day (bound K = 30) | 30 |
| Calls where the cap blocked a priority call, per day | 4.8 |
| Calls where the overtake guard took precedence (a ticket had reached K overtakes), per day | 44.1 |

## 7. Cost for passengers not prioritised by `priority-v1` (compared with `fifo-manual`)

Extra wait = time to screening with the candidate minus time to screening with the reference, for the same passenger.

| Metric | Value [95% CI] |
|---|---:|
| Passengers prioritised per day | 91.0 (P5-P95 26.0-164.1) (1.43% of tickets called) |
| Mean extra wait of non-prioritised passengers (min) | 0.05 [0.04, 0.05] |
| P90 extra wait of non-prioritised passengers (min) | 0.07 [0.06, 0.08] |
| Largest extra wait of any non-prioritised passenger, worst day (min) | 100.9 |
| Share of non-prioritised passengers delayed by more than 5 min | 0.68% |
| Most people who overtook one ticket, worst day (bound K = 30) | 30 |
| Calls where the cap blocked a priority call, per day | 4.8 |
| Calls where the overtake guard took precedence (a ticket had reached K overtakes), per day | 44.1 |

## 8. Cost for passengers not prioritised by `priority-v2` (compared with `virtual-fifo`)

Extra wait = time to screening with the candidate minus time to screening with the reference, for the same passenger.

| Metric | Value [95% CI] |
|---|---:|
| Passengers prioritised per day | 125.6 (P5-P95 64.0-197.2) (1.95% of tickets called) |
| Mean extra wait of non-prioritised passengers (min) | 0.20 [0.19, 0.22] |
| P90 extra wait of non-prioritised passengers (min) | 0.88 [0.79, 0.97] |
| Largest extra wait of any non-prioritised passenger, worst day (min) | 10.6 |
| Share of non-prioritised passengers delayed by more than 5 min | 0.01% |
| Most people who overtook one ticket, worst day (bound K = 30, passes in the window and at the lanes included) | 30 |
| Calls where the cap blocked a priority call, per day | 6.0 |
| Calls where the overtake guard took precedence (a ticket had reached K overtakes), per day | 11.6 |
| People through the fast track per day | 125.3 |
| People passed at the lanes by fast-tracked parties per day | 815.0 |

## 9. Cost for passengers not prioritised by `priority-v2` (compared with `fifo-manual`)

Extra wait = time to screening with the candidate minus time to screening with the reference, for the same passenger.

| Metric | Value [95% CI] |
|---|---:|
| Passengers prioritised per day | 125.6 (P5-P95 64.0-197.2) (1.95% of tickets called) |
| Mean extra wait of non-prioritised passengers (min) | 0.08 [0.08, 0.09] |
| P90 extra wait of non-prioritised passengers (min) | 0.18 [0.16, 0.21] |
| Largest extra wait of any non-prioritised passenger, worst day (min) | 101.4 |
| Share of non-prioritised passengers delayed by more than 5 min | 0.62% |
| Most people who overtook one ticket, worst day (bound K = 30, passes in the window and at the lanes included) | 30 |
| Calls where the cap blocked a priority call, per day | 6.0 |
| Calls where the overtake guard took precedence (a ticket had reached K overtakes), per day | 11.6 |
| People through the fast track per day | 125.3 |
| People passed at the lanes by fast-tracked parties per day | 815.0 |

## 10. Cost for passengers not prioritised by `priority-v2` (compared with `priority-v1`)

Extra wait = time to screening with the candidate minus time to screening with the reference, for the same passenger.

| Metric | Value [95% CI] |
|---|---:|
| Passengers prioritised per day | 125.6 (P5-P95 64.0-197.2) (1.95% of tickets called) |
| Mean extra wait of non-prioritised passengers (min) | 0.05 [0.05, 0.06] |
| P90 extra wait of non-prioritised passengers (min) | 0.20 [0.18, 0.21] |
| Largest extra wait of any non-prioritised passenger, worst day (min) | 20.7 |
| Share of non-prioritised passengers delayed by more than 5 min | 0.01% |
| Most people who overtook one ticket, worst day (bound K = 30, passes in the window and at the lanes included) | 30 |
| Calls where the cap blocked a priority call, per day | 6.0 |
| Calls where the overtake guard took precedence (a ticket had reached K overtakes), per day | 11.6 |
| People through the fast track per day | 125.3 |
| People passed at the lanes by fast-tracked parties per day | 815.0 |

## 11. Call mechanics

Virtual queues only. A *second call* is made when the passenger has not presented within the call timeout; a *no-show* (missed call) is a ticket not validated after the second timeout. A no-show who rescans within the reactivation window is *reactivated*; later, the passenger needs a *new ticket*. *Idle lane time* counts open lanes with nobody to screen while passengers were waiting for or answering a call, as a share of the staffed lane time. Means per day.

| Policy | Calls | Second calls (share of calls) | No-shows (missed-call rate) | Reactivations | New tickets | Idle lane time (min, share) |
|---|---:|---:|---:|---:|---:|---:|
| `virtual-fifo` | 4686 | 67.4 (1.44%) | 24.0 (0.51%) | 22.9 | 1.0 | 0.0 (0.00%) |
| `priority-v1` | 4686 | 65.1 (1.39%) | 23.5 (0.50%) | 22.4 | 1.0 | 0.0 (0.00%) |
| `priority-v2` | 4685 | 63.8 (1.36%) | 22.8 (0.49%) | 21.9 | 1.0 | 0.0 (0.00%) |

## 12. Groups, assisted passengers and late arrivals

Means per day. A group (two people or more) holds one ticket and counts as its people in every other table, in the priority cap and in the overtake bound. Assisted passengers are taken to the next free lane under every policy.

| Policy | Groups (people in groups) | Groups prioritised | Assisted passengers: people, mean time to screening (min), missed | Late on purpose: people, prioritised, missed |
|---|---:|---:|---:|---:|
| `fifo` | 1027.2 (2539.0) | 0.0 | 43.3, 0.07, 0.0 | none in this scenario |
| `fifo-manual` | 1027.2 (2539.0) | 24.1 | 43.3, 0.07, 0.0 | none in this scenario |
| `virtual-fifo` | 1027.2 (2539.0) | 0.0 | 43.3, 0.07, 0.0 | none in this scenario |
| `priority-v1` | 1027.2 (2539.0) | 16.1 | 43.3, 0.07, 0.0 | none in this scenario |
| `priority-v2` | 1027.2 (2539.0) | 22.5 | 43.3, 0.07, 0.0 | none in this scenario |

## 13. Checkpoint operations

Means per day; "longest" is the largest value over all simulated days.

| Policy | Staffed lane-hours | Lane utilisation | Tickets waiting for a call: mean (longest) | People standing in a queue: mean (longest) | URGENT on arrival | CRITICAL on arrival |
|---|---:|---:|---:|---:|---:|---:|
| `fifo` | 112.3 | 61.4% | 17.0 (265) | 17.0 (265) | 95.7 | 2.9 |
| `fifo-manual` | 112.3 | 61.4% | 17.0 (271) | 17.0 (271) | 95.8 | 2.9 |
| `virtual-fifo` | 112.3 | 61.4% | 11.9 (242) | 3.2 (32) | 101.3 | 12.2 |
| `priority-v1` | 112.3 | 61.4% | 11.9 (242) | 3.2 (32) | 101.2 | 12.2 |
| `priority-v2` | 112.3 | 61.4% | 11.9 (244) | 3.2 (32) | 101.5 | 12.1 |

## 14. Method

- Each seed is one simulated day of the same design day (same flights), with different passengers.
- All policies are run on exactly the same passengers (common random numbers), so each comparison is paired passenger by passenger: a flight is *saved* when the passenger misses it with the reference and catches it with the candidate, and *lost* in the opposite case.
- `fifo-manual` (A') adds today's manual handling to the physical queue: staff periodically call the flights closing soon and their passengers are taken first. Comparing GateFlow with A' estimates the benefit over today's real practice.
- Passengers are counted as people: a party of three that misses its flight counts as three, in every table and comparison.
- The status quo is a physical FIFO queue. GateFlow policies run a virtual queue: tickets are called so as to keep the free lanes plus a call-ahead buffer supplied; each passenger presents after their own response time (later when they miss the call), validates the ticket at the access point and queues briefly at the lanes. Comparing `virtual-fifo` with the status quo isolates the cost or benefit of the call mechanics; comparing a priority policy with `virtual-fifo` isolates the prioritisation.
- A passenger misses the flight when they reach the gate after boarding closes (ground truth).
- Confidence intervals: percentile bootstrap of the mean over days (2000 resamples, seed 20261121). Quantiles: linear interpolation between order statistics (Hyndman-Fan type 7).
- Risk classes are computed on arrival with the same parameters for every policy. URGENT means "would miss the flight if served in FIFO order, but can still make it if selected now"; CRITICAL means "cannot make it even if selected now": such passengers are escalated to staff and never boosted automatically.

## 15. Policies

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

### GateFlow virtual queue with constrained EDF priority v1 (policy B): `priority-v1` 0.1.0

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
| selection.fastTrack | false |
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
| queue.callAheadSeconds | 180 s |
| queue.responseEstimateSeconds | 90 s |
| queue.prepareWindowSize | 10 |
| queue.callTimeoutMs | 3.0 min |
| queue.recallTimeoutMs | 2.0 min |
| queue.reactivationWindowMs | 15.0 min |
| queue.maxReactivations | 1 |
| queue.reactivationPosition | ORIGINAL |

All parameter values are initial hypotheses to be calibrated and approved, not measured optima.

## 16. Assumptions

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
| operations.deadlineKnowledge | RULE | SYNTHETIC | The system applies the closing rule to the schedule; in this slice it matches the ground truth exactly. |

## 17. Limitations of this model version

- Single checkpoint. Lanes follow a planned schedule: no unplanned outages and no lanes opened in reaction to the queue.
- Every passenger uses the virtual queue when one is simulated: no opt-outs, no passengers without a phone or a view of the displays.
- Response times and absences are drawn per party from assumed distributions. A second call does not make an absent passenger come sooner, the prepare window does not shorten response times, and a passenger who has been at the access point once answers later calls at once.
- The access point never becomes a bottleneck, and the walk from the access point to the lanes is part of the response time.
- Fast track (priority v2): a fast-tracked party is called next and, once its ticket is validated, goes ahead of the people waiting at the lanes who still have room under K. The fast-track entry never becomes a bottleneck of its own and needs no staff in the model.
- CRITICAL passengers are flagged for staff, but staff escorts are not modelled: such passengers wait in the queue order.
- The system's deadline equals the ground truth (boarding close from a fixed rule): no flight delays, gate changes or stale data.
- Passengers never abandon the queue, even after their flight has closed.
- A group stays together: one ticket, one call, one lane, screened one person after the other. Assisted passengers always get the next free lane and are not assessed by the engine.
- Baseline A' (`fifo-manual`) is an idealised staff practice: every five minutes staff call the flights closing within 20 minutes, and every passenger of those flights comes forward at once. Real practice is less systematic, so A' may overstate today's handling where it is informal, or understate it where staff watch individual passengers.
- Strategic late arrivals are a fixed share in a stress-test scenario, not a behavioural response to the policy.
- Tickets are issued on arrival with no kiosk or scanning delay.
- The engine estimates screening time as the mean screening time per person, walking time as the nominal time of the gate zone, and the time from call to screening as the larger of the response estimate and the call-ahead time (through the fast track: the response estimate, or the time since the passenger was last at the access point when shorter).

## 18. Reproducibility

| Item | Value |
|---|---|
| Scenario hash | `sha256:8746396b603a763c44c025b58f3233140cb0957d44b47b981529a4def32b44dd` |
| Seeds | 1-200 (200) |
| Source revision | `9f115ff09bd3bbc5eda81758bd36440f45d45a5f` |
| Versions | engine 0.4.0, queue core 0.3.0, model 0.4.0, kernel 0.1.0, population generator 0.3.0, scenario schema 3 |
| Generated by | gateflow-sim 0.4.0 |

Command:

```bash
gateflow-sim run --scenario scenarios/single-checkpoint-demo.yaml --seeds 1-200 --policies fifo,fifo-manual,virtual-fifo,priority-v1,priority-v2 --baseline fifo --compare fifo-manual:fifo,virtual-fifo:fifo,priority-v1:fifo,priority-v2:fifo,priority-v1:virtual-fifo,priority-v1:fifo-manual,priority-v2:virtual-fifo,priority-v2:fifo-manual,priority-v2:priority-v1 --bootstrap-resamples 2000
```
