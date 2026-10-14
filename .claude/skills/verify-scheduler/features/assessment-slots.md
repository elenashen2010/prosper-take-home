# Assessment slots

A patient who wants a psychological assessment sees the times they can book, grouped by
clinician, where every offered option is two 90-minute sessions with the same psychologist
on different days no more than 7 days apart, and only clinicians who operate in the
patient's state and accept their insurance appear.

## Sub-features

- `assess-eligible` returns options for a patient whose state and insurance match a psychologist.
- `assess-grouped` groups options by clinician id.
- `assess-pairs` offers each option as two slots on different UTC days, at most 7 days apart.
- `assess-state-miss` returns nothing for a patient in a state no clinician covers.
- `assess-insurance-miss` returns nothing for a patient whose insurance no clinician accepts.

## How to get to it (user POV)

- Run `npm run dev` from the repo root; it prints the result for the seed patient.
- Call `findAvailableSlots(patient)` from `src/schedulerApi.ts` with any `Patient`.

## Driving it with drive.js

Preconditions:

- Doctor reports `RESULT: READY`.
- `$RUN` is this run's id.
- Seed clinician Dr. Doe covers `NY` and `CA` and accepts `AETNA` and `CIGNA`.

- **Eligible patient.** Ask for the seed patient's options (NY, AETNA). Run
  `node .agents/skills/verify-scheduler/scripts/drive.js --feature assessment-slots --run $RUN --label assess-eligible --expect-min 1 --expect-contains 2024-08-19T12:00:00.000Z`.
  Exit 0; `summary.json` shows `count >= 1`, `byClinician` has only
  `9c516382-c5b2-4677-a7ac-4e100fa35bdd`, and `slotDateRange` lies within
  `2024-08-19T12:00:00.000Z` to `2024-09-26T22:30:00.000Z`.
- **Grouped by clinician.** Open that drive's `output.json`. Every option is attributable
  to one clinician id (a `clinicianId` field on the slots, or a top-level key per
  clinician). With one seed clinician there is exactly one group.
- **Paired sessions.** In the same `output.json`, every option lists two slot dates. The
  two fall on different UTC calendar days and the later starts no more than 7 x 24 hours
  after the earlier. The pair `2024-08-19T12:00:00.000Z` + `2024-08-21T12:00:00.000Z`
  (from the README example) is present. No option pairs `2024-08-19T12:00:00.000Z` with
  `2024-08-28T12:15:00.000Z` (9 days apart).
- **State miss.** Same insurance, state `TX`. Run
  `node .agents/skills/verify-scheduler/scripts/drive.js --feature assessment-slots --run $RUN --label assess-state-miss --state TX --expect-max 0`.
  Exit 0 and `count` is 0.
- **Insurance miss.** Same state, insurance `BCBS`. Run
  `node .agents/skills/verify-scheduler/scripts/drive.js --feature assessment-slots --run $RUN --label assess-insurance-miss --insurance BCBS --expect-max 0`.
  Exit 0 and `count` is 0.
- **Proof.** The three evidence directories under `.verify-evidence/$RUN/assessment-slots/`
  each hold `command.txt`, `input.json`, `output.json`, `summary.json`.

## Gotchas

- As of 2026-10-13 `findAvailableSlots` is the starter stub and returns `[]`.
  `assess-eligible` fails (`count >= 1` not met) until README Task 1 is implemented. That
  is the correct report, not a harness bug.
- The miss journeys pass against the stub for the wrong reason. Run `assess-eligible`
  first and only count the misses as verified when it passed in the same run.
- The starter return type is a flat `AvailableAppointmentSlot[]`, which cannot express
  pairs. If the implementation keeps that type, `assess-pairs` cannot be proven and must
  be reported as not verifiable with a citation to the return type.
- `summary.json` counts top-level items; for a grouped result that is the number of
  clinicians, not the number of options. Read `slotDatesFound` and `output.json`.
- After README Task 2 is implemented, slots like `2024-08-19T12:15:00.000Z` are
  legitimately hidden; do not expect the README's full 11-pair list verbatim.
- Dates are UTC. "Different days" means different UTC calendar dates.
