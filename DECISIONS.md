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

- **Status:** Accepted, being implemented in M3 (S12 on). The user interfaces were revised by
  ADR-044: one React application served by the API, not Next.js.
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

## ADR-035: Public flight data (OPDI, OpenSky, EUROCONTROL portal) is not used: non-commercial terms

- **Status:** Accepted (2026-11-21). Settles decision 10 of the kickoff ("OPDI/OpenSky licences, to
  verify before the real-schedules slice"). Replaces the OPDI import planned for S7.
- **Context:**
  - S7 was to import OPDI flight lists for Venice (LIPZ) and Treviso (LIPH).
  - GateFlow is a commercial product, and its simulation reports are meant for sales to airports.
- **What the sources say** (read on 2026-11-21):
  - OPDI's About page (<https://www.opdi.aero/about>): "The focus of the OPDI is on open data, in
    particular open access and open use of data for non-commercial purposes."
  - OPDI's Data page (<https://www.opdi.aero/data>) names no licence. It says that the flight,
    event and measurement tables "are published under the Open Performance Data Initiative (OPDI)
    in collaboration with the OpenSky Network (OSN)". The files are served by
    `www.eurocontrol.int/performance/data/download/OPDI/v002/`.
  - EUROCONTROL's performance data portal hosts the alternative datasets, such as daily airport
    traffic. Its disclaimer (<https://ansperformance.eu/about/disclaimer/>) says the data "may be
    copied in whole or in part, provided that EUROCONTROL is mentioned as the source and it is not
    used for commercial purposes (i.e. for financial gain)". It may not be modified without
    EUROCONTROL's written permission.
  - The OpenSky Network's terms could not be read from the session (the connection was closed).
    Secondary copies say that use by a for-profit entity needs OpenSky's written permission. This
    is still to verify.
  - The MIT licence of the OPDI repository covers the pipeline code, not the published data.
- **Coverage, for the record:**
  - OPDI v0.0.2 covers January 2022 to September 2026.
  - Its trajectories cover a box around Europe (26.7°N to 70.3°N, 25.9°W to 49.7°E): no Mexico.
  - The v0.0.2 flight list has first-seen and last-seen times but no off-block or take-off time.
    Those are in the events table, or in a newer flight-list schema that is not yet published.
- **Decision:**
  - No OPDI, OpenSky or EUROCONTROL portal data is downloaded, committed, imported or used to
    calibrate scenarios, unless written permission for commercial use is obtained first.
  - The OPDI adapter is not built. Real schedules enter through the airport's own flight list, in
    the `gateflow.flights/1` format (ADR-036), under the data agreement of the pilot.
  - The scenario library stays synthetic (ADR-037). The VCE-like and TSF-like days take their size
    from SAVE's published annual traffic, an aggregate figure cited with attribution.
- **Consequences:**
  - The value case at the real checkpoints waits for the airport's data
    ([docs/data-request](docs/data-request/README.md)).
  - If a historical replay from OPDI is wanted, the founder must first ask EUROCONTROL's
    Performance Review Unit (<pru-support@eurocontrol.int>) and the OpenSky Network for written
    permission. The adapter would map `adep`, `typecode` and the take-off times of the events table
    to the flight list.
  - Mexico was never covered by OPDI: the MX-like scenario stays synthetic until an operator
    provides data.

## ADR-036: Scenario schema 5: data sources and flight lists (results schema 6)

- **Status:** Accepted (2026-11-21). Scenario schema 5, population generator 0.5.0, results schema
  `gateflow.sim.results/6`, sweep schema `gateflow.sim.sweep/2`, metrics and CLI 0.7.0.
- **Context:** The kickoff's criterion for this slice was "provenance and licence of the data
  visible in the report". Airports keep their schedules in AODB, FIDS or spreadsheet exports,
  not in hourly profiles.
- **Decision:**
  - Every scenario lists its `dataSources`, at least one:
    - an id, a title and a kind (the labels of ADR-009);
    - the provider and the licence or terms of use;
    - optionally a URL, the date of retrieval and a note.

    A parameter may name the source it comes from (`ref`); unknown references are rejected.
  - A new schedule kind, `flight-list`, takes the design day from a CSV file in the
    `gateflow.flights/1` format:
    - columns `flight`, `std` (required), `aircraft`, `seats`, `passengers`, `gate_zone` and
      `destination`, in any order;
    - comments, quoted fields and semicolon-separated files are accepted;
    - errors are reported with their line numbers.

    The CLI reads the file relative to the scenario and records its SHA-256. The scenario names
    the data source of the list.
  - The number of passengers of a flight:
    - is `passengers` when the list gives it;
    - otherwise it is drawn as seats x load factor;
    - the seats come from the row, or else from `schedule.seats` by aircraft type (an assumption,
      labelled as such).

    Missing gate zones are drawn from the zone shares with the generator seed, so they are the
    same on every simulated day.
  - `gateflow-sim flights` writes the design day of any scenario in that format. A flight list
    made from it, with the same zones, simulates exactly the same passengers. This is tested
    from the file to the results.
  - Every report and sweep has a section "Data sources and licences". The manifest carries the
    sources and how the design day was built (kind, flights, file, hash, source).
  - The sweeps gain `serviceTimeMeanSeconds`, the throughput of a lane.
- **Rationale:**
  - The format needs no personal data: one row per departure.
  - An airport can produce it from any system or spreadsheet.
  - The license of every input travels with every number.
- **Consequences:**
  - Version 4 scenarios are rejected with migration instructions. The six existing scenarios
    were migrated; their passengers and results are unchanged (golden files differ only in the
    manifest and the new section).
  - Flights with a fixed number of passengers do not vary with the load factor, so the
    `loadFactorScale` sweep does not change them.

## ADR-037: Scenario library on synthetic flight lists (VCE-like, TSF-like, MX-like)

- **Status:** Accepted (2026-11-21).
- **Context:**
  - The exit gate of M1 asks for three demand scenarios with a fairness analysis.
  - The kickoff asked for a VCE-like departures checkpoint and an MX-like transfer checkpoint
    (C-01, C-03).
  - Real schedules are not available (ADR-035).
- **Decision:** five scenarios. The flights come from synthetic lists written by
  `scenarios/flights/make-library-flights.mjs` (no third-party schedule data).

  | Scenario | Day | Departures | Passengers | Lanes at most | Screening time |
  |---|---|---:|---:|---:|---:|
  | `vce-like-normal-day` | normal | 116 | about 16,600 | 12 | 24 s |
  | `vce-like-peak-day` | summer peak | 138 | about 21,800 | 12 | 24 s |
  | `vce-like-disrupted-day` | peak with delays, gate changes, lane and feed outages | 138 | about 21,800 | 12 | 24 s |
  | `tsf-like-peak-day` | summer peak at a low-cost base | 34 | about 6,000 | 5 | 30 s |
  | `mx-like-transfer-hub` | transfer screening at a hub | 58 | 4,473 connecting | 4 | 30 s |

  - **Size.** The VCE-like normal day is the average day of Venice's 2025 traffic: 11.85 million
    passengers, half of them departing, over 365 days. Peak days are 1.35 times the average day
    (an assumed peak factor), and TSF-like follows Treviso's 3.2 million passengers the same way.
    The MX-like hub is not sized from any data.
  - **Lanes.** Every hour gets enough lanes to screen the expected arrivals of that hour at 90%
    utilisation, between a minimum and the lanes the checkpoint has. The expected arrivals are
    computed on 100 simulated days. The plan is written in the scenario, with the rule in its
    note. The same rule applies to every day, so a peak day differs from a normal day by its
    demand only: in the morning bank it exceeds the lanes the checkpoint has.
  - **Hub.** Only connecting passengers cross the MX-like checkpoint. The list gives their number
    per flight (25% to 70% of the seats). They arrive 25 minutes plus a log-normal (median
    35 minutes) before departure, after immigration, customs and the bag drop. A quarter of the
    departures are delayed, and gates change more often than at an origin airport.
- **Not calibrated to measured waits:**
  - The press reports 9 minutes 12 seconds at Venice's security for 2025, citing the airports'
    service charters. That figure could not be verified (the airport's website refused automated
    access), and its definition (90th percentile or mean) is unclear.
  - On the library days the 90th percentile of the FIFO wait is 0.8 minutes on the normal day and
    4.5 on the peak day.
  - The `vce-like-peak-capacity` sweep shows how much that matters. With 1 to 3 seconds more per
    person, or one lane fewer, the wait grows to 7 to 18 minutes, and GateFlow's margin over A'
    grows from nothing to 2 to 35 flights per day. Lane throughput and staffing are therefore the
    first numbers to ask the airport for.
- **Consequences:**
  - The library is the three demand scenarios of the M1 gate (normal, peak, disrupted) plus a
    low-cost base and a transfer hub.
  - Replacing a flight list and a lane plan with the airport's gives the real case without code
    changes.
  - Results are in [docs/reports/slice-7](docs/reports/slice-7/README.md).

## ADR-038: Airport configurations: one file per airport, scenarios give only their day

- **Status:** Accepted (2026-11-22). Asked by the founder ("una configurazione per ogni
  aeroporto dove settare parametri"). Scenarios 0.6.0, metrics and CLI 0.8.0. The scenario schema
  stays at version 5: every new field is optional.
- **Context:**
  - Each S7 library day repeated every parameter of its airport, so a change had to be made in
    several files.
  - The airport's data, requested on 2026-11-22, needs one place to go.
  - The S7 open points showed that the fairness bound K and the fairness target belong to each
    checkpoint.
- **Decision:**
  - `airports/<id>.yaml` (format `kind: airport`, schema version 1) holds:
    - the airport's identity, time zone and data sources;
    - `defaults` for every checkpoint and day;
    - its `checkpoints`, each with a `scenario` part.
  - A scenario with `extends: { airport, checkpoint }` is composed in this order: the
    defaults, then the checkpoint part, then the day. Objects merge key by key; a labelled
    parameter, a list or a value replaces the previous one as a whole. The data sources of the
    airport come before those of the day. The scenario records the airport, the checkpoint and
    the file's SHA-256, and every report prints them.
  - New optional scenario fields:
    - `checkpoint.lanesAvailable`: the lanes the checkpoint has. No plan may exceed them.
    - `checkpoint.lanePlanRule`: plans the lanes of a day that gives no schedule. In every
      interval it opens enough lanes for the expected arrivals at a utilisation, from a minimum
      up to the lanes available, averaged over simulated days 1 to N. `gateflow-sim lanes` prints
      the plan to fix it in the day file.
    - `gateflow`: GateFlow settings of the checkpoint.
      - K, k and N go to every priority policy.
      - Hysteresis and maximum data age go only to versions that have these rules (v3), so
        v0-v2 keep their definition.
      - Call-ahead, response estimate and prepare window go to every virtual queue.
    - `todayPractice`: when staff call closing flights in baseline A'.
    - `fairnessTarget`: the share of the other passengers that may wait more than 5 minutes
      longer than in FIFO order. Every report says whether it is met.
  - Reports list every policy parameter and the differences from the preset.
  - The library days now extend `airports/vce-like.yaml`, `tsf-like.yaml` and
    `mx-like-hub.yaml`.
- **Decisions on the open points of S7** (delegated by the founder):
  - **K and fairness, per checkpoint.** The defaults stay K = 30 and the 0.1% target of ADR-025,
    and the synthetic hub keeps them. Its reports therefore say "not met" (0.81% at K = 30), and
    the `mx-like-hub` sweep shows the alternatives (K = 15: 0.28%, +2.9 flights per day). GateFlow
    never relaxes a target silently: the airport approves its own K and target in its
    configuration.
  - **Transfer checkpoints first.** The value case leads with the transfer screening of hubs and
    with departures checkpoints that run close to capacity. The data request now asks whether a
    checkpoint re-screens connecting passengers.
  - **OPDI.** Not pursued. The airport's own flight lists give the schedule, the seats, the gates
    and the closing times, and OPDI gives none of them (ADR-035). Permission would be sought only
    for a historical replay.
- **Evidence:**
  - Population fingerprints of the five library days (days 1-2) match those taken before the
    change.
  - The rule reproduces each day's lane plan exactly.
  - Days 1-2 of the TSF-like and MX-like days give the per-day results of the S7 reports field
    by field.
  - Runs of all five days on days 1-3 matched the S7 reports.
- **Consequences:**
  - Airport data goes into `airports/private/` and `scenarios/private/`, which git ignores.
  - The reports of S7 remain valid: the library's results do not change.

## ADR-039: Extra lanes during the day: today's supervisor and GateFlow's recommendations, with an operator model

- **Status:** Accepted (2026-11-22). Slice S8. Queue core 0.6.0, model 0.6.0, population
  generator 0.6.0, results schema 7, sweep schema 3, metrics and CLI 0.8.0. The scenario schema
  stays at version 5: every new field is optional.
- **Context:**
  - Until S7 lanes only followed the plan. Just beyond the planned capacity the S7 plans
    collapsed, where a real airport would open lanes (S7 findings).
  - The product promises lane-opening recommendations with logged decisions (FR-19, GateFlow
    Predict).
  - People decide physical actions and the system proposes (principle 5 of the product
    requirements). The model therefore needs staff who take time to open a lane and a duty
    manager who may not follow a recommendation.
- **Decision:**
  - **Lane management is a mode of a policy** (`Policy.lanes`), available for every preset as
    `<policy>@reactive` and `<policy>@predict`. The calls (selection and queue) do not change, so
    `X@mode vs X` measures what the extra lanes alone buy.
  - **Physical lanes, roster and staff on call** (scenario, all optional):
    - `checkpoint.lanesAvailable`: the lanes the checkpoint has; no lane opens beyond them;
    - `checkpoint.lanePlanRule.maxLanes`: the most lanes the roster plans; the lanes between it
      and `lanesAvailable` open only as extra lanes;
    - `checkpoint.laneStaffing`: `maxExtraLanes` (extra lanes open at the same time),
      `openDelayMinutes` (median and sigma of a log-normal time from the decision to the first
      passenger screened), `minOpenMinutes` (an extra lane stays open at least this long) and
      `followShare` (the share of GateFlow's recommendations the duty manager follows).
    - The day's open delays and the duty manager's answers are drawn per decision (64 per day)
      on streams of their own. Every policy meets the same delays and answers in the same order,
      and the rest of the population is unchanged.
  - **Today's supervisor** (`@reactive`): every 5 minutes, looks at the wait the queue shows (the
    people waiting divided by the throughput of the open lanes). Opens one lane above 10 minutes
    and closes one below 2 minutes once its minimum time is over. Waits 10 minutes after a
    decision. Lanes already decided count against the staff on call. The supervisor's decisions
    are always carried out. The thresholds come from `todayPractice.laneOpenWaitMinutes` and
    `laneCloseWaitMinutes`.
  - **GateFlow's recommendations** (`@predict`):
    - Every 5 minutes it projects the queue minute by minute over the next 45 minutes, from the
      people waiting and a forecast of arrivals.
    - It recommends the fewest extra lanes that keep the projected wait below 10 minutes. The
      lanes count as ready after the estimated delay (the median).
    - It recommends closing a lane when the projection without it stays below 3 minutes.
    - The duty manager follows each recommendation with the scenario's probability. A
      recommendation not followed is made again after the 10-minute wait if still needed.
    - The target and the horizon come from `gateflow.laneTargetWaitMinutes` and
      `laneHorizonMinutes`.
  - **The forecast** is the average arrival profile per minute of 50 simulated days that are not
    in the reports (seeds from 1,000,001), as an airport forecasts from past days with the same
    flights. It knows neither the day's load factors nor its disruptions. It is scaled by the
    arrivals of the last hour, between 0.5 and 2 times.
  - When the plan itself needs a lane (the roster grows), the staff of an extra lane go back.
  - **Metrics.**
    - Per policy: extra lane-hours, decisions and those followed, lanes opened and closed, most
      lanes open.
    - Per comparison: the change in extra lane-hours and in waiting (person-hours).
    - Per extra lane-hour, as ratios of totals over days with a bootstrap interval: the waiting
      saved and the net flights made. They are given only when the candidate adds lane-hours and
      never removes any.
  - **Reports and sweeps.**
    - Reports have a "Lane management" section.
    - Sweeps vary `laneTargetWaitMinutes` (the candidate), `maxExtraLanes`,
      `laneOpenDelayMinutes` and `laneFollowShare` (the scenario), and show the extra lane-hours.
  - **Default comparisons.**
    - `X@mode` with `X`.
    - `X@predict` with `X@reactive`.
    - A priority policy with `@predict` with `fifo-manual@reactive`: GateFlow as a whole against
      today's practice as a whole.
    - The other default references manage lanes as the candidate does.
  - **Library airports** (synthetic):
    - VCE-like: 14 lanes, a roster of at most 12, 2 extra lanes;
    - TSF-like: 6 lanes, roster 5, 1 extra lane;
    - MX-like hub: 5 lanes, roster 4, 1 extra lane;
    - all three: about 10 minutes to open a lane (sigma 0.4), at least 30 minutes open, 4
      recommendations out of 5 followed.
- **Alternatives considered:**
  - **Lanes as a property of the day** (a day with a supervisor). Rejected: a comparison would
    then mix days instead of policies.
  - **A forecast from the day itself, or from days 1 to 50.** Rejected: the first leaks the
    future, the second puts the simulated days 1-50 into their own forecast.
  - **A Monte Carlo forecast from the live state** (the design of GateFlow Predict, M4). Heavier.
    The projection is enough for a decision every 5 minutes, and it explains itself ("the queue
    would reach 14 minutes by 07:40").
  - **Counting the last passenger of a closing lane as extra time.** Not done: it is counted in
    the staffed lane-hours, not in the extra lane-hours (at most one screening time per closing).
- **Evidence** (tests):
  - a hand-computed case of the supervisor;
  - GateFlow opens before the wave of arrivals, and an ignored recommendation leaves the plan;
  - waiting and pending lanes, minimum time, staff going back;
  - 200 random cases: never more lanes than the checkpoint and the staff allow, everybody
    screened, and without staff on call exactly the run of the plan;
  - the library days give the S7 results without lane management;
  - the golden files differ only by the added fields and the versions.
- **Consequences:**
  - The supervisor sees the exact wait the queue implies, and every 5 minutes. As baseline A',
    it is an idealised practice, so the margin of GateFlow over it is, in this respect, a lower
    bound.
  - Staff on call have no other duties, and an extra lane costs only its lane-hours, which the
    airport prices.
  - Results: [docs/reports/slice-8](docs/reports/slice-8/README.md).
- **Findings** (SIMULATED, synthetic data, 200 days):
  - at the MX-like hub, GateFlow as a whole catches 19.7 more flights per day than today's
    practice with a supervisor [17.8, 21.6], for 1.25 more lane-hours per day;
  - at the TSF-like base, v3 with GateFlow's lanes misses 0.1 flights per day instead of 2.3;
  - on the VCE-like days, where the roster follows demand, extra lanes are rarely needed;
  - on a day harder than planned they are the safety valve, and GateFlow adds 0.8 to 3.5
    flights per day over the supervisor;
  - the target wait is the main setting, more than the time to open a lane or the share of
    recommendations followed.

## ADR-040: Simulator Studio as one self-contained page in the browser

- **Status:** Accepted (2026-11-22). Slice S9, the first of M2. Studio 0.9.0, studio core 0.1.0,
  metrics and CLI 0.9.0. Results are unchanged.
- **Context:**
  - The kickoff plans the Studio as a Next.js `/sim` page that runs the simulator in a Web
    Worker, with a downloadable static build that works offline. Its criterion: the browser and
    the CLI give the same `results.json` for the same scenario and seeds.
  - The founder wants a demo to show airports, including on a phone, before any server exists.
  - The airport's data must not leave the airport's hands. A page without network access can take
    it without a data agreement covering a service.
- **Decision:**
  - **One HTML file** built with esbuild (`apps/studio/dist/gateflow-studio.html`, about
    1.6 MB). It holds the scenario library, React 19, the simulator and the worker code, and
    loads nothing. Its Content Security Policy forbids every connection, so files a person adds
    stay in the browser. The same build gives the body of a claude.ai page
    (`gateflow-studio.artifact.html`). That frame lets a page save a file only through the
    viewer's `downloads` capability, which asks the person to confirm: the page is published with
    it, and its own download code is left out of that build.
  - **Next.js is kept for the operational interfaces** (ADR-013), which need a server from M3
    on. The Studio's components are React, so the Next.js application can host them at `/sim`
    when that server exists (S10: persisted runs).
  - **The browser runs the CLI's code.** A new pure package, `@gateflow/studio-core`, holds what
    the page adds:
    - a synchronous SHA-256, identical to node:crypto, for the hashes of scenarios and files;
    - files by path, with paths resolved as the CLI does on disk; files a person adds, which
      come without folders, are also found by name;
    - the experiment setup, the what-if settings, the parameter editor and the comparison of
      runs.
  - **One setup, CLI and Studio.** The default comparisons and the classification on arrival
    move from the CLI to sim-metrics (`recommendedComparisons`, `arrivalClassification`), and
    both programs call them.
  - **Days run on Web Workers**, one per core up to 8, each taking the next day; results come
    back in seed order. Planning (the arrival forecast) and the statistics also run on a worker.
    Where a frame refuses workers, the page runs the days itself, with the same results.
  - **Identical results.** The criterion of the kickoff is refined as in ADR-012: the page's
    `results.json` equals the CLI's byte for byte, except `manifest.generator`, which names the
    program that wrote it (`gateflow-studio`). The commit is taken at build time with the rules
    of ADR-014.
  - **What-if settings mark their changes.** Ten settings (lanes, screening time, passengers,
    arrival times, lane outages, staff on call, time to open a lane, recommendations followed,
    K, GateFlow's target wait) start from the scenario as written. Every parameter they change
    becomes a SYNTHETIC assumption with a note naming the setting and the value of the scenario.
    The scenario's id and title say "what-if". Every labelled parameter can also be edited, with
    the source the person gives (AIRPORT_PROVIDED, MEASURED). The page saves the scenario as a
    JSON file the CLI reproduces exactly.
  - **The report is the CLI's report**, in a shadow root that takes the page's colour tokens,
    in both themes.
  - Report links are kept only for web addresses and relative paths: the page may show results
    files a person loads.
- **Alternatives considered:**
  - **Next.js static export now.** Several files with absolute paths: it needs a server or a
    special set-up to open from disk, and cannot be published as one page. Rejected for S9.
  - **WebCrypto for hashes.** Asynchronous, while the scenario loader needs a hash at once.
  - **Preact for a smaller page.** It saves about 40 KB; React keeps the components portable to
    the Next.js application.
- **Evidence:**
  - Chromium end-to-end tests (`apps/studio/e2e`, CI job "Simulator Studio in Chromium"):
    - the page's results equal the CLI's byte for byte but for the generator: demo day, the
      TSF-like day with extra lanes and the arrival forecast, with workers and without;
    - a what-if on the VCE-like peak day, saved as a scenario, gives the same results in the CLI;
    - the page fits a phone and makes no network request.
  - Unit tests:
    - SHA-256 against node:crypto on 500 random strings and every library file;
    - every library scenario loads with the CLI's hash;
    - the experiment of the CLI is set up;
    - edits are validated and what-if settings marked;
    - runs are compared.
- **Consequences:**
  - A person can run the simulator on a phone, offline, and give their own airport's files
    without sending them anywhere.
  - Persisted runs, history and exports through an API follow in S10 (Fastify, PostgreSQL).

## ADR-041: The trace of a simulated day, and its replay

- **Status:** Accepted (2026-11-22). Slice S11, the second of M2. Trace 0.1.0, studio core 0.2.0,
  CLI and Studio 0.11.0. Engine, queue and model versions are unchanged: no decision and no
  outcome changes, and every results file is the same as S9's but for the version of the program
  that wrote it.
- **Context:**
  - The kickoff plans a slice with each passenger's detail (why they were called earlier, the
    paired outcome) and the replay of a day. Its criterion: every call of the replay shows the
    engine's reason codes.
  - The founder needs something that can be sold. What sets GateFlow apart is that every call is
    explainable (principle 2 of the kickoff), and an airport has to see it, not take it on trust.
  - The operational product will need the same thing in M3 and M4: an audit trail with the reason
    for every call, and a console whose figures are recomputed from the event log (criterion of
    the kickoff's console slice).
- **Decision:**
  - **The event log is the record; every view is computed from it.**
    - The simulator tells an observer every event of the day: arrivals, every event of the
      queue attributed to its party, screenings with their lane, lanes opening and closing,
      decisions on extra lanes, and what the system was told about the flights (`DayEvent`).
      The observer never changes a run.
    - The replay's figures are projections of that log: people waiting, called, absent, at the
      lanes and in screening; the lanes in use; each party's journey; the flights missed as
      boarding closed; and the paired outcome of every party.
  - **A decision carries its inputs.** The queue's `COMMITTED` event now holds what the engine
    decided on: the tickets and people passed, the fast track, the urgent tickets waiting and the
    engine's assessment of the ticket chosen. The audit trail of M3 will store the same event, so
    a call can be explained without running the engine again.
  - **Reasons in words.** The engine package describes every reason code in a title and one
    sentence (`REASON_DESCRIPTIONS`); they say what the engine did, never how to obtain
    priority. An explanation adds the figures of the decision. The engine's margins become
    times at the gate ("3.8 min before boarding closes"), because staff understand those.
  - **A trace is a file** (`gateflow.sim.trace/1`, package `@gateflow/sim-trace`):
    - it holds one day of a run and two of its policies, the reference and the candidate, on
      the same passengers;
    - it includes the day itself (checkpoint, flights, parties, disruptions, staff), so it can be
      checked and run again on its own.
  - **A fingerprint proves the replay.**
    - The fingerprint is a SHA-256 of the canonical trace, without the program that wrote it and
      its revision.
    - `gateflow-sim trace` writes the trace and prints the fingerprint.
    - The Studio shows the same fingerprint, with the command that reproduces the day.
  - **No chosen day by default.** The Studio replays the run's median day for its comparison
    (the typical day), and offers the best, the worst or any day of the run. The replay opens at
    the moment the reference's queue is longest.
- **Alternatives considered:**
  - **Counts sampled by the simulator every minute.** Simpler to draw, but a second record
    beside the outcomes, and not what the operational console will have. The projections of the
    log are exact (they give the simulator's statistics to the person-millisecond).
  - **A compact, column-wise trace.** The busiest library day (VCE-like peak, 15,088 parties)
    gives a trace of 41 MB of JSON, built in 0.6 s. Readable JSON is kept until a phone shows it
    is too much.
  - **WebCrypto for the fingerprint.** Faster, but not available in every frame (a page opened
    from disk). The page's own SHA-256, already proved identical to node:crypto, computes it on
    a worker after the replay is shown.
- **Evidence:**
  - The day observer changes nothing: property tests on random days, with and without
    disruptions and extra lanes, give identical runs with and without it. Its events agree with
    the outcomes and statistics: arrivals, screenings and lanes, commitments, priority calls,
    lane decisions, extra lane time.
  - On real library days (demo, feed stress, VCE-like disrupted, TSF-like with extra lanes,
    MX-like hub), the projections of the trace give the simulator's statistics exactly:
    - waiting and standing, integrated over the day;
    - the largest queues and the most lanes open;
    - the day's metrics of both policies;
    - flights saved and lost, as in the run.
  - Every commitment is explained with a reason code. Priority calls are always
    `URGENT_FEASIBLE`, or `FLIGHT_CALL` for today's staff practice.
  - The commitment event names exactly the tickets and people it passes (queue property test).
  - The CLI's `trace` gives the run's flights saved and lost for the same day.
  - The Studio's trace equals the CLI's, fingerprint included (Node test and Chromium
    end-to-end test). The end-to-end test also checks:
    - the replay opens on the median day, with that day's flights saved and lost;
    - every call shows a reason of the engine;
    - a saved passenger's day is explained call by call.
- **Consequences:**
  - An airport sees, on its own day, which passengers GateFlow brought forward and why, and
    who waited longer for them, within the bound K.
  - The engine's figures appear on screen: the wording of facts and reasons is now part of the
    product and will need Italian and Spanish (M3).
  - A trace of a busy day is large; a lighter format can come later without changing the views.

## ADR-042: The operational core: one writer per checkpoint, a command log and a hash chain

- **Status:** Accepted (2026-11-22). Slice S12, the first of M3. API 0.12.0, operations 0.1.0,
  contracts 0.1.0. Engine, queue and model unchanged; no simulated number changes.
- **Context:**
  - M3 builds the product an airport installs. Its first slice is the server and the database
    (S10 was folded into M3 for this). The kickoff fixed the model: one writer per checkpoint
    under an advisory lock; current state and log in the same transaction; idempotent commands;
    an append-only log with a chain of hashes; the database itself refusing a second admission.
  - Principle 4 of the kickoff: the same code in simulation and production. The queue
    (`queue-core`) reads no clock and draws no random number, so it can run unchanged behind an
    API.
- **Decision:**
  - **`@gateflow/operations` (pure)** runs one service day of a checkpoint on the simulator's
    `CheckpointQueue`, unchanged.
    - Commands: `OPEN_DAY` (with the policy and the lanes of the day), `ISSUE_TICKET`,
      `CALL_NEXT`, `PRESENT`.
    - The events are the queue's own (`ISSUED`, `COMMITTED`, `CALLED`...), the same vocabulary
      as the simulator's trace (ADR-041).
    - Every value a command needs (identifiers, the opaque reference, what is known of the
      flight, the time) is chosen before it is applied and recorded with it, so replaying a
      day's commands gives the same day.
    - The live system runs a virtual queue only, and lanes are opened by staff: a physical
      queue or a simulated lane mode is refused.
  - **`apps/api`** (Fastify, PostgreSQL through Drizzle ORM; migrations generated by
    drizzle-kit, triggers written by hand) holds every input and output. Packages stay pure, so
    the database code lives in the app: the boundary rules are unchanged.
  - **One writer per checkpoint.** A command is one transaction:
    1. take `pg_advisory_xact_lock` on the checkpoint's key;
    2. return the stored answer if its `Idempotency-Key` is known (a key reused for another
       request is refused, 409);
    3. bring the day in memory in step with the log: commands written by another server are
       applied, and a day in memory that is not the log's is rebuilt from `OPEN_DAY`;
    4. open the service day when it changed (at a time of day set per checkpoint);
    5. apply the command;
    6. write the command, its events, the tickets it changed and any admission.
    - If anything fails, the transaction rolls back and the day in memory is dropped.
    - The log's time never goes back, even if the server's clock does.
  - **The log is append-only and chained.**
    - Triggers refuse any update, delete or truncate of commands, events and admissions.
    - Each command's hash covers the previous hash, the command, its result and every event it
      caused.
    - `GET /v1/checkpoints/{id}/audit/verify` recomputes the chain and names the first command
      that no longer matches.
  - **The database enforces the invariants that matter.** One admission per ticket (primary
    key), one number per checkpoint and day, one opaque reference per ticket, one key per
    command, and checks on every coded value.
  - **Contracts** (`@gateflow/contracts`, Zod): requests and answers of every endpoint, with no
    field that holds personal data; the OpenAPI 3.1 document is generated from them.
  - **Privacy in the log.** The request log keeps the method, the route and the status: no
    client address, no ticket reference, no body.
  - **Tests on a real PostgreSQL.**
    - In CI: a PostgreSQL 17 service.
    - Locally: a throwaway cluster started from the PostgreSQL binaries of the machine. Each
      test file gets its own database.
    - Without PostgreSQL the tests fail; they never skip.
- **Alternatives considered:**
  - **State tables only, the queue rebuilt from them.** It would need the queue to serialise
    its whole state (window, cap history, hysteresis), a second source of truth beside the log.
    Replaying the day's commands through the same code needs none of that.
  - **Full event sourcing of every view.** Not needed: tickets have a current-state table
    written in the same transaction, for queries.
  - **Testcontainers.** No Docker daemon here; a service container in CI and local binaries
    give the same real database without it.
  - **Prisma.** Advisory locks, partial unique indexes and triggers need raw SQL there; Drizzle
    keeps the schema in TypeScript and the SQL visible (kickoff choice).
- **Evidence:**
  - 100 "call next" at once: no ticket called twice. Every waiting ticket was called once, and
    the other calls found nobody. A mutation check makes the test meaningful: without the lock,
    the same test fails.
  - The database refuses a second admission, even when inserted directly.
  - The audit check finds a changed event and names its command.
  - The same key gives the same answer once; a key reused for another request is refused.
  - A second server on the same database stays consistent with the first. The tickets' state
    equals a replay of the log. A new service day starts numbering from A001 again.
  - Random days (property tests): the log rebuilds the same day, and its events are those of
    the simulator's queue driven directly.
  - The bundle migrates, seeds the VCE-like day and serves; a real call and the audit check
    succeed (locally and in CI).
- **Consequences:**
  - Commands must not depend on anything outside their record. New commands (lanes, modes,
    flight updates, timers) follow the same rule.
  - Timeouts are applied when the next command arrives, until the scheduler of S15 applies
    them on time.
  - Until staff sign in (S15), commands are recorded as `staff:unauthenticated`: the API must
    not be exposed beyond a demo network.

## ADR-043: Boarding passes at the kiosk: read in memory, kept as an HMAC

- **Status:** Accepted (2026-11-22). Slice S13. BCBP 0.1.0, API 0.13.0, operations 0.2.0,
  contracts 0.2.0. No simulated number changes.
- **Context:**
  - Passengers take a ticket by scanning the boarding pass they already have (IATA BCBP,
    Resolution 792). A pass holds a name, a booking reference (PNR) and a seat, which GateFlow
    must never keep (kickoff 2.13). A rescan must find the same ticket, and a pass of another
    airport or day must be refused with a reason.
  - The flight date on a pass is a day of the year without the year. Across the year end, a scan
    on 31 December for a flight on 1 January must give the next year.
- **Decision:**
  - **`@gateflow/bcbp` (pure)** reads the M format strictly for the mandatory items of every leg
    (up to four) and as far as they are consistent for the conditional ones (version, date of
    issue, marketing carrier, fast track).
    - It never throws: any text gives a pass or a typed error with a position.
    - An error never quotes the text.
    - The name is skipped and never returned.
    - It also has an encoder and a generator of synthetic passes for demos and tests: sample
      names such as `SAMPLE/ALEX`, never a person.
  - **The year** is the one that puts the flight closest to the day of the scan. The leg for a
    checkpoint is the one from this airport, dated within a day of the scan: a pass of another
    airport is `WRONG_AIRPORT`, of another day `WRONG_DAY`.
  - **Deduplication key:** an HMAC-SHA256 of carrier, flight, date, origin, check-in sequence
    and booking reference.
    - The secret is random per airport and flight date (`dedup_secret`); deleting it (with the
      retention of the pilot) makes the keys of that date meaningless.
    - The booking reference enters the HMAC and is never stored.
    - A partial unique index allows one active ticket per key and checkpoint.
  - **`POST /v1/checkpoints/{id}/scans`**:
    - a pass that can give a ticket gives `ISSUED` (a ticket with its reference);
    - a pass scanned again gives `RETRIEVED` (the same ticket and reference, to print again);
    - a pass already admitted gives `NEEDS_ASSISTANCE` (`ALREADY_ADMITTED`);
    - an unknown flight gives `NEEDS_ASSISTANCE` (`UNKNOWN_FLIGHT`);
    - an unreadable pass, or one of another airport or day, gives `REJECTED` with its reason,
      and creates no ticket.
    - The lookup and the issue run under the checkpoint's lock, so the same pass at several
      kiosks at once gives one ticket.
    - A connecting passenger (the leg from here is not the first) gets a `TRANSFER` ticket.
  - **Every scan is recorded** (`scan`, append-only): outcome, reason, ticket, and the pass's
    version, number of legs and whether it carries security data. Nothing that identifies a
    person.
  - **Flights carry the designator of their passes:** carrier, flight number without leading
    zeros, local departure date. Synthetic library flights get `ZZ`, a placeholder of no
    airline; synthetic airports named `xxx-like` take the code `XXX` (`VCE` for `vce-like`), any
    other synthetic airport `ZZZ`.
- **Alternatives considered:**
  - **Storing the pass or the PNR, encrypted.** Not needed: the HMAC finds the ticket again,
    and data never kept cannot leak.
  - **Deriving the secrets from one master key.** Simpler, but destroying one date's keys would
    then be impossible.
  - **Verifying the security data (airline signatures).** Needs every airline's public keys;
    the flight feed and the check at the access point are the controls of the MVP (kickoff 2.13).
- **Evidence:**
  - The parser:
    - the implementation guide's example reads with every mandatory item;
    - 500 random passes of one to four legs read back exactly as encoded;
    - 2,000 arbitrary or corrupted texts never make it throw, and its errors carry only a code
      and a position;
    - every day of four years gives back its date, across year ends and 29 February.
  - Through the API on PostgreSQL:
    - a scan issues a ticket and a rescan finds it;
    - ten simultaneous scans of one pass give one ticket;
    - a pass of another airport or day is refused with its reason;
    - an unreadable pass, or a pass for an unknown flight, creates no ticket;
    - a connecting passenger gets a transfer ticket, and a passenger already admitted is sent
      to staff.
  - After every scan, no table and no log line contains the pass, the name or the booking
    reference.
- **Consequences:**
  - A pass gives a ticket only for a flight in GateFlow's flight data: the feed adapters of the
    pilot decide what that covers.
  - Groups and families scan one pass each until the kiosk offers grouping (S14).

## ADR-044: The passengers' screens: one web application served by the API, kiosks with device tokens

- **Status:** Accepted (2026-11-22). Slice S14. API 0.14.0, contracts 0.3.0, i18n 0.1.0, web
  0.14.0. Revises ADR-013 for the user interfaces. No simulated number changes.
- **Context:**
  - The kiosk and the passenger's page are the first screens airports and passengers see.
    - They must work on a kiosk PC with a barcode scanner and on any phone, in Italian, English
      and Mexican Spanish.
    - They must keep nothing of a boarding pass.
  - ADR-013 planned one Next.js application for every interface. The screens of M3 need no
    server rendering and no search engine; each is driven by the API. The product must install
    at an airport as one service (Docker Compose, edge-capable).
  - Until S13 the API knew nobody: anyone could send boarding passes as a kiosk.
- **Decision:**
  - **One React application, `apps/web`, built by esbuild into static files and served by the
    API** (`gateflow-api serve`, `@fastify/static`).
    - Pages: `/kiosk/<checkpoint>` and `/t/<ticket reference>`. Displays, lane stations and
      the supervisor join it in S15 to S17.
    - One process and one origin: no CORS, no cookies, one Content Security Policy.
    - The build writes Brotli and gzip copies (the code is 263 KB, 72 KB with Brotli) and the
      licences of the libraries in the bundle (React, qrcode-generator: MIT). No source maps in
      the production build.
  - **Security headers** on every answer: `nosniff` and `no-referrer`.
    - Pages: a policy that allows the application's own files only (no inline script or style,
      no other origin, no frame) and `X-Robots-Tag: noindex`, because a ticket's address is its
      key.
    - The request log removes the reference from `/t/...` as from `/v1/tickets/...`. Missing
      addresses are no longer logged whole (Fastify's own handler did).
  - **Device tokens:**
    - `gateflow-api device add --checkpoint <id> --kind kiosk|display|lane --name <name>`
      prints a random 256-bit token once. The database keeps only its SHA-256.
      `device revoke --id <id>` stops it at once.
    - Scans, the demo flights and `GET /v1/devices/me` need `Authorization: Bearer <token>` of
      a kiosk of that checkpoint (401 without a valid token, 403 for another device).
    - The kiosk gets its token once in the address's fragment (`#device=`), which never reaches
      a server. It keeps it in the browser's storage and takes it off the address at once.
  - **The kiosk:**
    - A keyboard-wedge scanner types into a field that keeps the focus: keystrokes elsewhere
      are sent to it, and buttons never take it. Staff can type or paste a code.
    - A scan gives either the number, with a QR code to its page and a print layout (one page
      on an 80 mm roll), or the reason, with "ask a member of staff". All in the passenger's
      language.
    - The kiosk returns to its welcome screen and its own language after 45 seconds (20 for a
      refusal).
    - A synthetic airport offers sample boarding passes for today's demo flights
      (`GET /v1/checkpoints/{id}/demo-flights`, DEMO flights only).
  - **The passenger's page:**
    - It shows the number and what to do now, with no personal data.
    - It asks again every 15 seconds while the ticket is open, and at once when the phone shows
      the page again.
    - The language chosen stays on the phone.
  - **Languages:** `@gateflow/i18n` (pure) holds every text in the three languages. A test
    checks that none is missing, that placeholders match, and that no text promises priority.
  - **Privacy notice:** a short line on the kiosk and a full notice. It is marked as a draft, to
    be completed with each airport (controller, retention, rights).
- **Alternatives considered:**
  - **Next.js (ADR-013).** Server rendering is not needed. It would add a second server (or a
    Node runtime behind the API) for static screens, and a heavier build and runtime on an
    airport's network. It stays possible for the supervisor if one day it needs it.
  - **One application per screen.** More builds and origins for the same components and
    languages.
  - **Cookie sessions for kiosks.** They need protection against cross-site requests, for
    devices that have no users. A revocable token per device is simpler.
  - **The token in the query string.** It would reach the server's logs and the browser's
    history.
- **Evidence:**
  - **In Chromium, on the product itself** (the API's bundle on PostgreSQL, migrated, seeded and
    serving the built application):
    - a kiosk without the token of a kiosk of its checkpoint says it is not set up;
    - the token leaves the address at once;
    - a sample pass gives a number whose QR code is exactly the address of its page;
    - a pass typed as a scanner types gives a number, and again the same number;
    - nothing of the pass stays in the page or in the browser's storage;
    - refusals are in the passenger's language (another airport, unreadable, another day,
      unknown flight);
    - the privacy notice is marked as a draft;
    - a print is the number and its QR code, one page on an 80 mm roll;
    - the kiosk fits portrait and landscape screens without scrolling, and a number of seven
      characters fits;
    - the passenger's page works in the three languages, light and dark, on a 320 px phone;
    - called by staff, the page says "go now" by itself; admitted, it says so, and the same
      pass at the kiosk sends the passenger to staff;
    - no page loads anything from another server or logs an error.
  - **API:**
    - scans need a kiosk of the checkpoint (401, 403, revoked);
    - `devices/me` and the demo flights match the contracts;
    - pages have the policy and the headers, compressed copies are served, and a missing file
      is a 404;
    - the log holds no ticket reference.
  - **Contracts:** the device routes carry the bearer scheme, and no answer has a field named
    like personal data.
- **Consequences:**
  - Staff actions (calls, admissions, the queue) stay without sign-in until S15 (staff users and
    roles).
  - The kiosk prints through the browser. Silent printing is a setting of the kiosk's browser
    (Chrome's `--kiosk-printing`).
  - A pass for a flight whose boarding has closed still gives a ticket. Whether to send such a
    passenger to staff instead is a rule to agree with each airport (S15).
  - One pass gives one ticket: a family scans each pass and gets a number each. Grouping at the
    kiosk (one number for a party) waits for the lane station of S15, where staff can admit a
    party together.

## ADR-045: The queue's life cycle on a clock, and staff who sign in

- **Status:** Accepted (2026-11-22). Slice S15. queue-core 0.7.0, operations 0.3.0, API 0.15.0,
  contracts 0.4.0, web 0.15.0. No simulated number changes: the golden files change only in the
  version of the queue.
- **Context:**
  - The queue's timeouts (a second call, a no-show, the expiry of a no-show) were applied only
    when the next command came. A called passenger who never came stayed called on the
    passenger's page and on displays.
  - Staff need to act on a ticket: call again, mark an absence, bring it back, hold it for a
    review, end the review, cancel (kickoff 2.6 and 2.8). Every transition must be guarded by the
    ticket's state, idempotent and audited.
  - Until S14 anyone who reached the API could call, admit and issue tickets.
- **Decision:**
  - **The state machine** (`queue-core`) gains the staff actions and two states:
    - `REVIEW`: a waiting ticket held out of the order of calls. It keeps its place and goes back
      to it, or is cancelled, when the review ends.
    - `CANCELLED`: final.
    - Each action is allowed only in some states (ARCHITECTURE, section 6). Otherwise it answers
      `NOT_ALLOWED` and changes nothing.
    - The no-show timeout counts from the latest second call, by the first timeout or by staff.
    - The simulator never takes these actions, and fails at once if one ever reaches it.
  - **Timers are commands.** `ADVANCE` applies the timeouts due. It goes through the log like any
    command, so a replay of the log gives the same day.
    - Every command writes the day's next due time (`checkpoint_timer`).
    - `serve` runs a scheduler that sends `ADVANCE` to each checkpoint whose next timeout is due,
      once a second. Its idempotency key names the timeout (`advance:<day>:<due time>`), so the
      timeout applies once whichever servers see it due.
    - A rescan at a kiosk applies the due timeouts first: a passenger's answer is never a second
      late.
  - **At the kiosk:**
    - a no-show who scans the pass again within the window is back in the queue with the same
      number;
    - a ticket under review or cancelled sends the passenger to staff;
    - a pass whose flight's boarding has closed, as GateFlow knows it, sends the passenger to
      staff, unless the checkpoint's `afterBoardingClose` is `ISSUE`.
  - **At the access point** a ticket is found by its number, its QR code or its boarding pass. The
    pass is read in memory: only its HMAC finds the ticket, and only that HMAC enters the request's
    hash.
  - **Manual tickets** carry a coded reason (no boarding pass, pass unreadable, assistance, group,
    other), never free text, and the size of the party: a family gets one number at the lane.
  - **Staff sign in** with local logins (`gateflow-api user add`). OIDC/SAML with MFA replace the
    passwords for the pilot (kickoff 2.9); the roles and scopes stay.
    - Passwords are kept as scrypt hashes from Node's own crypto, with one of the parameter sets
      of the OWASP Password Storage Cheat Sheet (N = 2^15, r = 8, p = 3). A check takes about
      0.2 seconds, off the server's event loop.
    - A session is a random 256-bit token in a cookie: HttpOnly, SameSite=Strict, Secure over
      TLS, for one shift (12 hours). Only its SHA-256 is kept. Signing out, a new password or a
      disabled member end it at once.
    - A request sent by a page of another site is refused (its `Origin` against `Host`).
    - Ten failures in a quarter of an hour make a login wait (per server). A wrong password is
      answered as an unknown login, in the same time.
    - **Roles:** operators issue manual tickets, call, admit, call again, mark no-shows, bring
      them back and ask for reviews. Supervisors also cancel, end reviews and check the audit.
      Administrators may do what supervisors do. A member works at the checkpoints of their
      airport that their account names, or at all of them.
    - Every staff route checks, in this order, the site, the session (401), the checkpoint (404),
      the role and scope (403). Nothing else of the request is read before.
    - The log records the member who acted (`staff:<id>`).
  - **The lane station** (`/lane/<checkpoint>`) is part of the web application (ADR-044). It asks
    for the queue every 5 seconds until displays get server-sent events (S16).
- **Alternatives considered:**
  - **Timers held only in the server's memory.** They would be lost on a restart, and the log
    could not replay them.
  - **A database scheduler (pg_cron) or LISTEN/NOTIFY for timers.** pg_cron is one more extension
    to install at each airport. A pass every second over an indexed table costs nothing at the
    scale of a checkpoint.
  - **Tokens in the page's storage, or JWTs.** A script could read a stored token. A JWT cannot be
    ended at once, before it expires. Server sessions in HttpOnly cookies can.
  - **Argon2.** It needs a native module. scrypt, with the parameters OWASP gives for it, is in
    Node's own crypto.
  - **REVIEW for anomalous scans.** An anomalous scan still gives no ticket and sends the
    passenger to staff (ADR-043), who can issue a manual ticket. A review is staff's own decision.
- **Evidence:**
  - **queue-core:** every state against every action (9 by 7) gives the transition of the
    table, or a refusal that changes nothing and reports nothing. 1,000 random sequences with
    staff actions keep every invariant, and the staff actions are reached in many runs: call
    again in 70, cancel in 205. Timing tests show the no-show T2 after a staff's second call.
    Simulated results are unchanged.
  - **operations:** a log with timeouts and staff actions rebuilds the same day, next due time
    included. Its events are those of the queue driven with the same inputs.
  - **API on PostgreSQL:**
    - the scheduler applies a second call, a no-show and an expiry on time, with nobody acting;
    - two servers apply a due timeout once;
    - staff actions are allowed by state and idempotent, and a key reused for another ticket is
      refused;
    - a review keeps the ticket's place, and the ticket is not admitted meanwhile;
    - a rescan brings a no-show back, and gives way to a new ticket after expiry;
    - review, cancellation and a closed boarding send the passenger to staff;
    - admission by boarding pass, with no pass, name or booking reference in any table;
    - the log rebuilds the day, and the audit chain is intact.
  - **Staff:**
    - every staff route refuses without a session;
    - roles, another airport and another checkpoint are refused;
    - a request from another site is refused;
    - the cookie is HttpOnly, SameSite=Strict, and Secure over TLS;
    - no password or token is stored or logged;
    - failures are slowed;
    - sign-out, expiry, a new password and disabling all end the session.
  - **In Chromium, on the product:**
    - sign-in, a session the page cannot read, sign-out;
    - call, absence, back in the queue, then admission by number, QR code and boarding pass;
    - review asked by an operator and ended by a supervisor, who alone can cancel;
    - a manual ticket for a family of three, on a phone, in Spanish too;
    - no request to any other server.
- **Consequences:**
  - The pilot replaces the local passwords with the airport's identity provider and MFA.
  - The slowing of failures is per server. Behind several servers it holds for each of them.
  - A party at the kiosk (one number for several passes) was not offered at first: families got
    one number from staff at the lane. Since 0.15.1 a party also takes one number at the kiosk,
    each of its boarding passes scanned onto it (ADR-046).
  - Overrides, modes (FIFO only, paused, emergency) and the audit view come with the supervisor's
    console (S17).

## ADR-046: People travelling together take one number at the kiosk

- **Status:** Accepted (2026-11-22). Founder's decisions after S15: "va raggruppato", passengers
  group themselves at the kiosk; then "conta anche i neonati dal pass del genitore", infants count
  from their parent's boarding pass. BCBP 0.2.0, queue-core 0.8.0, operations 0.4.0, contracts
  0.5.0, API and web 0.15.1. No simulated number changes: the golden files change only in the
  version of the queue.
- **Context:**
  - The queue counts people, not tickets: the prepare window, the outstanding calls, the cap on
    priority and the lane's throughput are all in people (ADR-021). A family of four on a ticket
    for one is called as one person and arrives as four.
  - A father who scans only his own pass still works at the lane: he is called and his family
    goes with him. But the queue undercounts, its estimates drift for everybody, and the
    people actually served are not measured.
  - Until now only staff could give one number to a party, by hand at the lane (ADR-045).
- **Decision:**
  - After a number, the kiosk offers **"Add travel companions"**. On the screen that
    opens, each companion scans their own boarding pass; the screen shows the people on the
    number and the answer to each scan, until "Done", or for a minute without a pass.
  - A pass joins the number (`POST /scans` with `party`, the ticket's reference) when:
    - it is for **the same flight** (else `OTHER_FLIGHT`: it takes a number of its own);
    - it has **no number of its own** that stands (else `HAS_OWN_NUMBER`); an expired one does
      not count, and one admitted, under review or cancelled sends the passenger to staff, as a
      rescan would;
    - the number **still waits** (`QUEUED` or `PREPARE`; else `TOO_LATE`);
    - the party has **fewer than 20** people (else `PARTY_FULL`).
  - A pass already on the number is found again (`RETRIEVED`), not added twice. A request sent
    twice with the same `Idempotency-Key` adds the pass once.
  - **The log.** `ADD_TO_PARTY` is a command like any other (operations 0.4.0); the queue's `grow`
    adds the people and reports `PARTY_GROWN` (queue-core 0.8.0). Overtakes and priority calls
    already counted keep the size the party had then. The simulator never takes it.
  - **The passes.** Only each pass's HMAC is kept (ADR-043), in `party_pass`, with the ticket and
    the command that added it; the table is append-only, like the scans. A rescan of a
    companion's pass finds the family's number, and the access point admits the family by any of
    its passes.
  - The ticket, its printout and the passenger's page say for how many people the number is.
  - **Infants.** An infant under two usually travels on the lap of an adult, with no seat. The
    adult's boarding pass may say so: its passenger description (item 15 of Resolution 792) is 6,
    "adult travelling with infant". Some airlines also give the infant a pass of its own
    (description 4).
    - A pass whose description is 6 brings two people: when it takes a number, and when it joins
      a party.
    - Each infant is counted once, whichever of the two passes comes first. The day keeps, for
      each party, the infants declared on adults' passes less the infants' own passes added
      (`CheckpointDay.partyGrowth`). An infant's own pass whose infant an adult declared joins
      without growing the party; an adult's pass whose infant's own pass came first adds the
      adult only.
    - The parser returns only the infant (`WITH_INFANT`, `INFANT` or nothing): the description's
      other values tell a passenger's sex, and are never returned, stored or logged. The log
      records that a pass carried an infant, nothing else of the passenger.
    - The kiosk says when a pass added an adult with an infant, and when an infant was counted
      already. The privacy notice says the number is kept with how many people it is for.
- **Alternatives considered:**
  - **Asking "how many are you?".** Quicker for the family, but nothing proves the count: one pass
    could claim the room of twenty in the lane's plan, and people without a boarding pass for this
    flight would be on the number. Scanning each pass proves each person.
  - **Grouping by booking reference.** It is never kept (ADR-043), and families often travel on
    several bookings.
  - **Merging two numbers already taken.** More rules for a rare case; staff can cancel one and
    give a manual ticket for the party.
  - **Counting every infant's pass and every adult's infant.** Simpler, but an infant with a pass
    of its own would be counted twice when both passes are scanned.
- **Evidence:**
  - **BCBP:** description 6 reads as an adult with an infant and 4 as an infant, in 500 random
    round trips; the values that tell a passenger's sex give nothing, and the parsed pass has no
    field for them.
  - **queue-core:** `grow` in the table of every state (allowed only while the ticket waits), and
    1,000 random sequences with growing parties keep every invariant. Nobody more (an infant
    counted already) is allowed in the same states and changes nothing.
  - **operations:** random days with `ADD_TO_PARTY` rebuild from their log. Infants are counted
    once in either order: three adults with infants, the own passes of two of the infants and one
    more adult, mixed, make seven people; the count is rebuilt from the log. An adult with an
    infant counted as one, an unknown infant and a party over 20 are refused.
  - **API on PostgreSQL:** a family's passes join one number, once each, also when the request
    is sent twice; a companion's rescan finds the family's number; the family is admitted by a
    companion's pass; another flight, a number of its own, a number held by staff, a full party
    and a number already called are refused, and an unknown number is not found; no pass, name
    or booking reference in any table, and the passes added cannot be changed or removed; the log
    rebuilds every party; the audit chain is intact. A mother's pass with a baby takes a number
    for two, the baby's own pass adds nobody and the father one; the baby's pass first and then
    its parent's make two.
  - **In Chromium, on the product:** a number, then a companion's pass by the scanner, the same
    pass twice, another flight's pass; the number for two on the ticket screen and the
    passenger's page; the companion scanning alone later finds the family's number; the demo's
    sample pass is for the family's flight; the ticket and the party's screen fit portrait and
    landscape kiosks, in Italian and in Spanish. A parent's pass with a baby gives a number for
    two; the baby's own pass is counted already; another parent with a baby adds two.
- **Consequences:**
  - The step is optional. A family that skips it is a party of one in the queue's count; the lane
    still admits them together.
  - A party grows only while its number waits: once called, a late companion goes with the family
    and is not counted.
  - Nothing yet lets staff change a party's size after the fact; the lane station may get it.

## ADR-047: Displays and lane stations follow the queue by server-sent events

- **Status:** Accepted (2026-11-22). Slice S16. operations 0.5.0, contracts 0.6.0, API and web
  0.16.0. No simulated number changes.
- **Context:**
  - A display in the hall must show each call at once, and must never show old data as if it
    were current (kickoff RT-07). When the API or the database fail, the checkpoint goes back to
    its usual queue and the display says to follow the staff (kickoff 2.4.6).
  - The kickoff chose server-sent events with `Last-Event-ID` for screens, and REST for commands:
    no WebSocket.
  - Until S16 the lane station asked for the queue every 5 seconds.
- **Decision:**
  - **The board.** What a display shows is computed by the operations day, pure and replayable
    (`CheckpointDay.board()`): the numbers called (a second call marked), the latest call first,
    and the prepare window in call order. Numbers only: no personal data, no position, no waiting
    time. The board is written with every command, in its transaction, as the timers are
    (`display_board`): every server reads the same board, at the sequence number of the log.
  - **The display's stream**, `GET /v1/checkpoints/{id}/display` with a display's token:
    - each message (`board`) carries the board after a command and the calls since the previous
      message, oldest first; its id is the command's sequence number;
    - a display that reconnects sends `Last-Event-ID` and gets, in its first message, every call
      it missed (from the event log, the latest 100 of the service day), then the current board;
    - a heartbeat every 10 seconds; at each one the display's token is checked again, so a revoked
      display stops at once;
    - a board of another service day is shown empty: yesterday's numbers are not today's.
  - **The lane station's stream**, `GET /v1/checkpoints/{id}/stream` with a staff session: a
    `changed` message whenever the queue changes; the station then asks for the queue, and still
    every 20 seconds in case the stream is down. A member signed out stops at the next heartbeat.
  - **Fan-out.** The server that applies a command tells its streams after the commit. Every
    second each server also reads the sequence number of the checkpoints its streams follow, so
    the commands of another server reach its displays within a second.
  - **The display page**, `/display/<checkpoint>`:
    - its token comes once in the address's fragment and is kept apart from a kiosk's;
    - it reads the stream over `fetch`, not with `EventSource`, so that the token goes in a header
      and never in an address; it reconnects after 1, 2, 4... up to 15 seconds with
      `Last-Event-ID`;
    - texts in the display's language and in English; a number just called flashes for 10
      seconds (it only stands out with reduced motion);
    - without a message or heartbeat for 30 seconds: "Not up to date"; after 2 minutes: "Please
      follow the instructions of the staff", in place of the numbers.
- **Alternatives considered:**
  - **`EventSource`.** It cannot send a header: the token would go in the address, where proxies
    and logs keep it, or in a cookie the display would have to obtain first.
  - **WebSocket.** Two-way, but displays only listen; server-sent events pass through proxies as
    plain HTTP and resume by themselves.
  - **PostgreSQL `LISTEN/NOTIFY` between servers.** Immediate, but it needs a connection held
    open by each server and a way to catch up after that connection drops. Reading one row per
    followed checkpoint every second costs nothing, survives anything, and keeps another server's
    delay under a second.
  - **A snapshot only on reconnection.** Simpler, but a display could not tell which numbers were
    called while it was away: they would not flash.
- **Evidence:**
  - **operations:** in 200 random days, the board shows exactly the tickets called, the latest
    first, a second call marked, and the prepare window in call order; a replay of the log gives
    the same board.
  - **API on PostgreSQL**, over real HTTP:
    - only the displays of the checkpoint follow it, and staff the lane station's stream;
    - a display gets the board, then each call as it happens;
    - a display away while three calls happen gets the three, in order, when it reconnects with
      `Last-Event-ID`, and the same board as a display that stayed; without an id, or with one
      the log never gave, it gets the board alone;
    - a command on one server reaches the displays of another in under 1.5 seconds;
    - heartbeats; a revoked display's stream ends; a member signed out stops their stream;
    - no reference and no ticket id in a display's stream;
    - a new service day shows an empty board.
  - **In Chromium, on the product:**
    - a display shows each call at once, a second call marked, and the numbers to get ready;
    - the server stops: "not up to date" after 30 seconds, the staff's instructions after 2
      minutes (the page's clock); the server is back and calls two numbers; the display
      reconnects and both flash;
    - it fits 1920x1080, 1366x768, 1280x720, 1080x1920 and 768x1024 screens full of numbers;
      with the wider font of the CI's Chromium the fullest takes 90% of the height;
    - two lane stations show at once what the other, or a kiosk, does.
- **Consequences:**
  - The access point of a call ("go to lane 3") comes with the lanes in S17; until then the
    display sends passengers to the security entrance.
  - Messages for passengers (a pause, an emergency) come with the supervisor's modes (S17).
  - The passenger's page still asks every 15 seconds: its few requests do not justify a stream
    per phone.

## ADR-048: The supervisor's modes of a checkpoint

- **Status:** Accepted (2026-11-22). Slice S17, part 1. The founder confirmed the proposals of
  the S17 plan ("ok a tutto"). queue-core 0.9.0, operations 0.6.0, contracts 0.7.0. No simulated
  number changes: the golden files change only in the version of the queue.
- **Context:**
  - The kickoff asks for a console with four modes of a checkpoint (FR-12, 2.4.6, 2.6 F7 to F12):
    normal, FIFO only, paused and emergency; every change in the audit (FR-14); in FIFO only, the
    order is pure FIFO (acceptance criterion of S17).
  - An evacuation or a security incident must never turn passengers into no-shows: they were told
    to leave, or to wait.
  - Until S17 a supervisor could stop calling only by not pressing the button, and kiosks went on
    giving numbers whatever happened in the hall.
- **Decision:**
  - **Four modes**, set by a supervisor (or an administrator) with the command `SET_MODE`, in the
    log like any command, with who set it:
    - `NORMAL`: the policy of the day orders the queue;
    - `FIFO_ONLY`: the next tickets to enter the prepare window are the oldest waiting ones,
      whatever the policy (`COMMITTED` with the reason `FIFO`, no priority, nobody overtaken). The
      numbers already announced stay: no churn. It is the fallback at hand when a policy behaves
      badly; another policy comes from the next service day (S17, part 3);
    - `PAUSED`: nobody is called (`CALL_NEXT` answers 409 `CALLS_PAUSED`, and a second call is
      refused); kiosks go on giving numbers, and the timers of those already called run;
    - `EMERGENCY`: nobody is called, and the day refuses to issue a ticket or to grow a party
      (`EMERGENCY`): kiosks read nothing, staff issue nothing, so the log never has one. The call
      timers stop: a passenger called, recalled or absent keeps the time they had left, which
      starts again when the emergency ends. Admissions at the access point remain possible:
      staff decide there.
  - **Resuming.** From `PAUSED` or `EMERGENCY` the supervisor chooses: carry on in the same order
    (the window stays as announced), or `reset`: the window is taken back (`UNCOMMITTED`, each
    ticket at its place in the order of arrival) and announced again in the order of arrival.
    A change to the same mode, or a reset that resumes nothing, is `NOT_ALLOWED` and changes
    nothing; it is still in the log.
  - **Across days.** A service day opens in the mode the previous one ended in (`DayConfig.mode`,
    its change the day's first event): an emergency goes on past the start of a service day.
  - **Who learns it:**
    - the displays, with the board (`mode`): paused, a banner above the numbers; in an emergency,
      only "Service suspended. Please follow the instructions of the staff.", in the display's
      language and in English;
    - the kiosks, by their own stream (`GET /v1/checkpoints/{id}/kiosk`, a `status` message at
      once and at each change): in an emergency the emergency message in the kiosk's language and
      in English, and no scan field; a scan refused with `EMERGENCY` shows it at once too.
      Paused, a number says that calls are paused and that it stays valid;
    - the lane station, with the queue (`mode`): a banner, and no call while paused or in an
      emergency, nor a manual ticket in an emergency;
    - the passenger's page (`mode`): paused, the number stays valid; in an emergency, the staff's
      instructions come first.
- **Alternatives considered:**
  - **Frozen timers in `PAUSED` too.** A pause is short and staff stay at their posts: those
    already called keep coming, and the timeouts keep the queue moving. Only an emergency stops
    the passengers, so only an emergency stops the clocks.
  - **Kiosks giving numbers in an emergency.** Numbers given while the hall is being cleared
    would be called into an empty hall, or crowd it when the emergency ends.
  - **A reset that keeps the priorities.** A reset is asked for after a disruption, when the
    announced order no longer means anything to the people in the hall: the order of arrival is
    the one everybody can check. The next commitments follow the mode again.
  - **The kiosk polling the mode.** An emergency message must appear at once; the kiosk follows a
    stream like the displays, and a scan refused for the emergency shows it even before.
- **Evidence:**
  - **queue-core:** FIFO_ONLY puts the oldest ticket in the window though a later one would miss
    its flight, and back to NORMAL the policy prioritises it again; paused, nobody is called and
    the timers run; in an emergency nothing is due (`nextDueMs` null), and on resuming a recalled
    passenger keeps the minute they had left, a no-show marked during the emergency its whole
    window from the end of it; a reset takes the window back and announces it in the order of
    arrival. In random days with modes among the operations, nobody is called while stopped, every
    commitment in FIFO_ONLY or after a reset is FIFO, and the window after a reset is in arrival
    order.
  - **operations:** results, events and the board's mode; an issue or a party growing in an
    emergency is refused; a day opens in the mode the previous one ended in; random days with modes
    replay to the same day and the same events as the simulator's queue.
  - **API on PostgreSQL:** only a supervisor sets the mode, and the log records who; paused, a
    call is refused and kiosks issue; in an emergency a kiosk's scan is refused before the pass is
    read (no scan recorded), a manual ticket too, and a passenger called keeps the time left: after
    30 minutes of emergency still called, recalled a minute after its end; a reset takes the
    window back (`UNCOMMITTED`) and announces it in order of arrival; an emergency goes on into
    the next service day; the chain of hashes holds.
  - **In Chromium, on the product:** a display, a kiosk, a lane station and a passenger's page
    follow a pause, an emergency and the end of it, in Italian and English; the paused display
    fits 1920x1080, 1280x720 and 1080x1920 screens.
- **Consequences:**
  - The console's buttons for the modes come with the supervisor's console (S17, part 3); until
    then the modes are set through the API.
  - Overrides (`BOOST`, `CALL_NOW`) come with part 2, and follow the modes: no call while calls
    are stopped, no jump of the order in `FIFO_ONLY`.
  - The messages are predefined texts in the three languages; an airport's own texts come with
    its configuration.
