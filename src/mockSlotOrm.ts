import { LocalDay, localDayOf, parseTimeZone } from "./localDay";
import { AvailableAppointmentSlot } from "./starter-code/appointment";
import { Clinician } from "./starter-code/clinician";
import { MOCK_SLOT_DATA, MOCK_SLOT_DATA_SMALL } from "./starter-code/mock-slot-data";

export type ClinicianZone = Pick<Clinician, "id" | "timezone">;

export interface SlotRepository {
  /**
   * SELECT s.* FROM "AvailableSlot" s
   * [JOIN "Clinician" c ON c.id = s."clinicianId"]
   * WHERE s."clinicianId" = $clinicianId
   *   [AND ((s.date AT TIME ZONE 'UTC') AT TIME ZONE c.timezone)::date = ANY($days)]
   *
   * Rows in table order. Returns [] for an unknown clinician. The optional clause keeps rows that start on one of
   * `days` of the clinician's own calendar; an empty list matches nothing. Returned rows are the table's own
   * objects, not copies. The double AT TIME ZONE is deliberate: Prisma `DateTime` is a Postgres `timestamp(3)`
   * without time zone holding UTC.
   */
  findByClinician(clinicianId: AvailableAppointmentSlot["clinicianId"], days?: readonly LocalDay[]): AvailableAppointmentSlot[];
  /**
   * SELECT DISTINCT ((s.date AT TIME ZONE 'UTC') AT TIME ZONE c.timezone)::date AS day
   * FROM "AvailableSlot" s JOIN "Clinician" c ON c.id = s."clinicianId"
   * WHERE s."clinicianId" = $clinicianId ORDER BY day
   *
   * A slot counts on the local day it starts. Returns [] for an unknown clinician, a fresh array each call.
   */
  findSlotDaysByClinician(clinicianId: AvailableAppointmentSlot["clinicianId"]): LocalDay[];
}

export function createMockSlotRepository(
  rows: readonly AvailableAppointmentSlot[],
  clinicians: readonly ClinicianZone[],
): SlotRepository {
  const table: readonly AvailableAppointmentSlot[] = [...rows];
  const zones = new Map(clinicians.map((c) => [c.id, c.timezone]));
  const rowsOf = (clinicianId: string) => table.filter((s) => s.clinicianId === clinicianId);
  return {
    findByClinician: (clinicianId, days) => {
      if (!days) return rowsOf(clinicianId);
      const zone = zones.get(clinicianId);
      if (zone === undefined) return [];
      const wanted = new Set(days);
      return rowsOf(clinicianId).filter((s) => wanted.has(localDayOf(s.date, zone)));
    },
    findSlotDaysByClinician: (clinicianId) => {
      const zone = zones.get(clinicianId);
      if (zone === undefined) return [];
      return [...new Set(rowsOf(clinicianId).map((s) => localDayOf(s.date, zone)))].sort();
    },
  };
}

export const SEED_CLINICIAN_ID = "9c516382-c5b2-4677-a7ac-4e100fa35bdd";
export const SEED_CLINICIAN_TIMEZONE = parseTimeZone("America/New_York");

export const MOCK_SLOT_DATA_MIDNIGHT: readonly { length: number; date: string }[] = [
  { length: 90, date: "2024-08-20T03:00:00.000Z" },
  { length: 90, date: "2024-08-20T03:15:00.000Z" },
  { length: 90, date: "2024-08-20T13:00:00.000Z" },
  { length: 90, date: "2024-08-21T02:30:00.000Z" },
  { length: 90, date: "2024-08-27T12:00:00.000Z" },
  { length: 90, date: "2024-08-28T03:30:00.000Z" },
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
  if (value in sets) return value as K;
  throw new Error(`${variable} must be one of ${Object.keys(sets).join(", ")}, got "${value}"`);
}

/**
 * Which raw slot set seeds the table: SEED_SLOTS=small (default, the README example), full (the 458-row dump),
 * or midnight (six starts around New York midnight).
 */
export function seedSlotSetFromEnv(value = process.env.SEED_SLOTS): SeedSlotSet {
  return seedSetFromEnv("SEED_SLOTS", SeedSlotSets, "small", value);
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
  [{ id: SEED_CLINICIAN_ID, timezone: SEED_CLINICIAN_TIMEZONE }],
);
