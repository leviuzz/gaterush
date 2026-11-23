# GateFlow simulation report: VCE-like departures checkpoint, normal day (synthetic)

> **SIMULATED RESULTS ON SYNTHETIC OR HYPOTHETICAL DATA. These numbers are model outputs, not measurements, and must not be presented as evidence of operational performance.**

Scenario `vce-like-normal-day` (data: SYNTHETIC), 200 simulated days, about 16623 passengers per day (12576 parties). Status quo (baseline): `fifo-manual`.

## 1. Headline

Means per simulated day. P5-P95 is the spread across days; brackets give the 95% confidence interval of the mean (bootstrap over days).

| Policy | Missed flights per day | of which connecting | Missed per 1,000 passengers |
|---|---:|---:|---:|
| Physical FIFO queue with staff calling closing flights (status quo with manual handling, policy A'): `fifo-manual` 0.1.0 | 10.9 (P5-P95 4.0-19.1) | 7.1 | 0.65 |
| Physical FIFO queue with staff calling closing flights (status quo with manual handling, policy A'), with extra lanes opened by a supervisor when the queue is long (today): `fifo-manual@reactive` 0.1.0 | 10.9 (P5-P95 4.0-19.1) | 7.1 | 0.65 |
| Physical FIFO queue with staff calling closing flights (status quo with manual handling, policy A'), with extra lanes recommended by GateFlow's console: `fifo-manual@advise` 0.1.0 | 10.9 (P5-P95 4.0-19.1) | 7.1 | 0.65 |
| Physical FIFO queue with staff calling closing flights (status quo with manual handling, policy A'), with extra lanes recommended by GateFlow's console, on the lanes' measured throughput: `fifo-manual@advise-measured` 0.1.0 | 10.9 (P5-P95 4.0-19.1) | 7.1 | 0.65 |
| GateFlow virtual queue with constrained EDF priority v3: fast track, stale-data rule and hysteresis (policy B), with extra lanes recommended by GateFlow's console: `priority-v3@advise` 0.2.0 | 10.9 (P5-P95 4.0-19.1) | 7.1 | 0.65 |
| GateFlow virtual queue with constrained EDF priority v3: fast track, stale-data rule and hysteresis (policy B), with extra lanes recommended by GateFlow's console, on the lanes' measured throughput: `priority-v3@advise-measured` 0.2.0 | 10.9 (P5-P95 4.0-19.1) | 7.1 | 0.65 |

| `fifo-manual@advise-measured` compared with `fifo-manual@advise` | Mean per day [95% CI] |
|---|---:|
| Flights saved: missed with `fifo-manual@advise`, caught with `fifo-manual@advise-measured` | 0.0 [0.0, 0.0] |
| Flights lost: caught with `fifo-manual@advise`, missed with `fifo-manual@advise-measured` | 0.0 [0.0, 0.0] |
| **Net flights saved** | **0.0 [0.0, 0.0]** |
| Days with a net gain / with a net loss | 0.0% / 0.0% |
| At-risk passengers reaching the gate in time (29.5 per day classified URGENT on arrival under `fifo-manual@advise`) | 83.0% with `fifo-manual@advise`, 83.0% with `fifo-manual@advise-measured` |
| Change in mean time from arrival to screening (min) | 0.00 [0.00, 0.00] |
| Change in mean time standing in a queue (min) | 0.00 [0.00, 0.00] |

| `priority-v3@advise-measured` compared with `priority-v3@advise` | Mean per day [95% CI] |
|---|---:|
| Flights saved: missed with `priority-v3@advise`, caught with `priority-v3@advise-measured` | 0.0 [0.0, 0.0] |
| Flights lost: caught with `priority-v3@advise`, missed with `priority-v3@advise-measured` | 0.0 [0.0, 0.0] |
| **Net flights saved** | **0.0 [0.0, 0.0]** |
| Days with a net gain / with a net loss | 0.0% / 0.0% |
| At-risk passengers reaching the gate in time (68.3 per day classified URGENT on arrival under `priority-v3@advise`) | 91.7% with `priority-v3@advise`, 91.7% with `priority-v3@advise-measured` |
| Change in mean time from arrival to screening (min) | 0.00 [0.00, 0.00] |
| Change in mean time standing in a queue (min) | 0.00 [0.00, 0.00] |

| `fifo-manual@advise-measured` compared with `fifo-manual@reactive` | Mean per day [95% CI] |
|---|---:|
| Flights saved: missed with `fifo-manual@reactive`, caught with `fifo-manual@advise-measured` | 0.0 [0.0, 0.0] |
| Flights lost: caught with `fifo-manual@reactive`, missed with `fifo-manual@advise-measured` | 0.0 [0.0, 0.0] |
| **Net flights saved** | **0.0 [0.0, 0.0]** |
| Days with a net gain / with a net loss | 0.0% / 0.0% |
| At-risk passengers reaching the gate in time (29.5 per day classified URGENT on arrival under `fifo-manual@reactive`) | 83.0% with `fifo-manual@reactive`, 83.0% with `fifo-manual@advise-measured` |
| Change in mean time from arrival to screening (min) | 0.00 [0.00, 0.00] |
| Change in mean time standing in a queue (min) | 0.00 [0.00, 0.00] |

| `fifo-manual@advise` compared with `fifo-manual@reactive` | Mean per day [95% CI] |
|---|---:|
| Flights saved: missed with `fifo-manual@reactive`, caught with `fifo-manual@advise` | 0.0 [0.0, 0.0] |
| Flights lost: caught with `fifo-manual@reactive`, missed with `fifo-manual@advise` | 0.0 [0.0, 0.0] |
| **Net flights saved** | **0.0 [0.0, 0.0]** |
| Days with a net gain / with a net loss | 0.0% / 0.0% |
| At-risk passengers reaching the gate in time (29.5 per day classified URGENT on arrival under `fifo-manual@reactive`) | 83.0% with `fifo-manual@reactive`, 83.0% with `fifo-manual@advise` |
| Change in mean time from arrival to screening (min) | 0.00 [0.00, 0.00] |
| Change in mean time standing in a queue (min) | 0.00 [0.00, 0.00] |

| `priority-v3@advise-measured` compared with `fifo-manual@reactive` | Mean per day [95% CI] |
|---|---:|
| Flights saved: missed with `fifo-manual@reactive`, caught with `priority-v3@advise-measured` | 0.2 [0.1, 0.3] |
| Flights lost: caught with `fifo-manual@reactive`, missed with `priority-v3@advise-measured` | 0.1 [0.1, 0.2] |
| **Net flights saved** | **0.0 [-0.1, 0.1]** |
| Days with a net gain / with a net loss | 10.0% / 10.5% |
| At-risk passengers reaching the gate in time (29.5 per day classified URGENT on arrival under `fifo-manual@reactive`) | 83.0% with `fifo-manual@reactive`, 83.4% with `priority-v3@advise-measured` |
| Change in mean time from arrival to screening (min) | 0.00 [0.00, 0.00] |
| Change in mean time standing in a queue (min) | -0.02 [-0.02, -0.01] |

| `priority-v3@advise` compared with `fifo-manual@reactive` | Mean per day [95% CI] |
|---|---:|
| Flights saved: missed with `fifo-manual@reactive`, caught with `priority-v3@advise` | 0.2 [0.1, 0.3] |
| Flights lost: caught with `fifo-manual@reactive`, missed with `priority-v3@advise` | 0.1 [0.1, 0.2] |
| **Net flights saved** | **0.0 [-0.1, 0.1]** |
| Days with a net gain / with a net loss | 10.0% / 10.5% |
| At-risk passengers reaching the gate in time (29.5 per day classified URGENT on arrival under `fifo-manual@reactive`) | 83.0% with `fifo-manual@reactive`, 83.4% with `priority-v3@advise` |
| Change in mean time from arrival to screening (min) | 0.00 [0.00, 0.00] |
| Change in mean time standing in a queue (min) | -0.02 [-0.02, -0.01] |

| `fifo-manual@advise-measured` compared with `fifo-manual` | Mean per day [95% CI] |
|---|---:|
| Flights saved: missed with `fifo-manual`, caught with `fifo-manual@advise-measured` | 0.0 [0.0, 0.0] |
| Flights lost: caught with `fifo-manual`, missed with `fifo-manual@advise-measured` | 0.0 [0.0, 0.0] |
| **Net flights saved** | **0.0 [0.0, 0.0]** |
| Days with a net gain / with a net loss | 0.0% / 0.0% |
| At-risk passengers reaching the gate in time (29.5 per day classified URGENT on arrival under `fifo-manual`) | 83.0% with `fifo-manual`, 83.0% with `fifo-manual@advise-measured` |
| Change in mean time from arrival to screening (min) | 0.00 [0.00, 0.00] |
| Change in mean time standing in a queue (min) | 0.00 [0.00, 0.00] |

| `fifo-manual@advise` compared with `fifo-manual` | Mean per day [95% CI] |
|---|---:|
| Flights saved: missed with `fifo-manual`, caught with `fifo-manual@advise` | 0.0 [0.0, 0.0] |
| Flights lost: caught with `fifo-manual`, missed with `fifo-manual@advise` | 0.0 [0.0, 0.0] |
| **Net flights saved** | **0.0 [0.0, 0.0]** |
| Days with a net gain / with a net loss | 0.0% / 0.0% |
| At-risk passengers reaching the gate in time (29.5 per day classified URGENT on arrival under `fifo-manual`) | 83.0% with `fifo-manual`, 83.0% with `fifo-manual@advise` |
| Change in mean time from arrival to screening (min) | 0.00 [0.00, 0.00] |
| Change in mean time standing in a queue (min) | 0.00 [0.00, 0.00] |

## 2. Waiting times

*Time to screening*: minutes from arrival at the checkpoint (when the ticket is issued) to the start of screening. *Standing*: minutes spent standing in a queue: the whole wait in a physical queue; in a virtual queue only the wait at the lanes after validating the ticket. Each column is the mean over days of the daily statistic; "longest" is the longest single value over all simulated days.

| Policy | Time to screening: mean | P50 | P90 | P99 | Longest | Standing: mean | P90 | Longest |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| `fifo-manual` | 0.3 | 0.1 | 0.8 | 3.0 | 10.9 | 0.3 | 0.8 | 10.9 |
| `fifo-manual@reactive` | 0.3 | 0.1 | 0.8 | 3.0 | 10.9 | 0.3 | 0.8 | 10.9 |
| `fifo-manual@advise` | 0.3 | 0.1 | 0.8 | 3.0 | 10.9 | 0.3 | 0.8 | 10.9 |
| `fifo-manual@advise-measured` | 0.3 | 0.1 | 0.8 | 3.0 | 10.9 | 0.3 | 0.8 | 10.9 |
| `priority-v3@advise` | 0.3 | 0.1 | 0.8 | 2.9 | 48.4 | 0.3 | 0.8 | 4.7 |
| `priority-v3@advise-measured` | 0.3 | 0.1 | 0.8 | 2.9 | 48.4 | 0.3 | 0.8 | 4.7 |

## 3. Cost for passengers not prioritised by `priority-v3@advise-measured` (compared with `fifo-manual@reactive`)

Extra wait = time to screening with the candidate minus time to screening with the reference, for the same passenger.

| Metric | Value [95% CI] |
|---|---:|
| Passengers prioritised per day | 68.4 (P5-P95 53.0-87.0) (0.40% of tickets called) |
| Mean extra wait of non-prioritised passengers (min) | 0.00 [0.00, 0.00] |
| P90 extra wait of non-prioritised passengers (min) | 0.00 [0.00, 0.00] |
| Largest extra wait of any non-prioritised passenger, worst day (min) | 43.1 |
| Share of non-prioritised passengers delayed by more than 5 min | 0.01% |
| Most people who overtook one ticket, worst day (bound K = 30, passes in the window and at the lanes included) | 9 |
| Calls where the cap blocked a priority call, per day | 0.0 |
| Calls where the overtake guard took precedence (a ticket had reached K overtakes), per day | 0.0 |
| People through the fast track per day | 68.4 |
| People passed at the lanes by fast-tracked parties per day | 162.3 |

## 4. Cost for passengers not prioritised by `priority-v3@advise` (compared with `fifo-manual@reactive`)

Extra wait = time to screening with the candidate minus time to screening with the reference, for the same passenger.

| Metric | Value [95% CI] |
|---|---:|
| Passengers prioritised per day | 68.4 (P5-P95 53.0-87.0) (0.40% of tickets called) |
| Mean extra wait of non-prioritised passengers (min) | 0.00 [0.00, 0.00] |
| P90 extra wait of non-prioritised passengers (min) | 0.00 [0.00, 0.00] |
| Largest extra wait of any non-prioritised passenger, worst day (min) | 43.1 |
| Share of non-prioritised passengers delayed by more than 5 min | 0.01% |
| Most people who overtook one ticket, worst day (bound K = 30, passes in the window and at the lanes included) | 9 |
| Calls where the cap blocked a priority call, per day | 0.0 |
| Calls where the overtake guard took precedence (a ticket had reached K overtakes), per day | 0.0 |
| People through the fast track per day | 68.4 |
| People passed at the lanes by fast-tracked parties per day | 162.3 |

## 5. Call mechanics

Virtual queues only. A *second call* is made when the passenger has not presented within the call timeout; a *no-show* (missed call) is a ticket not validated after the second timeout. A no-show who rescans within the reactivation window is *reactivated*; later, the passenger needs a *new ticket*. *Idle lane time* counts open lanes with nobody to screen while passengers were waiting for or answering a call, as a share of the staffed lane time. Means per day.

| Policy | Calls | Second calls (share of calls) | No-shows (missed-call rate) | Reactivations | New tickets | Idle lane time (min, share) |
|---|---:|---:|---:|---:|---:|---:|
| `priority-v3@advise` | 12489 | 1.7 (0.01%) | 0.8 (0.01%) | 0.8 | 0.0 | 0.1 (0.00%) |
| `priority-v3@advise-measured` | 12489 | 1.7 (0.01%) | 0.8 (0.01%) | 0.8 | 0.0 | 0.1 (0.00%) |

## 6. Disruptions, data quality and stability

No delays, gate changes, lane outages or feed outages in this scenario.

*Class changes* count the changes of risk class of waiting tickets under each policy's own classification. A *reversal* is a change in the direction opposite to the previous one, e.g. ATTENTION to URGENT and back: the flapping that hysteresis prevents. *Boosts on wrong information*: people prioritised while the system's knowledge of their flight differed from the truth (a delay or a gate change not yet known). Means per day.

| Policy | Missed among passengers of delayed or re-gated flights | Boosts on wrong information (people) | Class changes per 100 parties | Reversals | People whose class flapped |
|---|---:|---:|---:|---:|---:|
| `fifo-manual` | - | 0.0 | not classified | - | - |
| `fifo-manual@reactive` | - | 0.0 | not classified | - | - |
| `fifo-manual@advise` | - | 0.0 | not classified | - | - |
| `fifo-manual@advise-measured` | - | 0.0 | not classified | - | - |
| `priority-v3@advise` | - | 0.0 | 0.00 | 0.0 | 0.0 |
| `priority-v3@advise-measured` | - | 0.0 | 0.00 | 0.0 | 0.0 |

## 7. Groups, assisted passengers and late arrivals

Means per day. A group (two people or more) holds one ticket and counts as its people in every other table, in the priority cap and in the overtake bound. Assisted passengers are taken to the next free lane under every policy.

| Policy | Groups (people in groups) | Groups prioritised | Assisted passengers: people, mean time to screening (min), missed | Late on purpose: people, prioritised, missed |
|---|---:|---:|---:|---:|
| `fifo-manual` | 2749.8 (6796.9) | 7.2 | 115.3, 0.04, 0.0 | none in this scenario |
| `fifo-manual@reactive` | 2749.8 (6796.9) | 7.2 | 115.3, 0.04, 0.0 | none in this scenario |
| `fifo-manual@advise` | 2749.8 (6796.9) | 7.2 | 115.3, 0.04, 0.0 | none in this scenario |
| `fifo-manual@advise-measured` | 2749.8 (6796.9) | 7.2 | 115.3, 0.04, 0.0 | none in this scenario |
| `priority-v3@advise` | 2749.8 (6796.9) | 12.3 | 115.3, 0.04, 0.0 | none in this scenario |
| `priority-v3@advise-measured` | 2749.8 (6796.9) | 12.3 | 115.3, 0.04, 0.0 | none in this scenario |

## 8. Checkpoint operations

Means per day; "longest" is the largest value over all simulated days.

| Policy | Staffed lane-hours | Lane utilisation | Tickets waiting for a call: mean (longest) | People standing in a queue: mean (longest) | URGENT on arrival | CRITICAL on arrival |
|---|---:|---:|---:|---:|---:|---:|
| `fifo-manual` | 135.7 | 81.7% | 4.0 (112) | 4.0 (112) | 29.5 | 6.1 |
| `fifo-manual@reactive` | 135.7 | 81.7% | 4.0 (112) | 4.0 (112) | 29.5 | 6.1 |
| `fifo-manual@advise` | 135.7 | 81.7% | 4.0 (112) | 4.0 (112) | 29.5 | 6.1 |
| `fifo-manual@advise-measured` | 135.7 | 81.7% | 4.0 (112) | 4.0 (112) | 29.5 | 6.1 |
| `priority-v3@advise` | 135.7 | 81.7% | 0.1 (53) | 3.7 (90) | 68.3 | 6.1 |
| `priority-v3@advise-measured` | 135.7 | 81.7% | 0.1 (53) | 3.7 (90) | 68.3 | 6.1 |

## 9. Lane management

Extra lanes open beyond the plan, never more than the 14 lanes the checkpoint has, and at most 2 at the same time (the staff on call). A decision takes a median of 10 min to put a lane into service (varying from day to day), and an extra lane stays open at least 30 min. The supervisor of today's practice (`@reactive`) decides on the wait the queue shows; GateFlow (`@predict`) projects the queue from the forecast of arrivals and recommends lanes, as the console does (`@advise`, S22: its rule on the forecast of the next hour, from what the live system knows; `@advise-measured`, S22.5, with the lanes' throughput measured from the day instead of the checkpoint's settings), and the duty manager follows 80% of its recommendations. Means per day; "most" is the largest value over all simulated days.

| Policy | Rule | Staffed lane-hours | of which extra | Extra lanes opened (closed) | Decisions (followed) | Most lanes open |
|---|---|---:|---:|---:|---:|---:|
| `fifo-manual` | plan only | 135.7 | 0.0 | - | - | 12 |
| `fifo-manual@reactive` | supervisor: opens when the queue shows more than 10 min, closes below 2 min | 135.7 | 0.0 | 0.0 (0.0) | 0.0 (0.0) | 12 |
| `fifo-manual@advise` | GateFlow's console: keeps the median wait forecast below 10 min over the next 60 min, closes a lane beyond the plan below 2 min, 15 min between recommendations | 135.7 | 0.0 | 0.0 (0.0) | 0.0 (0.0) | 12 |
| `fifo-manual@advise-measured` | GateFlow's console: keeps the median wait forecast below 10 min over the next 60 min, closes a lane beyond the plan below 2 min, 15 min between recommendations; reads the lanes' throughput measured over the last 30 min (the minutes with at least 4 people per open lane not yet admitted, once 15 of them and 30 people; else the settings') | 135.7 | 0.0 | 0.0 (0.0) | 0.0 (0.0) | 12 |
| `priority-v3@advise` | GateFlow's console: keeps the median wait forecast below 10 min over the next 60 min, closes a lane beyond the plan below 2 min, 15 min between recommendations | 135.7 | 0.0 | 0.0 (0.0) | 0.0 (0.0) | 12 |
| `priority-v3@advise-measured` | GateFlow's console: keeps the median wait forecast below 10 min over the next 60 min, closes a lane beyond the plan below 2 min, 15 min between recommendations; reads the lanes' throughput measured over the last 30 min (the minutes with at least 4 people per open lane not yet admitted, once 15 of them and 30 people; else the settings') | 135.7 | 0.0 | 0.0 (0.0) | 0.0 (0.0) | 12 |

What the extra lanes buy: each policy compared with the same calls under another lane rule, passenger by passenger. Means per day [95% CI]; the last two columns divide totals over all days by the extra lane-hours (shown when the candidate only adds lane-hours).

| Comparison | Extra lane-hours | Net flights saved | Change in mean time to screening (min) | Waiting saved per extra lane-hour (person-hours) | Net flights saved per extra lane-hour |
|---|---:|---:|---:|---:|---:|
| `fifo-manual@advise-measured` vs `fifo-manual@advise` | 0.0 [0.0, 0.0] | 0.0 [0.0, 0.0] | 0.00 [0.00, 0.00] | - | - |
| `priority-v3@advise-measured` vs `priority-v3@advise` | 0.0 [0.0, 0.0] | 0.0 [0.0, 0.0] | 0.00 [0.00, 0.00] | - | - |
| `fifo-manual@advise-measured` vs `fifo-manual@reactive` | 0.0 [0.0, 0.0] | 0.0 [0.0, 0.0] | 0.00 [0.00, 0.00] | - | - |
| `fifo-manual@advise` vs `fifo-manual@reactive` | 0.0 [0.0, 0.0] | 0.0 [0.0, 0.0] | 0.00 [0.00, 0.00] | - | - |
| `fifo-manual@advise-measured` vs `fifo-manual` | 0.0 [0.0, 0.0] | 0.0 [0.0, 0.0] | 0.00 [0.00, 0.00] | - | - |
| `fifo-manual@advise` vs `fifo-manual` | 0.0 [0.0, 0.0] | 0.0 [0.0, 0.0] | 0.00 [0.00, 0.00] | - | - |

## 10. Method

- Each seed is one simulated day of the same design day (same flights), with different passengers.
- All policies are run on exactly the same passengers (common random numbers), so each comparison is paired passenger by passenger: a flight is *saved* when the passenger misses it with the reference and catches it with the candidate, and *lost* in the opposite case.
- `fifo-manual` (A') adds today's manual handling to the physical queue: staff periodically call the flights closing soon and their passengers are taken first. Comparing GateFlow with A' estimates the benefit over today's real practice.
- Passengers are counted as people: a party of three that misses its flight counts as three, in every table and comparison.
- The status quo is a physical FIFO queue. GateFlow policies run a virtual queue: tickets are called so as to keep the free lanes plus a call-ahead buffer supplied; each passenger presents after their own response time (later when they miss the call), validates the ticket at the access point and queues briefly at the lanes. Comparing `virtual-fifo` with the status quo isolates the cost or benefit of the call mechanics; comparing a priority policy with `virtual-fifo` isolates the prioritisation.
- A passenger misses the flight when they reach the gate after boarding closes (ground truth).
- Confidence intervals: percentile bootstrap of the mean over days (2000 resamples, seed 20261121). Quantiles: linear interpolation between order statistics (Hyndman-Fan type 7).
- Risk classes are computed on arrival with the same parameters for every policy. URGENT means "would miss the flight if served in FIFO order, but can still make it if selected now"; CRITICAL means "cannot make it even if selected now": such passengers are escalated to staff and never boosted automatically.

## 11. Policies

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

### Physical FIFO queue with staff calling closing flights (status quo with manual handling, policy A'), with extra lanes recommended by GateFlow's console, on the lanes' measured throughput: `fifo-manual@advise-measured` 0.1.0

Selection: `flight-call`. Queue: `physical` (physical queue: passengers stand in line and step forward when a lane is free). Lanes: `advise` (GateFlow's console: keeps the median wait forecast below 10 min over the next 60 min, closes a lane beyond the plan below 2 min, 15 min between recommendations; reads the lanes' throughput measured over the last 30 min (the minutes with at least 4 people per open lane not yet admitted, once 15 of them and 30 people; else the settings')).

| Parameter | Value |
|---|---|
| selection.callWindowMs | 20.0 min |
| selection.announcementIntervalMs | 5.0 min |
| lanes.reviewIntervalMs | 5.0 min |
| lanes.horizonMs | 60.0 min |
| lanes.targetWaitMs | 10.0 min |
| lanes.closeWhenWaitMs | 2.0 min |
| lanes.cooldownMs | 15.0 min |
| lanes.measuredThroughput | windowMinutes 30, busyPeoplePerLane 4, minBusyMinutes 15, minPeople 30 |

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

### GateFlow virtual queue with constrained EDF priority v3: fast track, stale-data rule and hysteresis (policy B), with extra lanes recommended by GateFlow's console, on the lanes' measured throughput: `priority-v3@advise-measured` 0.2.0

Selection: `constrained-edf`. Queue: `virtual` (GateFlow virtual queue: passengers wait anywhere, are called on displays and validate their ticket at the access point). Lanes: `advise` (GateFlow's console: keeps the median wait forecast below 10 min over the next 60 min, closes a lane beyond the plan below 2 min, 15 min between recommendations; reads the lanes' throughput measured over the last 30 min (the minutes with at least 4 people per open lane not yet admitted, once 15 of them and 30 people; else the settings')).

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
| lanes.measuredThroughput | windowMinutes 30, busyPeoplePerLane 4, minBusyMinutes 15, minPeople 30 |

All parameter values are initial hypotheses to be calibrated and approved, not measured optima.

## 12. Data sources and licences

Where the data of this scenario comes from, and the terms under which it may be used.

| Source | Kind | Provider | Licence or terms of use | Retrieved | Used for |
|---|---|---|---|---|---|
| Synthetic assumptions of this airport configuration (`gateflow-synthetic`) | SYNTHETIC | GateFlow | Created for GateFlow; contains no third-party data. | - | - |
| Venice Marco Polo traffic in 2025 (11.85 million passengers) (`save-traffic-2025`) | LITERATURE | SAVE S.p.A., annual figure as reported in the business plan and in the press | Published aggregate figure, cited with attribution. Used only to size the synthetic day. | 2026-11-21 | passengers.loadFactor |
| Synthetic flight list of the scenario library (`library-flights`) | SYNTHETIC | GateFlow (scenarios/flights/make-library-flights.mjs) | Created for GateFlow; contains no third-party schedule data. | - | flight list |

- `save-traffic-2025`: 11,850,336 passengers in 2025 according to the business plan (marked verified there); press coverage of SAVE's results gives 11.85 million. Not re-verified against SAVE's own publication, whose website refused automated access.

Airport configuration: `vce-like` (VCE-like airport (synthetic)), checkpoint `departures`, file `../airports/vce-like.yaml` (SHA-256 `ac6f19af1d1a9e260dfb815b1efc4bc5a41282500072bb1c70895bf978cd10ec`). The scenario gives only its day; every other parameter comes from this configuration.

Design day: 116 departures from the flight list `flights/vce-like-normal-day.csv` (SHA-256 `38b9a64da81a35516c81f08c102ffdf9a74db8a707288d7493de313a560d6900`), source `library-flights`.

## 13. Assumptions

Every model parameter, with its source. SYNTHETIC values are illustrative assumptions.

| Parameter | Value | Source | Note |
|---|---|---|---|
| checkpoint.lanesAvailable | 14 | SYNTHETIC | Lanes the checkpoint has (assumed): the roster plans at most 12, the others open only as extra lanes. |
| checkpoint.laneSchedule | from 00:00, lanes 2; from 03:00, lanes 3; from 04:00, lanes 8; from 05:00, lanes 12; from 06:00, lanes 10; from 07:00, lanes 8; from 09:00, lanes 9; from 10:00, lanes 8; from 12:00, lanes 7; from 14:00, lanes 8; from 15:00, lanes 7; from 18:00, lanes 6; from 19:00, lanes 5; from 20:00, lanes 3; from 21:00, lanes 2 | SYNTHETIC | Planned for this day with the lane plan rule of the checkpoint (airports/vce-like.yaml): 143.0 lane-hours. gateflow-sim lanes --scenario <this file> prints the plan again. |
| checkpoint.lanePlanRule | utilisation 0.9, intervalMinutes 60, minLanes 2, maxLanes 12, planningDays 100 | SYNTHETIC | Assumed planning rule, not the airport's: every hour, enough lanes to screen the expected arrivals at 90% utilisation, at least 2 and at most 12 lanes. |
| checkpoint.laneStaffing | maxExtraLanes 2, openDelayMinutes median 10, sigma 0.4, minOpenMinutes 30, followShare 0.8 | SYNTHETIC | Assumed: staff on call can open 2 extra lanes beyond the plan, about 10 minutes after the decision (5 to 20 on most days); an extra lane stays open at least 30 minutes; the duty manager follows 4 recommendations of GateFlow out of 5. |
| checkpoint.serviceTimeMeanSeconds | 24 | SYNTHETIC | About 150 passengers per hour per lane (assumed modern lanes with several divesting positions). |
| checkpoint.serviceTimeCv | 0.6 | SYNTHETIC |  |
| schedule.seats | aircraft A319, seats 156; aircraft A320, seats 180; aircraft A20N, seats 186; aircraft A321, seats 200; aircraft A21N, seats 232; aircraft B738, seats 189; aircraft E190, seats 100; aircraft E195, seats 120; aircraft BCS3, seats 145; aircraft B763, seats 216; aircraft B788, seats 240; aircraft B789, seats 290; aircraft B77W, seats 360; aircraft A359, seats 300 | SYNTHETIC | Assumed typical configurations by ICAO type designator (one class on short haul, two or three on long haul), not airline data. Replace with the airport's seat data. |
| schedule.gateZones | id A, walkMinutes 5, share 0.45; id B, walkMinutes 9, share 0.35; id C, walkMinutes 15, share 0.2 | SYNTHETIC | Nominal walk from the checkpoint exit: A and B are Schengen gates, C non-Schengen gates after passport control (its queue is not modelled). Long-haul flights use zone C; the others draw a zone with these shares. |
| passengers.loadFactor | min 0.6, mode 0.82, max 0.97 | SYNTHETIC (save-traffic-2025) | Shoulder-season load factors, drawn per flight and day. With the flight list the day has about 16,000 departing passengers, the average day of 2025 (11.85 million passengers, half of them departing, over 365 days). |
| passengers.transferShare | 0.02 | SYNTHETIC | Few connecting passengers cross this checkpoint (an origin-and-destination airport). |
| passengers.showUp.departing | minMinutesBeforeStd 25, medianExtraMinutes 70, sigma 0.55, maxMinutesBeforeStd 240 | SYNTHETIC | Arrival at the checkpoint = STD minus (25 min + log-normal with median 70 min), as in the demo scenario. |
| passengers.showUp.transfer | minMinutesBeforeStd 24, medianExtraMinutes 25, sigma 0.5, maxMinutesBeforeStd 180 | SYNTHETIC | Connecting passengers arrive later, after their inbound flight. |
| passengers.walkSpeedSigma | 0.2 | SYNTHETIC | Individual walking time = nominal zone time x log-normal(median 1, sigma). |
| passengers.callResponse | medianSeconds 75, sigma 0.5, absentProbability 0.04, absentExtraMedianMinutes 4, absentExtraSigma 0.8 | SYNTHETIC | Virtual queue only. As in the demo scenario; to be measured in a pilot. |
| passengers.groups | partySizes size 1, share 0.78; size 2, share 0.15; size 3, share 0.04; size 4, share 0.025; size 5, share 0.005 | SYNTHETIC | As in the demo scenario; about 40% of passengers travel with others. |
| passengers.assistedShare | 0.007 | SYNTHETIC | Parties taking the assisted path (PRM and similar), as in the demo scenario. |
| passengers.strategicLateArrival | share 0, minMinutesBeforeStd 25, maxMinutesBeforeStd 35 | SYNTHETIC | Nobody arrives late on purpose. |
| operations.boardingCloseMinutesBeforeStd | 20 | SYNTHETIC | Boarding closes 20 minutes before the scheduled departure, for every flight. |
| operations.deadlineKnowledge | RULE | SYNTHETIC | The system applies the closing rule to the schedule; without disruptions it matches the ground truth exactly. |
| disruptions.flightDelays | share 0, medianMinutes 20, sigma 0.8, maxMinutes 180, noticeMinMinutesBeforeStd 10, noticeMaxMinutesBeforeStd 120 | SYNTHETIC | No delays unless a day says otherwise (see vce-like-disrupted-day). |
| disruptions.gateChanges | share 0, minMinutesBeforeStd 30, maxMinutesBeforeStd 70, noticeDelayMaxMinutes 5 | SYNTHETIC | No gate changes unless a day says otherwise. |
| disruptions.laneOutages | perDay 0, medianMinutes 20, sigma 0.5, maxMinutes 60 | SYNTHETIC | No unplanned lane outages unless a day says otherwise. |
| disruptions.feedOutages | perDay 0, medianMinutes 30, sigma 0.6, maxMinutes 120 | SYNTHETIC | The flight feed never goes down unless a day says otherwise. |
| gateflow | maxOvertakes 30, capMaxPriorityCalls 10, capWindowCalls 20, hysteresisMinutes 3, maxDeadlineAgeMinutes 60, prepareWindowSize 10, callAheadSeconds 180, responseEstimateSeconds 90, laneTargetWaitMinutes 10, laneHorizonMinutes 45 | SYNTHETIC | GateFlow defaults (priority v3 0.2.0, the virtual queue of ADR-017 and the lane recommendations of ADR-039), to be approved by the airport for this checkpoint. |
| todayPractice | callWindowMinutes 20, announcementIntervalMinutes 5, laneOpenWaitMinutes 10, laneCloseWaitMinutes 2 | SYNTHETIC | Baseline A' as in ADR-022: every 5 minutes staff call the flights closing within 20 minutes. With a supervisor (@reactive, ADR-039), an extra lane opens when the queue shows more than 10 minutes and closes below 2. To replace with how this airport handles urgent passengers and long queues. |
| fairnessTarget | maxShareDelayedOver5Min 0.001 | SYNTHETIC | The criterion of ADR-025, to be approved by the airport. |

## 14. Limitations of this model version

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

## 15. Reproducibility

| Item | Value |
|---|---|
| Scenario hash | `sha256:5658496bfd2d7da04cd49a79c449f5b59b7b1dca80ff20411f933882939a7671` |
| Seeds | 1-200 (200) |
| Source revision | `cc259fb6d02f3bc241d6925217a156b6382c9198` |
| Versions | engine 0.5.0, queue core 0.13.0, model 0.7.0, kernel 0.1.0, population generator 0.7.0, scenario schema 5 |
| Generated by | gateflow-sim 0.17.0 |

Command:

```bash
gateflow-sim run --scenario scenarios/vce-like-normal-day.yaml --seeds 1-200 --policies fifo-manual,fifo-manual@reactive,fifo-manual@advise,fifo-manual@advise-measured,priority-v3@advise,priority-v3@advise-measured --baseline fifo-manual --compare fifo-manual@advise-measured:fifo-manual@advise,priority-v3@advise-measured:priority-v3@advise,fifo-manual@advise-measured:fifo-manual@reactive,fifo-manual@advise:fifo-manual@reactive,priority-v3@advise-measured:fifo-manual@reactive,priority-v3@advise:fifo-manual@reactive,fifo-manual@advise-measured:fifo-manual,fifo-manual@advise:fifo-manual --bootstrap-resamples 2000
```
