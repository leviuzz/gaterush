# Architecture and product decisions

Lightweight ADR log. Each record states the context, the decision and its consequences.
Decisions are changed by adding a new record that supersedes the old one, never by rewriting it.

Status values: **Accepted** (in force), **Accepted, not yet implemented** (direction agreed,
code to come), **Superseded**.

The kickoff analysis that motivates most decisions is in
[docs/kickoff/KICKOFF_PROPOSAL.md](docs/kickoff/KICKOFF_PROPOSAL.md) (Italian), approved by the
founder on 2026-11-21 together with all of its recommendations.

---

## ADR-001: Product name and namespaces

- **Status:** Accepted (2026-11-21)
- **Context:** The repository is called `gaterush`, the kickoff brief says GateFlow and the business
  plan says "Airport Smart Queue", with two different module nomenclatures.
- **Decision:** The product is **GateFlow**. Modules are GateFlow Priority, Predict, Connect and
  Simulator. Packages use the `@gateflow/*` scope. The repository name stays unchanged.
- **Consequences:** Code, documents and reports use GateFlow consistently. The kickoff proposal maps
  the old names (Queue Core, Flow Forecast, Passenger Info) to the new ones.

## ADR-002: Primary KPI

- **Status:** Accepted (2026-11-21)
- **Context:** The brief targets missed connections, but the most likely first deployment
  (a landside departure checkpoint) serves few connecting passengers, and in the EU many transfer
  passengers are not re-screened.
- **Decision:** The primary KPI is **flights missed because of the wait at the checkpoint**, with
  connecting passengers reported as a segment. Fairness indicators (extra wait and overtakes
  suffered by passengers who are not prioritised) are co-primary: a policy that saves flights by
  imposing disproportionate delays on others is not acceptable.
- **Consequences:** The model is parametric on the checkpoint type. Reports always show saved,
  lost and net flights together with the cost for non-prioritised passengers.

## ADR-003: Reference scenarios

- **Status:** Accepted (2026-11-21)
- **Decision:** Start with a **synthetic landside departure checkpoint** of a medium-sized
  European airport (`single-checkpoint-demo`, congested morning peak). A moderate variant
  (`single-checkpoint-moderate`) ships alongside it so that results are never shown as a single
  number. A Mexico-like hub with transfer re-screening follows in slice S6.
- **Consequences:** All parameters are labelled `SYNTHETIC` and every report says so. Neither
  scenario describes a real airport.

## ADR-004: Semantics of priority policy v0

- **Status:** Accepted (2026-11-21); `slackNow` amended by ADR-019
- **Decision:**
  - The engine compares each ticket with what would happen under plain FIFO (the *FIFO
    counterfactual*), which removes the circularity of the slack definition in the business plan.
  - `L = deadline - (response + process + walk + buffer)` is the latest useful call time.
    `slackFifo = L - now - FIFO wait` and `slackNow = L - now`.
  - Risk classes:
    - `URGENT`: `slackFifo < 0` and `slackNow >= 0` (at risk under FIFO, still feasible if called now).
    - `CRITICAL`: `slackNow < 0`; escalated to staff and never boosted automatically.
    - `UNVERIFIED`: deadline unknown or not trusted; served in FIFO order.
    - `ATTENTION` and `NORMAL` by threshold.
  - Selection, in order of precedence:
    1. Overtake guard: a ticket overtaken K times is called first.
    2. Earliest-L among boost-eligible `URGENT` tickets, if the cap allows (at most k priority
       calls in any window of N calls).
    3. FIFO.
  - Initial values `N/k = 10/3`, `K = 15`, attention threshold 15 min and buffer 5 min are
    hypotheses to be calibrated and approved by the airport.
  - Rule-based deadlines may drive boosts only when the policy allows it
    (`allowRuleBasedDeadline`).
- **Consequences:**
  - The extra delay of any non-prioritised passenger is bounded by about `K / throughput`.
  - Missing data degrades to FIFO, never to a blocked queue.
  - The "prepare" window, hysteresis and the anti-abuse eligibility rule are specified but arrive
    in slices S2 to S4.

## ADR-005: Documentation language

- **Status:** Accepted (2026-11-21)
- **Decision:** Code, identifiers, repository documents and reports are in **English** (sale to
  Italian and Mexican airports and international stakeholders). Conversations with the founder may
  stay in Italian. The kickoff proposal remains in Italian as a historical document.

## ADR-006: Tooling and runtime

- **Status:** Accepted (2026-11-21)
- **Decision:**
  - pnpm 10 workspaces and Turborepo 2.
  - TypeScript 6.0 in `strict` mode with `noUncheckedIndexedAccess`.
  - Vitest 5 and fast-check 4.
  - ESLint 10 (typescript-eslint `strictTypeChecked`) and Prettier.
  - dependency-cruiser.
  - Node.js 22 LTS (`.nvmrc`). CI runs on both Node 22 and Node 24.
- **Context:** TypeScript 7 (native port) is available but typescript-eslint supports
  TypeScript `< 6.1`, so 6.0 is the newest version the lint pipeline accepts.
- **Consequences:** Upgrading to TypeScript 7 is a separate decision, to take when the lint tooling
  supports it.

## ADR-007: Internal packages as TypeScript sources; bundled apps

- **Status:** Accepted (2026-11-21)
- **Decision:**
  - Workspace packages export their TypeScript sources (`"exports": "./src/index.ts"`) and are not
    compiled on their own ("just-in-time" internal packages).
  - Applications are bundled. The CLI uses esbuild and runs on plain Node.js; future Next.js apps
    will use `transpilePackages`.
  - Each pure package has two TypeScript configurations: `tsconfig.src.json` (sources only, no
    Node or DOM types) proves that production code is environment-free; `tsconfig.json` adds the
    tests.
- **Consequences:**
  - There is no build step during development and no stale `dist` between packages.
  - Turborepo uses a `transit` task so that caches are invalidated when a dependency's sources
    change.
  - CommonJS dependencies bundled into the ESM CLI need a `createRequire` banner (the Node build of
    `yaml` calls `require('process')`).

## ADR-008: Determinism by construction

- **Status:** Accepted (2026-11-21)
- **Context:** Results must be reproducible bit for bit on the CLI, in CI and, later, in the
  browser. ECMA-262 leaves `Math.log`, `Math.exp`, `Math.pow` and friends
  "implementation-approximated".
- **Decision:**
  - All times are integer milliseconds.
  - Randomness comes only from xoshiro128** streams derived from `(seed, key)` with MurmurHash3;
    one stream per (entity, attribute).
  - `ln` and `exp` are ports of fdlibm. They are bit-identical to V8's `Math.log`/`Math.exp` on
    3 million tested inputs, and `exp(1) === Math.E`.
  - Every sort has an explicit total order.
  - Scenarios are identified by the SHA-256 of their canonical JSON.
  - ESLint forbids, in `packages/*/src`: `Math.random`, `Date`, `**`, the approximated `Math`
    functions, `localeCompare` and `Intl`.
  - `Math.sqrt` is used on the assumption that it is correctly rounded. ECMA-262 does not
    guarantee it, but IEEE 754 hardware does.
- **Consequences:** The golden test compares full results byte for byte on Node 22 and 24. Any
  change to generated numbers needs a version bump of the affected component and a CHANGELOG entry.

## ADR-009: Scenario format and provenance

- **Status:** Accepted (2026-11-21)
- **Decision:**
  - Scenarios are YAML (or JSON) validated by a strict Zod schema (`schemaVersion: 1`).
  - Every model parameter is written as `{ value, source, note? }`, with `source` one of
    `SYNTHETIC`, `LITERATURE`, `AIRPORT_PROVIDED` or `MEASURED`.
  - Reports list every parameter with its source. A test fails if a number escapes this labelling.
- **Consequences:** No unlabelled assumption can reach a report. The flight schedule (design day)
  depends only on the scenario; replication seeds only change passengers.

## ADR-010: Policies as versioned parameters, not a DSL

- **Status:** Accepted (2026-11-21); policy structure amended by ADR-016
- **Decision:** A policy is `{ id, version, title, params }`, where `params` selects an implemented
  and tested strategy (`fifo` or `constrained-edf`). The business plan's "policy DSL" is not built.
- **Consequences:** Policies are easy to review, approve, compare and simulate. A rule language
  may be considered later for eligibility only, if a customer needs it.

## ADR-011: Paired experimental design and statistics

- **Status:** Accepted (2026-11-21); generalised to explicit comparison pairs by ADR-015
- **Decision:**
  - Each seed is one simulated day, and all policies see the same passengers (common random
    numbers).
  - *Saved* = missed with the baseline and caught with the candidate; *lost* = the opposite;
    *net* = saved - lost.
  - Means over days are reported with percentile-bootstrap confidence intervals (2000 resamples,
    fixed seed), and P5-P95 describes day-to-day spread.
  - Quantiles use linear interpolation (type 7).
- **Consequences:** Benefits are measured on the same passengers rather than inferred from
  different random draws. This avoids the bias, flagged by the business plan, of assuming that
  every urgent passenger would otherwise miss the flight.

## ADR-012: Validation of the checkpoint model against Erlang C

- **Status:** Accepted (2026-11-21). It refines acceptance criterion 4 of slice S1.
- **Context:** The approved criterion was "relative error < 3% and the 95% CI contains the Erlang C
  value". The first implementation reused the same random streams for all three configurations,
  and an unlucky draw (inputs 0.1% "lighter" than nominal) put all three estimates 1.7% to 4.6%
  below theory. Moreover, three separate 95% intervals would reject a correct model about 14% of
  the time.
- **Evidence of no bias:** an independent run of 40 x 200,000 customers (M/M/1, rho = 0.8,
  unused seeds) gave +0.49% (t = 1.34).
- **Decision:**
  - Independent streams per configuration.
  - 20 replications with a 10,000-customer warm-up.
  - Control variates on the realised mean service and inter-arrival times (Lavenberg and Welch).
  - Pass if the relative error is below 3% and the analytic value lies in the **simultaneous 95%**
    interval (Bonferroni over the three configurations, `t(1 - 0.05/6, 17) = 2.655`).
- **Result:**
  | Configuration | Error | Simultaneous half-width |
  |---|---:|---:|
  | c = 1, rho = 0.8 | -0.91% | ±1.21% |
  | c = 4, rho = 0.85 | -0.60% | ±2.18% |
  | c = 6, rho = 0.9 | -0.27% | ±2.48% |

## ADR-013: Architecture direction for the operational product

- **Status:** Accepted, not yet implemented (target: milestones M2 to M5).
- **Decision:** As recommended in the kickoff proposal:
  - a modular monolith;
  - Fastify + Zod/OpenAPI API;
  - PostgreSQL with Drizzle ORM;
  - an event log and outbox in PostgreSQL with LISTEN/NOTIFY (no Redis broker);
  - SSE for real-time updates;
  - a single Next.js application for every user interface;
  - Docker Compose deployment ("cloud-first, edge-capable"); no Kubernetes.
- **Consequences:** Recorded here so that the choices carry over to the M3 slices.

## ADR-014: Source revision in results

- **Status:** Accepted (2026-11-21)
- **Decision:** The CLI records the source revision from `GATEFLOW_COMMIT`, then `GITHUB_SHA`, then
  `git rev-parse HEAD`. It appends `-dirty` whenever the working tree differs from that commit,
  **including new untracked files**.
- **Consequences:** A report can never claim a revision that did not produce it. Reports committed
  to the repository are generated from a clean checkout of the referenced commit.

## ADR-015: Physical FIFO is the status quo; GateFlow policies run a virtual queue

- **Status:** Accepted (2026-11-21)
- **Context:** In S1 every policy, the FIFO baseline included, was a virtual queue whose calls
  were answered instantly. The baseline was therefore an idealised GateFlow queue, not today's
  operation, and the cost of the call mechanics (response times, missed calls) was invisible.
- **Decision:**
  - A policy has two parts: `selection` (who is called next: `fifo` or `constrained-edf`) and
    `queue` (how the queue is operated: `physical`, or `virtual` with its parameters).
  - The status quo, policy A (`fifo` 1.1.0), is a physical FIFO queue: passengers stand in line
    and step forward as soon as a lane is free.
  - GateFlow policies run a virtual queue (`virtual-fifo` 0.1.0, `priority-v0` 0.2.0).
  - Comparisons are explicit `candidate`/`reference` pairs, each analysed as in ADR-011. By
    default every policy is compared with the status quo, and each priority policy with the FIFO
    policy that operates the same virtual queue (`priority-v0` vs `virtual-fifo`).
- **Consequences:**
  - The headline separates the effect of the call mechanics (`virtual-fifo` vs `fifo`) from the
    effect of the prioritisation (`priority-v0` vs `virtual-fifo`).
  - A physical queue with priority selection (idealised manual expediting) is expressible and is
    a candidate for baseline A' in S3.

## ADR-016: The queue state machine lives in `@gateflow/queue-core`

- **Status:** Accepted (2026-11-21). Amends ADR-010: a policy is now
  `{ id, version, title, selection, queue }`.
- **Decision:**
  - A new pure package owns tickets, the prepare window, calls, second calls, no-shows,
    reactivations and expiries (`CheckpointQueue`). It performs no I/O and reads no clock: times
    are arguments and may never decrease. Every transition is reported to a listener in
    chronological order.
  - The priority engine remains a pure selection function, asked for each commitment.
  - The policy presets moved from the engine to `queue-core`.
- **Consequences:**
  - The simulator and the future operational API (M3) share one implementation of the queue
    rules, which makes the M3 criterion "the live system calls passengers in the same order as the
    offline simulator" achievable by construction.
  - The invariants (no churn in the prepare window, a single admission, terminal states, cap and
    K over commitments, chronological events) are property-tested on the class itself.

## ADR-017: Defaults of the GateFlow virtual queue

- **Status:** Accepted (2026-11-21). The values are hypotheses to be measured and calibrated in a
  pilot.
- **Decision:**
  - Call-ahead 180 s: tickets are called while the passengers called but not yet screened are
    fewer than the free lanes plus `ceil(call-ahead x open lanes x lane rate)`.
  - Response estimate 90 s. The engine's R (call to start of screening) is
    `max(response estimate, call-ahead)`.
  - Prepare window M = 10 tickets (about one minute of notice at nine calls per minute).
  - Second call after T1 = 3 min, no-show after T2 = 2 more minutes, reactivation within
    15 min, at most r = 1 reactivation, at the original place.
- **Rationale** (scenario `single-checkpoint-demo`, 5 to 8 seeds, response model of ADR-018):
  - With 120 s of call-ahead the lanes run dry during the peak: virtual FIFO missed about 7 more
    flights per day than the physical queue.
  - With 180 s virtual FIFO matches the physical queue (missed flights and mean time to
    screening equal within noise), with 0.6 min of mean standing time instead of 3.5.
  - Beyond 180 s nothing improves, and every extra minute of call-ahead adds about 0.25 min of
    mean standing time.
  - Under `priority-v0`, M = 10 costs about 2 missed flights per day relative to M = 0, because
    commitments are made about a minute earlier. The benefit of the window (passengers moving
    closer when they see "prepare") is not modelled yet, so M stays at the smallest value that
    gives useful notice.
- **Consequences:** The call-ahead must be re-dimensioned with measured response times. The S5
  sensitivity sweeps cover call-ahead and M.

## ADR-018: Passenger call behaviour and scenario schema 2

- **Status:** Accepted (2026-11-21)
- **Decision:**
  - Scenario schema 2 replaces `checkpoint.lanes` with `checkpoint.laneSchedule` (`HH:MM` clock
    times from `00:00`, strictly increasing, 1 to 64 lanes) and adds `passengers.callResponse`
    (log-normal response time; probability and log-normal extra delay of missing the first call).
    Version 1 files are rejected with a migration message.
  - Population generator 0.2.0 draws the new attributes on new streams (`pax.response`,
    `pax.absent`, `pax.absentExtra`). Existing attributes are unchanged, so S1 populations are
    reproduced exactly.
  - Response rule: after taking the ticket the passenger walks away for at most their response
    time and walks back when called. A call that comes sooner is answered sooner, and a passenger
    who has not left cannot miss it. After the first presentation the passenger stays at the
    access point and answers later calls at once.
  - Lanes close from the highest number down and finish the passenger they are screening; a lane
    closing at time t takes nobody at t.
- **Consequences:**
  - Without the response rule every passenger called on arrival (most of the off-peak day) would
    pay the full response time. On the demo scenario (5 seeds) virtual FIFO then missed about 13
    more flights per day than the physical queue with 180 s of call-ahead (27 more with 120 s);
    with the rule it misses about as many as the physical queue.
  - The rule, the response distribution and the absence probability are assumptions to validate
    in a pilot.

## ADR-019: CRITICAL accounts for the committed prepare window (engine 0.2.0)

- **Status:** Accepted (2026-11-21). Amends ADR-004.
- **Decision:** The engine receives `aheadOfWaiting`, the tickets committed ahead of the waiting
  list. The FIFO wait counts them, and `slackNow = L - now - C`, where C is the FIFO estimate of
  the time to call them. A ticket that cannot make it even if selected now is CRITICAL and is never
  boosted.
- **Consequences:** Without a window (as in S1) C = 0 and nothing changes. With a window, priority
  commitments are not spent on passengers whom the window has already made hopeless.

## ADR-020: Results schema 2, metric definitions and event order

- **Status:** Accepted (2026-11-21)
- **Decision:**
  - `gateflow.sim.results/2`:
    - comparisons are keyed `"<candidate> vs <reference>"` and carry `candidateId` and
      `referenceId`; the fields named `...Baseline` are now `...Reference`;
    - new per-policy metrics: standing time and standing queue, calls, second calls, no-shows
      (missed-call rate), reactivations, new tickets, staffed lane-hours, idle lane time;
    - the manifest lists the comparisons and the queue-core version.
  - Time to screening: from arrival to the start of screening (S1's time to call, generalised).
    Standing time: the whole wait in a physical queue; the wait at the lanes after validating the
    ticket in a virtual queue.
  - Lane utilisation: busy time over staffed lane time, i.e. open lanes plus closing lanes still
    screening, between the first arrival and the last end of service.
  - Idle lane time: the integral of `min(idle open lanes, tickets not yet called + called
    passengers on their way)`, i.e. lane capacity that waiting passengers could have used.
  - Events at the same instant are ordered: lane changes, ends of service, presentations at the
    access point, timeouts, arrivals.
- **Consequences:** With no response time, no absences, no call-ahead and no window, every S1
  metric is reproduced exactly on seeds 1-3 (a regression test against a fixture saved from S1).

## ADR-021: Groups counted per person; the assisted path stays outside the engine

- **Status:** Accepted (2026-11-21). Engine 0.3.0, queue core 0.2.0, model 0.3.0.
- **Context:** About 40% of passengers travel with others (FR-16). Splitting a family is not
  acceptable, and counting a family of five as one ticket in the fairness bounds would understate
  the cost to the passengers it overtakes.
- **Decision:**
  - A ticket holds a party (`partySize` >= 1). The party is called together, validated together
    and screened on one lane, one person after the other (its screening time is the sum of its
    members').
  - The engine and the queue count people:
    - the FIFO wait and the committed window drain count the people ahead;
    - a priority party of three takes three of the `k` places in the window of `N` calls;
    - a party of three that is called ahead of older tickets adds three to their overtake counts;
    - every metric counts people.
  - A party larger than `k` is never boosted automatically, since it would exceed the cap on its
    own. Its assessment carries `GROUP_EXCEEDS_CAP` for staff.
  - The overtake guard keeps K with groups and reactivated tickets. If calling the ticket at the
    limit would push an older ticket past K, the head of the queue is called instead. Likewise an
    urgent ticket is not boosted when that would push someone past K (`OVERTAKE_ROOM_EXHAUSTED`).
    The queue-core property tests found the original violation.
  - Assisted parties (PRM and similar, `path: ASSISTED`):
    - staff take them to the next free lane, ahead of the queue, under every policy;
    - they hold no ticket in the simulation and the engine never assesses them;
    - they count in the call pipeline;
    - the reason for assistance is never recorded (it can be health data).
- **Consequences:**
  - Unit and property tests check the cap and K in people, with groups and reactivations.
  - With every party of one person and nobody assisted, S2 is reproduced exactly (regression test
    against a fixture saved from the S2 commit, seeds 1-3).

## ADR-022: Baseline A': staff calling closing flights on the physical queue

- **Status:** Accepted (2026-11-21)
- **Context:** The S2 status quo was a physical FIFO queue without staff intervention, so the
  benefit of prioritisation was overstated (an explicit S2 limitation). At most checkpoints staff
  call the passengers of closing flights out of the line.
- **Decision:**
  - New selection `flight-call`. At each call, the last staff announcement is at
    `floor(t / I) x I`. Tickets whose trusted deadline is at most `W` after that announcement are
    taken first, earliest deadline first (FIFO among equals); otherwise FIFO. There is no cap, no
    overtake bound and no feasibility check. Reasons: `FLIGHT_CALL` or `FIFO`.
  - Preset `fifo-manual` 0.1.0 (policy A'): the physical queue with flight calls, `W` = 20 min,
    `I` = 5 min.
  - A' is idealised:
    - staff are always available and announce every five minutes;
    - every passenger of a called flight hears the call and comes forward at once;
    - staff know the same deadlines as GateFlow.
- **Consequences:**
  - The comparison with A' estimates the benefit of GateFlow over today's practice. It is
    conservative where real practice is less systematic, and optimistic where staff watch
    individual passengers. How today's practice really works must be observed (product
    requirements, open question 5).
  - S3 shows that A' removes 50-75% of the misses of the queue without intervention, and that
    priority v1 misses 2.3 to 5.2 more flights per day than A' (slice-3 reports).

## ADR-023: Feasibility margin separate from the safety buffer

- **Status:** Accepted (2026-11-21). Amends ADR-004 and ADR-019.
- **Context:** Engines 0.1 and 0.2 used the safety buffer `B` for two purposes:
  - to detect risk: URGENT means "misses under FIFO with margin B";
  - to give up: CRITICAL means "cannot keep margin B even if selected now".
  Open point 3 of S2 found late arrivals classified too pessimistically.
- **Decision:**
  - New parameter `feasibilityMarginMs` (F). CRITICAL means
    `D - (R + P + W + F) - t - C < 0`.
  - URGENT keeps `slackFifo < 0` with B. A boosted ticket that cannot keep the whole buffer is
    flagged `INSIDE_SAFETY_MARGIN`.
  - `priority-v0` keeps F = B = 5 min, so its behaviour is unchanged. `priority-v1` uses F = 0.
  - The engine's call-to-screening estimate R stays `max(response estimate, call-ahead)` = 180 s.
- **Evidence** (S2 scenarios, 40 seeds, net flights saved per day vs `virtual-fifo`):
  - Lowering R to 0 raised the net from 2.0 to 3.5 (moderate) and from 21.4 to 28.3 (demo). But
    180 s is what passengers who had waited 5 minutes or more actually needed (mean 174 s, median
    166 s, P90 240 s). Only fresh tickets were faster (mean 22 s). A lower R would be wrong for
    the passengers who matter in the peak.
  - The gain came through the CRITICAL threshold. With B = 5 min:
    - F = B: 2.0 (moderate), 21.4 (demo);
    - F = 0: 4.7 (moderate), 31.9 (demo; 0.3 flights lost per day, mean extra wait of
      non-prioritised passengers 0.13 min).
- **Consequences:** Priority commitments are no longer withheld from passengers who can still make
  it without the safety margin.

## ADR-024: Expired tickets go to the back of the queue

- **Status:** Accepted (2026-11-21). Settles open point 2 of the S2 reports.
- **Decision:** A passenger whose ticket expired (no-show, then no rescan within the reactivation
  window) takes a new ticket at the back of the queue, as before. Staff can still help them
  manually.
- **Evidence** (exploratory runs on the S2 scenarios):
  - about 1.5 new tickets per day, of which about 0.5 per day missed their flight;
  - returning expired tickets to their original place once changed the net flights saved by +0.25
    and -0.07 per day on the two scenarios tried, and shortened the longest waits by about
    7 minutes.
- **Rationale:** The benefit is not material, and the rule must not reward ignoring a call.
- **Consequences:** The longest waits of the virtual queue (108-118 minutes over 200 days) remain
  those of passengers who missed their call and came back late. They are reported as such.

## ADR-025: Calibration of priority v1; the late-presentation rule is optional

- **Status:** Accepted (2026-11-21). The bounds are value choices for the airport to confirm.
- **Decision:**
  - `priority-v1` 0.1.0 has:
    - at most 10 priority people among any 20 people called;
    - K = 30 people;
    - F = 0 and B = 5 min;
    - the 15-minute attention threshold;
    - no late-presentation rule.
  - `priority-v1-strict` 0.1.0 adds the late-presentation rule: departing passengers must present
    at least 45 minutes before the scheduled departure to be boosted automatically. Transfers are
    exempt. A blocked passenger gets the reason `LATE_PRESENTATION`, or `PRESENTATION_UNVERIFIED`
    when the presentation time or the departure is unknown.
- **Method:**
  - calibration seeds 1001-1020, disjoint from the report seeds 1-200, on the four S3 scenarios;
  - criterion: in every scenario, no non-prioritised passenger delayed by more than 10 minutes
    against `virtual-fifo` on any calibration day, and at most 0.1% delayed by more than 5
    minutes;
  - among the configurations that meet it, the one with the fewest missed flights.
- **Evidence** (missed flights per day, seeds 1001-1020; "6 per 20" means at most 6 priority people
  among any 20 people called; "rule" is the late-presentation rule):

  | Configuration | demo | moderate | staffed | strategic | Meets the criterion |
  |---|---:|---:|---:|---:|---|
  | A' (`fifo-manual`), for reference | 14.0 | 7.3 | 17.1 | 128.3 | - |
  | First proposal: K 15, 6 per 20, rule on | 27.5 | 10.4 | 33.7 | 179.1 | yes |
  | K 15, 6 per 20, rule off | 20.5 | 9.2 | 26.5 | 163.8 | yes |
  | K 30, 6 per 20, rule off | 17.6 | 9.2 | 21.6 | 160.6 | yes |
  | **K 30, 10 per 20, rule off (v1)** | **16.4** | **9.3** | **20.5** | **160.1** | **yes** |
  | K 30, 10 per 20, rule on (v1-strict) | 24.7 | 10.4 | 29.2 | 176.9 | yes |
  | K 60, 10 per 20, rule off | 14.3 | 9.3 | 17.1 | 157.5 | no: up to 0.63% delayed > 5 min |

  - Without any bound and without the rule: 13.6 (demo) and 9.2 (moderate). The bounds cost about
    3 flights per day in the congested demo and nothing in the moderate one.
  - The rule cost 1.1 to 16.8 flights per day. In the strategic scenario it did not protect the
    others on balance: passengers who did not arrive late on purpose missed 15.9 flights per day
    without the rule and 20.7 with it, because the rule also blocks genuinely late passengers. The
    simulated behaviour is fixed, so the model cannot show the deterrent effect the rule is meant
    to have.
- **Consequences:**
  - The slice-3 reports confirm the calibration on the report seeds:
    - at most 0.07% of non-prioritised passengers are delayed by more than 5 minutes;
    - being overtaken alone delays nobody by more than about 8 minutes;
    - larger delays (up to 31 minutes) are knock-on effects of missed calls.
  - The remaining gap to A' is not a matter of bounds (see the S4 proposal in the implementation
    plan).

## ADR-026: Scenario schema 3, results schema 3 and default comparisons

- **Status:** Accepted (2026-11-21)
- **Decision:**
  - Scenario schema 3 adds three parameters, each with its source label:
    - `passengers.groups`: shares of party sizes 1 to 10;
    - `passengers.assistedShare`;
    - `passengers.strategicLateArrival`: share of departing parties that arrive late on purpose,
      and their window before departure (for stress tests).
    Version 1 and 2 files are rejected with a migration message.
  - Population generator 0.3.0:
    - a party takes the attributes that its leader's slot had in S2, and its screening time is
      the sum of the screening times of its members' slots, so with parties of one person the S2
      population is reproduced exactly;
    - party size, assistance and strategic arrival have their own streams.
  - `gateflow.sim.results/3`:
    - metrics count people;
    - new per-policy metrics: parties, groups, people in groups, groups prioritised, assisted
      people (mean time to screening, misses), strategic late arrivals (prioritised, missed);
    - a report section "Groups, assisted passengers and late arrivals".
  - Default comparisons (CLI 0.3.0):
    - every policy against the baseline;
    - each reordering policy against the FIFO policy that operates the same queue;
    - each priority policy against today's practice with manual handling (A') and against the
      priority policies listed before it on the same queue.
  - CLI defaults:
    - policies `fifo,fifo-manual,virtual-fifo,priority-v1`;
    - risk classes on arrival from the first priority policy listed, else from `priority-v1`.
- **Consequences:** S3 numbers are not comparable with S2 numbers, because the simulated days
  differ. With the S3 features disabled, every S1 and S2 metric is reproduced exactly.

## ADR-027: Fast track for priority calls (priority v2)

- **Status:** Accepted (2026-11-21). Engine 0.4.0, queue core 0.3.0, model 0.4.0. Implements the
  approved S4 proposal, except for staff escalation (ADR-028).
- **Context:** In S3, idealised manual handling (A') caught 2.3 to 5.2 more flights per day than
  priority v1. The gap was last-minute passengers. In the virtual queue a boosted passenger still
  waits for:
  - the prepare window to be called;
  - their own walk back to the access point;
  - the call-ahead buffer at the lanes.
  Staff take such passengers straight to a lane.
- **Decision:**
  - New selection parameter `fastTrack` (constrained EDF). When it is on:
    - a priority commitment is called next: it goes ahead of the prepare window, behind earlier
      fast-track commitments only;
    - once the party has validated its ticket, it goes ahead of the parties waiting at the lanes
      (through a fast-track entry), never ahead of an earlier fast-tracked party;
    - the engine estimates a boosted journey with the fast-track response time (the response
      estimate, 90 s by default, without the call-ahead). The estimate shrinks to the time since
      the passenger was last at the access point when that is shorter, by the response rule of
      ADR-018. The time to call the window is not counted;
    - an URGENT ticket at the head of the waiting list is boosted too: being URGENT means it would
      be late through the window and the buffer.
  - Every person passed counts towards K: in the queue, in the window and at the lanes.
    - The engine refuses a boost that would push a committed person past K
      (`OVERTAKE_ROOM_EXHAUSTED`).
    - At the lanes, a fast-tracked party stops behind the first person who would exceed K.
  - Preset `priority-v2` 0.1.0 is `priority-v1` plus the fast track; `priority-v1` is unchanged.
  - Results schema 4 adds two metrics, people through the fast track and people passed at the
    lanes. The CLI defaults to `fifo,fifo-manual,virtual-fifo,priority-v2`.
- **Evidence** (missed flights per day, calibration seeds 1001-1020):

  | Configuration | demo | moderate | staffed | strategic |
  |---|---:|---:|---:|---:|
  | A' (`fifo-manual`) | 14.0 | 7.3 | 17.1 | 128.3 |
  | `priority-v1` | 16.4 | 9.3 | 20.5 | 160.1 |
  | Prototype, fast track at the lanes only | 14.9 | 8.5 | 19.2 | 156.6 |
  | Prototype, lanes + estimate | 12.8 | 7.8 | 16.6 | 150.7 |
  | Prototype, lanes + window | 11.6 | 7.3 | 14.2 | 148.9 |
  | Prototype, all three, passes not bounded by K | 9.5 | 6.3 | 12.3 | 139.0 |
  | **`priority-v2` (all passes within K)** | **10.4** | **5.3** | **14.3** | **139.1** |

  - The unbounded prototype delayed up to 0.59% of other passengers by more than 5 minutes
    (staffed), which fails the criterion of ADR-025. Bounding every pass by K brings it back.
  - Bounds with the fast track:

    | Bounds | demo | moderate | staffed | strategic | Criterion |
    |---|---:|---:|---:|---:|---|
    | K 25 | 11.4 | 5.3 | 15.9 | 140.6 | met |
    | **K 30, 10 per 20 (v2)** | **10.4** | **5.3** | **14.3** | **139.1** | **met** |
    | K 35 | 9.8 | 5.3 | 12.9 | 137.1 | not met (0.40% > 5 min, staffed) |
    | at most 6 per 20 | 10.8 | 5.3 | 14.0 | 139.5 | met |
    | at most 20 per 20 | 10.8 | 5.3 | 14.0 | 139.0 | met |

    v2 keeps the bounds of v1, so that the two differ only by the fast track.
  - The criterion of ADR-025 is stated precisely here. A delay caused by a missed call does not
    count towards the 10-minute maximum. In such a case the passenger was called a few seconds
    later than under virtual FIFO, had walked away and missed the call. These delays are
    reported, not hidden.
    - With v2 the largest delay caused by overtakes alone is 6.2 minutes, and at most 0.10% of
      non-prioritised passengers are delayed by more than 5 minutes.
    - The largest delays on the moderate (13.3 min) and strategic (10.6 min) calibration days
      are missed calls.
- **Consequences:**
  - The checkpoint needs a fast-track entry to the lanes, or staff who let fast-tracked parties
    through. People waiting at the lanes are passed: every report shows how many per day.
  - Apart from that entry, the fast track needs no staff action.
  - With the fast track off, every S3 metric is reproduced exactly (regression test against a
    fixture saved from the S3 commit, seeds 1-3).

## ADR-028: Staff escalation of CRITICAL passengers is not simulated

- **Status:** Accepted (2026-11-21). Amends the approved S4 proposal.
- **Context:** The proposal included staff escalation of CRITICAL passengers: listed for staff,
  who escort them to the next free lane, acting every five minutes as in A'.
- **Evidence** (calibration seeds 1001-1020, measured on a prototype of the fast track before the
  rule that boosts an URGENT head; missed flights per day, demo / moderate / staffed /
  strategic):
  - fast track alone: 11.1 / 6.3 / 15.0 / 142.4;
  - plus escalation every five minutes, within K: 10.8 / 6.4 / 14.7 / 141.5;
  - plus escalation every five minutes, beyond K: 10.8 / 6.4 / 14.8 / 142.7, with up to 59
    overtakes of one passenger;
  - plus escalation at the access point as soon as the ticket is taken, within K: 10.6 / 6.1 /
    14.5 / 139.2.
- **Decision:** No staff escalation in the simulated policies.
  - In the product, CRITICAL passengers stay flagged for staff (FR-07, documented manual
    exceptions).
  - In the simulator they wait in the queue order; this is a stated limitation of every report.
- **Rationale:**
  - With the fast track, a passenger the engine still rates CRITICAL could not make it even
    straight to a lane, so escorts save at most 0.45 flights per day on the main scenarios.
  - Escorts would make the result depend on staff present at the access point.
  - Priority v2 already beats A' without them, which is the simpler and stronger claim.

## ADR-029: Stale-data rule and hysteresis (priority v3)

- **Status:** Accepted (2026-11-21). Engine 0.5.0, queue core 0.4.0, model 0.5.0. Implements the
  approved S5 proposal ("stale or missing feeds, hysteresis, stability metrics"). The 30-minute
  maximum age is superseded by ADR-034 (60 minutes); the rule and the hysteresis are unchanged.
- **Context:**
  - A product principle of the kickoff: when data is missing or old, GateFlow does not invent. No
    automatic priority, service in arrival order, recovery when the data is fresh again (FR-15,
    flow F6, risk RT-04).
  - Classes flapped. With v2, the calibration days had 23 to 204 class reversals per day on the
    main scenarios (a reversal is a change back in the opposite direction). Most were NORMAL to
    ATTENTION and back, and ATTENTION to URGENT and back. The cause is the FIFO estimate: each
    call shortens the queue ahead by one party and raises the FIFO margin by a few seconds, while
    the time passing lowers it, so a ticket close to a threshold crosses it again and again.
- **Decision:**
  - **Stale data** (`maxDeadlineAgeMs`):
    - a known deadline carries `observedAtMs`, the time its source last confirmed it (absent:
      the source is live);
    - a deadline confirmed longer ago than the maximum age is stale: the ticket is `UNVERIFIED`
      (reason `DEADLINE_STALE`), is served in FIFO order and is never boosted;
    - the ticket recovers by itself when the feed confirms the deadline again.
  - **Hysteresis** (`hysteresisMs`, h):
    - a ticket escalates at once;
    - it returns to a less urgent class only when its margin passes the threshold by h:
      - CRITICAL: feasible by at least h;
      - URGENT: FIFO margin of at least h;
      - ATTENTION: FIFO margin of at least the attention threshold plus h;
    - the kickoff wrote "slack > threshold + h". The rule uses "at least", as the class boundaries
      do, so that h = 0 is exactly the classification without hysteresis;
    - a ticket held URGENT is URGENT, so it can be boosted;
    - the previous class is the one the queue recorded at its latest assessment of the ticket. The
      queue assesses every waiting ticket whenever a ticket is issued or called, and counts the
      changes and reversals (stability metrics).
  - Preset `priority-v3` 0.1.0: `priority-v2` with a maximum age of 30 minutes and h = 3 minutes.
    `priority-v1` and `priority-v2` keep both rules off, so they reproduce S4 exactly.
  - In the simulator, a feed outage marks every known deadline as confirmed at the start of the
    outage. Messages sent during the outage arrive when it ends, and the knowledge is then live
    again.
- **Evidence** (calibration seeds, disjoint from the report seeds 1-200):
  - Hysteresis, with v2 otherwise unchanged. Missed flights per day, with the class reversals per
    day in brackets:

    | h | demo, seeds 1001-1020 | disrupted, seeds 1001-1020 | demo, seeds 1001-1200 | staffed, seeds 1001-1200 |
    |---|---:|---:|---:|---:|
    | 0 (v2) | 10.40 (162) | 8.50 (138) | 12.05 (172) | 17.10 (204) |
    | 15 s | 10.40 (50) | 8.65 (41) | | |
    | 30 s | 10.20 (18) | 8.50 (16) | | |
    | 1 min | 10.10 (3) | 8.45 (3) | 12.09 (2.7) | 17.09 (3.9) |
    | 2 min | 10.10 (0) | 8.45 (0.3) | | |
    | **3 min (v3)** | **10.10 (0)** | **8.45 (0.1)** | **12.05 (0)** | **17.07 (0)** |

    On 20 days the moderate and strategic scenarios agree (reversals from 23 and 134 per day to 0,
    missed flights 5.25 to 5.25 and 139.05 to 137.95). Over 200 days the hysteresis neither costs
    nor saves flights: the small gains seen on 20 days were noise.
  - Maximum data age, with h = 3 min, seeds 1001-1200. Missed flights per day:

    | Maximum age | disrupted (feed down 34 min a day) | feed stress test (feed down 277 min a day) |
    |---|---:|---:|
    | none | 10.73 | 10.94 |
    | 15 min | 10.95 | 15.99 |
    | **30 min (v3)** | **10.78** | **14.76** |
    | 45 min | 10.74 | |
    | 60 min | 10.73 | 12.63 |
    | 90 min | 10.73 | |
    | A' (`fifo-manual`), for reference | 12.40 | 12.41 |

    - The average hides bad days. An outage during the morning peak stops the priority calls for
      as long as the data is stale. On report seed 1 of the disrupted scenario the feed is down
      from 06:31 to 07:38, and v3 misses 25 flights against 3 for v2. A first calibration on 20
      days had no such day and suggested no cost at all; 200 days show the real average.
    - In the stress test, people boosted on wrong information fall from 14.2 per day (no maximum
      age) to 9.4 (15 min), 10.2 (30 min) and 11.8 (60 min).
    - The report days (seeds 1-200) confirm the pattern with a higher average: with 30 minutes,
      v3 misses 0.3 flights per day more than v2 on the disrupted scenario [0.0, 0.6]. Of the 59
      flights lost over 200 days, 53 are lost on the days when the feed is down for more than an
      hour. In the stress test the cost is 3.1 per day [2.0, 4.3].
  - The criterion of ADR-025 holds for v3 on all scenarios: on the calibration days at most 0.08%
    of non-prioritised passengers are delayed by more than 5 minutes against `virtual-fifo`. The
    largest delays are those of v2 (13.3 min moderate, 10.6 min strategic, both missed calls).
- **Rationale:**
  - Hysteresis: 1 minute already removes almost all flapping, because the oscillations last a few
    seconds. 3 minutes (the kickoff value) also absorbs the jumps of the estimate when a lane opens,
    closes or fails, and costs nothing.
  - Maximum age:
    - The rule is a product principle: nobody is moved ahead of other passengers on data that
      nobody can vouch for.
    - The model can measure its price but not its benefit. In the model, stale data can only be
      wrong because a delay or a gate change has not arrived yet. A delay only moves boarding
      later, so a stale deadline errs on the safe side.
    - 30 minutes costs 0.05 flights per day with one feed outage a day of typical length, against
      0.22 for 15 minutes. 60 minutes costs nothing on average, but trusts data twice as old. The
      value is a hypothesis for the airport, which sets the freshness target of each source
      (FR-15).
- **Consequences:**
  - Classes shown to staff and passengers are stable: no reversal is left on the main scenarios.
    The few left on disrupted days come from lane outages, whose jumps can exceed h, and from the
    stale-data rule (UNVERIFIED during an outage, then back).
  - Stale periods are visible: tickets are `UNVERIFIED` with reason `DEADLINE_STALE`. The console
    must show a banner while the feed is down (flow F6).
  - A reliable feed is part of the value. In the stress test, the feed is down for about five
    hours a day. GateFlow then serves in FIFO order for long periods and misses more flights than
    A' (14.76 against 12.41 on the calibration days). Staff in A' keep acting on the last times
    they know.
  - A softer fallback is possible but is a product decision: during an outage, keep using the
    deadline from the published schedule and the last known delay. In this model such a deadline
    is never later than the truth, so its errors are mostly unneeded boosts, bounded by the cap
    and K; only an unannounced gate change errs the other way. But it is data that nobody has
    confirmed, which the kickoff rules out. It is not implemented.

## ADR-030: Disruptions as ground truth and knowledge (scenario schema 4, results schema 5)

- **Status:** Accepted (2026-11-21). Population generator 0.4.0, model 0.5.0, metrics 0.5.0,
  CLI 0.5.0.
- **Context:** The S5 proposal asked for:
  - delays with a notification time, gate changes, lane outages and stale or missing feeds;
  - the ground truth kept separate from what the system knows.
- **Decision:**
  - **Population.** The ground truth and the knowledge are separate fields:
    - ground truth: `boardingCloseMs`, `delayMs`, `gateChange`;
    - knowledge: `knownDeadline` at the start of the day, then the feed messages in `updates`,
      each at the time the feed sends it.
    - Lane outages are ground truth that the system sees at once. Feed outages delay the messages
      sent during them.
  - **Scenario schema 4.** A section `disruptions` with four labelled parameters:
    - `flightDelays`: share of flights, log-normal length, notice sent uniformly between two times
      before departure;
    - `gateChanges`: share of flights, time of the change before departure, notice delay. The new
      gate zone is drawn by the zones' shares among the other zones;
    - `laneOutages`: a Poisson number per day over the operating day (first arrival to last
      departure). Each takes one lane out for a log-normal time;
    - `feedOutages`: drawn the same way, overlapping outages merged.
    - `operations.deadlineKnowledge` accepts `NONE`: no deadline is known at all.
    - Files of versions 1 to 3 are rejected with a migration message that gives the values for "no
      disruptions".
  - **Population generator 0.4.0.** Every draw has a stream of its own. A seed therefore keeps its
    passengers, and with all shares and rates at zero the populations of generator 0.3.0 are
    reproduced. Passengers still arrive for the scheduled departure.
  - **Model 0.5.0.**
    - Order at the same instant: the feed recovers, the feed goes down, messages arrive; then
      lanes change. A message sent at the very start of an outage is held.
    - Open lanes are the planned lanes minus the lanes out of service, at least one. A lane going
      out of service finishes its passenger first.
    - After a gate change, a passenger who finishes screening from that instant walks to the new
      gate. Their walk scales with the nominal walking times of the two gates. Passengers already
      screened are not affected.
    - Tickets carry their flight, so a message updates every live ticket of that flight.
  - **Results schema 5 and metrics 0.5.0.**
    - Per policy:
      - class changes and reversals, and the people whose class flapped;
      - people boosted on wrong information: the system's knowledge of their flight differed from
        the truth when they were boosted;
      - misses among passengers of delayed or re-gated flights.
    - Per day: the disruptions, the same for every policy.
    - The report has a section "Disruptions, data quality and stability".
  - **Scenarios.**
    - The four S3 scenarios get the section with zeros, so their results are those of S4.
    - New: `single-checkpoint-disrupted`, the demo day with realistic disruptions.
    - New: `single-checkpoint-feed-stress`, the same day with the feed down about six times a day
      (stress test).
  - **Acceptance criterion of S5.** As approved: "with the flight feed absent, B produces exactly
    the outcomes of A". Since ADR-015, A is the physical queue, whose mechanics differ from a
    virtual queue's. The criterion is therefore proved in two forms:
    - B (`priority-v2` and `priority-v3`) gives exactly the outcomes of the same virtual queue
      served in FIFO order (`virtual-fifo`), passenger by passenger:
      - with no deadline knowledge at all, on the demo and disrupted scenarios;
      - with the feed down all day (`priority-v3`), on the same scenarios;
      - on random populations with random disruptions.
    - With calls answered at once, the setting of S1, B with the feed down all day gives exactly
      the outcomes of the physical FIFO queue A, on random populations.
- **Consequences:**
  - Reports show what each policy does with imperfect information, and how often it boosts
    somebody on wrong information.
  - A' also uses the feed's information. Its staff learn of a delay when the system does, and keep
    the last known times during an outage.
  - The main scenarios have no disruptions. Their S5 numbers differ from S4 only through the
    priority policy: `priority-v3` replaces `priority-v2` as the default.

## ADR-031: Simulated days run in parallel worker threads; results never depend on them

- **Status:** Accepted (2026-11-21). Metrics 0.6.0, CLI 0.6.0. Implements the approved S6
  proposal ("parallel batches with worker_threads").
- **Context:** The kickoff set a performance target of 1000 seeds × 3 policies in less than
  10 minutes on a laptop, and required regenerated reports to be identical.
- **Decision:**
  - An experiment is split into independent days (`planExperiment`, `runDay`, a pure function
    of the job and the seed) and assembled in seed order (`assembleExperiment`), whatever the
    order in which the days finish.
  - The CLI runs the days on `--workers` worker threads (default: every CPU). Each thread runs
    the CLI bundle itself, takes the next day as soon as it finishes one, and returns plain data.
    `--workers 1` runs in the main thread.
  - The packages stay pure: threads, files and the clock live in the CLI only.
  - Progress counts the days as they finish; the outputs carry no timing and no thread count.
- **Evidence:**
  - Tests compare `results.json`, `report.md`, `report.html` and `sweep.json` written with 1
    and with 3 worker threads (built bundle, end to end), and days assembled in shuffled order
    with a sequential run.
  - CI repeats the comparison with 1 and 4 threads on every push.
  - Speed: see the S6 evidence in the implementation plan.
- **Consequences:** A report can be regenerated on any machine with any number of threads and
  must match byte for byte. The bootstrap stays in the main thread, after all days.

## ADR-032: Sensitivity sweeps, one assumption at a time

- **Status:** Accepted (2026-11-21). Sweep schema `gateflow.sim.sweep/1`, CLI 0.6.0.
- **Context:** Every number of the simulator rests on synthetic assumptions (risk RT-03). The
  kickoff asked for sweeps on k/N, K, lanes, load factor, the show-up curves and M, and the S5
  open points asked how much the feed's reliability matters.
- **Decision:**
  - A sweep is a file in `sweeps/` (YAML): a base scenario, the policies, the candidate whose
    parameters vary, the comparisons, and curves. Each curve varies one parameter over values,
    optionally on a modified base (e.g. a less reliable feed for that curve only).
  - Parameters:
    - policy: K, k, N, hysteresis, maximum data age (or none), and for every virtual queue M,
      call-ahead and response estimate;
    - scenario: lanes, load factor, arrival shift, call response and missed calls, flight
      delays, lane outages and feed outages.
  - Every point uses the same seeds (common random numbers across points and policies). Points
    with the same scenario share their days, and a policy is simulated once per day however many
    points use it.
  - Outputs: `sweep.json`, `sweep.md` and `sweep.html`. Each point has the missed flights of
    every policy, the net flights saved by the candidate against each reference with a bootstrap
    interval, the cost to other passengers and the largest overtake count.
  - Two sweeps are published: `sensitivity-demo` (policy and demand assumptions on the demo day)
    and `data-quality-disrupted` (feed reliability, maximum data age, disruptions).
- **Consequences:**
  - Claims can be stated with the conditions under which they hold.
  - One-at-a-time curves do not show interactions, except where a curve is drawn on a modified
    base. Sweeps cost compute: about 5 minutes per published sweep on 4 threads.

## ADR-033: HTML reports, self-contained and deterministic

- **Status:** Accepted (2026-11-21). Metrics 0.6.0.
- **Context:** The kickoff asked for HTML reports with charts for people, next to the Markdown
  and the JSON.
- **Decision:**
  - `report.html` and `sweep.html` are rendered from the same documents as the Markdown, in pure
    code: the Markdown report converted to HTML, with charts added under the headline (run
    report) or under each curve (sweep).
  - Charts are inline SVG, with no script, font or other external resource, and coordinates
    rounded to 0.1 px. The same document always gives the same bytes, offline, so golden tests
    lock the HTML.
  - They follow the project's data-visualisation rules:
    - thin marks and a hairline grid;
    - one axis per chart;
    - a legend for two or more series and direct labels only where they do not collide;
    - colours by entity in a fixed order (GateFlow blue, A' orange, the third series aqua),
      validated for colour-blind separation in light and dark mode;
    - a text alternative on every mark;
    - every value also in the report tables.
  - Light and dark modes follow the reader's system setting. Charts scroll inside their card
    on a phone, and the page never scrolls sideways.
- **Consequences:** Reports can be read and shared without tools. The HTML adds about 30 KB per
  run report.

## ADR-034: Maximum data age raised to 60 minutes (priority v3 0.2.0)

- **Status:** Accepted (2026-11-21). Queue core 0.5.0. Supersedes the 30-minute value of
  ADR-029; the rule itself is unchanged.
- **Context:** In S5, 30 minutes was chosen on 20 calibration days and found to cost flights on
  200 days. The founder delegated the choice of the threshold (open point 1 of the S5 reports).
- **Evidence** (`data-quality-disrupted` sweep on report days 1-200, explored with the 30-minute
  base; S5 calibration on days 1001-1200 agrees):

  | Maximum age | v3 vs v2, disrupted day | v3 vs v2, feed down 4 times a day | v3 vs A', feed down 4 times a day | People boosted on wrong information (disrupted day) |
  |---|---:|---:|---:|---:|
  | 15 min | -0.56 | -1.32 | +0.23 | 11.0 |
  | 30 min (v3 0.1.0) | -0.29 | -0.65 | +0.91 | 11.2 |
  | 45 min | -0.05 | | | 11.4 |
  | **60 min (v3 0.2.0)** | **+0.02** | **+0.03** | **+1.57** | 11.5 |
  | none | +0.03 | +0.06 | +1.61 | 11.5 |

  Net flights saved per day. Negative means v3 misses more flights than v2.
- **Decision:** `priority-v3` 0.2.0 trusts a deadline for 60 minutes after the feed last
  confirmed it; beyond that, the ticket is served in FIFO order, as before.
- **Rationale:**
  - 30 minutes costs 0.3 flights per day, up to 0.7 with an unreliable feed. It buys 0.3 to
    0.5 fewer boosts a day on wrong information, which pass other passengers by a few seconds
    each.
  - 60 minutes recovers almost all those flights and still applies the principle: no automatic
    priority once the data is an hour old. Above 60 minutes nothing changes in the model.
  - The model only knows errors that make a deadline look earlier than it is (a delay not yet
    announced). An airport whose deadlines can also move earlier, or whose gates change often,
    should set a shorter age. The parameter stays an airport decision (FR-15).
- **Consequences:** The S5 reports remain the record of v3 0.1.0; the S6 reports use 0.2.0.
