---
name: verify-scheduler
description: "Use when you need proof that the Prosper appointment-availability scheduler (findAvailableSlots in src/schedulerApi.ts, a TypeScript library run through npm run dev) returns the right slots for a real patient input - after changing scheduling logic, before claiming a README task works, or when unit tests pass but nobody has looked at actual output."
---

# Verify the Prosper scheduler

## Surface

The app is a TypeScript library with a one-line CLI wrapper. The user-facing path is
`findAvailableSlots(patient)` in `src/schedulerApi.ts`, called by `src/index.ts`, which
`npm run dev` executes through ts-node and prints to stdout. There is no server, no UI,
no database: the "database" is in-memory seed data under `src/starter-code/` and
`src/mockAppointmentOrm.ts`, served through three mock repositories
(`src/mockClinicianOrm.ts`, `src/mockSlotOrm.ts`, `src/mockAppointmentOrm.ts`). Jest
(`npm test`) is the secondary surface; it covers the repositories, the local day and week
helpers (`src/localDay.ts`), the Task 2 filter, and the scheduler.

The scheduler is a pure function over the seed data. Driving it means: build a patient,
call the function the same way `index.ts` does, record what came back. As of 2026-10-14 it
returns one group per eligible psychologist, `{ clinician: { id, firstName, lastName,
timezone }, options: { first, second }[] }`, where each option is a two-session assessment
pair. Slot dates are UTC instants; "which day" a slot falls on is judged on the clinician's
own calendar, the IANA zone in `clinician.timezone`, never in UTC. The clinician's existing
appointments and daily and weekly maximums limit what is offered (`src/capacity.ts`).

## Launch

Short-lived CLI: nothing stays running. Launch means install once; each drive is its own
node process.

```
npm ci
```

Run from the repo root when `node_modules/` is missing. Ready means Doctor reports
`RESULT: READY`. No migrations, no seed step: the seed modules load on every require.

Seed data an agent can rely on (verified 2026-10-14):

- Patient Byrne Hollander, state `NY`, insurance `AETNA` (`src/starter-code/mock-patient.ts`).
- One clinician, Dr. Jane Doe, id `9c516382-c5b2-4677-a7ac-4e100fa35bdd`, PSYCHOLOGIST,
  states `NY, CA`, insurances `AETNA, CIGNA`, time zone `America/New_York`, max 2 per day,
  max 8 per week (`src/starter-code/mock-clinician.ts`). Her `availableSlots` come from
  the slot repository and her `appointments` from the appointment repository.
- Three slot sets, selected by the `SEED_SLOTS` environment variable, which
  `src/mockSlotOrm.ts` reads when it loads. All are 90-minute slots stored as UTC instants,
  for Dr. Doe.
  - `small` (default): six slots on four days, `2024-08-19T12:00Z`, `12:15Z`,
    `2024-08-21T12:00Z`, `15:00Z`, `2024-08-22T15:00Z`, `2024-08-28T12:15Z`. The README's
    worked example; what the user runs by hand.
  - `full`: the 458-row dump, `2024-08-19T12:00Z` through `2024-09-26T22:30Z`, 27 days,
    mostly 15-minute ladders. The realistic table. With no appointments it gives 37,110
    options. The uncapped Task 2 rule gave 9,999, but Dr. Doe takes at most 2 sessions a
    day, so any start inside a chain of 2 is offered even where a ladder could pack 7.
  - `midnight`: six slots around New York midnight, `2024-08-20T03:00Z`, `03:15Z`,
    `13:00Z`, `2024-08-21T02:30Z`, `2024-08-27T12:00Z`, `2024-08-28T03:30Z`. Four UTC days
    but three New York days (08-19, 08-20, 08-27), so a UTC-day scheduler gives a different
    answer (9 options instead of 8). The zone proof.
  Verification covers the small and full seeds for every recipe unless its feature file
  says the seed does not matter, and the midnight seed where a feature file names it. Any
  other `SEED_SLOTS` value makes the app throw at load; `src/mockSlotOrm.ts` is the only
  validator, so drive.js reports it as exit 2 and doctor.js as NOT READY.
- Two appointment sets, selected by the `SEED_APPOINTMENTS` environment variable, which
  `src/mockAppointmentOrm.ts` reads when it loads. `src/starter-code/mock-clinician.ts`
  embeds the same rows as `clinician.appointments`, but the scheduler reads the repository.
  - `none` (default): no appointments. Every result above assumes it.
  - `busy`: 11 rows for Dr. Doe in the week of 2024-08-19, 7 of which hold her time
    (`UPCOMING`, `OCCURRED`, `NO_SHOW`). The small seed then gives 2 options, the full seed
    36,515, and the midnight seed no groups (New York 08-19 and 08-20 are full, the week
    holds 7 of 8, and 08-27 has no partner left). The capacity proof.
  Any other `SEED_APPOINTMENTS` value makes the app throw at load, like `SEED_SLOTS`.
- No 60-minute slots in any set. Therapy journeys are blocked on seed preconditions; see
  the feature map.

Isolation: every drive is a fresh process reading in-memory data, so concurrent drives
cannot interfere. Give each verification run its own `--run <id>` so evidence does not mix.

## Doctor

```
node .agents/skills/verify-scheduler/scripts/doctor.js
```

Read-only. Confirms repo root, node >= 18, dependencies installed, a clean full
`tsc --noEmit`, that `findAvailableSlots` is exported, and that the seed patient and
clinician load, with slot counts and lengths. It reports the appointment count, how many
hold time, and the set (`11 appointments (busy), 7 hold the clinician's time`), and checks
that `clinician.appointments` has the same ids as the appointment repository. Warns (not
fails) when the seed lacks 60-minute slots, or has no appointments under `none`; fails when
`busy` yields no rows. Exit 0 = READY, exit 1 = do not drive. Add `--seed full` to check
the full dump and `--appointments busy` to check the busy calendar (the report names
both), and `--out <file.json>` to keep the report as evidence. Run it first whenever
anything looks off, and again after any failed drive.

## Drive

```
node .agents/skills/verify-scheduler/scripts/drive.js --feature <feature-id> --run <run-id> [options]
```

Calls `findAvailableSlots(patient)` in-process through ts-node with full type-checking,
the same path `npm run dev` takes. The patient defaults to the seed patient; override with
`--state`, `--insurance`, `--first`, `--last`, `--patient-id`. Values are validated against
the repo's `UsStateAbbreviations` and `InsurancePayers`. `--seed small|full|midnight`
(default small) sets `SEED_SLOTS` before the app loads, exactly as `SEED_SLOTS=full npm run dev`
would. `--appointments none|busy` (default none) sets `SEED_APPOINTMENTS` the same way. Both
are recorded in `summary.json` and appended to the default label when not the default.

Expectations turn the drive into a pass/fail step:

- `--expect-min N` / `--expect-max N`: bounds on top-level result count.
- `--expect-contains <iso,...>` / `--expect-absent <iso,...>`: slot `date` values that must
  or must not appear anywhere in the output.

Exit 0 means the scheduler ran and every expectation held, 1 means an expectation failed,
2 means the scheduler threw or the harness could not run. `--print` echoes the full output.

The summary is shape-agnostic: it counts top-level items, collects every `date` string it
finds at any depth, and buckets them by the nearest `clinicianId`. If the implementation
changes the return type (pairs, groups, maps), the summary still works and the feature
files say what to inspect by hand.

```
node .agents/skills/verify-scheduler/scripts/pairs.js .verify-evidence/<run-id>/<feature>/<label> [--max-gap-days 7]
```

Checks the README pairing rule over a drive's `output.json`: each option is one clinician
(the group's clinician), on different days of that clinician's calendar, `second` on a
later day than `first`, at most 7 days apart. The day of each slot is computed from the
group's `clinician.timezone` with the harness's own offset arithmetic
(`localDayByOffset` in `common.js`), not with the app's `localDayOf`, so the two cannot share a
bug. It reads clinician groups with `{ first, second }` options only; a group without a
`timezone`, or with one Intl does not know, is exit 2, never a UTC fallback. Exit 0 when
all pairs are valid, 1 when any violates. It writes `pairs.json` next to the output as
evidence, with each pair's `timezone`, `firstDay`, and `secondDay`.

```
node .agents/skills/verify-scheduler/scripts/optimized.js .verify-evidence/<run-id>/<feature>/<label>
```

Checks README Task 2, capped by Task 3, over a drive's evidence. For each clinician group
it looks the clinician up in the real clinician repository (the psychologists for
`summary.json`'s patient) to get their time zone and maximums, loads the unfiltered slots
and the appointment rows through the real repositories (using the seed and appointment
set recorded in `summary.json`), and buckets by the local day in the repository's zone.
Per day it drops starts that overlap a held appointment, takes room as the smaller of
`maxDailyAppointments` minus the day's held count and `maxWeeklyAppointments` minus the
week's, sets the target to the smaller of the longest chain and the room, and re-derives
the starts whose longest chain reaches the target with its own implementation. It
compares that to the starts the drive offered. A group whose `clinician.timezone` differs
from the repository's fails, and so does a slot whose length is not 90 minutes. An offered
day with nothing expected fails as `no room`. Days the scheduler offered nothing for are
reported as unoffered and do not fail. Exit 0 when every group and offered day matches, 1
when any has an extra or missing start, a zone mismatch, or a non-90 slot, 2 when the
output is not clinician groups, a group has no `timezone`, or an appointment has an
unknown status or type. Writes `optimized.json` with each day's `timezone`, held count,
room, and target.

```
node .agents/skills/verify-scheduler/scripts/capacity.js .verify-evidence/<run-id>/<feature>/<label>
```

Checks README Task 3 over a drive's evidence with the harness's own tables (`HARNESS_HELD_STATUSES`,
`HARNESS_SESSION_MINUTES`, and a Monday week start in `common.js`), never the app's
`src/capacity.ts` or `src/localDay.ts`. It loads the eligible psychologists, their slots,
and their appointment rows through the real repositories. The soundness check requires
that no offered session overlaps a held appointment (`overlap`), that each session's day
stays within the daily maximum (`daily`), and that each week stays within the weekly
maximum, counting both sessions when they share a week (`weekly`, `weekly-pair`). The
closure check groups the offered slots by local day and requires the options to be
exactly the pairs of those slots 1 to 7 days apart that pass soundness. The completeness
check requires a slot day with a free slot and room to be offered exactly when another
such day 1 to 7 days away can pair with it. Exit 0 when nothing is violated, 1 when
anything is, 2 when the evidence is not checkable (not groups, no `timezone`, a zone that
differs from the repository's, no `summary.appointments`, or an unknown status or type).
Under `none` it prints `vacuous: 0 held` and exits 0. Writes `capacity.json` with the zone,
maximums, held and freed rows, held counts per day and week, and every problem.

Feature recipes live in [features/README.md](features/README.md). Drive the feature's
listed entry points, not just the convenient one.

## Evidence

Location: `<repo>/.verify-evidence/<run-id>/<feature-id>/<label>/` (gitignored). Each
drive writes:

- `command.txt`: exact argv and cwd.
- `input.json`: the patient passed in.
- `output.json`: the full return value, Dates as ISO strings, or the thrown error.
- `summary.json`: counts, slot date range, per-clinician counts, expectations with
  pass/fail, duration, node version, and sha256 of `src/schedulerApi.ts` so the proof is
  tied to a code version.

Keep the doctor report next to it: `doctor.js --out .verify-evidence/<run-id>/doctor.json`.

Size: a full-seed eligible drive writes about 22 MB of `output.json` (37,110 options for
one psychologist with no appointments, 36,515 with the busy set). Do not trim the output
to save space.

Proof standards for this app:

- Exercise the real user path: `findAvailableSlots(patient)` with a patient object. Do not
  call internal helpers, and do not add test-only exports to make a journey pass.
- Capture action and result: `command.txt` + `input.json` are the action, `output.json` +
  `summary.json` are the result. A summary alone is not proof; the full output must be
  present.
- Side effects: the scheduler is expected to have none. It must not write files, open
  sockets, or mutate seed modules. If a drive leaves anything in the working tree besides
  evidence, that is a finding.
- Mocks: the in-memory seed modules are the production boundary stand-in for the EHR
  tables. No other mocking.
- A failing expectation that encodes a README rule is a finding, not a harness problem.
  Report it; do not loosen the expectation.

## Cleanup

```
node .agents/skills/verify-scheduler/scripts/cleanup.js --run <run-id>
```

Nothing to kill: the harness starts no server and no background process, and every drive
exits on its own. Cleanup never deletes evidence; it lists the run's evidence files and
exits 1 if they are missing, so a cleanup that ate the proof is caught. If you ran
`npm run compile` during the run, add `--remove-dist` to delete `dist/`.

## Helpers

All helpers are plain Node scripts invoked with `node`, so they work in PowerShell,
Git Bash, and POSIX shells alike. Paths are relative to the repo root.

| Script | Invocation | Purpose |
| --- | --- | --- |
| doctor | `node .agents/skills/verify-scheduler/scripts/doctor.js [--seed small\|full\|midnight] [--appointments none\|busy] [--out <file>]` | Read-only readiness check; reports the seed clinician's time zone and appointments |
| drive | `node .agents/skills/verify-scheduler/scripts/drive.js --feature <id> --run <id> [--seed small\|full\|midnight] [--appointments none\|busy] [...]` | Run the scheduler for a patient on one seed and appointment set, write evidence, assert expectations |
| cleanup | `node .agents/skills/verify-scheduler/scripts/cleanup.js --run <id> [--remove-dist]` | Confirm evidence survived; remove `dist/` on request |
| pairs | `node .agents/skills/verify-scheduler/scripts/pairs.js <evidence-dir> [--max-gap-days 7]` | Check every option in a drive's output against the pairing rule, with days judged in the group's `clinician.timezone` |
| optimized | `node .agents/skills/verify-scheduler/scripts/optimized.js <evidence-dir>` | Check every offered local day against the Task 2 rule, capped by the day's room, with an independent implementation, and the group's zone against the clinician repository |
| capacity | `node .agents/skills/verify-scheduler/scripts/capacity.js <evidence-dir>` | Check every option and offered day against the Task 3 rules (overlap, daily, weekly, pair closure, day completeness) with the harness's own tables |

`.claude/skills/verify-scheduler` is a directory junction to `.agents/skills/verify-scheduler`
(the other skills in this repo are symlinks; creating a symlink needs admin rights on this
machine, a junction does not). Either path works in commands.

## Minimal full pass

```
RUN=$(date +%Y%m%d-%H%M%S)
node .agents/skills/verify-scheduler/scripts/doctor.js --out .verify-evidence/$RUN/doctor.json
node .agents/skills/verify-scheduler/scripts/drive.js --feature assessment-slots --run $RUN --label assess-eligible --expect-min 1 --expect-contains 2024-08-19T12:00:00.000Z
node .agents/skills/verify-scheduler/scripts/pairs.js .verify-evidence/$RUN/assessment-slots/assess-eligible
node .agents/skills/verify-scheduler/scripts/drive.js --feature assessment-slots --run $RUN --seed full --label assess-eligible-full --expect-min 1 --expect-contains 2024-08-19T12:00:00.000Z,2024-09-26T22:30:00.000Z
node .agents/skills/verify-scheduler/scripts/pairs.js .verify-evidence/$RUN/assessment-slots/assess-eligible-full
node .agents/skills/verify-scheduler/scripts/drive.js --feature assessment-slots --run $RUN --seed midnight --label assess-midnight --expect-min 1 --expect-max 1 --expect-contains 2024-08-20T03:00:00.000Z,2024-08-28T03:30:00.000Z
node .agents/skills/verify-scheduler/scripts/pairs.js .verify-evidence/$RUN/assessment-slots/assess-midnight
node .agents/skills/verify-scheduler/scripts/optimized.js .verify-evidence/$RUN/assessment-slots/assess-midnight
node .agents/skills/verify-scheduler/scripts/doctor.js --appointments busy --out .verify-evidence/$RUN/doctor-busy.json
node .agents/skills/verify-scheduler/scripts/drive.js --feature clinician-capacity --run $RUN --appointments busy --label cap-busy --expect-min 1 --expect-max 1 --expect-absent 2024-08-19T12:00:00.000Z,2024-08-19T12:15:00.000Z,2024-08-21T15:00:00.000Z --expect-contains 2024-08-21T12:00:00.000Z,2024-08-22T15:00:00.000Z,2024-08-28T12:15:00.000Z
node .agents/skills/verify-scheduler/scripts/capacity.js .verify-evidence/$RUN/clinician-capacity/cap-busy
node .agents/skills/verify-scheduler/scripts/optimized.js .verify-evidence/$RUN/clinician-capacity/cap-busy
node .agents/skills/verify-scheduler/scripts/drive.js --feature clinician-capacity --run $RUN --seed full --appointments busy --label cap-daily-full --expect-absent 2024-08-19T12:00:00.000Z,2024-08-21T15:00:00.000Z --expect-contains 2024-08-21T12:00:00.000Z,2024-08-26T13:30:00.000Z
node .agents/skills/verify-scheduler/scripts/capacity.js .verify-evidence/$RUN/clinician-capacity/cap-daily-full
node .agents/skills/verify-scheduler/scripts/cleanup.js --run $RUN
```

Then run the crafted negatives from `features/clinician-capacity.md` on copies of the
`cap-busy` evidence. Each must make capacity.js exit 1 and name its rule.

In PowerShell, set the run id with `$RUN = Get-Date -Format yyyyMMdd-HHmmss`; the `node`
commands are then identical.

Proven 2026-10-14 (run `task3-105115`) on this checkout after README Tasks 1 to 3 and the
clinician time zone column landed. Doctor was READY under `none`, with two seed warnings,
and under `busy`, with `11 appointments (busy), 7 hold the clinician's time` and
`same 11 ids`. With no appointments: `assess-eligible` exit 0 with one group of 11 options,
pairs.js 11 pairs and 0 invalid, optimized.js 4 of 4 days ok, capacity.js `vacuous: 0 held`.
`assess-eligible-full` exit 0 with 37,110 options in 22 MB, pairs.js 0 invalid,
optimized.js 27 of 27 days ok. `assess-midnight` exit 0 with 8 options, pairs.js 0
invalid, optimized.js 3 of 3 days ok. The `opt-ladder`, `opt-short-block`,
`opt-independent`, and `cap-none` drives exit 0. With the busy set: `cap-busy` exit 0 with
exactly the two options (`2024-08-21T12:00Z` and `2024-08-22T15:00Z`, each with
`2024-08-28T12:15Z`), pairs.js 2 pairs, optimized.js 3 of 3 offered days ok with 08-19
unoffered at room 0, and capacity.js exit 0 with held 7, freed 4, and no problems.
`cap-daily-full` exit 0 with 36,515 options, pairs.js 0 invalid, optimized.js 26 of 26 days
ok, capacity.js exit 0 with no problems. `cap-midnight-busy` exit 0 with no groups and
capacity.js exit 0. `--appointments bogus` exit 2. Crafted negatives on copies of
`cap-busy` made capacity.js exit 1 each time. Adding `2024-08-21T12:00Z` +
`2024-08-22T15:00Z` named `weekly-pair`. Adding `2024-08-21T15:00Z` + `2024-08-28T12:15Z`
named `overlap`. Adding `2024-08-19T12:00Z` + `2024-08-21T12:00Z` named `daily` and
`weekly-pair`, and optimized.js exit 1 with `no room`. Deleting `2024-08-22T15:00Z` +
`2024-08-28T12:15Z` gave a completeness miss for 08-22, and deleting
`2024-08-21T12:00Z` + `2024-08-26T13:30Z` from a copy of `cap-daily-full` gave a closure
miss. Cleanup kept all 65 evidence files. Earlier proofs: 2026-10-14 after Tasks 1 and 2
and the time zone column (9,999 full-seed options, before the cap), 2026-10-13 against the
starter stub (count 0).
