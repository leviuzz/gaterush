# GateFlow sensitivity sweep: The console's lane recommendations on the TSF-like peak day, followed or not

> **SIMULATED RESULTS ON SYNTHETIC OR HYPOTHETICAL DATA. These numbers are model outputs, not measurements, and must not be presented as evidence of operational performance.**

What do the console's recommendations of lanes buy (S22.3), and how much of it depends on the duty manager following them? Today's practice with staff calls (fifo-manual) runs with the plan only, with a supervisor who opens a lane when the queue is long (@reactive), and with the recommendations of GateFlow's console (@advise), as the share of recommendations followed varies (base 4 out of 5; none followed is the plan only).

Base scenario `tsf-like-peak-day` (data: SYNTHETIC). Every point is 200 simulated days (seeds 1-200); the parameters vary for `fifo-manual@advise`. Each table varies one parameter and keeps everything else at the base, marked **(base)**. Means per day; brackets give the 95% confidence interval of the mean (bootstrap over days). "Others delayed > 5 min" is the share of non-prioritised passengers who wait more than 5 minutes longer than with the same queue in FIFO order; "most overtakes" is the largest number of people who overtook one ticket, on the worst day.

## 1. Recommendations followed

| Share of GateFlow's lane recommendations followed | Missed: `fifo-manual` | Missed: `fifo-manual@reactive` | Missed: `fifo-manual@advise` | Net saved vs `fifo-manual@reactive` | Net saved vs `fifo-manual` | Extra lane-hours: `fifo-manual@reactive` | Extra lane-hours: `fifo-manual@advise` | Wait change vs `fifo-manual@reactive` (min) | Wait change vs `fifo-manual` (min) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 0 | 0.0 | 0.0 | 0.0 | 0.0 [-0.1, 0.0] | 0.0 [0.0, 0.0] | 1.1 | 0.0 | 1.61 [1.53, 1.68] | 0.00 [0.00, 0.00] |
| 0.5 | 0.0 | 0.0 | 0.0 | 0.0 [0.0, 0.0] | 0.0 [0.0, 0.1] | 1.1 | 1.9 | -0.79 [-0.84, -0.73] | -2.40 [-2.50, -2.30] |
| **0.8 (base)** | 0.0 | 0.0 | 0.0 | 0.0 [0.0, 0.0] | 0.0 [0.0, 0.1] | 1.1 | 1.7 | -0.93 [-0.96, -0.90] | -2.54 [-2.63, -2.44] |
| 1 | 0.0 | 0.0 | 0.0 | 0.0 [0.0, 0.0] | 0.0 [0.0, 0.1] | 1.1 | 1.7 | -0.94 [-0.97, -0.92] | -2.55 [-2.65, -2.45] |

## 2. Method

- One-at-a-time sensitivity: each curve varies one parameter around the base, all else equal.
- At every point all policies run on the same passengers (common random numbers), and the same seeds are used at every point, so the differences between points are not noise of different days.
- Points that only change a policy share their simulated days, and the policies they do not change are simulated once.
- Policy parameters change the candidate; the prepare window changes every virtual queue, so that the comparison with the same queue in FIFO order stays valid. Scenario parameters change the simulated days for every policy.
- Confidence intervals: percentile bootstrap of the mean over days (2000 resamples, seed 20261121). Quantiles: linear interpolation between order statistics (Hyndman-Fan type 7).

## 3. Policies at the base

- Physical FIFO queue with staff calling closing flights (status quo with manual handling, policy A'): `fifo-manual` 0.1.0
- Physical FIFO queue with staff calling closing flights (status quo with manual handling, policy A'), with extra lanes opened by a supervisor when the queue is long (today): `fifo-manual@reactive` 0.1.0
- Physical FIFO queue with staff calling closing flights (status quo with manual handling, policy A'), with extra lanes recommended by GateFlow's console: `fifo-manual@advise` 0.1.0

Full parameters are in the `manifest` of `sweep.json`.

## 4. Data sources and licences

Where the data of this scenario comes from, and the terms under which it may be used.

| Source | Kind | Provider | Licence or terms of use | Retrieved | Used for |
|---|---|---|---|---|---|
| Synthetic assumptions of this airport configuration (`gateflow-synthetic`) | SYNTHETIC | GateFlow | Created for GateFlow; contains no third-party data. | - | - |
| Treviso Canova traffic in 2025 (3.2 million passengers) (`save-traffic-2025`) | LITERATURE | SAVE S.p.A., annual figure as reported in the business plan and in the press | Published aggregate figure, cited with attribution. Used only to size the synthetic day. | 2026-11-21 | passengers.loadFactor |
| Synthetic flight list of the scenario library (`library-flights`) | SYNTHETIC | GateFlow (scenarios/flights/make-library-flights.mjs) | Created for GateFlow; contains no third-party schedule data. | - | flight list |

- `save-traffic-2025`: 3,200,130 passengers in 2025 according to the business plan (marked verified there); press coverage of SAVE's results gives over 3.2 million. Not re-verified against SAVE's own publication, whose website refused automated access.

Airport configuration: `tsf-like` (TSF-like airport (synthetic)), checkpoint `departures`, file `../airports/tsf-like.yaml` (SHA-256 `9be8f777574c7e2f62ebf33d44507485e4ced2dee49bdbe07893f4a97fe040a3`). The scenario gives only its day; every other parameter comes from this configuration.

Design day: 34 departures from the flight list `flights/tsf-like-peak-day.csv` (SHA-256 `cb6cd9c8a623daec1e15158a0f3ac583c4ee2fd75ca0f775955fb82c1a5513a9`), source `library-flights`.

## 5. Assumptions of the base scenario

| Parameter | Source | Note |
|---|---|---|
| checkpoint.lanesAvailable | SYNTHETIC | Lanes the checkpoint has (assumed): the roster plans at most 5, the others open only as extra lanes. |
| checkpoint.laneSchedule | SYNTHETIC | Planned for this day with the lane plan rule of the checkpoint (airports/tsf-like.yaml): 69.0 lane-hours. gateflow-sim lanes --scenario <this file> prints the plan again. |
| checkpoint.lanePlanRule | SYNTHETIC | Assumed planning rule, not the airport's: every hour, enough lanes to screen the expected arrivals at 90% utilisation, at least 1 and at most 5 lanes. |
| checkpoint.laneStaffing | SYNTHETIC | Assumed: staff on call can open 1 extra lane beyond the plan, about 10 minutes after the decision (5 to 20 on most days); an extra lane stays open at least 30 minutes; the duty manager follows 4 recommendations of GateFlow out of 5. |
| checkpoint.serviceTimeMeanSeconds | SYNTHETIC | About 120 passengers per hour per lane (assumed conventional lanes of a smaller airport). |
| checkpoint.serviceTimeCv | SYNTHETIC |  |
| schedule.seats | SYNTHETIC | Assumed single-class high-density configurations by ICAO type designator, not airline data. Replace with the airport's seat data. |
| schedule.gateZones | SYNTHETIC | Nominal walk from the checkpoint exit; B are non-Schengen gates after passport control (its queue is not modelled). |
| passengers.loadFactor | SYNTHETIC (save-traffic-2025) | Summer load factors of a low-cost base, drawn per flight and day. With the flight list the day has about 6,000 departing passengers, about 1.35 times the average day of 2025 (3.2 million passengers, half of them departing, over 365 days): assumed peak-day factor. |
| passengers.transferShare | SYNTHETIC | A point-to-point low-cost airport; no connecting passengers. |
| passengers.showUp.departing | SYNTHETIC | Arrival at the checkpoint = STD minus (25 min + log-normal with median 70 min), as in the demo scenario. |
| passengers.showUp.transfer | SYNTHETIC | Connecting passengers arrive later, after their inbound flight. |
| passengers.walkSpeedSigma | SYNTHETIC | Individual walking time = nominal zone time x log-normal(median 1, sigma). |
| passengers.callResponse | SYNTHETIC | Virtual queue only. As in the demo scenario; to be measured in a pilot. |
| passengers.groups | SYNTHETIC | More couples and families than on a normal day (leisure season). |
| passengers.assistedShare | SYNTHETIC | Parties taking the assisted path (PRM and similar), as in the demo scenario. |
| passengers.strategicLateArrival | SYNTHETIC | Nobody arrives late on purpose in this scenario. |
| operations.boardingCloseMinutesBeforeStd | SYNTHETIC | Boarding closes 20 minutes before the scheduled departure, for every flight. |
| operations.deadlineKnowledge | SYNTHETIC | The system applies the closing rule to the schedule; without disruptions it matches the ground truth exactly. |
| disruptions.flightDelays | SYNTHETIC | No delays in this scenario. |
| disruptions.gateChanges | SYNTHETIC | No gate changes in this scenario. |
| disruptions.laneOutages | SYNTHETIC | No unplanned lane outages in this scenario. |
| disruptions.feedOutages | SYNTHETIC | The flight feed never goes down in this scenario. |
| gateflow | SYNTHETIC | GateFlow defaults (priority v3 0.2.0, the virtual queue of ADR-017 and the lane recommendations of ADR-039), to be approved by the airport for this checkpoint. |
| todayPractice | SYNTHETIC | Baseline A' as in ADR-022: every 5 minutes staff call the flights closing within 20 minutes. With a supervisor (@reactive, ADR-039), an extra lane opens when the queue shows more than 10 minutes and closes below 2. To replace with how this airport handles urgent passengers and long queues. |
| fairnessTarget | SYNTHETIC | The criterion of ADR-025, to be approved by the airport. |

## 6. Limitations of this model version

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

## 7. Reproducibility

| Item | Value |
|---|---|
| Sweep specification hash | `sha256:f9b60a7462f7795790580b99cb57bb4c6fb53debcea9a7bdae2fccac1acc90d5` |
| Base scenario hash | `sha256:d305399bbbdf94f7f8d6f51ac2bdc95e28ae264f990090c55c6706ddd79aed8e` |
| Seeds | 1-200 (200) |
| Distinct simulated days | 800 |
| Source revision | `529b2323a5489dd0be5f8adeb13d2d64f946fad5` |
| Versions | engine 0.5.0, queue core 0.12.0, model 0.7.0, kernel 0.1.0, population generator 0.6.0, scenario schema 5 |
| Generated by | gateflow-sim 0.14.0 |

Command:

```bash
gateflow-sim sweep --spec sweeps/tsf-like-peak-console.yaml --seeds 1-200 --bootstrap-resamples 2000
```
