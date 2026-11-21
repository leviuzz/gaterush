# GateFlow sensitivity sweep: Priority v3 on the congested demo day, one assumption at a time

> **SIMULATED RESULTS ON SYNTHETIC OR HYPOTHETICAL DATA. These numbers are model outputs, not measurements, and must not be presented as evidence of operational performance.**

How much do the results depend on the fairness bounds, the prepare window, the hysteresis, the number of lanes, the demand, when passengers arrive and how they answer calls? Each curve varies one of them around the base of the demo scenario and of priority v3, all else equal.

Base scenario `single-checkpoint-demo` (data: SYNTHETIC). Every point is 200 simulated days (seeds 1-200); the parameters vary for `priority-v3`. Each table varies one parameter and keeps everything else at the base, marked **(base)**. Means per day; brackets give the 95% confidence interval of the mean (bootstrap over days). "Others delayed > 5 min" is the share of non-prioritised passengers who wait more than 5 minutes longer than with the same queue in FIFO order; "most overtakes" is the largest number of people who overtook one ticket, on the worst day.

## 1. Overtake bound K

| Overtake bound K (people) | Missed: `fifo` | Missed: `fifo-manual` | Missed: `virtual-fifo` | Missed: `priority-v3` | Net saved vs `fifo-manual` | Net saved vs `virtual-fifo` | Net saved vs `fifo` | Others delayed > 5 min | Most overtakes |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 10 | 55.1 | 14.7 | 55.8 | 23.1 | -8.4 [-10.2, -6.4] | 32.6 [30.7, 34.5] | 32.0 [30.1, 34.0] | 0.00% | 10 |
| 15 | 55.1 | 14.7 | 55.8 | 17.7 | -3.0 [-4.3, -1.8] | 38.0 [35.7, 40.4] | 37.4 [34.9, 39.9] | 0.00% | 15 |
| 20 | 55.1 | 14.7 | 55.8 | 14.7 | 0.0 [-1.0, 1.0] | 41.0 [38.1, 43.8] | 40.4 [37.5, 43.2] | 0.00% | 20 |
| **30 (base)** | 55.1 | 14.7 | 55.8 | 11.5 | 3.2 [2.4, 4.0] | 44.2 [41.1, 47.5] | 43.5 [40.3, 46.9] | 0.01% | 30 |
| 40 | 55.1 | 14.7 | 55.8 | 10.0 | 4.7 [4.0, 5.4] | 45.7 [42.4, 49.2] | 45.0 [41.4, 48.7] | 0.27% | 40 |
| 60 | 55.1 | 14.7 | 55.8 | 8.6 | 6.1 [5.4, 6.9] | 47.1 [43.5, 51.0] | 46.5 [42.4, 50.5] | 1.02% | 60 |

## 2. Priority cap k (people among 20 called)

| Priority people allowed among N called (k) | Missed: `fifo` | Missed: `fifo-manual` | Missed: `virtual-fifo` | Missed: `priority-v3` | Net saved vs `fifo-manual` | Net saved vs `virtual-fifo` | Net saved vs `fifo` | Others delayed > 5 min | Most overtakes |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 2 | 55.1 | 14.7 | 55.8 | 28.5 | -13.8 [-15.7, -12.0] | 27.2 [25.5, 29.0] | 26.5 [24.7, 28.4] | 0.00% | 26 |
| 5 | 55.1 | 14.7 | 55.8 | 12.7 | 2.1 [1.3, 2.9] | 43.1 [39.9, 46.2] | 42.4 [39.2, 45.5] | 0.00% | 30 |
| **10 (base)** | 55.1 | 14.7 | 55.8 | 11.5 | 3.2 [2.5, 4.0] | 44.2 [41.0, 47.5] | 43.5 [40.2, 47.0] | 0.01% | 30 |
| 15 | 55.1 | 14.7 | 55.8 | 11.5 | 3.2 [2.5, 4.0] | 44.2 [40.8, 47.6] | 43.5 [40.2, 47.0] | 0.01% | 30 |
| 20 | 55.1 | 14.7 | 55.8 | 11.5 | 3.2 [2.5, 4.0] | 44.2 [41.0, 47.5] | 43.6 [40.5, 46.9] | 0.01% | 30 |

## 3. Prepare window M

| Prepare window M (tickets) | Missed: `fifo` | Missed: `fifo-manual` | Missed: `virtual-fifo` | Missed: `priority-v3` | Net saved vs `fifo-manual` | Net saved vs `virtual-fifo` | Net saved vs `fifo` | Others delayed > 5 min | Most overtakes |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 0 | 55.1 | 14.7 | 55.6 | 11.3 | 3.4 [2.7, 4.2] | 44.3 [41.0, 47.5] | 43.8 [40.5, 47.2] | 0.01% | 30 |
| 5 | 55.1 | 14.7 | 55.6 | 11.5 | 3.3 [2.5, 4.0] | 44.2 [40.9, 47.7] | 43.6 [40.2, 47.0] | 0.01% | 30 |
| **10 (base)** | 55.1 | 14.7 | 55.8 | 11.5 | 3.2 [2.5, 4.0] | 44.2 [40.9, 47.4] | 43.5 [40.2, 46.6] | 0.01% | 30 |
| 15 | 55.1 | 14.7 | 55.8 | 11.7 | 3.0 [2.3, 3.7] | 44.0 [40.6, 47.4] | 43.4 [40.0, 46.5] | 0.01% | 30 |
| 20 | 55.1 | 14.7 | 55.8 | 12.2 | 2.6 [1.8, 3.4] | 43.6 [40.4, 46.9] | 42.9 [39.6, 46.3] | 0.01% | 30 |

## 4. Hysteresis h

| Hysteresis h (min) | Missed: `fifo` | Missed: `fifo-manual` | Missed: `virtual-fifo` | Missed: `priority-v3` | Net saved vs `fifo-manual` | Net saved vs `virtual-fifo` | Net saved vs `fifo` | Others delayed > 5 min | Most overtakes |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 0 | 55.1 | 14.7 | 55.8 | 11.5 | 3.2 [2.4, 4.0] | 44.2 [41.0, 47.4] | 43.6 [40.1, 46.8] | 0.01% | 30 |
| 1 | 55.1 | 14.7 | 55.8 | 11.5 | 3.2 [2.5, 4.0] | 44.3 [41.0, 47.6] | 43.6 [40.2, 46.9] | 0.01% | 30 |
| **3 (base)** | 55.1 | 14.7 | 55.8 | 11.5 | 3.2 [2.4, 4.0] | 44.2 [41.0, 47.6] | 43.5 [40.3, 46.8] | 0.01% | 30 |
| 5 | 55.1 | 14.7 | 55.8 | 11.5 | 3.2 [2.5, 3.9] | 44.2 [41.0, 47.4] | 43.5 [40.3, 46.8] | 0.01% | 30 |

## 5. Lanes open

| Lanes added to every period of the schedule | Missed: `fifo` | Missed: `fifo-manual` | Missed: `virtual-fifo` | Missed: `priority-v3` | Net saved vs `fifo-manual` | Net saved vs `virtual-fifo` | Net saved vs `fifo` | Others delayed > 5 min | Most overtakes |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| -1 | 364.0 | 103.8 | 364.7 | 199.0 | -95.1 [-101.3, -88.8] | 165.8 [161.7, 169.9] | 165.0 [160.9, 169.2] | 0.89% | 30 |
| **0 (base)** | 55.1 | 14.7 | 55.8 | 11.5 | 3.2 [2.4, 4.0] | 44.2 [41.0, 47.5] | 43.5 [40.2, 47.0] | 0.01% | 30 |
| +1 | 8.3 | 6.1 | 8.5 | 5.5 | 0.6 [0.4, 0.9] | 3.0 [2.5, 3.5] | 2.8 [2.3, 3.3] | 0.00% | 26 |
| +2 | 5.4 | 5.3 | 5.4 | 5.2 | 0.1 [0.0, 0.2] | 0.2 [0.1, 0.3] | 0.2 [0.1, 0.3] | 0.00% | 7 |

## 6. Load factor

| Load factor (multiple of the base) | Missed: `fifo` | Missed: `fifo-manual` | Missed: `virtual-fifo` | Missed: `priority-v3` | Net saved vs `fifo-manual` | Net saved vs `virtual-fifo` | Net saved vs `fifo` | Others delayed > 5 min | Most overtakes |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 0.8 | 4.9 | 4.3 | 4.9 | 4.1 | 0.2 [0.1, 0.3] | 0.8 [0.6, 1.1] | 0.8 [0.6, 1.0] | 0.00% | 15 |
| 0.9 | 11.6 | 6.3 | 12.2 | 5.2 | 1.1 [0.7, 1.4] | 6.9 [6.0, 7.9] | 6.4 [5.5, 7.3] | 0.00% | 30 |
| **1 (base)** | 55.1 | 14.7 | 55.8 | 11.5 | 3.2 [2.5, 4.0] | 44.2 [41.0, 47.5] | 43.5 [40.1, 46.8] | 0.01% | 30 |
| 1.1 | 127.3 | 32.1 | 128.1 | 42.2 | -10.1 [-12.1, -7.8] | 85.9 [82.6, 89.3] | 85.1 [81.9, 88.7] | 0.02% | 30 |

## 7. When passengers arrive

| Arrival shift (min; positive = earlier) | Missed: `fifo` | Missed: `fifo-manual` | Missed: `virtual-fifo` | Missed: `priority-v3` | Net saved vs `fifo-manual` | Net saved vs `virtual-fifo` | Net saved vs `fifo` | Others delayed > 5 min | Most overtakes |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| -20 | 334.1 | 195.4 | 334.7 | 235.9 | -40.4 [-44.0, -37.1] | 98.8 [95.8, 102.0] | 98.3 [95.2, 101.4] | 0.04% | 30 |
| -10 | 135.6 | 46.0 | 135.8 | 57.0 | -11.0 [-13.3, -8.8] | 78.8 [75.5, 82.1] | 78.6 [75.2, 81.9] | 0.02% | 30 |
| **0 (base)** | 55.1 | 14.7 | 55.8 | 11.5 | 3.2 [2.5, 4.0] | 44.2 [40.9, 47.7] | 43.5 [40.1, 46.9] | 0.01% | 30 |
| +10 | 18.4 | 5.3 | 19.2 | 2.7 | 2.6 [2.1, 3.1] | 16.5 [14.6, 18.5] | 15.6 [13.7, 17.6] | 0.00% | 30 |
| +20 | 5.6 | 2.1 | 6.1 | 1.2 | 1.0 [0.7, 1.3] | 4.9 [4.2, 5.7] | 4.4 [3.6, 5.2] | 0.00% | 30 |

## 8. How fast passengers answer a call

| Median call response (s) | Missed: `fifo` | Missed: `fifo-manual` | Missed: `virtual-fifo` | Missed: `priority-v3` | Net saved vs `fifo-manual` | Net saved vs `virtual-fifo` | Net saved vs `fifo` | Others delayed > 5 min | Most overtakes |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 45 | 55.1 | 14.7 | 55.7 | 11.6 | 3.2 [2.4, 3.9] | 44.1 [40.7, 47.4] | 43.5 [40.0, 46.9] | 0.00% | 30 |
| **75 (base)** | 55.1 | 14.7 | 55.8 | 11.5 | 3.2 [2.5, 4.0] | 44.2 [41.0, 47.6] | 43.5 [40.0, 46.8] | 0.01% | 30 |
| 120 | 55.1 | 14.7 | 60.7 | 13.1 | 1.7 [0.8, 2.5] | 47.7 [44.3, 51.0] | 42.0 [39.1, 45.4] | 0.01% | 30 |
| 180 | 55.1 | 14.7 | 134.7 | 40.5 | -25.7 [-29.0, -22.3] | 94.2 [89.4, 98.7] | 14.6 [12.7, 16.5] | 0.00% | 30 |

## 9. Passengers who miss the first call

| Share of passengers missing the first call | Missed: `fifo` | Missed: `fifo-manual` | Missed: `virtual-fifo` | Missed: `priority-v3` | Net saved vs `fifo-manual` | Net saved vs `virtual-fifo` | Net saved vs `fifo` | Others delayed > 5 min | Most overtakes |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 0.02 | 55.1 | 14.7 | 55.4 | 11.1 | 3.7 [2.9, 4.4] | 44.4 [41.2, 47.6] | 44.0 [40.8, 47.3] | 0.01% | 30 |
| **0.04 (base)** | 55.1 | 14.7 | 55.8 | 11.5 | 3.2 [2.4, 4.0] | 44.2 [40.9, 47.4] | 43.5 [40.1, 47.0] | 0.01% | 30 |
| 0.08 | 55.1 | 14.7 | 56.7 | 12.9 | 1.8 [1.0, 2.6] | 43.7 [40.6, 47.1] | 42.1 [38.9, 45.5] | 0.01% | 30 |
| 0.12 | 55.1 | 14.7 | 57.6 | 13.8 | 1.0 [0.1, 1.8] | 43.8 [40.6, 46.9] | 41.3 [38.2, 44.7] | 0.02% | 30 |

## 10. Call-ahead, when passengers take 3 minutes to answer a call

On this curve only: Median call response (s) = 180; Engine's estimate of the call response (s) = 180.

| Call-ahead of the virtual queue (s) | Missed: `fifo` | Missed: `fifo-manual` | Missed: `virtual-fifo` | Missed: `priority-v3` | Net saved vs `fifo-manual` | Net saved vs `virtual-fifo` | Net saved vs `fifo` | Others delayed > 5 min | Most overtakes |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| **180 (base)** | 55.1 | 14.7 | 134.7 | 40.5 | -25.8 [-29.3, -22.6] | 94.2 [89.4, 99.0] | 14.6 [12.6, 16.4] | 0.00% | 30 |
| 300 | 55.1 | 14.7 | 56.5 | 12.7 | 2.0 [1.2, 2.8] | 43.8 [40.7, 46.8] | 42.3 [39.2, 45.4] | 0.04% | 30 |
| 420 | 55.1 | 14.7 | 56.1 | 12.3 | 2.4 [1.6, 3.3] | 43.8 [40.8, 46.8] | 42.8 [39.6, 46.1] | 0.05% | 30 |
| 600 | 55.1 | 14.7 | 55.6 | 12.0 | 2.7 [1.8, 3.5] | 43.6 [40.4, 46.8] | 43.0 [39.9, 46.3] | 0.07% | 30 |

## 11. Overtake bound K, with one lane fewer (overload)

On this curve only: Lanes added to every period of the schedule = -1.

| Overtake bound K (people) | Missed: `fifo` | Missed: `fifo-manual` | Missed: `virtual-fifo` | Missed: `priority-v3` | Net saved vs `fifo-manual` | Net saved vs `virtual-fifo` | Net saved vs `fifo` | Others delayed > 5 min | Most overtakes |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| **30 (base)** | 364.0 | 103.8 | 364.7 | 199.0 | -95.1 [-101.6, -88.7] | 165.8 [161.8, 169.9] | 165.0 [161.1, 169.1] | 0.89% | 30 |
| 60 | 364.0 | 103.8 | 364.7 | 139.6 | -35.8 [-39.5, -32.2] | 225.1 [218.6, 231.6] | 224.3 [217.8, 230.8] | 14.32% | 60 |
| 120 | 364.0 | 103.8 | 364.7 | 98.6 | 5.3 [2.8, 7.6] | 266.2 [258.0, 274.9] | 265.4 [256.7, 274.5] | 12.93% | 120 |
| 240 | 364.0 | 103.8 | 364.7 | 86.0 | 17.8 [15.5, 20.3] | 278.7 [269.8, 288.4] | 278.0 [268.3, 287.5] | 12.49% | 213 |

## 12. Method

- One-at-a-time sensitivity: each curve varies one parameter around the base, all else equal.
- At every point all policies run on the same passengers (common random numbers), and the same seeds are used at every point, so the differences between points are not noise of different days.
- Points that only change a policy share their simulated days, and the policies they do not change are simulated once.
- Policy parameters change the candidate; the prepare window changes every virtual queue, so that the comparison with the same queue in FIFO order stays valid. Scenario parameters change the simulated days for every policy.
- Confidence intervals: percentile bootstrap of the mean over days (2000 resamples, seed 20261121). Quantiles: linear interpolation between order statistics (Hyndman-Fan type 7).

## 13. Policies at the base

- Physical FIFO queue (status quo, policy A): `fifo` 1.1.0
- Physical FIFO queue with staff calling closing flights (status quo with manual handling, policy A'): `fifo-manual` 0.1.0
- GateFlow virtual queue in FIFO order: `virtual-fifo` 0.1.0
- GateFlow virtual queue with constrained EDF priority v3: fast track, stale-data rule and hysteresis (policy B): `priority-v3` 0.2.0

Full parameters are in the `manifest` of `sweep.json`.

## 14. Assumptions of the base scenario

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

## 15. Limitations of this model version

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

## 16. Reproducibility

| Item | Value |
|---|---|
| Sweep specification hash | `sha256:d265fb1666c32243ac42b013b092bcf135cbe777ae7919b6c6d360ff3e1959b0` |
| Base scenario hash | `sha256:9ccf37cfba384e844c1d47723edd82513efca0120c1edb1d1ce81e073d2e2991` |
| Seeds | 1-200 (200) |
| Distinct simulated days | 3400 |
| Source revision | `7e26b4fbe3d2238c424e09223e602632aa6cc18d` |
| Versions | engine 0.5.0, queue core 0.5.0, model 0.5.0, kernel 0.1.0, population generator 0.4.0, scenario schema 4 |
| Generated by | gateflow-sim 0.6.0 |

Command:

```bash
gateflow-sim sweep --spec sweeps/sensitivity-demo.yaml --seeds 1-200 --bootstrap-resamples 2000
```
