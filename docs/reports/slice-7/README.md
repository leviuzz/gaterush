# Slice S7 reports (SIMULATED, synthetic data)

Reports produced by `gateflow-sim` 0.7.0 from clean checkouts, as recorded in each manifest:
- commit `44eaeca5076ca2d3f342160edffdc650600a3e7a` for the five experiments and the
  `vce-like-peak-capacity` sweep;
- commit `2ccc1db5dcc2e9876f12fe9d9c8081c607fb6320` for the `mx-like-hub` sweep, after its
  screening-time curve was narrowed to 24-36 s (at 42 s the checkpoint no longer clears its queue).

They are **simulated results on synthetic assumptions**, not measurements, and must not be
presented as evidence of operational performance.

The scenarios are the new **scenario library**. Their flights come from synthetic flight lists in
the format an airport would provide (`gateflow.flights/1`, see
[scenarios/flights](../../../scenarios/flights/README.md)). Every report lists its data sources and
their licences in the section "Data sources and licences". No third-party schedule data is used:
public flight data (OPDI) is published for non-commercial use only (ADR-035).

## Experiments (200 simulated days each)

| Scenario | What it represents | Report | Page with charts | Results |
|---|---|---|---|---|
| `vce-like-normal-day` | Departures checkpoint of a VCE-like airport, average day of 2025 (116 departures, 12 lanes at most) | [report.md](vce-like-normal-day/report.md) | [report.html](vce-like-normal-day/report.html) | [results.json](vce-like-normal-day/results.json) |
| `vce-like-peak-day` | The same checkpoint on a summer peak day (138 departures) | [report.md](vce-like-peak-day/report.md) | [report.html](vce-like-peak-day/report.html) | [results.json](vce-like-peak-day/results.json) |
| `vce-like-disrupted-day` | The peak day with delays, gate changes, lane and feed outages | [report.md](vce-like-disrupted-day/report.md) | [report.html](vce-like-disrupted-day/report.html) | [results.json](vce-like-disrupted-day/results.json) |
| `tsf-like-peak-day` | Low-cost base, one morning bank of based aircraft (34 departures, 5 lanes) | [report.md](tsf-like-peak-day/report.md) | [report.html](tsf-like-peak-day/report.html) | [results.json](tsf-like-peak-day/results.json) |
| `mx-like-transfer-hub` | Transfer security of a hub: only connecting passengers, six banks of domestic departures (4 lanes) | [report.md](mx-like-transfer-hub/report.md) | [report.html](mx-like-transfer-hub/report.html) | [results.json](mx-like-transfer-hub/results.json) |

## Sensitivity sweeps (200 simulated days per point)

| Sweep | Report | Page with charts | Results |
|---|---|---|---|
| `vce-like-peak-capacity`: the VCE-like peak day as the lanes, the screening time per person and the arrival times vary | [sweep.md](sweeps/vce-like-peak-capacity/sweep.md) | [sweep.html](sweeps/vce-like-peak-capacity/sweep.html) | [sweep.json](sweeps/vce-like-peak-capacity/sweep.json) |
| `mx-like-hub`: the transfer hub as the lanes, the screening time, the time left to connecting passengers, their call response and K vary | [sweep.md](sweeps/mx-like-hub/sweep.md) | [sweep.html](sweeps/mx-like-hub/sweep.html) | [sweep.json](sweeps/mx-like-hub/sweep.json) |

## Results at a glance

### Missed flights per day

| Scenario | People per day | A (physical FIFO) | A' (staff call closing flights) | Virtual FIFO | `priority-v3` | v3 vs A' [95% CI] | v3 vs A |
|---|---:|---:|---:|---:|---:|---:|---:|
| VCE-like normal day | 16,623 | 11.5 | 10.9 | 11.5 | 10.9 | 0.0 [-0.1, 0.1] | +0.6 |
| VCE-like peak day | 21,792 | 25.0 | 18.8 | 26.0 | 18.6 | +0.2 [-0.1, 0.6] | +6.4 |
| VCE-like disrupted day | 21,792 | 20.0 | 14.3 | 20.8 | 14.1 | +0.3 [-0.1, 0.7] | +5.9 |
| TSF-like peak day | 5,981 | 25.8 | 0.0 | 27.2 | 2.3 | **-2.3** [-3.1, -1.6] | +23.5 |
| MX-like transfer hub | 4,473 | 131.6 | 96.7 | 132.7 | 87.9 | **+8.7** [7.2, 10.4] | +43.7 |

`priority-v2` gives the same numbers within 0.1 flights per day.

### Queues, fairness and stability

| Scenario | FIFO wait: P90 / longest (min) | Mean time standing in a queue: today / GateFlow (min) | Others delayed > 5 min by v3 (vs virtual FIFO) | Largest overtakes of one person: A' / v3 | CRITICAL on arrival per day | Class reversals per day (v3) |
|---|---:|---:|---:|---:|---:|---:|
| VCE-like normal day | 0.8 / 10.7 | 0.3 / 0.3 | 0.00% | 10 / 9 | 6.1 | 0.0 |
| VCE-like peak day | 4.5 / 13.6 | 1.0 / 0.5 | 0.00% | 21 / 22 | 9.5 | 0.0 |
| VCE-like disrupted day | 4.7 / 21.1 | 1.1 / 0.5 | 0.00% | 46 / 30 | 7.5 | 0.2 |
| TSF-like peak day | 15.4 / 41.5 | 3.5 / 0.7 | 0.52% | 122 / 30 | 0.0 | 0.1 |
| MX-like transfer hub | 7.0 / 38.7 | 2.0 / 0.9 | 0.81% | 216 / 30 | 35.7 | 1.5 |

### Where a checkpoint sits on the curve (sweeps, 200 simulated days per point)

Net flights saved per day by `priority-v3` compared with A', with 95% confidence intervals. Each
line varies one assumption around the base (bold), all else equal. The last column shows how long
people wait in today's physical queue (FIFO, 90th percentile).

**VCE-like peak day** (`vce-like-peak-capacity`):

| Assumption | Value | Missed per day: A / A' / v3 | v3 vs A' | FIFO wait, P90 |
|---|---|---:|---:|---:|
| Lanes of the plan | **base (12 at most)** | 25.0 / 18.8 / 18.6 | **+0.2** [-0.1, 0.6] | 4.5 min |
| | one fewer | 204.6 / 84.9 / 61.8 | **+23.1** [21.2, 25.1] | 14.0 min |
| | one or two more | 17.8 / 17.2 / 16.9 | +0.2 / +0.1 | 0.9 / 0.2 min |
| Screening time per person | 22 s | 18.2 / 17.1 / 16.9 | +0.3 [0.1, 0.4] | 1.0 min |
| | **24 s** | 25.0 / 18.8 / 18.6 | **+0.2** | 4.5 min |
| | 25 s | 39.5 / 22.1 / 20.3 | +1.7 [1.2, 2.3] | 7.4 min |
| | 26 s | 91.8 / 33.1 / 25.1 | +7.9 [6.8, 9.1] | 12.0 min |
| | 27 s | 426.8 / 108.0 / 72.6 | **+35.5** [32.2, 38.7] | 18.5 min |
| Passengers arrive | 15 / 10 min later | 197.3 / 140.4 / 137.1 and 97.8 / 68.8 / 66.7 | +3.3 / +2.1 | 5.6 / 5.2 min |
| | 10 min earlier | 8.3 / 6.7 / 6.5 | +0.2 | 4.3 min |

**MX-like transfer hub** (`mx-like-hub`):

| Assumption | Value | Missed per day: A / A' / v3 | v3 vs A' | Others delayed > 5 min by v3 | FIFO wait, P90 |
|---|---|---:|---:|---:|---:|
| Lanes of the plan | **base (4 at most)** | 131.6 / 96.7 / 87.9 | **+8.7** [7.2, 10.3] | 0.81% | 7.0 min |
| | one / two more | 55.3 / 52.8 / 52.1 and 50.0 / 49.7 / 49.6 | +0.7 / +0.1 | 0.00% | 0.8 / 0.2 min |
| Screening time per person | 24 / 27 s | 61.8 / 57.6 / 56.2 and 79.5 / 68.8 / 65.3 | +1.4 / +3.5 | 0.08% / 0.21% | 1.2 / 2.9 min |
| | **30 s** | 131.6 / 96.7 / 87.9 | **+8.7** | 0.81% | 7.0 min |
| | 33 / 36 s | 276.9 / 174.2 / 170.3 and 749.6 / 576.2 / 534.1 | +3.9 / +42.1 | 4.3% / 17.3% | 14.2 / 28.7 min |
| Time left to connecting passengers | 10 min less | 529.6 / 392.3 / 393.9 | -1.6 [-5.7, 2.7] | 4.9% | 15.1 min |
| | 10 / 20 min more | 43.1 / 32.4 / 28.0 and 20.8 / 15.8 / 12.2 | +4.4 / +3.6 | 0.12% / 0.05% | 5.5 / 7.2 min |
| Median call response | 45 / **75** / 120 / 180 s | v3: 87.5 / 87.9 / 90.0 / 113.3 | +9.1 / **+8.7** / +6.6 / **-16.7** | 0.8% / 0.8% / 0.7% / 0.5% | 7.0 min |
| Overtake bound K | 15 / **30** / 60 / 120 | v3: 93.7 / 87.9 / 86.0 / 85.9 | +2.9 / **+8.7** / +10.7 / +10.7 | 0.28% / 0.81% / 1.09% / 1.09% | 7.0 min |

## What the numbers say, and what they do not

- **The kind of checkpoint matters more than anything else.** Against today's practice idealised
  (A', staff calling the flights that close within 20 minutes):
  - **Transfer security at a hub: +8.7 flights per day** [7.2, 10.3]. Connecting passengers
    arrive in waves, with deadlines mixed within each wave. Calling whole flights is too coarse:
    A' lets one passenger be overtaken up to 216 times, GateFlow at most 30.
  - **A VCE-like departures checkpoint with lanes planned to demand: no difference** (0.0 to
    +0.3, within noise) on the normal, peak and disrupted days. GateFlow and A' each catch about
    6 more flights per day than the plain queue.
  - **A low-cost base with one morning bank: A' is better** (-2.3 per day). Staff calling the
    six o'clock flights catches every passenger in this model, while the virtual queue adds the
    time to answer a call (-1.4 per day for virtual FIFO against the physical queue).
- **At the VCE-like checkpoint, capacity decides.** With the base plan the checkpoint is
  comfortable (90th percentile of the FIFO wait 4.5 minutes) and GateFlow adds nothing. Tighter
  capacity widens the gap:
  - 25 s per person: +1.7 per day;
  - 26 s: +7.9;
  - 27 s: +35.5 (FIFO wait 18.5 minutes);
  - one lane fewer: +23.1.

  Unlike the demo day of S6, A' does not catch up in these overloads: at any moment many flights
  with different deadlines are in the queue, and calling only those that close within
  20 minutes acts too late.
- **The calibration that matters is the airport's.** The press reports 9 minutes 12 seconds of
  waiting at Venice's security in 2025, citing the service charter. If that figure is a 90th
  percentile, a VCE-like checkpoint calibrated to it would sit between the 25 s and 26 s points
  (2 to 8 flights per day over A'). The figure, its definition and every other assumption here are
  unverified: the airport's lanes, throughput and measured waits are the first data to ask for
  ([docs/data-request](../../data-request/README.md)).
- **Just beyond the curves the plans collapse.** In short probes outside the published points:
  - VCE-like: two lanes fewer, or 28 s per person;
  - hub: 42 s per person.

  There the queues never clear and thousands miss their flights under every policy. A real
  airport would open lanes or call staff long before. Opening lanes in reaction to the queue is
  not modelled yet; it is the next slice.
- **Fairness has a price at the hub.** K = 30 keeps every passenger within 30 overtakes. But
  0.81% of the other passengers are delayed by more than 5 minutes at the hub, and 0.52% at the
  low-cost base, above the 0.1% criterion of ADR-025 (set on the demo day). At the hub,
  K = 15 brings it to 0.28% and keeps +2.9 flights per day; K = 60 gives +10.7 at 1.09%. The bound
  is a setting for each checkpoint, and the airport's choice.
- **Call responses still matter.** At the hub, a median response of 3 minutes instead of 75 s
  turns +8.7 into -16.7 with the default call-ahead, as on the demo day in S6.
- **People stop standing in line.** Mean time standing in a queue drops from 1.0-3.5 minutes to
  0.5-0.9 on the congested days.
- **Delays reduce missed flights** on the disrupted day (14.1 instead of 18.6 for v3): a delayed
  flight gives its passengers more time. Lane outages and gate changes do not change the
  comparison.

These numbers rest on the simplifications listed in every report:
- one-at-a-time curves show no interactions;
- A' is idealised: every passenger of a called flight comes forward at once;
- lanes never open in reaction to the queue;
- show-up curves, call responses, screening times, lane plans and the hub's border process are
  synthetic.

## Open points for the founder

1. **Ask the airport for its data** ([docs/data-request](../../data-request/README.md)): two or
   three design days of flights, the lanes and their throughput, and the measured waits.
   Without them the value case at VCE or TSF cannot be stated; with them it needs no code change.
2. **Lead with transfer checkpoints.** The strongest case in this library is the transfer screening
   of a hub. Which checkpoints of the target airports re-screen connecting passengers?
3. **K per checkpoint.** At a hub the fairness criterion of 0.1% would need K below 15, which
   gives up most of the gain. Decide with the airport whether that criterion holds there.
4. **OPDI** remains available only with EUROCONTROL's and OpenSky's written permission
   (ADR-035), for instance for a historical replay of VCE and TSF.

To reproduce, check out the recorded commit and run the command printed at the end of each report
or sweep.
