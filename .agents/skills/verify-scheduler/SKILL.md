---
name: verify-scheduler
description: "Use when you need proof that the Prosper appointment-availability scheduler (findAvailableSlots in src/schedulerApi.ts, a TypeScript library run through npm run dev) returns the right slots for a real patient input - after changing scheduling logic, before claiming a README task works, or when unit tests pass but nobody has looked at actual output."
---

# Verify the Prosper scheduler

## Surface

The app is a TypeScript library with a one-line CLI wrapper. The user-facing path is
`findAvailableSlots(patient)` in `src/schedulerApi.ts`, called by `src/index.ts`, which
`npm run dev` executes through ts-node and prints to stdout. There is no server, no UI,
no database: the "database" is in-memory seed data under `src/starter-code/`. Jest
(`npm test`) is the secondary surface; it has no test files yet and exits 1 with
"No tests found", which is not a failure of the app.

The scheduler is a pure function over the seed data. Driving it means: build a patient,
call the function the same way `index.ts` does, record what came back.

## Launch

Short-lived CLI: nothing stays running. Launch means install once; each drive is its own
node process.

```
npm ci
```

Run from the repo root when `node_modules/` is missing. Ready means Doctor reports
`RESULT: READY`. No migrations, no seed step: the seed modules load on every require.

Seed data an agent can rely on (verified 2026-10-13):

- Patient Byrne Hollander, state `NY`, insurance `AETNA` (`src/starter-code/mock-patient.ts`).
- One clinician, Dr. Jane Doe, id `9c516382-c5b2-4677-a7ac-4e100fa35bdd`, PSYCHOLOGIST,
  states `NY, CA`, insurances `AETNA, CIGNA`, max 2 per day, max 8 per week, zero
  appointments (`src/starter-code/mock-clinician.ts`).
- 458 available slots, all 90 minutes, UTC, from `2024-08-19T12:00Z` through
  `2024-09-26T22:30Z`, mostly 15-minute ladders (`src/starter-code/mock-slot-data.ts`).
- No 60-minute slots and no existing appointments. Therapy and capacity journeys are
  blocked on seed preconditions; see the feature map.

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
`--out <file.json>` to keep the report as evidence. Run it first whenever anything looks
off, and again after any failed drive.

## Drive

```
node .agents/skills/verify-scheduler/scripts/drive.js --feature <feature-id> --run <run-id> [options]
```

Calls `findAvailableSlots(patient)` in-process through ts-node with full type-checking,
the same path `npm run dev` takes. The patient defaults to the seed patient; override with
`--state`, `--insurance`, `--first`, `--last`, `--patient-id`. Values are validated against
the repo's `UsStateAbbreviations` and `InsurancePayers`.

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
- An empty result is a result. With the scheduler stub in place, eligible-patient journeys
  fail honestly (`count >= 1` not met); report that, do not loosen the expectation.

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
| drive | `node .agents/skills/verify-scheduler/scripts/drive.js --feature <id> --run <id> [...]` | Run the scheduler for a patient, write evidence, assert expectations |
| cleanup | `node .agents/skills/verify-scheduler/scripts/cleanup.js --run <id> [--remove-dist]` | Confirm evidence survived; remove `dist/` on request |

`.claude/skills/verify-scheduler` is a directory junction to `.agents/skills/verify-scheduler`
(the other skills in this repo are symlinks; creating a symlink needs admin rights on this
machine, a junction does not). Either path works in commands.

## Minimal full pass

```
RUN=$(date +%Y%m%d-%H%M%S)
node .agents/skills/verify-scheduler/scripts/doctor.js --out .verify-evidence/$RUN/doctor.json
node .agents/skills/verify-scheduler/scripts/drive.js --feature assessment-slots --run $RUN --expect-min 1 --expect-contains 2024-08-19T12:00:00.000Z
node .agents/skills/verify-scheduler/scripts/cleanup.js --run $RUN
```

In PowerShell, set the run id with `$RUN = Get-Date -Format yyyyMMdd-HHmmss`; the three
`node` commands are then identical.

Proven 2026-10-13 on this checkout: doctor READY, the `assess-eligible` drive ran the real
path and failed its expectations because the scheduler is still the starter stub (count 0),
cleanup kept all five evidence files. The non-empty code path (a clinician-keyed map of
slot pairs, contains/absent checks, exit codes 1 and 2) was proven against a throwaway
scheduler in a scratch copy of the repo, not against this checkout.
