# GateFlow sensitivity sweep: The console on the lanes' measured throughput, on a VCE-like peak day harder than planned

> **SIMULATED RESULTS ON SYNTHETIC OR HYPOTHETICAL DATA. These numbers are model outputs, not measurements, and must not be presented as evidence of operational performance.**

Does the console recommend better lanes on a day slower than planned when it measures the lanes' throughput from the day (S22.5) instead of reading the checkpoint's settings, made for the plan (ADR-059)? The plan and GateFlow's settings assume a screening time of 24 seconds per person. Today's practice with staff calls (fifo-manual) runs with the plan only, with a supervisor who opens a lane when the queue is long (@reactive), with the console on the settings (@advise) and on the measured throughput (@advise-measured); GateFlow's priority calls (priority-v3) run with the console on the settings and on the measured throughput. The curves make the day harder than planned: slower screening on the day, and a roster one lane short.

Base scenario `vce-like-peak-day` (data: SYNTHETIC). Every point is 200 simulated days (seeds 1-200); the parameters vary for `fifo-manual@advise-measured`. Each table varies one parameter and keeps everything else at the base, marked **(base)**. Means per day; brackets give the 95% confidence interval of the mean (bootstrap over days). "Others delayed > 5 min" is the share of non-prioritised passengers who wait more than 5 minutes longer than with the same queue in FIFO order; "most overtakes" is the largest number of people who overtook one ticket, on the worst day.

## 1. Screening slower than planned

| Mean screening time on the day, the plan assuming the scenario's (s) | Missed: `fifo-manual` | Missed: `fifo-manual@reactive` | Missed: `fifo-manual@advise` | Missed: `fifo-manual@advise-measured` | Missed: `priority-v3@advise` | Missed: `priority-v3@advise-measured` | Net saved vs `fifo-manual@reactive` | Net saved vs `fifo-manual@advise` | Extra lane-hours: `fifo-manual@reactive` | Extra lane-hours: `fifo-manual@advise` | Extra lane-hours: `fifo-manual@advise-measured` | Extra lane-hours: `priority-v3@advise` | Extra lane-hours: `priority-v3@advise-measured` | Wait change vs `fifo-manual@reactive` (min) | Wait change vs `fifo-manual@advise` (min) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| **24 (base)** | 18.8 | 18.7 | 18.7 | 18.7 | 18.5 | 18.5 | 0.1 [0.0, 0.1] | 0.1 [0.0, 0.1] | 0.1 | 0.1 | 0.3 | 0.0 | 0.1 | -0.07 [-0.09, -0.06] | -0.06 [-0.08, -0.04] |
| 25 | 22.1 | 20.3 | 20.4 | 19.8 | 20.1 | 19.5 | 0.6 [0.4, 0.7] | 0.7 [0.5, 0.9] | 0.9 | 1.0 | 1.5 | 0.3 | 1.0 | -0.28 [-0.31, -0.25] | -0.26 [-0.29, -0.22] |
| 26 | 33.1 | 22.5 | 22.5 | 21.4 | 21.9 | 20.9 | 1.1 [0.9, 1.3] | 1.1 [0.9, 1.4] | 2.1 | 2.5 | 3.1 | 1.7 | 2.5 | -0.40 [-0.44, -0.37] | -0.37 [-0.41, -0.34] |
| 27 | 108.0 | 27.1 | 26.6 | 24.6 | 24.4 | 23.1 | 2.5 [2.2, 2.9] | 2.1 [1.7, 2.5] | 3.2 | 4.1 | 4.5 | 3.4 | 3.9 | -0.61 [-0.65, -0.57] | -0.45 [-0.49, -0.41] |

## 2. A roster one lane short

| Lanes added to every period of the schedule | Missed: `fifo-manual` | Missed: `fifo-manual@reactive` | Missed: `fifo-manual@advise` | Missed: `fifo-manual@advise-measured` | Missed: `priority-v3@advise` | Missed: `priority-v3@advise-measured` | Net saved vs `fifo-manual@reactive` | Net saved vs `fifo-manual@advise` | Extra lane-hours: `fifo-manual@reactive` | Extra lane-hours: `fifo-manual@advise` | Extra lane-hours: `fifo-manual@advise-measured` | Extra lane-hours: `priority-v3@advise` | Extra lane-hours: `priority-v3@advise-measured` | Wait change vs `fifo-manual@reactive` (min) | Wait change vs `fifo-manual@advise` (min) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| -1 | 84.9 | 24.9 | 21.2 | 21.0 | 20.3 | 20.2 | 4.0 [3.5, 4.4] | 0.2 [0.1, 0.3] | 3.7 | 4.2 | 4.6 | 3.6 | 3.8 | -0.70 [-0.73, -0.66] | -0.06 [-0.08, -0.04] |
| **0 (base)** | 18.8 | 18.7 | 18.7 | 18.7 | 18.5 | 18.5 | 0.1 [0.0, 0.1] | 0.1 [0.0, 0.1] | 0.1 | 0.1 | 0.3 | 0.0 | 0.1 | -0.07 [-0.09, -0.06] | -0.06 [-0.08, -0.04] |

## 3. Method

- One-at-a-time sensitivity: each curve varies one parameter around the base, all else equal.
- At every point all policies run on the same passengers (common random numbers), and the same seeds are used at every point, so the differences between points are not noise of different days.
- Points that only change a policy share their simulated days, and the policies they do not change are simulated once.
- Policy parameters change the candidate; the prepare window changes every virtual queue, so that the comparison with the same queue in FIFO order stays valid. Scenario parameters change the simulated days for every policy.
- Confidence intervals: percentile bootstrap of the mean over days (2000 resamples, seed 20261121). Quantiles: linear interpolation between order statistics (Hyndman-Fan type 7).

## 4. Policies at the base

- Physical FIFO queue with staff calling closing flights (status quo with manual handling, policy A'): `fifo-manual` 0.1.0
- Physical FIFO queue with staff calling closing flights (status quo with manual handling, policy A'), with extra lanes opened by a supervisor when the queue is long (today): `fifo-manual@reactive` 0.1.0
- Physical FIFO queue with staff calling closing flights (status quo with manual handling, policy A'), with extra lanes recommended by GateFlow's console: `fifo-manual@advise` 0.1.0
- Physical FIFO queue with staff calling closing flights (status quo with manual handling, policy A'), with extra lanes recommended by GateFlow's console, on the lanes' measured throughput: `fifo-manual@advise-measured` 0.1.0
- GateFlow virtual queue with constrained EDF priority v3: fast track, stale-data rule and hysteresis (policy B), with extra lanes recommended by GateFlow's console: `priority-v3@advise` 0.2.0
- GateFlow virtual queue with constrained EDF priority v3: fast track, stale-data rule and hysteresis (policy B), with extra lanes recommended by GateFlow's console, on the lanes' measured throughput: `priority-v3@advise-measured` 0.2.0

Full parameters are in the `manifest` of `sweep.json`.

## 5. Data sources and licences

Where the data of this scenario comes from, and the terms under which it may be used.

| Source | Kind | Provider | Licence or terms of use | Retrieved | Used for |
|---|---|---|---|---|---|
| Synthetic assumptions of this airport configuration (`gateflow-synthetic`) | SYNTHETIC | GateFlow | Created for GateFlow; contains no third-party data. | - | - |
| Venice Marco Polo traffic in 2025 (11.85 million passengers) (`save-traffic-2025`) | LITERATURE | SAVE S.p.A., annual figure as reported in the business plan and in the press | Published aggregate figure, cited with attribution. Used only to size the synthetic day. | 2026-11-21 | passengers.loadFactor |
| Synthetic flight list of the scenario library (`library-flights`) | SYNTHETIC | GateFlow (scenarios/flights/make-library-flights.mjs) | Created for GateFlow; contains no third-party schedule data. | - | flight list |

- `save-traffic-2025`: 11,850,336 passengers in 2025 according to the business plan (marked verified there); press coverage of SAVE's results gives 11.85 million. Not re-verified against SAVE's own publication, whose website refused automated access.

Airport configuration: `vce-like` (VCE-like airport (synthetic)), checkpoint `departures`, file `../airports/vce-like.yaml` (SHA-256 `ac6f19af1d1a9e260dfb815b1efc4bc5a41282500072bb1c70895bf978cd10ec`). The scenario gives only its day; every other parameter comes from this configuration.

Design day: 138 departures from the flight list `flights/vce-like-peak-day.csv` (SHA-256 `e3a5886b882c0135d44ff8954108f30787d51babdfa325454870803038c7ac9e`), source `library-flights`.

## 6. Assumptions of the base scenario

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
| Sweep specification hash | `sha256:fbc268f7daa7a80fd6ec55f64d52a859a78f498e4c11e0486478c57223e0e6b7` |
| Base scenario hash | `sha256:84e71ee46929c79eee7467bcd5c616b0106a690752ba9bbe7777fc3bf6b1b658` |
| Seeds | 1-200 (200) |
| Distinct simulated days | 1200 |
| Source revision | `cc259fb6d02f3bc241d6925217a156b6382c9198` |
| Versions | engine 0.5.0, queue core 0.13.0, model 0.7.0, kernel 0.1.0, population generator 0.7.0, scenario schema 5 |
| Generated by | gateflow-sim 0.17.0 |

Command:

```bash
gateflow-sim sweep --spec sweeps/vce-like-peak-console-measured.yaml --seeds 1-200 --bootstrap-resamples 2000
```
