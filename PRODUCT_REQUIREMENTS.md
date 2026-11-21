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
| FR-01 | Read IATA BCBP (Resolution 792, one or more legs) from paper or phone; hands-free scanning. |
| FR-02 | Select the leg relevant to the checkpoint (airport, date); check the flight feed when available. |
| FR-03 | Unreadable, duplicate, expired or wrong-airport passes go to staff assistance, never to automatic access. |
| FR-04 | Issue a ticket with a stable, readable public number and an opaque QR code (no PNR or name), plus area, status, multilingual instructions and expiry. |
| FR-05 | Rescanning is idempotent: it retrieves the existing ticket, allows reprinting and shows the status; it never creates duplicates. |
| FR-06 | Compute eligibility, risk class and a deterministic explanation; reassess on every relevant event. |
| FR-07 | Fairness controls: cap on priority calls, bound on overtakes, anti-churn, documented manual exceptions. |
| FR-08 | Call only for real capacity; second call; no-show timeout; limited recovery window. |
| FR-09 | Validate access by operator or reader; at most one admission per ticket. |
| FR-10 | Public display: called numbers and direction, "prepare" numbers, data freshness; no personal data. |
| FR-11 | Lane operator station: call next, validate, exceptions, overrides with a reason. |
| FR-12 | Operations console: live queue, KPIs, alerts, lanes, modes (normal, FIFO only, paused, emergency). |
| FR-13 | Administration: airports, checkpoints, lanes, devices, users; versioned policies with four-eyes approval and rollback. |
| FR-14 | Audit of every state transition, override and configuration change. |
| FR-15 | Data quality: every datum has a source, observation time, validity and confidence; stale data leaves automatic mode for the affected criterion. |
| FR-16 | Dedicated paths for assisted passengers, groups and families, without penalising existing rights. |
| FR-17 | Defined degraded modes for network or device failure; never disable security barriers. |
| FR-18 | Simulator: scenarios, policies (FIFO, rules, variants, lane opening), multi-seed batches, KPIs, reports, comparisons. |
| FR-19 | Forecasts at 15/30/60/90 min, saturation, lane-opening recommendations with logged decisions and outcomes. |
| FR-20 | Passenger information: current waits, forecast at arrival time, flight-based estimate, indicative priority only. |
| FR-21 | Coordination between checkpoints: informative first, operator-driven later, never automatic reassignment. |
| FR-22 | Analytics and exports, with simulated and observed results clearly separated. |

## 5. Non-functional requirements

| ID | Requirement |
|---|---|
| NFR-01 | Deterministic, explainable, verifiable engine, isolated from UI, infrastructure and devices. |
| NFR-02 | Append-only or tamper-evident audit log. |
| NFR-03 | Privacy by design (GDPR art. 5 and 25; Mexican LFPDPPP): minimisation, pseudonymisation, no raw boarding-pass data in logs, minimal retention. |
| NFR-04 | Security: OIDC/SAML, MFA for administrators, scoped RBAC, TLS, encryption at rest, managed secrets, four-eyes approval, network segmentation. |
| NFR-05 | Performance targets (hypotheses to negotiate): state propagation < 3 s on a healthy network; device heartbeat < 60 s. |
| NFR-06 | Resilience: defined degraded modes, tested backup and restore; fail-safe never grants access to restricted areas. |
| NFR-07 | Idempotent commands; no duplicates. |
| NFR-08 | Reproducible simulations: seeds, versions, explicit assumptions, byte-identical outputs. |
| NFR-09 | Scalable from small to large airports; multi-airport and multi-tenant from day one in the data model. |
| NFR-10 | Sellable in Italy and Mexico: IT, EN and ES; IANA time zones only; data residency options. |
| NFR-11 | Accessibility of kiosk, display and passenger pages (WCAG 2.2 AA / EN 301 549 target). |
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
   down? Policy v3 stops prioritising on a deadline the feed has not confirmed for 30 minutes
   (ADR-029). In simulation, with about one outage a day, that costs 0.3 flights per day, almost
   all on the days when the feed is down for more than an hour. With a feed down for hours a day
   GateFlow falls back to FIFO and loses its advantage over today's practice. The freshness
   target of each source is the operator's decision (FR-15).
3. Which Fast Track and PRM rights exist, and how are they respected?
4. Which fairness bounds (k/N, K) and late-arrival eligibility rule does the operator accept?
   Policy v1 uses K = 30 people and at most 10 priority people among any 20 called, with no
   late-presentation rule: in simulation the rule cost flights to genuinely late passengers
   (ADR-025). `priority-v1-strict` keeps it for operators who want it.
5. How is the baseline measured today (FIFO plus manual handling of urgent passengers)? S3
   models it as staff calling closing flights every five minutes (A', ADR-022), idealised. How
   often staff really call, and how many passengers come forward, decide how strong today's
   practice is.
6. Cloud (EU or Mexico region) or on-premises?
7. How quickly do passengers answer a call at the target checkpoint, and how many miss it? These
   values size the call-ahead buffer and the timeouts (ADR-017, ADR-018), and must be measured,
   for instance in shadow mode.
8. Is there, or can there be, a fast-track entry to the lanes for priority passengers, and what is
   its capacity? Policy v2 relies on it to beat today's manual handling (ADR-027): fast-tracked
   passengers pass the people waiting at the lanes, within the bound K.

## 10. Glossary

- **Assisted path:** passengers with reduced mobility and similar needs are taken by staff to the
  next free lane, outside the queue and the engine; the reason is never recorded (ADR-021).
- **Baseline A':** today's physical queue with staff calling the flights that close soon; the
  benchmark for any claim about today's practice (ADR-022).
- **Checkpoint:** a controlled point (e.g. a departure security filter) with its own logical queue.
- **Lane:** a service unit of the checkpoint, with a throughput.
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
