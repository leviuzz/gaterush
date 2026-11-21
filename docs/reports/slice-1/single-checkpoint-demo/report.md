# GateFlow simulation report: Single departure checkpoint, synthetic day with a congested morning peak

> **SIMULATED RESULTS ON SYNTHETIC OR HYPOTHETICAL DATA. These numbers are model outputs, not measurements, and must not be presented as evidence of operational performance.**

Scenario `single-checkpoint-demo` (data: SYNTHETIC), 200 simulated days, about 6207 passengers per day. Baseline policy: `fifo`.

## 1. Headline

Means per simulated day. P5-P95 is the spread across days; brackets give the 95% confidence interval of the mean (bootstrap over days).

| Policy | Missed flights per day | of which connecting | Missed per 1,000 passengers |
|---|---:|---:|---:|
| FIFO baseline (policy A): `fifo` 1.0.0 | 48.7 (P5-P95 14.0-101.0) | 26.8 | 7.83 |
| Constrained EDF priority v0 (policy B): `priority-v0` 0.1.0 | 23.6 (P5-P95 6.0-59.0) | 13.2 | 3.79 |

| `priority-v0` compared with `fifo` | Mean per day [95% CI] |
|---|---:|
| Flights saved: missed with `fifo`, caught with `priority-v0` | 25.6 [23.9, 27.2] |
| Flights lost: caught with `fifo`, missed with `priority-v0` | 0.5 [0.3, 0.6] |
| **Net flights saved** | **25.1 [23.6, 26.7]** |
| Days with a net gain / with a net loss | 100.0% / 0.0% |
| At-risk passengers reaching the gate in time (74.5 per day classified URGENT on arrival under `fifo`) | 46.9% with `fifo`, 80.7% with `priority-v0` |

## 2. Waiting times

Minutes from ticket to call. Each column is the mean over days of the daily statistic; the last column is the longest single wait over all simulated days.

| Policy | Mean | P50 | P90 | P99 | Longest |
|---|---:|---:|---:|---:|---:|
| `fifo` | 3.0 | 0.0 | 14.2 | 18.6 | 29.3 |
| `priority-v0` | 3.0 | 0.0 | 14.4 | 19.7 | 30.8 |

## 3. Cost for passengers not prioritised by `priority-v0`

Extra wait = wait with the candidate minus wait with the baseline, for the same passenger.

| Metric | Value [95% CI] |
|---|---:|
| Passengers prioritised per day | 70.8 (P5-P95 27.9-105.2) (1.14% of calls) |
| Mean extra wait of non-prioritised passengers (min) | 0.14 [0.13, 0.15] |
| P90 extra wait of non-prioritised passengers (min) | 0.68 [0.62, 0.74] |
| Largest extra wait of any non-prioritised passenger, worst day (min) | 3.1 |
| Share of non-prioritised passengers delayed by more than 5 min | 0.00% |
| Most overtakes suffered by one passenger, worst day (bound K = 15) | 15 |
| Calls where the cap blocked a priority call, per day | 17.4 |
| Calls where the overtake guard took precedence (a passenger had reached K overtakes), per day | 229.8 |

## 4. Checkpoint operations

| Policy | Lane utilisation | Mean queue (people) | Longest queue | URGENT on arrival per day | CRITICAL on arrival per day |
|---|---:|---:|---:|---:|---:|
| `fifo` | 61.3% | 16.4 | 268 | 74.5 | 16.4 |
| `priority-v0` | 61.3% | 16.4 | 269 | 74.3 | 16.4 |

## 5. Method

- Each seed is one simulated day of the same design day (same flights), with different passengers.
- All policies are run on exactly the same passengers (common random numbers), so the comparison is paired passenger by passenger: a flight is *saved* when the passenger misses it with the baseline and catches it with the candidate, and *lost* in the opposite case.
- A passenger misses the flight when they reach the gate after boarding closes (ground truth).
- Confidence intervals: percentile bootstrap of the mean over days (2000 resamples, seed 20261121). Quantiles: linear interpolation between order statistics (Hyndman-Fan type 7).
- Risk classes are computed on arrival with the same parameters for every policy. URGENT means "would miss the flight if served in FIFO order, but can still make it if called now"; CRITICAL means "cannot make it even if called now": such passengers are escalated to staff and never boosted automatically.

## 6. Policies

### FIFO baseline (policy A): `fifo` 1.0.0

Strategy: `fifo`.

### Constrained EDF priority v0 (policy B): `priority-v0` 0.1.0

Strategy: `constrained-edf`.

| Parameter | Value |
|---|---|
| capWindowCalls | 10 |
| capMaxPriorityCalls | 3 |
| maxOvertakes | 15 |
| attentionThresholdMs | 15.0 min |
| safetyBufferMs | 5.0 min |
| allowRuleBasedDeadline | true |
| eligibleSegments | DEPARTING; TRANSFER |

All parameter values are initial hypotheses to be calibrated and approved, not measured optima.

## 7. Assumptions

Every model parameter, with its source. SYNTHETIC values are illustrative assumptions.

| Parameter | Value | Source | Note |
|---|---|---|---|
| checkpoint.lanes | 6 | SYNTHETIC | All lanes open all day; planned lane schedules arrive in a later slice. |
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
| operations.boardingCloseMinutesBeforeStd | 20 | SYNTHETIC | Boarding closes 20 minutes before the scheduled departure, for every flight. |
| operations.deadlineKnowledge | RULE | SYNTHETIC | The system applies the closing rule to the schedule; in this slice it matches the ground truth exactly. |

## 8. Limitations of this model version

- Single checkpoint with all lanes open all day: no lane schedules, outages or extra lanes.
- Calls are answered instantly: no call latency, no no-shows and no recalls.
- The system's deadline equals the ground truth (boarding close from a fixed rule): no flight delays, gate changes or stale data.
- Passengers never abandon the queue, even after their flight has closed.
- No groups, families or assisted passengers: everyone is served individually.
- The baseline is pure FIFO. Today's manual handling of urgent passengers is not modelled, so the benefit of prioritisation is likely overstated.
- Tickets are issued on arrival with no kiosk or scanning delay.
- The engine estimates processing time as the mean screening time and walking time as the nominal time of the gate zone.

## 9. Reproducibility

| Item | Value |
|---|---|
| Scenario hash | `sha256:482237d7d0d354dfac212a321a4edf766e8ee9c2ca9bebf8740a737fba15839b` |
| Seeds | 1-200 (200) |
| Source revision | `9a1894250f7c7a7eaade0a86798d3fe10a2a9f68` |
| Versions | engine 0.1.0, model 0.1.0, kernel 0.1.0, population generator 0.1.0, scenario schema 1 |
| Generated by | gateflow-sim 0.1.0 |

Command:

```bash
gateflow-sim run --scenario scenarios/single-checkpoint-demo.yaml --seeds 1-200 --policies fifo,priority-v0 --baseline fifo --bootstrap-resamples 2000
```
