import { parseTimeZone } from "./localDay";
import { EMPTY_SET, SeedTables, tablesOf } from "./roster";
import { AvailableAppointmentSlot } from "./starter-code/appointment";
import { ROSTER } from "./starter-code/mock-roster";
import { MOCK_SLOT_DATA, MOCK_SLOT_DATA_SMALL } from "./starter-code/mock-slot-data";

export interface SlotRepository {
  /**
   * SELECT * FROM "AvailableSlot" WHERE "clinicianId" = $clinicianId
   *
   * Rows in table order. Returns [] for an unknown clinician. Returned rows are the table's own objects, not copies.
   */
  findByClinician(clinicianId: AvailableAppointmentSlot["clinicianId"]): AvailableAppointmentSlot[];
  /**
   * SELECT * FROM "AvailableSlot" WHERE "clinicianId" = ANY($clinicianIds) AND "date" > $after
   *
   * One query for any number of clinicians. Rows in table order. Returns [] for no ids. Returned rows are the
   * table's own objects, not copies.
   */
  findByCliniciansStartingAfter(
    clinicianIds: readonly AvailableAppointmentSlot["clinicianId"][],
    after: Date,
  ): AvailableAppointmentSlot[];
}

export function createMockSlotRepository(rows: readonly AvailableAppointmentSlot[]): SlotRepository {
  const table: readonly AvailableAppointmentSlot[] = [...rows];
  return {
    findByClinician: (clinicianId) => table.filter((s) => s.clinicianId === clinicianId),
    findByCliniciansStartingAfter: (clinicianIds, after) => {
      const ids = new Set(clinicianIds);
      return table.filter((s) => ids.has(s.clinicianId) && s.date.getTime() > after.getTime());
    },
  };
}

/** When the seeded tables were captured: the createdAt of the README's slot dump, before every seeded slot. */
export const SEED_NOW = new Date("2024-08-15T14:45:15.462Z");

export const SEED_CLINICIAN_ID = "9c516382-c5b2-4677-a7ac-4e100fa35bdd";
export const SEED_CLINICIAN_TIMEZONE = parseTimeZone("America/New_York");

export const MOCK_SLOT_DATA_MIDNIGHT: readonly { length: number; date: string }[] = [
  { length: 90, date: "2024-08-20T03:00:00.000Z" },
  { length: 90, date: "2024-08-20T03:15:00.000Z" },
  { length: 90, date: "2024-08-20T13:00:00.000Z" },
  { length: 90, date: "2024-08-21T02:30:00.000Z" },
  { length: 90, date: "2024-08-27T12:00:00.000Z" },
  { length: 90, date: "2024-08-28T03:30:00.000Z" },
  { length: 90, date: "2024-08-28T04:15:00.000Z" },
];

export const SeedSlotSets = { small: MOCK_SLOT_DATA_SMALL, full: MOCK_SLOT_DATA, midnight: MOCK_SLOT_DATA_MIDNIGHT } as const;
export type SeedSlotSet = keyof typeof SeedSlotSets;

/**
 * Which named seed set the environment variable `variable` selects: `fallback` when `value` is unset or empty,
 * otherwise a key of `sets`. Throws naming the variable, its keys, and the rejected value.
 */
export function seedSetFromEnv<K extends string>(
  variable: string,
  sets: Readonly<Record<K, unknown>>,
  fallback: K,
  value: string | undefined,
): K {
  if (value === undefined || value === "") return fallback;
  if (Object.prototype.hasOwnProperty.call(sets, value)) return value as K;
  throw new Error(`${variable} must be one of ${Object.keys(sets).join(", ")}, got "${value}"`);
}

/**
 * Which raw slot set seeds the table: SEED_SLOTS=small (default, the README example), full (the 458-row dump),
 * or midnight (seven starts around New York midnight).
 */
export function seedSlotSetFromEnv(value = process.env.SEED_SLOTS): SeedSlotSet {
  return seedSetFromEnv("SEED_SLOTS", SeedSlotSets, "small", value);
}

export const seedSlotSet: SeedSlotSet = seedSlotSetFromEnv();

export const SeedClinicianSets = { doe: EMPTY_SET, roster: ROSTER } as const;
export type SeedClinicianSet = keyof typeof SeedClinicianSets;

/**
 * Who sits beside Dr. Doe: SEED_CLINICIANS=doe (default, nobody) or roster (src/starter-code/mock-roster.ts, its
 * clinicians with their slots and appointments, and its patients). Dr. Doe's rows still follow SEED_SLOTS and
 * SEED_APPOINTMENTS.
 */
export function seedClinicianSetFromEnv(value = process.env.SEED_CLINICIANS): SeedClinicianSet {
  return seedSetFromEnv("SEED_CLINICIANS", SeedClinicianSets, "doe", value);
}

export const seedClinicianSet: SeedClinicianSet = seedClinicianSetFromEnv();

export const seededRoster: SeedTables = tablesOf(SeedClinicianSets[seedClinicianSet], {
  slot: (index) => `roster-slot-${index}`,
  appointment: (index) => `roster-appointment-${index}`,
});

export const slotRepository: SlotRepository = createMockSlotRepository([
  ...SeedSlotSets[seedSlotSet].map((slot, index) => ({
    id: `mock-slot-${index}`,
    clinicianId: SEED_CLINICIAN_ID,
    date: new Date(slot.date),
    length: slot.length,
    createdAt: new Date(),
    updatedAt: new Date(),
  })),
  ...seededRoster.slots,
]);
