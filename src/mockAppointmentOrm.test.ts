import {
  appointmentRepository,
  createMockAppointmentRepository,
  seedAppointmentSet,
  seedAppointmentSetFromEnv,
} from "./mockAppointmentOrm";
import { SEED_CLINICIAN_ID } from "./mockSlotOrm";
import { Appointment } from "./starter-code/appointment";
import { Clinician } from "./starter-code/clinician";
import { clinician as seedClinician } from "./starter-code/mock-clinician";
import { withSeedEnv } from "./withSeedEnv";

function makeAppointment(overrides: Partial<Appointment> & Pick<Appointment, "id" | "clinicianId">): Appointment {
  return {
    patientId: "patient",
    scheduledFor: new Date("2024-08-21T12:00:00.000Z"),
    appointmentType: "ASSESSMENT_SESSION_1",
    status: "UPCOMING",
    createdAt: new Date(0),
    updatedAt: new Date(0),
    ...overrides,
  };
}

const idsOf = (rows: readonly Appointment[]) => rows.map((a) => a.id);

function seededRowsWith(
  seed: string,
  read: (fresh: typeof import("./mockAppointmentOrm"), freshClinician: Clinician) => Appointment[],
) {
  return withSeedEnv({ SEED_APPOINTMENTS: seed }, () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- a fresh module instance is the point
    const fresh = require("./mockAppointmentOrm") as typeof import("./mockAppointmentOrm");
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- the clinician must embed this instance's rows
    const { clinician } = require("./starter-code/mock-clinician") as typeof import("./starter-code/mock-clinician");
    return read(fresh, clinician);
  });
}

const BUSY_IDS = [
  "mock-appointment-0",
  "mock-appointment-1",
  "mock-appointment-2",
  "mock-appointment-3",
  "mock-appointment-4",
  "mock-appointment-5",
  "mock-appointment-6",
  "mock-appointment-7",
  "mock-appointment-8",
  "mock-appointment-9",
  "mock-appointment-10",
];

describe("seedAppointmentSetFromEnv", () => {
  it("defaults to no appointments when SEED_APPOINTMENTS is unset or empty", () => {
    expect(seedAppointmentSetFromEnv(undefined)).toBe("none");
    expect(seedAppointmentSetFromEnv("")).toBe("none");
  });

  it("selects the busy week for SEED_APPOINTMENTS=busy", () => {
    expect(seedAppointmentSetFromEnv("busy")).toBe("busy");
  });

  it("rejects an unknown value", () => {
    expect(() => seedAppointmentSetFromEnv("bogus")).toThrow('SEED_APPOINTMENTS must be one of none, busy, got "bogus"');
  });

  it("seeds Dr. Doe's 11 rows when loaded with SEED_APPOINTMENTS=busy", () => {
    const rows = seededRowsWith("busy", (fresh) => fresh.appointmentRepository.findByClinician(SEED_CLINICIAN_ID));
    expect(idsOf(rows)).toEqual(BUSY_IDS);
    expect(rows.map((a) => a.scheduledFor.toISOString())).toEqual([
      "2024-08-19T16:00:00.000Z",
      "2024-08-19T19:00:00.000Z",
      "2024-08-20T14:00:00.000Z",
      "2024-08-21T01:00:00.000Z",
      "2024-08-21T14:00:00.000Z",
      "2024-08-22T15:00:00.000Z",
      "2024-08-23T13:00:00.000Z",
      "2024-08-25T14:00:00.000Z",
      "2024-08-28T12:00:00.000Z",
      "2024-08-28T16:00:00.000Z",
      "2024-08-28T18:00:00.000Z",
    ]);
    expect(rows.map((a) => a.status)).toEqual([
      "UPCOMING",
      "UPCOMING",
      "OCCURRED",
      "UPCOMING",
      "UPCOMING",
      "CANCELLED",
      "NO_SHOW",
      "UPCOMING",
      "RE_SCHEDULED",
      "LATE_CANCELLATION",
      "LATE_CANCELLATION",
    ]);
    expect(rows.every((a) => a.clinicianId === SEED_CLINICIAN_ID)).toBe(true);
  });
});

describe("appointmentRepository", () => {
  it("is seeded with no appointments in this test run", () => {
    expect(seedAppointmentSet).toBe("none");
    expect(appointmentRepository.findByClinician(SEED_CLINICIAN_ID)).toEqual([]);
  });

  it("is what the seed clinician embeds as appointments", () => {
    expect(seedClinician.appointments).toEqual([]);
    const busy = seededRowsWith("busy", (_fresh, freshClinician) => freshClinician.appointments);
    expect(idsOf(busy)).toEqual(BUSY_IDS);
  });
});

describe("createMockAppointmentRepository", () => {
  it("returns only the requested clinician's rows in table order, whatever their status", () => {
    const repo = createMockAppointmentRepository([
      makeAppointment({ id: "a1", clinicianId: "a", status: "CANCELLED" }),
      makeAppointment({ id: "b1", clinicianId: "b" }),
      makeAppointment({ id: "a2", clinicianId: "a", status: "UPCOMING" }),
    ]);
    expect(idsOf(repo.findByClinician("a"))).toEqual(["a1", "a2"]);
    expect(idsOf(repo.findByClinician("b"))).toEqual(["b1"]);
  });

  it("returns nothing for an unknown clinician", () => {
    const repo = createMockAppointmentRepository([makeAppointment({ id: "a1", clinicianId: "a" })]);
    expect(repo.findByClinician("nobody")).toEqual([]);
  });

  it("ignores rows pushed to the caller's array after construction", () => {
    const seed = [makeAppointment({ id: "original", clinicianId: "a" })];
    const repo = createMockAppointmentRepository(seed);
    seed.push(makeAppointment({ id: "late", clinicianId: "a" }));
    expect(idsOf(repo.findByClinician("a"))).toEqual(["original"]);
  });
});
