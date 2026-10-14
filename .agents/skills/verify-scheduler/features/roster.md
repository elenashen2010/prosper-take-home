# Roster

Under `SEED_CLINICIANS=roster`, nine more patients ask for an assessment against 175 more clinicians. Each patient
sees exactly the groups written beside it in `src/starter-code/mock-roster.ts`. The roster spans six US time zones
and every eligibility, pairing, Task 2, and Task 3 edge case the README rules name. The README patient still sees
only Dr. Doe, with the answer her own seed sets give.

## Sub-features

- `roster-wy-bcbs` returns nothing when no clinician serves the patient's state.
- `roster-tx-united` returns nothing when clinicians serve the state but none accepts the insurance.
- `roster-or-united` returns nothing when the only match is a therapist.
- `roster-tx-bcbs` returns several groups in repository order. It omits a psychologist whose slots are all on one day and excludes a matching therapist. It pairs slots exactly 7 days apart and never 8. It judges days in the clinician's zone, not the zone of the state they serve.
- `roster-hi-aetna` splits one UTC day into two Honolulu days, and refuses a pair that is 7 UTC days but 8 Honolulu days apart.
- `roster-nm-bcbs` keeps Phoenix on MST while Denver falls back on 2024-11-03, and never pairs two slots on the 25-hour fall-back day.
- `roster-fl-united` keeps only a ladder's ends on a day with room for 2 sessions, and every start on a day with room for 1.
- `roster-wa-bcbs` treats an evening ladder that crosses UTC midnight as one Los Angeles day.
- `roster-ga-united` covers Task 3: a full day, a week with room for one session but not two, 60-minute and 90-minute holds, every appointment status, an appointment counted on the clinician's local day, and `maxDailyAppointments` 0.
- `roster-byrne` offers the README patient only Dr. Doe, so no roster or crowd clinician leaks into her result.

## How to get to it (user POV)

- Run `SEED_CLINICIANS=roster npm run dev` from the repo root. It prints the README patient and then each roster patient.
- Run `npm test`. `src/roster.test.ts` checks every scenario through the seeded repositories.
- Call `findAvailableSlots(patient)` from `src/schedulerApi.ts` in a process started with `SEED_CLINICIANS=roster`.

## Driving it with drive.js

Preconditions:

- `node .agents/skills/verify-scheduler/scripts/doctor.js --clinicians roster --out .verify-evidence/$RUN/doctor-roster.json`
  reports `RESULT: READY`. Its `clinician roster` check shows 176 clinicians (164 psychologists, 12 therapists), six
  zones, `25 of 391` sixty-minute slots, `16, 12 hold time` appointments, and 10 patients.
  `clinician.appointments matches repository` shows `same 16 ids over 176 clinicians`.
- `$RUN` is this run's id.
- `src/starter-code/mock-roster.ts` is the matrix. Each clinician row has a one-line comment that says which rule it
  exists for, and each scenario holds its patient and its expected groups. Read it there. This file does not copy it.
- `--clinicians roster` adds the roster after Dr. Doe. `--seed` and `--appointments` still pick only her rows, and
  no roster patient shares a state and insurance with her, so every roster answer is the same under every seed.

- **Every scenario at once.** Run
  `node .agents/skills/verify-scheduler/scripts/sweep.js --run $RUN`.
  It exits 0 and prints one line per row, such as
  `ga-united GA/UNITED exact ok (8 options) pairs ok optimized ok capacity ok`.
  It writes each drive under `.verify-evidence/$RUN/roster/<key>/` and the table to `.verify-evidence/$RUN/roster/sweep.json`.
- **Every scenario on the full dump and the busy calendar.** Run
  `node .agents/skills/verify-scheduler/scripts/sweep.js --run $RUN --seed full --appointments busy`.
  It exits 0 with the same nine scenario lines. The `byrne` line reads `doe-only ok (36515 options)`.
  The report is `.verify-evidence/$RUN/roster/sweep-full-busy.json`.
- **No clinician in the state (`roster-wy-bcbs`).** Run
  `node .agents/skills/verify-scheduler/scripts/drive.js --feature roster --run $RUN --clinicians roster --state WY --insurance BCBS --label wy-bcbs --expect-max 0`.
  Exit 0 with no groups.
- **No clinician takes the insurance (`roster-tx-united`).** Run
  `node .agents/skills/verify-scheduler/scripts/drive.js --feature roster --run $RUN --clinicians roster --state TX --insurance UNITED --label tx-united --expect-max 0`.
  Exit 0 with no groups.
- **Only a therapist matches (`roster-or-united`).** Run
  `node .agents/skills/verify-scheduler/scripts/drive.js --feature roster --run $RUN --clinicians roster --state OR --insurance UNITED --label or-united --expect-max 0`.
  Exit 0 with no groups. Dr. Evans serves OR and accepts UNITED, but is a therapist.
- **Several groups (`roster-tx-bcbs`).** Run
  `node .agents/skills/verify-scheduler/scripts/drive.js --feature roster --run $RUN --clinicians roster --state TX --insurance BCBS --label tx-bcbs --expect-min 2 --expect-max 2`.
  Exit 0 with Alvarez (3 options) before Desai (1 option), 4 options in all.
- **Honolulu days (`roster-hi-aetna`).** Run
  `node .agents/skills/verify-scheduler/scripts/drive.js --feature roster --run $RUN --clinicians roster --state HI --insurance AETNA --label hi-aetna --expect-min 1 --expect-max 1`.
  Exit 0 with Kahale's 2 options.
- **Phoenix and Denver (`roster-nm-bcbs`).** Run
  `node .agents/skills/verify-scheduler/scripts/drive.js --feature roster --run $RUN --clinicians roster --state NM --insurance BCBS --label nm-bcbs --expect-min 2 --expect-max 2`.
  Exit 0 with Perez (3 options) before Dietz (4 options), 7 options in all.
- **Ladders with room 2 and room 1 (`roster-fl-united`).** Run
  `node .agents/skills/verify-scheduler/scripts/drive.js --feature roster --run $RUN --clinicians roster --state FL --insurance UNITED --label fl-united --expect-min 1 --expect-max 1`.
  Exit 0 with Grant's 9 options. Then run `optimized.js` on `.verify-evidence/$RUN/roster/fl-united`. It exits 0 with `days offered: 4, ok: 4`.
- **Evening ladder (`roster-wa-bcbs`).** Run
  `node .agents/skills/verify-scheduler/scripts/drive.js --feature roster --run $RUN --clinicians roster --state WA --insurance BCBS --label wa-bcbs --expect-min 1 --expect-max 1`.
  Exit 0 with Lund's 2 options.
- **Capacity (`roster-ga-united`).** Run
  `node .agents/skills/verify-scheduler/scripts/drive.js --feature roster --run $RUN --clinicians roster --state GA --insurance UNITED --label ga-united --expect-min 5 --expect-max 5`.
  Exit 0 with Malik (1), Nakamura (2), Okafor (1), Quinn (3), and Akana (1), 8 options in all. Zimmer is omitted.
  Then run `capacity.js` on `.verify-evidence/$RUN/roster/ga-united`. It exits 0 with `held: 11, problems: 0`.
- **README patient (`roster-byrne`).** Run
  `node .agents/skills/verify-scheduler/scripts/drive.js --feature roster --run $RUN --clinicians roster --label byrne --expect-min 1 --expect-max 1`.
  Exit 0 with one group, Dr. Doe's 11 options.
- **Crafted negative.** Copy `output.json` and `summary.json` from `ga-united` into a scratch directory. In the copy,
  add the option `2024-09-11T14:00:00.000Z` + `2024-09-12T14:00:00.000Z` to Malik's group. Run `capacity.js` on the
  copy. It exits 1 with `daily` for 2024-09-11, which holds 2 of Malik's 2. Never edit the real evidence.
- **Proof.** `.verify-evidence/$RUN/roster/` holds one directory per row with the four drive files plus `pairs.json`,
  `optimized.json`, and `capacity.json`, and the sweep reports.

## Gotchas

- Proven 2026-10-14 (run `roster-20261014-123524`). Both sweeps exited 0 with all 10 rows ok. The scenarios gave 0, 0,
  0, 4, 2, 7, 9, 2, and 8 options, and `byrne` gave 11 on small/none and 36,515 on full/busy. The crafted negative
  made capacity.js exit 1 with `daily`.
- A drive's `count` is the number of groups, not options. The sweep prints the option count.
- The sweep compares whole groups, so an extra crowd group fails a scenario. The crowd is 159 near-miss clinicians.
  Each matches some patient on exactly two of type, state, and insurance, so dropping any eligibility filter adds a
  group.
- Nakamura's Sunday 2024-09-15 row is the one that depends on `WEEK_STARTS_ON`. With a Sunday week start it moves
  to the next week, and `ga-united` gains Nakamura's same-week pair.
- Quinn encodes `HOLDS_CLINICIAN_TIME`. If a freed status starts to hold time, Quinn's group changes or disappears.
- Expected groups are literals that type-check against each clinician's own slots. Fix a failing scenario by fixing
  the scheduler, or by changing the data together with its expectation for a stated reason. Never copy the
  scheduler's new output into the expectation without checking it against the README rules.
- Each drive type-checks the whole project, so one sweep takes about 15 seconds.
