# GateFlow simulation report: Single departure checkpoint, synthetic day with a moderate morning peak

> **SIMULATED RESULTS ON SYNTHETIC OR HYPOTHETICAL DATA. These numbers are model outputs, not measurements, and must not be presented as evidence of operational performance.**

Scenario `single-checkpoint-moderate` (data: SYNTHETIC), 200 simulated days, about 4635 passengers per day. Status quo (baseline): `fifo`.

## 1. Headline

Means per simulated day. P5-P95 is the spread across days; brackets give the 95% confidence interval of the mean (bootstrap over days).

| Policy | Missed flights per day | of which connecting | Missed per 1,000 passengers |
|---|---:|---:|---:|
| Physical FIFO queue (status quo, policy A): `fifo` 1.1.0 | 14.3 (P5-P95 3.0-29.0) | 10.3 | 2.32 |
| Physical FIFO queue with staff calling closing flights (status quo with manual handling, policy A'): `fifo-manual` 0.1.0 | 7.2 (P5-P95 2.0-14.0) | 5.1 | 1.17 |
| GateFlow virtual queue in FIFO order: `virtual-fifo` 0.1.0 | 14.8 (P5-P95 4.0-30.0) | 10.5 | 2.40 |
| GateFlow virtual queue with constrained EDF priority v1 (policy B): `priority-v1` 0.1.0 | 9.4 (P5-P95 3.0-16.1) | 7.1 | 1.54 |

| `fifo-manual` compared with `fifo` | Mean per day [95% CI] |
|---|---:|
| Flights saved: missed with `fifo`, caught with `fifo-manual` | 7.1 [6.1, 8.2] |
| Flights lost: caught with `fifo`, missed with `fifo-manual` | 0.0 [0.0, 0.1] |
| **Net flights saved** | **7.1 [6.1, 8.2]** |
| Days with a net gain / with a net loss | 91.5% / 0.0% |
| At-risk passengers reaching the gate in time (34.5 per day classified URGENT on arrival under `fifo`) | 66.8% with `fifo`, 86.8% with `fifo-manual` |
| Change in mean time from arrival to screening (min) | 0.00 [0.00, 0.00] |
| Change in mean time standing in a queue (min) | 0.00 [0.00, 0.00] |

| `virtual-fifo` compared with `fifo` | Mean per day [95% CI] |
|---|---:|
| Flights saved: missed with `fifo`, caught with `virtual-fifo` | 0.7 [0.5, 0.8] |
| Flights lost: caught with `fifo`, missed with `virtual-fifo` | 1.2 [1.0, 1.4] |
| **Net flights saved** | **-0.5 [-0.8, -0.2]** |
| Days with a net gain / with a net loss | 18.0% / 43.0% |
| At-risk passengers reaching the gate in time (34.5 per day classified URGENT on arrival under `fifo`) | 66.8% with `fifo`, 66.4% with `virtual-fifo` |
| Change in mean time from arrival to screening (min) | 0.00 [0.00, 0.00] |
| Change in mean time standing in a queue (min) | -0.83 [-0.91, -0.75] |

| `priority-v1` compared with `fifo` | Mean per day [95% CI] |
|---|---:|
| Flights saved: missed with `fifo`, caught with `priority-v1` | 5.5 [4.6, 6.5] |
| Flights lost: caught with `fifo`, missed with `priority-v1` | 0.7 [0.5, 0.8] |
| **Net flights saved** | **4.8 [3.9, 5.8]** |
| Days with a net gain / with a net loss | 66.0% / 10.5% |
| At-risk passengers reaching the gate in time (34.5 per day classified URGENT on arrival under `fifo`) | 66.8% with `fifo`, 81.8% with `priority-v1` |
| Change in mean time from arrival to screening (min) | 0.00 [0.00, 0.00] |
| Change in mean time standing in a queue (min) | -0.83 [-0.91, -0.76] |

| `priority-v1` compared with `virtual-fifo` | Mean per day [95% CI] |
|---|---:|
| Flights saved: missed with `virtual-fifo`, caught with `priority-v1` | 5.4 [4.5, 6.4] |
| Flights lost: caught with `virtual-fifo`, missed with `priority-v1` | 0.1 [0.0, 0.2] |
| **Net flights saved** | **5.3 [4.4, 6.4]** |
| Days with a net gain / with a net loss | 70.5% / 1.5% |
| At-risk passengers reaching the gate in time (44.3 per day classified URGENT on arrival under `virtual-fifo`) | 82.7% with `virtual-fifo`, 94.6% with `priority-v1` |
| Change in mean time from arrival to screening (min) | 0.00 [0.00, 0.00] |
| Change in mean time standing in a queue (min) | 0.00 [0.00, 0.00] |

| `priority-v1` compared with `fifo-manual` | Mean per day [95% CI] |
|---|---:|
| Flights saved: missed with `fifo-manual`, caught with `priority-v1` | 1.2 [0.9, 1.4] |
| Flights lost: caught with `fifo-manual`, missed with `priority-v1` | 3.4 [3.1, 3.8] |
| **Net flights saved** | **-2.3 [-2.7, -1.9]** |
| Days with a net gain / with a net loss | 10.5% / 73.5% |
| At-risk passengers reaching the gate in time (34.5 per day classified URGENT on arrival under `fifo-manual`) | 86.8% with `fifo-manual`, 81.8% with `priority-v1` |
| Change in mean time from arrival to screening (min) | 0.00 [0.00, 0.00] |
| Change in mean time standing in a queue (min) | -0.83 [-0.91, -0.75] |

## 2. Waiting times

*Time to screening*: minutes from arrival at the checkpoint (when the ticket is issued) to the start of screening. *Standing*: minutes spent standing in a queue: the whole wait in a physical queue; in a virtual queue only the wait at the lanes after validating the ticket. Each column is the mean over days of the daily statistic; "longest" is the longest single value over all simulated days.

| Policy | Time to screening: mean | P50 | P90 | P99 | Longest | Standing: mean | P90 | Longest |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| `fifo` | 1.3 | 0.0 | 6.1 | 9.5 | 22.9 | 1.3 | 6.1 | 22.9 |
| `fifo-manual` | 1.3 | 0.0 | 6.1 | 9.8 | 25.4 | 1.3 | 6.1 | 25.4 |
| `virtual-fifo` | 1.3 | 0.0 | 5.9 | 9.8 | 108.7 | 0.5 | 1.8 | 4.8 |
| `priority-v1` | 1.3 | 0.0 | 5.9 | 10.0 | 108.4 | 0.5 | 1.8 | 4.8 |

## 3. Cost for passengers not prioritised by `fifo-manual` (compared with `fifo`)

Extra wait = time to screening with the candidate minus time to screening with the reference, for the same passenger.

| Metric | Value [95% CI] |
|---|---:|
| Passengers prioritised per day | 48.9 (P5-P95 21.9-88.0) (0.80% of tickets called) |
| Mean extra wait of non-prioritised passengers (min) | 0.03 [0.02, 0.03] |
| P90 extra wait of non-prioritised passengers (min) | 0.05 [0.04, 0.06] |
| Largest extra wait of any non-prioritised passenger, worst day (min) | 4.9 |
| Share of non-prioritised passengers delayed by more than 5 min | 0.00% |
| Most people who overtook one ticket, worst day (no bound for staff flight calls) | 42 |

## 4. Cost for passengers not prioritised by `priority-v1` (compared with `fifo`)

Extra wait = time to screening with the candidate minus time to screening with the reference, for the same passenger.

| Metric | Value [95% CI] |
|---|---:|
| Passengers prioritised per day | 18.8 (P5-P95 0.0-47.3) (0.30% of tickets called) |
| Mean extra wait of non-prioritised passengers (min) | 0.02 [0.01, 0.02] |
| P90 extra wait of non-prioritised passengers (min) | 0.01 [0.00, 0.01] |
| Largest extra wait of any non-prioritised passenger, worst day (min) | 100.0 |
| Share of non-prioritised passengers delayed by more than 5 min | 0.24% |
| Most people who overtook one ticket, worst day (bound K = 30) | 30 |
| Calls where the cap blocked a priority call, per day | 0.1 |
| Calls where the overtake guard took precedence (a ticket had reached K overtakes), per day | 0.1 |

## 5. Cost for passengers not prioritised by `priority-v1` (compared with `virtual-fifo`)

Extra wait = time to screening with the candidate minus time to screening with the reference, for the same passenger.

| Metric | Value [95% CI] |
|---|---:|
| Passengers prioritised per day | 18.8 (P5-P95 0.0-47.3) (0.30% of tickets called) |
| Mean extra wait of non-prioritised passengers (min) | 0.02 [0.01, 0.02] |
| P90 extra wait of non-prioritised passengers (min) | 0.02 [0.02, 0.03] |
| Largest extra wait of any non-prioritised passenger, worst day (min) | 12.7 |
| Share of non-prioritised passengers delayed by more than 5 min | 0.00% |
| Most people who overtook one ticket, worst day (bound K = 30) | 30 |
| Calls where the cap blocked a priority call, per day | 0.1 |
| Calls where the overtake guard took precedence (a ticket had reached K overtakes), per day | 0.1 |

## 6. Cost for passengers not prioritised by `priority-v1` (compared with `fifo-manual`)

Extra wait = time to screening with the candidate minus time to screening with the reference, for the same passenger.

| Metric | Value [95% CI] |
|---|---:|
| Passengers prioritised per day | 18.8 (P5-P95 0.0-47.3) (0.30% of tickets called) |
| Mean extra wait of non-prioritised passengers (min) | 0.00 [0.00, 0.00] |
| P90 extra wait of non-prioritised passengers (min) | 0.00 [0.00, 0.00] |
| Largest extra wait of any non-prioritised passenger, worst day (min) | 99.7 |
| Share of non-prioritised passengers delayed by more than 5 min | 0.29% |
| Most people who overtook one ticket, worst day (bound K = 30) | 30 |
| Calls where the cap blocked a priority call, per day | 0.1 |
| Calls where the overtake guard took precedence (a ticket had reached K overtakes), per day | 0.1 |

## 7. Call mechanics

Virtual queues only. A *second call* is made when the passenger has not presented within the call timeout; a *no-show* (missed call) is a ticket not validated after the second timeout. A no-show who rescans within the reactivation window is *reactivated*; later, the passenger needs a *new ticket*. *Idle lane time* counts open lanes with nobody to screen while passengers were waiting for or answering a call, as a share of the staffed lane time. Means per day.

| Policy | Calls | Second calls (share of calls) | No-shows (missed-call rate) | Reactivations | New tickets | Idle lane time (min, share) |
|---|---:|---:|---:|---:|---:|---:|
| `virtual-fifo` | 4614 | 33.5 (0.72%) | 12.3 (0.27%) | 11.7 | 0.6 | 0.0 (0.00%) |
| `priority-v1` | 4614 | 32.8 (0.71%) | 12.2 (0.26%) | 11.7 | 0.6 | 0.0 (0.00%) |

## 8. Groups, assisted passengers and late arrivals

Means per day. A group (two people or more) holds one ticket and counts as its people in every other table, in the priority cap and in the overtake bound. Assisted passengers are taken to the next free lane under every policy.

| Policy | Groups (people in groups) | Groups prioritised | Assisted passengers: people, mean time to screening (min), missed | Late on purpose: people, prioritised, missed |
|---|---:|---:|---:|---:|
| `fifo` | 1013.7 (2506.0) | 0.0 | 42.7, 0.06, 0.0 | none in this scenario |
| `fifo-manual` | 1013.7 (2506.0) | 8.1 | 42.7, 0.06, 0.0 | none in this scenario |
| `virtual-fifo` | 1013.7 (2506.0) | 0.0 | 42.7, 0.06, 0.0 | none in this scenario |
| `priority-v1` | 1013.7 (2506.0) | 3.3 | 42.7, 0.06, 0.0 | none in this scenario |

## 9. Checkpoint operations

Means per day; "longest" is the largest value over all simulated days.

| Policy | Staffed lane-hours | Lane utilisation | Tickets waiting for a call: mean (longest) | People standing in a queue: mean (longest) | URGENT on arrival | CRITICAL on arrival |
|---|---:|---:|---:|---:|---:|---:|
| `fifo` | 112.7 | 60.4% | 7.2 (208) | 7.2 (208) | 34.5 | 2.6 |
| `fifo-manual` | 112.7 | 60.4% | 7.2 (203) | 7.2 (203) | 34.5 | 2.6 |
| `virtual-fifo` | 112.7 | 60.4% | 3.4 (180) | 2.6 (33) | 44.3 | 10.5 |
| `priority-v1` | 112.7 | 60.4% | 3.4 (172) | 2.6 (33) | 44.3 | 10.5 |

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

## 12. Assumptions

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
| passengers.groups | partySizes size 1, share 0.78; size 2, share 0.15; size 3, share 0.04; size 4, share 0.025; size 5, share 0.005 | SYNTHETIC | Shares over parties: about 40% of passengers travel with others. A party holds one ticket, is called together and is screened on one lane, one person after the other. |
| passengers.assistedShare | 0.007 | SYNTHETIC | Parties taking the assisted path (PRM and similar): staff take them to the next free lane, ahead of the queue, under every policy. The reason is never recorded. |
| passengers.strategicLateArrival | share 0, minMinutesBeforeStd 25, maxMinutesBeforeStd 35 | SYNTHETIC | Nobody arrives late on purpose in this scenario. |
| operations.boardingCloseMinutesBeforeStd | 20 | SYNTHETIC | Boarding closes 20 minutes before the scheduled departure, for every flight. |
| operations.deadlineKnowledge | RULE | SYNTHETIC | The system applies the closing rule to the schedule; in this slice it matches the ground truth exactly. |

## 13. Limitations of this model version

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

## 14. Reproducibility

| Item | Value |
|---|---|
| Scenario hash | `sha256:09a062c4e5c0b6bebd8c2ad6a9f0bfe0df6f938541804979b4b263ad9b7c32f0` |
| Seeds | 1-200 (200) |
| Source revision | `d018bcd8d4ab461ddc31303096c5e546cd034efe` |
| Versions | engine 0.3.0, queue core 0.2.0, model 0.3.0, kernel 0.1.0, population generator 0.3.0, scenario schema 3 |
| Generated by | gateflow-sim 0.3.0 |

Command:

```bash
gateflow-sim run --scenario scenarios/single-checkpoint-moderate.yaml --seeds 1-200 --policies fifo,fifo-manual,virtual-fifo,priority-v1 --baseline fifo --compare fifo-manual:fifo,virtual-fifo:fifo,priority-v1:fifo,priority-v1:virtual-fifo,priority-v1:fifo-manual --bootstrap-resamples 2000
```
