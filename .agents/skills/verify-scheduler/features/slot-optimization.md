# Slot optimization

When a clinician's availability is a ladder of overlapping start times (12:00, 12:15,
12:30 ... for 90-minute sessions), the patient only sees the start times that keep the
day's bookable appointment count at its maximum, so booking any offered slot never
needlessly blocks the others.

## Sub-features

- `opt-ladder` reduces a 15-minute ladder of 90-minute slots to the starts that preserve the day's maximum.
- `opt-keep-first` always keeps the earliest slot of an overlapping run.
- `opt-independent` leaves slots that overlap nothing untouched.

## How to get to it (user POV)

- Run `npm run dev` and look at which start times appear for a single day.
- Call `findAvailableSlots(patient)` with the seed patient and inspect one day's dates.

## Driving it with drive.js

Preconditions:

- Doctor reports `RESULT: READY`.
- `$RUN` is this run's id.
- Seed data for `2024-08-19` contains exactly `12:00` and `12:15` UTC (overlapping), and
  `2024-08-21` contains exactly `12:00` and `15:00` UTC (not overlapping), all 90 minutes.
- For `opt-ladder` only: the drive uses `--seed full`, whose `2024-09-03` rows are
  `12:00, 12:15, 12:30` and `21:00, 21:15, 21:30, 21:45, 22:00, 22:15, 22:30` (the README's
  own example shifted by nine hours). The other two steps use the default small seed.

- **Earliest kept, overlap hidden.** Ask for the seed patient's options and check the
  2024-08-19 run. Run
  `node .agents/skills/verify-scheduler/scripts/drive.js --feature slot-optimization --run $RUN --label opt-keep-first --expect-min 1 --expect-contains 2024-08-19T12:00:00.000Z --expect-absent 2024-08-19T12:15:00.000Z`.
  Exit 0: 12:00 is offered and 12:15, which overlaps it and adds no extra appointment, is not.
- **Independent slots untouched.** In the same run, check 2024-08-21. Run
  `node .agents/skills/verify-scheduler/scripts/drive.js --feature slot-optimization --run $RUN --label opt-independent --expect-min 1 --expect-contains 2024-08-21T12:00:00.000Z,2024-08-21T15:00:00.000Z`.
  Exit 0: both starts are offered; 12:00 ends at 13:30, before 15:00.
- **Ladder collapse.** Ask for the seed patient's options on the full dump and check the
  2024-09-03 evening ladder. Run
  `node .agents/skills/verify-scheduler/scripts/drive.js --feature slot-optimization --run $RUN --seed full --label opt-ladder --expect-min 1 --expect-contains 2024-09-03T21:00:00.000Z,2024-09-03T22:30:00.000Z --expect-absent 2024-09-03T21:15:00.000Z,2024-09-03T21:30:00.000Z,2024-09-03T21:45:00.000Z,2024-09-03T22:00:00.000Z,2024-09-03T22:15:00.000Z`.
  Exit 0: the two surviving starts are offered and the five intermediate starts are not.
- **Proof.** `.verify-evidence/$RUN/slot-optimization/` holds one directory per label with
  the four evidence files; each `summary.json` lists every expectation with `pass: true`.

## Gotchas

- As of 2026-10-14 no optimization exists; the scheduler returns every slot. `opt-keep-first`
  fails (`absent 2024-08-19T12:15` not met) and `opt-ladder` fails (all five intermediate
  starts present); both are the correct report. `opt-independent` passes today for the
  trivial reason that nothing is hidden.
- The small seed has no run of three or more overlapping starts, so the ladder journey
  only exists on `--seed full`. Do not report `opt-ladder` from a small-seed drive.
- The README defines the rule by example. For a two-slot run such as `12:00, 12:15` the
  day's maximum is 1 and the README does not say whether 12:15 is hidden. This recipe
  takes the "keep the earliest" reading; if the implementation keeps 12:15, raise it with
  the owner instead of editing this file to match.
- Optimization applies per clinician per UTC day. A slot at 22:30 ends at 00:00 the next
  day; it is still a slot of the day it starts.
- The output is an array of two-session options; a hidden slot must not appear in any option.
