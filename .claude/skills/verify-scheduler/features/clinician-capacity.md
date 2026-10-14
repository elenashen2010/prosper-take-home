# Clinician capacity

A patient is never offered a slot on a day where the clinician already has
`maxDailyAppointments` booked, or in a week where they already have
`maxWeeklyAppointments` booked, and never a slot that overlaps an existing appointment.

## Sub-features

- `cap-daily` hides every slot on a day that already has the clinician's daily maximum.
- `cap-weekly` hides every slot in a week that already has the clinician's weekly maximum.
- `cap-overlap` hides slots that overlap an existing appointment.
- `cap-pair-aware` for assessments, a pair is only offered if both sessions fit under the limits.

## How to get to it (user POV)

- Run `npm run dev` with a clinician who has existing appointments.
- Call `findAvailableSlots(patient)` after the clinician's `appointments` include booked sessions.

## Driving it with drive.js

Preconditions:

- Doctor reports `RESULT: READY` and does not warn "clinician has 0 appointments".
- `$RUN` is this run's id.
- Dr. Doe's `appointments` in `src/starter-code/mock-clinician.ts` hold `UPCOMING` rows
  with her `clinicianId`: two on `2024-08-19` (daily max 2), eight in the week of
  `2024-08-19` to `2024-08-25` (weekly max 8), and one at `2024-08-21T14:00:00.000Z`
  (90 minutes, ending 15:30).

- **Daily cap.** Ask for the seed patient's options. Run
  `node .agents/skills/verify-scheduler/scripts/drive.js --feature clinician-capacity --run $RUN --label cap-daily --expect-min 1 --expect-absent 2024-08-19T12:00:00.000Z,2024-08-19T12:15:00.000Z`.
  Exit 0: no 2024-08-19 slot is offered.
- **Weekly cap.** In the same `summary.json`, no date between `2024-08-19T00:00:00.000Z`
  and `2024-08-25T23:59:59.999Z` is present; `2024-08-28T12:15:00.000Z` is present.
- **Overlap.** Run
  `node .agents/skills/verify-scheduler/scripts/drive.js --feature clinician-capacity --run $RUN --label cap-overlap --expect-absent 2024-08-21T15:00:00.000Z --expect-contains 2024-08-21T12:00:00.000Z`.
  Exit 0: the 15:00 slot overlapping the 14:00 to 15:30 appointment is hidden; 12:00
  (ending 13:30) survives.
- **Proof.** `.verify-evidence/$RUN/clinician-capacity/` holds both drives' evidence.

## Gotchas

- Blocked as of 2026-10-14: the seed clinician has zero appointments
  (`src/starter-code/mock-clinician.ts`, field `appointments`), the scheduler never reads
  `appointments`, `maxDailyAppointments`, or `maxWeeklyAppointments`, and
  `findAvailableSlots(patient)` takes no clinician or appointment input. Report every
  sub-feature as `blocked` with that reason. Doctor warns about it.
- Unblocking requires an appointment fixture in `mock-clinician.ts`. The repositories in
  `src/mockClinicianOrm.ts` and `src/mockSlotOrm.ts` accept arbitrary rows through their
  factories, but the scheduler imports the seeded singletons, so a harness cannot inject
  rows without a product-side change. Update the preconditions here when that lands.
- The recipe anchors are the six small-set slots, so run it with the default seed. The
  daily-cap day 2024-08-19 has slots 12:00 and 12:15; the weekly window 2024-08-19 to
  2024-08-25 holds five of the six slots. Add a `--seed full` variant when the fixture
  lands; on the full dump 2024-08-19 has 7 slots and the same week has 32.
- Only count `UPCOMING` appointments against capacity unless the implementation documents
  otherwise; `CANCELLED` and `RE_SCHEDULED` sessions free the slot. The README does not say
  how `OCCURRED`, `NO_SHOW`, or `LATE_CANCELLATION` count.
- The README does not define the week boundary. Record which day the implementation
  treats as the first of the week before asserting `cap-weekly`.
