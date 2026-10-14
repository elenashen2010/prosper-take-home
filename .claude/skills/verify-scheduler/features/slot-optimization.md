# Slot optimization

When a clinician's availability is a ladder of overlapping start times (12:00, 12:15,
12:30 ... for 90-minute sessions), the patient only sees the start times that keep the
day's bookable appointment count at its maximum, so booking any offered slot never
needlessly blocks the others.

## Sub-features

- `opt-ladder` reduces a 15-minute ladder of 90-minute slots to the starts that preserve the day's maximum.
- `opt-keep-first` always keeps the earliest slot of a ladder.
- `opt-independent` leaves slots that overlap nothing untouched.

## How to get to it (user POV)

- Run `npm run dev` and look at which start times appear for a single day.
- Call `findAvailableSlots(patient)` with the seed patient and inspect one day's dates.

## Driving it with drive.js

Preconditions:

- Doctor reports `RESULT: READY`.
- `$RUN` is this run's id.
- Seed data for `2024-09-03` contains exactly `12:00, 12:15, 12:30` and
  `21:00, 21:15, 21:30, 21:45, 22:00, 22:15, 22:30` UTC, all 90 minutes. The evening run
  is the README's own example shifted by nine hours.

- **Ladder collapse.** Ask for the seed patient's options and check the 2024-09-03 evening
  ladder. Run
  `node .agents/skills/verify-scheduler/scripts/drive.js --feature slot-optimization --run $RUN --label opt-ladder --expect-min 1 --expect-contains 2024-09-03T21:00:00.000Z,2024-09-03T22:30:00.000Z --expect-absent 2024-09-03T21:15:00.000Z,2024-09-03T21:30:00.000Z,2024-09-03T21:45:00.000Z,2024-09-03T22:00:00.000Z,2024-09-03T22:15:00.000Z`.
  Exit 0: the two surviving starts are offered and the five intermediate starts are not.
- **Earliest kept.** In the same `summary.json`, `2024-08-19T12:00:00.000Z` is among
  the dates found (it is the first slot of a `12:00, 12:15, 12:30` run).
- **Independent slot untouched.** In `output.json`, `2024-08-23T21:00:00.000Z` is
  offered; nothing else on 2024-08-23 overlaps it.
- **Proof.** `.verify-evidence/$RUN/slot-optimization/opt-ladder/` holds the four evidence
  files; `summary.json` lists every expectation with `pass: true`.

## Gotchas

- As of 2026-10-13 the scheduler is a stub returning `[]`; the `--expect-contains`
  checks fail. Report the failure.
- The README defines the rule by example. For `12:00, 12:15, 12:30` alone the day's
  maximum is 1 and the README does not say whether 12:15 and 12:30 are hidden. The recipe
  only asserts the unambiguous evening ladder; if the implementation keeps 12:15 on
  2024-09-03, raise it with the owner instead of editing this file to match.
- Optimization applies per clinician per UTC day. A slot at 22:30 ends at 00:00 the next
  day; it is still a 2024-09-03 slot.
- If the output is pairs, the `--expect-absent` checks still hold: a hidden slot must not
  appear in any pair.
