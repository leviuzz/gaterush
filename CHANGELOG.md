# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Any change that alters simulated numbers
must be listed, together with the component versions it bumps.

## [Unreleased]

## [0.2.0] - 2026-11-21: Slice S2

Realistic call mechanics: the status quo is now a physical queue, and GateFlow policies run a
virtual queue with call-ahead, response times, missed calls, recalls, reactivation, a committed
prepare window and planned lane schedules.

### Simulated numbers change

- The headline numbers of S1 are not comparable with those of S2. The baseline is now a physical
  FIFO queue (ADR-015) and GateFlow policies pay for their call mechanics. The S2 reports compare
  `virtual-fifo` with the status quo (the call mechanics alone) and `priority-v0` with
  `virtual-fifo` (the prioritisation alone).
- With no response time, no absences, no call-ahead and no prepare window, the S2 model
  reproduces every S1 metric exactly (regression test against a fixture saved from S1, seeds 1-3).
- Golden files regenerated: three policies and three comparisons, new metrics and report
  sections.

### Added

- `@gateflow/queue-core` 0.1.0 (ADR-016):
  - `CheckpointQueue`, the deterministic queue state machine: tickets, prepare window, calls,
    second calls, no-shows, reactivation, expiry, chronological event listener;
  - policies as `selection` + `queue` operation, presets `fifo` 1.1.0 (physical queue),
    `virtual-fifo` 0.1.0 and `priority-v0` 0.2.0 (virtual queue, ADR-017 defaults);
  - unit tests, property tests with an independent overtake model, and a coverage test that keeps
    the properties from becoming vacuous.
- Scenario `single-checkpoint-staffed`: the demo day with a lane schedule that follows demand
  (93 lane-hours instead of 144).
- CLI option `--compare candidate:reference,...`.
- Property tests of the checkpoint model on random populations, lane schedules and policies.
- ADR-015 to ADR-020.

### Changed

- `@gateflow/priority-engine` 0.2.0 (engine version 0.2.0):
  - `EngineInput.selection` replaces `policy`; policies and presets moved to `queue-core`;
  - `aheadOfWaiting`: tickets committed ahead of the waiting list count in the FIFO wait, and
    CRITICAL means "cannot make it even if selected now, behind them" (ADR-019);
  - `validateNow` is exported.
- `@gateflow/sim-model` 0.2.0 (model version 0.2.0):
  - physical or virtual queue driven by `CheckpointQueue`, call-ahead, passenger response rule
    (ADR-018), recalls, no-shows, reactivation and new tickets;
  - planned lane schedules (closing lanes finish their passenger);
  - new outcomes (time to screening, call wait, standing time, calls, no-shows, reactivations,
    new tickets) and statistics (staffed lane time, idle lane time, standing queue);
  - event order at the same instant: lane change, end of service, presentation, timeout,
    arrival (ADR-020).
- `@gateflow/sim-scenarios` 0.2.0 (scenario schema 2, population generator 0.2.0):
  `checkpoint.laneSchedule` replaces `checkpoint.lanes`, `passengers.callResponse` is new, and
  version 1 files are rejected with a migration message. Existing random attributes are
  unchanged.
- `@gateflow/sim-metrics` 0.2.0 (results schema `gateflow.sim.results/2`, ADR-020): explicit
  comparison pairs, new call-mechanics and standing metrics, report sections "Call mechanics" and
  "Checkpoint operations", updated model limitations.
- `@gateflow/sim-cli` 0.2.0: default policies `fifo,virtual-fifo,priority-v0`; default
  comparisons add each priority policy against the FIFO policy with the same virtual queue.
- Scenarios `single-checkpoint-demo` and `single-checkpoint-moderate` migrated to schema 2 with
  six lanes all day (unchanged world).
- CI publishes 200-day reports for the three scenarios.

## [0.1.0] - 2026-11-21: Slice S1

First reproducible FIFO vs priority comparison, plus the repository foundations.

### Added

- Monorepo: pnpm workspaces, Turborepo, TypeScript 6 strict, ESLint 10 with determinism rules,
  Prettier, dependency-cruiser boundaries, Vitest 5, fast-check, GitHub Actions CI on Node 22 and
  24.
- `@gateflow/domain` 0.1.0: integer-millisecond time, segments, risk classes, deadline sources.
- `@gateflow/sim-kernel` 0.1.0 (kernel version 0.1.0):
  - MurmurHash3 stream derivation and xoshiro128** generator;
  - fdlibm ports of `ln` and `exp` (bit-identical to V8 on 3 million tested inputs);
  - distributions;
  - deterministic event calendar.
- `@gateflow/priority-engine` 0.1.0 (engine version 0.1.0):
  - FIFO-counterfactual assessment with UNVERIFIED, NORMAL, ATTENTION, URGENT and CRITICAL;
  - constrained earliest-deadline-first selection with a cap of k priority calls per N and an
    overtake bound K;
  - reason codes and the policy presets `fifo` 1.0.0 and `priority-v0` 0.1.0.
- `@gateflow/sim-model` 0.1.0 (model version 0.1.0): checkpoint virtual-queue simulation with
  conservation checks, validated against Erlang C and Little's law.
- `@gateflow/sim-scenarios` 0.1.0 (population generator 0.1.0, scenario schema 1):
  - strict YAML/JSON scenarios with provenance labels on every parameter;
  - canonical JSON hashing and an assumptions registry;
  - synthetic design-day schedule and passenger generation.
- `@gateflow/sim-metrics` 0.1.0:
  - experiment runner with common random numbers;
  - per-day and paired metrics (saved, lost, net, at-risk cohort, extra wait of non-prioritised
    passengers);
  - bootstrap confidence intervals;
  - `results.json` (schema `gateflow.sim.results/1`) and a Markdown report.
- `@gateflow/sim-cli` 0.1.0: `gateflow-sim run | validate | policies`, bundled with esbuild.
- Scenarios `single-checkpoint-demo` (congested morning peak) and `single-checkpoint-moderate`.
- Golden files for the demo scenario (seeds 1-3) in `packages/sim-metrics/test/golden`.
- Documentation: README, ARCHITECTURE, PRODUCT_REQUIREMENTS, IMPLEMENTATION_PLAN, DECISIONS
  (ADR-001 to ADR-014), CHANGELOG, and the kickoff proposal.

### Changed

- Acceptance criterion 4 of S1 (Erlang C validation) refined with control variates and
  simultaneous confidence intervals (ADR-012).

### Fixed

- CI timeouts on GitHub-hosted runners: long test loops now assert once instead of on every
  iteration, every package runs Vitest with an explicit 60 s per-test timeout, and `pnpm check`
  runs all Turborepo tasks (`--continue`) so that one failure does not hide others. Simulated
  numbers are unchanged.
