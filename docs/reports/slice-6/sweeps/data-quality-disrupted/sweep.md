# GateFlow sensitivity sweep: Priority v3 on the disrupted day, as the flight feed and the disruptions vary

> **SIMULATED RESULTS ON SYNTHETIC OR HYPOTHETICAL DATA. These numbers are model outputs, not measurements, and must not be presented as evidence of operational performance.**

What does the stale-data rule cost, and what does it protect, as the flight feed becomes less reliable? Each curve varies one parameter around the base of the disrupted scenario and of priority v3 (maximum data age 30 minutes, hysteresis 3 minutes); priority v2 trusts every deadline whatever its age.

Base scenario `single-checkpoint-disrupted` (data: SYNTHETIC). Every point is 200 simulated days (seeds 1-200); the parameters vary for `priority-v3`. Each table varies one parameter and keeps everything else at the base, marked **(base)**. Means per day; brackets give the 95% confidence interval of the mean (bootstrap over days). "Others delayed > 5 min" is the share of non-prioritised passengers who wait more than 5 minutes longer than with the same queue in FIFO order; "most overtakes" is the largest number of people who overtook one ticket, on the worst day.

## 1. Maximum data age

| Maximum data age (min) | Missed: `fifo` | Missed: `fifo-manual` | Missed: `virtual-fifo` | Missed: `priority-v2` | Missed: `priority-v3` | Net saved vs `fifo-manual` | Net saved vs `virtual-fifo` | Net saved vs `priority-v2` | Net saved vs `fifo` | Others delayed > 5 min | Most overtakes |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 15 | 47.8 | 12.4 | 48.5 | 10.8 | 11.4 | 1.0 [0.1, 1.9] | 37.2 [34.2, 40.1] | -0.6 [-1.1, -0.2] | 36.4 [33.4, 39.7] | 0.02% | 30 |
| 30 | 47.8 | 12.4 | 48.5 | 10.8 | 11.1 | 1.3 [0.5, 2.1] | 37.4 [34.6, 40.5] | -0.3 [-0.6, 0.0] | 36.7 [33.7, 39.7] | 0.02% | 30 |
| 45 | 47.8 | 12.4 | 48.5 | 10.8 | 10.9 | 1.5 [0.7, 2.3] | 37.7 [34.8, 40.8] | -0.1 [-0.2, 0.1] | 36.9 [33.9, 40.0] | 0.02% | 30 |
| **60 (base)** | 47.8 | 12.4 | 48.5 | 10.8 | 10.8 | 1.6 [0.7, 2.3] | 37.7 [34.8, 40.7] | 0.0 [-0.1, 0.2] | 37.0 [34.0, 40.1] | 0.02% | 30 |
| 90 | 47.8 | 12.4 | 48.5 | 10.8 | 10.8 | 1.6 [0.8, 2.4] | 37.8 [34.8, 40.7] | 0.0 [-0.1, 0.2] | 37.0 [34.0, 40.0] | 0.02% | 30 |
| none | 47.8 | 12.4 | 48.5 | 10.8 | 10.8 | 1.6 [0.8, 2.4] | 37.8 [34.8, 40.9] | 0.0 [-0.1, 0.2] | 37.0 [34.0, 40.1] | 0.02% | 30 |

## 2. Feed outages per day

| Feed outages per day | Missed: `fifo` | Missed: `fifo-manual` | Missed: `virtual-fifo` | Missed: `priority-v2` | Missed: `priority-v3` | Net saved vs `fifo-manual` | Net saved vs `virtual-fifo` | Net saved vs `priority-v2` | Net saved vs `fifo` | Others delayed > 5 min | Most overtakes |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 0 | 47.8 | 12.4 | 48.5 | 10.8 | 10.8 | 1.6 [0.8, 2.4] | 37.7 [34.9, 40.9] | 0.0 [-0.1, 0.2] | 37.0 [34.1, 40.1] | 0.02% | 30 |
| **1 (base)** | 47.8 | 12.4 | 48.5 | 10.8 | 10.8 | 1.6 [0.7, 2.4] | 37.7 [34.8, 40.9] | 0.0 [-0.1, 0.2] | 37.0 [34.0, 40.1] | 0.02% | 30 |
| 2 | 47.8 | 12.4 | 48.5 | 10.9 | 10.9 | 1.5 [0.6, 2.3] | 37.6 [34.6, 40.7] | 0.0 [-0.1, 0.2] | 36.9 [33.9, 40.1] | 0.02% | 30 |
| 4 | 47.8 | 12.4 | 48.5 | 10.9 | 10.8 | 1.6 [0.8, 2.3] | 37.7 [34.7, 40.8] | 0.0 [-0.1, 0.2] | 37.0 [33.9, 39.9] | 0.02% | 30 |
| 6 | 47.8 | 12.4 | 48.5 | 11.0 | 11.3 | 1.1 [0.1, 1.9] | 37.2 [34.2, 40.3] | -0.4 [-0.7, 0.0] | 36.5 [33.5, 39.4] | 0.02% | 30 |

## 3. Maximum data age, with the feed down four times a day

On this curve only: Feed outages per day = 4.

| Maximum data age (min) | Missed: `fifo` | Missed: `fifo-manual` | Missed: `virtual-fifo` | Missed: `priority-v2` | Missed: `priority-v3` | Net saved vs `fifo-manual` | Net saved vs `virtual-fifo` | Net saved vs `priority-v2` | Net saved vs `fifo` | Others delayed > 5 min | Most overtakes |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 15 | 47.8 | 12.4 | 48.5 | 10.9 | 12.2 | 0.2 [-0.8, 1.2] | 36.4 [33.5, 39.2] | -1.3 [-2.1, -0.7] | 35.6 [32.5, 38.5] | 0.01% | 30 |
| 30 | 47.8 | 12.4 | 48.5 | 10.9 | 11.5 | 0.9 [0.0, 1.8] | 37.0 [34.3, 40.0] | -0.6 [-1.1, -0.3] | 36.3 [33.3, 39.4] | 0.02% | 30 |
| **60 (base)** | 47.8 | 12.4 | 48.5 | 10.9 | 10.8 | 1.6 [0.8, 2.4] | 37.7 [34.8, 40.7] | 0.0 [-0.1, 0.2] | 37.0 [33.9, 40.2] | 0.02% | 30 |
| none | 47.8 | 12.4 | 48.5 | 10.9 | 10.8 | 1.6 [0.8, 2.4] | 37.8 [34.8, 40.8] | 0.1 [-0.1, 0.2] | 37.0 [34.3, 40.2] | 0.02% | 30 |

## 4. Median length of a feed outage

| Median length of a feed outage (min) | Missed: `fifo` | Missed: `fifo-manual` | Missed: `virtual-fifo` | Missed: `priority-v2` | Missed: `priority-v3` | Net saved vs `fifo-manual` | Net saved vs `virtual-fifo` | Net saved vs `priority-v2` | Net saved vs `fifo` | Others delayed > 5 min | Most overtakes |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 15 | 47.8 | 12.4 | 48.5 | 10.8 | 10.8 | 1.6 [0.8, 2.4] | 37.8 [34.9, 40.8] | 0.0 [-0.2, 0.2] | 37.0 [33.9, 40.2] | 0.02% | 30 |
| **30 (base)** | 47.8 | 12.4 | 48.5 | 10.8 | 10.8 | 1.6 [0.8, 2.4] | 37.7 [34.8, 40.7] | 0.0 [-0.1, 0.2] | 37.0 [33.9, 39.9] | 0.02% | 30 |
| 60 | 47.8 | 12.4 | 48.5 | 10.9 | 11.8 | 0.6 [-0.8, 1.8] | 36.8 [33.9, 39.8] | -0.9 [-1.9, -0.2] | 36.0 [33.0, 39.1] | 0.02% | 30 |
| 90 | 47.8 | 12.4 | 48.5 | 10.9 | 11.9 | 0.5 [-0.9, 1.7] | 36.7 [33.8, 39.6] | -1.0 [-2.0, -0.2] | 35.9 [33.0, 38.9] | 0.01% | 30 |

## 5. Hysteresis h

| Hysteresis h (min) | Missed: `fifo` | Missed: `fifo-manual` | Missed: `virtual-fifo` | Missed: `priority-v2` | Missed: `priority-v3` | Net saved vs `fifo-manual` | Net saved vs `virtual-fifo` | Net saved vs `priority-v2` | Net saved vs `fifo` | Others delayed > 5 min | Most overtakes |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 0 | 47.8 | 12.4 | 48.5 | 10.8 | 10.8 | 1.6 [0.8, 2.4] | 37.7 [34.7, 40.8] | 0.0 [0.0, 0.0] | 37.0 [34.0, 39.8] | 0.01% | 30 |
| 1 | 47.8 | 12.4 | 48.5 | 10.8 | 10.8 | 1.6 [0.8, 2.4] | 37.8 [34.8, 40.8] | 0.1 [-0.1, 0.2] | 37.0 [33.9, 40.0] | 0.02% | 30 |
| **3 (base)** | 47.8 | 12.4 | 48.5 | 10.8 | 10.8 | 1.6 [0.7, 2.4] | 37.7 [34.6, 40.8] | 0.0 [-0.1, 0.2] | 37.0 [34.0, 39.8] | 0.02% | 30 |
| 5 | 47.8 | 12.4 | 48.5 | 10.8 | 10.8 | 1.6 [0.7, 2.3] | 37.7 [34.8, 40.7] | 0.0 [-0.1, 0.2] | 37.0 [33.9, 40.0] | 0.02% | 30 |

## 6. Share of delayed flights

| Share of delayed flights | Missed: `fifo` | Missed: `fifo-manual` | Missed: `virtual-fifo` | Missed: `priority-v2` | Missed: `priority-v3` | Net saved vs `fifo-manual` | Net saved vs `virtual-fifo` | Net saved vs `priority-v2` | Net saved vs `fifo` | Others delayed > 5 min | Most overtakes |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 0 | 61.8 | 16.3 | 62.7 | 14.3 | 14.3 | 2.0 [1.1, 2.9] | 48.4 [45.0, 51.8] | 0.1 [-0.1, 0.2] | 47.5 [44.1, 51.0] | 0.02% | 30 |
| **0.25 (base)** | 47.8 | 12.4 | 48.5 | 10.8 | 10.8 | 1.6 [0.8, 2.4] | 37.7 [34.7, 40.9] | 0.0 [-0.1, 0.2] | 37.0 [34.0, 40.1] | 0.02% | 30 |
| 0.5 | 33.9 | 8.1 | 34.7 | 6.9 | 6.9 | 1.2 [0.5, 1.9] | 27.8 [25.3, 30.3] | 0.0 [-0.1, 0.1] | 27.0 [24.5, 29.6] | 0.01% | 30 |

## 7. Lane outages per day

| Lane outages per day | Missed: `fifo` | Missed: `fifo-manual` | Missed: `virtual-fifo` | Missed: `priority-v2` | Missed: `priority-v3` | Net saved vs `fifo-manual` | Net saved vs `virtual-fifo` | Net saved vs `priority-v2` | Net saved vs `fifo` | Others delayed > 5 min | Most overtakes |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 0 | 43.0 | 11.5 | 43.6 | 9.4 | 9.3 | 2.1 [1.4, 2.8] | 34.3 [31.3, 37.1] | 0.1 [-0.1, 0.2] | 33.7 [30.8, 36.7] | 0.01% | 30 |
| **2 (base)** | 47.8 | 12.4 | 48.5 | 10.8 | 10.8 | 1.6 [0.7, 2.4] | 37.7 [34.6, 40.7] | 0.0 [-0.1, 0.2] | 37.0 [33.9, 40.1] | 0.02% | 30 |
| 4 | 52.8 | 13.6 | 53.3 | 12.2 | 12.2 | 1.4 [0.5, 2.3] | 41.1 [37.5, 44.6] | 0.0 [-0.2, 0.2] | 40.6 [37.1, 44.2] | 0.03% | 30 |

## 8. Method

- One-at-a-time sensitivity: each curve varies one parameter around the base, all else equal.
- At every point all policies run on the same passengers (common random numbers), and the same seeds are used at every point, so the differences between points are not noise of different days.
- Points that only change a policy share their simulated days, and the policies they do not change are simulated once.
- Policy parameters change the candidate; the prepare window changes every virtual queue, so that the comparison with the same queue in FIFO order stays valid. Scenario parameters change the simulated days for every policy.
- Confidence intervals: percentile bootstrap of the mean over days (2000 resamples, seed 20261121). Quantiles: linear interpolation between order statistics (Hyndman-Fan type 7).

## 9. Policies at the base

- Physical FIFO queue (status quo, policy A): `fifo` 1.1.0
- Physical FIFO queue with staff calling closing flights (status quo with manual handling, policy A'): `fifo-manual` 0.1.0
- GateFlow virtual queue in FIFO order: `virtual-fifo` 0.1.0
- GateFlow virtual queue with constrained EDF priority v2 and fast track (policy B): `priority-v2` 0.1.0
- GateFlow virtual queue with constrained EDF priority v3: fast track, stale-data rule and hysteresis (policy B): `priority-v3` 0.2.0

Full parameters are in the `manifest` of `sweep.json`.

## 10. Assumptions of the base scenario

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
| disruptions.flightDelays | SYNTHETIC | A quarter of the flights are delayed (log-normal, median 20 minutes). The delay is announced uniformly between 120 and 10 minutes before the scheduled departure; passengers still arrive for the scheduled departure. |
| disruptions.gateChanges | SYNTHETIC | A tenth of the flights change gate 70 to 30 minutes before departure; the feed reports it up to 5 minutes later. Passengers screened after the change walk to the new gate. |
| disruptions.laneOutages | SYNTHETIC | About two unplanned outages of one lane per day (median 20 minutes); at least one lane stays open. |
| disruptions.feedOutages | SYNTHETIC | The flight feed goes down about once a day (median 30 minutes). Messages sent meanwhile arrive when it recovers. |

## 11. Limitations of this model version

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

## 12. Reproducibility

| Item | Value |
|---|---|
| Sweep specification hash | `sha256:9a87b5a083af44d6782a9b0866bd35923cd424c73dc49d334f4c0a5cda067e82` |
| Base scenario hash | `sha256:cd6543fec27ef95e8ef656a4ba29b664c604f0b2e8139f3ea420efc6c013e8d2` |
| Seeds | 1-200 (200) |
| Distinct simulated days | 2400 |
| Source revision | `7e26b4fbe3d2238c424e09223e602632aa6cc18d` |
| Versions | engine 0.5.0, queue core 0.5.0, model 0.5.0, kernel 0.1.0, population generator 0.4.0, scenario schema 4 |
| Generated by | gateflow-sim 0.6.0 |

Command:

```bash
gateflow-sim sweep --spec sweeps/data-quality-disrupted.yaml --seeds 1-200 --bootstrap-resamples 2000
```
