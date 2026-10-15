import { LocalDay, localDayOf, parseTimeZone } from "./localDay";
import {
  ClinicianZone,
  createMockSlotRepository,
  SEED_CLINICIAN_ID,
  seedClinicianSetFromEnv,
  seedSlotSet,
  seedSlotSetFromEnv,
  slotRepository,
} from "./mockSlotOrm";
import { AvailableAppointmentSlot } from "./starter-code/appointment";
import { clinician as seedClinician } from "./starter-code/mock-clinician";
import { MOCK_SLOT_DATA, MOCK_SLOT_DATA_SMALL } from "./starter-code/mock-slot-data";
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

function rowsFrom(raw: readonly { length: number; date: string }[], clinicianId: string): AvailableAppointmentSlot[] {
  return raw.map((r) => makeSlot({ clinicianId, date: new Date(r.date), length: r.length }));
}

const NEW_YORK = parseTimeZone("America/New_York");
const inNewYork = (...ids: string[]): ClinicianZone[] => ids.map((id) => ({ id, timezone: NEW_YORK }));
const ABC = inNewYork("a", "b", "c");

const idsOf = (rows: AvailableAppointmentSlot[]) => rows.map((s) => s.id);
const day = (ymd: string): LocalDay => localDayOf(new Date(`${ymd}T12:00:00.000Z`), NEW_YORK);

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

  it("returns only the seed clinician's rows on the requested days", () => {
    const rows = slotRepository.findByClinician(SEED_CLINICIAN_ID, [day("2024-08-19"), day("2024-08-28")]);
    expect(idsOf(rows)).toEqual(["mock-slot-0", "mock-slot-1", "mock-slot-5"]);
  });

  it("returns the four README example days for the seed clinician", () => {
    expect(slotRepository.findSlotDaysByClinician(SEED_CLINICIAN_ID)).toEqual([
      "2024-08-19",
      "2024-08-21",
      "2024-08-22",
      "2024-08-28",
    ]);
  });

  it("returns nothing for an unknown clinician", () => {
    expect(slotRepository.findByClinician("nobody")).toEqual([]);
    expect(slotRepository.findSlotDaysByClinician("nobody")).toEqual([]);
  });
});

describe("createMockSlotRepository", () => {
  it("returns only the requested clinician's rows, in table order", () => {
    const repo = createMockSlotRepository(
      [
        makeSlot({ clinicianId: "a", date: new Date("2024-08-21T12:00:00.000Z") }),
        makeSlot({ clinicianId: "b", date: new Date("2024-08-19T12:00:00.000Z") }),
        makeSlot({ clinicianId: "a", date: new Date("2024-08-19T12:00:00.000Z") }),
      ],
      ABC,
    );
    expect(idsOf(repo.findByClinician("a"))).toEqual(["a-2024-08-21T12:00:00.000Z", "a-2024-08-19T12:00:00.000Z"]);
    expect(idsOf(repo.findByClinician("b"))).toEqual(["b-2024-08-19T12:00:00.000Z"]);
    expect(repo.findByClinician("c")).toEqual([]);
  });

  it("filters a clinician's rows to the given days, keeping table order", () => {
    const repo = createMockSlotRepository(
      [
        makeSlot({ clinicianId: "a", date: new Date("2024-08-22T15:00:00.000Z") }),
        makeSlot({ clinicianId: "a", date: new Date("2024-08-19T12:00:00.000Z") }),
        makeSlot({ clinicianId: "b", date: new Date("2024-08-19T12:00:00.000Z") }),
        makeSlot({ clinicianId: "a", date: new Date("2024-08-21T12:00:00.000Z") }),
        makeSlot({ clinicianId: "a", date: new Date("2024-08-19T12:15:00.000Z") }),
      ],
      ABC,
    );
    expect(idsOf(repo.findByClinician("a", [day("2024-08-19"), day("2024-08-22")]))).toEqual([
      "a-2024-08-22T15:00:00.000Z",
      "a-2024-08-19T12:00:00.000Z",
      "a-2024-08-19T12:15:00.000Z",
    ]);
    expect(idsOf(repo.findByClinician("a", [day("2024-08-21")]))).toEqual(["a-2024-08-21T12:00:00.000Z"]);
    expect(repo.findByClinician("a", [day("2024-08-23")])).toEqual([]);
    expect(repo.findByClinician("a", [])).toEqual([]);
    expect(idsOf(repo.findByClinician("a"))).toHaveLength(4);
  });

  it("judges a slot's day on its clinician's calendar", () => {
    const row = makeSlot({ clinicianId: "c", date: new Date("2024-08-20T02:00:00.000Z") });
    const newYork = createMockSlotRepository([row], inNewYork("c"));
    const utc = createMockSlotRepository([row], [{ id: "c", timezone: parseTimeZone("UTC") }]);
    expect(newYork.findSlotDaysByClinician("c")).toEqual(["2024-08-19"]);
    expect(utc.findSlotDaysByClinician("c")).toEqual(["2024-08-20"]);
    expect(idsOf(newYork.findByClinician("c", [day("2024-08-19")]))).toEqual(["c-2024-08-20T02:00:00.000Z"]);
    expect(utc.findByClinician("c", [day("2024-08-19")])).toEqual([]);
  });

  it("joins on the clinician, so a slot without a clinician row has no days", () => {
    const repo = createMockSlotRepository([makeSlot({ clinicianId: "orphan", date: new Date("2024-08-19T12:00:00.000Z") })], ABC);
    expect(idsOf(repo.findByClinician("orphan"))).toEqual(["orphan-2024-08-19T12:00:00.000Z"]);
    expect(repo.findByClinician("orphan", [day("2024-08-19")])).toEqual([]);
    expect(repo.findSlotDaysByClinician("orphan")).toEqual([]);
  });

  it("rejects a plain string as a day at compile time", () => {
    const typeChecksOnly = () => {
      // @ts-expect-error a plain string is not a LocalDay
      slotRepository.findByClinician("c", ["2024-08-19"]);
    };
    expect(typeof typeChecksOnly).toBe("function");
  });

  it("returns the four distinct days of the small seed set", () => {
    const repo = createMockSlotRepository(rowsFrom(MOCK_SLOT_DATA_SMALL, "c"), ABC);
    expect(repo.findSlotDaysByClinician("c")).toEqual(["2024-08-19", "2024-08-21", "2024-08-22", "2024-08-28"]);
  });

  it("returns the 27 distinct days of the full seed dump", () => {
    const repo = createMockSlotRepository(rowsFrom(MOCK_SLOT_DATA, "c"), ABC);
    const days = repo.findSlotDaysByClinician("c");
    expect(days).toEqual([
      "2024-08-19",
      "2024-08-21",
      "2024-08-22",
      "2024-08-23",
      "2024-08-26",
      "2024-08-28",
      "2024-08-29",
      "2024-08-30",
      "2024-09-02",
      "2024-09-03",
      "2024-09-04",
      "2024-09-05",
      "2024-09-06",
      "2024-09-09",
      "2024-09-10",
      "2024-09-11",
      "2024-09-12",
      "2024-09-13",
      "2024-09-16",
      "2024-09-17",
      "2024-09-18",
      "2024-09-19",
      "2024-09-20",
      "2024-09-23",
      "2024-09-24",
      "2024-09-25",
      "2024-09-26",
    ]);
    expect(days).not.toContain("2024-09-27");
  });

  it("counts a slot that runs past midnight on the day it starts", () => {
    const repo = createMockSlotRepository([makeSlot({ clinicianId: "c", date: new Date("2024-09-26T22:30:00.000Z") })], ABC);
    expect(repo.findSlotDaysByClinician("c")).toEqual(["2024-09-26"]);
  });

  it("dedupes and sorts days from unordered rows", () => {
    const repo = createMockSlotRepository(
      [
        makeSlot({ clinicianId: "c", date: new Date("2024-09-03T21:00:00.000Z") }),
        makeSlot({ clinicianId: "c", date: new Date("2024-08-19T12:15:00.000Z") }),
        makeSlot({ clinicianId: "c", date: new Date("2024-08-19T12:00:00.000Z") }),
      ],
      ABC,
    );
    expect(repo.findSlotDaysByClinician("c")).toEqual(["2024-08-19", "2024-09-03"]);
  });

  it("returns only the requested clinician's days", () => {
    const repo = createMockSlotRepository(
      [
        makeSlot({ clinicianId: "a", date: new Date("2024-08-19T12:00:00.000Z") }),
        makeSlot({ clinicianId: "b", date: new Date("2024-08-21T12:00:00.000Z") }),
      ],
      ABC,
    );
    expect(repo.findSlotDaysByClinician("a")).toEqual(["2024-08-19"]);
    expect(repo.findSlotDaysByClinician("b")).toEqual(["2024-08-21"]);
    expect(repo.findSlotDaysByClinician("c")).toEqual([]);
  });

  it("returns nothing from an empty table", () => {
    expect(createMockSlotRepository([], ABC).findByClinician("c")).toEqual([]);
    expect(createMockSlotRepository([], ABC).findSlotDaysByClinician("c")).toEqual([]);
  });

  it("ignores rows pushed to the caller's array after construction", () => {
    const seed = [makeSlot({ clinicianId: "c", date: new Date("2024-08-19T12:00:00.000Z") })];
    const repo = createMockSlotRepository(seed, ABC);
    seed.push(makeSlot({ clinicianId: "c", date: new Date("2024-08-21T12:00:00.000Z") }));
    expect(repo.findSlotDaysByClinician("c")).toEqual(["2024-08-19"]);
  });

  it("returns a fresh array on each call", () => {
    const repo = createMockSlotRepository(rowsFrom(MOCK_SLOT_DATA_SMALL, "c"), ABC);
    const first = repo.findSlotDaysByClinician("c");
    first.push(first[0]);
    expect(repo.findSlotDaysByClinician("c")).toEqual(["2024-08-19", "2024-08-21", "2024-08-22", "2024-08-28"]);
  });

  it("rejects a clinician row in place of a clinician id at compile time", () => {
    const typeChecksOnly = () => {
      // @ts-expect-error a clinician row is not a clinician id
      slotRepository.findSlotDaysByClinician(seedClinician);
    };
    expect(typeof typeChecksOnly).toBe("function");
  });
});
