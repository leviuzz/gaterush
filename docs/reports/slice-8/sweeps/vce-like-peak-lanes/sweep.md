# GateFlow sensitivity sweep: Extra lanes on the VCE-like peak day, recommended by GateFlow or opened by a supervisor

> **SIMULATED RESULTS ON SYNTHETIC OR HYPOTHETICAL DATA. These numbers are model outputs, not measurements, and must not be presented as evidence of operational performance.**

What do lanes opened during the day buy, and on what does it depend? Today's practice with staff calls (fifo-manual) runs with the plan only, with a supervisor who opens a lane when the queue is long (@reactive), and with GateFlow's recommendations from the forecast of arrivals (@predict). The plan of the day is made for a screening time of 24 seconds per person; the first two curves make the day harder than planned (slower screening, a roster one lane short). The other curves start from a day when screening takes 26 seconds (8% slower than planned) and vary one assumption at a time: lane outages, the staff on call (base 2 extra lanes), the time to open a lane (base about 10 minutes), the share of recommendations followed (base 4 out of 5) and GateFlow's target wait (base 10 minutes).

Base scenario `vce-like-peak-day` (data: SYNTHETIC). Every point is 200 simulated days (seeds 1-200); the parameters vary for `fifo-manual@predict`. Each table varies one parameter and keeps everything else at the base, marked **(base)**. Means per day; brackets give the 95% confidence interval of the mean (bootstrap over days). "Others delayed > 5 min" is the share of non-prioritised passengers who wait more than 5 minutes longer than with the same queue in FIFO order; "most overtakes" is the largest number of people who overtook one ticket, on the worst day.

## 1. Screening slower than planned

| Mean screening time per person (s) | Missed: `fifo-manual` | Missed: `fifo-manual@reactive` | Missed: `fifo-manual@predict` | Net saved vs `fifo-manual@reactive` | Net saved vs `fifo-manual` | Extra lane-hours: `fifo-manual@reactive` | Extra lane-hours: `fifo-manual@predict` | Wait change vs `fifo-manual@reactive` (min) | Wait change vs `fifo-manual` (min) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| **24 (base)** | 18.8 | 18.7 | 18.7 | 0.1 [0.0, 0.1] | 0.1 [0.1, 0.2] | 0.1 | 0.3 | -0.08 [-0.10, -0.06] | -0.10 [-0.12, -0.07] |
| 25 | 22.1 | 20.2 | 19.4 | 0.8 [0.6, 1.0] | 2.6 [2.2, 3.0] | 1.0 | 1.4 | -0.33 [-0.36, -0.29] | -0.75 [-0.80, -0.69] |
| 26 | 33.1 | 22.2 | 20.9 | 1.3 [1.1, 1.6] | 12.2 [11.0, 13.4] | 2.2 | 2.6 | -0.41 [-0.44, -0.39] | -2.38 [-2.50, -2.26] |
| 27 | 108.0 | 26.5 | 23.6 | 2.9 [2.5, 3.3] | 84.4 [75.4, 93.6] | 3.4 | 4.0 | -0.69 [-0.73, -0.65] | -8.89 [-9.32, -8.47] |

## 2. A roster one lane short

| Lanes added to every period of the schedule | Missed: `fifo-manual` | Missed: `fifo-manual@reactive` | Missed: `fifo-manual@predict` | Net saved vs `fifo-manual@reactive` | Net saved vs `fifo-manual` | Extra lane-hours: `fifo-manual@reactive` | Extra lane-hours: `fifo-manual@predict` | Wait change vs `fifo-manual@reactive` (min) | Wait change vs `fifo-manual` (min) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| -1 | 84.9 | 24.9 | 21.4 | 3.5 [3.1, 4.0] | 63.5 [58.8, 68.6] | 3.7 | 4.5 | -0.62 [-0.66, -0.59] | -4.29 [-4.49, -4.08] |
| **0 (base)** | 18.8 | 18.7 | 18.7 | 0.1 [0.0, 0.1] | 0.1 [0.1, 0.2] | 0.1 | 0.3 | -0.08 [-0.10, -0.06] | -0.10 [-0.12, -0.07] |

## 3. Lane outages on a day of slower screening

On this curve only: Mean screening time per person (s) = 26.

| Lane outages per day | Missed: `fifo-manual` | Missed: `fifo-manual@reactive` | Missed: `fifo-manual@predict` | Net saved vs `fifo-manual@reactive` | Net saved vs `fifo-manual` | Extra lane-hours: `fifo-manual@reactive` | Extra lane-hours: `fifo-manual@predict` | Wait change vs `fifo-manual@reactive` (min) | Wait change vs `fifo-manual` (min) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| **0 (base)** | 33.1 | 22.2 | 20.9 | 1.3 [1.1, 1.6] | 12.2 [11.1, 13.4] | 2.2 | 2.6 | -0.41 [-0.44, -0.39] | -2.38 [-2.51, -2.25] |
| 1 | 34.8 | 22.4 | 21.0 | 1.5 [1.2, 1.8] | 13.8 [12.5, 15.1] | 2.3 | 2.8 | -0.44 [-0.47, -0.41] | -2.57 [-2.70, -2.44] |
| 2 | 37.0 | 22.6 | 21.0 | 1.6 [1.3, 1.9] | 16.0 [14.3, 17.7] | 2.4 | 2.9 | -0.46 [-0.49, -0.43] | -2.74 [-2.89, -2.58] |
| 4 | 40.3 | 23.2 | 21.3 | 1.9 [1.6, 2.3] | 19.0 [16.8, 21.3] | 2.4 | 3.2 | -0.52 [-0.56, -0.49] | -3.07 [-3.27, -2.88] |

## 4. Staff on call on a day of slower screening

On this curve only: Mean screening time per person (s) = 26.

| Extra lanes the staff on call can open | Missed: `fifo-manual` | Missed: `fifo-manual@reactive` | Missed: `fifo-manual@predict` | Net saved vs `fifo-manual@reactive` | Net saved vs `fifo-manual` | Extra lane-hours: `fifo-manual@reactive` | Extra lane-hours: `fifo-manual@predict` | Wait change vs `fifo-manual@reactive` (min) | Wait change vs `fifo-manual` (min) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 0 | 33.1 | 33.1 | 33.1 | 0.0 [0.0, 0.0] | 0.0 [0.0, 0.0] | 0.0 | 0.0 | 0.00 [0.00, 0.00] | 0.00 [0.00, 0.00] |
| 1 | 33.1 | 23.5 | 21.5 | 2.0 [1.7, 2.3] | 11.6 [10.5, 12.7] | 1.7 | 2.0 | -0.49 [-0.51, -0.46] | -2.14 [-2.25, -2.04] |
| **2 (base)** | 33.1 | 22.2 | 20.9 | 1.3 [1.1, 1.6] | 12.2 [11.0, 13.5] | 2.2 | 2.6 | -0.41 [-0.44, -0.39] | -2.38 [-2.50, -2.26] |
| 3 | 33.1 | 22.2 | 20.9 | 1.3 [1.1, 1.6] | 12.2 [11.1, 13.5] | 2.2 | 2.7 | -0.42 [-0.44, -0.39] | -2.38 [-2.51, -2.26] |

## 5. Time to open a lane on a day of slower screening

On this curve only: Mean screening time per person (s) = 26.

| Median time to open an extra lane (min) | Missed: `fifo-manual` | Missed: `fifo-manual@reactive` | Missed: `fifo-manual@predict` | Net saved vs `fifo-manual@reactive` | Net saved vs `fifo-manual` | Extra lane-hours: `fifo-manual@reactive` | Extra lane-hours: `fifo-manual@predict` | Wait change vs `fifo-manual@reactive` (min) | Wait change vs `fifo-manual` (min) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 5 | 33.1 | 21.9 | 20.7 | 1.2 [0.9, 1.5] | 12.3 [11.2, 13.6] | 2.2 | 2.5 | -0.38 [-0.41, -0.36] | -2.41 [-2.53, -2.28] |
| **10 (base)** | 33.1 | 22.2 | 20.9 | 1.3 [1.1, 1.6] | 12.2 [11.0, 13.5] | 2.2 | 2.6 | -0.41 [-0.44, -0.39] | -2.38 [-2.50, -2.26] |
| 15 | 33.1 | 22.4 | 21.1 | 1.3 [1.0, 1.6] | 12.0 [10.9, 13.2] | 2.2 | 2.6 | -0.44 [-0.47, -0.41] | -2.34 [-2.46, -2.23] |
| 20 | 33.1 | 22.5 | 21.2 | 1.3 [1.1, 1.6] | 11.9 [10.7, 13.1] | 2.1 | 2.7 | -0.48 [-0.51, -0.45] | -2.31 [-2.43, -2.19] |

## 6. Recommendations followed on a day of slower screening

On this curve only: Mean screening time per person (s) = 26.

| Share of GateFlow's lane recommendations followed | Missed: `fifo-manual` | Missed: `fifo-manual@reactive` | Missed: `fifo-manual@predict` | Net saved vs `fifo-manual@reactive` | Net saved vs `fifo-manual` | Extra lane-hours: `fifo-manual@reactive` | Extra lane-hours: `fifo-manual@predict` | Wait change vs `fifo-manual@reactive` (min) | Wait change vs `fifo-manual` (min) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 0.4 | 33.1 | 22.2 | 21.4 | 0.8 [0.4, 1.1] | 11.7 [10.4, 12.9] | 2.2 | 2.9 | -0.30 [-0.34, -0.27] | -2.27 [-2.40, -2.15] |
| 0.6 | 33.1 | 22.2 | 21.1 | 1.1 [0.8, 1.3] | 12.0 [10.8, 13.2] | 2.2 | 2.6 | -0.38 [-0.41, -0.35] | -2.34 [-2.47, -2.21] |
| **0.8 (base)** | 33.1 | 22.2 | 20.9 | 1.3 [1.1, 1.6] | 12.2 [11.1, 13.4] | 2.2 | 2.6 | -0.41 [-0.44, -0.39] | -2.38 [-2.50, -2.25] |
| 1 | 33.1 | 22.2 | 20.7 | 1.4 [1.2, 1.8] | 12.3 [11.2, 13.5] | 2.2 | 2.5 | -0.45 [-0.47, -0.42] | -2.41 [-2.53, -2.29] |

## 7. GateFlow's target wait on a day of slower screening

On this curve only: Mean screening time per person (s) = 26.

| GateFlow's target wait for extra lanes (min) | Missed: `fifo-manual` | Missed: `fifo-manual@reactive` | Missed: `fifo-manual@predict` | Net saved vs `fifo-manual@reactive` | Net saved vs `fifo-manual` | Extra lane-hours: `fifo-manual@reactive` | Extra lane-hours: `fifo-manual@predict` | Wait change vs `fifo-manual@reactive` (min) | Wait change vs `fifo-manual` (min) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 5 | 33.1 | 22.2 | 19.1 | 3.1 [2.7, 3.5] | 14.0 [12.8, 15.3] | 2.2 | 3.9 | -0.89 [-0.91, -0.87] | -2.85 [-2.98, -2.73] |
| 8 | 33.1 | 22.2 | 19.9 | 2.3 [2.0, 2.6] | 13.2 [12.0, 14.4] | 2.2 | 3.2 | -0.65 [-0.67, -0.62] | -2.61 [-2.74, -2.49] |
| **10 (base)** | 33.1 | 22.2 | 20.9 | 1.3 [1.1, 1.6] | 12.2 [11.1, 13.5] | 2.2 | 2.6 | -0.41 [-0.44, -0.39] | -2.38 [-2.51, -2.26] |
| 15 | 33.1 | 22.2 | 24.3 | -2.1 [-2.6, -1.6] | 8.8 [7.6, 10.0] | 2.2 | 1.4 | 0.47 [0.39, 0.56] | -1.49 [-1.64, -1.34] |

## 8. Method

- One-at-a-time sensitivity: each curve varies one parameter around the base, all else equal.
- At every point all policies run on the same passengers (common random numbers), and the same seeds are used at every point, so the differences between points are not noise of different days.
- Points that only change a policy share their simulated days, and the policies they do not change are simulated once.
- Policy parameters change the candidate; the prepare window changes every virtual queue, so that the comparison with the same queue in FIFO order stays valid. Scenario parameters change the simulated days for every policy.
- Confidence intervals: percentile bootstrap of the mean over days (2000 resamples, seed 20261121). Quantiles: linear interpolation between order statistics (Hyndman-Fan type 7).

## 9. Policies at the base

- Physical FIFO queue with staff calling closing flights (status quo with manual handling, policy A'): `fifo-manual` 0.1.0
- Physical FIFO queue with staff calling closing flights (status quo with manual handling, policy A'), with extra lanes opened by a supervisor when the queue is long (today): `fifo-manual@reactive` 0.1.0
- Physical FIFO queue with staff calling closing flights (status quo with manual handling, policy A'), with extra lanes recommended by GateFlow's forecast: `fifo-manual@predict` 0.1.0

Full parameters are in the `manifest` of `sweep.json`.

## 10. Data sources and licences

Where the data of this scenario comes from, and the terms under which it may be used.

| Source | Kind | Provider | Licence or terms of use | Retrieved | Used for |
|---|---|---|---|---|---|
| Synthetic assumptions of this airport configuration (`gateflow-synthetic`) | SYNTHETIC | GateFlow | Created for GateFlow; contains no third-party data. | - | - |
| Venice Marco Polo traffic in 2025 (11.85 million passengers) (`save-traffic-2025`) | LITERATURE | SAVE S.p.A., annual figure as reported in the business plan and in the press | Published aggregate figure, cited with attribution. Used only to size the synthetic day. | 2026-11-21 | passengers.loadFactor |
| Synthetic flight list of the scenario library (`library-flights`) | SYNTHETIC | GateFlow (scenarios/flights/make-library-flights.mjs) | Created for GateFlow; contains no third-party schedule data. | - | flight list |

- `save-traffic-2025`: 11,850,336 passengers in 2025 according to the business plan (marked verified there); press coverage of SAVE's results gives 11.85 million. Not re-verified against SAVE's own publication, whose website refused automated access.

Airport configuration: `vce-like` (VCE-like airport (synthetic)), checkpoint `departures`, file `../airports/vce-like.yaml` (SHA-256 `ac6f19af1d1a9e260dfb815b1efc4bc5a41282500072bb1c70895bf978cd10ec`). The scenario gives only its day; every other parameter comes from this configuration.

Design day: 138 departures from the flight list `flights/vce-like-peak-day.csv` (SHA-256 `e3a5886b882c0135d44ff8954108f30787d51babdfa325454870803038c7ac9e`), source `library-flights`.

## 11. Assumptions of the base scenario

| Parameter | Source | Note |
|---|---|---|
| checkpoint.lanesAvailable | SYNTHETIC | Lanes the checkpoint has (assumed): the roster plans at most 12, the others open only as extra lanes. |
| checkpoint.laneSchedule | SYNTHETIC | Planned for this day with the lane plan rule of the checkpoint (airports/vce-like.yaml): 177.0 lane-hours. gateflow-sim lanes --scenario <this file> prints the plan again. |
| checkpoint.lanePlanRule | SYNTHETIC | Assumed planning rule, not the airport's: every hour, enough lanes to screen the expected arrivals at 90% utilisation, at least 2 and at most 12 lanes. |
| checkpoint.laneStaffing | SYNTHETIC | Assumed: staff on call can open 2 extra lanes beyond the plan, about 10 minutes after the decision (5 to 20 on most days); an extra lane stays open at least 30 minutes; the duty manager follows 4 recommendations of GateFlow out of 5. |
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
| passengers.strategicLateArrival | SYNTHETIC | Nobody arrives late on purpose. |
| operations.boardingCloseMinutesBeforeStd | SYNTHETIC | Boarding closes 20 minutes before the scheduled departure, for every flight. |
| operations.deadlineKnowledge | SYNTHETIC | The system applies the closing rule to the schedule; without disruptions it matches the ground truth exactly. |
| disruptions.flightDelays | SYNTHETIC | No delays unless a day says otherwise (see vce-like-disrupted-day). |
| disruptions.gateChanges | SYNTHETIC | No gate changes unless a day says otherwise. |
| disruptions.laneOutages | SYNTHETIC | No unplanned lane outages unless a day says otherwise. |
| disruptions.feedOutages | SYNTHETIC | The flight feed never goes down unless a day says otherwise. |
| gateflow | SYNTHETIC | GateFlow defaults (priority v3 0.2.0, the virtual queue of ADR-017 and the lane recommendations of ADR-039), to be approved by the airport for this checkpoint. |
| todayPractice | SYNTHETIC | Baseline A' as in ADR-022: every 5 minutes staff call the flights closing within 20 minutes. With a supervisor (@reactive, ADR-039), an extra lane opens when the queue shows more than 10 minutes and closes below 2. To replace with how this airport handles urgent passengers and long queues. |
| fairnessTarget | SYNTHETIC | The criterion of ADR-025, to be approved by the airport. |

## 12. Limitations of this model version

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

## 13. Reproducibility

| Item | Value |
|---|---|
| Sweep specification hash | `sha256:0c58479a5aa18bd756cd5bcf590ab211808a1b667956fcda2b5f0377d168dfac` |
| Base scenario hash | `sha256:84e71ee46929c79eee7467bcd5c616b0106a690752ba9bbe7777fc3bf6b1b658` |
| Seeds | 1-200 (200) |
| Distinct simulated days | 3400 |
| Source revision | `b3c9f7e3b0fae64477fb45231fcb31cb4864982e` |
| Versions | engine 0.5.0, queue core 0.6.0, model 0.6.0, kernel 0.1.0, population generator 0.6.0, scenario schema 5 |
| Generated by | gateflow-sim 0.8.0 |

Command:

```bash
gateflow-sim sweep --spec sweeps/vce-like-peak-lanes.yaml --seeds 1-200 --bootstrap-resamples 2000
```
