# Prosper scheduler take-home

Given a patient, `findAvailableSlots(patient)` in `src/schedulerApi.ts` returns the assessment times they can book, grouped by psychologist. It covers all three tasks in [ASSIGNMENT.md](ASSIGNMENT.md), the original prompt. Code comments that cite "README Task N" refer to that file.

## Run it

Install once with `npm ci`. Node 18 or later.

| Command | What it does |
| --- | --- |
| `npm run dev` | Prints the options for the example patient, Byrne Hollander (NY, AETNA), against Dr. Jane Doe. Gives the 11 pairs from the prompt. |
| `npm test` | Runs the Jest suite. |
| `npx tsc --noEmit` | Type-checks the project. |

Three environment variables choose the seed data. Each is read once, when the mock repositories load.

| Variable | Values | Default |
| --- | --- | --- |
| `SEED_SLOTS` | `small` (the prompt's six slots), `full` (the 458-slot dump), `midnight` (slots near New York midnight) | `small` |
| `SEED_APPOINTMENTS` | `none`, `busy` (a week of existing appointments for Dr. Doe) | `none` |
| `SEED_CLINICIANS` | `doe` (Dr. Doe alone), `roster` (175 more clinicians and 9 more patients) | `doe` |

For example, `SEED_SLOTS=full SEED_APPOINTMENTS=busy npm run dev` runs the full dump against a busy calendar. `SEED_CLINICIANS=roster npm run dev` prints all ten patients. In PowerShell, set the variable first with `$env:SEED_CLINICIANS = "roster"`.

## How it works

1. The clinician repository returns psychologists who serve the patient's state and accept their insurance.
2. One query loads every matching clinician's slots that start after `now`, and one more loads their appointments. That is three queries in all, however many clinicians match.
3. It buckets slots by the clinician's local day. It drops slots that overlap a held appointment, and days with no room under the daily or weekly cap.
4. Each day keeps only the starts that leave the most sessions bookable (Task 2). The target is capped by that day's remaining room, so a day with room for one more session offers every free start.
5. It pairs slots on different local days 1 to 7 days apart. A pair in one week needs weekly room for both sessions.

`src/capacity.ts` owns the Task 3 rules, `src/maxAppointments.ts` the Task 2 filter, and `src/localDay.ts` the calendar arithmetic.

## Assumptions

The prompt leaves these open. Each lives in one constant or table, so changing it is one edit.

- A day is the clinician's calendar day in their own IANA time zone, not the UTC day. Clinicians carry a new `timezone` column for this.
- Weeks start on Monday (`WEEK_STARTS_ON`).
- `UPCOMING`, `OCCURRED`, and `NO_SHOW` appointments hold the clinician's time. `RE_SCHEDULED`, `CANCELLED`, and `LATE_CANCELLATION` free it (`HOLDS_CLINICIAN_TIME`).
- A held appointment blocks 90 minutes for assessments and 60 for therapy, whatever the slot length.
- Only slots that start after `now` are offered. Appointments before `now` still count toward their day and week. `findAvailableSlots(patient, repositories, now)` defaults `now` to `SEED_NOW`, the moment the slot dump was taken (2024-08-15), so the seeded demo stays stable. A live caller passes `new Date()`.

## Mock ORM pattern

There is no database. Each table sits behind a repository interface with an in-memory implementation:

- `src/mockClinicianOrm.ts`
- `src/mockSlotOrm.ts`
- `src/mockAppointmentOrm.ts`

Every repository method carries the SQL it stands for as a doc comment. A method only exists if Postgres could run that SQL, so swapping in Prisma means implementing the same interfaces.

Each module exports a factory (`createMockSlotRepository(rows, ...)`) and a seeded instance built from the environment variables above. `findAvailableSlots(patient, repositories?)` uses the seeded instances by default. Tests pass their own repositories built from small inline fixtures.

The roster in `src/starter-code/mock-roster.ts` is written the way Prisma relations read: each clinician owns its slots and appointments. `tablesOf` in `src/roster.ts` flattens them into the tables, so slot length, foreign keys, and embedded relations are correct by construction.

## Testing approach

There are two layers.

- **Unit tests** in `src/*.test.ts` call the code the way a caller does and compare against literal expected values. They cover the repositories, the calendar helpers, the Task 2 filter, and the scheduler.
- **Scenario data.** The roster is a dataset where each clinician exists to break one rule if the scheduler regresses. It spans six US time zones, the November daylight-saving change, ladders, full days and weeks, and every appointment status. Each roster patient carries the exact groups they must be offered, and `src/roster.test.ts` checks every one. 159 generated near-miss clinicians each match some patient on two of type, state, and insurance, so dropping any eligibility filter adds groups and fails a test.

A verification harness in `.agents/skills/verify-scheduler/` runs the real scheduler and checks its output with independent re-implementations of each rule. `node .agents/skills/verify-scheduler/scripts/sweep.js --run <id>` drives every roster patient and runs all three checkers on each result. Its `SKILL.md` has the details.

## Process

I built this with Claude Code and [pstack](https://github.com/backnotprop/pstack), a set of agent skills installed under `.agents/skills/`.

- **Mode.** Most tasks ran under pstack's `/poteto-mode`. It matches the task to a playbook such as Feature or Refactoring and applies a set of engineering principles. Examples are "test behavior, not implementation" and "prove it works against the real artifact".
- **Design.** For larger changes, such as the roster dataset, the `architect` and `arena` skills had two models sketch competing designs. A third model judged them, and the final design took the best parts of each.
- **Verification.** `create-verification-skill` generated the `verify-scheduler` harness, and `/maintain-verification-skill` kept it in step with the code. After each task, an agent drove the real scheduler through the harness instead of trusting passing unit tests.
- **Mock ORM first.** Before any scheduling logic, I had pstack build the mock repositories. Each method had to be expressible in SQL, so the business logic was written against a realistic data layer from the start.
- **Manual review.** I read every diff before committing, and committed one checkpoint per task so each step can be reviewed on its own in the history. I steered design calls the agents surfaced, such as the clinician time zone column, and checked outputs against the worked example in [ASSIGNMENT.md](ASSIGNMENT.md).

## Limitations

- Only assessments are scheduled. The roster has therapists with 60-minute slots, but neither `Patient` nor `findAvailableSlots` has a way to ask for a therapy intake.
- Task 2 runs a quadratic pass per clinician day. That is fine for the slot counts here, which are tens per day.
