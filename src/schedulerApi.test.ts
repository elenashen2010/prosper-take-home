import { parseTimeZone } from "./localDay";
import { AppointmentRepository, createMockAppointmentRepository, seedAppointmentSet } from "./mockAppointmentOrm";
import { createMockClinicianRepository } from "./mockClinicianOrm";
import { createMockSlotRepository, seedSlotSet, SlotRepository } from "./mockSlotOrm";
import { ClinicianAssessmentOptions, findAvailableSlots, SchedulerRepositories } from "./schedulerApi";
import { Appointment, AvailableAppointmentSlot } from "./starter-code/appointment";
import { Clinician } from "./starter-code/clinician";
import { clinician } from "./starter-code/mock-clinician";
import { patient } from "./starter-code/mock-patient";
import { MOCK_SLOT_DATA, MOCK_SLOT_DATA_SMALL } from "./starter-code/mock-slot-data";
import { withSeedEnv } from "./withSeedEnv";

function makeClinician(overrides: Partial<Clinician> & Pick<Clinician, "id">): Clinician {
  return {
    firstName: "Test",
    lastName: overrides.id,
    states: ["NY"],
    insurances: ["AETNA"],
    clinicianType: "PSYCHOLOGIST",
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

function makeAppointment({
  clinicianId,
  scheduledFor,
  appointmentType = "ASSESSMENT_SESSION_1",
  status = "UPCOMING",
}: Pick<Appointment, "clinicianId" | "scheduledFor"> & Partial<Pick<Appointment, "appointmentType" | "status">>): Appointment {
  return {
    id: `${clinicianId}-${scheduledFor.toISOString()}-${status}`,
    patientId: "patient",
    clinicianId,
    scheduledFor,
    appointmentType,
    status,
    createdAt: new Date(0),
    updatedAt: new Date(0),
  };
}

const slotsAt = (clinicianId: string, isos: readonly string[]) =>
  isos.map((iso) => makeSlot({ clinicianId, date: new Date(iso) }));

const appointmentsAt = (
  clinicianId: string,
  isos: readonly string[],
  overrides: Partial<Pick<Appointment, "appointmentType" | "status">> = {},
) => isos.map((iso) => makeAppointment({ clinicianId, scheduledFor: new Date(iso), ...overrides }));

const repositories = (
  clinicians: readonly Clinician[],
  slots: readonly AvailableAppointmentSlot[],
  appointments: readonly Appointment[] = [],
): SchedulerRepositories => ({
  clinicians: createMockClinicianRepository(clinicians),
  slots: createMockSlotRepository(slots, clinicians),
  appointments: createMockAppointmentRepository(appointments),
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

const pairsWith = (isos: readonly string[], appointments: readonly Appointment[], overrides: Partial<Clinician> = {}) =>
  findAvailableSlots(
    patient,
    repositories([makeClinician({ id: "psych", ...overrides })], slotsAt("psych", isos), appointments),
  ).map(pairsOf);

const pairsForSlots = (isos: readonly string[]) => pairsWith(isos, []);

function seededPairsWith(env: Readonly<Record<string, string>>): string[][][] {
  return withSeedEnv(env, () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- a fresh module instance is the point
    const fresh = require("./schedulerApi") as typeof import("./schedulerApi");
    return fresh.findAvailableSlots(patient).map(pairsOf);
  });
}

describe("findAvailableSlots", () => {
  it("returns the README example's 11 options grouped under Jane Doe", () => {
    const groups = findAvailableSlots(patient, repositories([clinician], rowsFrom(MOCK_SLOT_DATA_SMALL, clinician.id)));
    expect(groups).toHaveLength(1);
    expect(groups[0].clinician).toEqual({
      id: "9c516382-c5b2-4677-a7ac-4e100fa35bdd",
      firstName: "Jane",
      lastName: "Doe",
      timezone: "America/New_York",
    });
    expect(pairsOf(groups[0])).toEqual(README_PAIRS);
  });

  it("uses the seeded repositories by default", () => {
    expect(seedSlotSet).toBe("small");
    expect(seedAppointmentSet).toBe("none");
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
    const inner = createMockSlotRepository(
      [...slotsAt("therapist", isos), ...slotsAt("psychA", isos), ...slotsAt("psychB", isos)],
      clinicians,
    );
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
    const appointmentCalls: Record<string, number> = {};
    const countingAppointments: AppointmentRepository = {
      findByClinician: (id) => {
        appointmentCalls[id] = (appointmentCalls[id] ?? 0) + 1;
        return [];
      },
    };
    const groups = findAvailableSlots(patient, {
      clinicians: createMockClinicianRepository(clinicians),
      slots: counting,
      appointments: countingAppointments,
    });
    expect(groups.map((g) => g.clinician.id)).toEqual(["psychA", "psychB"]);
    expect(calls).toEqual({ psychA: 1, psychB: 1 });
    expect(dayQueries).toBe(0);
    expect(appointmentCalls).toEqual({ psychA: 1, psychB: 1 });
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

  it("pairs two slots that share a UTC day but not a New York day", () => {
    expect(pairsForSlots(["2024-08-20T03:00:00.000Z", "2024-08-20T13:00:00.000Z"])).toEqual([
      [["2024-08-20T03:00:00.000Z", "2024-08-20T13:00:00.000Z"]],
    ]);
  });

  it("does not pair slots 8 New York days apart that are 7 UTC days apart", () => {
    expect(pairsForSlots(["2024-08-21T03:30:00.000Z", "2024-08-28T12:00:00.000Z"])).toEqual([]);
  });

  it("pairs slots 7 New York days apart that are 8 UTC days apart", () => {
    expect(pairsForSlots(["2024-08-21T12:00:00.000Z", "2024-08-29T02:00:00.000Z"])).toEqual([
      [["2024-08-21T12:00:00.000Z", "2024-08-29T02:00:00.000Z"]],
    ]);
  });

  it("never pairs two slots on the 25-hour fall-back day", () => {
    expect(pairsForSlots(["2024-11-03T04:30:00.000Z", "2024-11-04T04:30:00.000Z"])).toEqual([]);
  });

  it("hides a ladder's inner starts across UTC midnight inside one New York evening", () => {
    const ladder = [
      "2024-08-20T23:00:00.000Z",
      "2024-08-20T23:15:00.000Z",
      "2024-08-20T23:30:00.000Z",
      "2024-08-20T23:45:00.000Z",
      "2024-08-21T00:00:00.000Z",
      "2024-08-21T00:15:00.000Z",
      "2024-08-21T00:30:00.000Z",
    ];
    expect(pairsForSlots([...ladder, "2024-08-22T12:00:00.000Z"])).toEqual([
      [
        ["2024-08-20T23:00:00.000Z", "2024-08-22T12:00:00.000Z"],
        ["2024-08-21T00:30:00.000Z", "2024-08-22T12:00:00.000Z"],
      ],
    ]);
  });

  it("judges each psychologist's days on their own calendar", () => {
    const isos = ["2024-08-20T08:00:00.000Z", "2024-08-20T20:00:00.000Z"];
    const clinicians = [
      makeClinician({ id: "newYork" }),
      makeClinician({ id: "honolulu", timezone: parseTimeZone("Pacific/Honolulu") }),
    ];
    const groups = findAvailableSlots(patient, repositories(clinicians, [...slotsAt("newYork", isos), ...slotsAt("honolulu", isos)]));
    expect(groups.map((g) => [g.clinician.id, g.clinician.timezone])).toEqual([["honolulu", "Pacific/Honolulu"]]);
    expect(pairsOf(groups[0])).toEqual([["2024-08-20T08:00:00.000Z", "2024-08-20T20:00:00.000Z"]]);
  });

  it("offers the midnight seed's 8 options through the seeded repositories", () => {
    expect(seededPairsWith({ SEED_SLOTS: "midnight" })).toEqual([
      [
        ["2024-08-20T03:00:00.000Z", "2024-08-20T13:00:00.000Z"],
        ["2024-08-20T03:00:00.000Z", "2024-08-21T02:30:00.000Z"],
        ["2024-08-20T03:15:00.000Z", "2024-08-20T13:00:00.000Z"],
        ["2024-08-20T03:15:00.000Z", "2024-08-21T02:30:00.000Z"],
        ["2024-08-20T13:00:00.000Z", "2024-08-27T12:00:00.000Z"],
        ["2024-08-20T13:00:00.000Z", "2024-08-28T03:30:00.000Z"],
        ["2024-08-21T02:30:00.000Z", "2024-08-27T12:00:00.000Z"],
        ["2024-08-21T02:30:00.000Z", "2024-08-28T03:30:00.000Z"],
      ],
    ]);
  });

  it("offers 37110 options from the full dump with no appointments", () => {
    const groups = findAvailableSlots(patient, repositories([clinician], rowsFrom(MOCK_SLOT_DATA, clinician.id)));
    expect(groups).toHaveLength(1);
    expect(groups[0].options).toHaveLength(37110);
    const offered = new Set(
      groups[0].options.flatMap((o) => [o.first.date.toISOString(), o.second.date.toISOString()]),
    );
    expect(offered.size).toBe(457);
    expect(offered.has("2024-09-03T21:00:00.000Z")).toBe(true);
    expect(offered.has("2024-09-03T22:30:00.000Z")).toBe(true);
    expect(offered.has("2024-09-03T21:15:00.000Z")).toBe(true);
    expect(offered.has("2024-09-03T22:15:00.000Z")).toBe(true);
    expect(offered.has("2024-08-22T13:15:00.000Z")).toBe(false);
  });

  it("hides every slot on a day already at maxDailyAppointments", () => {
    const slots = ["2024-08-19T12:00:00.000Z", "2024-08-21T12:00:00.000Z", "2024-08-22T12:00:00.000Z"];
    const held = appointmentsAt("psych", ["2024-08-21T16:00:00.000Z", "2024-08-21T18:00:00.000Z"]);
    expect(pairsWith(slots, held)).toEqual([[["2024-08-19T12:00:00.000Z", "2024-08-22T12:00:00.000Z"]]]);
  });

  it("hides every slot in a week already at maxWeeklyAppointments", () => {
    const slots = [
      "2024-08-19T12:00:00.000Z",
      "2024-08-21T12:00:00.000Z",
      "2024-08-26T12:00:00.000Z",
      "2024-08-27T12:00:00.000Z",
    ];
    const held = appointmentsAt("psych", ["2024-08-20T16:00:00.000Z", "2024-08-22T16:00:00.000Z", "2024-08-23T16:00:00.000Z"]);
    expect(pairsWith(slots, held, { maxWeeklyAppointments: 3 })).toEqual([
      [["2024-08-26T12:00:00.000Z", "2024-08-27T12:00:00.000Z"]],
    ]);
  });

  it("hides a same-week pair that would overrun the weekly cap but keeps its sessions in cross-week pairs", () => {
    const slots = ["2024-08-19T12:00:00.000Z", "2024-08-21T12:00:00.000Z", "2024-08-26T12:00:00.000Z"];
    const held = appointmentsAt("psych", ["2024-08-20T16:00:00.000Z", "2024-08-23T16:00:00.000Z"]);
    expect(pairsWith(slots, held, { maxWeeklyAppointments: 3 })).toEqual([
      [
        ["2024-08-19T12:00:00.000Z", "2024-08-26T12:00:00.000Z"],
        ["2024-08-21T12:00:00.000Z", "2024-08-26T12:00:00.000Z"],
      ],
    ]);
  });

  it("counts a Sunday appointment in the week that started on Monday", () => {
    const slots = ["2024-08-23T12:00:00.000Z", "2024-08-26T12:00:00.000Z", "2024-08-27T12:00:00.000Z"];
    const held = appointmentsAt("psych", ["2024-08-25T14:00:00.000Z", "2024-08-25T17:00:00.000Z"]);
    expect(pairsWith(slots, held, { maxWeeklyAppointments: 2 })).toEqual([
      [["2024-08-26T12:00:00.000Z", "2024-08-27T12:00:00.000Z"]],
    ]);
  });

  it("counts an appointment on the clinician's day, not the UTC day", () => {
    const slots = ["2024-08-20T12:00:00.000Z", "2024-08-21T12:00:00.000Z", "2024-08-22T12:00:00.000Z"];
    const held = appointmentsAt("psych", ["2024-08-21T01:00:00.000Z", "2024-08-21T02:30:00.000Z"]);
    expect(pairsWith(slots, held)).toEqual([[["2024-08-21T12:00:00.000Z", "2024-08-22T12:00:00.000Z"]]]);
  });

  it("hides slots overlapping a held assessment and keeps slots that touch it", () => {
    const slots = [
      "2024-08-21T12:30:00.000Z",
      "2024-08-21T13:00:00.000Z",
      "2024-08-21T15:00:00.000Z",
      "2024-08-21T15:30:00.000Z",
      "2024-08-22T12:00:00.000Z",
    ];
    const held = appointmentsAt("psych", ["2024-08-21T14:00:00.000Z"]);
    expect(pairsWith(slots, held)).toEqual([
      [
        ["2024-08-21T12:30:00.000Z", "2024-08-22T12:00:00.000Z"],
        ["2024-08-21T15:30:00.000Z", "2024-08-22T12:00:00.000Z"],
      ],
    ]);
  });

  it("blocks a held therapy session for 60 minutes, not 90", () => {
    const slots = ["2024-08-21T13:00:00.000Z", "2024-08-21T15:00:00.000Z", "2024-08-22T12:00:00.000Z"];
    const held = appointmentsAt("psych", ["2024-08-21T14:00:00.000Z"], { appointmentType: "THERAPY_SIXTY_MINS" });
    expect(pairsWith(slots, held)).toEqual([[["2024-08-21T15:00:00.000Z", "2024-08-22T12:00:00.000Z"]]]);
  });

  it("only UPCOMING, OCCURRED and NO_SHOW appointments hold the clinician's time", () => {
    const slots = [
      "2024-08-19T12:00:00.000Z",
      "2024-08-20T12:00:00.000Z",
      "2024-08-21T12:00:00.000Z",
      "2024-08-22T12:00:00.000Z",
      "2024-08-23T12:00:00.000Z",
      "2024-08-26T12:00:00.000Z",
    ];
    const held = [
      ...appointmentsAt("psych", ["2024-08-19T12:00:00.000Z"], { status: "UPCOMING" }),
      ...appointmentsAt("psych", ["2024-08-20T12:00:00.000Z"], { status: "OCCURRED" }),
      ...appointmentsAt("psych", ["2024-08-21T12:00:00.000Z"], { status: "NO_SHOW" }),
      ...appointmentsAt("psych", ["2024-08-22T12:00:00.000Z"], { status: "RE_SCHEDULED" }),
      ...appointmentsAt("psych", ["2024-08-23T12:00:00.000Z"], { status: "CANCELLED" }),
      ...appointmentsAt("psych", ["2024-08-26T12:00:00.000Z"], { status: "LATE_CANCELLATION" }),
    ];
    expect(pairsWith(slots, held, { maxWeeklyAppointments: 20 })).toEqual([
      [
        ["2024-08-22T12:00:00.000Z", "2024-08-23T12:00:00.000Z"],
        ["2024-08-22T12:00:00.000Z", "2024-08-26T12:00:00.000Z"],
        ["2024-08-23T12:00:00.000Z", "2024-08-26T12:00:00.000Z"],
      ],
    ]);
  });

  const LADDER_08_21 = ["12:00", "12:15", "12:30", "12:45", "13:00", "13:15", "13:30"].map(
    (t) => `2024-08-21T${t}:00.000Z`,
  );

  it("offers the whole README ladder on a day with room for one more session", () => {
    const held = appointmentsAt("psych", ["2024-08-21T20:00:00.000Z"]);
    expect(pairsWith([...LADDER_08_21, "2024-08-22T12:00:00.000Z"], held)).toEqual([
      LADDER_08_21.map((start) => [start, "2024-08-22T12:00:00.000Z"]),
    ]);
  });

  it("offers every start of a ladder when the week has room for one more", () => {
    const held = appointmentsAt("psych", ["2024-08-20T16:00:00.000Z"]);
    expect(pairsWith([...LADDER_08_21, "2024-08-28T12:00:00.000Z"], held, { maxWeeklyAppointments: 2 })).toEqual([
      LADDER_08_21.map((start) => [start, "2024-08-28T12:00:00.000Z"]),
    ]);
  });

  it("offers nothing when the daily maximum is zero", () => {
    expect(pairsWith(["2024-08-19T12:00:00.000Z", "2024-08-21T12:00:00.000Z"], [], { maxDailyAppointments: 0 })).toEqual([]);
  });

  it("counts only each psychologist's own appointments", () => {
    const isos = ["2024-08-21T12:00:00.000Z", "2024-08-22T12:00:00.000Z"];
    const groups = findAvailableSlots(
      patient,
      repositories(
        [makeClinician({ id: "a" }), makeClinician({ id: "b" })],
        [...slotsAt("a", isos), ...slotsAt("b", isos)],
        appointmentsAt("b", ["2024-08-21T16:00:00.000Z", "2024-08-21T18:00:00.000Z"]),
      ),
    );
    expect(groups.map((g) => g.clinician.id)).toEqual(["a"]);
    expect(pairsOf(groups[0])).toEqual([["2024-08-21T12:00:00.000Z", "2024-08-22T12:00:00.000Z"]]);
  });

  it("offers the busy fixture's 2 options on the small seed", () => {
    expect(seededPairsWith({ SEED_APPOINTMENTS: "busy" })).toEqual([
      [
        ["2024-08-21T12:00:00.000Z", "2024-08-28T12:15:00.000Z"],
        ["2024-08-22T15:00:00.000Z", "2024-08-28T12:15:00.000Z"],
      ],
    ]);
  });

  it("offers the busy fixture's 36515 options on the full dump", () => {
    const groups = seededPairsWith({ SEED_SLOTS: "full", SEED_APPOINTMENTS: "busy" });
    expect(groups).toHaveLength(1);
    const pairs = groups[0];
    expect(pairs).toHaveLength(36515);
    expect(pairs[0]).toEqual(["2024-08-21T12:00:00.000Z", "2024-08-26T13:30:00.000Z"]);
    expect(pairs[pairs.length - 1]).toEqual(["2024-09-25T22:30:00.000Z", "2024-09-26T22:30:00.000Z"]);
    const offered = new Set(pairs.flat());
    expect([...offered].filter((iso) => iso.startsWith("2024-08-19"))).toEqual([]);
    expect(offered.has("2024-08-21T15:00:00.000Z")).toBe(false);
    expect(offered.has("2024-08-21T12:00:00.000Z")).toBe(true);
  });
});
