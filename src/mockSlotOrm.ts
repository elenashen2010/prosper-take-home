import { AvailableAppointmentSlot } from "./starter-code/appointment";
import { MOCK_SLOT_DATA, MOCK_SLOT_DATA_SMALL } from "./starter-code/mock-slot-data";
import { UtcDay, utcDayOf } from "./utcDay";

export interface SlotRepository {
  /**
   * AvailableSlot rows for `clinicianId`, in table order. Returns [] for an unknown clinician.
   * With `days`, only rows that start on one of those UTC days; an empty list matches nothing.
   * Returned rows are the table's own objects, not copies.
   */
  findByClinician(
    clinicianId: AvailableAppointmentSlot["clinicianId"],
    days?: readonly UtcDay[],
  ): AvailableAppointmentSlot[];
  /**
   * Distinct UTC days on which `clinicianId` has at least one AvailableSlot row, ascending.
   * A slot counts on the day it starts (see utcDayOf). Returns [] for an unknown clinician, a fresh array each call.
   */
  findSlotDaysByClinician(clinicianId: AvailableAppointmentSlot["clinicianId"]): UtcDay[];
}

export function createMockSlotRepository(rows: readonly AvailableAppointmentSlot[]): SlotRepository {
  const table: readonly AvailableAppointmentSlot[] = [...rows];
  const findByClinician = (clinicianId: string, days?: readonly UtcDay[]) => {
    const wanted = days && new Set(days);
    return table.filter((s) => s.clinicianId === clinicianId && (!wanted || wanted.has(utcDayOf(s.date))));
  };
  return {
    findByClinician,
    findSlotDaysByClinician: (clinicianId) =>
      [...new Set(findByClinician(clinicianId).map((s) => utcDayOf(s.date)))].sort(),
  };
}

export const SEED_CLINICIAN_ID = "9c516382-c5b2-4677-a7ac-4e100fa35bdd";

export const SeedSlotSets = { small: MOCK_SLOT_DATA_SMALL, full: MOCK_SLOT_DATA } as const;
export type SeedSlotSet = keyof typeof SeedSlotSets;

/** Which raw slot set seeds the table: SEED_SLOTS=small (default, the README example) or full (the 458-row dump). */
export function seedSlotSetFromEnv(value = process.env.SEED_SLOTS): SeedSlotSet {
  if (value === undefined || value === "") return "small";
  if (value in SeedSlotSets) return value as SeedSlotSet;
  throw new Error(`SEED_SLOTS must be one of ${Object.keys(SeedSlotSets).join(", ")}, got "${value}"`);
}

export const seedSlotSet: SeedSlotSet = seedSlotSetFromEnv();

export const slotRepository: SlotRepository = createMockSlotRepository(
  SeedSlotSets[seedSlotSet].map((slot, index) => ({
    id: `mock-slot-${index}`,
    clinicianId: SEED_CLINICIAN_ID,
    date: new Date(slot.date),
    length: slot.length,
    createdAt: new Date(),
    updatedAt: new Date(),
  })),
);
