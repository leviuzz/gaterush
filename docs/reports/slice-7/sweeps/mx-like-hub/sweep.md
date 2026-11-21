# GateFlow sensitivity sweep: Priority v3 at the MX-like transfer checkpoint, one assumption at a time

> **SIMULATED RESULTS ON SYNTHETIC OR HYPOTHETICAL DATA. These numbers are model outputs, not measurements, and must not be presented as evidence of operational performance.**

How robust is the advantage of GateFlow at a transfer checkpoint fed by tight connections? Each curve varies one assumption of the hub day around its base, all else equal: the lanes of the hourly plan, the mean screening time per person, how much time connecting passengers have left when they reach the checkpoint, how fast they answer a call, and the overtake bound K.

Base scenario `mx-like-transfer-hub` (data: SYNTHETIC). Every point is 200 simulated days (seeds 1-200); the parameters vary for `priority-v3`. Each table varies one parameter and keeps everything else at the base, marked **(base)**. Means per day; brackets give the 95% confidence interval of the mean (bootstrap over days). "Others delayed > 5 min" is the share of non-prioritised passengers who wait more than 5 minutes longer than with the same queue in FIFO order; "most overtakes" is the largest number of people who overtook one ticket, on the worst day.

## 1. Lanes added to the plan

| Lanes added to every period of the schedule | Missed: `fifo` | Missed: `fifo-manual` | Missed: `virtual-fifo` | Missed: `priority-v3` | Net saved vs `fifo-manual` | Net saved vs `virtual-fifo` | Net saved vs `fifo` | Others delayed > 5 min | Most overtakes |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| **0 (base)** | 131.6 | 96.7 | 132.7 | 87.9 | 8.7 [7.2, 10.3] | 44.8 [41.9, 47.4] | 43.7 [40.8, 46.5] | 0.81% | 30 |
| +1 | 55.3 | 52.8 | 55.2 | 52.1 | 0.7 [0.3, 1.1] | 3.1 [2.6, 3.6] | 3.1 [2.6, 3.7] | 0.00% | 30 |
| +2 | 50.0 | 49.7 | 50.0 | 49.6 | 0.1 [0.0, 0.2] | 0.4 [0.3, 0.5] | 0.4 [0.3, 0.6] | 0.00% | 13 |

## 2. Mean screening time per person

| Mean screening time per person (s) | Missed: `fifo` | Missed: `fifo-manual` | Missed: `virtual-fifo` | Missed: `priority-v3` | Net saved vs `fifo-manual` | Net saved vs `virtual-fifo` | Net saved vs `fifo` | Others delayed > 5 min | Most overtakes |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 24 | 61.8 | 57.6 | 61.8 | 56.2 | 1.4 [0.8, 2.1] | 5.6 [4.8, 6.5] | 5.6 [4.9, 6.5] | 0.08% | 30 |
| 27 | 79.5 | 68.8 | 79.9 | 65.3 | 3.5 [2.7, 4.4] | 14.6 [13.2, 16.2] | 14.2 [12.8, 15.8] | 0.21% | 30 |
| **30 (base)** | 131.6 | 96.7 | 132.7 | 87.9 | 8.7 [7.2, 10.2] | 44.8 [42.0, 47.6] | 43.7 [41.1, 46.3] | 0.81% | 30 |
| 33 | 276.9 | 174.2 | 278.1 | 170.3 | 3.9 [0.8, 7.0] | 107.7 [104.1, 111.5] | 106.6 [103.1, 110.3] | 4.29% | 30 |
| 36 | 749.6 | 576.2 | 761.7 | 534.1 | 42.1 [33.1, 51.2] | 227.7 [221.9, 233.6] | 215.6 [210.0, 221.3] | 17.33% | 30 |

## 3. Time left when connecting passengers reach the checkpoint

| Arrival shift (min; positive = earlier) | Missed: `fifo` | Missed: `fifo-manual` | Missed: `virtual-fifo` | Missed: `priority-v3` | Net saved vs `fifo-manual` | Net saved vs `virtual-fifo` | Net saved vs `fifo` | Others delayed > 5 min | Most overtakes |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| -10 | 529.6 | 392.3 | 530.6 | 393.9 | -1.6 [-5.7, 2.7] | 136.7 [132.3, 141.5] | 135.7 [131.2, 140.4] | 4.94% | 30 |
| **0 (base)** | 131.6 | 96.7 | 132.7 | 87.9 | 8.7 [7.2, 10.3] | 44.8 [42.1, 47.5] | 43.7 [41.0, 46.4] | 0.81% | 30 |
| +10 | 43.1 | 32.4 | 43.7 | 28.0 | 4.4 [3.5, 5.2] | 15.7 [14.1, 17.4] | 15.1 [13.6, 16.8] | 0.12% | 30 |
| +20 | 20.8 | 15.8 | 21.3 | 12.2 | 3.6 [3.0, 4.2] | 9.1 [7.9, 10.5] | 8.6 [7.4, 10.1] | 0.05% | 30 |

## 4. How fast passengers answer a call

| Median call response (s) | Missed: `fifo` | Missed: `fifo-manual` | Missed: `virtual-fifo` | Missed: `priority-v3` | Net saved vs `fifo-manual` | Net saved vs `virtual-fifo` | Net saved vs `fifo` | Others delayed > 5 min | Most overtakes |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 45 | 131.6 | 96.7 | 132.4 | 87.5 | 9.1 [7.6, 10.8] | 44.9 [42.2, 47.9] | 44.1 [41.4, 47.0] | 0.83% | 30 |
| **75 (base)** | 131.6 | 96.7 | 132.7 | 87.9 | 8.7 [7.1, 10.1] | 44.8 [42.2, 47.5] | 43.7 [40.9, 46.4] | 0.81% | 30 |
| 120 | 131.6 | 96.7 | 139.0 | 90.0 | 6.6 [4.9, 8.3] | 49.0 [45.8, 52.2] | 41.6 [39.1, 44.1] | 0.70% | 30 |
| 180 | 131.6 | 96.7 | 208.2 | 113.3 | -16.7 [-21.9, -11.7] | 94.9 [87.3, 102.6] | 18.3 [14.0, 21.9] | 0.49% | 30 |

## 5. Overtake bound K

| Overtake bound K (people) | Missed: `fifo` | Missed: `fifo-manual` | Missed: `virtual-fifo` | Missed: `priority-v3` | Net saved vs `fifo-manual` | Net saved vs `virtual-fifo` | Net saved vs `fifo` | Others delayed > 5 min | Most overtakes |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 15 | 131.6 | 96.7 | 132.7 | 93.7 | 2.9 [1.2, 4.6] | 39.0 [36.9, 41.0] | 37.9 [35.9, 39.8] | 0.28% | 15 |
| **30 (base)** | 131.6 | 96.7 | 132.7 | 87.9 | 8.7 [7.1, 10.2] | 44.8 [42.1, 47.6] | 43.7 [40.9, 46.3] | 0.81% | 30 |
| 60 | 131.6 | 96.7 | 132.7 | 86.0 | 10.7 [9.0, 12.3] | 46.7 [43.7, 50.0] | 45.7 [42.7, 48.8] | 1.09% | 60 |
| 120 | 131.6 | 96.7 | 132.7 | 85.9 | 10.7 [9.1, 12.4] | 46.8 [43.7, 50.0] | 45.7 [42.6, 48.9] | 1.09% | 88 |

## 6. Method

- One-at-a-time sensitivity: each curve varies one parameter around the base, all else equal.
- At every point all policies run on the same passengers (common random numbers), and the same seeds are used at every point, so the differences between points are not noise of different days.
- Points that only change a policy share their simulated days, and the policies they do not change are simulated once.
- Policy parameters change the candidate; the prepare window changes every virtual queue, so that the comparison with the same queue in FIFO order stays valid. Scenario parameters change the simulated days for every policy.
- Confidence intervals: percentile bootstrap of the mean over days (2000 resamples, seed 20261121). Quantiles: linear interpolation between order statistics (Hyndman-Fan type 7).

## 7. Policies at the base

- Physical FIFO queue (status quo, policy A): `fifo` 1.1.0
- Physical FIFO queue with staff calling closing flights (status quo with manual handling, policy A'): `fifo-manual` 0.1.0
- GateFlow virtual queue in FIFO order: `virtual-fifo` 0.1.0
- GateFlow virtual queue with constrained EDF priority v3: fast track, stale-data rule and hysteresis (policy B): `priority-v3` 0.2.0

Full parameters are in the `manifest` of `sweep.json`.

## 8. Data sources and licences

Where the data of this scenario comes from, and the terms under which it may be used.

| Source | Kind | Provider | Licence or terms of use | Retrieved | Used for |
|---|---|---|---|---|---|
| Synthetic assumptions of this scenario (`gateflow-synthetic`) | SYNTHETIC | GateFlow | Created for GateFlow; contains no third-party data. | - | - |
| Synthetic flight list of the scenario library (`library-flights`) | SYNTHETIC | GateFlow (scenarios/flights/make-library-flights.mjs) | Created for GateFlow; contains no third-party schedule data. | - | flight list |

Design day: 58 departures from the flight list `flights/mx-like-transfer-hub.csv` (SHA-256 `04e56676d49984dd3b6941c187b1b7d27532823d697116a2343139927b6d2043`), source `library-flights`.

## 9. Assumptions of the base scenario

| Parameter | Source | Note |
|---|---|---|
| checkpoint.laneSchedule | SYNTHETIC | Planned from the expected arrivals of the day: in every hour, enough lanes to screen the passengers arriving in it at 90% utilisation, at least 1 and at most 4 (the lanes the checkpoint has). 55.0 lane-hours. Assumed planning rule, not the airport's. |
| checkpoint.serviceTimeMeanSeconds | SYNTHETIC | About 120 passengers per hour per lane (connecting passengers carry cabin bags and purchases). |
| checkpoint.serviceTimeCv | SYNTHETIC |  |
| schedule.seats | SYNTHETIC | Assumed two-class configurations of a network carrier, not airline data. The flight list gives the connecting passengers of each flight; seats only bound them. |
| schedule.gateZones | SYNTHETIC | Nominal walk from the checkpoint exit to the domestic gates of a large terminal. |
| passengers.loadFactor | SYNTHETIC | Not used, the flight list gives the connecting passengers of every flight. |
| passengers.transferShare | SYNTHETIC | Every passenger of this checkpoint is connecting. |
| passengers.showUp.departing | SYNTHETIC | Not used (no departing passengers); the same curve as for connecting passengers. |
| passengers.showUp.transfer | SYNTHETIC | Arrival at the transfer checkpoint = STD minus (25 min + log-normal with median 35 min): after the inbound flight, immigration, customs and the bag drop. A long tail of tight connections (late inbound flights, border queues). |
| passengers.walkSpeedSigma | SYNTHETIC | Individual walking time = nominal zone time x log-normal(median 1, sigma). |
| passengers.callResponse | SYNTHETIC | Virtual queue only. As in the demo scenario; to be measured in a pilot. |
| passengers.groups | SYNTHETIC | As in the demo scenario; about 40% of passengers travel with others. |
| passengers.assistedShare | SYNTHETIC | Parties taking the assisted path (PRM and similar), as in the demo scenario. |
| passengers.strategicLateArrival | SYNTHETIC | Nobody arrives late on purpose in this scenario. |
| operations.boardingCloseMinutesBeforeStd | SYNTHETIC | Boarding closes 20 minutes before the scheduled departure, for every flight. |
| operations.deadlineKnowledge | SYNTHETIC | The system applies the closing rule to the schedule; without disruptions it matches the ground truth exactly. |
| disruptions.flightDelays | SYNTHETIC | A quarter of the departures are delayed (log-normal, median 20 minutes), announced between 120 and 10 minutes before the scheduled departure. Inbound delays are part of the arrival curve above. |
| disruptions.gateChanges | SYNTHETIC | More gate changes than at an origin-and-destination airport (assumed). |
| disruptions.laneOutages | SYNTHETIC | About one unplanned outage of one lane per day (median 20 minutes). |
| disruptions.feedOutages | SYNTHETIC | The flight feed goes down about once a day (median 30 minutes). |

## 10. Limitations of this model version

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

## 11. Reproducibility

| Item | Value |
|---|---|
| Sweep specification hash | `sha256:a66225c791bcae8b72b7418942f2024f176e5dde15c68785266eefff0dbdafa4` |
| Base scenario hash | `sha256:45ab6a047491daf6300594c03bc0a48e6d12f4e302c7559816adddf280a7c9ed` |
| Seeds | 1-200 (200) |
| Distinct simulated days | 2600 |
| Source revision | `2ccc1db5dcc2e9876f12fe9d9c8081c607fb6320` |
| Versions | engine 0.5.0, queue core 0.5.0, model 0.5.0, kernel 0.1.0, population generator 0.5.0, scenario schema 5 |
| Generated by | gateflow-sim 0.7.0 |

Command:

```bash
gateflow-sim sweep --spec sweeps/mx-like-hub.yaml --seeds 1-200 --bootstrap-resamples 2000
```
