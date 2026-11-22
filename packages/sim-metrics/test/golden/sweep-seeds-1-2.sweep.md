# GateFlow sensitivity sweep: Golden sweep

> **SIMULATED RESULTS ON SYNTHETIC OR HYPOTHETICAL DATA. These numbers are model outputs, not measurements, and must not be presented as evidence of operational performance.**

Two curves on two simulated days, to lock the sweep outputs.

Base scenario `single-checkpoint-demo` (data: SYNTHETIC). Every point is 2 simulated days (seeds 1-2); the parameters vary for `priority-v3`. Each table varies one parameter and keeps everything else at the base, marked **(base)**. Means per day; brackets give the 95% confidence interval of the mean (bootstrap over days). "Others delayed > 5 min" is the share of non-prioritised passengers who wait more than 5 minutes longer than with the same queue in FIFO order; "most overtakes" is the largest number of people who overtook one ticket, on the worst day.

## 1. Overtake bound K

| Overtake bound K (people) | Missed: `fifo` | Missed: `fifo-manual` | Missed: `virtual-fifo` | Missed: `priority-v3` | Net saved vs `fifo-manual` | Net saved vs `virtual-fifo` | Others delayed > 5 min | Most overtakes |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| 15 | 56.5 | 14.0 | 61.0 | 13.0 | 1.0 [-6.0, 8.0] | 48.0 [44.0, 52.0] | 0.00% | 15 |
| **30 (base)** | 56.5 | 14.0 | 61.0 | 5.5 | 8.5 [3.0, 14.0] | 55.5 [53.0, 58.0] | 0.00% | 30 |

## 2. Lanes open

| Lanes added to every period of the schedule | Missed: `fifo` | Missed: `fifo-manual` | Missed: `virtual-fifo` | Missed: `priority-v3` | Net saved vs `fifo-manual` | Net saved vs `virtual-fifo` | Others delayed > 5 min | Most overtakes |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| **0 (base)** | 56.5 | 14.0 | 61.0 | 5.5 | 8.5 [3.0, 14.0] | 55.5 [53.0, 58.0] | 0.00% | 30 |
| +1 | 6.5 | 6.0 | 8.0 | 3.5 | 2.5 [0.0, 5.0] | 4.5 [1.0, 8.0] | 0.02% | 7 |

## 3. Method

- One-at-a-time sensitivity: each curve varies one parameter around the base, all else equal.
- At every point all policies run on the same passengers (common random numbers), and the same seeds are used at every point, so the differences between points are not noise of different days.
- Points that only change a policy share their simulated days, and the policies they do not change are simulated once.
- Policy parameters change the candidate; the prepare window changes every virtual queue, so that the comparison with the same queue in FIFO order stays valid. Scenario parameters change the simulated days for every policy.
- Confidence intervals: percentile bootstrap of the mean over days (200 resamples, seed 20261121). Quantiles: linear interpolation between order statistics (Hyndman-Fan type 7).

## 4. Policies at the base

- Physical FIFO queue (status quo, policy A): `fifo` 1.1.0
- Physical FIFO queue with staff calling closing flights (status quo with manual handling, policy A'): `fifo-manual` 0.1.0
- GateFlow virtual queue in FIFO order: `virtual-fifo` 0.1.0
- GateFlow virtual queue with constrained EDF priority v3: fast track, stale-data rule and hysteresis (policy B): `priority-v3` 0.2.0

Full parameters are in the `manifest` of `sweep.json`.

## 5. Data sources and licences

Where the data of this scenario comes from, and the terms under which it may be used.

| Source | Kind | Provider | Licence or terms of use | Retrieved | Used for |
|---|---|---|---|---|---|
| Synthetic assumptions of this scenario (`gateflow-synthetic`) | SYNTHETIC | GateFlow | Created for GateFlow; contains no third-party data. | - | - |

Design day: 40 departures generated from the hourly profile of the scenario (`schedule.departuresPerHour`).

## 6. Assumptions of the base scenario

| Parameter | Source | Note |
|---|---|---|
| checkpoint.laneSchedule | SYNTHETIC | Six lanes open all day, as in slice S1, so that results remain comparable. |
| checkpoint.serviceTimeMeanSeconds | SYNTHETIC | About 90 passengers per hour per lane. |
| checkpoint.serviceTimeCv | SYNTHETIC |  |
| schedule.departuresPerHour | SYNTHETIC | Design day with a morning bank of departures, typical of low-cost bases. |
| schedule.aircraftMix | SYNTHETIC |  |
| schedule.gateZones | SYNTHETIC | Nominal walking time from the checkpoint exit to the gate zone. |
| passengers.loadFactor | SYNTHETIC | Triangular distribution, drawn per flight and replication. |
| passengers.transferShare | SYNTHETIC | Connecting passengers who cross this checkpoint. Not an official statistic. |
| passengers.showUp.departing | SYNTHETIC | Arrival at the checkpoint = STD minus (25 min + log-normal with median 70 min). |
| passengers.showUp.transfer | SYNTHETIC | Connecting passengers arrive later, after their inbound flight. |
| passengers.walkSpeedSigma | SYNTHETIC | Individual walking time = nominal zone time x log-normal(median 1, sigma). |
| passengers.callResponse | SYNTHETIC | Virtual queue only. Time from a call to presenting at the access point is log-normal with a median of 75 s (passengers wait near the checkpoint); 4% do not notice the first call and present later by a log-normal extra delay with a median of 4 minutes. Hypotheses to measure in a pilot. |
| passengers.groups | SYNTHETIC | Shares over parties: about 40% of passengers travel with others. A party holds one ticket, is called together and is screened on one lane, one person after the other. |
| passengers.assistedShare | SYNTHETIC | Parties taking the assisted path (PRM and similar): staff take them to the next free lane, ahead of the queue, under every policy. The reason is never recorded. |
| passengers.strategicLateArrival | SYNTHETIC | Nobody arrives late on purpose in this scenario. |
| operations.boardingCloseMinutesBeforeStd | SYNTHETIC | Boarding closes 20 minutes before the scheduled departure, for every flight. |
| operations.deadlineKnowledge | SYNTHETIC | The system applies the closing rule to the schedule; without disruptions it matches the ground truth exactly. |
| disruptions.flightDelays | SYNTHETIC | No delays in this scenario (see single-checkpoint-disrupted). |
| disruptions.gateChanges | SYNTHETIC | No gate changes in this scenario. |
| disruptions.laneOutages | SYNTHETIC | No unplanned lane outages in this scenario. |
| disruptions.feedOutages | SYNTHETIC | The flight feed never goes down in this scenario. |

## 7. Limitations of this model version

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

## 8. Reproducibility

| Item | Value |
|---|---|
| Sweep specification hash | `sha256:test` |
| Base scenario hash | `sha256:25ef984b088cdc721b971fbab531aff7beddbd636f43a9dee5c00297a8fadceb` |
| Seeds | 1-2 (2) |
| Distinct simulated days | 4 |
| Source revision | `test` |
| Versions | engine 0.5.0, queue core 0.9.0, model 0.6.0, kernel 0.1.0, population generator 0.6.0, scenario schema 5 |
| Generated by | test 0.0.0 |

Command:

```bash
gateflow-sim sweep --spec sweeps/golden-sweep.yaml --seeds 1-2 --bootstrap-resamples 200
```
