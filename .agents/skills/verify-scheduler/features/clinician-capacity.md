# Clinician capacity

A patient is never offered a session on a day where the clinician's existing appointments
already reach `maxDailyAppointments`, never a pair that would push a week past
`maxWeeklyAppointments`, and never a slot that overlaps an appointment that still holds the
clinician's time. Cancelled and rescheduled appointments give their time back. Days and
weeks are the clinician's own (`clinician.timezone`, weeks start on Monday).

## Sub-features

- `cap-daily` hides every slot on a day that already holds the clinician's daily maximum.
- `cap-weekly` hides every slot in a week that already holds the clinician's weekly maximum.
- `cap-pair-aware` offers a pair inside one week only if that week has room for both sessions, and still offers each session paired across weeks.
- `cap-overlap` hides a slot whose 90 minutes overlap a held appointment, and keeps a slot that only touches one.
- `cap-freed` ignores `RE_SCHEDULED`, `CANCELLED`, and `LATE_CANCELLATION` appointments, and counts `UPCOMING`, `OCCURRED`, and `NO_SHOW` ones.
- `cap-local-day` counts an appointment on the clinician's local day it starts, not its UTC day.
- `cap-none` leaves the README result unchanged when the clinician has no appointments.

## How to get to it (user POV)

- Run `SEED_APPOINTMENTS=busy npm run dev` from the repo root. It prints the result for the seed patient against Dr. Doe's busy week.
- Call `findAvailableSlots(patient, repositories)` from `src/schedulerApi.ts` with an `appointments` repository built by `createMockAppointmentRepository(rows)` from `src/mockAppointmentOrm.ts`.

## Driving it with drive.js

Preconditions:

- `node .agents/skills/verify-scheduler/scripts/doctor.js --appointments busy --out .verify-evidence/$RUN/doctor-busy.json`
  reports `RESULT: READY`, `11 appointments (busy), 7 hold the clinician's time`, and
  `clinician.appointments matches repository` with `same 11 ids`.
- `$RUN` is this run's id.
- `--appointments busy` seeds `MOCK_APPOINTMENT_DATA_BUSY` from `src/mockAppointmentOrm.ts`,
  11 rows for Dr. Doe (New York, 2 per day, 8 per week). The 7 held rows fall on New York
  days 08-19 (2), 08-20 (2, one of them `2024-08-21T01:00Z`), 08-21 (1, `14:00Z` to
  `15:30Z`), 08-23 (1, `NO_SHOW`), and Sunday 08-25 (1). Week 2024-08-19 holds 7 of 8 and
  week 2024-08-26 holds 0. The 4 freed rows sit at `2024-08-22T15:00Z` (`CANCELLED`),
  `2024-08-28T12:00Z` (`RE_SCHEDULED`), and `2024-08-28T16:00Z` and `18:00Z`
  (`LATE_CANCELLATION`).

- **Busy week, small seed.** Ask for the seed patient's options against the busy calendar. Run
  `node .agents/skills/verify-scheduler/scripts/drive.js --feature clinician-capacity --run $RUN --appointments busy --label cap-busy --expect-min 1 --expect-max 1 --expect-absent 2024-08-19T12:00:00.000Z,2024-08-19T12:15:00.000Z,2024-08-21T15:00:00.000Z --expect-contains 2024-08-21T12:00:00.000Z,2024-08-22T15:00:00.000Z,2024-08-28T12:15:00.000Z`.
  Exit 0 with one group. Open `output.json`. It holds exactly two options,
  `2024-08-21T12:00:00.000Z` + `2024-08-28T12:15:00.000Z` and
  `2024-08-22T15:00:00.000Z` + `2024-08-28T12:15:00.000Z`, and no option pairs
  `2024-08-21T12:00:00.000Z` with `2024-08-22T15:00:00.000Z`.
- **Independent check of every rule.** Run
  `node .agents/skills/verify-scheduler/scripts/capacity.js .verify-evidence/$RUN/clinician-capacity/cap-busy`,
  then `optimized.js` and `pairs.js` on the same directory. capacity.js exits 0 with
  `held: 7, freed: 4`, `violations: none, closure extras: 0, closure misses: 0, completeness misses: 0`.
  optimized.js exits 0 with `days offered: 3, ok: 3` and lists 08-19 as unoffered with
  `room 0`. pairs.js exits 0 with `pairs: 2, invalid: 0`.
- **Daily cap (`cap-daily`).** Drive the full dump against the busy calendar. Run
  `node .agents/skills/verify-scheduler/scripts/drive.js --feature clinician-capacity --run $RUN --seed full --appointments busy --label cap-daily-full --expect-absent 2024-08-19T12:00:00.000Z,2024-08-21T15:00:00.000Z --expect-contains 2024-08-21T12:00:00.000Z,2024-08-26T13:30:00.000Z`
  then `capacity.js`, `optimized.js`, and `pairs.js` on
  `.verify-evidence/$RUN/clinician-capacity/cap-daily-full`. All four exit 0. pairs.js
  reports `pairs: 36515`, optimized.js `days offered: 26, ok: 26` with 08-19 unoffered at
  `room 0`. No 08-19 start appears, although 08-19 has 7 slots and could pair with 08-26 in
  the next, empty week. That absence is the daily cap alone.
- **Weekly cap with pairs (`cap-weekly`, `cap-pair-aware`).** In the `cap-busy` output,
  `2024-08-21T12:00:00.000Z` and `2024-08-22T15:00:00.000Z` each appear paired with
  `2024-08-28T12:15:00.000Z` in the next week, never with each other. Week 2024-08-19 holds 7
  of 8, so one more session fits and a same-week pair does not. `capacity.json` shows
  `heldWeek` `"2024-08-19": 7`.
- **Overlap (`cap-overlap`).** In the `cap-busy` drive, `2024-08-21T15:00:00.000Z` is absent
  because `mock-appointment-4` holds 14:00 to 15:30Z, and `2024-08-21T12:00:00.000Z` is
  present because it ends at 13:30Z.
- **Freed statuses (`cap-freed`).** In the `cap-busy` drive, `2024-08-22T15:00:00.000Z` is
  offered although a `CANCELLED` row starts at that instant, and `2024-08-28T12:15:00.000Z`
  is offered although a `RE_SCHEDULED` row at 12:00Z would overlap it and two
  `LATE_CANCELLATION` rows would fill 08-28. `capacity.json` lists the four rows under
  `freed`. The 08-23 `NO_SHOW` and 08-20 `OCCURRED` rows count toward the week's 7.
- **Local day (`cap-local-day`).** In the `cap-busy` drive, `2024-08-21T12:00:00.000Z` is
  offered. The row at `2024-08-21T01:00Z` is 21:00 on 08-20 in New York, so 08-21 holds 1,
  not 2. `capacity.json` shows `heldDay` `"2024-08-20": 2` and `"2024-08-21": 1`.
- **Midnight seed.** Run
  `node .agents/skills/verify-scheduler/scripts/drive.js --feature clinician-capacity --run $RUN --seed midnight --appointments busy --label cap-midnight-busy --expect-max 0`
  then `capacity.js` on its directory. Both exit 0 with no groups. New York 08-19 and 08-20
  are full, week 2024-08-19 holds 7, and 08-27 has no partner left. capacity.js reports
  `completeness misses: 0`, which confirms that no day should have been offered.
- **Empty calendar (`cap-none`).** Run
  `node .agents/skills/verify-scheduler/scripts/drive.js --feature clinician-capacity --run $RUN --label cap-none --expect-min 1 --expect-max 1 --expect-contains 2024-08-19T12:00:00.000Z,2024-08-21T15:00:00.000Z`
  then `pairs.js` and `capacity.js` on it. The drive exits 0, pairs.js reports `pairs: 11`,
  and capacity.js prints `vacuous: 0 held` and exits 0.
- **Crafted negatives.** Copy `output.json` and `summary.json` from `cap-busy` into a scratch
  directory, edit `output.json`, and run capacity.js on the copy. Never edit the real
  evidence. Adding the option `2024-08-21T12:00:00.000Z` + `2024-08-22T15:00:00.000Z` exits 1
  with `weekly-pair`. Adding `2024-08-21T15:00:00.000Z` + `2024-08-28T12:15:00.000Z` exits 1
  with `overlap`. Adding `2024-08-19T12:00:00.000Z` + `2024-08-21T12:00:00.000Z` exits 1 with
  `daily` and `weekly-pair`, and optimized.js on that copy exits 1 with `no room`. Deleting
  `2024-08-22T15:00:00.000Z` + `2024-08-28T12:15:00.000Z` exits 1 with a completeness miss
  for 08-22. To see a closure miss, delete one option from a copy of `cap-daily-full`, such
  as `2024-08-21T12:00:00.000Z` + `2024-08-26T13:30:00.000Z`. `--appointments bogus` makes
  drive.js exit 2 with `SEED_APPOINTMENTS must be one of none, busy, got "bogus"`.
- **Proof.** `.verify-evidence/$RUN/clinician-capacity/` holds `cap-busy`,
  `cap-daily-full`, `cap-midnight-busy`, and `cap-none`, each with the four drive files plus
  `capacity.json`, `optimized.json`, and `pairs.json` where those scripts ran.

## Gotchas

- Weeks start on Monday. The app's constant is `WEEK_STARTS_ON` in `src/localDay.ts` and the
  harness's copy is `HARNESS_WEEK_STARTS_ON` in `scripts/common.js`. Change both together.
  With a Sunday start the 08-25 row falls in the next week and the small busy drive gives 3
  options, adding `2024-08-21T12:00:00.000Z` + `2024-08-22T15:00:00.000Z`.
- Which statuses hold time is a product guess the owner reports. The app's table is
  `HOLDS_CLINICIAN_TIME` in `src/capacity.ts` and the harness's copy is `HARNESS_HELD_STATUSES` in
  `scripts/common.js`. If any freed row counted, the small busy drive would give 0 options.
  An unknown status or type makes capacity.js and optimized.js exit 2.
- optimized.js must read the same evidence as the drive, because the day's room caps the
  Task 2 target. With room 1 every free start is kept, so a whole ladder opens. On the full
  busy drive 08-22 keeps all 11 of its starts, including `13:15Z`, which the empty calendar
  hides. Checking a busy drive against the uncapped rule would report extras that are
  correct.
- The small seed cannot show the daily cap alone. The 08-19 slots can only pair with 08-21
  and 08-22, which are in the same week, and the weekly pair rule blocks those pairs anyway.
  Use `cap-daily-full`, where 08-26 is a next-week partner.
- Overlap and packing use the 90-minute session length, not `slot.length`. optimized.js
  fails on a slot whose length is not 90.
- An appointment counts on the local day it starts. Its whole interval blocks overlapping
  slots, even when it runs past midnight.
- capacity.js needs `summary.appointments`, so evidence from a drive.js without
  `--appointments` support exits 2. Under `none` it checks nothing and prints
  `vacuous: 0 held`. Run it on busy evidence for proof.
- The full busy drive writes about 22 MB of `output.json` for 36,515 options. capacity.js
  checks it in under a second.
