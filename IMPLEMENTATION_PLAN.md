# GateFlow implementation plan

Incremental plan by milestones and vertical slices. Every slice is small, testable, integrated with
the previous ones and free of hardware dependencies until M5. The detailed rationale is in the
kickoff proposal ([docs/kickoff/KICKOFF_PROPOSAL.md](docs/kickoff/KICKOFF_PROPOSAL.md), section 3).

Status legend: **Done**, **Next**, **Planned**, **Gated** (needs a business decision first).

## Milestones

| Milestone | Business plan stage | Status |
|---|---|---|
| M1: Simulator core and priority engine | R1 | **Done** (S1 to S8) |
| M2: Simulator Studio (web, runs in the browser) | R1-R2 | In progress (S9 and S11 done) |
| M3: Priority end-to-end in the browser, digital twin | R2 | **In progress** (from 2026-11-22) |
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
| **S6** | Parallel batches (worker threads), sensitivity sweeps (k/N, K, lanes, load factor, show-up, maximum data age, feed reliability), HTML report with charts (ADR-031 to ADR-034) | **Done** |
| **S7** | Data licences checked (OPDI is non-commercial, not imported: ADR-035); airport flight lists from CSV files, seats by aircraft type, data sources and licences in every report (ADR-036); scenario library: VCE-like normal, peak and disrupted days, TSF-like peak day, MX-like transfer hub (ADR-037) | **Done** |
| *after S7* | Airport configurations: one file per airport and checkpoint with every parameter, GateFlow settings, today's practice and fairness target per checkpoint, lane plans from a rule (ADR-038) | **Done** |
| **S8** | Experiment C: extra lanes opened by today's supervisor or recommended by GateFlow from a forecast of arrivals, with an operator model (staff on call, time to open, duty manager who may not follow), within the lanes and staff of each checkpoint (ADR-039) | **Done** |

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

## S6: acceptance criteria and evidence

Scope delivered (approved as "parallel batches and statistics"):
- **Parallel batches** (ADR-031): the CLI spreads the simulated days over worker threads
  (`--workers`, default every CPU). Days are pure functions of the job and the seed and are
  assembled in seed order, so the outputs never depend on the number of threads.
- **Sensitivity sweeps** (ADR-032): `gateflow-sim sweep --spec sweeps/<id>.yaml` varies one
  assumption at a time. The parameters are the policy (K, k, N, h, maximum data age), every virtual
  queue (M, call-ahead, response estimate) and the scenario (lanes, load factor, arrival shift,
  call response, missed calls, delays, lane and feed outages). Points with the same days share
  them, and each policy runs once per day. Two sweeps are published.
- **HTML reports with charts** (ADR-033): `report.html` and `sweep.html`, self-contained and
  deterministic, light and dark.
- **Maximum data age raised to 60 minutes** (`priority-v3` 0.2.0, ADR-034), as the sweeps showed
  that 30 minutes cost flights and protected almost nothing. The founder delegated this choice.
- Sweep schema `gateflow.sim.sweep/1`, metrics 0.6.0, CLI 0.6.0, queue core 0.5.0.

| # | Criterion (as proposed) | Evidence |
|---|---|---|
| 1 | 1000 seeds x 3 policies within the measured time target (kickoff: under 10 minutes on a laptop with worker threads) | Demo scenario, `fifo`, `fifo-manual`, `priority-v3`, 1000 days: **48 s with 4 worker threads**, 148 s with one, in the 4-vCPU cloud container used for the reports. The identical outputs were compared with `cmp`. One day of about 15,000 passengers (11,248 parties) takes about 0.4 s per policy on one thread (kickoff target: under 2 s). 200 days x 5 policies take 15-18 s per scenario. |
| 2 | Regenerated report identical | The worker-thread test (`apps/sim-cli/test/workers.test.ts`) builds the bundle and compares `results.json`, `report.md`, `report.html` and `sweep.json` written with 1 and with 3 threads. CI compares 1 and 4 threads on every push. Days computed separately and in shuffled order assemble into the same experiment and the same sweep (`experiment.test.ts`, `sweep.test.ts`). Golden files lock the HTML report and a sweep in JSON, Markdown and HTML. |
| 3 | Sweeps on k/N, K, lanes and load factor | `sweeps/sensitivity-demo.yaml` (200 days per point, 3,400 distinct simulated days) covers k, K, lanes and load factor. It also covers M, hysteresis, arrival shift, call response, missed calls, the call-ahead with slow passengers and K under overload. `sweeps/data-quality-disrupted.yaml` (2,400 days) covers the maximum data age, the feed's reliability, delays and lane outages. Reports: [docs/reports/slice-6](docs/reports/slice-6/README.md). |

Verification beyond the criteria:
- Every setting changes exactly what it should (the candidate, every virtual queue, or the
  scenario, validated again) and rejects values that make no sense.
- Every point of a sweep reproduces an ordinary experiment with the same settings, metric by
  metric.
- Policies shared by several points are simulated once per day, and their results are
  identical across points.
- The HTML is well formed, carries the disclaimer, every assumption and every table of the
  Markdown, and passes a render check in light, dark and phone widths (no sideways page scroll).
- The chart palette was validated for colour-blind separation in light and dark mode.

Findings that changed the design or the claims during the slice:
- **The advantage over today's practice holds in a band of conditions.** On congested but
  manageable days GateFlow catches 1 to 3 more flights per day than idealised A'. In overload,
  A' saves far more:
  - one lane fewer: -95 per day;
  - 10% more passengers: -10;
  - passengers 20 minutes later: -40.

  The bound K is the reason: on those days A' overtakes one passenger up to 738 times, and
  matching A' would need K = 120, with 13% of the other passengers delayed by more than
  5 minutes. The claims in the README now state this band.
- **The call-ahead must follow the measured response time.** With passengers answering in a
  median 3 minutes, the default call-ahead costs 26 flights per day against A'; a call-ahead of
  300 s restores the advantage.
- **K = 30 is the largest bound within the fairness criterion of ADR-025**, confirmed by the
  sweep (K = 40 delays 0.27% of the others by more than 5 minutes).
- **Maximum data age** (ADR-034): 60 minutes costs nothing with a reasonably reliable feed and
  still degrades to FIFO during long outages.

### S6 results at a glance (SIMULATED, synthetic data: not operational evidence)

| Demo day, one assumption varied (200 simulated days per point) | Net flights saved per day by `priority-v3` vs A' |
|---|---:|
| Base (6 lanes, demand as in the scenario) | +3.2 [2.4, 4.0] |
| 7 lanes / 5 lanes | +0.6 / **-95.1** |
| Demand x0.9 / x1.1 | +1.1 / **-10.1** |
| Passengers 10 minutes earlier / later | +2.6 / **-11.0** |
| Call response 120 s / 180 s (180 s with a 300 s call-ahead) | +1.7 / **-25.7** (+2.0) |
| K = 20 / K = 40 (others delayed > 5 min: 0.00% / 0.27%) | +0.0 / +4.7 |

GateFlow is fast enough for batch analysis on a laptop, and every report is reproducible to the
byte on any number of threads. Full reports with charts:
[docs/reports/slice-6](docs/reports/slice-6/README.md).

## S7: acceptance criteria and evidence

Scope delivered (approved as "real schedules and scenario library", data licences first):
- **Data licences checked first** (ADR-035). OPDI and EUROCONTROL's performance portal publish
  for non-commercial use, and OpenSky's terms restrict for-profit use. No public flight data was
  downloaded or used, and the planned OPDI import was replaced by the next item.
- **Flight lists from the airport** (ADR-036). Scenario schema 5 adds:
  - `dataSources`, with the licence or terms of use of each source;
  - schedule kind `flight-list`, a CSV file in the `gateflow.flights/1` format, read by the CLI
    with its SHA-256;
  - seats by aircraft type, marked as an assumption;
  - `gateflow-sim flights`, which writes any design day in that format.
- **Data sources and licences in every report**, run and sweep, and in their manifests.
- **Scenario library** (ADR-037), on synthetic flight lists:
  - VCE-like normal, peak and disrupted days, sized from Venice's published 2025 traffic;
  - a TSF-like peak day at a low-cost base;
  - an MX-like transfer security checkpoint fed by tight connections.

  Lanes follow an hourly plan from a stated rule. Two sweeps go with it, and sweeps gain the
  screening time per person as a parameter.
- **Data request** for the airport: [docs/data-request](docs/data-request/README.md).
- Scenario schema 5, results schema 6, sweep schema 2, population generator 0.5.0, scenarios
  0.5.0, metrics and CLI 0.7.0.

| # | Criterion (kickoff, as proposed) | Evidence |
|---|---|---|
| 1 | Check the data licences before importing (kickoff decision 10) | ADR-035 quotes the terms of OPDI, of EUROCONTROL's portal and of the OpenSky Network, read on 2026-11-21, and records the decision not to use them. |
| 2 | The three demand scenarios of the M1 gate run end to end | `vce-like-normal-day`, `vce-like-peak-day` and `vce-like-disrupted-day` run from their CSV flight lists through the CLI to JSON, Markdown and HTML reports. Each run is 200 days x 5 policies, 29-46 s on 4 threads, from a clean checkout. CI runs them on every push, and checks that a flight-list scenario gives identical outputs on 1 and 4 threads. |
| 3 | Provenance and licence of the data visible in the report | Section "Data sources and licences" in every run and sweep report. It lists each source with its kind, provider, licence, retrieval date and uses, and the flight list with its SHA-256. The manifest carries the same. Tests in `packages/sim-metrics/test/provenance.test.ts` and in the golden files. |
| 4 | Real schedules can be imported (in place of OPDI: the airport's own list) | The `gateflow.flights/1` reader and writer are tested (`packages/sim-scenarios/test/flights.test.ts`): quoting, semicolons, comments, errors with line numbers, unknown types, zones and duplicates. The round trip is tested too: demo scenario, `flights` export, flight-list scenario, identical passengers and identical results through the CLI (`apps/sim-cli/test/cli.test.ts`). |
| 5 | Seats mapping marked as an assumption | `schedule.seats`, source SYNTHETIC with a note, by ICAO type designator. A flight without seats, passengers or a known type is rejected, naming the flight. |
| 6 | MX-like hub (synthetic) | `mx-like-transfer-hub`: transfer security checkpoint, time zone America/Mexico_City, connecting passengers only, six banks. |

**Deviation.** The OPDI import was not built (ADR-035): its data is for non-commercial use, it
does not cover Mexico, and its public flight list has no take-off time. The airport's flight
list takes its place. If written permission is obtained, an OPDI adapter would map the OPDI
columns to the same format.

Verification beyond the criteria:
- The library flight lists match their generator (test and CI).
- Each library scenario has the stated number of flights and of people, and a valid
  population.
- The disrupted day has exactly the passengers and lanes of the peak day.
- Version 4 scenarios are rejected with migration instructions, and the migrated scenarios
  reproduce their S6 results exactly.
- The template of the data request parses.
- Fixed: the first line of every report counted parties as passengers; it now gives both.

Findings that change the claims (SIMULATED, 200 days per point; details in
[docs/reports/slice-7](docs/reports/slice-7/README.md)):
- **The kind of checkpoint decides the value case.** Compared with A':
  - transfer security of a hub: **+8.7 flights per day** [7.2, 10.4];
  - a VCE-like departures checkpoint with lanes planned to demand: within noise (0.0 to +0.3);
  - a low-cost base with one morning bank: **-2.3**, because staff calling the closing flights
    catches everyone there.
- **Capacity decides at a departures checkpoint.** On the VCE-like peak day the margin over A'
  grows with tighter capacity: +1.7, +7.9 and +35.5 per day at 25, 26 and 27 s per person
  instead of 24, and +23.1 with one lane fewer. Unlike the demo day of S6, A' does not catch up in
  these overloads. Just beyond, the plans collapse (thousands of missed flights), where a real
  airport would open lanes: this is S8.
- **Fairness at the hub.** With K = 30, 0.81% of the other passengers are delayed by more than
  5 minutes (0.52% at the low-cost base), above the 0.1% criterion of ADR-025. K = 15 gives 0.28%
  and +2.9 flights per day. K is a setting for each checkpoint.
- **Data first.** The library cannot say where VCE or TSF really sit. The airport's lanes,
  throughput, measured waits and flight lists can, without code changes:
  [docs/data-request](docs/data-request/README.md).

### S7 results at a glance (SIMULATED, synthetic data: not operational evidence)

| Scenario (200 simulated days) | People per day | Missed per day: A / A' / v3 | Net saved by v3 vs A' [95% CI] |
|---|---:|---:|---:|
| VCE-like normal day | 16,623 | 11.5 / 10.9 / 10.9 | 0.0 [-0.1, 0.1] |
| VCE-like peak day | 21,792 | 25.0 / 18.8 / 18.6 | +0.2 [-0.1, 0.6] |
| VCE-like disrupted day | 21,792 | 20.0 / 14.3 / 14.1 | +0.3 [-0.1, 0.7] |
| TSF-like peak day | 5,981 | 25.8 / 0.0 / 2.3 | -2.3 [-3.1, -1.6] |
| MX-like transfer hub | 4,473 | 131.6 / 96.7 / 87.9 | +8.7 [7.2, 10.4] |

With S7 the technical part of the M1 exit gate is met:
- three demand scenarios: the VCE-like normal, peak and disrupted days;
- a fairness analysis in every report;
- reports reproducible to the byte;
- every number labelled as simulated.

S8 (lane opening) completes M1.

## S8: acceptance criteria and evidence

Scope delivered (approved with "Vai", the details delegated: "il resto decidi te la cosa
migliore"):
- **Lane modes for every policy** (ADR-039): `<policy>@reactive`, today's supervisor who opens a
  lane when the queue shows a long wait, and `<policy>@predict`, GateFlow's recommendations from
  a projection of the queue over 45 minutes on a forecast of arrivals.
- **Operator model**, per checkpoint in the airport configuration (`checkpoint.laneStaffing`):
  - staff on call for a number of extra lanes;
  - a time from the decision to the first passenger screened, drawn per decision;
  - a minimum time open;
  - the share of GateFlow's recommendations the duty manager follows.
- **Physical lanes and roster**: `lanesAvailable` is the lanes the checkpoint has,
  `lanePlanRule.maxLanes` the most the roster plans; extra lanes open only in between.
- **Forecast of arrivals** from 50 simulated days that are never simulated in the reports.
- **Metrics and reports**:
  - extra lane-hours, decisions and those followed (the alerts generated and accepted of the
    kickoff), lanes opened and closed, most lanes open;
  - what each extra lane-hour buys, with bootstrap intervals;
  - a "Lane management" section in the reports, and four new sweep parameters.
- Queue core 0.6.0, model 0.6.0, population generator 0.6.0, results schema 7, sweep schema 3,
  scenarios 0.6.0, metrics and CLI 0.8.0. The scenario schema stays at version 5.

| # | Criterion (kickoff, as proposed) | Evidence |
|---|---|---|
| 1 | A recommendation rule for opening lanes | `@predict` (`packages/sim-model/src/checkpoint.ts`, ADR-039). It recommends the fewest lanes that keep the projected wait below the target, and closing a lane when the projection without it stays short. The target and the horizon are settings of the checkpoint (`gateflow.laneTargetWaitMinutes`, `laneHorizonMinutes`). Hand-computed test: on a wave of arrivals it opens the lane before anyone arrives, and the supervisor only once the queue is long (`packages/sim-model/test/lanes.test.ts`). |
| 2 | An operator model | `checkpoint.laneStaffing`. The day's open delays (log-normal) and the duty manager's answers (Bernoulli) are drawn on streams of their own: every policy meets the same ones, and the rest of the population is unchanged (`packages/sim-scenarios/test/lanes.test.ts`). A recommendation that is not followed changes nothing (test). The supervisor of `@reactive` stands for today's practice; its thresholds come from `todayPractice`. |
| 3 | Cooldown and deduplication | 10 minutes between decisions; lanes decided but not yet open count against the staff on call, so the same need is not decided twice (tests with a 20-minute delay: one decision with staff for one lane, three decisions 10 minutes apart with staff for three). |
| 4 | The report shows the benefit against the extra lane-hours | Section "Lane management" of every report with a lane mode: extra lane-hours per policy, and per comparison the net flights saved, the change in time to screening, and the waiting saved and net flights saved per extra lane-hour, with 95% bootstrap intervals (`bootstrapRatioInterval`, tested). The sweep tables give the extra lane-hours of every point. |
| 5 | No extra capacity beyond the limits of the scenario | Open lanes never exceed `lanesAvailable` nor the roster plus the staff on call. 200 random cases check it, and that everybody is screened (`lanes.test.ts`, properties). In the 1,000 simulated days of the reports the most lanes open are 14, 6 and 5, the lanes the three checkpoints have. Without staff on call a policy with a lane mode gives exactly the run of the plan (test). |

Verification beyond the criteria:
- The S7 results are unchanged without lane management:
  - the library days give the populations of S7, plus the day's staff on call, and the per-day
    results of S7 field by field (`packages/sim-metrics/test/s7-library-regression.test.ts`);
  - in the published reports, `fifo`, `fifo-manual` and `priority-v3` give the S7 outcomes on
    all 1,000 days, value by value. Only the risk classes on arrival differ, on the disrupted
    day and at the hub, because these runs classify with v3 (the first priority policy listed)
    and those of S7 with v2.
- The golden files differ only by the added fields, the versions and one model limitation.
- CI checks that runs with lane modes give identical outputs on 1 and 4 threads.
- 478 tests in 8 packages.

Findings that change the claims (SIMULATED, synthetic data, 200 days per scenario and per
point; details in [docs/reports/slice-8](docs/reports/slice-8/README.md)):

- **At the hub, the extra lane decides.** One lane more than the roster, opened before each
  wave on GateFlow's recommendation: 32.2 fewer missed flights per day than the plan alone,
  against 15.2 when a supervisor reacts to the queue. GateFlow as a whole (calls and lanes)
  catches **+19.7 flights per day** [17.8, 21.6] more than today's practice with a supervisor,
  for 1.25 more lane-hours (about 2.5% of the staffed lane-hours, 4 lane-minutes per flight).
- **At the low-cost base, the lanes close the gap of S7**: v3 with GateFlow's lanes misses 0.1
  flights per day instead of 2.3 (A' with a supervisor: 0.0), and the 90th percentile of the
  wait falls from 15 to 4 minutes.
- **Where the roster follows demand, extra lanes are rarely needed** (VCE-like days: 0.3-0.5
  lane-hours per day on peak days, missed flights almost unchanged). On a day harder than
  planned they are the safety valve: with screening 8% slower than planned the plan alone misses
  33.1 flights per day, the supervisor 22.2 and GateFlow's lanes 20.9.
- **The operator model matters less than the target.** The time to open a lane (5-20 minutes)
  and the share of recommendations followed (40-100%) move the result little, because a
  recommendation not followed comes back. GateFlow's target wait trades lane-hours for flights
  (5 minutes: +3.1 flights per day over the supervisor for 1.7 more lane-hours; 15 minutes: -2.1),
  so it is a setting of each checkpoint.
- **Limits.** The supervisor is idealised (exact wait, every 5 minutes), the staff on call have
  no other duties, and the forecast is learnt from the model itself. The airport's practice and
  data decide: the data request asks who opens lanes, on what signal, how many and how fast.

### S8 results at a glance (SIMULATED, synthetic data: not operational evidence)

| Scenario (200 simulated days) | Missed per day: A' / with a supervisor / with GateFlow lanes | v3 / v3 with GateFlow lanes | GateFlow as a whole vs today's practice with a supervisor [95% CI] | Extra lane-hours per day: supervisor / GateFlow |
|---|---:|---:|---:|---:|
| VCE-like normal day | 10.9 / 10.9 / 10.9 | 10.9 / 10.9 | 0.0 [-0.1, 0.1] | 0.0 / 0.0 |
| VCE-like peak day | 18.8 / 18.7 / 18.7 | 18.6 / 18.4 | +0.4 [0.0, 0.7] | 0.1 / 0.3 |
| VCE-like disrupted day | 14.3 / 14.0 / 13.9 | 14.1 / 13.6 | +0.4 [0.1, 0.8] | 0.2 / 0.5 |
| TSF-like peak day | 0.0 / 0.0 / 0.0 | 2.3 / 0.1 | -0.1 [-0.2, -0.1] | 1.1 / 1.3 |
| MX-like transfer hub | 96.7 / 81.5 / 64.5 | 87.9 / 61.8 | **+19.7** [17.8, 21.6] | 0.6 / 1.8 |

With S8, M1 is complete:
- the priority engine and the queue shared with the product;
- a reproducible simulator with today's practice, disruptions, data quality and extra lanes;
- the airport's data as input, per airport configuration;
- reproducible reports.

## M2: Simulator Studio

| Slice | Content | Status |
|---|---|---|
| **S9** | Simulator Studio in the browser: one self-contained page (scenario library, what-if settings, every parameter with its source, policies with their lane modes, report, comparison of runs), days on Web Workers, offline and on a phone, the CLI's results (ADR-040) | **Done** |
| S10 | API (Fastify, PostgreSQL): persisted scenarios and runs, asynchronous runs, history, export. Acceptance: `POST /v1/simulations` gives a run reproducible from its manifest; integration tests with Testcontainers | **Moved into M3** (S12 and S19) |
| **S11** | Per-passenger detail (why a passenger was called earlier, the paired outcome) and replay of the day. Acceptance: every call of the replay shows the engine's reason codes (ADR-041) | **Done** |

S11 came before S10 (the founder agreed on 2026-11-22): the replay shows airports what sets
GateFlow apart, and runs in the same offline page.

S10 moved into M3 (confirmed with "vai M3" on 2026-11-22). M3 needs a server and a database for
the operational product (persistence, event log, audit): they are built once there, in S12, and
the Studio's runs are saved through the API in S19.

The slices of M2 were S8 to S10 in the kickoff proposal: they moved by one with the renumbering
of S4.

## S9: acceptance criteria and evidence

Scope delivered (approved with "Vai"):
- **GateFlow Simulator Studio**, `apps/studio/dist/gateflow-studio.html`: one HTML file of about
  1.6 MB that holds the scenario library, the simulator and its worker, and loads nothing.
- **What a person can do in it:**
  - choose a checkpoint and day of the library, or give their own airport configuration, days
    and flight lists (they stay in the browser);
  - change ten what-if settings (lanes, screening time, passengers, arrival times, lane
    outages, staff on call, time to open a lane, recommendations followed, K, GateFlow's target
    wait), or any parameter with its source;
  - choose the policies, each with the plan only, a supervisor's lanes or GateFlow's lanes, and
    the status quo;
  - simulate 10 to 1,000 days and read the CLI's report, in both themes;
  - copy or save the results, the report and the scenario;
  - compare two runs, of the session or results files.
- **`@gateflow/studio-core`** (pure): SHA-256, files, library, setup, what-if settings, parameter
  editor, comparison of runs. The default comparisons and the classification on arrival moved
  from the CLI to sim-metrics.
- CLI and metrics 0.9.0, studio core 0.1.0. Results are unchanged.

| # | Criterion (kickoff, as proposed) | Evidence |
|---|---|---|
| 1 | Scenario editor with the source of each parameter | The what-if settings mark every parameter they change as a SYNTHETIC assumption, with a note giving the value of the scenario, and rename the scenario "what-if". "All parameters" edits any labelled value with its source and note; the scenario is validated again (`packages/studio-core/test`). |
| 2 | Execution in the browser, on a Web Worker | Days run on one worker per core, up to 8; the forecast and the statistics on a worker too. Where workers are refused the page runs them itself, with the same results (end-to-end test). |
| 3 | Report and comparison | The CLI's report inside the page, from the same results document. Two runs side by side: missed flights by policy, net flights saved, and the assumptions that differ (end-to-end test). |
| 4 | Static, downloadable build that works offline | One file, opened from disk. Its Content Security Policy forbids every connection, and the end-to-end tests record no network request. CI publishes it as an artefact. |
| 5 | Same scenario and seeds: identical `results.json` from the browser and the CLI | Byte for byte, except `manifest.generator`, which names the program (ADR-040, as ADR-012 refined S1). Tested in Chromium: the demo day; the TSF-like day with extra lanes and the arrival forecast, with workers and without; a what-if saved by the page and run by the CLI. The SHA-256 of the page equals node:crypto's on 500 random strings and every library file. Every library scenario loads with the CLI's hash. |

Verification beyond the criteria:
- The page fits a phone (390 px, no horizontal scroll) and follows the light and dark themes.
- 30 days of the MX-like hub with six policies take about 4 s on four cores.
- Report links are kept only for web addresses and relative paths (the page may show results
  files a person loads).

## S11: acceptance criteria and evidence

Scope delivered (approved with "vai pure"):
- **The trace of a day** (`@gateflow/sim-trace`, schema `gateflow.sim.trace/1`):
  - every event of one day of a run, for two of its policies on the same passengers;
  - the day itself, so that the trace can be checked and run again;
  - a fingerprint that the CLI and the Studio both give.
- **The simulator tells the day**: an observer receives every `DayEvent` and never changes the
  run. The queue's commitment event carries what the engine decided on.
- **Reasons in words**: every reason code of the engine has a title and a sentence; every call is
  explained with its figures, margins given as times at the gate.
- **CLI**: `gateflow-sim trace --scenario <file> --seed <n>` writes `trace.json` and prints the
  day in numbers and its fingerprint.
- **Studio**, replay of a day of the run:
  - the typical, best, worst or any day;
  - both policies at any moment: people in each stage and the lanes;
  - three aligned charts with the hour-by-hour table;
  - the latest calls with their reasons;
  - the passengers saved, lost, or who waited longer for others;
  - each passenger's day under both policies, call by call;
  - the fingerprint, the CLI command and the trace file.
- CLI and Studio 0.11.0, studio core 0.2.0, trace 0.1.0. Engine, queue and model versions
  unchanged; results unchanged.

| # | Criterion (kickoff, as proposed) | Evidence |
|---|---|---|
| 1 | Every call of the replay shows the engine's reason codes | Every commitment carries its reasons and the engine's assessment; the replay lists every call with its code and title, and a passenger's day explains each call. Tested on five library days (every commitment explained, every priority call `URGENT_FEASIBLE`, or `FLIGHT_CALL` for today's staff practice) and in Chromium (every call shown has a reason code of the engine; priority calls only: `URGENT_FEASIBLE`). |
| 2 | Per-passenger detail: why a passenger was called earlier | The figures of the decision: boarding close as known, risk class, estimated wait and time at the gate in arrival order and if called now, latest useful call, tickets and people passed, fast track, safety margin. The engine's notes on the ticket (source of the closing time, safety margin used, rules applied) are shown too. |
| 3 | The paired outcome | Every party under both policies: saved, lost, missed or made with both, and the change in wait. The day's flights saved and lost equal the run's for that day (Node tests on five days, CLI test, Chromium end-to-end test). |
| 4 | Replay of the day | Projections of the day's events, equal to the simulator's own statistics on five library days: waiting and standing integrated over the day, largest queues, lanes, the day's metrics. Seek, play at three speeds, or jump to any step of a passenger. |

Verification beyond the criteria:
- The observer never changes a run: property tests on random days (with disruptions, extra
  lanes, supervisors and GateFlow's recommendations); extra lane time recomputed from its events
  equals the simulator's.
- The Studio's trace of a day equals the CLI's, fingerprint included (Node and Chromium).
- The replay opens on the median day, so no chosen day is shown as the rule.
- The page still makes no network request and fits a phone. The replay of an MX-like hub day is
  ready about 0.3 s after the run, its fingerprint 0.8 s later.
- The busiest library day (VCE-like peak, 15,088 parties, 210,000 events) traces in 0.6 s into
  41 MB of JSON.

## M3: Priority end-to-end in the browser

The product an airport installs, without hardware: passengers take a ticket at a kiosk, wait
freely, are called on displays and validated at the access point, and staff run the checkpoint
from the browser. Approved with "vai M3" on 2026-11-22; S10 (the server and the database) is built
here once, for the product. The slices follow the kickoff (section 3, M3), renumbered after S11.

| Slice | Content | Acceptance (kickoff, renumbered) | Status |
|---|---|---|---|
| **S12** | Operational core: API server (Fastify), PostgreSQL with migrations, one writer per checkpoint, command and event log, current-state tables, idempotent commands, hash-chained audit, demo data. The queue runs the same `queue-core` as the simulator | 100 concurrent "call next" give no double call; the database refuses a second admission; the audit check finds tampering; the same command twice is applied once; a restart, or a second server, gives the same queue | **Done** |
| **S13** | BCBP package: multi-leg parser, synthetic generator, validations, HMAC deduplication key; the kiosk's scan endpoint (a ticket, the same ticket again, or a reason) | Round trip and fuzzing pass; no boarding pass in the logs; Julian date to the right year across year end (ADR-043) | **Done** |
| **S14** | Web application, kiosk and ticket: scan (paste, sample, HID scanner), outcomes, digital and printable ticket, ticket page, Italian, English and Spanish, privacy notice, kiosk credentials | A rescan returns the same ticket; another airport's boarding pass is refused with a reason (both already true of the API since S13); no personal data on screen | **Done** |
| **S15** | Queue life cycle and lane station: timers on a scheduler, recall, no-show, reactivation, admission, manual ticket, review; staff users and roles. From S14: a party's number (at the lane; at the kiosk since 0.15.1), and the rule for a pass whose boarding has closed | The state machine is covered by tests; every transition is idempotent | **Done** |
| S16 | Display over SSE: called and prepare numbers, data freshness, reconnection with `Last-Event-ID` | No event lost after a disconnection; "data not up to date" within the timeout | Planned |
| S17 | Supervisor: modes (FIFO only, paused, emergency), overrides with a reason, lanes, audit view; versioned policies and their activation | Overrides and mode changes are always in the audit; in FIFO only the order is pure FIFO | Planned |
| S18 | Digital twin: the simulator drives the live system at accelerated time; demo page | Same scenario and seed: the live system calls passengers in the same order as the offline simulator | Planned |
| S19 | Simulations through the API (from S10): saved scenarios and runs, history, export; the Studio saves its runs | `POST /v1/simulations` gives a run reproducible from its manifest | Planned |

## S12: acceptance criteria and evidence

Scope delivered (approved with "vai M3"):
- **`@gateflow/operations`** (pure): one service day of a live checkpoint on the simulator's
  `CheckpointQueue`, unchanged. Commands `OPEN_DAY`, `ISSUE_TICKET`, `CALL_NEXT` and `PRESENT`;
  numbered tickets (A001...), the queue's own events, a day rebuilt exactly from its log.
- **`apps/api`** (Fastify, PostgreSQL, Drizzle):
  - one writer per checkpoint, idempotent commands, a hash-chained append-only log;
  - current-state tables and admissions, at most one per ticket by the database;
  - the service day opened automatically;
  - the audit check, the passenger's view of a ticket, OpenAPI;
  - the `gateflow-api` bundle: `migrate`, `seed`, `serve`.
- **`@gateflow/contracts`**: the API's schemas (Zod) and the OpenAPI document.
- Tests on a real PostgreSQL (a throwaway cluster locally, PostgreSQL 17 in CI).
- API 0.12.0, operations 0.1.0, contracts 0.1.0. No simulated number changes.

| # | Criterion (kickoff, as proposed) | Evidence |
|---|---|---|
| 1 | 100 concurrent "call next" give no double call | 61 tickets waiting, 100 calls at once through the API: each ticket called exactly once, the other 39 calls find nobody, 100 commands in the log, chain intact. Without the advisory lock the same test fails (mutation check). |
| 2 | The database refuses a second admission | The second presentation of an admitted ticket answers `ALREADY_ADMITTED` and writes no admission; a second admission inserted directly is refused by the primary key. |
| 3 | `audit/verify` detects tampering | An event changed by an administrator who disabled the append-only trigger breaks the chain at its command, which the check names. |
| 4 | Idempotency | The same `Idempotency-Key` gives the same answer, applied once (`Idempotent-Replayed: true`); the key reused for another request is refused (409). |
| 5 | Same state after a restart, or with two servers | A second server on the same database continues the numbering and the calls; the first catches up. The tickets' state equals the replay of the log. |
| 6 | Same code as the simulator | Property tests on random days: the log rebuilds the same day, and the events are those of the simulator's queue driven with the same inputs. |

Verification beyond the criteria:
- Invalid requests (unknown fields such as a name, a party of 50, an unknown flight or ticket)
  are refused and write nothing.
- A new service day starts numbering from A001 again; the previous day's tickets stay.
- The request log keeps no client address and no ticket reference (test).
- The bundle migrates, seeds the VCE-like day (138 flights) and serves. A ticket is issued,
  repeated with its key, called and admitted, and the audit check is intact, over real HTTP,
  locally and in CI.

## S13: acceptance criteria and evidence

Scope delivered (part of M3, approved with "vai M3"):
- **`@gateflow/bcbp`** (pure): the M format of Resolution 792, one to four legs.
  - The parser never throws, never returns the name and never quotes the text in an error.
  - Also: an encoder, a generator of synthetic passes, the flight date's year, the leg for a
    checkpoint and the material of the deduplication key.
- **API**: `POST /v1/checkpoints/{id}/scans` gives `ISSUED`, `RETRIEVED`, `NEEDS_ASSISTANCE`
  (`ALREADY_ADMITTED`, `UNKNOWN_FLIGHT`) or `REJECTED` (`UNREADABLE`, `WRONG_AIRPORT`,
  `WRONG_DAY`).
  - The deduplication key is an HMAC with a random secret per airport and flight date.
  - Every scan is recorded without personal data; flights carry their designator.
- BCBP 0.1.0, API 0.13.0, operations 0.2.0 (`dedupKey` in the issue command), contracts 0.2.0.

| # | Criterion (kickoff, as proposed) | Evidence |
|---|---|---|
| 1 | Round trip and fuzzing | 500 random passes of one to four legs (versions 5 to 8, security data or not) read back exactly as encoded. 2,000 arbitrary or corrupted texts never make the parser throw; errors are typed, with a position, and quote nothing. |
| 2 | No boarding pass in the logs | After scans of every outcome through the API, no line of the request log and no row of any table contains the pass, the name or the booking reference (test). |
| 3 | Julian date to the right year across year end | Day 1 scanned on 31 December 2026 is 1 January 2027, day 365 scanned on 1 January 2027 is 31 December 2026, day 60 in a leap year is 29 February; every day of 2026 to 2029 gives back its date. |

Verification beyond the criteria:
- The example of the IATA implementation guide reads with every mandatory item.
- A scan issues a ticket and a rescan finds the same ticket and reference. Ten simultaneous
  scans of one pass give one ticket (the lookup runs under the checkpoint's lock, and a partial
  unique index backs it).
- A pass of another airport or day is refused with its reason. An unreadable pass, or one for an
  unknown flight, creates no ticket.
- A connecting passenger gets a transfer ticket for the leg from here; a passenger already
  admitted is sent to staff.

## S14: acceptance criteria and evidence

Scope delivered (part of M3, approved with "vai M3"):
- **`apps/web`**: one React application, built by esbuild and served by the API (ADR-044).
  - The kiosk, `/kiosk/<checkpoint>`: scanner, typing or pasting; the number with a QR code and
    a print layout, or the reason; sample passes on demo airports; the privacy notice (a draft).
  - The passenger's page, `/t/<reference>`.
- **`@gateflow/i18n`** (pure): Italian, English and Mexican Spanish.
- **API**: device tokens (`device add`, `device revoke`); scans only from a kiosk of the
  checkpoint; `devices/me` and the demo flights; the web application under a strict Content
  Security Policy.
- API 0.14.0, contracts 0.3.0, i18n 0.1.0, web 0.14.0. No simulated number changes.

| # | Criterion (kickoff, as proposed) | Evidence |
|---|---|---|
| 1 | A rescan returns the same ticket | In Chromium, on the product (the API's bundle on PostgreSQL): a pass typed as a scanner types gives a number; the same pass again, from the ticket's screen, says "You already have a number" with the same number and the same QR code. |
| 2 | Another airport's boarding pass is refused with a reason | In Chromium: a pass from MXP gives the reason in the language the passenger chose (Italian in the test). An unreadable code, a pass for another day and an unknown flight give theirs (Spanish in the test). |
| 3 | No personal data on screen | After scans, neither the page nor the browser's storage holds the passenger's name, the booking reference or the pass. The passenger's page shows the number, the state and the checkpoint only. |

Verification beyond the criteria:
- A kiosk without the token of a kiosk of its checkpoint (none, wrong, a display's, another
  checkpoint's) says it is not set up. The token leaves the address at once; the API refuses
  scans without it (401), from another device (403) or after revocation.
- The QR code is exactly the address of the ticket's page (drawn again by the test from the same
  text).
- Printing shows the number, the QR code, the place and the time, nothing else; one page on an
  80 mm roll.
- The kiosk fits 1080x1920, 1920x1080, 1280x800 and 768x1024 without scrolling. A number of seven
  characters fits on the kiosk and on a 320 px phone.
- The passenger's page in each language, light and dark, on a 360 px phone, has no overflow.
  Called by staff, it says "go now" by itself within 15 seconds. Admitted, it says so, and the
  same pass at the kiosk sends the passenger to staff.
- No page loads anything from another server or logs an error. Pages have the Content Security
  Policy, `nosniff`, `no-referrer` and `noindex`.
- The request log holds no ticket reference, including the passenger's page's; the bundle serves
  the screens with no option, with Brotli copies (72 KB of code instead of 263).
- Screens checked by eye from the test's screenshots (kiosk portrait and landscape, refusal,
  privacy notice, phone light and dark, called).

Not verified: a physical barcode scanner and printer (lab hardware is M5). Scanners that type
like keyboards are what the kiosk reads; the test types a pass the same way.

## S15: acceptance criteria and evidence

Scope delivered (part of M3, approved with "vai M3"), in three commits (ADR-045):
- **The life cycle on a clock.**
  - queue-core 0.7.0: staff actions guarded by the ticket's state, and the states `REVIEW` and
    `CANCELLED`.
  - operations 0.3.0: `ADVANCE` and the staff commands.
  - API: the scheduler of timeouts; rescans that bring a no-show back; the closed-boarding rule;
    admission by boarding pass.
- **Staff sign in.** Local members with roles and checkpoints, sessions in HttpOnly cookies, every
  staff route checked, the member recorded in the log.
- **The lane station** (`/lane/<checkpoint>`):
  - call next, and validate by QR code, boarding pass or number;
  - call again, absence, back in the queue, review;
  - manual tickets with a reason and the party's size;
  - in Italian, English and Spanish.
- API 0.15.0, contracts 0.4.0, web 0.15.0. No simulated number changes (golden files: the queue's
  version only).

| # | Criterion (kickoff, as proposed) | Evidence |
|---|---|---|
| 1 | The state machine is covered by tests | Every state against every staff action (9 by 7): the transition of the table, or a refusal that changes nothing and reports nothing. 1,000 random sequences mixing issues, calls, presentations, timeouts and staff actions keep every invariant (zero churn but by staff, counters, a single admission, final states, the cap and the overtake bound). Every staff action is reached in many runs (call again in 70, cancel in 205). |
| 2 | Every transition is idempotent | The same `Idempotency-Key` applies a staff action once and answers the same; the key reused for another ticket is refused (409). A timeout due is applied once when two servers see it due. A refused transition changes nothing. |

Verification beyond the criteria:
- With nobody acting, the scheduler turns a call into a second call, a no-show and an expiry on
  time; the passenger's page follows.
- A staff's second call moves the no-show T2 later.
- A ticket held for review keeps its place and cannot be admitted meanwhile.
- A rescan within the window brings a no-show back with the same number. Past the window, the
  expired ticket gives way to a new one.
- Review, cancellation and a closed boarding send the passenger to staff. With
  `afterBoardingClose: ISSUE`, a closed boarding gives a ticket.
- Admission by boarding pass, with no pass, name or booking reference in any table.
- The log of a day with timeouts and staff actions rebuilds the same day, next due time
  included; the audit chain is intact.
- Staff:
  - every staff route refuses without a session;
  - an operator cannot cancel or end a review;
  - another airport and another checkpoint are refused, and so is a request from another site;
  - the cookie is HttpOnly and SameSite=Strict, Secure over TLS;
  - no password or token is stored or logged;
  - failures are slowed;
  - the session ends on sign-out, after a shift, on a new password and when the member is
    disabled.
- In Chromium, on the product (17 tests with the kiosk's):
  - sign-in and sign-out;
  - call, absence, back in the queue;
  - admission by number, QR code and boarding pass;
  - a review asked by an operator and ended by a supervisor;
  - a family's manual ticket on a phone, in Spanish too;
  - no request to another server.
- The CI's check of the bundle signs a supervisor in with the command line and the API.

Not done (ADR-045):
- One number for a party at the kiosk: families get one at the lane. Done in 0.15.1, below.
- OIDC/MFA: they come with the pilot.

### After S15 (0.15.1): people travelling together take one number at the kiosk

The founder's decisions on S15 (2026-11-22): a pass whose boarding has closed goes to staff by
default, as built; families are grouped, by the passengers themselves at the kiosk; local
passwords until the pilot. ADR-046.

- **Scope.** After a number, "Add travel companions": each companion scans their own
  boarding pass onto it. Same flight, no number of their own, a number still waiting, 20 people
  at most. A companion's rescan finds the family's number, and the access point admits the
  family by any of its passes. queue-core 0.8.0 (`grow`), operations 0.4.0 (`ADD_TO_PARTY`),
  contracts 0.5.0, API and web 0.15.1, migration `0007_party`.
- **Evidence:**
  - queue-core: `grow` in the table of every state against every action; 1,000 random sequences
    with growing parties keep every invariant.
  - operations: random days with `ADD_TO_PARTY` rebuild from their log.
  - API on PostgreSQL (4 tests): passes join once each, also when a request is sent twice; the
    companion's rescan and admission; every refusal; nothing of the passes kept; the log rebuilds
    every party; the audit chain is intact.
  - In Chromium (the kiosk's 13 tests): the whole flow with a scanner, in English, Italian and
    Spanish; the ticket screen and the passenger's page say for how many people; the ticket and
    the party's screen fit the four kiosk sizes (1080x1920, 1920x1080, 1280x800, 768x1024), in
    Italian and in Spanish, the languages with the longest texts. On a landscape kiosk the
    party's screen has two columns, as the ticket has.
  - No simulated number changes: the golden files change only in the version of the queue.

## Later milestones (summary)

- **M2 Simulator Studio:** S9 and S11 done; S10 moved into M3 (S12 and S19).
- **M4 Operations and Predict preview:** console KPIs, forecasts (Monte Carlo on the simulation
  from the live state), lane-opening recommendations with logged decisions.
- **M5 Pilot readiness (gated):** OIDC/MFA, four-eyes policies, real feed adapters, lab
  hardware, degraded modes, hardening, privacy pack, deployment, shadow mode.
