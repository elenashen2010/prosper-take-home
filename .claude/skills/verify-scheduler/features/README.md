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
  `AETNA`/`CIGNA`, max 2/day, 8/week, no appointments). Her slots come from one of two
  sets, picked by `--seed` on drive.js and doctor.js (`SEED_SLOTS` for `npm run dev`):
  - `small` (default): six ninety-minute UTC slots on four days, `2024-08-19T12:00`,
    `12:15`, `2024-08-21T12:00`, `15:00`, `2024-08-22T15:00`, `2024-08-28T12:15`.
  - `full`: the 458-row dump, 27 days from 2024-08-19 to 2024-09-26, 15-minute ladders.
  No 60-minute slots in either set.
- A verification run covers both seeds. Run every recipe with the default seed and again
  with `--seed full`, using a distinct `--label` per seed, unless the feature file marks a
  step as seed-independent or names the one seed it needs.
- Never drive anything but this repo's `findAvailableSlots`; there is no shared instance.

## Driving conventions

- Every drive is `node .agents/skills/verify-scheduler/scripts/drive.js --feature <id> --run <run> ...`.
- The patient defaults to the seed patient; change only the fields the recipe names.
- Treat every command as literal. Keep ISO timestamps exactly as written (UTC, milliseconds).
- The scheduler returns one group per eligible psychologist, each with `clinician`
  (`id`, `firstName`, `lastName`) and `options` as `{ first, second }` slot pairs. So
  `summary.json`'s `count` is the number of clinicians with options, `slotDatesFound` is
  twice the number of options, and `byClinician` counts option slots per clinician.
  `scripts/pairs.js` checks the pairing rule over that output.
- Run the eligible-patient journey before any miss journey, so a "returns nothing"
  expectation is read next to a known non-empty result.
- Inspect `output.json` when a recipe asks for a by-hand check; `summary.json` is
  shape-agnostic and cannot prove grouping.

## Proof and skip reporting

- Proof is the evidence directory for the drive: `command.txt`, `input.json`,
  `output.json`, `summary.json` (plus `pairs.json` when pairs.js ran), and the run's `doctor.json`.
- Record the feature id and sub-feature id with every claim.
- A journey whose precondition the seed data lacks reports `blocked` with the unmet
  precondition. Do not simulate the precondition through a different code path.
- Do not report a listed entry point as verified through a different one.
- An expectation that fails because the feature is not implemented yet, or because the
  implementation breaks a README rule, is a real failure; record it as such.

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
  reduce the number of bookable appointments in a day (README Task 2). The ladder journey
  needs `--seed full`; `scripts/optimized.js` checks every offered day.
- [Clinician capacity](./clinician-capacity.md) covers daily and weekly maximums and
  existing appointments (README Task 3). Blocked on seed data today.
- [Therapy intake](./therapy-intake.md) covers 60-minute intake slots with therapists
  (README scenario). Blocked on seed data and API today.
