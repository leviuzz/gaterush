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
| GateFlow virtual queue with constrained EDF priority v1 (policy B): `priority-v1` 0.1.0 | 164.7 (P5-P95 136.0-200.0) | 10.4 | 26.53 |
| GateFlow virtual queue with constrained EDF priority v1 and the late-presentation rule: `priority-v1-strict` 0.1.0 | 181.6 (P5-P95 144.9-215.0) | 10.0 | 29.25 |

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

| `priority-v1` compared with `fifo` | Mean per day [95% CI] |
|---|---:|
| Flights saved: missed with `fifo`, caught with `priority-v1` | 41.9 [39.1, 44.9] |
| Flights lost: caught with `fifo`, missed with `priority-v1` | 2.1 [1.9, 2.4] |
| **Net flights saved** | **39.8 [36.9, 42.7]** |
| Days with a net gain / with a net loss | 99.5% / 0.5% |
| At-risk passengers reaching the gate in time (220.1 per day classified URGENT on arrival under `fifo`) | 56.9% with `fifo`, 75.6% with `priority-v1` |
| Change in mean time from arrival to screening (min) | 0.00 [0.00, 0.00] |
| Change in mean time standing in a queue (min) | -2.20 [-2.32, -2.09] |

| `priority-v1-strict` compared with `fifo` | Mean per day [95% CI] |
|---|---:|
| Flights saved: missed with `fifo`, caught with `priority-v1-strict` | 25.3 [22.7, 27.8] |
| Flights lost: caught with `fifo`, missed with `priority-v1-strict` | 2.4 [2.2, 2.7] |
| **Net flights saved** | **22.8 [20.4, 25.4]** |
| Days with a net gain / with a net loss | 96.5% / 2.0% |
| At-risk passengers reaching the gate in time (220.1 per day classified URGENT on arrival under `fifo`) | 56.9% with `fifo`, 67.8% with `priority-v1-strict` |
| Change in mean time from arrival to screening (min) | 0.00 [0.00, 0.00] |
| Change in mean time standing in a queue (min) | -2.20 [-2.31, -2.10] |

| `priority-v1` compared with `virtual-fifo` | Mean per day [95% CI] |
|---|---:|
| Flights saved: missed with `virtual-fifo`, caught with `priority-v1` | 41.2 [38.1, 44.1] |
| Flights lost: caught with `virtual-fifo`, missed with `priority-v1` | 0.8 [0.6, 1.0] |
| **Net flights saved** | **40.4 [37.5, 43.2]** |
| Days with a net gain / with a net loss | 99.5% / 0.0% |
| At-risk passengers reaching the gate in time (173.3 per day classified URGENT on arrival under `virtual-fifo`) | 70.1% with `virtual-fifo`, 93.4% with `priority-v1` |
| Change in mean time from arrival to screening (min) | 0.00 [0.00, 0.00] |
| Change in mean time standing in a queue (min) | 0.00 [0.00, 0.00] |

| `priority-v1` compared with `fifo-manual` | Mean per day [95% CI] |
|---|---:|
| Flights saved: missed with `fifo-manual`, caught with `priority-v1` | 4.7 [4.1, 5.2] |
| Flights lost: caught with `fifo-manual`, missed with `priority-v1` | 37.4 [35.9, 38.8] |
| **Net flights saved** | **-32.7 [-34.1, -31.3]** |
| Days with a net gain / with a net loss | 0.0% / 100.0% |
| At-risk passengers reaching the gate in time (220.0 per day classified URGENT on arrival under `fifo-manual`) | 87.7% with `fifo-manual`, 75.6% with `priority-v1` |
| Change in mean time from arrival to screening (min) | 0.00 [0.00, 0.00] |
| Change in mean time standing in a queue (min) | -2.20 [-2.32, -2.09] |

| `priority-v1-strict` compared with `virtual-fifo` | Mean per day [95% CI] |
|---|---:|
| Flights saved: missed with `virtual-fifo`, caught with `priority-v1-strict` | 24.5 [22.0, 27.2] |
| Flights lost: caught with `virtual-fifo`, missed with `priority-v1-strict` | 1.1 [0.9, 1.3] |
| **Net flights saved** | **23.4 [21.1, 26.1]** |
| Days with a net gain / with a net loss | 96.0% / 2.0% |
| At-risk passengers reaching the gate in time (173.3 per day classified URGENT on arrival under `virtual-fifo`) | 70.1% with `virtual-fifo`, 83.7% with `priority-v1-strict` |
| Change in mean time from arrival to screening (min) | 0.00 [0.00, 0.00] |
| Change in mean time standing in a queue (min) | 0.00 [0.00, 0.00] |

| `priority-v1-strict` compared with `fifo-manual` | Mean per day [95% CI] |
|---|---:|
| Flights saved: missed with `fifo-manual`, caught with `priority-v1-strict` | 4.9 [4.3, 5.5] |
| Flights lost: caught with `fifo-manual`, missed with `priority-v1-strict` | 54.5 [52.6, 56.5] |
| **Net flights saved** | **-49.6 [-51.3, -47.9]** |
| Days with a net gain / with a net loss | 0.0% / 100.0% |
| At-risk passengers reaching the gate in time (220.0 per day classified URGENT on arrival under `fifo-manual`) | 87.7% with `fifo-manual`, 67.8% with `priority-v1-strict` |
| Change in mean time from arrival to screening (min) | 0.00 [0.00, 0.00] |
| Change in mean time standing in a queue (min) | -2.20 [-2.31, -2.09] |

| `priority-v1-strict` compared with `priority-v1` | Mean per day [95% CI] |
|---|---:|
| Flights saved: missed with `priority-v1`, caught with `priority-v1-strict` | 1.8 [1.5, 2.2] |
| Flights lost: caught with `priority-v1`, missed with `priority-v1-strict` | 18.8 [17.8, 19.8] |
| **Net flights saved** | **-16.9 [-17.8, -16.0]** |
| Days with a net gain / with a net loss | 0.0% / 100.0% |
| At-risk passengers reaching the gate in time (173.3 per day classified URGENT on arrival under `priority-v1`) | 93.5% with `priority-v1`, 83.7% with `priority-v1-strict` |
| Change in mean time from arrival to screening (min) | 0.00 [0.00, 0.00] |
| Change in mean time standing in a queue (min) | 0.00 [0.00, 0.00] |

## 2. Waiting times

*Time to screening*: minutes from arrival at the checkpoint (when the ticket is issued) to the start of screening. *Standing*: minutes spent standing in a queue: the whole wait in a physical queue; in a virtual queue only the wait at the lanes after validating the ticket. Each column is the mean over days of the daily statistic; "longest" is the longest single value over all simulated days.

| Policy | Time to screening: mean | P50 | P90 | P99 | Longest | Standing: mean | P90 | Longest |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| `fifo` | 2.8 | 0.0 | 13.0 | 17.7 | 29.9 | 2.8 | 13.0 | 29.9 |
| `fifo-manual` | 2.8 | 0.0 | 13.1 | 20.4 | 39.9 | 2.8 | 13.1 | 39.9 |
| `virtual-fifo` | 2.8 | 0.0 | 12.9 | 18.0 | 111.5 | 0.6 | 1.9 | 4.7 |
| `priority-v1` | 2.8 | 0.0 | 12.7 | 19.6 | 111.5 | 0.6 | 1.9 | 4.7 |
| `priority-v1-strict` | 2.8 | 0.0 | 12.8 | 19.3 | 112.3 | 0.6 | 1.9 | 4.7 |

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

## 4. Cost for passengers not prioritised by `priority-v1` (compared with `fifo`)

Extra wait = time to screening with the candidate minus time to screening with the reference, for the same passenger.

| Metric | Value [95% CI] |
|---|---:|
| Passengers prioritised per day | 90.6 (P5-P95 29.9-155.2) (1.45% of tickets called) |
| Mean extra wait of non-prioritised passengers (min) | 0.13 [0.12, 0.15] |
| P90 extra wait of non-prioritised passengers (min) | 0.35 [0.30, 0.41] |
| Largest extra wait of any non-prioritised passenger, worst day (min) | 102.1 |
| Share of non-prioritised passengers delayed by more than 5 min | 0.49% |
| Most people who overtook one ticket, worst day (bound K = 30) | 30 |
| Calls where the cap blocked a priority call, per day | 4.4 |
| Calls where the overtake guard took precedence (a ticket had reached K overtakes), per day | 39.5 |

## 5. Cost for passengers not prioritised by `priority-v1-strict` (compared with `fifo`)

Extra wait = time to screening with the candidate minus time to screening with the reference, for the same passenger.

| Metric | Value [95% CI] |
|---|---:|
| Passengers prioritised per day | 63.0 (P5-P95 12.0-128.0) (0.99% of tickets called) |
| Mean extra wait of non-prioritised passengers (min) | 0.10 [0.09, 0.11] |
| P90 extra wait of non-prioritised passengers (min) | 0.25 [0.20, 0.30] |
| Largest extra wait of any non-prioritised passenger, worst day (min) | 102.9 |
| Share of non-prioritised passengers delayed by more than 5 min | 0.48% |
| Most people who overtook one ticket, worst day (bound K = 30) | 30 |
| Calls where the cap blocked a priority call, per day | 3.4 |
| Calls where the overtake guard took precedence (a ticket had reached K overtakes), per day | 26.4 |

## 6. Cost for passengers not prioritised by `priority-v1` (compared with `virtual-fifo`)

Extra wait = time to screening with the candidate minus time to screening with the reference, for the same passenger.

| Metric | Value [95% CI] |
|---|---:|
| Passengers prioritised per day | 90.6 (P5-P95 29.9-155.2) (1.45% of tickets called) |
| Mean extra wait of non-prioritised passengers (min) | 0.14 [0.12, 0.15] |
| P90 extra wait of non-prioritised passengers (min) | 0.44 [0.38, 0.50] |
| Largest extra wait of any non-prioritised passenger, worst day (min) | 16.3 |
| Share of non-prioritised passengers delayed by more than 5 min | 0.01% |
| Most people who overtook one ticket, worst day (bound K = 30) | 30 |
| Calls where the cap blocked a priority call, per day | 4.4 |
| Calls where the overtake guard took precedence (a ticket had reached K overtakes), per day | 39.5 |

## 7. Cost for passengers not prioritised by `priority-v1` (compared with `fifo-manual`)

Extra wait = time to screening with the candidate minus time to screening with the reference, for the same passenger.

| Metric | Value [95% CI] |
|---|---:|
| Passengers prioritised per day | 90.6 (P5-P95 29.9-155.2) (1.45% of tickets called) |
| Mean extra wait of non-prioritised passengers (min) | 0.02 [0.01, 0.02] |
| P90 extra wait of non-prioritised passengers (min) | 0.02 [0.01, 0.02] |
| Largest extra wait of any non-prioritised passenger, worst day (min) | 100.1 |
| Share of non-prioritised passengers delayed by more than 5 min | 1.41% |
| Most people who overtook one ticket, worst day (bound K = 30) | 30 |
| Calls where the cap blocked a priority call, per day | 4.4 |
| Calls where the overtake guard took precedence (a ticket had reached K overtakes), per day | 39.5 |

## 8. Cost for passengers not prioritised by `priority-v1-strict` (compared with `virtual-fifo`)

Extra wait = time to screening with the candidate minus time to screening with the reference, for the same passenger.

| Metric | Value [95% CI] |
|---|---:|
| Passengers prioritised per day | 63.0 (P5-P95 12.0-128.0) (0.99% of tickets called) |
| Mean extra wait of non-prioritised passengers (min) | 0.10 [0.09, 0.11] |
| P90 extra wait of non-prioritised passengers (min) | 0.31 [0.26, 0.36] |
| Largest extra wait of any non-prioritised passenger, worst day (min) | 8.9 |
| Share of non-prioritised passengers delayed by more than 5 min | 0.00% |
| Most people who overtook one ticket, worst day (bound K = 30) | 30 |
| Calls where the cap blocked a priority call, per day | 3.4 |
| Calls where the overtake guard took precedence (a ticket had reached K overtakes), per day | 26.4 |

## 9. Cost for passengers not prioritised by `priority-v1-strict` (compared with `fifo-manual`)

Extra wait = time to screening with the candidate minus time to screening with the reference, for the same passenger.

| Metric | Value [95% CI] |
|---|---:|
| Passengers prioritised per day | 63.0 (P5-P95 12.0-128.0) (0.99% of tickets called) |
| Mean extra wait of non-prioritised passengers (min) | 0.04 [0.03, 0.05] |
| P90 extra wait of non-prioritised passengers (min) | 0.01 [0.01, 0.02] |
| Largest extra wait of any non-prioritised passenger, worst day (min) | 100.9 |
| Share of non-prioritised passengers delayed by more than 5 min | 1.78% |
| Most people who overtook one ticket, worst day (bound K = 30) | 30 |
| Calls where the cap blocked a priority call, per day | 3.4 |
| Calls where the overtake guard took precedence (a ticket had reached K overtakes), per day | 26.4 |

## 10. Cost for passengers not prioritised by `priority-v1-strict` (compared with `priority-v1`)

Extra wait = time to screening with the candidate minus time to screening with the reference, for the same passenger.

| Metric | Value [95% CI] |
|---|---:|
| Passengers prioritised per day | 63.0 (P5-P95 12.0-128.0) (0.99% of tickets called) |
| Mean extra wait of non-prioritised passengers (min) | 0.01 [0.01, 0.01] |
| P90 extra wait of non-prioritised passengers (min) | 0.00 [0.00, 0.00] |
| Largest extra wait of any non-prioritised passenger, worst day (min) | 44.7 |
| Share of non-prioritised passengers delayed by more than 5 min | 0.36% |
| Most people who overtook one ticket, worst day (bound K = 30) | 30 |
| Calls where the cap blocked a priority call, per day | 3.4 |
| Calls where the overtake guard took precedence (a ticket had reached K overtakes), per day | 26.4 |

## 11. Call mechanics

Virtual queues only. A *second call* is made when the passenger has not presented within the call timeout; a *no-show* (missed call) is a ticket not validated after the second timeout. A no-show who rescans within the reactivation window is *reactivated*; later, the passenger needs a *new ticket*. *Idle lane time* counts open lanes with nobody to screen while passengers were waiting for or answering a call, as a share of the staffed lane time. Means per day.

| Policy | Calls | Second calls (share of calls) | No-shows (missed-call rate) | Reactivations | New tickets | Idle lane time (min, share) |
|---|---:|---:|---:|---:|---:|---:|
| `virtual-fifo` | 4685 | 63.2 (1.35%) | 22.6 (0.48%) | 21.6 | 1.0 | 0.0 (0.00%) |
| `priority-v1` | 4684 | 60.8 (1.30%) | 22.0 (0.47%) | 21.1 | 0.9 | 0.0 (0.00%) |
| `priority-v1-strict` | 4684 | 61.6 (1.31%) | 22.2 (0.47%) | 21.2 | 1.0 | 0.0 (0.00%) |

## 12. Groups, assisted passengers and late arrivals

Means per day. A group (two people or more) holds one ticket and counts as its people in every other table, in the priority cap and in the overtake bound. Assisted passengers are taken to the next free lane under every policy.

| Policy | Groups (people in groups) | Groups prioritised | Assisted passengers: people, mean time to screening (min), missed | Late on purpose: people, prioritised, missed |
|---|---:|---:|---:|---:|
| `fifo` | 1027.2 (2539.0) | 0.0 | 43.3, 0.06, 0.9 | 296.1, 0.0, 160.1 |
| `fifo-manual` | 1027.2 (2539.0) | 44.3 | 43.3, 0.07, 0.9 | 296.1, 132.1, 118.1 |
| `virtual-fifo` | 1027.2 (2539.0) | 0.0 | 43.3, 0.07, 0.9 | 296.1, 0.0, 159.8 |
| `priority-v1` | 1027.2 (2539.0) | 15.4 | 43.3, 0.06, 0.9 | 296.1, 16.1, 147.9 |
| `priority-v1-strict` | 1027.2 (2539.0) | 11.1 | 43.3, 0.07, 0.9 | 296.1, 0.0, 159.9 |

## 13. Checkpoint operations

Means per day; "longest" is the largest value over all simulated days.

| Policy | Staffed lane-hours | Lane utilisation | Tickets waiting for a call: mean (longest) | People standing in a queue: mean (longest) | URGENT on arrival | CRITICAL on arrival |
|---|---:|---:|---:|---:|---:|---:|
| `fifo` | 113.6 | 60.8% | 15.2 (261) | 15.2 (261) | 220.1 | 117.5 |
| `fifo-manual` | 113.6 | 60.8% | 15.2 (259) | 15.2 (259) | 220.0 | 117.5 |
| `virtual-fifo` | 113.6 | 60.8% | 10.3 (230) | 3.1 (32) | 173.3 | 207.9 |
| `priority-v1` | 113.6 | 60.8% | 10.3 (232) | 3.1 (32) | 173.3 | 208.0 |
| `priority-v1-strict` | 113.6 | 60.8% | 10.3 (235) | 3.1 (32) | 173.2 | 208.1 |

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
| queue.callAheadSeconds | 180 s |
| queue.responseEstimateSeconds | 90 s |
| queue.prepareWindowSize | 10 |
| queue.callTimeoutMs | 3.0 min |
| queue.recallTimeoutMs | 2.0 min |
| queue.reactivationWindowMs | 15.0 min |
| queue.maxReactivations | 1 |
| queue.reactivationPosition | ORIGINAL |

All parameter values are initial hypotheses to be calibrated and approved, not measured optima.

### GateFlow virtual queue with constrained EDF priority v1 and the late-presentation rule: `priority-v1-strict` 0.1.0

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
| selection.latePresentationCutoffMs | 45.0 min |
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
| passengers.strategicLateArrival | share 0.05, minMinutesBeforeStd 25, maxMinutesBeforeStd 35 | SYNTHETIC | Stress test, not an estimate: 5% of departing parties arrive late on purpose, uniformly between 35 and 25 minutes before departure. |
| operations.boardingCloseMinutesBeforeStd | 20 | SYNTHETIC | Boarding closes 20 minutes before the scheduled departure, for every flight. |
| operations.deadlineKnowledge | RULE | SYNTHETIC | The system applies the closing rule to the schedule; in this slice it matches the ground truth exactly. |

## 17. Limitations of this model version

- Single checkpoint. Lanes follow a planned schedule: no unplanned outages and no lanes opened in reaction to the queue.
- Every passenger uses the virtual queue when one is simulated: no opt-outs, no passengers without a phone or a view of the displays.
- Response times and absences are drawn per party from assumed distributions. A second call does not make an absent passenger come sooner, the prepare window does not shorten response times, and a passenger who has been at the access point once answers later calls at once.
- The access point never becomes a bottleneck, and the walk from the access point to the lanes is part of the response time.
- The system's deadline equals the ground truth (boarding close from a fixed rule): no flight delays, gate changes or stale data.
- Passengers never abandon the queue, even after their flight has closed.
- A group stays together: one ticket, one call, one lane, screened one person after the other. Assisted passengers always get the next free lane and are not assessed by the engine.
- Baseline A' (`fifo-manual`) is an idealised staff practice: every five minutes staff call the flights closing within 20 minutes, and every passenger of those flights comes forward at once. Real practice is less systematic, so A' may overstate today's handling where it is informal, or understate it where staff watch individual passengers.
- Strategic late arrivals are a fixed share in a stress-test scenario, not a behavioural response to the policy.
- Tickets are issued on arrival with no kiosk or scanning delay.
- The engine estimates screening time as the mean screening time per person, walking time as the nominal time of the gate zone, and the time from call to screening as the larger of the response estimate and the call-ahead time.

## 18. Reproducibility

| Item | Value |
|---|---|
| Scenario hash | `sha256:c4ec08a3fb23fd97281c5e60c61f955fb3b3101fd9ac870d2b1db5b01084d7af` |
| Seeds | 1-200 (200) |
| Source revision | `d018bcd8d4ab461ddc31303096c5e546cd034efe` |
| Versions | engine 0.3.0, queue core 0.2.0, model 0.3.0, kernel 0.1.0, population generator 0.3.0, scenario schema 3 |
| Generated by | gateflow-sim 0.3.0 |

Command:

```bash
gateflow-sim run --scenario scenarios/single-checkpoint-strategic.yaml --seeds 1-200 --policies fifo,fifo-manual,virtual-fifo,priority-v1,priority-v1-strict --baseline fifo --compare fifo-manual:fifo,virtual-fifo:fifo,priority-v1:fifo,priority-v1-strict:fifo,priority-v1:virtual-fifo,priority-v1:fifo-manual,priority-v1-strict:virtual-fifo,priority-v1-strict:fifo-manual,priority-v1-strict:priority-v1 --bootstrap-resamples 2000
```
