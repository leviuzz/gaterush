# GateFlow implementation plan

Incremental plan by milestones and vertical slices. Every slice is small, testable, integrated with
the previous ones and free of hardware dependencies until M5. The detailed rationale is in the
kickoff proposal ([docs/kickoff/KICKOFF_PROPOSAL.md](docs/kickoff/KICKOFF_PROPOSAL.md), section 3).

Status legend: **Done**, **Next**, **Planned**, **Gated** (needs a business decision first).

## Milestones

| Milestone | Business plan stage | Status |
|---|---|---|
| M1: Simulator core and priority engine | R1 | In progress (S1 done) |
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
| S2 | Realistic calls: access buffer target, call latency, no-shows, recalls, recovery, committed "prepare" window, planned lane schedules | **Next** |
| S3 | Baseline A' (FIFO + manual handling of urgent passengers), groups and families, assisted path, eligibility and anti-abuse rules | Planned |
| S4 | Disruptions and data quality: delays with notification time, gate changes, lane outages, stale or missing feeds, ground truth vs knowledge, hysteresis, stability metrics | Planned |
| S5 | Parallel batches (worker threads), sensitivity sweeps (k/N, K, lanes, load factor, show-up), HTML report with charts | Planned |
| S6 | Real schedules (OPDI import for VCE/TSF, seats mapping) and scenario library: normal, peak, disrupted, Mexico-like transfer hub | Planned (check data licences first) |
| S7 | Experiment C: lane-opening recommendations with an operator model | Planned |

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

## S2 (next): realistic call mechanics

Scope:
- access point and physical buffer between the access point and the lanes, with a target size;
- call when the buffer is below target, with response time drawn per passenger;
- no-shows (patience), second call, recovery window, reactivation limit `r`;
- committed "prepare" window of size `M`;
- planned lane schedules.

Acceptance criteria:
- With zero latency and no no-shows, outcomes equal S1 (regression).
- "Prepare" window churn is zero (property test).
- The report adds lanes idle while people are queueing, the missed-call rate and recalls.
- Golden files are regenerated and the change is explained in the changelog.

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
