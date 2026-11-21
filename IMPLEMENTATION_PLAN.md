# GateFlow implementation plan

Incremental plan by milestones and vertical slices. Every slice is small, testable, integrated with
the previous ones and free of hardware dependencies until M5. The detailed rationale is in the
kickoff proposal ([docs/kickoff/KICKOFF_PROPOSAL.md](docs/kickoff/KICKOFF_PROPOSAL.md), section 3).

Status legend: **Done**, **Next**, **Planned**, **Gated** (needs a business decision first).

## Milestones

| Milestone | Business plan stage | Status |
|---|---|---|
| M1: Simulator core and priority engine | R1 | In progress (S1 to S5 done) |
| M2: Simulator Studio (web, runs in the browser) | R1-R2 | Planned |
| M3: Priority end-to-end in the browser, digital twin | R2 | Planned |
| M4: Operations console and Predict preview (pitch-ready) | R2 | Planned |
| Gate R3: discovery with the airport (checkpoint, data, authorisations) | R3 | Gated |
| M5: Pilot readiness (after a signed order) | R4 | Gated |
| M6: Post-pilot (Connect, analytics, multi-airport, ML if justified) | R5+ | Gated |

## M1: Simulator core and priority engine

| Slice | Content | Status |
|---|---|---|
| **S1** | First reproducible FIFO vs priority comparison (CLI) + repository foundations | **Done** |
| **S2** | Realistic calls: access buffer target, call latency, no-shows, recalls, recovery, committed "prepare" window, planned lane schedules | **Done** |
| **S3** | Baseline A' (FIFO + manual handling of urgent passengers), groups and families, assisted path, eligibility and anti-abuse rules | **Done** |
| **S4** | Priority fast track: priority calls go to the next free lane; staff escalation evaluated and not adopted (ADR-027, ADR-028) | **Done** |
| **S5** | Disruptions and data quality: delays with notification time, gate changes, lane outages, stale or missing feeds, ground truth vs knowledge, hysteresis, stability metrics (ADR-029, ADR-030) | **Done** |
| S6 | Parallel batches (worker threads), sensitivity sweeps (k/N, K, lanes, load factor, show-up, maximum data age, feed reliability), HTML report with charts | **Next** |
| S7 | Real schedules (OPDI import for VCE/TSF, seats mapping) and scenario library: normal, peak, disrupted, Mexico-like transfer hub | Planned (check data licences first) |
| S8 | Experiment C: lane-opening recommendations with an operator model | Planned |

The slices after S3 were renumbered when S4 was proposed: S4 to S7 of the kickoff proposal (and of
earlier documents) are now S5 to S8.

**Exit gate M1** (business plan section 12.6, technical part): three demand scenarios, fairness
analysis, replicable reports, numbers labelled as simulated.

## S1: acceptance criteria and evidence

| # | Criterion | Evidence |
|---|---|---|
| 1 | `pnpm install && pnpm check` green locally and in CI | `pnpm check` runs Prettier, dependency-cruiser, and typecheck, lint and tests of 7 packages (177 tests). CI on Node 22 and 24. |
| 2 | The CLI writes `results.json` and `report.md` for 200 seeds x 2 policies | `pnpm sim run --scenario scenarios/single-checkpoint-demo.yaml --seeds 1-200`: about 11 s. |
| 3 | Determinism: identical inputs give byte-identical results; another seed gives different results | `apps/sim-cli/test/cli.test.ts` and `packages/sim-metrics/test/experiment.test.ts`; CI compares two CLI runs with `cmp`; golden files on Node 22 and 24. Two 200-day runs produced identical SHA-256 hashes. |
| 4 | Kernel validity against Erlang C (three M/M/c configurations) and Little's law | `packages/sim-model/test/erlang-c-*.test.ts`: errors of -0.91%, -0.60% and -0.27%, all inside the simultaneous 95% intervals. Little's law holds exactly (`checkpoint.test.ts`). Criterion refined in ADR-012, see below. |
| 5 | Conservation: every passenger has exactly one outcome | `packages/sim-model/test/checkpoint.test.ts`, plus run-time checks in the model. |
| 6 | Priority with `k = 0` reproduces FIFO passenger by passenger | `checkpoint.test.ts` (scenario with real urgency) and `experiment.test.ts`. |
| 7 | Engine invariants as property tests (at least 1,000 cases each) | `packages/priority-engine/test/properties.test.ts`: determinism, order independence, completeness, valid selection, no boost for UNVERIFIED/CRITICAL, guard precedence, cap (single decision, boundary, sequences), K bound, FIFO reduction, monotonicity. Mutation checks are caught. |
| 8 | Boundaries: `priority-engine` and `sim-kernel` import no I/O, database or framework | dependency-cruiser rules, `tsconfig.src.json` without Node or DOM types, ESLint determinism rules; each proved by a deliberate violation. |
| 9 | The report has the disclaimer, assumptions with sources, the manifest, saved/lost/net with 95% CIs and the impact on non-prioritised passengers | `packages/sim-metrics/test/experiment.test.ts` and golden files. |
| 10 | The six documents exist, with ADRs | README, ARCHITECTURE, PRODUCT_REQUIREMENTS, IMPLEMENTATION_PLAN, DECISIONS (ADR-001 to ADR-014), CHANGELOG. |

**Deviation (ADR-012).** Criterion 4 was approved as "relative error below 3% and the 95% CI
contains the Erlang C value". Three separate 95% intervals reject a correct model about 14% of the
time, and the first test design shared random streams across configurations. The criterion now
uses:
- independent streams per configuration;
- control variates;
- simultaneous 95% intervals (Bonferroni).

An independent large diagnostic run found no bias (+0.49%, t = 1.34).

**Extra beyond the criteria.**
- A second scenario (`single-checkpoint-moderate`) shows how strongly results depend on demand.
- A deterministic port of `ln`/`exp` makes results independent of the JavaScript engine.

### S1 results at a glance (SIMULATED, synthetic data: not operational evidence)

| Scenario (200 simulated days) | Missed flights per day, FIFO | Missed flights per day, priority v0 | Net flights saved per day [95% CI] | Mean extra wait of non-prioritised passengers |
|---|---:|---:|---:|---:|
| `single-checkpoint-demo` (congested morning peak) | 48.7 | 23.6 | 25.1 [23.6, 26.7] | 0.14 min |
| `single-checkpoint-moderate` | 11.9 | 6.9 | 5.0 [4.3, 5.7] | 0.03 min |

These numbers depend entirely on synthetic assumptions. They are also optimistic: there is no
call latency or no-show yet, and the baseline is pure FIFO with no manual handling of urgent
passengers. Slices S2 to S4 remove these simplifications. Full reports:
[docs/reports/slice-1](docs/reports/slice-1).

## S2: acceptance criteria and evidence

Scope delivered:
- **Queue state machine.** A new pure package, `@gateflow/queue-core` (ADR-016), shared with the
  future operational API.
- **Status quo.** The physical FIFO queue is the baseline (ADR-015). GateFlow policies run a
  virtual queue with:
  - a call-ahead buffer target (ADR-017);
  - per-passenger response times and missed calls (ADR-018);
  - second call, no-show timeout, recovery window and reactivation limit `r`;
  - a committed "prepare" window of size `M`.
- **Lanes.** Planned lane schedules in scenario schema 2, plus a third scenario,
  `single-checkpoint-staffed`, whose schedule follows demand.

| # | Criterion | Evidence |
|---|---|---|
| 1 | With zero latency and no no-shows, outcomes equal S1 (regression) | `packages/sim-metrics/test/s1-regression.test.ts`: every S1 metric of both S1 policies is reproduced exactly on seeds 1-3, against a fixture saved from the S1 commit. Moving the engine's urgency threshold by one minute makes it fail. In the published 200-day reports, the 21 S1 metrics of FIFO are identical for every seed of both S1 scenarios (8,400 values). The property "a virtual queue answered instantly behaves exactly like the physical queue" holds on random populations (`packages/sim-model/test/properties.test.ts`). |
| 2 | "Prepare" window churn is zero (property test) | `packages/queue-core/test/properties.test.ts`: over 1,000 random operation sequences on random policies, a committed ticket leaves the window only by being called, the remaining order is preserved, and the window never exceeds M. A mutation that lets priority tickets jump into the window is caught. |
| 3 | The report adds lanes idle while people are queueing, the missed-call rate and recalls | Report section "Call mechanics" (second calls, no-shows as the missed-call rate, reactivations, new tickets, idle lane time) and "Checkpoint operations" (staffed lane-hours, utilisation, people standing). Covered by `experiment.test.ts` and the golden files. |
| 4 | Golden files regenerated and the change explained in the changelog | `packages/sim-metrics/test/golden`; CHANGELOG 0.2.0, "Simulated numbers change". |

Verification beyond the criteria:
- **Hand-computed timelines** for call latency, call-ahead, recalls, no-shows, reactivation,
  expiry with a new ticket, deadline boundaries and lane closures.
- **Property tests of the checkpoint model** on random populations, lane schedules and policies:
  - the fate of every first call follows from the passenger's delay alone (checked
    independently);
  - one passenger per lane at a time;
  - work conservation of the physical queue.
- **Coverage tests** that fail if the random cases stop reaching priority calls, the cap, the
  guard, lane closures, no-shows, reactivations or new tickets.
- **Mutation checks.** Ten deliberate defects in the queue and the engine are caught, and thirteen
  in the simulator (event order, lane accounting, call rule, response rule, metrics).

Findings that changed the design during the slice:
- **Response rule (ADR-018).** The first S2 results charged the full response time to passengers
  called on arrival, as if they had already walked away. On the demo scenario that alone made the
  virtual queue miss 13 to 27 more flights per day than the physical queue, an artefact of the
  model. Now a passenger called before walking away answers sooner and cannot miss the call.
- **Call-ahead (ADR-017).** The default rose from 120 s to 180 s after a sensitivity check: at
  120 s the lanes run dry during the peak.
- **CRITICAL (ADR-019).** The class now accounts for the committed prepare window, so priority
  commitments are not spent on passengers the window has made hopeless.
- **Idle lane time** counts only the capacity that waiting passengers could have used.

### S2 results at a glance (SIMULATED, synthetic data: not operational evidence)

| Scenario (200 simulated days) | Missed flights per day: physical FIFO | virtual FIFO | priority v0 | Net flights saved, priority v0 vs physical FIFO [95% CI] | Net saved by the prioritisation alone [95% CI] |
|---|---:|---:|---:|---:|---:|
| `single-checkpoint-demo` | 48.7 | 49.3 | 29.7 | 19.1 [17.4, 20.7] | 19.6 [18.1, 21.1] |
| `single-checkpoint-moderate` | 11.9 | 12.3 | 10.1 | 1.8 [1.4, 2.4] | 2.3 [1.8, 2.8] |
| `single-checkpoint-staffed` | 58.9 | 59.5 | 37.0 | 21.9 [20.1, 23.7] | 22.5 [20.8, 24.2] |

Realistic call mechanics reduce the benefit found in S1 (net 25.1 and 5.0 flights per day on the
demo and moderate scenarios), as expected. Physical FIFO reproduces S1's FIFO exactly. Full reports
and observations: [docs/reports/slice-2](docs/reports/slice-2/README.md).

## S3: acceptance criteria and evidence

Scope delivered:
- **Baseline A'** (`fifo-manual`, ADR-022): the physical queue with staff calling the flights that
  close within 20 minutes, every 5 minutes, idealised.
- **Groups and families** (ADR-021): one ticket per party, called together and screened on one
  lane. Waits, the cap, the overtake bound and every metric count people.
- **Assisted path** (ADR-021): assisted parties go to the next free lane under every policy, the
  engine never assesses them and the reason is never recorded.
- **Eligibility and anti-abuse:**
  - feasibility margin F separate from the safety buffer (ADR-023);
  - the late-presentation rule, an option (`priority-v1-strict`, ADR-025);
  - a stress-test scenario of strategic late arrivals, `single-checkpoint-strategic`.
- **Priority v1** calibrated on seeds disjoint from the reports (ADR-025). Expired tickets keep
  going to the back of the queue (ADR-024).
- **Schemas and CLI:** scenario schema 3, results schema 3 and the new default comparisons
  (ADR-026).

| # | Criterion | Evidence |
|---|---|---|
| 1 | The report compares A, A' and B | Every slice-3 report has the policies `fifo` (A), `fifo-manual` (A') and `priority-v1` (B), plus `virtual-fifo`. The paired comparisons are B vs A, B vs A' and B vs `virtual-fifo`, with 95% intervals and the cost for non-prioritised passengers. Covered by `packages/sim-metrics/test/experiment.test.ts`, the golden files and the CLI tests of the default comparisons. |
| 2 | With eligibility disabled, B coincides with S2 | `packages/sim-metrics/test/s2-regression.test.ts`. The setup: the demo scenario with parties of one person, nobody assisted and no strategic arrivals, and `priority-v0` without the presentation rule and with F = B. On seeds 1-3 it reproduces every metric of the three S2 policies and of the three S2 comparisons exactly, against a fixture saved from the S2 commit. The S1 regression still holds. |
| 3 | Groups are counted per person | The cap, the FIFO wait and the overtake bound count people (engine tests, e.g. a family of three takes three places in the cap). Overtakes are counted per person in queue-core unit tests and in the property tests with independent per-person oracles. A hand-computed simulation shows a family boosted as a whole, each older ticket overtaken three times. The metrics test checks that "a family of three that misses its flight counts as three". |

Verification beyond the criteria:
- **Property tests** with groups, reactivations and the new rules:
  - no late presenter or oversized group is boosted;
  - the defaults are equivalent to the S2 engine;
  - the flight-call selection matches an independent oracle;
  - the per-person cap and overtake bound hold over random operation sequences.
- **Coverage tests:** the random cases must keep reaching group priority calls, flight calls and
  assisted passengers waiting for a lane.
- **Mutation checks:** 39 deliberate defects are caught, 14 in the engine, 5 in the queue and 20
  in the simulator.

Findings that changed the design during the slice:
- **Double counting (engine 0.2.1).** With a prepare window, the FIFO slack counted the committed
  tickets twice. It was found while preparing S3 and released separately (CHANGELOG 0.2.1).
- **Overtake guard with groups.** Property tests found a case where the guard itself pushed an
  older, reactivated ticket past K. The head is now called in that case (ADR-021).
- **Late-presentation rule.** It was planned as part of v1. It cost 1 to 17 flights per day on
  the calibration seeds and, on balance, protected nobody in the model, so it became an option
  (ADR-025).
- **A' is the real benchmark.** Idealised staff flight calls remove 50-75% of the misses of the
  queue without intervention. Priority v1 recovers most of that benefit but misses 2.3 to 5.2
  more flights per day than A'. The gap is last-minute passengers, whom the virtual call pipeline
  cannot serve in time (slice-3 README). This is the motivation for the S4 proposal.

### S3 results at a glance (SIMULATED, synthetic data: not operational evidence)

| Scenario (200 simulated days) | Missed flights per day: A `fifo` | A' `fifo-manual` | `virtual-fifo` | `priority-v1` | Net saved by v1 vs A [95% CI] | Net saved by v1 vs A' [95% CI] |
|---|---:|---:|---:|---:|---:|---:|
| `single-checkpoint-demo` | 55.1 | 14.7 | 55.8 | 18.0 | 37.1 [33.9, 40.2] | -3.3 [-4.1, -2.5] |
| `single-checkpoint-moderate` | 14.3 | 7.2 | 14.8 | 9.4 | 4.8 [3.9, 5.8] | -2.3 [-2.7, -1.9] |
| `single-checkpoint-staffed` | 65.9 | 17.8 | 66.6 | 23.0 | 42.9 [39.5, 46.4] | -5.2 [-6.2, -4.1] |
| `single-checkpoint-strategic` (stress test) | 204.5 | 132.0 | 205.1 | 164.7 | 39.8 [36.9, 42.7] | -32.7 [-34.1, -31.3] |

GateFlow keeps its other advantages over A': mean standing time falls by 60-80%, and the largest
crowd at the checkpoint falls from 200-270 people to about 32. But on these assumptions it does
not catch more flights than an attentive staff. Full reports and observations:
[docs/reports/slice-3](docs/reports/slice-3/README.md).

## S4: acceptance criteria and evidence

Scope delivered (approved as "priority fast track and staff escalation"):
- **Fast track** (ADR-027, policy `priority-v2` = v1 + fast track):
  - a priority call is made next, ahead of the prepare window;
  - the party goes to the next free lane once it has validated its ticket;
  - the engine estimates such calls with the fast-track response time, shortened for a passenger
    who has just been at the access point;
  - an URGENT head of the waiting list is boosted too;
  - every person passed, in the queue, in the window and at the lanes, counts towards K.
- **Staff escalation** of CRITICAL passengers was prototyped and measured. It adds at most 0.45
  flights per day once the fast track exists, so it is not part of the simulated policy
  (ADR-028).
- Results schema 4, CLI 0.4.0 (default policies with `priority-v2`), engine 0.4.0, queue core
  0.3.0, model 0.4.0.

| # | Criterion (as proposed) | Evidence |
|---|---|---|
| 1 | On the S3 scenarios, B with the new features is not worse than A' | On the three main scenarios (200 days), `priority-v2` misses fewer flights than A': +3.2 [2.5, 4.0], +1.5 [1.2, 1.9] and +1.2 [0.3, 2.3] per day. On the strategic stress test it misses 9.6 more, because A' also pulls forward the people who arrive late on purpose. For everybody else v2 is better there too (12.7 against 13.9 missed per day). Escalation is not included (ADR-028). |
| 2 | The cost to other passengers stays within the ADR-025 criterion | Calibration seeds 1001-1020 (ADR-027) and report seeds 1-200: at most 0.10% of non-prioritised passengers are delayed by more than 5 minutes against `virtual-fifo`. Overtakes alone delay nobody by more than 7.3 minutes, since K = 30 covers the queue, the window and the lanes. Larger delays are knock-on effects of missed calls; they are reported and analysed. |
| 3 | With the new features disabled, S3 is reproduced exactly | `packages/sim-metrics/test/s3-regression.test.ts`: `priority-v1` (no fast track) on seeds 1-3 reproduces every metric of the four S3 policies and five S3 comparisons, against a fixture saved from the S3 commit. The S1 and S2 regressions still hold. |

Verification beyond the criteria:
- **Engine properties.** Margins from their definitions with the fast track; a fast-track boost
  never pushes a committed person past K; the fast track never makes a ticket less feasible;
  without it the new inputs are ignored.
- **Queue properties.** An independent model of the prepare window with fast-track insertions
  and the overtakes they cause.
- **Simulator properties.** On random and congested populations, parties are screened in the
  order of validation except for fast-tracked ones, and K holds for every passenger, lane passes
  included. A coverage test requires passes at the lanes and the bound K to be reached.
- **Hand-computed timeline** of two fast-tracked parties passing the people at a lane, in their
  own order, and stopped by K.
- **Mutation checks:** 16 deliberate defects in the new mechanisms are caught, 6 in the engine, 5
  in the queue and 5 in the simulator.

Findings that changed the design during the slice:
- **K covers every pass.** A first prototype that did not count the passes at the window and at
  the lanes caught more flights but delayed up to 0.59% of other passengers by more than
  5 minutes. Counting them brings the cost back within the criterion.
- **URGENT head.** Under the fast track an URGENT ticket at the head of the waiting list is
  boosted too. Without that rule it waited behind the window and the people at the lanes.
- **Escalation not adopted** (ADR-028), see above.

### S4 results at a glance (SIMULATED, synthetic data: not operational evidence)

| Scenario (200 simulated days) | Missed flights per day: A `fifo` | A' `fifo-manual` | `priority-v1` | `priority-v2` | Net saved by v2 vs A' [95% CI] | Net saved by the fast track alone (v2 vs v1) |
|---|---:|---:|---:|---:|---:|---:|
| `single-checkpoint-demo` | 55.1 | 14.7 | 18.0 | 11.5 | 3.2 [2.5, 4.0] | 6.5 [6.0, 7.1] |
| `single-checkpoint-moderate` | 14.3 | 7.2 | 9.4 | 5.6 | 1.5 [1.2, 1.9] | 3.8 [3.4, 4.2] |
| `single-checkpoint-staffed` | 65.9 | 17.8 | 23.0 | 16.5 | 1.2 [0.3, 2.3] | 6.5 [5.9, 7.0] |
| `single-checkpoint-strategic` (stress test) | 204.5 | 132.0 | 164.7 | 141.6 | -9.6 [-10.9, -8.2] | 23.1 [22.1, 24.2] |

On these assumptions GateFlow v2 catches more flights than idealised manual handling on every
main scenario, with 60-80% less standing time. It needs a fast-track entry to the lanes. Full
reports: [docs/reports/slice-4](docs/reports/slice-4/README.md).

## S5: acceptance criteria and evidence

Scope delivered (approved as "disruptions and data quality"):
- **Ground truth and knowledge** (ADR-030):
  - flight delays with the time the feed announces them, gate changes with a notice delay;
  - unplanned lane outages, which the system sees at once;
  - flight feed outages: messages sent meanwhile arrive when the feed recovers;
  - the system decides on what it knows, and outcomes are judged on the ground truth.
- **Stale-data rule** (ADR-029): a deadline the feed has not confirmed for more than 30 minutes is
  not trusted. The ticket is served in FIFO order until the feed recovers.
- **Hysteresis** (ADR-029): a ticket escalates at once and returns to a less urgent class only
  when its margin passes the threshold by 3 minutes.
- **Stability and data-quality metrics:** class changes and reversals (flapping), people boosted
  on wrong information, misses among passengers of disrupted flights, the disruptions of each day.
- Policy `priority-v3` (v2 plus both rules), scenario schema 4, results schema 5, engine 0.5.0,
  queue core 0.4.0, model 0.5.0, CLI 0.5.0 (default policies with `priority-v3`). New scenarios
  `single-checkpoint-disrupted` and `single-checkpoint-feed-stress`.

| # | Criterion (as proposed) | Evidence |
|---|---|---|
| 1 | With the flight feed absent, B produces exactly the outcomes of A (degradation to FIFO) | Since ADR-015, A is the physical queue, whose call mechanics differ from a virtual queue's, so the criterion is proved in two forms (ADR-030). `packages/sim-metrics/test/s5-acceptance.test.ts`: on the demo and disrupted scenarios (seeds 1-3), with no deadline knowledge, `priority-v2` and `priority-v3` give exactly the outcomes of `virtual-fifo`, passenger by passenger; so does `priority-v3` with the feed down all day. Properties in `packages/sim-model/test/properties.test.ts` (300 random populations with random disruptions each): the same equality, and, with calls answered at once, the equality with the physical FIFO queue A. |
| 2 | Flapping of the classes limited by the hysteresis (test) | Engine property P20: for a margin oscillating around a threshold, the class changes at most once with hysteresis and at every crossing without it. Queue tests: reversals counted against an independent record of the observed classes, and suppressed by h. In the simulator (200 days): v2 had 25 to 190 class reversals per day on the four main scenarios (7 to 40 people a day whose class flapped); v3 has none, and 1.2 and 6.3 on the disrupted and feed-stress scenarios, where lane outages and the stale-data rule cause them. The hysteresis costs no flights (v3 vs v2 within 0.1 per day on the main scenarios, intervals including zero). |
| 3 | With the disruptions disabled, S4 is reproduced exactly | `packages/sim-metrics/test/s4-regression.test.ts`: without disruptions and with the S5 rules off, every metric of the five S4 policies and seven S4 comparisons is reproduced on seeds 1-3, against a fixture saved from a clean checkout of the S4 commit. The S1, S2 and S3 regressions still hold. |

Verification beyond the criteria:
- **Engine.** Boundaries of the stale-data rule and of the hysteresis; an independent oracle of
  the margins with both rules; a stale ticket is never boosted; the hysteresis only holds a class
  between the raw class and the previous one, and has no effect with h = 0.
- **Queue.** Flight updates reach every live ticket of the flight and only those; class changes
  and reversals match an independent record of the observed classes on random operation
  sequences.
- **Simulator.** Hand-computed lane outages, gate changes, delay notices, messages held during a
  feed outage, the order of feed events at the same instant, the stale-data rule and a boost
  made before a gate change is announced. On random populations with random disruptions: every
  invariant of S1 to S4, no boost on stale data, the walk after a gate change, and boosts on wrong
  information only when the knowledge is wrong. Coverage tests require held messages, stale
  periods, lane outages, gate changes and reversals to occur.
- **Metrics.** The disruptions of a day, the stability metrics and the cohort of delayed or
  re-gated flights against hand-computed values; a golden report of the disrupted scenario.
- **Mutation checks:** 30 deliberate defects in the new mechanisms are caught, 8 in the engine,
  6 in the queue, 13 in the simulator and 3 in the metrics.

Findings that changed the design during the slice:
- **Flapping came from the estimate, not from the data.** The class reversals of v2 were the
  seconds-long oscillations of the FIFO wait estimate around a threshold. One minute of
  hysteresis removes almost all of them; 3 minutes (the kickoff value) also absorbs the jumps
  caused by lane changes and costs nothing.
- **Twenty calibration days hid the price of the stale-data rule.** On 20 days no feed outage
  fell in the morning peak, and every maximum age from 30 minutes looked free. On 200 days the
  price shows: rare, but heavy on the days when the feed fails during the peak (ADR-029).
- **The feed's reliability is a condition of the result.** With the feed down for hours a day,
  GateFlow serves in FIFO order for long periods and falls behind A'.

### S5 results at a glance (SIMULATED, synthetic data: not operational evidence)

| Scenario (200 simulated days) | Missed flights per day: A `fifo` | A' `fifo-manual` | `priority-v2` | `priority-v3` | Net saved by v3 vs A' [95% CI] | Class reversals per day: v2 / v3 |
|---|---:|---:|---:|---:|---:|---:|
| `single-checkpoint-demo` | 55.1 | 14.7 | 11.5 | 11.5 | 3.2 [2.4, 4.0] | 162 / 0 |
| `single-checkpoint-moderate` | 14.3 | 7.2 | 5.6 | 5.6 | 1.5 [1.2, 1.9] | 25 / 0 |
| `single-checkpoint-staffed` | 65.9 | 17.8 | 16.5 | 16.6 | 1.2 [0.1, 2.2] | 190 / 0 |
| `single-checkpoint-strategic` (stress test) | 204.5 | 132.0 | 141.6 | 141.6 | -9.6 [-10.9, -8.4] | 139 / 0 |
| `single-checkpoint-disrupted` | 47.8 | 12.4 | 10.8 | 11.1 | 1.3 [0.4, 2.0] | 162 / 1.2 |
| `single-checkpoint-feed-stress` (stress test) | 47.8 | 12.4 | 11.1 | 14.2 | -1.8 [-3.3, -0.5] | 164 / 6.3 |

With realistic disruptions GateFlow v3 still catches more flights than idealised manual handling,
with stable classes. The stale-data rule costs 0.3 flights per day on the disrupted day, almost all
on the few days when the feed fails for more than an hour; with a feed down for hours a day it
costs 3.1 and GateFlow falls behind A'. Full reports:
[docs/reports/slice-5](docs/reports/slice-5/README.md).

## Later milestones (summary)

- **M2 Simulator Studio:** a Next.js `/sim` page running the kernel in a Web Worker (the browser
  must produce the same `results.json` as the CLI), persisted runs through a Fastify API and
  PostgreSQL, per-passenger drill-down and day replay.
- **M3 Priority end-to-end:**
  - persistence with one writer per checkpoint, idempotency, event log and hash-chained audit;
  - BCBP parser and synthetic generator with HMAC deduplication;
  - kiosk, ticket page, display (SSE), lane station and supervisor modes;
  - digital twin. Acceptance: the live system calls passengers in the same order as the offline
    simulator.
- **M4 Operations and Predict preview:** console KPIs, forecasts (Monte Carlo on the simulation
  from the live state), lane-opening recommendations with logged decisions.
- **M5 Pilot readiness (gated):** OIDC/MFA, four-eyes policies, real feed adapters, lab
  hardware, degraded modes, hardening, privacy pack, deployment, shadow mode.
