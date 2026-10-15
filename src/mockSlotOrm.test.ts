import {
  createMockSlotRepository,
  SEED_CLINICIAN_ID,
  seedClinicianSetFromEnv,
  seedSlotSet,
  seedSlotSetFromEnv,
  slotRepository,
} from "./mockSlotOrm";
import { AvailableAppointmentSlot } from "./starter-code/appointment";
import { clinician as seedClinician } from "./starter-code/mock-clinician";
import { withSeedEnv } from "./withSeedEnv";

function makeSlot(
  overrides: Partial<AvailableAppointmentSlot> & Pick<AvailableAppointmentSlot, "clinicianId" | "date">,
): AvailableAppointmentSlot {
  return {
    id: `${overrides.clinicianId}-${overrides.date.toISOString()}`,
    length: 90,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    ...overrides,
  };
}

const idsOf = (rows: AvailableAppointmentSlot[]) => rows.map((s) => s.id);

function seededRowsWith(seed: string, read: (fresh: typeof import("./mockSlotOrm")) => AvailableAppointmentSlot[]) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- a fresh module instance is the point
  return withSeedEnv({ SEED_SLOTS: seed }, () => read(require("./mockSlotOrm") as typeof import("./mockSlotOrm")));
}

describe("seedSlotSetFromEnv", () => {
  it("defaults to the small set when SEED_SLOTS is unset or empty", () => {
    expect(seedSlotSetFromEnv(undefined)).toBe("small");
    expect(seedSlotSetFromEnv("")).toBe("small");
  });

  it("selects the full dump for SEED_SLOTS=full", () => {
    expect(seedSlotSetFromEnv("full")).toBe("full");
  });

  it("selects the midnight set for SEED_SLOTS=midnight", () => {
    expect(seedSlotSetFromEnv("midnight")).toBe("midnight");
  });

  it("rejects an unknown value", () => {
    expect(() => seedSlotSetFromEnv("huge")).toThrow('SEED_SLOTS must be one of small, full, midnight, got "huge"');
  });

  it("rejects a name every object inherits", () => {
    expect(() => seedSlotSetFromEnv("constructor")).toThrow('SEED_SLOTS must be one of small, full, midnight, got "constructor"');
  });

  it("seeds 458 rows for the seed clinician when loaded with SEED_SLOTS=full", () => {
    const rows = seededRowsWith("full", (fresh) => fresh.slotRepository.findByClinician(SEED_CLINICIAN_ID));
    expect(rows).toHaveLength(458);
  });

  it("seeds the seven midnight rows for the seed clinician when loaded with SEED_SLOTS=midnight", () => {
    const rows = seededRowsWith("midnight", (fresh) => fresh.slotRepository.findByClinician(SEED_CLINICIAN_ID));
    expect(rows).toHaveLength(7);
    expect(rows[0].date.toISOString()).toBe("2024-08-20T03:00:00.000Z");
  });
});

describe("seedClinicianSetFromEnv", () => {
  it("defaults to Dr. Doe alone when SEED_CLINICIANS is unset or empty", () => {
    expect(seedClinicianSetFromEnv(undefined)).toBe("doe");
    expect(seedClinicianSetFromEnv("")).toBe("doe");
  });

  it("selects the roster for SEED_CLINICIANS=roster", () => {
    expect(seedClinicianSetFromEnv("roster")).toBe("roster");
  });

  it("rejects an unknown value", () => {
    expect(() => seedClinicianSetFromEnv("bogus")).toThrow('SEED_CLINICIANS must be one of doe, roster, got "bogus"');
  });
});

describe("slotRepository", () => {
  it("is seeded from the small set in this test run", () => {
    expect(seedSlotSet).toBe("small");
  });

  it("holds the six small-set rows for the seed clinician", () => {
    const rows = slotRepository.findByClinician(SEED_CLINICIAN_ID);
    expect(idsOf(rows)).toEqual(["mock-slot-0", "mock-slot-1", "mock-slot-2", "mock-slot-3", "mock-slot-4", "mock-slot-5"]);
    expect(rows[0].date.toISOString()).toBe("2024-08-19T12:00:00.000Z");
    expect(rows.every((s) => s.clinicianId === SEED_CLINICIAN_ID && s.length === 90)).toBe(true);
  });

  it("is what the seed clinician embeds as availableSlots", () => {
    const rows = slotRepository.findByClinician(seedClinician.id);
    expect(seedClinician.availableSlots).toEqual(rows);
    expect(seedClinician.availableSlots[0]).toBe(rows[0]);
  });

  it("returns nothing for an unknown clinician", () => {
    expect(slotRepository.findByClinician("nobody")).toEqual([]);
  });
});

describe("createMockSlotRepository", () => {
  it("returns only the requested clinician's rows, in table order", () => {
    const repo = createMockSlotRepository([
      makeSlot({ clinicianId: "a", date: new Date("2024-08-21T12:00:00.000Z") }),
      makeSlot({ clinicianId: "b", date: new Date("2024-08-19T12:00:00.000Z") }),
      makeSlot({ clinicianId: "a", date: new Date("2024-08-19T12:00:00.000Z") }),
    ]);
    expect(idsOf(repo.findByClinician("a"))).toEqual(["a-2024-08-21T12:00:00.000Z", "a-2024-08-19T12:00:00.000Z"]);
    expect(idsOf(repo.findByClinician("b"))).toEqual(["b-2024-08-19T12:00:00.000Z"]);
    expect(repo.findByClinician("c")).toEqual([]);
  });

  it("returns nothing from an empty table", () => {
    expect(createMockSlotRepository([]).findByClinician("c")).toEqual([]);
  });

  it("ignores rows pushed to the caller's array after construction", () => {
    const seed = [makeSlot({ clinicianId: "c", date: new Date("2024-08-19T12:00:00.000Z") })];
    const repo = createMockSlotRepository(seed);
    seed.push(makeSlot({ clinicianId: "c", date: new Date("2024-08-21T12:00:00.000Z") }));
    expect(idsOf(repo.findByClinician("c"))).toEqual(["c-2024-08-19T12:00:00.000Z"]);
  });

  it("rejects a clinician row in place of a clinician id at compile time", () => {
    const typeChecksOnly = () => {
      // @ts-expect-error a clinician row is not a clinician id
      slotRepository.findByClinician(seedClinician);
    };
    expect(typeof typeChecksOnly).toBe("function");
  });
});
