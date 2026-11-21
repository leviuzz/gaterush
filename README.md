# GateFlow

GateFlow is a B2B platform for airport operators that orders access to a checkpoint (typically a
security filter) with waiting tickets. Passengers scan the boarding pass they already have, wait
freely and are called by public displays.

The calling order is not plain first-in, first-out. A **deterministic, explainable priority
engine** brings forward passengers who would miss their flight under FIFO but can still make it.
It does so within **declared, measurable fairness bounds**. GateFlow never changes security or
border procedures: it organises the flow before they start.

> **Status: slices S1 to S3 done.** This repository contains the simulation foundations:
> - the priority engine;
> - the queue state machine that the operational product will share;
> - a reproducible discrete-event simulator of a checkpoint. It runs either as today's physical
>   queue, with or without staff calling closing flights, or as a GateFlow virtual queue with
>   realistic call mechanics, groups and assisted passengers;
> - a CLI that compares policies on the same simulated passengers.
>
> There is no operational system, API or user interface yet. See
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

The last command simulates 200 days with four policies, then writes
`out/single-checkpoint-demo/results.json` and `out/single-checkpoint-demo/report.md`:
- `fifo`: today's physical queue without intervention (policy A);
- `fifo-manual`: today's physical queue with staff calling the flights that close within 20
  minutes (policy A', an idealised version of today's manual handling);
- `virtual-fifo`: the GateFlow virtual queue served in FIFO order;
- `priority-v1`: the GateFlow virtual queue with priority policy v1.

Also available: `priority-v0` (the S2 policy) and `priority-v1-strict` (v1 with the
late-presentation rule).

Other commands:

```bash
pnpm sim validate --scenario scenarios/single-checkpoint-staffed.yaml
```

```bash
pnpm sim run --scenario scenarios/single-checkpoint-strategic.yaml --seeds 1-50 --policies fifo,fifo-manual,priority-v1,priority-v1-strict
```

```bash
pnpm sim policies
```

```bash
pnpm sim --help
```

## What the simulator shows today

| Scenario (200 simulated days, SYNTHETIC) | Missed flights per day: A, no intervention | A', staff call closing flights | GateFlow, priority v1 | Net saved by v1 vs A' [95% CI] | Mean time standing in a queue: today / GateFlow |
|---|---:|---:|---:|---:|---:|
| `single-checkpoint-demo` (congested morning peak) | 55.1 | 14.7 | 18.0 | -3.3 [-4.1, -2.5] | 3.1 / 0.6 min |
| `single-checkpoint-moderate` | 14.3 | 7.2 | 9.4 | -2.3 [-2.7, -1.9] | 1.3 / 0.5 min |
| `single-checkpoint-staffed` (lanes follow demand) | 65.9 | 17.8 | 23.0 | -5.2 [-6.2, -4.1] | 3.6 / 0.7 min |

How to read these numbers:
- Today's manual handling, idealised (A'), is the benchmark that matters: staff who call closing
  flights every five minutes remove 50-75% of the misses.
- GateFlow v1 saves 5 to 43 flights per day against a queue without intervention, and people
  stop standing in line. It still misses 2.3 to 5.2 flights per day more than A'.
  **On these assumptions GateFlow cannot claim to catch more flights than an attentive staff.**
- The gap is last-minute passengers. Staff take them straight to a lane, while the virtual queue
  makes them wait several minutes. The proposed slice S4 (fast track and staff escalation)
  addresses exactly this; see [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md).
- Non-prioritised passengers wait 0.02 to 0.18 minutes longer on average, and at most 0.07% of
  them more than 5 minutes.
- The numbers rest on synthetic assumptions: response times, missed calls and today's practice
  must be measured. Reports with every assumption and limitation:
  [docs/reports/slice-3](docs/reports/slice-3/README.md). Earlier reports, on simpler models,
  remain in [docs/reports/slice-2](docs/reports/slice-2) and
  [docs/reports/slice-1](docs/reports/slice-1).

## Repository layout

| Path | Content |
|---|---|
| `packages/domain` | Shared domain types and units |
| `packages/priority-engine` | Deterministic priority engine (pure) |
| `packages/queue-core` | Queue state machine and policies, shared by simulator and product (pure) |
| `packages/sim-kernel` | Seeded RNG streams, deterministic math, distributions, event calendar (pure) |
| `packages/sim-model` | Checkpoint simulation: physical or virtual queue, calls, lane schedules (pure) |
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
