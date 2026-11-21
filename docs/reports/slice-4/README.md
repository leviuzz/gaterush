# Slice S4 reports (SIMULATED, synthetic data)

Reports produced by `gateflow-sim` 0.4.0 from a clean checkout of commit
`9f115ff09bd3bbc5eda81758bd36440f45d45a5f` (recorded in each `results.json` manifest). They are
**simulated results on synthetic assumptions**, not measurements, and must not be presented as
evidence of operational performance.

| Scenario (200 simulated days each) | Report | Machine-readable results |
|---|---|---|
| `single-checkpoint-demo`: congested morning peak, six lanes all day | [report.md](single-checkpoint-demo/report.md) | [results.json](single-checkpoint-demo/results.json) |
| `single-checkpoint-moderate`: moderate morning peak, six lanes all day | [report.md](single-checkpoint-moderate/report.md) | [results.json](single-checkpoint-moderate/results.json) |
| `single-checkpoint-staffed`: the demo day with a lane schedule that follows demand | [report.md](single-checkpoint-staffed/report.md) | [results.json](single-checkpoint-staffed/results.json) |
| `single-checkpoint-strategic`: the demo day where 5% of departing parties arrive 25-35 minutes before departure on purpose (stress test) | [report.md](single-checkpoint-strategic/report.md) | [results.json](single-checkpoint-strategic/results.json) |

The scenarios and passengers are those of S3. The policies run on exactly the same passengers:
- `fifo`: today's physical queue without intervention (policy A);
- `fifo-manual`: today's physical queue with staff calling the flights that close within 20
  minutes, every 5 minutes (policy A', idealised);
- `virtual-fifo`: the GateFlow virtual queue served in FIFO order;
- `priority-v1`: the GateFlow virtual queue with priority v1 (S3);
- `priority-v2`: priority v1 plus the **fast track** (ADR-027). A priority call is made next,
  ahead of the prepare window, and the party goes to the next free lane once it has validated its
  ticket. Every person passed counts towards the overtake bound K = 30.

## Results at a glance

Means per simulated day; brackets give 95% confidence intervals of the mean. People are counted
individually.

| Scenario | Missed flights: A `fifo` | A' `fifo-manual` | `priority-v1` | `priority-v2` | `priority-v2` vs A' | `priority-v2` vs `priority-v1` | `priority-v2` vs A |
|---|---:|---:|---:|---:|---:|---:|---:|
| demo | 55.1 | 14.7 | 18.0 | **11.5** | **+3.2 [2.5, 4.0]** | +6.5 [6.0, 7.1] | +43.6 [40.2, 47.0] |
| moderate | 14.3 | 7.2 | 9.4 | **5.6** | **+1.5 [1.2, 1.9]** | +3.8 [3.4, 4.2] | +8.6 [7.5, 9.7] |
| staffed | 65.9 | 17.8 | 23.0 | **16.5** | **+1.2 [0.3, 2.3]** | +6.5 [5.9, 7.0] | +49.4 [45.8, 52.9] |
| strategic | 204.5 | 132.0 | 164.7 | 141.6 | -9.6 [-10.9, -8.2] | +23.1 [22.1, 24.2] | +62.9 [60.0, 65.8] |

| Scenario | Mean time standing in a queue: physical (A, A') / GateFlow | People through the fast track per day | People passed at the lanes per day | Extra wait of non-prioritised passengers, v2 vs `virtual-fifo`: mean, share delayed > 5 min | Largest delay from overtakes alone |
|---|---:|---:|---:|---:|---:|
| demo | 3.1 / 0.6 min | 125 | 815 | 0.20 min, 0.01% | 6.1 min |
| moderate | 1.3 / 0.5 min | 55 | 294 | 0.03 min, 0.00% | 4.8 min |
| staffed | 3.6 / 0.7 min | 136 | 869 | 0.24 min, 0.10% | 7.3 min |
| strategic | 2.8 / 0.6 min | 270 | 1,163 | 0.23 min, 0.01% | 6.2 min |

## What the numbers say, and what they do not

- **GateFlow now catches more flights than today's best manual practice.** On the three main
  scenarios, priority v2 misses 1.2 to 3.2 flights per day fewer than idealised staff flight
  calls (A'), and every interval excludes zero. It also removes 60-80% of the misses of a queue
  without intervention, and people stop standing in line: the mean standing time falls by 60-80%,
  and the largest crowd from 200-270 people to about 33. On the demo scenario v2 has a net gain over
  A' on 74% of the days.
- **The fast track is what made the difference.** It is v2's only change from v1, and it saves
  3.8 to 6.5 flights per day on its own. On the calibration seeds (ADR-027) each part counted:
  - going to the next free lane;
  - being called ahead of the prepare window;
  - an estimate of the call that takes the fast track into account.
- **The cost to other passengers stays bounded, now including the passes at the lanes.** Against
  `virtual-fifo`:
  - non-prioritised passengers wait 0.03-0.24 minutes longer on average;
  - at most 0.10% are delayed by more than 5 minutes;
  - overtakes alone delayed nobody by more than 7.3 minutes, since K = 30 covers the queue, the
    window and the lanes.
  The few larger delays (up to 30.7 minutes, staffed scenario, seed 64) are again knock-on effects
  of missed calls: the passenger was called a few seconds later than under `virtual-fifo`, had
  walked away and missed the call (ADR-018). A', for comparison, has no bound: on the worst day
  one passenger was overtaken by 98 people (staffed scenario).
- **Fast-tracked parties pass people at the lanes.** On the demo, 125 people per day go through
  the fast track and pass 815 people waiting at the lanes, six or seven each. This is the visible
  side of the fast track: the checkpoint needs a fast-track entry, and the people passed see it.
  Each of them loses a few seconds, which is included in the extra waits above.
- **Strategic late arrivals.** In the stress test, A' still catches 9.6 more flights per day than
  v2. That is because staff call everybody of a closing flight, including the 296 people per day
  who arrive late on purpose: A' prioritises 132 of them, v2 163, and A' saves more of them.
  For everybody else v2 is better: 12.7 flights missed per day against 13.9 with A' and 16.9
  with v1.
- **Staff escalation is not needed for these results.** CRITICAL passengers are flagged for
  staff in the product but not escorted in the simulation. Escorts would add at most 0.45 flights
  per day (ADR-028).
- **A missed call can still cost a passenger dearly.** The longest time to screening over 200 days
  is 108-120 minutes with the virtual queue against 23-46 minutes with a physical queue. These are
  passengers who missed their call and needed a new ticket at the back of the queue (ADR-024).

These numbers still rest on simplifications, each listed in every report:
- response times, missed calls and the A' practice are assumptions, not measurements;
- the fast-track entry never becomes a bottleneck and needs no staff in the model;
- deadlines are known exactly, and there are no delays, gate changes or lane outages (next
  slice, S5).

## Open points for the founder

1. **A fast-track entry at the target checkpoint.** It is now the condition for the result above.
   Its capacity, and how people at the lanes react to being passed, should be checked on site.
2. **Fairness bounds.** K = 30 people now covers every pass, and v2 meets the criterion of ADR-025
   on the calibration and report seeds. The bounds remain a choice for the airport.
3. **Today's practice must be measured.** A' is idealised. If real staff call flights less
   systematically, the margin of GateFlow over today's practice is larger than shown here.

To reproduce, check out the recorded commit and run the command printed at the end of each report.
