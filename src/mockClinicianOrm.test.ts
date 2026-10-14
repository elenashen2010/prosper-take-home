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

describe("clinicianRepository", () => {
  it("returns the seeded clinician object itself for the seed patient", () => {
    const found = clinicianRepository.findByStateAndInsurance(patient);
    expect(idsOf(found)).toEqual(["9c516382-c5b2-4677-a7ac-4e100fa35bdd"]);
    expect(found[0]).toBe(seedClinician);
  });

  it("returns nothing when the state does not match", () => {
    expect(clinicianRepository.findByStateAndInsurance({ state: "TX", insurance: "AETNA" })).toEqual([]);
  });

  it("returns nothing when the insurance does not match", () => {
    expect(clinicianRepository.findByStateAndInsurance({ state: "NY", insurance: "BCBS" })).toEqual([]);
  });
});

describe("createMockClinicianRepository", () => {
  it("requires both state and insurance to match", () => {
    const repo = createMockClinicianRepository([
      makeClinician({ id: "state-only", states: ["NY"], insurances: ["BCBS"] }),
      makeClinician({ id: "insurance-only", states: ["CA"], insurances: ["AETNA"] }),
      makeClinician({ id: "both", states: ["NY"], insurances: ["AETNA"] }),
    ]);
    expect(idsOf(repo.findByStateAndInsurance({ state: "NY", insurance: "AETNA" }))).toEqual(["both"]);
  });

  it("matches on any element of either array", () => {
    const repo = createMockClinicianRepository([
      makeClinician({ id: "multi", states: ["CA", "TX", "NY"], insurances: ["UNITED", "AETNA"] }),
      makeClinician({ id: "other", states: ["FL"], insurances: ["CIGNA"] }),
    ]);
    expect(idsOf(repo.findByStateAndInsurance({ state: "NY", insurance: "AETNA" }))).toEqual(["multi"]);
    expect(idsOf(repo.findByStateAndInsurance({ state: "TX", insurance: "UNITED" }))).toEqual(["multi"]);
  });

  it("returns nothing from an empty table", () => {
    const repo = createMockClinicianRepository([]);
    expect(repo.findByStateAndInsurance({ state: "NY", insurance: "AETNA" })).toEqual([]);
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
    expect(idsOf(repo.findByStateAndInsurance({ state: "NY", insurance: "UNITED" }))).toEqual([
      "c-031",
      "c-131",
      "c-231",
      "c-331",
    ]);
    expect(repo.findByStateAndInsurance({ state: "NY", insurance: "AETNA" })).toEqual([]);
  });

  it("ignores rows pushed to the caller's array after construction", () => {
    const seed = [makeClinician({ id: "original", states: ["NY"], insurances: ["AETNA"] })];
    const repo = createMockClinicianRepository(seed);
    seed.push(makeClinician({ id: "late", states: ["NY"], insurances: ["AETNA"] }));
    expect(idsOf(repo.findByStateAndInsurance({ state: "NY", insurance: "AETNA" }))).toEqual(["original"]);
  });

  it("rejects values outside the state and insurance enums at compile time", () => {
    const typeChecksOnly = () => {
      // @ts-expect-error lowercase state is not a UsStateAbbreviation
      clinicianRepository.findByStateAndInsurance({ state: "ny", insurance: "AETNA" });
      // @ts-expect-error a state is not an InsurancePayer
      clinicianRepository.findByStateAndInsurance({ state: "NY", insurance: "NY" });
    };
    expect(typeof typeChecksOnly).toBe("function");
  });
});
