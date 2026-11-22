# GateFlow

GateFlow is a B2B platform for airport operators that orders access to a checkpoint (typically a
security filter) with waiting tickets. Passengers scan the boarding pass they already have, wait
freely and are called by public displays.

The calling order is not plain first-in, first-out. A **deterministic, explainable priority
engine** brings forward passengers who would miss their flight under FIFO but can still make it.
It does so within **declared, measurable fairness bounds**. GateFlow never changes security or
border procedures: it organises the flow before they start.

> **Status: M1 done (S1 to S8); M2: the Simulator Studio (S9) and the replay of a day (S11); M3,
> the product an airport installs: its operational core (S12), boarding passes (S13), the kiosk
> and the passenger's page (S14), the queue's life cycle with staff who sign in and the lane
> station (S15).**
> This repository contains the simulation foundations:
> - the priority engine;
> - the queue state machine that the operational product will share;
> - a reproducible discrete-event simulator of a checkpoint. It runs either as today's physical
>   queue, with or without staff calling closing flights, or as a GateFlow virtual queue with
>   realistic call mechanics, groups and assisted passengers. Days can include flight delays,
>   gate changes, lane outages and flight feed outages: the system decides on what it knows,
>   and outcomes are judged on what really happens. Extra lanes can open during the day, by
>   today's supervisor or on GateFlow's recommendation, within the lanes and the staff on call
>   of each checkpoint;
> - a CLI that compares policies on the same simulated passengers, runs sensitivity sweeps, uses
>   every CPU and writes JSON, Markdown and HTML reports with charts;
> - scenarios that take their flights from the airport's own flight list (a CSV file), with the
>   source and licence of every datum printed in every report, one configuration file per
>   airport, and a library of synthetic VCE-like, TSF-like and MX-like checkpoints;
> - **GateFlow Simulator Studio**: the same simulator in one HTML page that runs offline, on a
>   phone too, and never connects to the network. It replays any simulated day minute by minute,
>   with the reason the engine gave for every call and each passenger's day under both policies.
>
> - **GateFlow API** (operational core): a checkpoint's day on the simulator's own queue, on
>   PostgreSQL, with one writer per checkpoint, idempotent commands and a hash-chained log.
> - **The kiosk and the passenger's page**, served by the API: a passenger scans a boarding pass
>   and gets a number, on screen with a QR code and on paper, then follows it on a phone. In
>   Italian, English and Spanish; nothing of the pass is kept.
>
> - **The lane station**: staff sign in, call the next passenger, validate tickets by QR code,
>   boarding pass or number, act on absences and reviews, and issue manual tickets.
>
> Displays (S16) and the supervisor's console (S17) come next; staff sign in with local passwords
> until the pilot brings the airport's identity provider. See
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

### Simulator Studio

```bash
pnpm --filter @gateflow/studio build
```

Then open `apps/studio/dist/gateflow-studio.html` in a browser: one file, no server, no network.
Choose a checkpoint and a day, change a what-if setting (lanes, screening time, staff on call,
GateFlow's target wait...), choose the policies and simulate. The page shows the CLI's report,
compares runs, and saves the results and the scenario: the CLI gives the same results from that
scenario. An airport's own files can be added; they stay in the browser.

Then replay a day of the run: the typical day (the median one), the best, the worst or any other.
The replay shows both policies at the same moment, the people standing, the flights missed and
the lanes open over the day, every call with the engine's reason, and the passengers saved, lost,
or delayed by priority calls. Choose a passenger to follow their day under both policies, call by
call. The page gives the trace's fingerprint and the CLI command that gives the same one.

### GateFlow API, kiosk and ticket page

It needs PostgreSQL (16 or later). With `DATABASE_URL` set to an empty database:

```bash
pnpm build
```

```bash
node apps/api/dist/gateflow-api.mjs seed --scenario scenarios/vce-like-peak-day.yaml
```

```bash
node apps/api/dist/gateflow-api.mjs serve --port 8080
```

`seed` migrates the database and adds demo data: the VCE-like airport, its checkpoint run with
GateFlow priority v3, and the day's flights. It prints the checkpoint's id. `serve` answers on
`/v1` and serves the screens, on this machine only: add `--host 0.0.0.0` for kiosks and phones
on the network, behind TLS in any real setting. To set up a kiosk, add it to the checkpoint:

```bash
node apps/api/dist/gateflow-api.mjs device add --checkpoint <checkpoint id> --kind kiosk --name "Kiosk 1"
```

This prints the kiosk's token once, and the address to open on the kiosk:
`http://<server>:8080/kiosk/<checkpoint id>#device=<token>`. The kiosk keeps the token and
takes it off the address; `device revoke --id <device id>` stops it.

- Add `?lang=it`, `en` or `es` to choose the kiosk's language.
- Add `&print=auto` to print every new ticket; for silent printing, start the kiosk's Chrome
  with `--kiosk-printing`.

A barcode scanner that types like a keyboard reads boarding passes into the kiosk. Without one,
paste a pass's code, or on a demo airport press "Use a sample boarding pass". The number comes
with a QR code to the passenger's page, `/t/<reference>`, which follows the ticket on a phone.

Staff sign in at the lane station, `/lane/<checkpoint id>`. Add a member of staff with a role
(operator, supervisor or admin) and, if they work at some checkpoints only, those:

```bash
node apps/api/dist/gateflow-api.mjs user add --airport vce-like --login m.rossi --role supervisor
```

This prints the member's password once. `user password --login <login>` gives a new one and
`user disable --login <login>` ends their access; both end their sessions at once.

The endpoints:
- `POST /v1/checkpoints/{id}/scans`: a kiosk scans a boarding pass (with its token). The answer
  is a ticket, the same ticket again, or a reason. The pass is read in memory and never stored.
  With `party` (a ticket's reference), the pass joins that number: people travelling together
  take one number;
- `POST /v1/auth/sign-in`, `GET /v1/auth/me`, `POST /v1/auth/sign-out`: staff sign in; the
  session is a cookie the page cannot read. Every staff route below needs one, of the right role;
- `POST /v1/checkpoints/{id}/tickets`: issue a manual ticket, with its reason and party size;
- `POST /v1/checkpoints/{id}/calls`: call the next passenger;
- `POST /v1/checkpoints/{id}/admissions`: admit a passenger at the access point;
- `GET /v1/checkpoints/{id}/queue`: the day's tickets;
- `GET /v1/checkpoints/{id}/audit/verify`: check the hash chain of the log;
- `GET /v1/tickets/{ref}`: the passenger's view of a ticket;
- `POST /v1/checkpoints/{id}/tickets/{ticket}/recall`, `no-show`, `reactivate`, `review`,
  `resolve`, `cancel`: staff actions, as the ticket's state allows;
- `GET /v1/devices/me` and `GET /v1/checkpoints/{id}/demo-flights`: for kiosks.

Send an `Idempotency-Key` header with each command. The OpenAPI document is at
`/v1/openapi.json`. The API's tests (`pnpm test`) start a throwaway PostgreSQL from the binaries
of the machine, or use `DATABASE_URL`. The screens' tests run the product in Chromium:
`pnpm --filter @gateflow/web run test:e2e` after `pnpm build`.

### Command line

The command above, `pnpm sim run`, simulates 200 days with four policies on every CPU (about 15 seconds on four
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

Any policy can also open extra lanes during the day (S8), when the checkpoint has staff on call:
- `<policy>@reactive`: a supervisor opens a lane when the queue shows more than 10 minutes of
  waiting (today's practice);
- `<policy>@predict`: GateFlow recommends lanes from a forecast of arrivals, and the duty
  manager follows 4 recommendations out of 5.

```bash
pnpm sim run --scenario scenarios/mx-like-transfer-hub.yaml --policies fifo,fifo-manual,fifo-manual@reactive,fifo-manual@predict,priority-v3,priority-v3@predict
```

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

Each airport has a configuration file in `airports/` with all its parameters: lanes, roster and
staff on call, throughput, walking times, passenger behaviour, GateFlow settings and fairness
target per checkpoint. A scenario names the airport and the checkpoint and gives only its day.
See [airports/README.md](airports/README.md).

```bash
pnpm sim trace --scenario scenarios/mx-like-transfer-hub.yaml --seed 5
```

`trace` writes every event of one day for two policies (by default the first and the last of
`--policies`), on the same passengers, into `trace.json`. It prints the day in numbers and the
trace's fingerprint; the Studio replays the same trace.

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

Extra lanes during the day (S8: each checkpoint has more lanes than its roster plans, and staff
on call for 1 or 2 of them):

| Scenario (200 simulated days, SYNTHETIC) | A' | A' + supervisor | A' + GateFlow lanes | GateFlow as a whole: v3 + GateFlow lanes | GateFlow as a whole vs A' + supervisor [95% CI] | Extra lane-hours per day: supervisor / GateFlow |
|---|---:|---:|---:|---:|---:|---:|
| `vce-like-peak-day` | 18.8 | 18.7 | 18.7 | 18.4 | +0.4 [0.0, 0.7] | 0.1 / 0.3 |
| `vce-like-disrupted-day` | 14.3 | 14.0 | 13.9 | 13.6 | +0.4 [0.1, 0.8] | 0.2 / 0.5 |
| `tsf-like-peak-day` | 0.0 | 0.0 | 0.0 | 0.1 | -0.1 [-0.2, -0.1] | 1.1 / 1.3 |
| `mx-like-transfer-hub` | 96.7 | 81.5 | 64.5 | 61.8 | **+19.7** [17.8, 21.6] | 0.6 / 1.8 |

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
- **Extra lanes at the right time** (S8):
  - at the hub, GateFlow sees the next wave coming and opens the extra lane before it: 32 fewer
    missed flights per day than the plan alone, against 15 for a supervisor who reacts to the
    queue. With the priority calls, GateFlow as a whole catches 19.7 more flights per day than
    today's practice with a supervisor, for 1.3 more lane-hours per day (about 2.5% of the 49.5
    staffed);
  - at the low-cost base, the lanes close most of the gap of S7 (v3 alone: 2.3 more misses than
    A'; with GateFlow's lanes: 0.1), and the 90th percentile of the wait falls from 15 to
    4 minutes;
  - where the roster follows demand (VCE-like days), extra lanes are rarely needed: 0.3-0.5
    lane-hours per day on the peak days, with little change in missed flights. On a day harder
    than planned (screening 8% slower) they are the safety valve: 33.1 missed flights per day
    with the plan alone, 22.2 with a supervisor, 20.9 with GateFlow's lanes;
  - each extra lane-hour saves 35 to 180 hours of passenger waiting;
  - GateFlow's target wait (10 minutes by default) trades lane-hours for flights, and is set for
    each checkpoint.
- Reports with every assumption, data source and limitation, and pages with charts:
  - extra lanes: [docs/reports/slice-8](docs/reports/slice-8/README.md);
  - the library: [docs/reports/slice-7](docs/reports/slice-7/README.md);
  - the demo days: [docs/reports/slice-6](docs/reports/slice-6/README.md);
  - earlier reports: [docs/reports](docs/reports).

## Repository layout

| Path | Content |
|---|---|
| `packages/domain` | Shared domain types and units |
| `packages/bcbp` | IATA boarding passes: parser (never the name), encoder, synthetic passes, flight date, leg for a checkpoint (pure) |
| `packages/contracts` | The API's request and answer schemas (Zod) and its OpenAPI document (pure) |
| `packages/i18n` | Every text of the passengers' screens in Italian, English and Mexican Spanish (pure) |
| `packages/operations` | A live checkpoint's day on the simulator's queue, rebuilt from its command log (pure) |
| `packages/priority-engine` | Deterministic priority engine (pure) |
| `packages/queue-core` | Queue state machine, policies and lane modes, shared by simulator and product (pure) |
| `packages/sim-kernel` | Seeded RNG streams, deterministic math, distributions, event calendar (pure) |
| `packages/sim-model` | Checkpoint simulation: physical or virtual queue, calls, lane schedules, extra lanes, disruptions (pure) |
| `packages/sim-scenarios` | Scenario schema, airport configurations, assumptions registry, synthetic population, arrival forecast (pure) |
| `packages/sim-metrics` | Experiments, paired metrics, statistics, results and report (pure) |
| `packages/sim-trace` | The trace of one day: every event, replay views, the explanation of every call (pure) |
| `packages/studio-core` | What the Studio adds in the browser: SHA-256, files, library, what-if settings, comparison of runs, traces (pure) |
| `apps/api` | `gateflow-api`: the operational core on PostgreSQL (Fastify, Drizzle); serves the screens |
| `apps/web` | The product's screens: the kiosk and the passenger's ticket page (React) |
| `apps/sim-cli` | `gateflow-sim` command-line interface |
| `apps/studio` | GateFlow Simulator Studio: the simulator in one offline HTML page |
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
