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
