import { SEED_CLINICIAN_ID } from "./mockSlotOrm";
import { SeedClinician, SeedRowIds, tablesOf } from "./roster";
import { ClinicianAssessmentOptions } from "./schedulerApi";
import { patient as readmePatient } from "./starter-code/mock-patient";
import { ROSTER, ROSTER_CLINICIANS, ROSTER_SCENARIOS, rosterKeyOf } from "./starter-code/mock-roster";
import { withSeedEnv } from "./withSeedEnv";

interface SeededApp {
  readonly api: typeof import("./schedulerApi");
  readonly slots: typeof import("./mockSlotOrm");
  readonly appointments: typeof import("./mockAppointmentOrm");
}

/* eslint-disable @typescript-eslint/no-require-imports -- a fresh module instance is the point */
function loadApp(env: Readonly<Record<string, string>>): SeededApp {
  return withSeedEnv(env, () => ({
    api: require("./schedulerApi"),
    slots: require("./mockSlotOrm"),
    appointments: require("./mockAppointmentOrm"),
  }));
}
/* eslint-enable @typescript-eslint/no-require-imports */

const byKey = (g: ClinicianAssessmentOptions) => [
  rosterKeyOf(g.clinician.id),
  g.options.map((o) => [o.first.date.toISOString(), o.second.date.toISOString()]),
];

const README_PAIRS = [
  ["2024-08-19T12:00:00.000Z", "2024-08-21T12:00:00.000Z"],
  ["2024-08-19T12:00:00.000Z", "2024-08-21T15:00:00.000Z"],
  ["2024-08-19T12:00:00.000Z", "2024-08-22T15:00:00.000Z"],
  ["2024-08-19T12:15:00.000Z", "2024-08-21T12:00:00.000Z"],
  ["2024-08-19T12:15:00.000Z", "2024-08-21T15:00:00.000Z"],
  ["2024-08-19T12:15:00.000Z", "2024-08-22T15:00:00.000Z"],
  ["2024-08-21T12:00:00.000Z", "2024-08-22T15:00:00.000Z"],
  ["2024-08-21T12:00:00.000Z", "2024-08-28T12:15:00.000Z"],
  ["2024-08-21T15:00:00.000Z", "2024-08-22T15:00:00.000Z"],
  ["2024-08-21T15:00:00.000Z", "2024-08-28T12:15:00.000Z"],
  ["2024-08-22T15:00:00.000Z", "2024-08-28T12:15:00.000Z"],
];

const scenarioPatients = ROSTER_SCENARIOS.map((s) => s.patient);

function tally(values: readonly (string | number)[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const v of values) counts[v] = (counts[v] ?? 0) + 1;
  return counts;
}

describe("the roster seed (SEED_CLINICIANS=roster)", () => {
  let roster: SeededApp;
  beforeAll(() => {
    roster = loadApp({ SEED_CLINICIANS: "roster" });
  });

  it.each(ROSTER_SCENARIOS)("$key: $exercises", ({ patient, expected }) => {
    expect(roster.api.findAvailableSlots(patient).map(byKey)).toEqual(expected);
  });

  it("still offers the README patient only Dr. Doe's 11 README options", () => {
    expect(roster.api.findAvailableSlots(readmePatient).map(byKey)).toEqual([[SEED_CLINICIAN_ID, README_PAIRS]]);
  });

  it("gives every scenario the same answer on the full dump with the busy calendar", () => {
    const fullBusy = loadApp({ SEED_CLINICIANS: "roster", SEED_SLOTS: "full", SEED_APPOINTMENTS: "busy" });
    expect(ROSTER_SCENARIOS.map((s) => [s.key, fullBusy.api.findAvailableSlots(s.patient).map(byKey)])).toEqual(
      ROSTER_SCENARIOS.map((s) => [s.key, s.expected]),
    );
  });

  it("embeds each clinician's own table rows and sizes slots by clinician type", () => {
    const clinicians = roster.slots.seededRoster.clinicians;
    const notEmbedded = clinicians.filter((c) => {
      const slots = roster.slots.slotRepository.findByClinician(c.id);
      const appointments = roster.appointments.appointmentRepository.findByClinician(c.id);
      return (
        slots.length !== c.availableSlots.length ||
        slots.some((row, i) => row !== c.availableSlots[i]) ||
        appointments.length !== c.appointments.length ||
        appointments.some((row, i) => row !== c.appointments[i])
      );
    });
    expect(notEmbedded.map((c) => c.id)).toEqual([]);
    expect(tally(clinicians.flatMap((c) => c.availableSlots.map((s) => `${c.clinicianType} ${s.length}`)))).toEqual({
      "PSYCHOLOGIST 90": 360,
      "THERAPIST 60": 25,
    });
    expect(tally(clinicians.flatMap((c) => c.appointments.map((a) => a.id.replace(/\d+$/, "N"))))).toEqual({ "roster-appointment-N": 16 });
    const grant = clinicians.find((c) => c.lastName === "Grant");
    expect(grant?.availableSlots[0]).toBe(roster.slots.slotRepository.findByClinician("5eed0000-0000-4000-8000-000000000009")[0]);
    expect(grant?.availableSlots[0].id).toBe("roster-slot-23");
  });
});

describe("the roster data", () => {
  it("reaches every named clinician from some scenario patient", () => {
    const reachedBy = Object.fromEntries(
      ROSTER_CLINICIANS.map((c) => [
        c.key,
        ROSTER_SCENARIOS.filter(
          (s) => c.states.some((state) => state === s.patient.state) && c.insurances.some((insurance) => insurance === s.patient.insurance),
        ).map((s) => s.key),
      ]),
    );
    expect(reachedBy).toEqual({
      alvarez: ["tx-bcbs"],
      brooks: ["tx-bcbs"],
      chen: ["tx-bcbs"],
      desai: ["tx-bcbs"],
      evans: ["or-united"],
      kahale: ["hi-aetna"],
      perez: ["nm-bcbs"],
      dietz: ["nm-bcbs"],
      grant: ["fl-united"],
      lund: ["wa-bcbs"],
      malik: ["ga-united"],
      nakamura: ["ga-united"],
      okafor: ["ga-united"],
      quinn: ["ga-united"],
      akana: ["ga-united"],
      zimmer: ["ga-united"],
    });
  });

  it("puts every crowd clinician two keys from some patient and offers it to none", () => {
    const crowd = ROSTER.clinicians.slice(ROSTER_CLINICIANS.length);
    const patients = [readmePatient, ...scenarioPatients];
    const closest = (c: SeedClinician) =>
      Math.max(
        ...patients.map(
          (p) =>
            Number(c.clinicianType === "PSYCHOLOGIST") +
            Number(c.states.includes(p.state)) +
            Number(c.insurances.includes(p.insurance)),
        ),
      );
    expect(tally(crowd.map((c) => c.clinicianType))).toEqual({ PSYCHOLOGIST: 149, THERAPIST: 10 });
    expect(tally(crowd.map(closest))).toEqual({ 2: 159 });
  });
});

describe("tablesOf", () => {
  const ids: SeedRowIds = { slot: (i) => `s${i}`, appointment: (i) => `a${i}` };
  const base: SeedClinician = {
    id: "c1",
    firstName: "Test",
    lastName: "Row",
    clinicianType: "PSYCHOLOGIST",
    timezone: "America/Chicago",
    states: ["GA"],
    insurances: ["UNITED"],
    maxDailyAppointments: 2,
    maxWeeklyAppointments: 8,
    slots: ["2024-09-10T14:00:00.000Z"],
    appointments: [],
  };
  const tablesWith = (...clinicians: SeedClinician[]) => tablesOf({ clinicians, patients: [] }, ids);

  it("builds rows from an authored clinician", () => {
    const tables = tablesWith(base, { ...base, id: "c2", clinicianType: "THERAPIST" });
    expect(tables.slots.map((s) => [s.id, s.clinicianId, s.length, s.date.toISOString()])).toEqual([
      ["s0", "c1", 90, "2024-09-10T14:00:00.000Z"],
      ["s1", "c2", 60, "2024-09-10T14:00:00.000Z"],
    ]);
    expect(tables.clinicians[1].availableSlots[0]).toBe(tables.slots[1]);
  });

  it("refuses an unknown zone, naming the clinician", () => {
    expect(() => tablesWith({ ...base, timezone: "Mars/Base" })).toThrow('seed clinician Test Row (c1): not an IANA time zone: "Mars/Base"');
  });

  it("refuses a slot that is not canonical ISO output, naming the clinician", () => {
    expect(() => tablesWith({ ...base, slots: ["2024-09-10T14:00:00.0Z"] })).toThrow(
      'seed clinician Test Row (c1): not a canonical ISO instant: "2024-09-10T14:00:00.0Z"',
    );
  });

  it("refuses a repeated clinician id, naming it", () => {
    expect(() => tablesWith(base, { ...base, firstName: "Again" })).toThrow("seed clinician Again Row (c1): repeated id");
  });

  it("refuses a negative cap, naming the clinician", () => {
    expect(() => tablesWith({ ...base, maxDailyAppointments: -1 })).toThrow(
      "seed clinician Test Row (c1): maxDailyAppointments must be a non-negative integer, got -1",
    );
  });
});
