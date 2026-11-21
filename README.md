# GateFlow

GateFlow is a B2B platform for airport operators that orders access to a checkpoint (typically a
security filter) with waiting tickets. Passengers scan the boarding pass they already have, wait
freely and are called by public displays.

The calling order is not plain first-in, first-out. A **deterministic, explainable priority
engine** brings forward passengers who would miss their flight under FIFO but can still make it.
It does so within **declared, measurable fairness bounds**. GateFlow never changes security or
border procedures: it organises the flow before they start.

> **Status: slice S1 done.** This repository contains the simulation foundations: the priority
> engine, a reproducible discrete-event simulator and a CLI that compares FIFO with the priority
> policy. There is no operational system, API or user interface yet. See
> [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md).

> **All results in this repository are SIMULATED on synthetic assumptions.** They are not
> measurements and must not be presented as evidence of operational performance.

## Quick start

Prerequisites: Node.js 22 (see `.nvmrc`; Node 24 is also tested) and pnpm 10
(`corepack enable` installs the version pinned in `package.json`).

```bash
pnpm install
```

```bash
pnpm check
```

```bash
pnpm sim run --scenario scenarios/single-checkpoint-demo.yaml --seeds 1-200
```

The last command simulates 200 days with the FIFO baseline and priority policy v0, then writes
`out/single-checkpoint-demo/results.json` and `out/single-checkpoint-demo/report.md`.

Other commands:

```bash
pnpm sim validate --scenario scenarios/single-checkpoint-moderate.yaml
```

```bash
pnpm sim policies
```

```bash
pnpm sim --help
```

## What the simulator shows today

| Scenario (200 simulated days, SYNTHETIC) | Missed flights per day, FIFO | Missed flights per day, priority v0 | Net flights saved per day [95% CI] |
|---|---:|---:|---:|
| `single-checkpoint-demo` (congested morning peak) | 48.7 | 23.6 | 25.1 [23.6, 26.7] |
| `single-checkpoint-moderate` | 11.9 | 6.9 | 5.0 [4.3, 5.7] |

How to read these numbers:
- The benefit depends heavily on congestion.
- It is overstated in this first model version: calls are answered instantly, there are no
  no-shows, and the baseline does not include today's manual handling of urgent passengers.
- The full reports, with every assumption and limitation, are in
  [docs/reports/slice-1](docs/reports/slice-1).

## Repository layout

| Path | Content |
|---|---|
| `packages/domain` | Shared domain types and units |
| `packages/priority-engine` | Deterministic priority engine (pure) |
| `packages/sim-kernel` | Seeded RNG streams, deterministic math, distributions, event calendar (pure) |
| `packages/sim-model` | Checkpoint simulation driven by the engine (pure) |
| `packages/sim-scenarios` | Scenario schema, assumptions registry, synthetic population (pure) |
| `packages/sim-metrics` | Experiments, paired metrics, statistics, results and report (pure) |
| `apps/sim-cli` | `gateflow-sim` command-line interface |
| `scenarios/` | Scenario files |
| `docs/` | Kickoff proposal, generated reports |

## Documentation

- [PRODUCT_REQUIREMENTS.md](PRODUCT_REQUIREMENTS.md): vision, scope, requirements, constraints.
- [ARCHITECTURE.md](ARCHITECTURE.md): packages, dependency rules, determinism, engine, model.
- [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md): milestones, slices, acceptance criteria.
- [DECISIONS.md](DECISIONS.md): architecture and product decisions (ADRs).
- [CHANGELOG.md](CHANGELOG.md): notable changes, including any change to simulated numbers.
- [docs/kickoff/KICKOFF_PROPOSAL.md](docs/kickoff/KICKOFF_PROPOSAL.md): approved kickoff
  analysis (Italian).

## Engineering rules (short version)

- Production code in `packages/*` is pure and deterministic. Lint rules and dependency-cruiser
  reject `Math.random`, `Date`, implementation-approximated `Math` functions, Node built-ins and
  unexpected dependencies.
- Every model parameter in a scenario carries its source (`SYNTHETIC`, `LITERATURE`,
  `AIRPORT_PROVIDED`, `MEASURED`). Reports list them all.
- A feature is done only when its behaviour is verified by automated tests.
- Any change that alters simulated numbers requires:
  - regenerating the golden files
    (`UPDATE_GOLDEN=1 pnpm --filter @gateflow/sim-metrics test`);
  - a version bump of the affected component;
  - a changelog entry.

## License

Private repository. No license is granted at this stage.
