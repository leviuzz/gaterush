# GateFlow

GateFlow is a B2B platform for airport operators that orders access to a checkpoint (typically a
security filter) with waiting tickets. Passengers scan the boarding pass they already have, wait
freely and are called by public displays.

The calling order is not plain first-in, first-out. A **deterministic, explainable priority
engine** brings forward passengers who would miss their flight under FIFO but can still make it.
It does so within **declared, measurable fairness bounds**. GateFlow never changes security or
border procedures: it organises the flow before they start.

> **Status: slices S1 to S7 done.** This repository contains the simulation foundations:
> - the priority engine;
> - the queue state machine that the operational product will share;
> - a reproducible discrete-event simulator of a checkpoint. It runs either as today's physical
>   queue, with or without staff calling closing flights, or as a GateFlow virtual queue with
>   realistic call mechanics, groups and assisted passengers. Days can include flight delays,
>   gate changes, lane outages and flight feed outages: the system decides on what it knows,
>   and outcomes are judged on what really happens;
> - a CLI that compares policies on the same simulated passengers, runs sensitivity sweeps, uses
>   every CPU and writes JSON, Markdown and HTML reports with charts;
> - scenarios that take their flights from the airport's own flight list (a CSV file), with the
>   source and licence of every datum printed in every report, and a library of synthetic
>   VCE-like, TSF-like and MX-like checkpoints.
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

The last command simulates 200 days with four policies on every CPU (about 15 seconds on four
cores), then writes `results.json`, `report.md` and `report.html` (a page with charts) in
`out/single-checkpoint-demo/`:
- `fifo`: today's physical queue without intervention (policy A);
- `fifo-manual`: today's physical queue with staff calling the flights that close within 20
  minutes (policy A', an idealised version of today's manual handling);
- `virtual-fifo`: the GateFlow virtual queue served in FIFO order;
- `priority-v3`: the GateFlow virtual queue with priority policy v3: the fast track (priority
  calls go to the next free lane), no priority on flight data older than 60 minutes, and a
  3-minute hysteresis that keeps risk classes from flapping.

Also available: `priority-v0` (S2), `priority-v1` (S3, without the fast track),
`priority-v1-strict` (v1 with the late-presentation rule) and `priority-v2` (S4, v3 without the
data-quality rules).

Other commands:

```bash
pnpm sim validate --scenario scenarios/single-checkpoint-staffed.yaml
```

```bash
pnpm sim run --scenario scenarios/single-checkpoint-disrupted.yaml --seeds 1-50 --policies fifo,fifo-manual,virtual-fifo,priority-v2,priority-v3
```

```bash
pnpm sim sweep --spec sweeps/sensitivity-demo.yaml
```

```bash
pnpm sim run --scenario scenarios/mx-like-transfer-hub.yaml --seeds 1-50
```

```bash
pnpm sim flights --scenario scenarios/single-checkpoint-demo.yaml --out out/demo-flights.csv
```

The last command writes the design day of a scenario as a flight list
(`gateflow.flights/1`). An airport can send its own flights in that format: see
[docs/data-request](docs/data-request/README.md) for what the simulator needs, and
[scenarios/flights](scenarios/flights/README.md) for the format.

Each airport has a configuration file in `airports/` with all its parameters: lanes, throughput,
walking times, passenger behaviour, GateFlow settings and fairness target per checkpoint. A
scenario names the airport and the checkpoint and gives only its day. See
[airports/README.md](airports/README.md).

```bash
pnpm sim policies
```

```bash
pnpm sim --help
```

## What the simulator shows today

| Scenario (200 simulated days, SYNTHETIC) | Missed flights per day: A, no intervention | A', staff call closing flights | GateFlow, priority v3 | Net saved by v3 vs A' [95% CI] | Mean time standing in a queue: today / GateFlow |
|---|---:|---:|---:|---:|---:|
| `single-checkpoint-demo` (congested morning peak) | 55.1 | 14.7 | 11.5 | 3.2 [2.4, 4.0] | 3.1 / 0.6 min |
| `single-checkpoint-moderate` | 14.3 | 7.2 | 5.6 | 1.5 [1.2, 1.9] | 1.3 / 0.5 min |
| `single-checkpoint-staffed` (lanes follow demand) | 65.9 | 17.8 | 16.6 | 1.2 [0.1, 2.2] | 3.6 / 0.7 min |
| `single-checkpoint-disrupted` (delays, gate changes, lane and feed outages) | 47.8 | 12.4 | 10.8 | 1.6 [0.7, 2.3] | 3.3 / 0.6 min |

The scenario library of S7 (synthetic flight lists sized from SAVE's published 2025 traffic,
lanes planned with a stated rule):

| Scenario (200 simulated days, SYNTHETIC) | People per day | A | A' | GateFlow, priority v3 | Net saved by v3 vs A' [95% CI] |
|---|---:|---:|---:|---:|---:|
| `vce-like-normal-day` (departures, average day) | 16,623 | 11.5 | 10.9 | 10.9 | 0.0 [-0.1, 0.1] |
| `vce-like-peak-day` (summer peak, 12 lanes at most) | 21,792 | 25.0 | 18.8 | 18.6 | 0.2 [-0.1, 0.6] |
| `vce-like-disrupted-day` | 21,792 | 20.0 | 14.3 | 14.1 | 0.3 [-0.1, 0.7] |
| `tsf-like-peak-day` (low-cost base, one morning bank) | 5,981 | 25.8 | 0.0 | 2.3 | **-2.3** [-3.1, -1.6] |
| `mx-like-transfer-hub` (transfer screening, tight connections) | 4,473 | 131.6 | 96.7 | 87.9 | **8.7** [7.2, 10.4] |

How to read these numbers:
- Today's manual handling, idealised (A'), is the benchmark that matters: staff who call closing
  flights every five minutes remove 50-75% of the misses.
- On congested but manageable days, GateFlow v3 catches 1 to 3 more flights per day than A', with
  disruptions too, and people stop standing in line. The difference comes from the fast track: a
  priority call is made next and the passenger goes to the next free lane, which needs a
  fast-track entry to the lanes.
- **The advantage holds in a band of conditions** (sensitivity sweeps):
  - in overload (one lane fewer, 10% more passengers, passengers arriving later), A' saves far
    more flights, because staff overtake passengers without limit;
  - GateFlow keeps every passenger within K = 30 overtakes, the largest bound within its
    fairness criterion. Matching A' in overload would need K = 120 and would delay 13% of the
    other passengers by more than 5 minutes: a choice for the airport;
  - the virtual queue must also be tuned to how fast passengers answer a call (3 minutes
    instead of 75 seconds needs a longer call-ahead).
- **The kind of checkpoint decides the value case** (S7 library):
  - at the transfer screening of a hub, connecting passengers arrive in waves with mixed
    deadlines, and GateFlow catches 8.7 more flights per day than A';
  - at a VCE-like departures checkpoint whose lanes follow demand, the two are level;
  - at a low-cost base with a single morning bank, staff calling the closing flights catches
    everyone and A' is better (2.3 flights per day).
- **At a departures checkpoint, capacity decides.** On the VCE-like peak day the margin over A'
  grows from nothing to 2-35 flights per day with 1 to 3 more seconds of screening per person,
  and to 23 with one lane fewer. Where a real checkpoint sits depends on its lanes, its throughput
  and its measured waits: the data to ask the airport for.
- Non-prioritised passengers wait 0.03 to 0.24 minutes longer on average on the demo days; at
  most 0.10% of them more than 5 minutes. At the hub and at the low-cost base, 0.5-0.8% are
  delayed by more than 5 minutes with K = 30, so the bound is to be set for each checkpoint. Risk
  classes do not flap.
- GateFlow gives no priority on flight data older than 60 minutes. With a reasonably reliable
  flight feed that costs nothing; with long outages it ends level with A'.
- The numbers rest on synthetic assumptions. Response times, missed calls, today's practice,
  lane throughput and the reliability of the flight feed must be measured. Public flight data
  (OPDI) is published for non-commercial use only and is not used (ADR-035).
- Reports with every assumption, data source and limitation, and pages with charts:
  - the library: [docs/reports/slice-7](docs/reports/slice-7/README.md);
  - the demo days: [docs/reports/slice-6](docs/reports/slice-6/README.md);
  - earlier reports: [docs/reports](docs/reports).

## Repository layout

| Path | Content |
|---|---|
| `packages/domain` | Shared domain types and units |
| `packages/priority-engine` | Deterministic priority engine (pure) |
| `packages/queue-core` | Queue state machine and policies, shared by simulator and product (pure) |
| `packages/sim-kernel` | Seeded RNG streams, deterministic math, distributions, event calendar (pure) |
| `packages/sim-model` | Checkpoint simulation: physical or virtual queue, calls, lane schedules, disruptions (pure) |
| `packages/sim-scenarios` | Scenario schema, assumptions registry, synthetic population (pure) |
| `packages/sim-metrics` | Experiments, paired metrics, statistics, results and report (pure) |
| `apps/sim-cli` | `gateflow-sim` command-line interface |
| `airports/` | Airport configurations: the parameters of each airport and checkpoint ([guide](airports/README.md)) |
| `scenarios/` | Scenario files, including the S7 library |
| `scenarios/flights/` | Flight lists (CSV) and the generator of the synthetic ones |
| `sweeps/` | Sensitivity sweep specifications |
| `docs/` | Kickoff proposal, data request for airports, generated reports |

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
