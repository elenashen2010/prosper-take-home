import { parseTimeZone } from "./localDay";
import { clinicianRepository, createMockClinicianRepository } from "./mockClinicianOrm";
import { Clinician } from "./starter-code/clinician";
import { clinician as seedClinician } from "./starter-code/mock-clinician";
import { patient } from "./starter-code/mock-patient";
import { InsurancePayers } from "./starter-code/payer";
import { UsStateAbbreviations } from "./starter-code/us-states";

function makeClinician(overrides: Partial<Clinician> & Pick<Clinician, "id">): Clinician {
  return {
    firstName: "Test",
    lastName: "Clinician",
    states: [],
    insurances: [],
    clinicianType: "THERAPIST",
    timezone: parseTimeZone("America/New_York"),
    appointments: [],
    availableSlots: [],
    maxDailyAppointments: 2,
    maxWeeklyAppointments: 8,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    ...overrides,
  };
}

function idsOf(clinicians: Clinician[]): string[] {
  return clinicians.map((c) => c.id).sort();
}

const therapistIn = { clinicianType: "THERAPIST" } as const;

describe("clinicianRepository", () => {
  it("returns the seeded clinician object itself for the seed patient", () => {
    const found = clinicianRepository.findByTypeStateAndInsurance({ ...patient, clinicianType: "PSYCHOLOGIST" });
    expect(idsOf(found)).toEqual(["9c516382-c5b2-4677-a7ac-4e100fa35bdd"]);
    expect(found[0]).toBe(seedClinician);
  });

  it("carries the seed clinician's parsed time zone", () => {
    const [found] = clinicianRepository.findByTypeStateAndInsurance({ ...patient, clinicianType: "PSYCHOLOGIST" });
    expect(found.timezone).toBe("America/New_York");
  });

  it("returns nothing when the type does not match", () => {
    expect(clinicianRepository.findByTypeStateAndInsurance({ ...patient, clinicianType: "THERAPIST" })).toEqual([]);
  });

  it("returns nothing when the state does not match", () => {
    expect(
      clinicianRepository.findByTypeStateAndInsurance({ clinicianType: "PSYCHOLOGIST", state: "TX", insurance: "AETNA" }),
    ).toEqual([]);
  });

  it("returns nothing when the insurance does not match", () => {
    expect(
      clinicianRepository.findByTypeStateAndInsurance({ clinicianType: "PSYCHOLOGIST", state: "NY", insurance: "BCBS" }),
    ).toEqual([]);
  });

  it("lists only the seed clinician in this test run", () => {
    expect(clinicianRepository.findAll()).toEqual([seedClinician]);
  });
});

describe("createMockClinicianRepository", () => {
  it("requires type, state, and insurance to match", () => {
    const repo = createMockClinicianRepository([
      makeClinician({ id: "state-only", states: ["NY"], insurances: ["BCBS"] }),
      makeClinician({ id: "insurance-only", states: ["CA"], insurances: ["AETNA"] }),
      makeClinician({ id: "psychologist", states: ["NY"], insurances: ["AETNA"], clinicianType: "PSYCHOLOGIST" }),
      makeClinician({ id: "therapist", states: ["NY"], insurances: ["AETNA"] }),
    ]);
    expect(idsOf(repo.findByTypeStateAndInsurance({ ...therapistIn, state: "NY", insurance: "AETNA" }))).toEqual([
      "therapist",
    ]);
    expect(
      idsOf(repo.findByTypeStateAndInsurance({ clinicianType: "PSYCHOLOGIST", state: "NY", insurance: "AETNA" })),
    ).toEqual(["psychologist"]);
  });

  it("matches on any element of either array", () => {
    const repo = createMockClinicianRepository([
      makeClinician({ id: "multi", states: ["CA", "TX", "NY"], insurances: ["UNITED", "AETNA"] }),
      makeClinician({ id: "other", states: ["FL"], insurances: ["CIGNA"] }),
    ]);
    expect(idsOf(repo.findByTypeStateAndInsurance({ ...therapistIn, state: "NY", insurance: "AETNA" }))).toEqual(["multi"]);
    expect(idsOf(repo.findByTypeStateAndInsurance({ ...therapistIn, state: "TX", insurance: "UNITED" }))).toEqual(["multi"]);
  });

  it("returns nothing from an empty table", () => {
    const repo = createMockClinicianRepository([]);
    expect(repo.findByTypeStateAndInsurance({ ...therapistIn, state: "NY", insurance: "AETNA" })).toEqual([]);
    expect(repo.findAll()).toEqual([]);
  });

  it("lists every row in table order, whatever the query columns hold", () => {
    const repo = createMockClinicianRepository([
      makeClinician({ id: "b", states: ["CA"], insurances: ["BCBS"] }),
      makeClinician({ id: "a", states: ["NY"], insurances: ["AETNA"], clinicianType: "PSYCHOLOGIST" }),
    ]);
    expect(repo.findAll().map((c) => c.id)).toEqual(["b", "a"]);
  });

  it("finds exactly the matching rows among 400", () => {
    const rows = Array.from({ length: 400 }, (_, i) =>
      makeClinician({
        id: `c-${String(i).padStart(3, "0")}`,
        states: [UsStateAbbreviations[i % 50]],
        insurances: [InsurancePayers[i % 4]],
      }),
    );
    const repo = createMockClinicianRepository(rows);
    expect(idsOf(repo.findByTypeStateAndInsurance({ ...therapistIn, state: "NY", insurance: "UNITED" }))).toEqual([
      "c-031",
      "c-131",
      "c-231",
      "c-331",
    ]);
    expect(repo.findByTypeStateAndInsurance({ ...therapistIn, state: "NY", insurance: "AETNA" })).toEqual([]);
  });

  it("ignores rows pushed to the caller's array after construction", () => {
    const seed = [makeClinician({ id: "original", states: ["NY"], insurances: ["AETNA"] })];
    const repo = createMockClinicianRepository(seed);
    seed.push(makeClinician({ id: "late", states: ["NY"], insurances: ["AETNA"] }));
    expect(idsOf(repo.findByTypeStateAndInsurance({ ...therapistIn, state: "NY", insurance: "AETNA" }))).toEqual([
      "original",
    ]);
  });

  it("rejects values outside the type, state, and insurance enums at compile time", () => {
    const typeChecksOnly = () => {
      // @ts-expect-error lowercase state is not a UsStateAbbreviation
      clinicianRepository.findByTypeStateAndInsurance({ ...therapistIn, state: "ny", insurance: "AETNA" });
      // @ts-expect-error a state is not an InsurancePayer
      clinicianRepository.findByTypeStateAndInsurance({ ...therapistIn, state: "NY", insurance: "NY" });
      // @ts-expect-error an unknown clinician type is not a ClinicianType
      clinicianRepository.findByTypeStateAndInsurance({ clinicianType: "NURSE", state: "NY", insurance: "AETNA" });
      // @ts-expect-error the clinician type is required
      clinicianRepository.findByTypeStateAndInsurance({ state: "NY", insurance: "AETNA" });
      // @ts-expect-error a plain string is not a TimeZone
      makeClinician({ id: "unparsed", timezone: "America/New_York" });
    };
    expect(typeof typeChecksOnly).toBe("function");
  });
});
