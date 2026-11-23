# GateFlow simulation report: TSF-like low-cost base, summer peak day (synthetic)

> **SIMULATED RESULTS ON SYNTHETIC OR HYPOTHETICAL DATA. These numbers are model outputs, not measurements, and must not be presented as evidence of operational performance.**

Scenario `tsf-like-peak-day` (data: SYNTHETIC), 200 simulated days, about 5981 passengers per day (4108 parties). Status quo (baseline): `fifo-manual`.

## 1. Headline

Means per simulated day. P5-P95 is the spread across days; brackets give the 95% confidence interval of the mean (bootstrap over days).

| Policy | Missed flights per day | of which connecting | Missed per 1,000 passengers |
|---|---:|---:|---:|
| Physical FIFO queue with staff calling closing flights (status quo with manual handling, policy A'): `fifo-manual` 0.1.0 | 0.0 (P5-P95 0.0-0.0) | 0.0 | 0.01 |
| Physical FIFO queue with staff calling closing flights (status quo with manual handling, policy A'), with extra lanes opened by a supervisor when the queue is long (today): `fifo-manual@reactive` 0.1.0 | 0.0 (P5-P95 0.0-0.0) | 0.0 | 0.00 |
| Physical FIFO queue with staff calling closing flights (status quo with manual handling, policy A'), with extra lanes recommended by GateFlow's console: `fifo-manual@advise` 0.1.0 | 0.0 (P5-P95 0.0-0.0) | 0.0 | 0.00 |
| Physical FIFO queue with staff calling closing flights (status quo with manual handling, policy A'), with extra lanes recommended by GateFlow's console, on the lanes' measured throughput: `fifo-manual@advise-measured` 0.1.0 | 0.0 (P5-P95 0.0-0.0) | 0.0 | 0.00 |
| GateFlow virtual queue with constrained EDF priority v3: fast track, stale-data rule and hysteresis (policy B), with extra lanes recommended by GateFlow's console: `priority-v3@advise` 0.2.0 | 0.1 (P5-P95 0.0-0.0) | 0.0 | 0.01 |
| GateFlow virtual queue with constrained EDF priority v3: fast track, stale-data rule and hysteresis (policy B), with extra lanes recommended by GateFlow's console, on the lanes' measured throughput: `priority-v3@advise-measured` 0.2.0 | 0.1 (P5-P95 0.0-0.0) | 0.0 | 0.01 |

| `fifo-manual@advise-measured` compared with `fifo-manual@advise` | Mean per day [95% CI] |
|---|---:|
| Flights saved: missed with `fifo-manual@advise`, caught with `fifo-manual@advise-measured` | 0.0 [0.0, 0.0] |
| Flights lost: caught with `fifo-manual@advise`, missed with `fifo-manual@advise-measured` | 0.0 [0.0, 0.0] |
| **Net flights saved** | **0.0 [0.0, 0.0]** |
| Days with a net gain / with a net loss | 0.0% / 0.0% |
| At-risk passengers reaching the gate in time (0.8 per day classified URGENT on arrival under `fifo-manual@advise`) | 100.0% with `fifo-manual@advise`, 100.0% with `fifo-manual@advise-measured` |
| Change in mean time from arrival to screening (min) | 0.00 [0.00, 0.00] |
| Change in mean time standing in a queue (min) | 0.00 [0.00, 0.00] |

| `priority-v3@advise-measured` compared with `priority-v3@advise` | Mean per day [95% CI] |
|---|---:|
| Flights saved: missed with `priority-v3@advise`, caught with `priority-v3@advise-measured` | 0.0 [0.0, 0.0] |
| Flights lost: caught with `priority-v3@advise`, missed with `priority-v3@advise-measured` | 0.0 [0.0, 0.0] |
| **Net flights saved** | **0.0 [0.0, 0.0]** |
| Days with a net gain / with a net loss | 0.0% / 0.0% |
| At-risk passengers reaching the gate in time (1.4 per day classified URGENT on arrival under `priority-v3@advise`) | 99.6% with `priority-v3@advise`, 99.6% with `priority-v3@advise-measured` |
| Change in mean time from arrival to screening (min) | 0.00 [-0.01, 0.00] |
| Change in mean time standing in a queue (min) | 0.00 [0.00, 0.00] |

| `fifo-manual@advise-measured` compared with `fifo-manual@reactive` | Mean per day [95% CI] |
|---|---:|
| Flights saved: missed with `fifo-manual@reactive`, caught with `fifo-manual@advise-measured` | 0.0 [0.0, 0.0] |
| Flights lost: caught with `fifo-manual@reactive`, missed with `fifo-manual@advise-measured` | 0.0 [0.0, 0.0] |
| **Net flights saved** | **0.0 [0.0, 0.0]** |
| Days with a net gain / with a net loss | 0.0% / 0.0% |
| At-risk passengers reaching the gate in time (6.6 per day classified URGENT on arrival under `fifo-manual@reactive`) | 100.0% with `fifo-manual@reactive`, 100.0% with `fifo-manual@advise-measured` |
| Change in mean time from arrival to screening (min) | -0.93 [-0.96, -0.90] |
| Change in mean time standing in a queue (min) | -0.93 [-0.96, -0.90] |

| `fifo-manual@advise` compared with `fifo-manual@reactive` | Mean per day [95% CI] |
|---|---:|
| Flights saved: missed with `fifo-manual@reactive`, caught with `fifo-manual@advise` | 0.0 [0.0, 0.0] |
| Flights lost: caught with `fifo-manual@reactive`, missed with `fifo-manual@advise` | 0.0 [0.0, 0.0] |
| **Net flights saved** | **0.0 [0.0, 0.0]** |
| Days with a net gain / with a net loss | 0.0% / 0.0% |
| At-risk passengers reaching the gate in time (6.6 per day classified URGENT on arrival under `fifo-manual@reactive`) | 100.0% with `fifo-manual@reactive`, 100.0% with `fifo-manual@advise` |
| Change in mean time from arrival to screening (min) | -0.93 [-0.96, -0.90] |
| Change in mean time standing in a queue (min) | -0.93 [-0.96, -0.90] |

| `priority-v3@advise-measured` compared with `fifo-manual@reactive` | Mean per day [95% CI] |
|---|---:|
| Flights saved: missed with `fifo-manual@reactive`, caught with `priority-v3@advise-measured` | 0.0 [0.0, 0.0] |
| Flights lost: caught with `fifo-manual@reactive`, missed with `priority-v3@advise-measured` | 0.1 [0.0, 0.1] |
| **Net flights saved** | **-0.1 [-0.1, 0.0]** |
| Days with a net gain / with a net loss | 0.0% / 4.0% |
| At-risk passengers reaching the gate in time (6.6 per day classified URGENT on arrival under `fifo-manual@reactive`) | 100.0% with `fifo-manual@reactive`, 99.8% with `priority-v3@advise-measured` |
| Change in mean time from arrival to screening (min) | -0.86 [-0.89, -0.83] |
| Change in mean time standing in a queue (min) | -1.26 [-1.31, -1.22] |

| `priority-v3@advise` compared with `fifo-manual@reactive` | Mean per day [95% CI] |
|---|---:|
| Flights saved: missed with `fifo-manual@reactive`, caught with `priority-v3@advise` | 0.0 [0.0, 0.0] |
| Flights lost: caught with `fifo-manual@reactive`, missed with `priority-v3@advise` | 0.1 [0.0, 0.1] |
| **Net flights saved** | **-0.1 [-0.1, 0.0]** |
| Days with a net gain / with a net loss | 0.0% / 4.0% |
| At-risk passengers reaching the gate in time (6.6 per day classified URGENT on arrival under `fifo-manual@reactive`) | 100.0% with `fifo-manual@reactive`, 99.8% with `priority-v3@advise` |
| Change in mean time from arrival to screening (min) | -0.86 [-0.89, -0.83] |
| Change in mean time standing in a queue (min) | -1.26 [-1.31, -1.22] |

| `fifo-manual@advise-measured` compared with `fifo-manual` | Mean per day [95% CI] |
|---|---:|
| Flights saved: missed with `fifo-manual`, caught with `fifo-manual@advise-measured` | 0.0 [0.0, 0.1] |
| Flights lost: caught with `fifo-manual`, missed with `fifo-manual@advise-measured` | 0.0 [0.0, 0.0] |
| **Net flights saved** | **0.0 [0.0, 0.1]** |
| Days with a net gain / with a net loss | 0.5% / 0.0% |
| At-risk passengers reaching the gate in time (39.7 per day classified URGENT on arrival under `fifo-manual`) | 99.9% with `fifo-manual`, 100.0% with `fifo-manual@advise-measured` |
| Change in mean time from arrival to screening (min) | -2.54 [-2.63, -2.44] |
| Change in mean time standing in a queue (min) | -2.54 [-2.63, -2.44] |

| `fifo-manual@advise` compared with `fifo-manual` | Mean per day [95% CI] |
|---|---:|
| Flights saved: missed with `fifo-manual`, caught with `fifo-manual@advise` | 0.0 [0.0, 0.1] |
| Flights lost: caught with `fifo-manual`, missed with `fifo-manual@advise` | 0.0 [0.0, 0.0] |
| **Net flights saved** | **0.0 [0.0, 0.1]** |
| Days with a net gain / with a net loss | 0.5% / 0.0% |
| At-risk passengers reaching the gate in time (39.7 per day classified URGENT on arrival under `fifo-manual`) | 99.9% with `fifo-manual`, 100.0% with `fifo-manual@advise` |
| Change in mean time from arrival to screening (min) | -2.54 [-2.63, -2.44] |
| Change in mean time standing in a queue (min) | -2.54 [-2.63, -2.44] |

## 2. Waiting times

*Time to screening*: minutes from arrival at the checkpoint (when the ticket is issued) to the start of screening. *Standing*: minutes spent standing in a queue: the whole wait in a physical queue; in a virtual queue only the wait at the lanes after validating the ticket. Each column is the mean over days of the daily statistic; "longest" is the longest single value over all simulated days.

| Policy | Time to screening: mean | P50 | P90 | P99 | Longest | Standing: mean | P90 | Longest |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| `fifo-manual` | 3.5 | 0.3 | 14.9 | 26.9 | 56.2 | 3.5 | 14.9 | 56.2 |
| `fifo-manual@reactive` | 1.9 | 0.2 | 8.3 | 13.7 | 23.6 | 1.9 | 8.3 | 23.6 |
| `fifo-manual@advise` | 0.9 | 0.2 | 3.3 | 6.9 | 18.0 | 0.9 | 3.3 | 18.0 |
| `fifo-manual@advise-measured` | 0.9 | 0.2 | 3.3 | 6.9 | 18.0 | 0.9 | 3.3 | 18.0 |
| `priority-v3@advise` | 1.0 | 0.2 | 3.6 | 7.4 | 106.0 | 0.6 | 1.9 | 7.0 |
| `priority-v3@advise-measured` | 1.0 | 0.2 | 3.6 | 7.4 | 106.0 | 0.6 | 1.9 | 7.0 |

## 3. Cost for passengers not prioritised by `priority-v3@advise-measured` (compared with `fifo-manual@reactive`)

Extra wait = time to screening with the candidate minus time to screening with the reference, for the same passenger.

| Metric | Value [95% CI] |
|---|---:|
| Passengers prioritised per day | 1.9 (P5-P95 0.0-6.0) (0.03% of tickets called) |
| Mean extra wait of non-prioritised passengers (min) | -0.86 [-0.89, -0.83] |
| P90 extra wait of non-prioritised passengers (min) | 0.00 [0.00, 0.00] |
| Largest extra wait of any non-prioritised passenger, worst day (min) | 92.5 |
| Share of non-prioritised passengers delayed by more than 5 min | 0.08% |
| Most people who overtook one ticket, worst day (bound K = 30, passes in the window and at the lanes included) | 12 |
| Calls where the cap blocked a priority call, per day | 0.0 |
| Calls where the overtake guard took precedence (a ticket had reached K overtakes), per day | 0.0 |
| People through the fast track per day | 1.9 |
| People passed at the lanes by fast-tracked parties per day | 13.7 |

## 4. Cost for passengers not prioritised by `priority-v3@advise` (compared with `fifo-manual@reactive`)

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

## 5. Call mechanics

Virtual queues only. A *second call* is made when the passenger has not presented within the call timeout; a *no-show* (missed call) is a ticket not validated after the second timeout. A no-show who rescans within the reactivation window is *reactivated*; later, the passenger needs a *new ticket*. *Idle lane time* counts open lanes with nobody to screen while passengers were waiting for or answering a call, as a share of the staffed lane time. Means per day.

| Policy | Calls | Second calls (share of calls) | No-shows (missed-call rate) | Reactivations | New tickets | Idle lane time (min, share) |
|---|---:|---:|---:|---:|---:|---:|
| `priority-v3@advise` | 4085 | 15.3 (0.37%) | 6.2 (0.15%) | 6.0 | 0.3 | 0.2 (0.00%) |
| `priority-v3@advise-measured` | 4085 | 15.2 (0.37%) | 6.2 (0.15%) | 5.9 | 0.3 | 0.2 (0.00%) |

## 6. Disruptions, data quality and stability

No delays, gate changes, lane outages or feed outages in this scenario.

*Class changes* count the changes of risk class of waiting tickets under each policy's own classification. A *reversal* is a change in the direction opposite to the previous one, e.g. ATTENTION to URGENT and back: the flapping that hysteresis prevents. *Boosts on wrong information*: people prioritised while the system's knowledge of their flight differed from the truth (a delay or a gate change not yet known). Means per day.

| Policy | Missed among passengers of delayed or re-gated flights | Boosts on wrong information (people) | Class changes per 100 parties | Reversals | People whose class flapped |
|---|---:|---:|---:|---:|---:|
| `fifo-manual` | - | 0.0 | not classified | - | - |
| `fifo-manual@reactive` | - | 0.0 | not classified | - | - |
| `fifo-manual@advise` | - | 0.0 | not classified | - | - |
| `fifo-manual@advise-measured` | - | 0.0 | not classified | - | - |
| `priority-v3@advise` | - | 0.0 | 0.03 | 0.0 | 0.0 |
| `priority-v3@advise-measured` | - | 0.0 | 0.03 | 0.0 | 0.0 |

## 7. Groups, assisted passengers and late arrivals

Means per day. A group (two people or more) holds one ticket and counts as its people in every other table, in the priority cap and in the overtake bound. Assisted passengers are taken to the next free lane under every policy.

| Policy | Groups (people in groups) | Groups prioritised | Assisted passengers: people, mean time to screening (min), missed | Late on purpose: people, prioritised, missed |
|---|---:|---:|---:|---:|
| `fifo-manual` | 1225.7 (3098.5) | 26.8 | 41.3, 0.11, 0.0 | none in this scenario |
| `fifo-manual@reactive` | 1225.7 (3098.5) | 8.1 | 41.3, 0.10, 0.0 | none in this scenario |
| `fifo-manual@advise` | 1225.7 (3098.5) | 2.9 | 41.3, 0.10, 0.0 | none in this scenario |
| `fifo-manual@advise-measured` | 1225.7 (3098.5) | 2.8 | 41.3, 0.10, 0.0 | none in this scenario |
| `priority-v3@advise` | 1225.7 (3098.5) | 0.5 | 41.3, 0.10, 0.0 | none in this scenario |
| `priority-v3@advise-measured` | 1225.7 (3098.5) | 0.4 | 41.3, 0.10, 0.0 | none in this scenario |

## 8. Checkpoint operations

Means per day; "longest" is the largest value over all simulated days.

| Policy | Staffed lane-hours | Lane utilisation | Tickets waiting for a call: mean (longest) | People standing in a queue: mean (longest) | URGENT on arrival | CRITICAL on arrival |
|---|---:|---:|---:|---:|---:|---:|
| `fifo-manual` | 62.8 | 79.4% | 19.5 (258) | 19.5 (258) | 39.7 | 0.0 |
| `fifo-manual@reactive` | 63.8 | 78.1% | 10.5 (233) | 10.5 (233) | 6.6 | 0.0 |
| `fifo-manual@advise` | 64.5 | 77.3% | 5.3 (211) | 5.3 (211) | 0.8 | 0.0 |
| `fifo-manual@advise-measured` | 64.5 | 77.2% | 5.3 (211) | 5.3 (211) | 0.8 | 0.0 |
| `priority-v3@advise` | 64.3 | 77.5% | 1.5 (171) | 3.4 (41) | 1.4 | 0.0 |
| `priority-v3@advise-measured` | 64.3 | 77.5% | 1.5 (171) | 3.4 (41) | 1.4 | 0.0 |

## 9. Lane management

Extra lanes open beyond the plan, never more than the 6 lanes the checkpoint has, and at most 1 at the same time (the staff on call). A decision takes a median of 10 min to put a lane into service (varying from day to day), and an extra lane stays open at least 30 min. The supervisor of today's practice (`@reactive`) decides on the wait the queue shows; GateFlow (`@predict`) projects the queue from the forecast of arrivals and recommends lanes, as the console does (`@advise`, S22: its rule on the forecast of the next hour, from what the live system knows; `@advise-measured`, S22.5, with the lanes' throughput measured from the day instead of the checkpoint's settings), and the duty manager follows 80% of its recommendations. Means per day; "most" is the largest value over all simulated days.

| Policy | Rule | Staffed lane-hours | of which extra | Extra lanes opened (closed) | Decisions (followed) | Most lanes open |
|---|---|---:|---:|---:|---:|---:|
| `fifo-manual` | plan only | 62.8 | 0.0 | - | - | 5 |
| `fifo-manual@reactive` | supervisor: opens when the queue shows more than 10 min, closes below 2 min | 63.8 | 1.1 | 1.1 (1.0) | 2.1 (2.1) | 6 |
| `fifo-manual@advise` | GateFlow's console: keeps the median wait forecast below 10 min over the next 60 min, closes a lane beyond the plan below 2 min, 15 min between recommendations | 64.5 | 1.7 | 1.1 (1.0) | 2.8 (2.2) | 6 |
| `fifo-manual@advise-measured` | GateFlow's console: keeps the median wait forecast below 10 min over the next 60 min, closes a lane beyond the plan below 2 min, 15 min between recommendations; reads the lanes' throughput measured over the last 30 min (the minutes with at least 4 people per open lane not yet admitted, once 15 of them and 30 people; else the settings') | 64.5 | 1.8 | 1.1 (1.0) | 2.8 (2.2) | 6 |
| `priority-v3@advise` | GateFlow's console: keeps the median wait forecast below 10 min over the next 60 min, closes a lane beyond the plan below 2 min, 15 min between recommendations | 64.3 | 1.5 | 1.0 (1.0) | 2.8 (2.2) | 6 |
| `priority-v3@advise-measured` | GateFlow's console: keeps the median wait forecast below 10 min over the next 60 min, closes a lane beyond the plan below 2 min, 15 min between recommendations; reads the lanes' throughput measured over the last 30 min (the minutes with at least 4 people per open lane not yet admitted, once 15 of them and 30 people; else the settings') | 64.3 | 1.5 | 1.1 (1.0) | 2.8 (2.2) | 6 |

What the extra lanes buy: each policy compared with the same calls under another lane rule, passenger by passenger. Means per day [95% CI]; the last two columns divide totals over all days by the extra lane-hours (shown when the candidate only adds lane-hours).

| Comparison | Extra lane-hours | Net flights saved | Change in mean time to screening (min) | Waiting saved per extra lane-hour (person-hours) | Net flights saved per extra lane-hour |
|---|---:|---:|---:|---:|---:|
| `fifo-manual@advise-measured` vs `fifo-manual@advise` | 0.0 [0.0, 0.0] | 0.0 [0.0, 0.0] | 0.00 [0.00, 0.00] | - | - |
| `priority-v3@advise-measured` vs `priority-v3@advise` | 0.0 [0.0, 0.0] | 0.0 [0.0, 0.0] | 0.00 [-0.01, 0.00] | - | - |
| `fifo-manual@advise-measured` vs `fifo-manual@reactive` | 0.7 [0.7, 0.8] | 0.0 [0.0, 0.0] | -0.93 [-0.96, -0.90] | 131.5 [121.9, 141.8] | 0.00 [0.00, 0.00] |
| `fifo-manual@advise` vs `fifo-manual@reactive` | 0.7 [0.6, 0.7] | 0.0 [0.0, 0.0] | -0.93 [-0.96, -0.90] | 134.1 [124.5, 144.9] | 0.00 [0.00, 0.00] |
| `fifo-manual@advise-measured` vs `fifo-manual` | 1.8 [1.7, 1.8] | 0.0 [0.0, 0.1] | -2.54 [-2.63, -2.44] | 143.8 [138.9, 148.8] | 0.01 [0.00, 0.04] |
| `fifo-manual@advise` vs `fifo-manual` | 1.7 [1.7, 1.8] | 0.0 [0.0, 0.1] | -2.54 [-2.63, -2.44] | 144.9 [139.9, 150.0] | 0.01 [0.00, 0.04] |

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
| Treviso Canova traffic in 2025 (3.2 million passengers) (`save-traffic-2025`) | LITERATURE | SAVE S.p.A., annual figure as reported in the business plan and in the press | Published aggregate figure, cited with attribution. Used only to size the synthetic day. | 2026-11-21 | passengers.loadFactor |
| Synthetic flight list of the scenario library (`library-flights`) | SYNTHETIC | GateFlow (scenarios/flights/make-library-flights.mjs) | Created for GateFlow; contains no third-party schedule data. | - | flight list |

- `save-traffic-2025`: 3,200,130 passengers in 2025 according to the business plan (marked verified there); press coverage of SAVE's results gives over 3.2 million. Not re-verified against SAVE's own publication, whose website refused automated access.

Airport configuration: `tsf-like` (TSF-like airport (synthetic)), checkpoint `departures`, file `../airports/tsf-like.yaml` (SHA-256 `9be8f777574c7e2f62ebf33d44507485e4ced2dee49bdbe07893f4a97fe040a3`). The scenario gives only its day; every other parameter comes from this configuration.

Design day: 34 departures from the flight list `flights/tsf-like-peak-day.csv` (SHA-256 `cb6cd9c8a623daec1e15158a0f3ac583c4ee2fd75ca0f775955fb82c1a5513a9`), source `library-flights`.

## 13. Assumptions

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
| Scenario hash | `sha256:d305399bbbdf94f7f8d6f51ac2bdc95e28ae264f990090c55c6706ddd79aed8e` |
| Seeds | 1-200 (200) |
| Source revision | `cc259fb6d02f3bc241d6925217a156b6382c9198` |
| Versions | engine 0.5.0, queue core 0.13.0, model 0.7.0, kernel 0.1.0, population generator 0.7.0, scenario schema 5 |
| Generated by | gateflow-sim 0.17.0 |

Command:

```bash
gateflow-sim run --scenario scenarios/tsf-like-peak-day.yaml --seeds 1-200 --policies fifo-manual,fifo-manual@reactive,fifo-manual@advise,fifo-manual@advise-measured,priority-v3@advise,priority-v3@advise-measured --baseline fifo-manual --compare fifo-manual@advise-measured:fifo-manual@advise,priority-v3@advise-measured:priority-v3@advise,fifo-manual@advise-measured:fifo-manual@reactive,fifo-manual@advise:fifo-manual@reactive,priority-v3@advise-measured:fifo-manual@reactive,priority-v3@advise:fifo-manual@reactive,fifo-manual@advise-measured:fifo-manual,fifo-manual@advise:fifo-manual --bootstrap-resamples 2000
```
