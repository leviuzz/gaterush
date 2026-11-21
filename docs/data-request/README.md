# Data request: what GateFlow needs from an airport to simulate its checkpoint

This list is for the discovery phase with an airport (R3). With these data the simulator replaces
its synthetic assumptions with the airport's own, and reports what GateFlow would change at that
checkpoint, with confidence intervals, before anything is installed.

**No personal data is needed.** Every item is a schedule, a configuration or an aggregate count.
GateFlow does not need boarding passes, names, booking references or images for the simulation.
The data stays the airport's: it is used under a data agreement, kept outside the public parts of
the repository (see below), and every report names the source and its terms of use.

## 1. Flights of two or three design days

A normal day, a peak day and, if possible, a disrupted day, as a CSV file in the
[`gateflow.flights/1`](../../scenarios/flights/README.md) format. One row per departure whose
passengers cross the checkpoint:

| Column | Example | Notes |
|---|---|---|
| `flight` | `XY1234` | Any unique identifier |
| `std` | `06:05` | Scheduled departure, local time |
| `aircraft` | `A320` | ICAO type designator |
| `seats` | `180` | Optional if the aircraft type is given |
| `passengers` | `164` | Best: booked or expected passengers through this checkpoint |
| `gate_zone` | `B` | Gate or pier group, with the walking time of each group (item 3) |

A spreadsheet export is fine. Semicolons and quoted fields are accepted. The CSV template is
[`flight-list-template.csv`](flight-list-template.csv).

## 2. The checkpoint

- Lanes that physically exist, and the lanes planned per hour on the design days (the roster or
  the opening plan).
- Throughput per lane: passengers per hour, or the measured mean screening time per person, at
  normal and peak times.
- How lanes are opened or closed during the day, and how quickly.
- Fast-track lanes and assisted-passenger (PRM) paths: how many, which rights, which rules.

## 3. Walking times and boarding

- Walking time from the checkpoint exit to each gate zone, including passport control where it
  applies.
- Boarding close per airline (minutes before departure), and whether it varies by flight.

## 4. Passenger arrivals (aggregate)

- When passengers reach the checkpoint relative to their departure: a histogram by
  10-minute band, from the boarding-pass readers at the checkpoint entrance, for the design
  days. Counts only.
- The share of connecting passengers crossing the checkpoint and, at a transfer checkpoint,
  the distribution of the time left before departure.

## 5. Waiting times and missed flights (to validate the model)

- Measured waiting times at the checkpoint, per hour if possible (median and 90th percentile),
  and the definition of the indicator of the service charter.
- Missed flights or passengers off-loaded because of the queue, if recorded, and how staff
  handle urgent passengers today (calls of closing flights, escorts, how often).

## 6. Flight data feed

- Which system gives delays, gate changes and boarding close (AODB, FIDS), with what delay, and
  how often it is down (outages per month and their length).

## Handling of the data in the project

- Put the airport's files in `scenarios/private/` (ignored by git) or in a separate private
  repository, never in the shared reports.
- Describe them in the scenario's `dataSources` with the provider, the agreement and the terms of
  use (for example "evaluation only, under the NDA of DD/MM/YYYY"): the reports print it.
- Results remain SIMULATED: they show what the model predicts under the airport's assumptions, and
  are to be checked against measurements in shadow mode before any operational claim.
