# GateFlow product requirements

Source of truth for *what* GateFlow must do. Derived from the business plan *Airport Smart Queue,
PRD + Business Plan v1.0 (2026-11-18)* (confidential, not stored in this repository) and from the
approved kickoff proposal ([docs/kickoff/KICKOFF_PROPOSAL.md](docs/kickoff/KICKOFF_PROPOSAL.md),
Italian). Decisions are referenced as ADR-nnn ([DECISIONS.md](DECISIONS.md)).

## 1. Vision

For airport operators who want to reduce flights missed because of waiting at checkpoints, and to
handle urgent cases without improvisation, GateFlow turns the physical queue into an ordered,
explainable and measurable one:
- deterministic priority with declared fairness;
- calls on public displays;
- a complete audit trail;
- a simulator that quantifies benefits before anything is installed.

It works with the boarding pass the passenger already has, needs no app, and never changes
security or border procedures.

The goal is **not** to eliminate queues: it is to cut missed flights (connections included)
without disproportionate harm to passengers who are not prioritised (ADR-002).

## 2. Product principles

1. Never worse than today because of data: missing data means FIFO, and a system failure means
   the traditional queue.
2. Explainable by construction: reason codes, policy version and reproducible inputs for every
   decision.
3. Quantified fairness: the maximum harm to a non-prioritised passenger is a parameter.
4. The same code in simulation and production.
5. People decide physical actions (lanes, exceptions); the system proposes.
6. Minimal data: no name, booking reference (PNR) or seat is ever stored.

## 3. Modules

| Module | Purpose | Phase |
|---|---|---|
| **GateFlow Simulator** | Prove or disprove the benefit on explicit, labelled assumptions | MVP (first) |
| **GateFlow Priority** | Boarding-pass intake, tickets, queue, calls, access validation, overrides, audit | MVP (in browser) to pilot |
| **GateFlow Predict** | Arrival and queue forecasts at 15/30/60/90 min, lane-opening recommendations | Preview in MVP, V1 |
| **GateFlow Connect** | Passenger information through the airport's website or app; indicative only | V1 |

## 4. Functional requirements

| ID | Requirement |
|---|---|
| FR-01 | Read IATA BCBP (Resolution 792, one or more legs) from paper or phone; hands-free scanning. The reader and the scan endpoint exist since S13 (ADR-043); since S14 the kiosk reads passes from a scanner that types like a keyboard, or typed or pasted by staff (ADR-044). |
| FR-02 | Select the leg relevant to the checkpoint (airport, date); check the flight feed when available. Since S13 the leg from this airport, dated within a day of the scan, for a flight in GateFlow's data. |
| FR-03 | Unreadable, duplicate, expired or wrong-airport passes go to staff assistance, never to automatic access. Since S13 they are refused with a reason, or sent to staff, and create no ticket. |
| FR-04 | Issue a ticket with a stable, readable public number and an opaque QR code (no PNR or name), plus area, status, multilingual instructions and expiry. Since S14: the number, a QR code to the passenger's page, instructions in Italian, English or Spanish, on screen and on paper; area and expiry are not shown yet. |
| FR-05 | Rescanning is idempotent: it retrieves the existing ticket, allows reprinting and shows the status; it never creates duplicates. Every command of the API is idempotent by its key (S12, ADR-042); at the kiosk a rescan shows the same number, to print again (S14). |
| FR-06 | Compute eligibility, risk class and a deterministic explanation; reassess on every relevant event. |
| FR-07 | Fairness controls: cap on priority calls, bound on overtakes, anti-churn, documented manual exceptions. Since S17 the manual exceptions are a supervisor's boosts and calls now, each with a coded reason, counted apart from the engine's priority calls, which keep their cap and bound (ADR-049). |
| FR-08 | Call only for real capacity; second call; no-show timeout; limited recovery window. Since S15 the timeouts apply on time in the live system (a scheduler through the log), staff can call again and mark a no-show, and a no-show comes back by a rescan or by staff within the window (ADR-045). |
| FR-09 | Validate access by operator or reader; at most one admission per ticket (enforced by the database since S12). |
| FR-10 | Public display: called numbers and direction, "prepare" numbers, data freshness; no personal data. Since S16: the numbers called (a second call marked) and the numbers to get ready, live by server-sent events, in the display's language and in English, with the time of the latest news; "not up to date" after 30 seconds and the staff's instructions after 2 minutes; a display that reconnects loses no call (ADR-047). The direction to an access point comes with the lanes (S17). Since S17 a display says when calls are paused, and in an emergency shows only the emergency message (ADR-048). |
| FR-11 | Lane operator station: call next, validate, exceptions, overrides with a reason. Since S15: call next, validate by QR code, boarding pass or number, call again, absences, reviews, manual tickets with a coded reason and the party's size (ADR-045); overrides come with S17. Since S16 the station follows the queue's stream and shows at once what other stations and kiosks do (ADR-047). Since S17 it shows the mode the supervisor set, and calls nobody while calls are paused or stopped (ADR-048); supervisors override the order with a coded reason, through the API until the console's page, and the station marks the tickets they moved up (ADR-049). |
| FR-12 | Operations console: live queue, KPIs, alerts, lanes, modes (normal, FIFO only, paused, emergency). Since S17 the four modes exist, set by a supervisor through the API, with a reset of the prepare window on resuming (ADR-048), and the supervisor sets the lanes open, which the engine's estimates follow at once (ADR-049); the console's page comes with S17's third part. |
| FR-13 | Administration: airports, checkpoints, lanes, devices, users; versioned policies with four-eyes approval and rollback. |
| FR-14 | Audit of every state transition, override and configuration change. Since S12 every command and event of a checkpoint is in an append-only log with a chain of hashes, which an endpoint checks (ADR-042). Since S17 every change of mode, override (with its reason) and change of the lanes open is a command of the log, with who made it, refused attempts included (ADR-048, ADR-049). |
| FR-15 | Data quality: every datum has a source, observation time, validity and confidence; stale data leaves automatic mode for the affected criterion. |
| FR-16 | Dedicated paths for assisted passengers, groups and families, without penalising existing rights. Since S15, staff give a party one number at the lane (ADR-045), and people travelling together take one number at the kiosk by scanning each of their boarding passes onto it; an infant on its parent's boarding pass counts too, once (0.15.1, ADR-046). |
| FR-17 | Defined degraded modes for network or device failure; never disable security barriers. Since S16 a display that loses the server sends passengers to the staff (ADR-047); since S17 the supervisor's emergency stops calls, kiosks and the call timers, so nobody becomes a no-show (ADR-048). |
| FR-18 | Simulator: scenarios (synthetic or from the airport's flight list, with the source and licence of every datum), policies (FIFO, rules, variants, lane opening by a supervisor or by recommendation, with the staff on call and a duty manager who may not follow), multi-seed batches, KPIs, reports, comparisons; in the command line and in the Simulator Studio, a page that runs offline in the browser (ADR-040); the replay of a day with each passenger's journey, the paired outcome and the reason for every call (ADR-041). |
| FR-19 | Forecasts at 15/30/60/90 min, saturation, lane-opening recommendations with logged decisions and outcomes (simulated in S8: ADR-039). |
| FR-20 | Passenger information: current waits, forecast at arrival time, flight-based estimate, indicative priority only. Since S14 the passenger's page shows the ticket's state and what to do now; waits and estimates are not shown yet. |
| FR-21 | Coordination between checkpoints: informative first, operator-driven later, never automatic reassignment. |
| FR-22 | Analytics and exports, with simulated and observed results clearly separated. |

## 5. Non-functional requirements

| ID | Requirement |
|---|---|
| NFR-01 | Deterministic, explainable, verifiable engine, isolated from UI, infrastructure and devices. |
| NFR-02 | Append-only or tamper-evident audit log. |
| NFR-03 | Privacy by design (GDPR art. 5 and 25; Mexican LFPDPPP): minimisation, pseudonymisation, no raw boarding-pass data in logs, minimal retention. |
| NFR-04 | Security: OIDC/SAML, MFA for administrators, scoped RBAC, TLS, encryption at rest, managed secrets, four-eyes approval, network segmentation. Since S15: local staff with roles scoped to an airport's checkpoints, scrypt passwords, HttpOnly sessions, same-site checks; OIDC/SAML and MFA come with the pilot (ADR-045). |
| NFR-05 | Performance targets (hypotheses to negotiate): state propagation < 3 s on a healthy network; device heartbeat < 60 s. |
| NFR-06 | Resilience: defined degraded modes, tested backup and restore; fail-safe never grants access to restricted areas. |
| NFR-07 | Idempotent commands; no duplicates. |
| NFR-08 | Reproducible simulations: seeds, versions, explicit assumptions, byte-identical outputs. |
| NFR-09 | Scalable from small to large airports; multi-airport and multi-tenant from day one in the data model. |
| NFR-10 | Sellable in Italy and Mexico: IT, EN and ES; IANA time zones only; data residency options. The passengers' screens are in Italian, English and Mexican Spanish since S14. |
| NFR-11 | Accessibility of kiosk, display and passenger pages (WCAG 2.2 AA / EN 301 549 target). Since S14 the pages set their language, announce changes of state, keep a visible focus and large touch targets; a formal audit is still to do. |
| NFR-12 | No mandatory hardware in the first phase; replaceable adapters. |
| NFR-13 | Simple infrastructure: no microservices or Kubernetes in phase one. |

## 6. Scope

**MVP (pre-pilot, no hardware):**
- simulator (CLI and browser studio) and priority engine;
- boarding-pass parser and synthetic generator;
- kiosk, display, lane station and supervisor functions in the browser;
- event log and audit, versioned policies;
- a digital-twin demo, where the simulator drives the live system;
- a forecast preview.

**Pilot-ready (after a signed order):**
- real AODB/FIDS adapters, OIDC/MFA, full RBAC, four-eyes policies;
- device registry, lab hardware (HID scanners, thermal printers);
- degraded modes and hardening;
- privacy pack (DPIA support, notices, retention);
- cloud (EU) or on-premises deployment;
- shadow mode.

**V1 and V2:**
- operational Predict, Connect, analytics;
- multi-airport and SLAs;
- coordination between checkpoints;
- ML forecasts, only if they beat statistical baselines.

**Explicit non-features:** facial recognition, behavioural scoring, personalised marketing, paid
fast passes, changes to screening, control of border gates, guaranteed boarding, LLMs in the
decision core, mandatory pre-booking.

## 7. Users and roles (summary)

Passenger (anonymous), lane operator, supervisor, airport administrator, policy approver
(four-eyes), analyst, auditor, service engineer (time-limited access), platform administrator
(break-glass only), and device principals (kiosk, display, access reader). The full permission
matrix is in section 2.6 of the kickoff proposal.

## 8. Regulatory and compliance constraints

These must be checked with counsel; nothing below is legal advice.

- **Aviation security and borders:**
  - EU: Regulation (EC) 300/2008 and Regulation (EU) 2015/1998, ENAC.
  - Mexico: AFAC.
  - Screening, immigration (INM) and customs (ANAM) remain outside the software's perimeter.
- **Privacy:**
  - EU: GDPR. A DPIA is likely; the operator is the controller and GateFlow the processor.
  - Mexico: the new LFPDPPP (in force since 21 March 2025), supervised by the Secretaría
    Anticorrupción y Buen Gobierno; a privacy notice and ARCO rights are required.
  - The public-sector law may apply to state-run airports.
- **AI Act:** a deterministic rule-based engine is plausibly not an "AI system", but it must not
  be self-classified. The 2026 Digital Omnibus moved Annex III high-risk obligations to
  2 December 2027 (to be confirmed in the Official Journal).
- **Other:** NIS2 (supplier security requirements from airport operators) and possibly the
  European Accessibility Act for self-service terminals.

## 9. Open questions (to settle in discovery with the airport)

1. Which checkpoint can actually be authorised, measured and controlled, and who has authority
   over the lane order?
2. Which flight, gate and boarding-close feeds exist, with what latency, and how often are they
   down? Policy v3 stops prioritising on a deadline the feed has not confirmed for 60 minutes
   (ADR-029, ADR-034). In simulation that costs nothing with a reasonably reliable feed; with
   outages of an hour or more GateFlow ends level with today's practice. The freshness target of
   each source is the operator's decision (FR-15).
3. Which Fast Track and PRM rights exist, and how are they respected?
4. Which fairness bounds (k/N, K) and late-arrival eligibility rule does the operator accept?
   Policy v1 uses K = 30 people and at most 10 priority people among any 20 called, with no
   late-presentation rule: in simulation the rule cost flights to genuinely late passengers
   (ADR-025). `priority-v1-strict` keeps it for operators who want it. The S6 sweeps show
   that K = 30 is the largest bound within the fairness criterion, and that in overload today's
   unbounded practice saves far more flights (one lane fewer: 95 per day). Matching it would
   need K = 120, with 13% of the other passengers delayed by more than 5 minutes. Does the
   operator want an approved overload mode with a larger K?
5. How is the baseline measured today (FIFO plus manual handling of urgent passengers)? S3
   models it as staff calling closing flights every five minutes (A', ADR-022), idealised. How
   often staff really call, and how many passengers come forward, decide how strong today's
   practice is.
6. Cloud (EU or Mexico region) or on-premises?
7. How quickly do passengers answer a call at the target checkpoint, and how many miss it? These
   values size the call-ahead buffer and the timeouts (ADR-017, ADR-018), and must be measured,
   for instance in shadow mode. In the S6 sweep this is the assumption the virtual queue is most
   sensitive to: with a median response of 3 minutes instead of 75 seconds, the default
   call-ahead costs 26 flights per day, and a call-ahead of 300 s restores the advantage.
8. Is there, or can there be, a fast-track entry to the lanes for priority passengers, and what is
   its capacity? Policy v2 relies on it to beat today's manual handling (ADR-027): fast-tracked
   passengers pass the people waiting at the lanes, within the bound K.
9. Which data can the airport provide for the value case, under which agreement? The simulator
   reads the airport's flight list and records its source and licence in every report (ADR-036).
   What it needs is listed in [docs/data-request](docs/data-request/README.md): flights of two
   or three design days, the lanes and their throughput, walking times, boarding close, arrival
   histograms and measured waits. Public flight data (OPDI) cannot be used commercially
   (ADR-035).
10. Which checkpoint has the strongest case? In the S7 library GateFlow beats today's idealised
    practice clearly only at the transfer checkpoint of a hub, where connecting passengers
    arrive in waves with mixed deadlines (MX-like: 8.7 more flights per day). At a planned
    VCE-like departures checkpoint the gain is within noise. At a low-cost base with one morning
    bank, staff calling the closing flights is as good or better. The lane throughput and the
    staffing plan decide where a real checkpoint sits (`vce-like-peak-capacity` sweep).
11. Who opens an extra lane today, on what signal, how many can be opened beyond the roster, and
    how fast? Would the duty manager follow a recommendation, and which target wait would the
    operator set? In simulation (S8, ADR-039) extra lanes opened before the waves matter most at
    a hub (19.7 more flights per day than today's practice with a supervisor), and the target
    wait is the setting that trades lane-hours for flights. The staff on call, the time to open a
    lane and today's practice are assumptions until the airport describes them.

## 10. Glossary

- **Assisted path:** passengers with reduced mobility and similar needs are taken by staff to the
  next free lane, outside the queue and the engine; the reason is never recorded (ADR-021).
- **Baseline A':** today's physical queue with staff calling the flights that close soon; the
  benchmark for any claim about today's practice (ADR-022).
- **Checkpoint:** a controlled point (e.g. a departure security filter) with its own logical queue.
- **Lane:** a service unit of the checkpoint, with a throughput.
- **Extra lane:** a lane opened during the day beyond the roster, by the staff on call; it costs
  extra lane-hours (ADR-039).
- **Lane mode:** how a policy opens extra lanes: `@reactive` (a supervisor, on the wait the queue
  shows) or `@predict` (GateFlow's recommendations, from a forecast of arrivals, followed or not
  by the duty manager).
- **Access point:** where tickets are validated before the physical buffer. It is not the screening.
- **Call-ahead buffer:** passengers called in advance so that lanes are not left waiting for
  people walking back; sized in seconds of lane work (ADR-017).
- **Cut-off (deadline):** boarding close of the passenger's flight.
- **Fast track:** priority calls made next, ahead of the prepare window, with the passenger going
  to the next free lane once the ticket is validated; every person passed counts towards K
  (ADR-027).
- **Feasibility margin (F):** the margin below which a passenger counts as unable to make it even
  if called now (CRITICAL), separate from the safety buffer used to detect risk (ADR-023).
- **Group (party):** passengers travelling together on one ticket, called together; every count
  and bound treats them as their number of people (ADR-021).
- **Hysteresis (h):** a ticket escalates at once but returns to a less urgent class only when its
  margin passes the threshold by h, so that classes do not flap (ADR-029).
- **Late-presentation rule:** optional anti-abuse rule: departing passengers who present later
  than a set time before departure are not boosted automatically (ADR-025).
- **Latest call time (L):** the latest moment a passenger can be called and still make it.
- **No-show:** a called ticket not validated after the second call; it can be reactivated by a
  rescan within a limited window, after which the passenger needs a new ticket.
- **Overtake:** a younger ticket called before an older one.
- **Physical queue:** today's operation: passengers stand in line and step forward when a lane is
  free. It is the status-quo baseline of every comparison (ADR-015).
- **Policy:** a versioned, approved set of parameters: how the next ticket is selected and how the
  queue is operated (ADR-016).
- **Prepare window:** the next M tickets, committed and shown on displays as "prepare"; they are
  called in that order and never removed (no churn).
- **Shadow mode:** decisions are computed and logged but not applied physically.
- **Stale data:** a deadline that its source has not confirmed for longer than the maximum age;
  the ticket is UNVERIFIED and served in FIFO order until the source confirms it again (ADR-029).
- **Virtual queue:** GateFlow's operation: passengers hold a ticket, wait anywhere and are called
  on displays.
