# Flight lists (format `gateflow.flights/1`)

A scenario can take its design day from a CSV file instead of an hourly profile
(`schedule.kind: flight-list`). This is the format in which an airport can give GateFlow its
schedule. It is also the format of the synthetic flight lists of the scenario library in this
folder.

## Format

- One departure per row, a header row first, the columns in any order.
- Only `flight` and `std` are required.
- Lines starting with `#` are comments.
- Fields may be quoted (`"Paris, CDG"`). A header separated by semicolons makes the whole file
  semicolon-separated, as spreadsheets in many European locales write it.

| Column | Required | Meaning |
|---|---|---|
| `flight` | yes | Identifier of the departure, unique in the list, without spaces (for example a flight number) |
| `std` | yes | Scheduled departure, local time of the service day, `HH:MM` |
| `aircraft` | no | Aircraft type, preferably the ICAO type designator (`A320`, `B738`) |
| `seats` | no | Seats of the flight. Without them, the seats of the aircraft type in the scenario's `schedule.seats` table are used |
| `passengers` | no | Expected passengers through the checkpoint. When given they are used as they are; otherwise passengers are drawn as seats x load factor on every simulated day |
| `gate_zone` | no | Gate zone of the departure, one of the scenario's `schedule.gateZones`. When missing, a zone is drawn from the zone shares (the same on every simulated day) |
| `destination` | no | Destination, informative |

Every flight needs `passengers`, `seats` or an `aircraft` type listed in `schedule.seats`. The
scenario names the file and the entry of `dataSources` it comes from:

```yaml
schedule:
  kind: flight-list
  generatorSeed: 20261121
  flights:
    source: airport-schedule      # an id of dataSources, with the licence of the data
    file: flights/peak-day.csv    # relative to the scenario file
  seats: { value: [{ aircraft: A320, seats: 180 }], source: SYNTHETIC }
  gateZones: { value: [{ id: A, walkMinutes: 5, share: 1 }], source: SYNTHETIC }
```

The simulator reads the file when it loads the scenario, records its SHA-256 in the manifest of
every result, and lists the source and its licence in every report.

`gateflow-sim flights --scenario <file> --out <file.csv>` writes the design day of any scenario in
this format. A flight list scenario made of those rows, with the same gate zones, simulates exactly
the same passengers (this is tested).

## The synthetic flight lists of the library

| File | Departures | Used by |
|---|---:|---|
| `vce-like-normal-day.csv` | 116 | `vce-like-normal-day` |
| `vce-like-peak-day.csv` | 138 | `vce-like-peak-day`, `vce-like-disrupted-day` |
| `tsf-like-peak-day.csv` | 34 | `tsf-like-peak-day` |
| `mx-like-transfer-hub.csv` | 58 | `mx-like-transfer-hub` |

They are **synthetic**, written by `make-library-flights.mjs` from a short description of each day:
- departures per hour;
- a mix of aircraft types;
- the long-haul departures at fixed times;
- for the hub, connecting passengers as a share of the seats.

Flight identifiers, times, aircraft and passenger counts are invented. No third-party schedule data
is used. The size of the VCE-like and TSF-like days follows SAVE's published 2025 traffic, as each
scenario explains. `node scenarios/flights/make-library-flights.mjs --check` verifies that the
files match the script (CI runs it).

Public flight data were considered and not used. OPDI (EUROCONTROL with the OpenSky Network) and
EUROCONTROL's performance data portal are published for non-commercial use: see ADR-035 in
[DECISIONS.md](../../DECISIONS.md).
