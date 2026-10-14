# Therapy intake

A patient who wants therapy sees 60-minute intake slots with therapists who operate in
their state and accept their insurance; only the intake is booked online, never the
recurring 60-minute sessions.

## Sub-features

- `therapy-eligible` returns 60-minute slots from matching therapists.
- `therapy-single` offers single slots, not pairs.
- `therapy-only-intake` never offers `THERAPY_SIXTY_MINS` recurring sessions.
- `therapy-no-psych` never offers a psychologist's 90-minute slots for a therapy request.

## How to get to it (user POV)

- Run `npm run dev` for a patient who wants therapy.
- Call `findAvailableSlots(patient)` for a therapy request.

## Driving it with drive.js

Preconditions:

- Doctor reports `RESULT: READY` and does not warn "no 60-minute slots".
- `$RUN` is this run's id.
- At least one THERAPIST clinician covering `NY` and accepting `AETNA` with 60-minute
  slots exists in the seed data.
- The API accepts a way to say the patient wants therapy rather than an assessment.

- **Eligible therapy patient.** Ask for therapy options for the seed patient. Run
  `node .agents/skills/verify-scheduler/scripts/drive.js --feature therapy-intake --run $RUN --label therapy-eligible --expect-min 1`.
  Exit 0; every slot in `output.json` has `length` 60 and a therapist's `clinicianId`;
  Dr. Doe's id `9c516382-c5b2-4677-a7ac-4e100fa35bdd` does not appear.
- **Single slots.** In `output.json`, each option is one slot, not two.
- **Proof.** `.verify-evidence/$RUN/therapy-intake/therapy-eligible/` holds the four files.

## Gotchas

- Blocked as of 2026-10-13 on two counts: the seed data has only 90-minute slots and one
  psychologist (Doctor warns "no 60-minute slots"), and neither `Patient` nor
  `findAvailableSlots` has a field for the requested service. Report `blocked` with both
  reasons.
- When the API gains a service-type input, add the matching `drive.js` option and record
  its name here; until then do not fake the request by filtering output.
- The 60-vs-90-minute rule of thumb from the README (90 = psychologist) is a data
  convention, not a guarantee; prove therapist identity by `clinicianId`, not by length.
