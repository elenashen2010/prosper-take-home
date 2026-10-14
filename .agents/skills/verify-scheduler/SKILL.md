---
name: verify-scheduler
description: "Use when you need proof that the Prosper appointment-availability scheduler (findAvailableSlots in src/schedulerApi.ts, a TypeScript library run through npm run dev) returns the right slots for a real patient input - after changing scheduling logic, before claiming a README task works, or when unit tests pass but nobody has looked at actual output."
---

# Verify the Prosper scheduler

## Surface

The app is a TypeScript library with a one-line CLI wrapper. The user-facing path is
`findAvailableSlots(patient)` in `src/schedulerApi.ts`, called by `src/index.ts`, which
`npm run dev` executes through ts-node and prints to stdout. There is no server, no UI,
no database: the "database" is in-memory seed data under `src/starter-code/`, served
through two mock repositories (`src/mockClinicianOrm.ts`, `src/mockSlotOrm.ts`). Jest
(`npm test`) is the secondary surface; it covers the repositories and the UTC day helper,
not the scheduler itself.

The scheduler is a pure function over the seed data. Driving it means: build a patient,
call the function the same way `index.ts` does, record what came back. As of 2026-10-14 it
returns one group per eligible psychologist, `{ clinician: { id, firstName, lastName },
options: { first, second }[] }`, where each option is a two-session assessment pair.

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
  states `NY, CA`, insurances `AETNA, CIGNA`, max 2 per day, max 8 per week, zero
  appointments (`src/starter-code/mock-clinician.ts`). Her `availableSlots` come from the
  slot repository.
- Two slot sets, selected by the `SEED_SLOTS` environment variable, which
  `src/mockSlotOrm.ts` reads when it loads. Both are all 90 minutes, UTC, for Dr. Doe.
  - `small` (default): six slots on four days, `2024-08-19T12:00Z`, `12:15Z`,
    `2024-08-21T12:00Z`, `15:00Z`, `2024-08-22T15:00Z`, `2024-08-28T12:15Z`. The README's
    worked example; what the user runs by hand.
  - `full`: the 458-row dump, `2024-08-19T12:00Z` through `2024-09-26T22:30Z`, 27 days,
    mostly 15-minute ladders. The realistic table.
  Verification covers both: every recipe runs once per seed unless its feature file says
  the seed does not matter. Any other `SEED_SLOTS` value makes the app throw at load.
- No 60-minute slots and no existing appointments in either set. Therapy and capacity
  journeys are blocked on seed preconditions; see the feature map.

Isolation: every drive is a fresh process reading in-memory data, so concurrent drives
cannot interfere. Give each verification run its own `--run <id>` so evidence does not mix.

## Doctor

```
node .agents/skills/verify-scheduler/scripts/doctor.js
```

Read-only. Confirms repo root, node >= 18, dependencies installed, a clean full
`tsc --noEmit`, that `findAvailableSlots` is exported, and that the seed patient and
clinician load, with slot counts and lengths. Warns (not fails) when the seed lacks
60-minute slots or appointments. Exit 0 = READY, exit 1 = do not drive. Add
`--seed full` to check the full dump (the report names the seed), and `--out <file.json>`
to keep the report as evidence. Run it first whenever anything looks off, and again after
any failed drive.

## Drive

```
node .agents/skills/verify-scheduler/scripts/drive.js --feature <feature-id> --run <run-id> [options]
```

Calls `findAvailableSlots(patient)` in-process through ts-node with full type-checking,
the same path `npm run dev` takes. The patient defaults to the seed patient; override with
`--state`, `--insurance`, `--first`, `--last`, `--patient-id`. Values are validated against
the repo's `UsStateAbbreviations` and `InsurancePayers`. `--seed small|full` (default
small) sets `SEED_SLOTS` before the app loads, exactly as `SEED_SLOTS=full npm run dev`
would; the seed is recorded in `summary.json` and appended to the default label.

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
(the group's clinician), on different UTC days, at most 7 days apart. It reads clinician
groups with `{ first, second }` options, an array of `[slot, slot]` tuples, or a flat
even-length list of slots taken two at a time. Exit 0 when all pairs are valid, 1 when any
violates, 2 when the output is none of those shapes. It writes `pairs.json` next to the
output as evidence.

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

Size: a full-seed eligible drive writes about 22 MB of `output.json` (37,165 options for
one psychologist with the 7-day rule applied). That shrinks once README Task 2 hides
overlapping slots; do not trim the output to save space.

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
  On 2026-10-14 the pairing check fails because the scheduler emits a 9-day pair; report
  that, do not loosen the expectation.

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
| doctor | `node .agents/skills/verify-scheduler/scripts/doctor.js [--out <file>]` | Read-only readiness check |
| drive | `node .agents/skills/verify-scheduler/scripts/drive.js --feature <id> --run <id> [--seed small\|full] [...]` | Run the scheduler for a patient on one seed set, write evidence, assert expectations |
| cleanup | `node .agents/skills/verify-scheduler/scripts/cleanup.js --run <id> [--remove-dist]` | Confirm evidence survived; remove `dist/` on request |
| pairs | `node .agents/skills/verify-scheduler/scripts/pairs.js <evidence-dir> [--max-gap-days 7]` | Check each consecutive pair in a drive's output against the pairing rule |

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
node .agents/skills/verify-scheduler/scripts/cleanup.js --run $RUN
```

In PowerShell, set the run id with `$RUN = Get-Date -Format yyyyMMdd-HHmmss`; the `node`
commands are then identical.

Proven 2026-10-14 on this checkout after README Task 1 landed. Small seed: doctor READY
with two seed warnings, `assess-eligible` exit 0 with one group of 11 options in README
order, pairs.js exit 0, both miss drives exit 0. Full seed: `assess-eligible` exit 0 with
one group of 37,165 options in 22 MB, pairs.js exit 0. Earlier the same day, before
Task 1, pairs.js reported 9-day pairs on both seeds, and `opt-keep-first` and `opt-ladder`
still fail because README Task 2 is not implemented. Cleanup kept every evidence file in
every run. First proven 2026-10-13 against the starter stub (count 0).
