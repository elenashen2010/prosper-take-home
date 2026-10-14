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
- Seed clinician Dr. Doe covers `NY` and `CA`, accepts `AETNA` and `CIGNA`, and has slots on
  2024-08-19, 08-21, 08-22 and 08-28.

- **Eligible patient.** Ask for the seed patient's options (NY, AETNA). Run
  `node .agents/skills/verify-scheduler/scripts/drive.js --feature assessment-slots --run $RUN --label assess-eligible --expect-min 1 --expect-contains 2024-08-19T12:00:00.000Z,2024-08-21T12:00:00.000Z`.
  Exit 0; `summary.json` shows `count >= 1`, `byClinician` has only
  `9c516382-c5b2-4677-a7ac-4e100fa35bdd`, and `slotDateRange` lies within
  `2024-08-19T12:00:00.000Z` to `2024-08-28T12:15:00.000Z`.
- **Paired sessions.** Check every option in that drive's output. Run
  `node .agents/skills/verify-scheduler/scripts/pairs.js .verify-evidence/$RUN/assessment-slots/assess-eligible`.
  Exit 0 and `invalid: 0`: every option is one clinician, on different UTC days, at most
  7 days apart. The pair `2024-08-19T12:00:00.000Z` + `2024-08-21T12:00:00.000Z` (from the
  README example) is listed.
- **Eligible patient, full dump.** Repeat on the realistic table. Run
  `node .agents/skills/verify-scheduler/scripts/drive.js --feature assessment-slots --run $RUN --seed full --label assess-eligible-full --expect-min 1 --expect-contains 2024-08-19T12:00:00.000Z,2024-09-26T22:30:00.000Z`
  then `node .agents/skills/verify-scheduler/scripts/pairs.js .verify-evidence/$RUN/assessment-slots/assess-eligible-full`.
  Drive exit 0 with `slotDateRange` `2024-08-19T12:00:00.000Z` to `2024-09-26T22:30:00.000Z`;
  pairs.js exit 0 and `invalid: 0`.
- **Grouped by clinician.** Open `output.json`. It is an array of groups, each with
  `clinician.id`, `clinician.firstName`, `clinician.lastName` and an `options` list, and
  pairs.js reports no slot whose clinician differs from its group's. With one seed clinician
  there is exactly one group (`Jane Doe`); the unit test with two psychologists in
  `src/schedulerApi.test.ts` covers multi-group ordering until the seed has a second
  eligible clinician.
- **State miss.** Same insurance, state `TX`. Seed-independent; run once. Run
  `node .agents/skills/verify-scheduler/scripts/drive.js --feature assessment-slots --run $RUN --label assess-state-miss --state TX --expect-max 0`.
  Exit 0 and `count` is 0.
- **Insurance miss.** Same state, insurance `BCBS`. Seed-independent; run once. Run
  `node .agents/skills/verify-scheduler/scripts/drive.js --feature assessment-slots --run $RUN --label assess-insurance-miss --insurance BCBS --expect-max 0`.
  Exit 0 and `count` is 0.
- **Proof.** The four evidence directories under `.verify-evidence/$RUN/assessment-slots/`
  each hold `command.txt`, `input.json`, `output.json`, `summary.json`; the two eligible
  directories also hold `pairs.json`.

## Gotchas

- As of 2026-10-14 (after README Tasks 1 and 2 landed) every journey here passes on both
  seeds: the small seed gives exactly the README's 11 options in README order, the full
  seed gives 9,999 options, and pairs.js reports 0 invalid on both.
- The output is an array of clinician groups, so `count` is the number of clinicians with
  options, not the number of options. Read `pairs.json` for the option count. pairs.js
  reads the grouped shape (and the older tuple and flat shapes); any other return shape
  makes it exit 2, so update pairs.js in the same change.
- Only psychologists appear. A therapist in the patient's state with their insurance is
  excluded by `clinicianType`, not by slot length.
- The full-seed eligible drive writes about 6 MB of `output.json` and runs in about two
  seconds. pairs.js prints only the first 20 invalid pairs and stores at most 1000 in
  `pairs.json` for runs over 200 options.
- The miss journeys would pass against an empty result too. Run `assess-eligible` first
  and only count the misses as verified when it passed in the same run.
- Only the six small-set slots are seeded. The README's full 11-pair example list assumes
  the same six slots, but after README Task 2 is implemented slots like
  `2024-08-19T12:15:00.000Z` are legitimately hidden; do not expect the list verbatim.
- Dates are UTC. "Different days" means different UTC calendar dates.
