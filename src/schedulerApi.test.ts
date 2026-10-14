import { createMockClinicianRepository } from "./mockClinicianOrm";
import { createMockSlotRepository, seedSlotSet, SlotRepository } from "./mockSlotOrm";
import { ClinicianAssessmentOptions, findAvailableSlots, SchedulerRepositories } from "./schedulerApi";
import { AvailableAppointmentSlot } from "./starter-code/appointment";
import { Clinician } from "./starter-code/clinician";
import { clinician } from "./starter-code/mock-clinician";
import { patient } from "./starter-code/mock-patient";
import { MOCK_SLOT_DATA, MOCK_SLOT_DATA_SMALL } from "./starter-code/mock-slot-data";

function makeClinician(overrides: Partial<Clinician> & Pick<Clinician, "id">): Clinician {
  return {
    firstName: "Test",
    lastName: overrides.id,
    states: ["NY"],
    insurances: ["AETNA"],
    clinicianType: "PSYCHOLOGIST",
    appointments: [],
    availableSlots: [],
    maxDailyAppointments: 2,
    maxWeeklyAppointments: 8,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    ...overrides,
  };
}

function makeSlot({ clinicianId, date }: Pick<AvailableAppointmentSlot, "clinicianId" | "date">): AvailableAppointmentSlot {
  return {
    id: `${clinicianId}-${date.toISOString()}`,
    clinicianId,
    date,
    length: 90,
    createdAt: new Date(0),
    updatedAt: new Date(0),
  };
}

function rowsFrom(raw: readonly { length: number; date: string }[], clinicianId: string): AvailableAppointmentSlot[] {
  return raw.map((r) => ({ ...makeSlot({ clinicianId, date: new Date(r.date) }), length: r.length }));
}

const slotsAt = (clinicianId: string, isos: readonly string[]) =>
  isos.map((iso) => makeSlot({ clinicianId, date: new Date(iso) }));

const repositories = (
  clinicians: readonly Clinician[],
  slots: readonly AvailableAppointmentSlot[],
): SchedulerRepositories => ({
  clinicians: createMockClinicianRepository(clinicians),
  slots: createMockSlotRepository(slots),
});

const pairsOf = (group: ClinicianAssessmentOptions) =>
  group.options.map((o) => [o.first.date.toISOString(), o.second.date.toISOString()]);

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

const pairsForSlots = (isos: readonly string[]) =>
  findAvailableSlots(patient, repositories([makeClinician({ id: "psych" })], slotsAt("psych", isos))).map(pairsOf);

describe("findAvailableSlots", () => {
  it("returns the README example's 11 options grouped under Jane Doe", () => {
    const groups = findAvailableSlots(patient, repositories([clinician], rowsFrom(MOCK_SLOT_DATA_SMALL, clinician.id)));
    expect(groups).toHaveLength(1);
    expect(groups[0].clinician).toEqual({ id: "9c516382-c5b2-4677-a7ac-4e100fa35bdd", firstName: "Jane", lastName: "Doe" });
    expect(pairsOf(groups[0])).toEqual(README_PAIRS);
  });

  it("uses the seeded repositories by default", () => {
    expect(seedSlotSet).toBe("small");
    const groups = findAvailableSlots(patient);
    expect(groups).toHaveLength(1);
    expect(groups[0].options).toHaveLength(11);
    expect(pairsOf(groups[0])[0]).toEqual(["2024-08-19T12:00:00.000Z", "2024-08-21T12:00:00.000Z"]);
  });

  it("returns nothing for a patient in a state no clinician serves", () => {
    const repos = repositories([clinician], rowsFrom(MOCK_SLOT_DATA_SMALL, clinician.id));
    expect(findAvailableSlots({ ...patient, state: "TX" }, repos)).toEqual([]);
    expect(findAvailableSlots(patient, repos).map((g) => g.clinician.lastName)).toEqual(["Doe"]);
  });

  it("returns nothing for a patient with insurance no clinician accepts", () => {
    const repos = repositories([clinician], rowsFrom(MOCK_SLOT_DATA_SMALL, clinician.id));
    expect(findAvailableSlots({ ...patient, insurance: "BCBS" }, repos)).toEqual([]);
    expect(findAvailableSlots(patient, repos).map((g) => g.clinician.lastName)).toEqual(["Doe"]);
  });

  it("excludes therapists and includes psychologists with the same slots", () => {
    const isos = ["2024-08-19T12:00:00.000Z", "2024-08-21T12:00:00.000Z"];
    const therapist = makeClinician({ id: "therapist", clinicianType: "THERAPIST" });
    expect(findAvailableSlots(patient, repositories([therapist], slotsAt("therapist", isos)))).toEqual([]);

    const groups = findAvailableSlots(patient, repositories([makeClinician({ id: "psych" })], slotsAt("psych", isos)));
    expect(groups.map((g) => g.clinician.id)).toEqual(["psych"]);
    expect(pairsOf(groups[0])).toEqual([["2024-08-19T12:00:00.000Z", "2024-08-21T12:00:00.000Z"]]);
  });

  it("keeps each psychologist's options in their own group in repository order", () => {
    const slots = [
      ...slotsAt("b", ["2024-08-20T09:00:00.000Z", "2024-08-23T09:00:00.000Z"]),
      ...slotsAt("a", ["2024-08-19T12:00:00.000Z", "2024-08-21T12:00:00.000Z"]),
    ];
    const groups = findAvailableSlots(patient, repositories([makeClinician({ id: "a" }), makeClinician({ id: "b" })], slots));
    expect(groups.map((g) => g.clinician.id)).toEqual(["a", "b"]);
    expect(groups.map(pairsOf)).toEqual([
      [["2024-08-19T12:00:00.000Z", "2024-08-21T12:00:00.000Z"]],
      [["2024-08-20T09:00:00.000Z", "2024-08-23T09:00:00.000Z"]],
    ]);
    expect(groups.map((g) => g.options.map((o) => [o.first.clinicianId, o.second.clinicianId]))).toEqual([
      [["a", "a"]],
      [["b", "b"]],
    ]);
  });

  it("pairs slots exactly 7 calendar days apart", () => {
    expect(pairsForSlots(["2024-08-21T12:00:00.000Z", "2024-08-28T12:00:00.000Z"])).toEqual([
      [["2024-08-21T12:00:00.000Z", "2024-08-28T12:00:00.000Z"]],
    ]);
  });

  it("does not pair slots 9 days apart", () => {
    expect(pairsForSlots(["2024-08-19T12:00:00.000Z", "2024-08-28T12:00:00.000Z"])).toEqual([]);
  });

  it("never pairs two slots on the same day", () => {
    expect(pairsForSlots(["2024-08-21T09:00:00.000Z", "2024-08-21T15:00:00.000Z"])).toEqual([]);
  });

  it("measures the gap in calendar days, not hours", () => {
    expect(pairsForSlots(["2024-08-21T22:30:00.000Z", "2024-08-28T12:00:00.000Z"])).toEqual([
      [["2024-08-21T22:30:00.000Z", "2024-08-28T12:00:00.000Z"]],
    ]);
  });

  it("omits a psychologist whose slots are all on one day", () => {
    const slots = [
      ...slotsAt("solo", ["2024-08-21T09:00:00.000Z", "2024-08-21T15:00:00.000Z"]),
      ...slotsAt("paired", ["2024-08-21T09:00:00.000Z", "2024-08-22T09:00:00.000Z"]),
    ];
    const groups = findAvailableSlots(patient, repositories([makeClinician({ id: "solo" }), makeClinician({ id: "paired" })], slots));
    expect(groups.map((g) => g.clinician.id)).toEqual(["paired"]);
  });

  it("returns the same options whatever order the slots arrive in", () => {
    const reversed = [...rowsFrom(MOCK_SLOT_DATA_SMALL, clinician.id)].reverse();
    expect(findAvailableSlots(patient, repositories([clinician], reversed)).map(pairsOf)).toEqual([README_PAIRS]);
  });

  it("queries slots once per eligible psychologist and never by day", () => {
    const clinicians = [
      makeClinician({ id: "therapist", clinicianType: "THERAPIST" }),
      makeClinician({ id: "psychA" }),
      makeClinician({ id: "psychB" }),
    ];
    const isos = ["2024-08-19T12:00:00.000Z", "2024-08-21T12:00:00.000Z"];
    const inner = createMockSlotRepository([
      ...slotsAt("therapist", isos),
      ...slotsAt("psychA", isos),
      ...slotsAt("psychB", isos),
    ]);
    const calls: Record<string, number> = {};
    let dayQueries = 0;
    const counting: SlotRepository = {
      findByClinician: (id, days) => {
        calls[id] = (calls[id] ?? 0) + 1;
        return inner.findByClinician(id, days);
      },
      findSlotDaysByClinician: (id) => {
        dayQueries++;
        return inner.findSlotDaysByClinician(id);
      },
    };
    const groups = findAvailableSlots(patient, { clinicians: createMockClinicianRepository(clinicians), slots: counting });
    expect(groups.map((g) => g.clinician.id)).toEqual(["psychA", "psychB"]);
    expect(calls).toEqual({ psychA: 1, psychB: 1 });
    expect(dayQueries).toBe(0);
  });

  it("hides the README ladder's inner starts before pairing", () => {
    const ladder = ["12:00", "12:15", "12:30", "12:45", "13:00", "13:15", "13:30"].map(
      (t) => `2024-08-19T${t}:00.000Z`,
    );
    expect(pairsForSlots([...ladder, "2024-08-21T12:00:00.000Z"])).toEqual([
      [
        ["2024-08-19T12:00:00.000Z", "2024-08-21T12:00:00.000Z"],
        ["2024-08-19T13:30:00.000Z", "2024-08-21T12:00:00.000Z"],
      ],
    ]);
  });

  it("offers 9999 options from the full dump", () => {
    const groups = findAvailableSlots(patient, repositories([clinician], rowsFrom(MOCK_SLOT_DATA, clinician.id)));
    expect(groups).toHaveLength(1);
    expect(groups[0].options).toHaveLength(9999);
    const offered = new Set(
      groups[0].options.flatMap((o) => [o.first.date.toISOString(), o.second.date.toISOString()]),
    );
    expect(offered.has("2024-09-03T21:00:00.000Z")).toBe(true);
    expect(offered.has("2024-09-03T22:30:00.000Z")).toBe(true);
    expect(offered.has("2024-09-03T21:15:00.000Z")).toBe(false);
    expect(offered.has("2024-09-03T22:15:00.000Z")).toBe(false);
  });
});
