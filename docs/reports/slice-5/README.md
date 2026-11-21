# Slice S5 reports (SIMULATED, synthetic data)

Reports produced by `gateflow-sim` 0.5.0 from a clean checkout of commit
`f6da400515685c908f6cc78e724a0f4230de5245` (recorded in each `results.json` manifest). They are
**simulated results on synthetic assumptions**, not measurements, and must not be presented as
evidence of operational performance.

| Scenario (200 simulated days each) | Report | Machine-readable results |
|---|---|---|
| `single-checkpoint-demo`: congested morning peak, six lanes all day | [report.md](single-checkpoint-demo/report.md) | [results.json](single-checkpoint-demo/results.json) |
| `single-checkpoint-moderate`: moderate morning peak, six lanes all day | [report.md](single-checkpoint-moderate/report.md) | [results.json](single-checkpoint-moderate/results.json) |
| `single-checkpoint-staffed`: the demo day with a lane schedule that follows demand | [report.md](single-checkpoint-staffed/report.md) | [results.json](single-checkpoint-staffed/results.json) |
| `single-checkpoint-strategic`: the demo day where 5% of departing parties arrive 25-35 minutes before departure on purpose (stress test) | [report.md](single-checkpoint-strategic/report.md) | [results.json](single-checkpoint-strategic/results.json) |
| `single-checkpoint-disrupted`: the demo day with delays (a quarter of the flights), gate changes (a tenth), about two lane outages and one feed outage a day | [report.md](single-checkpoint-disrupted/report.md) | [results.json](single-checkpoint-disrupted/results.json) |
| `single-checkpoint-feed-stress`: the disrupted day with the flight feed down about six times a day (stress test) | [report.md](single-checkpoint-feed-stress/report.md) | [results.json](single-checkpoint-feed-stress/results.json) |

The first four scenarios have no disruptions: their passengers are those of S3 and S4. The
disrupted scenarios have the same passengers too, and add the disruptions on top. The policies run
on exactly the same passengers:
- `fifo`: today's physical queue without intervention (policy A);
- `fifo-manual`: today's physical queue with staff calling the flights that close within 20
  minutes, every 5 minutes (policy A', idealised). Staff learn of a delay when the system does;
- `virtual-fifo`: the GateFlow virtual queue served in FIFO order;
- `priority-v2`: GateFlow priority with the fast track (S4);
- `priority-v3`: priority v2 with the two data-quality rules of ADR-029:
  - a deadline the flight feed has not confirmed for more than 30 minutes is not trusted, so the
    ticket is served in FIFO order until the feed recovers;
  - hysteresis of 3 minutes: a passenger becomes more urgent at once, but less urgent only once
    the margin passes the threshold by 3 minutes.

## Results at a glance

Means per simulated day; brackets give 95% confidence intervals of the mean. People are counted
individually.

| Scenario | Missed flights: A `fifo` | A' `fifo-manual` | `priority-v2` | `priority-v3` | `priority-v3` vs A' | `priority-v3` vs `priority-v2` |
|---|---:|---:|---:|---:|---:|---:|
| demo | 55.1 | 14.7 | 11.5 | **11.5** | **+3.2 [2.4, 4.0]** | -0.0 [-0.2, 0.2] |
| moderate | 14.3 | 7.2 | 5.6 | **5.6** | **+1.5 [1.2, 1.9]** | 0.0 [-0.0, 0.0] |
| staffed | 65.9 | 17.8 | 16.5 | **16.6** | **+1.2 [0.1, 2.2]** | -0.1 [-0.3, 0.2] |
| strategic | 204.5 | 132.0 | 141.6 | 141.6 | -9.6 [-10.9, -8.4] | -0.0 [-0.3, 0.3] |
| disrupted | 47.8 | 12.4 | 10.8 | **11.1** | **+1.3 [0.4, 2.0]** | -0.3 [-0.6, -0.0] |
| feed stress | 47.8 | 12.4 | 11.1 | 14.2 | -1.8 [-3.3, -0.5] | -3.1 [-4.3, -2.0] |

| Scenario | Class reversals per day: v2 / v3 | People whose class flapped: v2 / v3 | People boosted on wrong information: A' / v2 / v3 | Extra wait of non-prioritised passengers, v3 vs `virtual-fifo`: mean, share delayed > 5 min | Largest delay from overtakes alone (v3) |
|---|---:|---:|---:|---:|---:|
| demo | 162 / 0 | 33.7 / 0 | 0 / 0 / 0 | 0.20 min, 0.01% | 5.9 min |
| moderate | 25 / 0 | 7.4 / 0 | 0 / 0 / 0 | 0.03 min, 0.00% | 4.9 min |
| staffed | 190 / 0 | 40.3 / 0 | 0 / 0 / 0 | 0.24 min, 0.10% | 7.0 min |
| strategic | 139 / 0 | 31.2 / 0 | 0 / 0 / 0 | 0.23 min, 0.01% | 5.8 min |
| disrupted | 162 / 1.2 | 33.7 / 1.5 | 11.6 / 11.4 / 11.2 | 0.20 min, 0.02% | 6.8 min |
| feed stress | 164 / 6.3 | 34.3 / 8.1 | 15.8 / 14.8 / 11.0 | 0.18 min, 0.02% | 6.8 min |

The disruptions per day: on the disrupted day, 10.2 delayed flights (27 minutes on average), 4.0
gate changes, 2.1 lane outages (47 lane-minutes), 1.1 feed outages (36 minutes), 14.2 feed messages
of which 0.4 sent while the feed was down. The stress test has the same disruptions, except that
the feed is down 4.7 times and 277 minutes a day, with 3.5 messages held.

## What the numbers say, and what they do not

- **Disruptions do not change the picture.** On the disrupted day, GateFlow v3 still misses fewer
  flights than idealised A': 1.3 per day [0.4, 2.0]. Passengers of delayed or re-gated flights
  miss their flight about as often as with A' (1.9 against 1.8 of 2,031 per day), and three times
  less often than today (6.3). Lane outages are absorbed: the system sees them at once and calls
  fewer people ahead.
- **Classes no longer flap.** With v2, a waiting passenger's class changed direction 25 to 190
  times per day, for 7 to 40 people a day. The cause was the FIFO estimate itself: each call
  shortens the queue ahead and raises a passenger's margin by a few seconds, while the time
  passing lowers it, so a passenger close to a threshold crossed it again and again. With the
  3-minute hysteresis of v3 no reversal is left on the four main scenarios, at no cost: v3
  misses the same flights as v2 (the differences are at most 0.1 per day and their intervals
  include zero). On the disrupted days the few remaining reversals come from lane outages, whose
  jumps can exceed 3 minutes, and from the stale-data rule (UNVERIFIED during an outage, then
  back).
- **The stale-data rule has a price, paid on the days when the feed fails at the wrong time.**
  - On the disrupted day v3 misses 0.3 more flights per day than v2 [0.0, 0.6], 59 flights over
    200 days. Of these, 53 are lost on the days when the feed was down for more than an hour in
    total, and 55 on the five worst days alone. On seed 1 the feed is down from 06:31 to 07:38,
    in the morning peak, and v3 misses 22 more flights than v2 that day. On the 59 days without a
    feed outage, v3 misses 4 more flights than v2 in all.
  - With an unreliable feed (the stress test), v3 misses 3.1 more flights per day than v2, up to
    51 on the worst day, and falls behind A' (1.8 per day [0.5, 3.3]). Staff in A' keep acting
    on the last times they know.
  - The rule is a product principle: nobody is moved ahead of others on data that nobody can
    vouch for. The model can show its price but not its benefit: here stale data is rarely wrong
    (0.4 of 14 messages a day arrive late on the disrupted day), and a late delay notice makes a
    deadline look earlier than it is, never later.
- **Wrong information costs a little, and A' pays it too.** About 11 people a day are boosted
  while a delay or a gate change of their flight is not yet known (A' 11.6, v2 11.4, v3 11.2 on
  the disrupted day). They pass other passengers for nothing, within the same bounds K and cap.
  In the stress test the stale-data rule cuts them from 14.8 to 11.0 a day.
- **The cost to other passengers is unchanged.** Against `virtual-fifo`, non-prioritised
  passengers wait 0.03 to 0.24 minutes longer on average, at most 0.10% of them more than
  5 minutes, and overtakes alone delay nobody by more than 7.0 minutes. Larger delays (up to
  30.7 minutes, staffed scenario) are knock-on effects of missed calls, as in S4.
- **Feed-absent days degrade exactly to FIFO.** Tests prove that with the feed down all day v3
  gives the outcomes of the same queue in FIFO order, passenger by passenger (acceptance
  criterion of S5).

These numbers rest on simplifications, listed in every report:
- delays only move boarding later: no cancellations, no earlier boarding close;
- passengers still arrive for the scheduled departure, whatever the delay;
- a gate change affects only passengers who finish screening after it;
- lanes fail one at a time and the system knows at once;
- the feed fails for every flight at once; it never sends wrong data;
- staff in A' have the same information as the system, and no stale-data rule.

## Open points for the founder

1. **The freshness threshold is a business decision.** 30 minutes is a hypothesis (ADR-029). In
   the model 60 minutes would remove most of the cost on the disrupted day, but trusts data twice
   as old. A softer fallback during outages (the published schedule plus the last known delay)
   would avoid serving in FIFO order, but uses data nobody has confirmed, which the kickoff rules
   out.
2. **How often, how long and when does the flight feed fail at the target airport?** The
   stress test shows that a feed down for hours a day removes GateFlow's advantage over today's
   practice.
3. **What staff do during an outage.** The product shows a banner and lets the supervisor
   intervene (flow F6). The simulation does not model that intervention.

To reproduce, check out the recorded commit and run the command printed at the end of each report.
