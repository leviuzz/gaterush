# GateFlow simulation report: Single departure checkpoint, synthetic day with a moderate morning peak

> **SIMULATED RESULTS ON SYNTHETIC OR HYPOTHETICAL DATA. These numbers are model outputs, not measurements, and must not be presented as evidence of operational performance.**

Scenario `single-checkpoint-moderate` (data: SYNTHETIC), 200 simulated days, about 6127 passengers per day. Status quo (baseline): `fifo`.

## 1. Headline

Means per simulated day. P5-P95 is the spread across days; brackets give the 95% confidence interval of the mean (bootstrap over days).

| Policy | Missed flights per day | of which connecting | Missed per 1,000 passengers |
|---|---:|---:|---:|
| Physical FIFO queue (status quo, policy A): `fifo` 1.1.0 | 11.9 (P5-P95 3.0-24.1) | 8.8 | 1.94 |
| GateFlow virtual queue in FIFO order: `virtual-fifo` 0.1.0 | 12.3 (P5-P95 4.0-24.1) | 8.9 | 2.01 |
| GateFlow virtual queue with constrained EDF priority v0 (policy B): `priority-v0` 0.2.0 | 10.1 (P5-P95 3.0-17.1) | 7.7 | 1.64 |

| `virtual-fifo` compared with `fifo` | Mean per day [95% CI] |
|---|---:|
| Flights saved: missed with `fifo`, caught with `virtual-fifo` | 0.7 [0.6, 0.8] |
| Flights lost: caught with `fifo`, missed with `virtual-fifo` | 1.1 [0.9, 1.3] |
| **Net flights saved** | **-0.4 [-0.6, -0.2]** |
| Days with a net gain / with a net loss | 21.0% / 45.0% |
| At-risk passengers reaching the gate in time (16.4 per day classified URGENT on arrival under `fifo`) | 68.0% with `fifo`, 67.2% with `virtual-fifo` |
| Change in mean time from arrival to screening (min) | 0.00 [0.00, 0.00] |
| Change in mean time standing in a queue (min) | -0.78 [-0.86, -0.71] |

| `priority-v0` compared with `fifo` | Mean per day [95% CI] |
|---|---:|
| Flights saved: missed with `fifo`, caught with `priority-v0` | 2.5 [2.0, 3.1] |
| Flights lost: caught with `fifo`, missed with `priority-v0` | 0.6 [0.5, 0.8] |
| **Net flights saved** | **1.8 [1.4, 2.4]** |
| Days with a net gain / with a net loss | 46.5% / 16.5% |
| At-risk passengers reaching the gate in time (16.4 per day classified URGENT on arrival under `fifo`) | 68.0% with `fifo`, 80.5% with `priority-v0` |
| Change in mean time from arrival to screening (min) | 0.00 [0.00, 0.00] |
| Change in mean time standing in a queue (min) | -0.78 [-0.85, -0.71] |

| `priority-v0` compared with `virtual-fifo` | Mean per day [95% CI] |
|---|---:|
| Flights saved: missed with `virtual-fifo`, caught with `priority-v0` | 2.4 [1.9, 2.9] |
| Flights lost: caught with `virtual-fifo`, missed with `priority-v0` | 0.1 [0.1, 0.2] |
| **Net flights saved** | **2.3 [1.8, 2.8]** |
| Days with a net gain / with a net loss | 55.0% / 4.0% |
| At-risk passengers reaching the gate in time (13.0 per day classified URGENT on arrival under `virtual-fifo`) | 81.0% with `virtual-fifo`, 98.4% with `priority-v0` |
| Change in mean time from arrival to screening (min) | 0.00 [0.00, 0.00] |
| Change in mean time standing in a queue (min) | 0.00 [0.00, 0.00] |

## 2. Waiting times

*Time to screening*: minutes from arrival at the checkpoint (when the ticket is issued) to the start of screening. *Standing*: minutes spent standing in a queue: the whole wait in a physical queue; in a virtual queue only the wait at the lanes after validating the ticket. Each column is the mean over days of the daily statistic; "longest" is the longest single value over all simulated days.

| Policy | Time to screening: mean | P50 | P90 | P99 | Longest | Standing: mean | P90 | Longest |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| `fifo` | 1.2 | 0.0 | 5.9 | 9.0 | 19.8 | 1.2 | 5.9 | 19.8 |
| `virtual-fifo` | 1.2 | 0.0 | 5.7 | 9.2 | 107.5 | 0.4 | 1.7 | 4.2 |
| `priority-v0` | 1.2 | 0.0 | 5.7 | 9.4 | 107.6 | 0.4 | 1.7 | 4.4 |

## 3. Cost for passengers not prioritised by `priority-v0` (compared with `fifo`)

Extra wait = time to screening with the candidate minus time to screening with the reference, for the same passenger.

| Metric | Value [95% CI] |
|---|---:|
| Passengers prioritised per day | 14.2 (P5-P95 0.0-41.0) (0.23% of calls) |
| Mean extra wait of non-prioritised passengers (min) | 0.01 [0.01, 0.02] |
| P90 extra wait of non-prioritised passengers (min) | 0.00 [0.00, 0.01] |
| Largest extra wait of any non-prioritised passenger, worst day (min) | 100.3 |
| Share of non-prioritised passengers delayed by more than 5 min | 0.22% |
| Most overtakes suffered by one ticket, worst day (bound K = 15) | 15 |
| Calls where the cap blocked a priority call, per day | 2.3 |
| Calls where the overtake guard took precedence (a ticket had reached K overtakes), per day | 2.3 |

## 4. Cost for passengers not prioritised by `priority-v0` (compared with `virtual-fifo`)

Extra wait = time to screening with the candidate minus time to screening with the reference, for the same passenger.

| Metric | Value [95% CI] |
|---|---:|
| Passengers prioritised per day | 14.2 (P5-P95 0.0-41.0) (0.23% of calls) |
| Mean extra wait of non-prioritised passengers (min) | 0.01 [0.01, 0.02] |
| P90 extra wait of non-prioritised passengers (min) | 0.02 [0.01, 0.03] |
| Largest extra wait of any non-prioritised passenger, worst day (min) | 11.1 |
| Share of non-prioritised passengers delayed by more than 5 min | 0.00% |
| Most overtakes suffered by one ticket, worst day (bound K = 15) | 15 |
| Calls where the cap blocked a priority call, per day | 2.3 |
| Calls where the overtake guard took precedence (a ticket had reached K overtakes), per day | 2.3 |

## 5. Call mechanics

Virtual queues only. A *second call* is made when the passenger has not presented within the call timeout; a *no-show* (missed call) is a ticket not validated after the second timeout. A no-show who rescans within the reactivation window is *reactivated*; later, the passenger needs a *new ticket*. *Idle lane time* counts open lanes with nobody to screen while passengers were waiting for or answering a call, as a share of the staffed lane time. Means per day.

| Policy | Calls | Second calls (share of calls) | No-shows (missed-call rate) | Reactivations | New tickets | Idle lane time (min, share) |
|---|---:|---:|---:|---:|---:|---:|
| `virtual-fifo` | 6142 | 42.4 (0.69%) | 15.5 (0.25%) | 14.8 | 0.7 | 0.0 (0.00%) |
| `priority-v0` | 6142 | 41.7 (0.68%) | 15.4 (0.25%) | 14.7 | 0.7 | 0.0 (0.00%) |

## 6. Checkpoint operations

Means per day; "longest" is the largest value over all simulated days.

| Policy | Staffed lane-hours | Lane utilisation | Tickets waiting for a call: mean (longest) | People standing in a queue: mean (longest) | URGENT on arrival | CRITICAL on arrival |
|---|---:|---:|---:|---:|---:|---:|
| `fifo` | 112.8 | 60.4% | 6.7 (186) | 6.7 (186) | 16.4 | 15.5 |
| `virtual-fifo` | 112.8 | 60.4% | 3.2 (160) | 2.4 (27) | 13.0 | 38.6 |
| `priority-v0` | 112.8 | 60.4% | 3.2 (156) | 2.4 (27) | 13.0 | 38.6 |

## 7. Method

- Each seed is one simulated day of the same design day (same flights), with different passengers.
- All policies are run on exactly the same passengers (common random numbers), so each comparison is paired passenger by passenger: a flight is *saved* when the passenger misses it with the reference and catches it with the candidate, and *lost* in the opposite case.
- The status quo is a physical FIFO queue. GateFlow policies run a virtual queue: tickets are called so as to keep the free lanes plus a call-ahead buffer supplied; each passenger presents after their own response time (later when they miss the call), validates the ticket at the access point and queues briefly at the lanes. Comparing `virtual-fifo` with the status quo isolates the cost or benefit of the call mechanics; comparing a priority policy with `virtual-fifo` isolates the prioritisation.
- A passenger misses the flight when they reach the gate after boarding closes (ground truth).
- Confidence intervals: percentile bootstrap of the mean over days (2000 resamples, seed 20261121). Quantiles: linear interpolation between order statistics (Hyndman-Fan type 7).
- Risk classes are computed on arrival with the same parameters for every policy. URGENT means "would miss the flight if served in FIFO order, but can still make it if selected now"; CRITICAL means "cannot make it even if selected now": such passengers are escalated to staff and never boosted automatically.

## 8. Policies

### Physical FIFO queue (status quo, policy A): `fifo` 1.1.0

Selection: `fifo`. Queue: `physical` (physical queue: passengers stand in line and step forward when a lane is free).

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

### GateFlow virtual queue with constrained EDF priority v0 (policy B): `priority-v0` 0.2.0

Selection: `constrained-edf`. Queue: `virtual` (GateFlow virtual queue: passengers wait anywhere, are called on displays and validate their ticket at the access point).

| Parameter | Value |
|---|---|
| selection.capWindowCalls | 10 |
| selection.capMaxPriorityCalls | 3 |
| selection.maxOvertakes | 15 |
| selection.attentionThresholdMs | 15.0 min |
| selection.safetyBufferMs | 5.0 min |
| selection.allowRuleBasedDeadline | true |
| selection.eligibleSegments | DEPARTING; TRANSFER |
| queue.callAheadSeconds | 180 s |
| queue.responseEstimateSeconds | 90 s |
| queue.prepareWindowSize | 10 |
| queue.callTimeoutMs | 3.0 min |
| queue.recallTimeoutMs | 2.0 min |
| queue.reactivationWindowMs | 15.0 min |
| queue.maxReactivations | 1 |
| queue.reactivationPosition | ORIGINAL |

All parameter values are initial hypotheses to be calibrated and approved, not measured optima.

## 9. Assumptions

Every model parameter, with its source. SYNTHETIC values are illustrative assumptions.

| Parameter | Value | Source | Note |
|---|---|---|---|
| checkpoint.laneSchedule | from 00:00, lanes 6 | SYNTHETIC | Six lanes open all day, as in slice S1, so that results remain comparable. |
| checkpoint.serviceTimeMeanSeconds | 40 | SYNTHETIC | About 90 passengers per hour per lane. |
| checkpoint.serviceTimeCv | 0.6 | SYNTHETIC |  |
| schedule.departuresPerHour | hour 6, departures 5; hour 7, departures 4; hour 8, departures 3; hour 9, departures 2; hour 10, departures 2; hour 11, departures 2; hour 12, departures 2; hour 13, departures 2; hour 14, departures 2; hour 15, departures 2; hour 16, departures 2; hour 17, departures 3; hour 18, departures 3; hour 19, departures 2; hour 20, departures 2; hour 21, departures 1 | SYNTHETIC | Design day with a morning bank of departures, typical of low-cost bases. |
| schedule.aircraftMix | category regional-jet, seats 100, share 0.15; category narrow-body, seats 180, share 0.6; category narrow-body-large, seats 220, share 0.2; category wide-body, seats 300, share 0.05 | SYNTHETIC |  |
| schedule.gateZones | id A, walkMinutes 4, share 0.4; id B, walkMinutes 8, share 0.4; id C, walkMinutes 14, share 0.2 | SYNTHETIC | Nominal walking time from the checkpoint exit to the gate zone. |
| passengers.loadFactor | min 0.6, mode 0.85, max 0.98 | SYNTHETIC | Triangular distribution, drawn per flight and replication. |
| passengers.transferShare | 0.05 | SYNTHETIC | Connecting passengers who cross this checkpoint. Not an official statistic. |
| passengers.showUp.departing | minMinutesBeforeStd 25, medianExtraMinutes 70, sigma 0.55, maxMinutesBeforeStd 240 | SYNTHETIC | Arrival at the checkpoint = STD minus (25 min + log-normal with median 70 min). |
| passengers.showUp.transfer | minMinutesBeforeStd 24, medianExtraMinutes 25, sigma 0.5, maxMinutesBeforeStd 180 | SYNTHETIC | Connecting passengers arrive later, after their inbound flight. |
| passengers.walkSpeedSigma | 0.2 | SYNTHETIC | Individual walking time = nominal zone time x log-normal(median 1, sigma). |
| passengers.callResponse | medianSeconds 75, sigma 0.5, absentProbability 0.04, absentExtraMedianMinutes 4, absentExtraSigma 0.8 | SYNTHETIC | Virtual queue only. Time from a call to presenting at the access point is log-normal with a median of 75 s (passengers wait near the checkpoint); 4% do not notice the first call and present later by a log-normal extra delay with a median of 4 minutes. Hypotheses to measure in a pilot. |
| operations.boardingCloseMinutesBeforeStd | 20 | SYNTHETIC | Boarding closes 20 minutes before the scheduled departure, for every flight. |
| operations.deadlineKnowledge | RULE | SYNTHETIC | The system applies the closing rule to the schedule; in this slice it matches the ground truth exactly. |

## 10. Limitations of this model version

- Single checkpoint. Lanes follow a planned schedule: no unplanned outages and no lanes opened in reaction to the queue.
- Every passenger uses the virtual queue when one is simulated: no opt-outs, no passengers without a phone or a view of the displays.
- Response times and absences are drawn per passenger from assumed distributions. A second call does not make an absent passenger come sooner, the prepare window does not shorten response times, and a passenger who has been at the access point once answers later calls at once.
- The access point never becomes a bottleneck, and the walk from the access point to the lanes is part of the response time.
- The system's deadline equals the ground truth (boarding close from a fixed rule): no flight delays, gate changes or stale data.
- Passengers never abandon the queue, even after their flight has closed.
- No groups, families or assisted passengers: everyone is served individually.
- The status quo is a physical FIFO queue without staff intervention. Today's manual handling of urgent passengers is not modelled, so the benefit of prioritisation is likely overstated.
- Tickets are issued on arrival with no kiosk or scanning delay.
- The engine estimates processing time as the mean screening time, walking time as the nominal time of the gate zone, and the time from call to screening as the larger of the response estimate and the call-ahead time.

## 11. Reproducibility

| Item | Value |
|---|---|
| Scenario hash | `sha256:4abc771f889b910061a345769720c090fcc26a5dbfca482fd5e95fc41374caa5` |
| Seeds | 1-200 (200) |
| Source revision | `a921b0864126ccfb3deac31c97bd15512a7b70a2` |
| Versions | engine 0.2.0, queue core 0.1.0, model 0.2.0, kernel 0.1.0, population generator 0.2.0, scenario schema 2 |
| Generated by | gateflow-sim 0.2.0 |

Command:

```bash
gateflow-sim run --scenario scenarios/single-checkpoint-moderate.yaml --seeds 1-200 --policies fifo,virtual-fifo,priority-v0 --baseline fifo --compare virtual-fifo:fifo,priority-v0:fifo,priority-v0:virtual-fifo --bootstrap-resamples 2000
```
