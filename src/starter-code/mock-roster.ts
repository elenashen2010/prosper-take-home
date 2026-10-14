import { crowdOf, SeedClinician, SeedSet } from "../roster";
import { patient as readmePatient } from "./mock-patient";
import { Patient } from "./patient";

interface RosterClinician extends SeedClinician {
  readonly key: string;
}

const ANY_PATIENT_ID = "5eedb00c-0000-4000-8000-000000000000";

export const ROSTER_CLINICIANS = [
  // Pairing bounds: same day never, exactly 7 days yes, 8 days no. Slots later than desai's, listed first: groups follow repository order.
  { key: "alvarez", id: "5eed0000-0000-4000-8000-000000000001", firstName: "Ana", lastName: "Alvarez", clinicianType: "PSYCHOLOGIST",
    timezone: "America/Chicago", states: ["TX", "OK"], insurances: ["BCBS"], maxDailyAppointments: 2, maxWeeklyAppointments: 8,
    slots: ["2024-09-16T15:00:00.000Z", "2024-09-16T19:00:00.000Z", "2024-09-23T15:00:00.000Z", "2024-09-24T15:00:00.000Z"], appointments: [] },
  // Every slot on one local day: eligible but omitted.
  { key: "brooks", id: "5eed0000-0000-4000-8000-000000000002", firstName: "Ben", lastName: "Brooks", clinicianType: "PSYCHOLOGIST",
    timezone: "America/Chicago", states: ["TX"], insurances: ["BCBS"], maxDailyAppointments: 2, maxWeeklyAppointments: 8,
    slots: ["2024-09-10T14:00:00.000Z", "2024-09-10T18:00:00.000Z"], appointments: [] },
  // Therapist with the TX/BCBS patient's state and insurance and pairable days: excluded by type.
  { key: "chen", id: "5eed0000-0000-4000-8000-000000000003", firstName: "Cora", lastName: "Chen", clinicianType: "THERAPIST",
    timezone: "America/Chicago", states: ["TX"], insurances: ["BCBS"], maxDailyAppointments: 2, maxWeeklyAppointments: 8,
    slots: ["2024-09-10T15:00:00.000Z", "2024-09-11T15:00:00.000Z"], appointments: [] },
  // Serves TX from Los Angeles: 05:30Z is Wed 22:30 PDT but Thu 00:30 CDT. Matches on the second state and second insurance.
  { key: "desai", id: "5eed0000-0000-4000-8000-000000000004", firstName: "Dev", lastName: "Desai", clinicianType: "PSYCHOLOGIST",
    timezone: "America/Los_Angeles", states: ["OK", "TX"], insurances: ["CIGNA", "BCBS"], maxDailyAppointments: 2, maxWeeklyAppointments: 8,
    slots: ["2024-09-12T05:30:00.000Z", "2024-09-12T16:00:00.000Z"], appointments: [] },
  // The only OR/UNITED clinician is a therapist.
  { key: "evans", id: "5eed0000-0000-4000-8000-000000000005", firstName: "Eli", lastName: "Evans", clinicianType: "THERAPIST",
    timezone: "America/Los_Angeles", states: ["OR", "WA"], insurances: ["UNITED"], maxDailyAppointments: 2, maxWeeklyAppointments: 8,
    slots: ["2024-09-10T17:00:00.000Z", "2024-09-11T17:00:00.000Z", "2024-09-12T17:00:00.000Z"], appointments: [] },
  // HST: UTC day 09-10 is local 09-09 and 09-10; 08:00Z->09-17T12:00Z is 7 UTC days but 8 local days.
  { key: "kahale", id: "5eed0000-0000-4000-8000-000000000006", firstName: "Kai", lastName: "Kahale", clinicianType: "PSYCHOLOGIST",
    timezone: "Pacific/Honolulu", states: ["HI"], insurances: ["AETNA", "UNITED"], maxDailyAppointments: 2, maxWeeklyAppointments: 8,
    slots: ["2024-09-10T08:00:00.000Z", "2024-09-10T20:00:00.000Z", "2024-09-17T12:00:00.000Z"], appointments: [] },
  // No DST: the two 11-02 UTC starts are Fri and Sat in Phoenix but both Sat in Denver (MDT until 11-03).
  { key: "perez", id: "5eed0000-0000-4000-8000-000000000007", firstName: "Paz", lastName: "Perez", clinicianType: "PSYCHOLOGIST",
    timezone: "America/Phoenix", states: ["AZ", "NM"], insurances: ["BCBS"], maxDailyAppointments: 2, maxWeeklyAppointments: 8,
    slots: ["2024-11-02T06:30:00.000Z", "2024-11-02T15:00:00.000Z", "2024-11-09T06:30:00.000Z"], appointments: [] },
  // Fall-back: 11-03T06:30Z (00:30 MDT) and 11-04T06:30Z (23:30 MST) are 24 h apart on one 25-hour local day.
  { key: "dietz", id: "5eed0000-0000-4000-8000-000000000008", firstName: "Dana", lastName: "Dietz", clinicianType: "PSYCHOLOGIST",
    timezone: "America/Denver", states: ["CO", "NM"], insurances: ["BCBS"], maxDailyAppointments: 2, maxWeeklyAppointments: 8,
    slots: ["2024-10-27T06:30:00.000Z", "2024-11-03T06:30:00.000Z", "2024-11-04T06:30:00.000Z", "2024-11-10T06:30:00.000Z"], appointments: [] },
  // Task 2 twice: 09-10 ladder with room 2 keeps its ends; 09-24 ladder with room 1 (one held row that day) keeps all 7.
  { key: "grant", id: "5eed0000-0000-4000-8000-000000000009", firstName: "Gil", lastName: "Grant", clinicianType: "PSYCHOLOGIST",
    timezone: "America/New_York", states: ["FL"], insurances: ["UNITED"], maxDailyAppointments: 2, maxWeeklyAppointments: 8,
    slots: [
      "2024-09-10T13:00:00.000Z", "2024-09-10T13:15:00.000Z", "2024-09-10T13:30:00.000Z", "2024-09-10T13:45:00.000Z",
      "2024-09-10T14:00:00.000Z", "2024-09-10T14:15:00.000Z", "2024-09-10T14:30:00.000Z",
      "2024-09-12T14:00:00.000Z",
      "2024-09-24T13:00:00.000Z", "2024-09-24T13:15:00.000Z", "2024-09-24T13:30:00.000Z", "2024-09-24T13:45:00.000Z",
      "2024-09-24T14:00:00.000Z", "2024-09-24T14:15:00.000Z", "2024-09-24T14:30:00.000Z",
      "2024-09-26T14:00:00.000Z",
    ],
    appointments: [{ patientId: ANY_PATIENT_ID, scheduledFor: "2024-09-24T18:00:00.000Z", appointmentType: "ASSESSMENT_SESSION_1", status: "UPCOMING" }] },
  // Evening ladder 16:00-17:30 PDT crosses UTC midnight: one local day, so only its ends survive.
  { key: "lund", id: "5eed0000-0000-4000-8000-000000000010", firstName: "Lena", lastName: "Lund", clinicianType: "PSYCHOLOGIST",
    timezone: "America/Los_Angeles", states: ["WA", "OR"], insurances: ["BCBS"], maxDailyAppointments: 2, maxWeeklyAppointments: 8,
    slots: [
      "2024-09-11T23:00:00.000Z", "2024-09-11T23:15:00.000Z", "2024-09-11T23:30:00.000Z", "2024-09-11T23:45:00.000Z",
      "2024-09-12T00:00:00.000Z", "2024-09-12T00:15:00.000Z", "2024-09-12T00:30:00.000Z",
      "2024-09-13T17:00:00.000Z",
    ],
    appointments: [] },
  // Full day: 09-11 holds 2 of 2, neither overlapping the 09-11 slot.
  { key: "malik", id: "5eed0000-0000-4000-8000-000000000011", firstName: "Mo", lastName: "Malik", clinicianType: "PSYCHOLOGIST",
    timezone: "America/Chicago", states: ["GA"], insurances: ["UNITED"], maxDailyAppointments: 2, maxWeeklyAppointments: 10,
    slots: ["2024-09-10T14:00:00.000Z", "2024-09-11T14:00:00.000Z", "2024-09-12T14:00:00.000Z"],
    appointments: [
      { patientId: ANY_PATIENT_ID, scheduledFor: "2024-09-11T17:00:00.000Z", appointmentType: "ASSESSMENT_SESSION_1", status: "UPCOMING" },
      { patientId: ANY_PATIENT_ID, scheduledFor: "2024-09-11T19:00:00.000Z", appointmentType: "ASSESSMENT_SESSION_2", status: "UPCOMING" },
    ] },
  // Week of 09-09 holds 3 of 4 (Mon, Fri, Sun): one more fits, a same-week pair does not. The Sunday row is what makes this row depend on the week start.
  { key: "nakamura", id: "5eed0000-0000-4000-8000-000000000012", firstName: "Nia", lastName: "Nakamura", clinicianType: "PSYCHOLOGIST",
    timezone: "America/Chicago", states: ["GA"], insurances: ["UNITED"], maxDailyAppointments: 3, maxWeeklyAppointments: 4,
    slots: ["2024-09-10T14:00:00.000Z", "2024-09-11T14:00:00.000Z", "2024-09-16T14:00:00.000Z"],
    appointments: [
      { patientId: ANY_PATIENT_ID, scheduledFor: "2024-09-09T18:00:00.000Z", appointmentType: "ASSESSMENT_SESSION_1", status: "UPCOMING" },
      { patientId: ANY_PATIENT_ID, scheduledFor: "2024-09-13T18:00:00.000Z", appointmentType: "ASSESSMENT_SESSION_1", status: "OCCURRED" },
      { patientId: ANY_PATIENT_ID, scheduledFor: "2024-09-15T18:00:00.000Z", appointmentType: "ASSESSMENT_SESSION_1", status: "UPCOMING" },
    ] },
  // A held therapy row blocks 60 minutes, a held assessment 90: 16:00Z touches the first, 16:00Z overlaps the second, 16:30Z touches it.
  { key: "okafor", id: "5eed0000-0000-4000-8000-000000000013", firstName: "Obi", lastName: "Okafor", clinicianType: "PSYCHOLOGIST",
    timezone: "America/Chicago", states: ["GA"], insurances: ["UNITED"], maxDailyAppointments: 3, maxWeeklyAppointments: 8,
    slots: ["2024-09-11T16:00:00.000Z", "2024-09-12T16:00:00.000Z", "2024-09-12T16:30:00.000Z"],
    appointments: [
      { patientId: ANY_PATIENT_ID, scheduledFor: "2024-09-11T15:00:00.000Z", appointmentType: "THERAPY_SIXTY_MINS", status: "UPCOMING" },
      { patientId: ANY_PATIENT_ID, scheduledFor: "2024-09-12T15:00:00.000Z", appointmentType: "ASSESSMENT_SESSION_1", status: "UPCOMING" },
    ] },
  // One row per status, each at a slot's own start. Freed rows would fill week 09-09 (cap 5) and day 09-16 (cap 2) if counted.
  { key: "quinn", id: "5eed0000-0000-4000-8000-000000000014", firstName: "Quin", lastName: "Quinn", clinicianType: "PSYCHOLOGIST",
    timezone: "America/Chicago", states: ["GA"], insurances: ["UNITED"], maxDailyAppointments: 2, maxWeeklyAppointments: 5,
    slots: [
      "2024-09-09T15:00:00.000Z", "2024-09-10T15:00:00.000Z", "2024-09-11T15:00:00.000Z",
      "2024-09-12T15:00:00.000Z", "2024-09-13T15:00:00.000Z", "2024-09-16T15:00:00.000Z",
    ],
    appointments: [
      { patientId: ANY_PATIENT_ID, scheduledFor: "2024-09-09T15:00:00.000Z", appointmentType: "ASSESSMENT_SESSION_1", status: "UPCOMING" },
      { patientId: ANY_PATIENT_ID, scheduledFor: "2024-09-10T15:00:00.000Z", appointmentType: "ASSESSMENT_SESSION_1", status: "OCCURRED" },
      { patientId: ANY_PATIENT_ID, scheduledFor: "2024-09-11T15:00:00.000Z", appointmentType: "ASSESSMENT_SESSION_1", status: "NO_SHOW" },
      { patientId: ANY_PATIENT_ID, scheduledFor: "2024-09-12T15:00:00.000Z", appointmentType: "ASSESSMENT_SESSION_1", status: "RE_SCHEDULED" },
      { patientId: ANY_PATIENT_ID, scheduledFor: "2024-09-13T15:00:00.000Z", appointmentType: "ASSESSMENT_SESSION_1", status: "CANCELLED" },
      { patientId: ANY_PATIENT_ID, scheduledFor: "2024-09-16T15:00:00.000Z", appointmentType: "ASSESSMENT_SESSION_1", status: "LATE_CANCELLATION" },
      { patientId: ANY_PATIENT_ID, scheduledFor: "2024-09-16T19:00:00.000Z", appointmentType: "ASSESSMENT_SESSION_1", status: "LATE_CANCELLATION" },
    ] },
  // 2024-09-11T08:00Z is 09-10 22:00 HST: it fills 09-10 (cap 1), not its UTC day 09-11.
  { key: "akana", id: "5eed0000-0000-4000-8000-000000000015", firstName: "Ike", lastName: "Akana", clinicianType: "PSYCHOLOGIST",
    timezone: "Pacific/Honolulu", states: ["GA"], insurances: ["UNITED"], maxDailyAppointments: 1, maxWeeklyAppointments: 8,
    slots: ["2024-09-10T19:00:00.000Z", "2024-09-11T19:00:00.000Z", "2024-09-12T19:00:00.000Z"],
    appointments: [{ patientId: ANY_PATIENT_ID, scheduledFor: "2024-09-11T08:00:00.000Z", appointmentType: "ASSESSMENT_SESSION_1", status: "UPCOMING" }] },
  // maxDailyAppointments 0 with pairable slots and no appointments.
  { key: "zimmer", id: "5eed0000-0000-4000-8000-000000000016", firstName: "Zed", lastName: "Zimmer", clinicianType: "PSYCHOLOGIST",
    timezone: "America/Chicago", states: ["GA"], insurances: ["UNITED"], maxDailyAppointments: 0, maxWeeklyAppointments: 8,
    slots: ["2024-09-10T14:00:00.000Z", "2024-09-11T14:00:00.000Z"], appointments: [] },
] as const satisfies readonly RosterClinician[];

type Named = (typeof ROSTER_CLINICIANS)[number];
export type RosterKey = Named["key"];
type SlotOf<K extends RosterKey> = Extract<Named, { key: K }>["slots"][number];

/**
 * One expected group: a named clinician and its options in README order. Each pair may only use that clinician's
 * own slot literals, so a typo, a slot of another clinician, a crowd or Doe group fails to compile.
 */
export type ExpectedGroup = { [K in RosterKey]: readonly [K, readonly (readonly [SlotOf<K>, SlotOf<K>])[]] }[RosterKey];

export interface RosterScenario {
  readonly key: string;
  /** The rule this patient exists to catch; the Jest title and the sweep table row. */
  readonly exercises: string;
  readonly patient: Patient;
  /** findAvailableSlots(patient) under SEED_CLINICIANS=roster, groups in repository order, whatever SEED_SLOTS and SEED_APPOINTMENTS are. */
  readonly expected: readonly ExpectedGroup[];
}

function rosterPatient(n: number, firstName: string, lastName: string, state: Patient["state"], insurance: Patient["insurance"]): Patient {
  return {
    id: `5eed0001-0000-4000-8000-${String(n).padStart(12, "0")}`,
    firstName,
    lastName,
    state,
    insurance,
    createdAt: new Date(0),
    updatedAt: new Date(0),
  };
}

export const ROSTER_SCENARIOS: readonly RosterScenario[] = [
  { key: "wy-bcbs", exercises: "no clinician serves the state", patient: rosterPatient(1, "Wren", "Young", "WY", "BCBS"), expected: [] },
  { key: "tx-united", exercises: "TX is served, UNITED is not accepted there", patient: rosterPatient(2, "Tess", "Ulloa", "TX", "UNITED"), expected: [] },
  { key: "or-united", exercises: "only a therapist matches", patient: rosterPatient(3, "Owen", "Underhill", "OR", "UNITED"), expected: [] },
  {
    key: "tx-bcbs",
    exercises: "several match: repository order, one-day psychologist omitted, therapist excluded, 7 vs 8 days, clinician zone over state",
    patient: rosterPatient(4, "Tara", "Bell", "TX", "BCBS"),
    expected: [
      ["alvarez", [
        ["2024-09-16T15:00:00.000Z", "2024-09-23T15:00:00.000Z"],
        ["2024-09-16T19:00:00.000Z", "2024-09-23T15:00:00.000Z"],
        ["2024-09-23T15:00:00.000Z", "2024-09-24T15:00:00.000Z"],
      ]],
      ["desai", [["2024-09-12T05:30:00.000Z", "2024-09-12T16:00:00.000Z"]]],
    ],
  },
  {
    key: "hi-aetna",
    exercises: "Honolulu: one UTC day is two local days; 7 UTC days can be 8 local days",
    patient: rosterPatient(5, "Hana", "Akamu", "HI", "AETNA"),
    expected: [
      ["kahale", [
        ["2024-09-10T08:00:00.000Z", "2024-09-10T20:00:00.000Z"],
        ["2024-09-10T20:00:00.000Z", "2024-09-17T12:00:00.000Z"],
      ]],
    ],
  },
  {
    key: "nm-bcbs",
    exercises: "Phoenix keeps MST while Denver falls back on 2024-11-03",
    patient: rosterPatient(6, "Nico", "Baca", "NM", "BCBS"),
    expected: [
      ["perez", [
        ["2024-11-02T06:30:00.000Z", "2024-11-02T15:00:00.000Z"],
        ["2024-11-02T06:30:00.000Z", "2024-11-09T06:30:00.000Z"],
        ["2024-11-02T15:00:00.000Z", "2024-11-09T06:30:00.000Z"],
      ]],
      ["dietz", [
        ["2024-10-27T06:30:00.000Z", "2024-11-03T06:30:00.000Z"],
        ["2024-10-27T06:30:00.000Z", "2024-11-04T06:30:00.000Z"],
        ["2024-11-03T06:30:00.000Z", "2024-11-10T06:30:00.000Z"],
        ["2024-11-04T06:30:00.000Z", "2024-11-10T06:30:00.000Z"],
      ]],
    ],
  },
  {
    key: "fl-united",
    exercises: "Task 2 ladder keeps its ends at room 2 and every start at room 1",
    patient: rosterPatient(7, "Faye", "Upton", "FL", "UNITED"),
    expected: [
      ["grant", [
        ["2024-09-10T13:00:00.000Z", "2024-09-12T14:00:00.000Z"],
        ["2024-09-10T14:30:00.000Z", "2024-09-12T14:00:00.000Z"],
        ["2024-09-24T13:00:00.000Z", "2024-09-26T14:00:00.000Z"],
        ["2024-09-24T13:15:00.000Z", "2024-09-26T14:00:00.000Z"],
        ["2024-09-24T13:30:00.000Z", "2024-09-26T14:00:00.000Z"],
        ["2024-09-24T13:45:00.000Z", "2024-09-26T14:00:00.000Z"],
        ["2024-09-24T14:00:00.000Z", "2024-09-26T14:00:00.000Z"],
        ["2024-09-24T14:15:00.000Z", "2024-09-26T14:00:00.000Z"],
        ["2024-09-24T14:30:00.000Z", "2024-09-26T14:00:00.000Z"],
      ]],
    ],
  },
  {
    key: "wa-bcbs",
    exercises: "an evening ladder across UTC midnight is one Los Angeles day",
    patient: rosterPatient(8, "Wes", "Bauer", "WA", "BCBS"),
    expected: [
      ["lund", [
        ["2024-09-11T23:00:00.000Z", "2024-09-13T17:00:00.000Z"],
        ["2024-09-12T00:30:00.000Z", "2024-09-13T17:00:00.000Z"],
      ]],
    ],
  },
  {
    key: "ga-united",
    exercises: "Task 3: full day, week room for one, 60 vs 90 minute holds, every status, local-day count, maxDaily 0",
    patient: rosterPatient(9, "Gus", "Ulrich", "GA", "UNITED"),
    expected: [
      ["malik", [["2024-09-10T14:00:00.000Z", "2024-09-12T14:00:00.000Z"]]],
      ["nakamura", [
        ["2024-09-10T14:00:00.000Z", "2024-09-16T14:00:00.000Z"],
        ["2024-09-11T14:00:00.000Z", "2024-09-16T14:00:00.000Z"],
      ]],
      ["okafor", [["2024-09-11T16:00:00.000Z", "2024-09-12T16:30:00.000Z"]]],
      ["quinn", [
        ["2024-09-12T15:00:00.000Z", "2024-09-13T15:00:00.000Z"],
        ["2024-09-12T15:00:00.000Z", "2024-09-16T15:00:00.000Z"],
        ["2024-09-13T15:00:00.000Z", "2024-09-16T15:00:00.000Z"],
      ]],
      ["akana", [["2024-09-11T19:00:00.000Z", "2024-09-12T19:00:00.000Z"]]],
    ],
  },
];

const scenarioPatients = ROSTER_SCENARIOS.map((s) => s.patient);

/** SEED_CLINICIANS=roster: the 16 named clinicians, then the near-miss crowd; the nine scenario patients. */
export const ROSTER: SeedSet = {
  clinicians: [...ROSTER_CLINICIANS, ...crowdOf([readmePatient, ...scenarioPatients])],
  patients: scenarioPatients,
};

const KEY_BY_ID: ReadonlyMap<string, RosterKey> = new Map(ROSTER_CLINICIANS.map((c) => [c.id, c.key]));

/** A named clinician's key, or the id itself for Dr. Doe and the crowd, which no expectation can name. */
export function rosterKeyOf(clinicianId: string): string {
  return KEY_BY_ID.get(clinicianId) ?? clinicianId;
}
