# Slice S3 reports (SIMULATED, synthetic data)

Reports produced by `gateflow-sim` 0.3.0 from a clean checkout of commit
`d018bcd8d4ab461ddc31303096c5e546cd034efe` (recorded in each `results.json` manifest). They are
**simulated results on synthetic assumptions**, not measurements, and must not be presented as
evidence of operational performance.

| Scenario (200 simulated days each) | Report | Machine-readable results |
|---|---|---|
| `single-checkpoint-demo`: congested morning peak, six lanes all day | [report.md](single-checkpoint-demo/report.md) | [results.json](single-checkpoint-demo/results.json) |
| `single-checkpoint-moderate`: moderate morning peak, six lanes all day | [report.md](single-checkpoint-moderate/report.md) | [results.json](single-checkpoint-moderate/results.json) |
| `single-checkpoint-staffed`: the demo day with a lane schedule that follows demand | [report.md](single-checkpoint-staffed/report.md) | [results.json](single-checkpoint-staffed/results.json) |
| `single-checkpoint-strategic`: the demo day where 5% of departing parties arrive 25-35 minutes before departure on purpose (stress test) | [report.md](single-checkpoint-strategic/report.md) | [results.json](single-checkpoint-strategic/results.json) |

In every scenario about 40% of passengers travel in groups of two to five (one ticket per group),
and 0.7% of parties take the assisted path. The policies run on exactly the same passengers:
- `fifo`: today's physical queue with no intervention (policy A);
- `fifo-manual`: today's physical queue with staff calling the flights that close within 20
  minutes, every 5 minutes (policy A', an idealised version of today's manual handling,
  ADR-022);
- `virtual-fifo`: the GateFlow virtual queue served in FIFO order;
- `priority-v1`: the GateFlow virtual queue with priority policy v1 (ADR-025);
- `priority-v1-strict` (strategic scenario only): v1 with the late-presentation rule.

## Results at a glance

Means per simulated day; brackets give 95% confidence intervals of the mean. People are counted
individually: a family of three that misses its flight counts as three.

| Scenario | Missed flights: A `fifo` | A' `fifo-manual` | `virtual-fifo` | `priority-v1` | Net saved by `priority-v1` vs A | Net saved by `priority-v1` vs A' |
|---|---:|---:|---:|---:|---:|---:|
| demo | 55.1 | 14.7 | 55.8 | 18.0 | 37.1 [33.9, 40.2] | **-3.3 [-4.1, -2.5]** |
| moderate | 14.3 | 7.2 | 14.8 | 9.4 | 4.8 [3.9, 5.8] | **-2.3 [-2.7, -1.9]** |
| staffed | 65.9 | 17.8 | 66.6 | 23.0 | 42.9 [39.5, 46.4] | **-5.2 [-6.2, -4.1]** |
| strategic | 204.5 | 132.0 | 205.1 | 164.7 | 39.8 [36.9, 42.7] | **-32.7 [-34.1, -31.3]** |

| Scenario | Mean time standing in a queue: physical queue (A and A') / GateFlow | Most people standing at once: physical / GateFlow | Extra wait of non-prioritised passengers, `priority-v1` vs `virtual-fifo`: mean, share delayed > 5 min | Missed-call rate |
|---|---:|---:|---:|---:|
| demo | 3.1 / 0.6 min | 271 / 32 | 0.15 min, 0.00% | 0.5% |
| moderate | 1.3 / 0.5 min | 208 / 33 | 0.02 min, 0.00% | 0.3% |
| staffed | 3.6 / 0.7 min | 271 / 32 | 0.18 min, 0.07% | 0.6% |

## What the numbers say, and what they do not

- **Today's manual handling is the real benchmark, and it is strong.** Staff who call closing
  flights every five minutes (A') remove 50-75% of the misses of a queue without intervention
  (demo 55.1 to 14.7 per day). This is an idealised practice: every passenger of a called flight
  hears the call and comes forward at once.
- **GateFlow v1 recovers most of that benefit, but not all of it.** Against the queue without
  intervention it saves 37.1, 4.8 and 42.9 flights per day. Against A' it misses 2.3 to 5.2 more
  flights per day, a gap that is statistically clear on all three scenarios. **On these
  assumptions, GateFlow v1 cannot claim to save more flights than an attentive staff.**
- **Why: last-minute passengers.** On the calibration seeds (ADR-025), a third to a half of the
  passengers whom A' saves and v1 loses are already CRITICAL when they take their ticket; most
  arrive 10-20 minutes before boarding closes. In the virtual queue a boosted passenger still
  waits for the prepare window to be called, for their own walk back to the access point and for
  the call-ahead buffer at the lanes, which takes several minutes in the peak. Staff instead take
  them straight to a lane. The same staff rule applied to the virtual queue instead of the
  physical one misses 27.3 flights per day on the demo instead of 14.0 (calibration seeds). The
  rest of the gap comes from the overtake bound in congested peaks and from missed calls. This
  finding motivates the proposal for slice S4 (see the implementation plan).
- **People stop standing in line.** The mean time standing in a queue falls by 60-80% and the
  largest crowd at the checkpoint from 200-270 people to about 32. A' does not change standing
  times: it reorders the same line.
- **The cost to other passengers stays small and bounded.** Against `virtual-fifo`:
  - non-prioritised passengers wait 0.02-0.18 minutes longer on average;
  - at most 0.07% are delayed by more than 5 minutes;
  - being overtaken alone delayed nobody by more than about 8 minutes (K = 30 people).
  The few larger delays (up to 31 minutes, staffed scenario, seed 64) are knock-on effects of
  missed calls, as in S2: the passenger was called 0.6 minutes later than under `virtual-fifo`, had
  walked away by then, missed the call and needed a new ticket (ADR-018). A' has no overtake
  bound: on the worst day one passenger was overtaken by 98 people (staffed scenario).
- **Groups and assisted passengers.** On the demo, v1 prioritises 16 groups per day as a whole
  (A' 24). Assisted passengers reach screening in 0.1 minutes on average under every policy. They
  almost never miss their flight, except in the strategic scenario, where some of them also arrive
  late.
- **The late-presentation rule costs far more flights than it protects in this model.** In the
  strategic scenario (5% of departing parties arrive 25-35 minutes before departure on purpose):
  - `priority-v1-strict` misses 16.9 [16.0, 17.8] more flights per day than `priority-v1` (18.8
    people per day lose their flight because of the rule, 1.8 keep it thanks to it);
  - passengers who did *not* arrive late on purpose miss 21.7 flights per day with the rule and
    16.8 without it, because the rule also blocks genuinely late passengers;
  - v1 without the rule prioritises 16 of the 296 late arrivals per day; A' prioritises 132.
  The model holds behaviour fixed, so it cannot show the deterrent effect the rule is meant to
  have. The rule therefore stays available as `priority-v1-strict`, off by default (ADR-025).
- **A missed call can still cost a passenger dearly.** The longest time to screening over 200 days
  is 108-118 minutes with the virtual queue against 23-46 minutes with a physical queue. These are
  passengers who missed their call, came back after the reactivation window and needed a new
  ticket at the back of the queue (ADR-024).
- **These numbers are not comparable with S2.** Groups, assisted passengers and the new
  population generator change every simulated day. With the S3 features disabled, S1 and S2 are
  reproduced exactly (regression tests).

These numbers still rest on simplifications, each listed in every report:
- response times, missed calls and the A' practice are assumptions, not measurements;
- deadlines are known exactly, and there are no delays, gate changes or lane outages (S5 in the
  revised plan);
- staff escalation of CRITICAL passengers is not modelled yet: in the simulation a CRITICAL
  passenger simply waits in FIFO order.

## Open points for the founder

1. **Fast track and staff escalation (proposed slice S4).** To close the gap with A', priority
   calls would send the passenger to the next free lane instead of the back of the buffer, and
   passengers already CRITICAL would be escalated to staff, as A' does. This needs a priority
   entry at the lanes and staff to escort passengers: both must be confirmed with the airport.
2. **Fairness bounds.** K = 30 people and at most 10 priority people among any 20 people called
   were chosen with a stated criterion (ADR-025), but they are value choices for the airport to
   confirm.
3. **Late-presentation rule.** Off by default; `priority-v1-strict` is available for airports that
   observe passengers arriving late on purpose.
4. **Today's practice must be measured.** How often staff call flights, how many passengers come
   forward and how quickly decide how strong A' really is. It is one of the first things to
   observe at a pilot checkpoint.

To reproduce, check out the recorded commit and run the command printed at the end of each report.
