# Slot optimization

When a clinician's availability is a ladder of overlapping start times (12:00, 12:15,
12:30 ... for 90-minute sessions), the patient only sees the start times that keep the
day's target number of sessions reachable, so booking any offered slot never costs the
clinician a session. The target is the most non-overlapping sessions the day's free slots
can hold, capped by the clinician's room that day (README Task 3). A start is offered
exactly when some set of non-overlapping sessions through it reaches the target.

## Sub-features

- `opt-ladder` reduces a 15-minute ladder of 90-minute slots to the starts that keep the day's target reachable.
- `opt-short-block` keeps a run of starts too short for two sessions whole, so the patient sees every start that costs nothing.
- `opt-independent` leaves slots that overlap nothing untouched.
- `opt-every-day` applies the rule to every offered day of every clinician, with days taken on the clinician's own calendar (`clinician.timezone`) and the target capped by that day's room.

## How to get to it (user POV)

- Run `npm run dev` and look at which start times appear for a single day.
- Call `findAvailableSlots(patient)` and inspect one day's dates.
- Call `filterForMaxAppointments(dates, durationMinutes, maxAppointments)` from `src/maxAppointments.ts` with any list of starts. Without the third argument it applies the uncapped README rule.

## Driving it with drive.js

Preconditions:

- Doctor reports `RESULT: READY`.
- `$RUN` is this run's id.
- Small seed: `2024-08-19` has exactly `12:00Z` and `12:15Z` (a run too short for two
  sessions) and `2024-08-21` has `12:00Z` and `15:00Z` (no overlap), all 90 minutes. Both
  days are the same date in UTC and in Dr. Doe's `America/New_York`.
- Full seed (`--seed full`): `2024-09-03` has `12:00, 12:15, 12:30` and the README-shaped
  ladder `21:00, 21:15, 21:30, 21:45, 22:00, 22:15, 22:30`; `2024-08-22` has the 11-step
  ladder `12:00` through `14:30`.

- **Short block kept whole.** Ask for the seed patient's options on the small seed. Run
  `node .agents/skills/verify-scheduler/scripts/drive.js --feature slot-optimization --run $RUN --label opt-short-block --expect-min 1 --expect-contains 2024-08-19T12:00:00.000Z,2024-08-19T12:15:00.000Z`.
  Exit 0: both starts are offered, because the day holds one session either way.
- **Independent slots untouched.** Same seed. Run
  `node .agents/skills/verify-scheduler/scripts/drive.js --feature slot-optimization --run $RUN --label opt-independent --expect-min 1 --expect-contains 2024-08-21T12:00:00.000Z,2024-08-21T15:00:00.000Z`.
  Exit 0: both starts are offered; 12:00 ends at 13:30, before 15:00.
- **Ladder collapse.** Ask for the options on the full dump and check 2024-09-03 and
  2024-08-22. Run
  `node .agents/skills/verify-scheduler/scripts/drive.js --feature slot-optimization --run $RUN --seed full --label opt-ladder --expect-min 1 --expect-contains 2024-09-03T21:00:00.000Z,2024-09-03T21:15:00.000Z,2024-09-03T22:15:00.000Z,2024-09-03T22:30:00.000Z,2024-08-22T12:15:00.000Z --expect-absent 2024-08-22T13:15:00.000Z`.
  Exit 0. Dr. Doe takes at most 2 sessions a day, so the target is 2 on every full-seed
  day that fits two sessions. On 2024-09-03 every ladder start fits in a chain of 2 with a start of the 12:00
  block, so all ten starts stay. On the 11-step ladder of 2024-08-22 only 13:15 is hidden,
  because no other start fits before or after it. The README's own ladder, where only 12:00 and 13:30 survive, needs a
  day whose longest chain is the cap. `src/maxAppointments.test.ts` covers it.
- **Every offered day.** Check the whole full-seed drive against the rule with an
  independent implementation. Run
  `node .agents/skills/verify-scheduler/scripts/optimized.js .verify-evidence/$RUN/slot-optimization/opt-ladder`.
  Exit 0 and `failing: 0` over 27 offered days; `optimized.json` lists each day's held
  count, room, target, expected keep count, and `timezone`. optimized.js reads the
  appointment set from `summary.json`, so it also checks the busy drives in
  `clinician-capacity.md`. Run it on the small-seed drive too (4 days, all ok) and on the
  `assess-midnight` drive from the assessment-slots recipe
  (`node .agents/skills/verify-scheduler/scripts/optimized.js .verify-evidence/$RUN/assessment-slots/assess-midnight`):
  exit 0 over 4 offered New York days, where the `03:00Z` and `03:15Z` starts share the
  08-19 evening and are both kept because the run is too short for two sessions.
- **Proof.** `.verify-evidence/$RUN/slot-optimization/` holds one directory per label with
  the four evidence files, plus `optimized.json` where optimized.js ran.

## Gotchas

- The rule keeps a start whenever booking it costs nothing. In a run of two or three
  overlapping starts the day holds one session either way, so all of them stay. An
  earlier version of this map expected `2024-08-19T12:15` hidden on the small seed; that
  reading was rejected by the owner on 2026-10-14 and must not come back.
- The README's example reduces 12:00..13:30 to 12:00 and 13:30. The 11-step ladder keeps
  ten of eleven starts, because only 13:15 caps the day at one session. Both are correct
  under the rule; do not expect strides of 90 minutes.
- Optimization applies per clinician per local day (the clinician's `timezone`), before
  pairing. A slot at 22:30 local ends at 00:00 the next day and is still a slot of the day
  it starts. A ladder that crosses UTC midnight inside one New York evening is one day's
  ladder (`src/schedulerApi.test.ts` covers it).
- Expected full-seed numbers with no appointments: 457 of 458 starts kept and 37,110
  assessment options. The uncapped README rule gave 246 starts and 9,999 options, and no
  optimization gives 37,165. The cap changed the count. With room for 2 sessions, any start
  inside a chain of 2 is harmless to offer, even when the day could pack 7. A different
  count is a finding.
- The output is an array of clinician groups with `{ first, second }` options; a hidden
  slot must not appear in any option.
