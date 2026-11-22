# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Any change that alters simulated numbers
must be listed, together with the component versions it bumps.

## [Unreleased]

Slice S15 in progress. Part 1: the life cycle of a ticket on a clock. Part 2: staff sign in.

### Simulated numbers change

- None. The golden files change only in the version of the queue (0.7.0); the simulator never
  takes the new staff actions, and fails at once if one ever reaches it.

### Added

- queue-core 0.7.0: staff actions, each allowed only in the states the ticket's state machine
  says (kickoff 2.8): call again, mark a no-show, bring a no-show back, hold for a review (the
  ticket keeps its place), end a review (back to its place, or cancelled), cancel. States
  `REVIEW` and `CANCELLED`. The no-show timeout counts from the latest second call, by the first
  timeout or by staff.
- operations 0.3.0: the commands `ADVANCE` (the timeouts due), `RECALL`, `MARK_NO_SHOW`,
  `REACTIVATE`, `HOLD`, `RESOLVE_REVIEW` and `CANCEL`; a manual ticket's coded reason; a ticket
  presented by its boarding pass (`PASS`).
- API:
  - the timers: `serve` applies every checkpoint's timeouts when they are due (a second call, a
    no-show, an expiry), through the log like any command. The key of a timeout makes it apply
    once, whichever servers see it due.
  - `POST /v1/checkpoints/{id}/tickets/{ticket}/recall`, `no-show`, `reactivate`, `review`,
    `resolve` and `cancel`.
  - A manual ticket needs its coded reason: no boarding pass, pass unreadable, assistance, group,
    other.
  - A rescan at a kiosk brings a no-show back within its window (`REACTIVATED`); a ticket under
    review or cancelled sends the passenger to staff.
  - A pass whose flight's boarding has closed sends the passenger to staff (`BOARDING_CLOSED`),
    unless the checkpoint's `afterBoardingClose` is `ISSUE`.
  - The access point can find a ticket by its boarding pass, read in memory.
  - The demo flights of a kiosk are those of the next 24 hours, each with the date of its
    passes: sample passes work at any hour, also late in the evening.
  - Migration `0005_life_cycle`: `checkpoint_timer`, the latest call of a ticket, the new states,
    outcomes and method.
- Contracts 0.4.0: the staff actions and their answers, `ResolveReviewRequest`, a manual ticket's
  `reason`, a ticket's `lastCalledAt`, the new scan outcome and reasons, admission by boarding
  pass.
- i18n: the texts of a review, a cancellation, a return to the queue and a closed boarding, in
  the three languages. The kiosk says "You are back in the queue" with the same number.
- Staff sign in (part 2):
  - local members of staff with a login and a password, a role (operator, supervisor, admin) and
    the checkpoints of their airport they work at: `gateflow-api user add`, `user password`,
    `user disable`;
  - `POST /v1/auth/sign-in`, `GET /v1/auth/me`, `POST /v1/auth/sign-out`. The session is an
    HttpOnly, SameSite=Strict cookie (Secure over TLS) that lasts a shift (12 hours). Passwords
    are kept as scrypt hashes and sessions as the SHA-256 of their token. After ten failures in a
    quarter of an hour, a login waits. A request sent by a page of another site is refused.
  - Every staff route needs a session. Operators issue manual tickets, call, admit, call again,
    mark no-shows, bring them back and ask for reviews. Supervisors also cancel, end reviews and
    check the audit. The log records who acted (`staff:<id>`).
  - Contracts: `SignInRequest`, `StaffMemberResponse`, the staff cookie scheme and each route's
    role (`x-gateflow-role`) in the OpenAPI document. Migration `0006_staff`.
  - The CI's check of the bundle and the Chromium tests sign a supervisor in.

## [0.14.0] - 2026-11-22: Slice S14, the kiosk and the passenger's page

The first screens of the product, served by the API (ADR-044).

### Simulated numbers change

- None.

### Added

- `apps/web` 0.14.0: one React application, built by esbuild and served by `gateflow-api serve`.
  - The kiosk, `/kiosk/<checkpoint>`:
    - a barcode scanner, typing or pasting reads a boarding pass;
    - the answer is a number with a QR code to its page and a print layout (one page on an
      80 mm roll), or the reason in the passenger's language;
    - sample boarding passes on demo airports;
    - a privacy line on the welcome screen and the full notice, marked as a draft, one tap away
      on every screen;
    - back to its welcome screen and language after 45 seconds.
  - The passenger's page, `/t/<reference>`: the number and what to do now, updated every 15
    seconds, in the phone's language or the one chosen, light or dark.
  - The build writes Brotli and gzip copies and the licences of the bundled libraries.
- `@gateflow/i18n` 0.1.0 (pure): every text in Italian, English and Mexican Spanish.
- API 0.14.0:
  - devices: `gateflow-api device add` and `device revoke`. The token is shown once and only
    its SHA-256 is kept. Migration `device`.
  - Scans need the token of a kiosk of the checkpoint (401, 403).
  - `GET /v1/devices/me` and `GET /v1/checkpoints/{id}/demo-flights` (DEMO flights only).
  - `serve` serves the web application (`--web <dir>`, by default the built one next to it).
    Pages get a Content Security Policy allowing only the application's own files, and
    `X-Robots-Tag: noindex`; every answer gets `nosniff` and `no-referrer`.
- Contracts 0.3.0: `DeviceResponse`, `DemoFlightsResponse`, the types of the answers for
  clients, and the device bearer scheme in the OpenAPI document.
- CI: the job "Kiosk and ticket page in Chromium" runs the product (the API's bundle on
  PostgreSQL 17) and keeps the screens it saw, at twice their size. The bundle's check also loads
  a kiosk page. The ticket must fit every kiosk screen with the fonts of any machine: 89% of a
  768x1024 tablet at most here, after the CI runner's wider fonts overflowed it.

### Changed

- ADR-013: the screens are one React application served by the API, not Next.js (ADR-044).

### Fixed

- The request log no longer holds the ticket reference of the passenger's page (`/t/<ref>`).
  Fastify's own handler of missing addresses logged them whole; it is replaced.
- CI: the time limits of tests are budgets against hangs, not speed checks. On a shared runner all
  suites run side by side, and CPU-bound property tests take five to seven times longer than
  alone: one took 62 s against a 60 s limit on Node 22 (9 s for its whole file alone). The limit
  is now 300 s for every package and 600 s for the Erlang C validations. No test does less.

## [0.13.0] - 2026-11-22: Slice S13, boarding passes

Boarding passes at the kiosk, read in memory and kept as an HMAC (ADR-043).

### Simulated numbers change

- None.

### Added

- `@gateflow/bcbp` 0.1.0 (pure): IATA Resolution 792, M format, one to four legs.
  - `parseBoardingPass` never throws, never returns the name and never quotes the text.
  - `encodeBoardingPass`, `syntheticBoardingPass`, `flightDateOf` (the year across year end),
    `legForDeparture` and `dedupMaterial`.
- API 0.13.0: `POST /v1/checkpoints/{id}/scans`.
  - Outcomes `ISSUED`, `RETRIEVED`, `NEEDS_ASSISTANCE` and `REJECTED`, with their reasons.
  - The deduplication key is an HMAC with a random secret per airport and flight date.
  - One active ticket per pass by a partial unique index; every scan recorded without personal
    data.
  - Migrations: `dedup_secret`, `scan` (append-only), the flight's carrier, number and
    departure date, and the airport's IATA code (`ZZZ` until configured).
  - The seed gives library flights the placeholder carrier `ZZ` and `xxx-like` airports the
    code `XXX`.
- Contracts 0.2.0: `ScanRequest` and `ScanResponse`.
- Operations 0.2.0: the issue command records the deduplication key (null for staff tickets).

## [0.12.0] - 2026-11-22: Slice S12, the operational core

The product's server: a checkpoint's day on the simulator's own queue, behind HTTP, on
PostgreSQL (ADR-042). First slice of milestone M3, which now includes S10.

### Simulated numbers change

- None. Engine, queue, model and generator are unchanged.

### Added

- `@gateflow/operations` 0.1.0 (pure): `CheckpointDay` runs one service day on
  `CheckpointQueue`.
  - Commands `OPEN_DAY`, `ISSUE_TICKET`, `CALL_NEXT` and `PRESENT`; ticket numbers per day;
    the queue's own events.
  - `replay` rebuilds a day from its log.
- `apps/api` (`@gateflow/api` 0.12.0, bundle `gateflow-api`): Fastify and PostgreSQL through
  Drizzle ORM.
  - One writer per checkpoint (advisory lock, catch-up with other servers, the service day opened
    when it changes), idempotent commands (`Idempotency-Key`, 409 on reuse).
  - An append-only, hash-chained log of commands and events; current-state tables; at most one
    admission per ticket by the database.
  - Endpoints for tickets, calls, admissions, the day's queue, the audit check and the
    passenger's view of a ticket; health and OpenAPI.
  - Commands `migrate`, `seed --scenario` (demo data) and `serve`; a request log without client
    addresses or ticket references.
  - Migrations generated by drizzle-kit, and triggers that keep the log append-only.
- `@gateflow/contracts` 0.1.0: the API's Zod schemas and the generated OpenAPI 3.1 document.
- Tests: property tests of the day and its log; integration tests on a real PostgreSQL (a
  throwaway local cluster, or `DATABASE_URL`); in CI a PostgreSQL 17 service, and the bundle run
  end to end.

### Changed

- The plan: S10 moved into M3 (S12 and S19); M3 planned as slices S12 to S19.

## [0.11.0] - 2026-11-22: Slice S11, replay of a day with the reason for every call

The trace of a simulated day and its replay in the Studio: each passenger's journey, the paired
outcome and the engine's reason for every call (ADR-041). Second slice of milestone M2, before
S10.

### Simulated numbers change

- None. Engine 0.5.0, queue core 0.6.0 and model 0.6.0 make the same decisions with the same
  outcomes: results files are byte-identical but for the generator (`gateflow-sim 0.11.0`,
  `gateflow-studio 0.11.0`), and the golden files are unchanged.

### Added

- `@gateflow/sim-trace` 0.1.0 (pure): `traceDay` writes the trace of one day of a run for two of
  its policies (`gateflow.sim.trace/1`): the day itself, and every event, outcome and statistic
  of each policy.
  - Views computed from the events: the checkpoint at any moment, the lanes, each party's
    events, what the system knew of each flight at each decision, misses as boarding closes,
    the paired outcome of every party.
  - `explainCommitment`: a call in words, with its figures.
  - `traceContent`: the content behind the fingerprint.
- sim-model: the `observer` option receives every `DayEvent` of a run (arrivals, queue events
  with their party, screenings with their lane, lanes, extra-lane decisions, flight feed); it
  never changes the run.
- queue-core: the `COMMITTED` event carries what the decision was based on: tickets and people
  passed, fast track, urgent tickets waiting, the engine's assessment.
- priority-engine: `REASON_DESCRIPTIONS` and `describeReason`, every reason code in a title and a
  sentence.
- CLI: `gateflow-sim trace --scenario <file> --seed <n>` (`--policies`, `--reference`,
  `--candidate`, `--out`, `--commit`) writes `trace.json` and prints the day and the trace's
  fingerprint.
- Studio:
  - "Replay a day": the typical (median), best, worst or any day of a run, any of its
    comparisons;
  - both policies at the same moment, with play and seek;
  - charts of people standing, flights missed and lanes open, with an hour-by-hour table;
  - the latest calls with their reasons, and lists of passengers saved, lost or delayed by
    priority calls;
  - each passenger's day under both policies, call by call;
  - the trace's fingerprint, the CLI command that reproduces it, and the trace file.
- studio-core 0.2.0: `studioTrace`, `traceFingerprint`, `replayComparison`, `notableDays`.
- Tests: property tests of the observer; the trace against the simulator's statistics on five
  library days; the CLI's `trace`; the Studio's trace and fingerprint against the CLI's; an
  end-to-end test of the replay in Chromium.

### Changed

- Studio: the full report has its own panel, after the replay.
- CLI and Studio 0.11.0 (the slice number; there is no 0.10.0).

## [0.9.0] - 2026-11-22: Slice S9, GateFlow Simulator Studio

The simulator in the browser, as one HTML page that works offline and on a phone and gives the
CLI's results (ADR-040). First slice of milestone M2.

### Simulated numbers change

- None. The page runs the same code as the CLI; its `results.json` differs only in
  `manifest.generator` (`gateflow-studio`). CLI results name `gateflow-sim 0.9.0`.

### Added

- `apps/studio`: GateFlow Simulator Studio, built into `dist/gateflow-studio.html` (about
  1.6 MB, no external resource, no network access) and into the body of a claude.ai page, which
  saves files through the viewer's `downloads` capability:
  - the scenario library, or a person's own airport configuration, days and flight lists, which
    stay in the browser;
  - ten what-if settings and every labelled parameter, edited with its source;
  - the policies with their lane modes, the status quo and the number of days;
  - days on Web Workers (the page itself where a frame refuses them), with progress and
    cancellation;
  - the CLI's report, copies or downloads of the results, the report and the scenario (the CLI
    reproduces the scenario exactly), and the comparison of two runs.
- `@gateflow/studio-core` 0.1.0 (pure): a synchronous SHA-256 identical to node:crypto, files by
  path with the CLI's resolution, the library, the experiment setup, what-if settings, the
  parameter editor and the comparison of runs.
- sim-metrics: `recommendedComparisons` and `arrivalClassification` (moved from the CLI),
  `renderHtmlReportBody`, `REPORT_CONTENT_STYLE` and the report's colour tokens.
- Tests: unit tests of the Studio core; end-to-end tests in Chromium (the CLI's results byte for
  byte, with and without workers, for a what-if saved as a scenario; a phone; no network
  request); a CI job that runs them and publishes the page.

### Changed

- Report links are kept only for web addresses and relative paths.
- Lint covers TSX files, and dependency-cruiser resolves them.
- `airports/**` is a global dependency of the Turborepo cache.

## [0.8.0] - 2026-11-22: Airport configurations and slice S8

One configuration file per airport, and extra lanes during the day: opened by today's supervisor
when the queue is long, or recommended by GateFlow from a forecast of arrivals, with a duty
manager who may not follow (ADR-038, ADR-039).

### Simulated numbers change

- None for the existing policies and scenarios: without a lane mode no lane opens beyond the plan,
  and the populations of the library days are those of S7 plus the day's staff on call (drawn on
  streams of their own). Golden files differ only in the manifest (queue core 0.6.0, model 0.6.0,
  population generator 0.6.0, results schema 7, sweep schema 3), in a new model limitation and in
  the added metrics (extra lane-hours, lane decisions, lanes opened and closed, most lanes open,
  change in waiting in person-hours and in extra lane-hours).
- New numbers come from the new lane modes (`@reactive`, `@predict`): see
  [docs/reports/slice-8](docs/reports/slice-8/README.md).

### Added

- Extra lanes (S8, ADR-039):
  - lane modes for every policy: `<policy>@reactive` (a supervisor opens a lane when the queue
    shows a long wait) and `<policy>@predict` (GateFlow projects the queue over 45 minutes from a
    forecast of arrivals and recommends the fewest lanes that keep the wait below 10 minutes);
  - scenario fields `checkpoint.laneStaffing` (staff on call for extra lanes, time to open one,
    minimum time open, share of recommendations followed) and `checkpoint.lanePlanRule.maxLanes`
    (the roster below the lanes the checkpoint has);
  - lane thresholds in `todayPractice` (`laneOpenWaitMinutes`, `laneCloseWaitMinutes`) and in
    `gateflow` (`laneTargetWaitMinutes`, `laneHorizonMinutes`);
  - the arrival forecast: the average arrival profile of 50 simulated days never simulated in the
    reports;
  - metrics: extra lane-hours, decisions and those followed, lanes opened and closed, most lanes
    open; per comparison, the change in waiting and in extra lane-hours, and the waiting saved
    and the net flights made per extra lane-hour with bootstrap intervals;
  - a "Lane management" section in every report with a lane mode, and extra lane-hours and the
    change in time to screening in sweep tables;
  - sweep parameters `laneTargetWaitMinutes`, `maxExtraLanes`, `laneOpenDelayMinutes` and
    `laneFollowShare`, and the sweep `sweeps/vce-like-peak-lanes.yaml`;
  - default comparisons for lane modes; `gateflow-sim validate` prints the lanes and the staff on
    call; `gateflow-sim policies` lists the lane modes;
  - tests: hand-computed cases, 200 random cases of the lane limits, equivalence with the plan
    without staff on call, the S7 results unchanged without lane management.
- Airport configurations (ADR-038):
  - `airports/<id>.yaml` holds every parameter of an airport and its checkpoints, with their
    sources;
  - a scenario with `extends: { airport, checkpoint }` gives only its day;
  - `airports/vce-like.yaml`, `tsf-like.yaml` and `mx-like-hub.yaml` carry the S7 library;
  - [airports/README.md](airports/README.md) says what goes where, item by item of the data
    request.
- Optional scenario fields:
  - `checkpoint.lanesAvailable` and `checkpoint.lanePlanRule` (lanes planned from the expected
    arrivals);
  - `gateflow` (GateFlow settings of the checkpoint), `todayPractice` (baseline A') and
    `fairnessTarget`.
- `gateflow-sim lanes --scenario <file>` prints the lane plan of a day; `validate` shows the
  airport and checkpoint.
- Reports:
  - the airport configuration and its SHA-256;
  - the policy parameters set for the checkpoint, with the preset value;
  - whether the fairness target of the checkpoint is met.
- Tests:
  - the library days composed from their airports give the populations and per-day results of
    S7;
  - the rule reproduces each day's lane plan;
  - composition, merging, settings and their errors.

### Changed

- The library days (`scenarios/vce-like-*.yaml`, `tsf-like-peak-day.yaml`,
  `mx-like-transfer-hub.yaml`) extend their airport configuration. Their results are unchanged.
- The library airports have more lanes than their roster plans and staff on call (synthetic):
  VCE-like 14 lanes with a roster of at most 12 and 2 extra lanes, TSF-like 6/5/1, MX-like hub
  5/4/1. The lane plans of the days are unchanged.
- `results.json` is `gateflow.sim.results/7` and `sweep.json` `gateflow.sim.sweep/3`. A
  comparison may carry `perExtraLaneHour`.
- `gateflow-sim policies` prints `{ presets, laneModes }` instead of the list of presets.
- Sweep tables leave out the overtake column when the candidate does not prioritise.
- HTML reports keep policy ids and values with their interval on one line in tables (they broke
  in the middle); wide tables scroll inside their frame.
- `results.json` and `sweep.json` manifests carry `scenario.airport` (null for scenarios without
  one).
- Sweeps: adding lanes (`lanesDelta` > 0) also adds them to the lanes the checkpoint has.
- `airports/private/` is ignored by git, like `scenarios/private/`.

## [0.7.0] - 2026-11-21: Slice S7

Flight lists from files, data sources and licences in every report, and a scenario library.
Public flight data (OPDI) is not used: its terms are non-commercial.

### Simulated numbers change

- None for the existing scenarios: the six scenarios migrated to schema 5 simulate exactly the
  same passengers and give the same results. Golden files differ only in the manifest
  (results schema 6, scenario schema 5, population generator 0.5.0, scenario hash, data sources)
  and in the new section "Data sources and licences".

### Added

- Scenario schema 5 (ADR-036):
  - `dataSources`, the sources of a scenario's data with their licence or terms of use, and an
    optional `ref` from any parameter to its source;
  - schedule kind `flight-list`, read from a CSV file in the `gateflow.flights/1` format. It
    supports seats by aircraft type, fixed passenger counts and gate zones (drawn when
    missing). Errors carry line numbers, and the file's SHA-256 goes into the manifest.
- `gateflow-sim flights --scenario <file> [--out <file.csv>]`: the design day of any scenario as
  a flight list. A flight list scenario made from it simulates the same passengers (tested end
  to end through the CLI).
- "Data sources and licences" in every run report and sweep report. Data sources and the origin of
  the design day in the manifests.
- Sweep parameter `serviceTimeMeanSeconds`.
- Scenario library on synthetic flight lists (ADR-037):
  - `vce-like-normal-day`, `vce-like-peak-day` and `vce-like-disrupted-day`, sized from Venice's
    2025 traffic;
  - `tsf-like-peak-day`, sized from Treviso's;
  - `mx-like-transfer-hub`, a transfer security checkpoint fed by tight connections.

  The flight lists are written by `scenarios/flights/make-library-flights.mjs`.
- Sweeps `vce-like-peak-capacity` and `mx-like-hub`.
- [docs/data-request](docs/data-request/README.md): what GateFlow needs from an airport to
  simulate its checkpoint, with a CSV template. `scenarios/private/` is ignored by git for
  airport-provided files.
- ADR-035 (public flight data not used), ADR-036 and ADR-037, slice-7 reports.

### Fixed

- The first line of every run report said "about N passengers per day" but counted parties: a
  family of four counted once. It now gives people and parties ("about 6,207 passengers per day
  (4,695 parties)" on the demo day). The summary of `results.json` gives `peoplePerDay` and
  `partiesPerDay` instead of `passengersPerDay`. Reports of S3 to S6 keep the old wording; their
  tables always counted people.
- HTML pages: long inline code (the SHA-256 of a flight list) wraps instead of making the page
  scroll sideways on a phone.
- Tests: set-up hooks get the same 60-second timeout as tests. The 10-second default made the CLI
  tests fail once on a loaded CI runner.

### Changed

- `@gateflow/sim-scenarios` 0.5.0 (schema 5, generator 0.5.0, `ScenarioValidationError` in a
  module of its own, `parseScenarioText` reads the flight list through caller-provided file
  access).
- `@gateflow/sim-metrics` 0.7.0 (results schema `gateflow.sim.results/6`, sweep schema
  `gateflow.sim.sweep/2`).
- `@gateflow/sim-cli` 0.7.0 (reads flight list files relative to the scenario, `flights`
  command, data sources in `validate`).
- CI:
  - a flight-list scenario is run with 1 and 4 threads and the outputs compared;
  - the library flight lists are checked against their generator;
  - the reports job also simulates the library.
- Implementation plan: S7 done (without the OPDI import, ADR-035), S8 (lane opening) next.

## [0.6.0] - 2026-11-21: Slice S6

Parallel batches, sensitivity sweeps and HTML reports. Maximum data age of priority v3 raised to
60 minutes.

### Simulated numbers change

- `priority-v3` 0.2.0 trusts flight data for 60 minutes instead of 30 (ADR-034). On the slice-6
  reports (200 days) it misses 10.8 flights per day on the disrupted scenario (0.1.0: 11.1), the
  same as v2. With the unreliable feed it misses 12.3 (0.1.0: 14.2), level with A' (12.4). The
  scenarios without feed outages are unchanged (11.5, 5.6, 16.6 and 141.6 on the demo, moderate,
  staffed and strategic scenarios).
- No other policy changes. The S1 to S4 regressions still hold.
- Golden files regenerated: `priority-v3` 0.2.0 and queue core 0.5.0 in the manifests, plus new
  golden files for the HTML report and for a small sweep (JSON, Markdown, HTML).

### Added

- Worker threads (ADR-031): `--workers` (default: every CPU) for `run` and `sweep`. Outputs are
  byte-identical whatever the number of threads. 1000 days x 3 policies take 48 s on 4 threads.
- `runDay`, `planExperiment` and `assembleExperiment`: an experiment as independent days.
- Sensitivity sweeps (ADR-032):
  - `gateflow-sim sweep --spec sweeps/<id>.yaml`, with schema `gateflow.sim.sweep/1`;
  - 17 parameters across the policy, the virtual queue and the scenario;
  - shared days and policy runs, and `sweep.json`, `sweep.md` and `sweep.html` outputs;
  - published sweeps `sensitivity-demo` and `data-quality-disrupted`.
- HTML reports (ADR-033): `report.html` next to every `report.md`, and `sweep.html`.
  Self-contained, deterministic, with inline SVG charts in light and dark mode.
- Tests:
  - worker threads end to end (built bundle, 1 against 3 threads);
  - days and sweep variants assembled in any order;
  - sweep settings and their validation;
  - a sweep point against an ordinary experiment;
  - the Markdown-to-HTML converter, charts and tag balance;
  - the CLI `sweep` command and its errors.
- ADR-031 to ADR-034, slice-6 reports (six experiments and two sweeps).

### Changed

- `@gateflow/queue-core` 0.5.0: preset `priority-v3` 0.2.0 (maximum data age 60 minutes).
- `@gateflow/sim-metrics` 0.6.0: experiments split into days; sweeps; HTML rendering. The
  results schema is unchanged (`gateflow.sim.results/5`).
- `@gateflow/sim-cli` 0.6.0:
  - `runCli` is asynchronous;
  - new `--workers` option and `sweep` command;
  - writes `report.html`;
  - the bundle doubles as its worker script;
  - depends on `yaml` and `zod` for sweep files.
- CI compares runs and sweeps made with 1 and 4 threads, and publishes 20-day sweeps with the
  reports.
- Implementation plan: S6 done, S7 (real schedules) next.

## [0.5.0] - 2026-11-21: Slice S5

Disruptions and data quality: flight delays with their notice, gate changes, lane outages, flight
feed outages, the ground truth kept separate from what the system knows, a stale-data rule and
hysteresis (policy `priority-v3`).

### Simulated numbers change

- New policy `priority-v3` (v2 plus the stale-data rule and hysteresis, ADR-029). On the slice-5
  reports (200 days) it misses 11.5, 5.6 and 16.6 flights per day on the demo, moderate and
  staffed scenarios, like v2 (11.5, 5.6 and 16.5) and 3.2, 1.5 and 1.2 fewer than A'. On the
  disrupted day it misses 11.1 (v2 10.8, A' 12.4); with an unreliable feed, 14.2 (v2 11.1,
  A' 12.4).
- The flapping of risk classes disappears: 25 to 190 class reversals per day with v2, none with
  v3 on the main scenarios.
- New scenarios `single-checkpoint-disrupted` and `single-checkpoint-feed-stress`.
- `fifo`, `fifo-manual`, `virtual-fifo`, `priority-v0`, `priority-v1`, `priority-v1-strict` and
  `priority-v2` are unchanged on the S3 scenarios. Without disruptions and with the S5 rules off,
  every S4 metric is reproduced exactly (new regression test against a fixture saved from the S4
  commit, seeds 1-3); S1, S2 and S3 still are.
- Golden files regenerated: five policies (`priority-v3` replaces `priority-v1`), nine
  comparisons, the new metrics, and a new golden report of the disrupted scenario.

### Added

- Disruptions as ground truth and knowledge (ADR-030):
  - scenario schema 4 with a `disruptions` section: flight delays (share, length, notice), gate
    changes (share, time, notice delay), lane outages and feed outages (per day, length);
  - `operations.deadlineKnowledge` accepts `NONE`;
  - population generator 0.4.0, every disruption on streams of its own;
  - the simulator applies feed messages at the time they are sent, holds them during feed outages,
    takes lanes out of service and sends passengers to the new gate after a gate change.
- Stale-data rule and hysteresis in the engine (ADR-029):
  - `KnownDeadline.observedAtMs`, `ClassificationParams.maxDeadlineAgeMs` (reason
    `DEADLINE_STALE`);
  - `ClassificationParams.hysteresisMs` and `WaitingTicket.lastRiskClass` (reason
    `HYSTERESIS_HOLD`);
  - `isDeadlineStale()` and `classifyMargins()`.
- Preset `priority-v3` 0.1.0: v2 with a maximum data age of 30 minutes and h = 3 minutes.
- Metrics: class changes, reversals and people whose class flapped; people boosted on wrong
  information; misses among passengers of delayed or re-gated flights; the disruptions of each day.
  Report section "Disruptions, data quality and stability".
- Tests:
  - engine: stale and hysteresis boundaries, an independent oracle of the hysteresis, flapping
    bounded by the hysteresis (property P20);
  - queue: flight updates, class tracking, reversals against an independent record of the
    observed classes;
  - simulator: hand-computed lane outages, gate changes, delay notices, held messages, the order of
    feed events and the stale-data rule; properties with random disruptions;
  - acceptance of S5: with the flight feed absent, B gives exactly the outcomes of the same queue in
    FIFO order (demo and disrupted scenarios, random populations), and with calls answered at
    once those of the physical FIFO queue A;
  - the S4 regression;
  - 30 mutation checks.
- ADR-029 and ADR-030, slice-5 reports.

### Changed

- `@gateflow/domain` 0.2.0: `KnownDeadline.observedAtMs`.
- `@gateflow/priority-engine` 0.5.0 (engine version 0.5.0): stale-data rule and hysteresis, both
  off by default.
- `@gateflow/queue-core` 0.4.0:
  - `TicketInput.flightId` and `updateFlight()`;
  - every waiting ticket is assessed whenever a ticket is issued or called; its class feeds the
    hysteresis and its changes are counted;
  - `TicketView`: `deadline`, `walkEstimateMs`, `riskClass`, `classChanges`, `classReversals`;
    `QueueStats`: `classChanges`, `classReversals`.
- `@gateflow/sim-scenarios` 0.4.0 (scenario schema 4, population generator 0.4.0): versions 1 to 3
  are rejected with a migration message.
- `@gateflow/sim-model` 0.5.0 (model version 0.5.0): disruptions, `openLanesAt()`, `trueWalkMs()`,
  an optional event listener, new outcome fields and run statistics.
- `@gateflow/sim-metrics` 0.5.0 (results schema `gateflow.sim.results/5`): new metrics, the
  disruptions summary, a report section and updated model limitations.
- `@gateflow/sim-cli` 0.5.0: default policies `fifo,fifo-manual,virtual-fifo,priority-v3`; risk
  classes fall back to `priority-v3`.
- CI publishes six 200-day reports with `fifo,fifo-manual,virtual-fifo,priority-v2,priority-v3`.
- Implementation plan: S5 done, S6 next.

## [0.4.0] - 2026-11-21: Slice S4

The fast track for priority calls (policy `priority-v2`). On the S3 scenarios GateFlow now catches
more flights than idealised manual handling (A').

### Simulated numbers change

- New policy `priority-v2` (v1 plus the fast track). On the slice-4 reports (200 days) it misses
  11.5, 5.6 and 16.5 flights per day on the demo, moderate and staffed scenarios. That is 3.2, 1.5
  and 1.2 fewer than A' (all intervals exclude zero), and 6.5, 3.8 and 6.5 fewer than v1.
- `fifo`, `fifo-manual`, `virtual-fifo`, `priority-v0`, `priority-v1` and `priority-v1-strict` are
  unchanged. With the fast track off, every S3 metric is reproduced exactly (new regression test
  against a fixture saved from the S3 commit, seeds 1-3); S1 and S2 still are.
- Golden files regenerated: five policies (`priority-v2` added), nine comparisons, two new
  metrics.

### Added

- Fast track (ADR-027), selection parameter `fastTrack`:
  - a priority call is made next, ahead of the prepare window;
  - the party goes to the next free lane once it has validated its ticket;
  - the engine estimates such calls with the fast-track response time, shortened for a
    passenger who has just been at the access point, and without the time to call the window;
  - an URGENT head of the waiting list is boosted too;
  - every person passed, in the queue, in the window and at the lanes, counts towards K.
- Preset `priority-v2` 0.1.0 (v1 plus the fast track, ADR-027).
- Metrics `fastTrackPeople` (people through the fast track) and `lanePassedPeople` (people
  passed at the lanes), with report rows for fast-track policies.
- Engine, queue and simulator tests:
  - engine properties for the fast track;
  - an independent model of the prepare window with fast-track insertions;
  - the lane-order property and the bound K including lane passes, with coverage on congested
    populations;
  - a hand-computed timeline;
  - 16 mutation checks.
- ADR-027 and ADR-028, slice-4 reports.

### Changed

- `@gateflow/priority-engine` 0.4.0 (engine version 0.4.0):
  - `ClassificationParams.fastTrack`;
  - `CheckpointEstimates.fastTrackResponseMs`, which may not exceed `responseMs`;
  - `WaitingTicket.lastSeenAtMs`;
  - `EngineInput.aheadMaxOvertakenCount`;
  - `journeyEstimates()`;
  - the FIFO margin always uses the journey through the queue, while L, the margin if selected
    now and feasibility use the boosted journey.
- `@gateflow/queue-core` 0.3.0:
  - fast-track commitments go ahead of the prepare window (behind earlier ones) and count as
    overtakes of the tickets they pass;
  - tickets remember when the passenger was last at the access point;
  - `TicketView.fastTracked` and `TicketView.lastSeenAtMs`;
  - `fastTrackResponseEstimateMs()`.
- `@gateflow/sim-model` 0.4.0 (model version 0.4.0): fast-tracked parties go ahead of the people
  at the lanes who still have room under K; passes at the lanes count in each passenger's
  overtakes; new run statistics.
- `@gateflow/sim-metrics` 0.4.0 (results schema `gateflow.sim.results/4`): new metrics, report
  rows and model limitations (fast track; staff escorts not modelled).
- `@gateflow/sim-cli` 0.4.0: default policies `fifo,fifo-manual,virtual-fifo,priority-v2`; risk
  classes fall back to `priority-v2`.
- CI publishes the four 200-day reports with `fifo,fifo-manual,virtual-fifo,priority-v1,priority-v2`.
- Implementation plan: S4 done, S5 (disruptions and data quality) next.

## [0.3.0] - 2026-11-21: Slice S3

Baseline A' (today's manual handling), groups and families, the assisted path, eligibility rules
and priority policy v1.

### Simulated numbers change

- Every simulated day changes. Groups (about 40% of passengers travel with others), assisted
  passengers and population generator 0.3.0 produce different populations. S3 numbers are not
  comparable with S2 numbers.
- With parties of one person, nobody assisted and no strategic arrivals, the S3 code reproduces
  every S2 metric exactly (new regression test against a fixture saved from the S2 commit,
  seeds 1-3), and every S1 metric as before.
- New baseline A' (`fifo-manual`). On the slice-3 reports (200 days) it misses 14.7, 7.2 and 17.8
  flights per day on the demo, moderate and staffed scenarios. `priority-v1` misses 18.0, 9.4 and
  23.0, so 3.3, 2.3 and 5.2 more than A' (all statistically clear).
- Golden files regenerated: four policies (`fifo`, `fifo-manual`, `virtual-fifo`,
  `priority-v1`), five comparisons, metrics in people, new report section.

### Added

- `fifo-manual` 0.1.0 (policy A'): the physical queue with staff calling the flights that close
  within 20 minutes, every 5 minutes (ADR-022). It uses the engine's new `flight-call` selection.
- Groups and families (ADR-021). A ticket holds a party, called together and screened on one lane.
  The FIFO wait, the cap, the overtake bound and the metrics count people. Groups larger than the
  cap are never boosted automatically (`GROUP_EXCEEDS_CAP`).
- Assisted path (ADR-021): staff take assisted parties to the next free lane under every policy;
  the reason is never recorded.
- `priority-v1` 0.1.0 (ADR-025): at most 10 priority people among any 20 people called,
  K = 30 people, feasibility margin F = 0, no late-presentation rule. Calibrated on seeds
  1001-1020, disjoint from the report seeds.
- `priority-v1-strict` 0.1.0: v1 with the late-presentation rule. Departing passengers must
  present at least 45 minutes before departure to be boosted automatically; transfers are exempt.
- Scenario `single-checkpoint-strategic`: the demo day where 5% of departing parties arrive 25-35
  minutes before departure on purpose (stress test).
- Report section "Groups, assisted passengers and late arrivals".
- Regression test against S2, property tests with groups and the new rules, coverage tests.
  39 mutation checks are caught.
- ADR-021 to ADR-026, slice-3 reports and the S4 proposal in the implementation plan.

### Changed

- `@gateflow/priority-engine` 0.3.0 (engine version 0.3.0):
  - optional `partySize`, `presentedAtMs` and `scheduledDepartureMs` on waiting tickets;
  - `feasibilityMarginMs` separates CRITICAL from the safety buffer (ADR-023);
  - `latePresentationCutoffMs` (late-presentation rule, `null` = off);
  - the `flight-call` selection;
  - with groups, calling the ticket at the overtake limit could push an older, reactivated ticket
    past K: the guard then calls the head of the queue (found by the queue-core property tests
    during the slice);
  - new reasons `OVERTAKE_ROOM_EXHAUSTED`, `FLIGHT_CALL`, `INSIDE_SAFETY_MARGIN`,
    `LATE_PRESENTATION`, `PRESENTATION_UNVERIFIED` and `GROUP_EXCEEDS_CAP`.
- `@gateflow/queue-core` 0.2.0: parties, presentation time and departure time on tickets;
  per-person window, waiting and outstanding counts; per-person overtakes and cap history; presets
  `fifo-manual`, `priority-v1` and `priority-v1-strict`. `priority-v0` keeps its behaviour
  (F = B = 5 min, no presentation rule).
- `@gateflow/sim-model` 0.3.0 (model version 0.3.0): parties served on one lane, the assisted
  path with lane precedence, the strategic flag, standing and idle-lane statistics in people.
- `@gateflow/sim-scenarios` 0.3.0: scenario schema 3 (`passengers.groups`,
  `passengers.assistedShare`, `passengers.strategicLateArrival`); version 1 and 2 files are
  rejected with a migration message. Population generator 0.3.0 (ADR-026).
- `@gateflow/sim-metrics` 0.3.0 (results schema `gateflow.sim.results/3`): metrics and paired
  comparisons weighted by party size, new group, assisted and strategic metrics, cost section for
  staff flight calls, parameters set to `null` shown as "none".
- `@gateflow/sim-cli` 0.3.0:
  - default policies `fifo,fifo-manual,virtual-fifo,priority-v1`;
  - default comparisons add each priority policy against A' and against earlier priority policies
    on the same queue;
  - risk classes fall back to `priority-v1`.
- Scenarios `single-checkpoint-demo`, `-moderate` and `-staffed` migrated to schema 3. They now
  have groups and 0.7% assisted parties.
- CI publishes 200-day reports for the four scenarios. The strategic scenario also runs
  `priority-v1-strict`.

## [0.2.1] - 2026-11-21: engine fix

### Fixed

- `@gateflow/priority-engine` 0.2.1 (engine version 0.2.1): with a prepare window, the FIFO slack
  subtracted the time to call the committed tickets twice (once inside the FIFO wait, once more on
  top), so tickets looked about a minute more at risk than they were (ten committed tickets at 540
  passengers per hour). Found while preparing slice S3. A property test now checks both margins
  against their definitions, and another one checks that selection and assessment agree on the
  boost-eligible tickets.
- Effect on the S2 reports (200 simulated days), all within the confidence intervals:

  | Scenario | `priority-v0` missed flights per day | Net flights saved vs `fifo` | Net saved vs `virtual-fifo` |
  |---|---:|---:|---:|
  | demo | 29.7 -> 29.6 | 19.1 -> 19.1 | 19.6 -> 19.6 |
  | moderate | 10.1 -> 10.2 | 1.8 -> 1.7 | 2.3 -> 2.1 |
  | staffed | 37.0 -> 36.6 | 21.9 -> 22.3 | 22.5 -> 22.9 |

  S1 results, physical and virtual FIFO, and everything without a prepare window are unaffected.
  Golden files regenerated.

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
