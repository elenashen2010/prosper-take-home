# Scheduler verification map

This directory is the maintained source for verifying the user-facing behavior of the
Prosper scheduler: given a patient, which appointment times can they book, and with whom.
Read this index before driving, then use the matching feature file as the recipe.

## Baseline preconditions

- `node_modules/` is installed (`npm ci` from the repo root).
- `node .agents/skills/verify-scheduler/scripts/doctor.js` reports `RESULT: READY`.
- Pick one run id per verification run and pass it as `--run <id>` to every drive and to
  cleanup, so evidence lands under `.verify-evidence/<id>/`.
- Seed data is fixed and in-memory: patient Byrne Hollander (`NY`, `AETNA`); one
  psychologist, Dr. Jane Doe (`9c516382-c5b2-4677-a7ac-4e100fa35bdd`, `NY`/`CA`,
  `AETNA`/`CIGNA`, max 2/day, 8/week, no appointments); 458 ninety-minute UTC slots from
  2024-08-19 to 2024-09-26. No 60-minute slots.
- Never drive anything but this repo's `findAvailableSlots`; there is no shared instance.

## Driving conventions

- Every drive is `node .agents/skills/verify-scheduler/scripts/drive.js --feature <id> --run <run> ...`.
- The patient defaults to the seed patient; change only the fields the recipe names.
- Treat every command as literal. Keep ISO timestamps exactly as written (UTC, milliseconds).
- Run the eligible-patient journey before any miss journey: with the scheduler stub, a
  "returns nothing" expectation passes for the wrong reason.
- Inspect `output.json` when a recipe asks for a by-hand check; `summary.json` is
  shape-agnostic and cannot prove pairing or grouping rules.

## Proof and skip reporting

- Proof is the evidence directory for the drive: `command.txt`, `input.json`,
  `output.json`, `summary.json`, plus the run's `doctor.json`.
- Record the feature id and sub-feature id with every claim.
- A journey whose precondition the seed data lacks reports `blocked` with the unmet
  precondition. Do not simulate the precondition through a different code path.
- Do not report a listed entry point as verified through a different one.
- An expectation that fails because the feature is not implemented yet is a real failure;
  record it as such.

## Feature entry contract

Each feature file starts with an H1 title and one paragraph describing the user-visible
behavior, then exactly four H2 sections in this order: `Sub-features`,
`How to get to it (user POV)`, `Driving it with drive.js` (starting with `Preconditions:`,
then labeled bullets pairing a user action with an exact command and observable result),
and `Gotchas`.

## Features

- [Assessment slots](./assessment-slots.md) covers eligibility by state and insurance,
  grouping by clinician, and the two-session pairing rule (README Task 1).
- [Slot optimization](./slot-optimization.md) covers hiding overlapping slots that would
  reduce the number of bookable appointments in a day (README Task 2).
- [Clinician capacity](./clinician-capacity.md) covers daily and weekly maximums and
  existing appointments (README Task 3). Blocked on seed data today.
- [Therapy intake](./therapy-intake.md) covers 60-minute intake slots with therapists
  (README scenario). Blocked on seed data and API today.
