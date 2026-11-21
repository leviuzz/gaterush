# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Any change that alters simulated numbers
must be listed, together with the component versions it bumps.

## [Unreleased]

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
