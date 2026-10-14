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

- Doctor reports `RESULT: READY`.
- `$RUN` is this run's id.
- Dr. Doe has 2 `UPCOMING` appointments on `2024-08-19` (daily max 2), 8 `UPCOMING`
  appointments in the week of `2024-09-02` to `2024-09-08` (weekly max 8), and one
  `UPCOMING` appointment at `2024-08-22T13:30:00.000Z`.

- **Daily cap.** Ask for the seed patient's options. Run
  `node .agents/skills/verify-scheduler/scripts/drive.js --feature clinician-capacity --run $RUN --label cap-daily --expect-min 1 --expect-absent 2024-08-19T12:00:00.000Z,2024-08-19T14:45:00.000Z`.
  Exit 0: no 2024-08-19 slot is offered.
- **Weekly cap.** In the same `summary.json`, no date between `2024-09-02T00:00:00.000Z`
  and `2024-09-08T23:59:59.999Z` is present; `2024-09-09T12:00:00.000Z` is present.
- **Overlap.** Run
  `node .agents/skills/verify-scheduler/scripts/drive.js --feature clinician-capacity --run $RUN --label cap-overlap --expect-absent 2024-08-22T12:15:00.000Z,2024-08-22T13:30:00.000Z,2024-08-22T14:30:00.000Z --expect-contains 2024-08-22T12:00:00.000Z`.
  Exit 0: slots overlapping 13:30 to 15:00 are hidden; 12:00 (ending 13:30) survives.
- **Proof.** `.verify-evidence/$RUN/clinician-capacity/` holds both drives' evidence.

## Gotchas

- Blocked as of 2026-10-13: the seed clinician has zero appointments and
  `findAvailableSlots(patient)` takes no clinician or appointment input, so the
  preconditions cannot be met. Report every sub-feature as `blocked` with that reason.
  Doctor warns about this ("clinician has 0 appointments").
- Unblocking requires an appointment fixture in `src/starter-code/` or a way to pass
  clinicians into the API. When that lands, update the preconditions here and add a
  `drive.js` option only if the real user path takes the same input.
- Only count `UPCOMING` appointments against capacity unless the implementation documents
  otherwise; `CANCELLED` and `RE_SCHEDULED` sessions free the slot.
- The README does not define the week boundary. Record which day the implementation
  treats as the first of the week before asserting `cap-weekly`.
