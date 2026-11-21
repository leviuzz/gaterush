# GateFlow sensitivity sweep: Priority v3 on the VCE-like peak day, as capacity and arrivals vary

> **SIMULATED RESULTS ON SYNTHETIC OR HYPOTHETICAL DATA. These numbers are model outputs, not measurements, and must not be presented as evidence of operational performance.**

Where does a VCE-like checkpoint have to sit for GateFlow to matter? Each curve varies one assumption of the peak day around its base, all else equal: the lanes of the hourly plan, the mean screening time per person (the throughput of a lane), and when passengers arrive.

Base scenario `vce-like-peak-day` (data: SYNTHETIC). Every point is 200 simulated days (seeds 1-200); the parameters vary for `priority-v3`. Each table varies one parameter and keeps everything else at the base, marked **(base)**. Means per day; brackets give the 95% confidence interval of the mean (bootstrap over days). "Others delayed > 5 min" is the share of non-prioritised passengers who wait more than 5 minutes longer than with the same queue in FIFO order; "most overtakes" is the largest number of people who overtook one ticket, on the worst day.

## 1. Lanes of the plan

| Lanes added to every period of the schedule | Missed: `fifo` | Missed: `fifo-manual` | Missed: `virtual-fifo` | Missed: `priority-v3` | Net saved vs `fifo-manual` | Net saved vs `virtual-fifo` | Net saved vs `fifo` | Others delayed > 5 min | Most overtakes |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| -1 | 204.6 | 84.9 | 210.4 | 61.8 | 23.1 [21.2, 25.1] | 148.6 [139.9, 157.7] | 142.8 [134.0, 151.7] | 0.53% | 30 |
| **0 (base)** | 25.0 | 18.8 | 26.0 | 18.6 | 0.2 [-0.1, 0.6] | 7.4 [6.8, 8.2] | 6.4 [5.8, 7.2] | 0.00% | 22 |
| +1 | 17.8 | 17.2 | 17.8 | 16.9 | 0.2 [0.1, 0.4] | 0.9 [0.7, 1.1] | 0.8 [0.7, 1.1] | 0.00% | 8 |
| +2 | 16.8 | 16.8 | 16.8 | 16.7 | 0.1 [0.0, 0.1] | 0.1 [0.1, 0.2] | 0.1 [0.1, 0.2] | 0.00% | 7 |

## 2. Mean screening time per person

| Mean screening time per person (s) | Missed: `fifo` | Missed: `fifo-manual` | Missed: `virtual-fifo` | Missed: `priority-v3` | Net saved vs `fifo-manual` | Net saved vs `virtual-fifo` | Net saved vs `fifo` | Others delayed > 5 min | Most overtakes |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 22 | 18.2 | 17.1 | 18.2 | 16.9 | 0.3 [0.1, 0.4] | 1.3 [1.1, 1.5] | 1.3 [1.1, 1.5] | 0.00% | 10 |
| **24 (base)** | 25.0 | 18.8 | 26.0 | 18.6 | 0.2 [-0.1, 0.6] | 7.4 [6.8, 8.1] | 6.4 [5.7, 7.2] | 0.00% | 22 |
| 25 | 39.5 | 22.1 | 41.8 | 20.3 | 1.7 [1.2, 2.3] | 21.5 [19.9, 23.1] | 19.2 [17.7, 20.8] | 0.00% | 30 |
| 26 | 91.8 | 33.1 | 95.6 | 25.1 | 7.9 [6.8, 9.1] | 70.5 [65.5, 75.6] | 66.6 [61.9, 71.6] | 0.00% | 30 |
| 27 | 426.8 | 108.0 | 436.3 | 72.6 | 35.5 [32.2, 38.7] | 363.8 [340.1, 389.4] | 354.3 [329.7, 379.1] | 0.07% | 30 |

## 3. When passengers arrive

| Arrival shift (min; positive = earlier) | Missed: `fifo` | Missed: `fifo-manual` | Missed: `virtual-fifo` | Missed: `priority-v3` | Net saved vs `fifo-manual` | Net saved vs `virtual-fifo` | Net saved vs `fifo` | Others delayed > 5 min | Most overtakes |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| -15 | 197.3 | 140.4 | 199.8 | 137.1 | 3.3 [2.3, 4.3] | 62.7 [59.9, 65.2] | 60.3 [57.7, 63.0] | 0.02% | 30 |
| -10 | 97.8 | 68.8 | 99.5 | 66.7 | 2.1 [1.4, 2.9] | 32.8 [31.0, 34.7] | 31.0 [29.3, 32.9] | 0.01% | 30 |
| **0 (base)** | 25.0 | 18.8 | 26.0 | 18.6 | 0.2 [-0.1, 0.6] | 7.4 [6.8, 8.1] | 6.4 [5.7, 7.1] | 0.00% | 22 |
| +10 | 8.3 | 6.7 | 8.8 | 6.5 | 0.2 [0.0, 0.4] | 2.3 [2.0, 2.6] | 1.8 [1.5, 2.2] | 0.00% | 12 |

## 4. Method

- One-at-a-time sensitivity: each curve varies one parameter around the base, all else equal.
- At every point all policies run on the same passengers (common random numbers), and the same seeds are used at every point, so the differences between points are not noise of different days.
- Points that only change a policy share their simulated days, and the policies they do not change are simulated once.
- Policy parameters change the candidate; the prepare window changes every virtual queue, so that the comparison with the same queue in FIFO order stays valid. Scenario parameters change the simulated days for every policy.
- Confidence intervals: percentile bootstrap of the mean over days (2000 resamples, seed 20261121). Quantiles: linear interpolation between order statistics (Hyndman-Fan type 7).

## 5. Policies at the base

- Physical FIFO queue (status quo, policy A): `fifo` 1.1.0
- Physical FIFO queue with staff calling closing flights (status quo with manual handling, policy A'): `fifo-manual` 0.1.0
- GateFlow virtual queue in FIFO order: `virtual-fifo` 0.1.0
- GateFlow virtual queue with constrained EDF priority v3: fast track, stale-data rule and hysteresis (policy B): `priority-v3` 0.2.0

Full parameters are in the `manifest` of `sweep.json`.

## 6. Data sources and licences

Where the data of this scenario comes from, and the terms under which it may be used.

| Source | Kind | Provider | Licence or terms of use | Retrieved | Used for |
|---|---|---|---|---|---|
| Synthetic assumptions of this scenario (`gateflow-synthetic`) | SYNTHETIC | GateFlow | Created for GateFlow; contains no third-party data. | - | - |
| Synthetic flight list of the scenario library (`library-flights`) | SYNTHETIC | GateFlow (scenarios/flights/make-library-flights.mjs) | Created for GateFlow; contains no third-party schedule data. | - | flight list |
| Venice Marco Polo traffic in 2025 (11.85 million passengers) (`save-traffic-2025`) | LITERATURE | SAVE S.p.A., annual figure as reported in the business plan and in the press | Published aggregate figure, cited with attribution. Used only to size the synthetic day. | 2026-11-21 | passengers.loadFactor |

- `save-traffic-2025`: 11,850,336 passengers in 2025 according to the business plan (marked verified there); press coverage of SAVE's results gives 11.85 million. Not re-verified against SAVE's own publication, whose website refused automated access.

Design day: 138 departures from the flight list `flights/vce-like-peak-day.csv` (SHA-256 `e3a5886b882c0135d44ff8954108f30787d51babdfa325454870803038c7ac9e`), source `library-flights`.

## 7. Assumptions of the base scenario

| Parameter | Source | Note |
|---|---|---|
| checkpoint.laneSchedule | SYNTHETIC | Planned from the expected arrivals of the day: in every hour, enough lanes to screen the passengers arriving in it at 90% utilisation, at least 2 and at most 12 (the lanes the checkpoint has). 177.0 lane-hours. Assumed planning rule, not the airport's. |
| checkpoint.serviceTimeMeanSeconds | SYNTHETIC | About 150 passengers per hour per lane (assumed modern lanes with several divesting positions). |
| checkpoint.serviceTimeCv | SYNTHETIC |  |
| schedule.seats | SYNTHETIC | Assumed typical configurations by ICAO type designator (one class on short haul, two or three on long haul), not airline data. Replace with the airport's seat data. |
| schedule.gateZones | SYNTHETIC | Nominal walk from the checkpoint exit: A and B are Schengen gates, C non-Schengen gates after passport control (its queue is not modelled). Long-haul flights use zone C; the others draw a zone with these shares. |
| passengers.loadFactor | SYNTHETIC (save-traffic-2025) | Summer load factors, drawn per flight and day. With the flight list the day has about 22,000 departing passengers, about 1.35 times the average day of 2025 (11.85 million passengers, half of them departing, over 365 days): assumed peak-day factor. |
| passengers.transferShare | SYNTHETIC | Few connecting passengers cross this checkpoint (an origin-and-destination airport). |
| passengers.showUp.departing | SYNTHETIC | Arrival at the checkpoint = STD minus (25 min + log-normal with median 70 min), as in the demo scenario. |
| passengers.showUp.transfer | SYNTHETIC | Connecting passengers arrive later, after their inbound flight. |
| passengers.walkSpeedSigma | SYNTHETIC | Individual walking time = nominal zone time x log-normal(median 1, sigma). |
| passengers.callResponse | SYNTHETIC | Virtual queue only. As in the demo scenario; to be measured in a pilot. |
| passengers.groups | SYNTHETIC | More couples and families than on a normal day (leisure season). |
| passengers.assistedShare | SYNTHETIC | Parties taking the assisted path (PRM and similar), as in the demo scenario. |
| passengers.strategicLateArrival | SYNTHETIC | Nobody arrives late on purpose in this scenario. |
| operations.boardingCloseMinutesBeforeStd | SYNTHETIC | Boarding closes 20 minutes before the scheduled departure, for every flight. |
| operations.deadlineKnowledge | SYNTHETIC | The system applies the closing rule to the schedule; without disruptions it matches the ground truth exactly. |
| disruptions.flightDelays | SYNTHETIC | No delays in this scenario (see vce-like-disrupted-day). |
| disruptions.gateChanges | SYNTHETIC | No gate changes in this scenario. |
| disruptions.laneOutages | SYNTHETIC | No unplanned lane outages in this scenario. |
| disruptions.feedOutages | SYNTHETIC | The flight feed never goes down in this scenario. |

## 8. Limitations of this model version

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

## 9. Reproducibility

| Item | Value |
|---|---|
| Sweep specification hash | `sha256:50c49f0d7082815847f7069852bdce82249faa27e7ca223cf7da531f19d7b56f` |
| Base scenario hash | `sha256:dd83dfc732fb469046f2c9ebfe603636ed000b341d7480215e98ff22fb69b4be` |
| Seeds | 1-200 (200) |
| Distinct simulated days | 2200 |
| Source revision | `44eaeca5076ca2d3f342160edffdc650600a3e7a` |
| Versions | engine 0.5.0, queue core 0.5.0, model 0.5.0, kernel 0.1.0, population generator 0.5.0, scenario schema 5 |
| Generated by | gateflow-sim 0.7.0 |

Command:

```bash
gateflow-sim sweep --spec sweeps/vce-like-peak-capacity.yaml --seeds 1-200 --bootstrap-resamples 2000
```
