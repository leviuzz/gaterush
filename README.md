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
> station (S15), the displays (S16), the supervisor's console (S17), the digital twin (S18) and
> simulations through the API (S19); M4, the operations console and a preview of Predict: the
> day's overview, checked against the log (S20), forecasts of the next 90 minutes measured
> against the simulator (S21), and lane recommendations with the supervisor's decision and their
> outcome (S22), measured in the simulator (S22.3) and on a day harder than planned, which GateFlow
> knows only from the queue (S22.4), with a console that measures what the lanes screen today
> (S22.5, in progress); the figures for the pitch on one page, each read from its report
> ([docs/pitch](docs/pitch/README.md)).**
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
>   boarding pass or number, act on absences and reviews, and issue manual tickets. People
>   travelling together take one number at the kiosk, infants on a parent's pass included.
> - **The displays of the hall**: the numbers called and the numbers to get ready, live by
>   server-sent events; a display that loses the server says so, and catches up when it is back.
>
> - **The modes of a checkpoint** (S17, part 1): a supervisor pauses the calls, or declares an
>   emergency that stops calls, kiosks and the call timers, and on resuming may announce the
>   prepare window again in order of arrival; displays, kiosks, stations and phones say so at once.
> - **The supervisor's console** (S17): the modes of a checkpoint (a pause, an emergency that
>   stops calls, kiosks and the call timers, resuming in the same order or in order of arrival),
>   moving a passenger up or calling one now with a coded reason, the lanes open, versioned
>   policies activated from the next service day, and the day's audit with who, what and why.
>
> - **The digital twin** (S18): the simulator drives the live system at an accelerated time. A
>   scenario's simulated day is played through the product's own commands to a checkpoint of its
>   own, and the live system calls the same numbers in the same order as the offline simulator,
>   checked call by call; the demo page `/demo` plays it, on the product's own screens.
> - **Simulations through the API** (S19): an airport's analysts save its scenarios and ask the
>   server for runs, simulated on worker threads, with their history and their exports; a run is
>   reproducible from its manifest and says so. The Studio, served by GateFlow at `/sim`, saves
>   its runs, and GateFlow checks it finds the page's results.
>
> - **The operations overview** (S20): the supervisor's console opens with the day's figures,
>   waits counted as the simulator counts them, people at risk, lanes, a fairness monitor, flight
>   data and alerts, checked on demand against a replay of the day's log.>
> - **GateFlow Predict, a preview** (S21): from what the live system knows now, the arrivals, the
>   people not yet admitted and the wait of a party arriving in 15, 30, 60 and 90 minutes, each the
>   median of simulated paths with a band calibrated to hold 8 outcomes in 10; the backtest
>   measures them against the full simulator's days, horizon by horizon.
> - **Lane recommendations** (S22): when the forecast puts the wait above 10 minutes within the
>   hour, GateFlow recommends opening lanes, saying why, how soon, the interval and the expected
>   benefit; it recommends closing a lane beyond the plan that the hour does not need. The
>   supervisor accepts, postpones or declines with a reason; GateFlow records what happened. All
>   three are in the checkpoint's log; one at a time, none within 15 minutes of the previous one.
>
> Staff sign in with local passwords until the pilot brings the airport's identity provider. See
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

The build also writes `gateflow-studio.server.html`, the page GateFlow serves at `/sim` (S19):
the same Studio, which can save its runs to the server and open the airport's.

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

A display of the hall (S16) is set up the same way, with `--kind display`: open
`http://<server>:8080/display/<checkpoint id>?lang=it#device=<token>` on the screen, in a browser
in full-screen or kiosk mode. It shows the numbers called and the numbers to get ready, in its
language and in English, as the server sends them; without news from the server for 30 seconds
it says it is not up to date, and after 2 minutes it asks passengers to follow the staff.

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

Supervisors and administrators use the console, `/supervisor/<checkpoint id>`: the day's
overview (waiting now, waits of the last hour and the day, people at risk, lanes, fairness, flight
data, alerts, and the check of every figure against the log), GateFlow's lane recommendations
(accept, ask again in 10 minutes, or decline with a reason; the day's, with their outcomes), the
forecast of the next 90 minutes (a SIMULATED preview, from the scenario the checkpoint was seeded
from), the mode of the
checkpoint, the lanes open, moving a passenger up or calling one now with a reason, the policies
(an administrator activates a version from the next service day) and the day's audit.

**The digital twin** (S18) plays a scenario's simulated day through the live system, as fast as
the server goes or at a chosen speed, to a new checkpoint of the scenario's airport, and checks
every call against the offline simulator's:

```bash
node apps/api/dist/gateflow-api.mjs twin --scenario scenarios/single-checkpoint-disrupted.yaml --seed 1
```

It prints the twin's checkpoint, its progress and the verdict ("SAME ORDER", or the first
difference, with exit code 1); `--policy virtual-fifo`, `--speed 60` (times real time) and
`--until 12:00` vary it. For demos, start the server with the scenarios the twin may play:

```bash
node apps/api/dist/gateflow-api.mjs serve --port 8080 --twin scenarios
```

An administrator of the airport (synthetic airports only) opens `/demo`: a scenario of the
airport, a policy, a day and a speed; the virtual clock, the check against the simulator, the
board and the latest calls; and links to the twin's own display, lane station and console, which
only show. Its data are SIMULATED, on checkpoints of their own that staff and kiosks cannot
write to.

**Simulations through the API** (S19). An analyst (`user add --role analyst`; administrators
may simulate too) saves the airport's scenarios and asks for runs; `serve` simulates the runs
waiting on worker threads (`--sim-workers <n>`, all the processors but one by default, 0 to leave
them to another server). The seed saves its scenario; another one is saved with:

```bash
node apps/api/dist/gateflow-api.mjs scenario add --airport vce-like --scenario scenarios/vce-like-peak-day.yaml
```

A run from the CLI's settings, then its results, as `gateflow-sim run` writes them but for the
generator and the revision:

```bash
curl -b jar.txt -X POST http://127.0.0.1:8080/v1/simulations -H 'Content-Type: application/json' \
  -d '{"settings":{"scenarioHash":"sha256:...","seeds":"1-200","policies":["fifo","fifo-manual","priority-v3"]}}'
curl -b jar.txt http://127.0.0.1:8080/v1/simulations/<run>/results > results.json
```

`POST /v1/simulations/<run>/reproduce` computes it again from its manifest and says whether the
results are the same. **The Studio at `/sim`** is the same page as the offline one, plus a
GateFlow panel: sign in, save the run on screen (GateFlow simulates it again and says whether it
found the page's results), and open the airport's runs. It connects to this server only. Every
result is SIMULATED.

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
- `GET /v1/checkpoints/{id}/queue`: the day's tickets (`?inPlay=true`: those still in play);
- `GET /v1/checkpoints/{id}/audit/verify`: check the hash chain of the log;
- `GET /v1/tickets/{ref}`: the passenger's view of a ticket;
- `POST /v1/checkpoints/{id}/tickets/{ticket}/recall`, `no-show`, `reactivate`, `review`,
  `resolve`, `cancel`: staff actions, as the ticket's state allows;
- `GET /v1/devices/me` and `GET /v1/checkpoints/{id}/demo-flights`: for kiosks.
- `GET /v1/checkpoints/{id}/display`: a display's stream of server-sent events (S16), with its
  token: the board after each command and the calls since the previous message; `Last-Event-ID`
  resumes it without losing a call.
- `GET /v1/checkpoints/{id}/stream`: the lane stations' stream, with a staff session: a message
  whenever the queue changes.
- `POST /v1/checkpoints/{id}/mode`: a supervisor sets the mode of the checkpoint (S17): `NORMAL`,
  `FIFO_ONLY`, `PAUSED` or `EMERGENCY`, and on resuming `reset` to announce the prepare window
  again in order of arrival. While paused or in an emergency, `calls` answers 409
  `CALLS_PAUSED`; in an emergency, scans and manual tickets answer 409 `EMERGENCY`.
- `GET /v1/checkpoints/{id}/kiosk`: a kiosk's stream of the mode, with its token.
- `POST /v1/checkpoints/{id}/tickets/{ticket}/boost` and `call-now`, with a coded `reason`: a
  supervisor puts a waiting ticket in the prepare window at once, or calls a ticket at once
  (S17). Counted apart from the engine's priority calls; never in `FIFO_ONLY` or an emergency.
- `POST /v1/checkpoints/{id}/lanes`: a supervisor sets the lanes open for the rest of the day.
- `GET /v1/checkpoints/{id}/audit`: the day's log as people read it (`day`, `number`, `before`,
  `limit`); `GET /v1/checkpoints/{id}/policy`: today's policy, the next day's, the versions.
- `POST /v1/checkpoints/{id}/policy/versions` and `/policy/activations`: an administrator
  publishes a version of a policy, and activates one from the next service day.
- `GET /v1/checkpoints/{id}/overview`: the day's figures for supervisors (S20);
  `GET /v1/checkpoints/{id}/overview/verify` replays the day's log and compares every figure and
  every ticket with the current state.
- `GET /v1/checkpoints/{id}/forecast`: GateFlow Predict, a preview (S21): arrivals, people not yet
  admitted and the wait at 15, 30, 60 and 90 minutes, with their bands, SIMULATED from the days of
  the checkpoint's scenario; 409 `NO_SCENARIO` when the checkpoint names none.
- `GET /v1/checkpoints/{id}/advice`: GateFlow's lane recommendations of the day (S22), the latest
  first, each with its reason, lead time, interval, expected benefit, decision and outcome, and
  the rule; `POST /v1/checkpoints/{id}/advice/{adviceId}/decision` (`ACCEPT`, `POSTPONE`, or
  `DECLINE` with `NO_STAFF`, `NOT_NEEDED` or `OTHER`): 404 `UNKNOWN_ADVICE`, 409
  `ADVICE_NOT_OPEN` once decided or expired. GateFlow reviews every 5 minutes (with `serve`'s
  timers) and when the lanes are set; the twin's checkpoints at their virtual time.
- `GET /v1/twin/options`, `GET /v1/twin`, `POST /v1/twin/runs`, and `/v1/twin/runs/{run}/speed`,
  `/stop`, `/display`: the digital twin, for the administrators of a synthetic airport, on a
  server started with `--twin` (S18).
- `POST /v1/simulation-scenarios`, `GET /v1/simulation-scenarios` and `/{id}/file`: an
  airport's scenarios for simulations, named by their hash (S19);
- `POST /v1/simulations` (settings as the CLI's, or the `manifest` of results with an
  `expectedFingerprint`), `GET /v1/simulations`, `GET /v1/simulations/{run}`, `/results`,
  `/report`, `/report.html`, `POST /v1/simulations/{run}/reproduce` and `/cancel`: simulations,
  for analysts and administrators (S19).

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
  manager follows 4 recommendations out of 5;
- `<policy>@advise` (S22.3): the console's own rule (S22) recommends them, from the forecast of
  the next hour and what the live system knows of the day, and the duty manager follows 4 out of 5.

```bash
pnpm sim run --scenario scenarios/mx-like-transfer-hub.yaml --policies fifo,fifo-manual,fifo-manual@reactive,fifo-manual@predict,fifo-manual@advise,priority-v3,priority-v3@predict,priority-v3@advise
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

```bash
pnpm sim backtest --scenario scenarios/vce-like-peak-day.yaml --seeds 1-200
```

The backtest (S21) measures GateFlow's forecasts against the full simulator: every 15 minutes of
each simulated day, a forecast from what the live system knows then, compared at 15, 30, 60 and 90
minutes with what happened (MAE, WAPE, bias, and how often the truth falls in the band). It writes
`backtest.json` and `backtest.md` in `out/<scenario id>/backtest/`.

The forecasts' bands are calibrated on the scenario library (S21.3): `pnpm calibrate:library`
runs `gateflow-sim calibrate` on six scenarios and writes the levels as a module of the forecasts;
CI checks the module (`pnpm calibrate:check`) after any change to the simulator or the forecasts.

The pitch figures ([docs/pitch](docs/pitch/README.md)) are written from the published reports by
`pnpm pitch` (`gateflow-sim pitch`): about ten claims, each with its figures, their 95% intervals,
its reports and the caveat to say with it, then the tables behind them. Every figure is read, never
computed, and `figures.json` gives the file and JSON pointer of each. A report that is not a clean
commit's simulated report on synthetic data is refused, and a claim whose figures no longer support
its words stops the page. CI checks the page is what the reports give (`pnpm pitch:check`), so a
report published again changes it in the same commit (ADR-058).

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
  and its measured waits: the data to ask the airport for. (That sweep let GateFlow know the day's
  screening time; without it, S22.4 finds 1.6, 7.6 and 33.6 flights per day at 25, 26 and 27
  seconds, and 23.1 with one lane fewer: ADR-059.)
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
    with the plan alone, 22.2 with a supervisor, 20.9 with GateFlow's lanes. S8 let GateFlow and
    the supervisor know the day was slower; measured again without it (S22.4, ADR-059), the
    supervisor misses 22.5, S8's rule 22.0 and the console's lanes 22.5, as the supervisor; with a
    roster one lane short the console's lanes save 3.8 [3.4, 4.2] flights a day more than the
    supervisor, and GateFlow as a whole 4.7 [4.0, 5.4] more than today's practice. A console that
    measures what the lanes screen today, from the log (S22.5, ADR-060, proposed), misses 21.4 on
    the 26-second day: 1.1 [0.9, 1.4] flights a day fewer than on the settings, 2.1 [1.7, 2.5] at
    27 seconds, for half an extra lane-hour a day more;
  - each extra lane-hour saves 35 to 180 hours of passenger waiting;
  - GateFlow's target wait (10 minutes by default) trades lane-hours for flights, and is set for
    each checkpoint.
- Reports with every assumption, data source and limitation, and pages with charts:
  - the figures for the pitch, each with its interval, report and caveat:
    [docs/pitch](docs/pitch/README.md);
  - the console's lane recommendations: [docs/reports/slice-22](docs/reports/slice-22/README.md);
  - the forecasts' errors: [docs/reports/slice-21](docs/reports/slice-21/README.md);
  - extra lanes: [docs/reports/slice-8](docs/reports/slice-8/README.md);
  - the library: [docs/reports/slice-7](docs/reports/slice-7/README.md);
  - the demo days: [docs/reports/slice-6](docs/reports/slice-6/README.md);
  - earlier reports: [docs/reports](docs/reports).

## Repository layout

| Path | Content |
|---|---|
| `packages/domain` | Shared domain types and units |
| `packages/forecast` | GateFlow Predict: a Monte Carlo of a checkpoint's next 90 minutes from its live state, the errors of forecasts, and the lane recommendations made from them (pure) |
| `packages/bcbp` | IATA boarding passes: parser (never the name), encoder, synthetic passes, flight date, leg for a checkpoint (pure) |
| `packages/contracts` | The API's request and answer schemas (Zod) and its OpenAPI document (pure) |
| `packages/i18n` | Every text of the passengers' screens in Italian, English and Mexican Spanish (pure) |
| `packages/operations` | A live checkpoint's day on the simulator's queue, rebuilt from its command log (pure) |
| `packages/priority-engine` | Deterministic priority engine (pure) |
| `packages/queue-core` | Queue state machine, policies and lane modes, shared by simulator and product (pure) |
| `packages/sim-kernel` | Seeded RNG streams, deterministic math, distributions, event calendar (pure) |
| `packages/sim-model` | Checkpoint simulation: physical or virtual queue, calls, lane schedules, extra lanes, disruptions (pure) |
| `packages/sim-scenarios` | Scenario schema, airport configurations, assumptions registry, synthetic population, arrival forecast (pure) |
| `packages/sim-metrics` | Experiments, paired metrics, statistics, results and report; the backtest of the forecasts (pure) |
| `packages/sim-trace` | The trace of one day: every event, replay views, the explanation of every call (pure) |
| `packages/studio-core` | What the Studio adds in the browser: SHA-256, files, library, what-if settings, comparison of runs, traces (pure) |
| `packages/twin` | The digital twin: a simulated day as the live system's commands at virtual times, with the check of every answer (pure) |
| `apps/api` | `gateflow-api`: the operational core on PostgreSQL (Fastify, Drizzle); serves the screens |
| `apps/web` | The product's screens: the kiosk, the passenger's ticket page, the display, the lane station, the supervisor's console and the digital twin's demo page (React) |
| `apps/sim-cli` | `gateflow-sim` command-line interface |
| `apps/studio` | GateFlow Simulator Studio: the simulator in one offline HTML page; a build of it is served by the API at `/sim` |
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
