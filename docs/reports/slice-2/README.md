# Slice S2 reports (SIMULATED, synthetic data)

Reports produced by `gateflow-sim` 0.2.0 from a clean checkout of the commit recorded in each
`results.json` manifest (`manifest.commit`). They are **simulated results on synthetic
assumptions**, not measurements, and must not be presented as evidence of operational performance.

| Scenario (200 simulated days each) | Report | Machine-readable results |
|---|---|---|
| `single-checkpoint-demo`: congested morning peak, six lanes all day | [report.md](single-checkpoint-demo/report.md) | [results.json](single-checkpoint-demo/results.json) |
| `single-checkpoint-moderate`: moderate morning peak, six lanes all day | [report.md](single-checkpoint-moderate/report.md) | [results.json](single-checkpoint-moderate/results.json) |
| `single-checkpoint-staffed`: the demo day with a lane schedule that follows demand | [report.md](single-checkpoint-staffed/report.md) | [results.json](single-checkpoint-staffed/results.json) |

Three policies run on exactly the same passengers:
- `fifo`: today's physical queue, the status quo;
- `virtual-fifo`: the GateFlow virtual queue served in FIFO order;
- `priority-v0`: the GateFlow virtual queue with priority policy v0.

## Results at a glance

Means per simulated day; brackets give 95% confidence intervals of the mean.

| Scenario | Missed flights: `fifo` | `virtual-fifo` | `priority-v0` | Net flights saved by `priority-v0` vs `fifo` | Net saved by the prioritisation alone (`priority-v0` vs `virtual-fifo`) |
|---|---:|---:|---:|---:|---:|
| demo | 48.7 | 49.3 | 29.7 | 19.1 [17.4, 20.7] | 19.6 [18.1, 21.1] |
| moderate | 11.9 | 12.3 | 10.1 | 1.8 [1.4, 2.4] | 2.3 [1.8, 2.8] |
| staffed | 58.9 | 59.5 | 37.0 | 21.9 [20.1, 23.7] | 22.5 [20.8, 24.2] |

| Scenario | Mean time standing in a queue: `fifo` | GateFlow (both policies) | Most people standing at once: `fifo` | GateFlow | Missed-call rate | Extra wait of non-prioritised passengers (`priority-v0` vs `virtual-fifo`): mean, worst |
|---|---:|---:|---:|---:|---:|---:|
| demo | 3.0 min | 0.5 min | 268 | 27 | 0.5% | 0.11 min, 7.8 min |
| moderate | 1.2 min | 0.4 min | 186 | 27 | 0.25% | 0.01 min, 11.1 min |
| staffed | 3.5 min | 0.7 min | 268 | 27 | 0.55% | 0.13 min, 25.6 min |

## What the numbers say, and what they do not

- **The call mechanics cost about half a missed flight per day.** That is the gap between
  `virtual-fifo` and `fifo` (-0.4 to -0.6 flights per day, a statistically clear but small loss).
  It comes from the passengers who miss their call. The mean time to screening is unchanged,
  because the 180 s call-ahead keeps the lanes supplied: the idle lane time is close to zero.
- **People stop standing in line.** The mean time standing in a queue falls from 1.2-3.5 minutes
  to under a minute. The largest crowd at the checkpoint falls from 186-268 people to 27, the
  call-ahead buffer.
- **The prioritisation is where the benefit is.** It saves about 20 flights per day when the peak
  is congested and about 2 when it is moderate. The cost to the other passengers stays small:
  - on average 0.01-0.13 minutes;
  - fewer than 0.005% of them are delayed by more than 5 minutes.
- **Rare large delays are knock-on effects of the call mechanics.** In the worst case over 200
  days (25.6 minutes, staffed scenario, seed 68) the prioritisation called a passenger 9 seconds
  later than `virtual-fifo` did. By then the passenger had walked away and missed the call, the
  ticket expired, and they needed a new one. A missed call is modelled as an all-or-nothing event
  (ADR-018), which makes such cases possible.
- **The benefit is smaller than in S1.** S1 answered calls instantly and found a net of 25.1
  flights per day on the demo scenario and 5.0 on the moderate one. With response times, the
  prepare window and a 3-minute call-to-screening estimate, priority v0 saves 19.1 and 1.8. This
  is the expected effect of a more realistic model, not a regression.
- **A missed call can cost a passenger dearly.** The longest time to screening rises from about
  30 minutes to about 110. A passenger who misses the call and comes back after the reactivation
  window (20 minutes after the call) needs a new ticket at the back of the queue, and on a peak
  day that is a long wait. The rule is a policy choice for the airport (ADR-017).
- **Leaner staffing.** The staffed plan runs about 88 staffed lane-hours per day instead of 113,
  at 79% utilisation instead of 61%. Under FIFO it misses 10 more flights per day than six lanes
  all day (58.9 against 48.7). With `priority-v0` it misses 37.0: fewer than FIFO with six lanes
  all day, on the same passengers. This is a property of synthetic assumptions, not a staffing
  recommendation.

These numbers still rest on simplifications, each listed in every report:
- the response-time and missed-call distributions are assumptions, not measurements;
- the baseline does not include today's manual handling of urgent passengers;
- deadlines are known exactly;
- there are no groups, assisted passengers or disruptions.

Slices S3 and S4 address the last three.

## Open points for the founder

1. **Response times and missed-call rates** drive the call-ahead and the timeouts. They should be
   among the first quantities measured at a pilot checkpoint, for instance in shadow mode.
2. **Expired tickets.** The current default sends them to the back of the queue. An alternative
   rule (for example "back at the original place, once") would shorten the worst case.
3. **Engine estimate for fresh tickets.** The engine assumes 3 minutes from call to screening for
   everybody. A passenger called right after taking the ticket is still at the access point, so
   late arrivals are classified more pessimistically than necessary: some become CRITICAL and are
   not boosted. Using the age of the ticket in the estimate is a candidate refinement for S3.

To reproduce, check out the recorded commit and run the command printed at the end of each report.
