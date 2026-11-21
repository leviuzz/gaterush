# Airport configurations

One file per airport (`airports/<id>.yaml`) holds every parameter of the airport that does not
change from one day to the next, with the source and licence of each. A scenario then names the
airport and one of its checkpoints, and gives only its day:

```yaml
schemaVersion: 5
extends:
  airport: ../airports/vce-like.yaml
  checkpoint: departures
id: vce-like-peak-day
title: ...
description: ...
schedule:
  kind: flight-list
  generatorSeed: 20261121
  flights: { source: library-flights, file: flights/vce-like-peak-day.csv }
passengers:
  loadFactor: { value: { min: 0.72, mode: 0.9, max: 1 }, source: SYNTHETIC }
```

The simulator composes the scenario in this order, each part overriding the previous one:
1. the airport's `defaults`;
2. the checkpoint's `scenario` part;
3. the day.

Objects merge key by key; a labelled parameter (`value` and `source`), a list or a plain value
replaces the previous one as a whole. The report of every run names the airport configuration,
its checkpoint and the SHA-256 of the file.

| File | Airport | Checkpoints |
|---|---|---|
| `vce-like.yaml` | VCE-like (synthetic, sized from Venice's 2025 traffic) | `departures` (12 lanes) |
| `tsf-like.yaml` | TSF-like (synthetic, sized from Treviso's 2025 traffic) | `departures` (5 lanes) |
| `mx-like-hub.yaml` | MX-like hub (synthetic) | `transfer` (4 lanes) |

## What goes where

| Where | Parameters | Item of the [data request](../docs/data-request/README.md) |
|---|---|---|
| top level | `id`, `name`, `timeZone`, `dataClassification`, `dataSources` (with the terms of the data agreement) | - |
| `defaults.schedule.seats` | seats by aircraft type, for flights without seats | 1 |
| checkpoint `scenario.checkpoint` | `lanesAvailable` (lanes the checkpoint has), `lanePlanRule` (how lanes are planned) or a fixed `laneSchedule`, `serviceTimeMeanSeconds` and `serviceTimeCv` (throughput of a lane) | 2 |
| checkpoint `scenario.schedule.gateZones` | gate zones with the walking time from the checkpoint exit and their share of departures | 3 |
| `defaults.operations` | `boardingCloseMinutesBeforeStd`, `deadlineKnowledge` (rule, feed or none) | 3, 6 |
| `defaults.passengers` | `showUp` (when passengers reach the checkpoint), `transferShare`, `walkSpeedSigma`, `callResponse`, `groups`, `assistedShare`, `strategicLateArrival` | 4 |
| `defaults.disruptions` | typical delays, gate changes, lane outages and feed outages (a day may override them) | 6 |
| `defaults.todayPractice` | how staff call closing flights today (baseline A'): `callWindowMinutes`, `announcementIntervalMinutes` | 5 |
| `defaults.gateflow` | GateFlow settings approved for the checkpoint: `maxOvertakes` (K), `capMaxPriorityCalls` and `capWindowCalls` (k among N), `hysteresisMinutes`, `maxDeadlineAgeMinutes`, `prepareWindowSize`, `callAheadSeconds`, `responseEstimateSeconds` | decided with the airport |
| `defaults.fairnessTarget` | `maxShareDelayedOver5Min`: the share of other passengers that may wait more than 5 minutes longer; every report says whether it is met | decided with the airport |

Any of these can move from `defaults` to a checkpoint's `scenario` part when it differs between
checkpoints; the day file may override anything for that day (for instance `groups` on a summer
peak day, or `disruptions` on a disrupted day).

The GateFlow settings apply to the policies simulated on that checkpoint:
- the fairness bounds go to every priority policy;
- the hysteresis and the maximum data age go only to the versions that have those rules (v3);
- the virtual-queue settings go to every virtual queue;
- today's practice goes to baseline A'.

Each report lists every parameter of every policy and notes where it differs from the preset.

## Lane plans

A checkpoint with `lanesAvailable` and `lanePlanRule` does not need a lane plan for every day.
When a day gives no `checkpoint.laneSchedule`, the simulator plans one from the rule: in every
interval, enough lanes to screen the expected arrivals of that interval at the rule's
utilisation, between `minLanes` and the lanes the checkpoint has. The expected arrivals are the
average of simulated days 1 to `planningDays`.

Planning takes a few seconds for a large day. To fix a plan in the day file (as an airport fixes
a roster), print it with:

```bash
pnpm sim lanes --scenario scenarios/vce-like-peak-day.yaml
```

The library days carry their plans this way; a test checks that they are what the rule gives.

## Setting up a real airport

1. Copy the closest synthetic file to `airports/private/<id>.yaml` and its days to
   `scenarios/private/` (both folders are ignored by git: the airport's data never enters the
   shared repository).
2. Add a data source for each document the airport sends, with the terms of the agreement in
   `licence`.
3. Replace each value with the airport's. Set its `source` to `AIRPORT_PROVIDED` (or `MEASURED`),
   with `ref` naming the data source, and update its note.
4. Put the airport's flight lists next to the days (format: [scenarios/flights](../scenarios/flights/README.md)).
5. Validate and simulate:

   ```bash
   pnpm sim validate --scenario scenarios/private/<day>.yaml
   ```

   ```bash
   pnpm sim run --scenario scenarios/private/<day>.yaml --seeds 1-200
   ```

Set `dataClassification` to `AIRPORT_PROVIDED` once every value comes from the airport, `MIXED`
before that. Results stay SIMULATED: they show what the model predicts with the airport's data.
