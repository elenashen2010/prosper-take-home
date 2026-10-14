import { APPOINTMENT_MINUTES } from "./capacity";
import { parseTimeZone, TimeZone } from "./localDay";
import type { SeedAppointment } from "./mockAppointmentOrm";
import { Appointment, AvailableAppointmentSlot } from "./starter-code/appointment";
import { Clinician, ClinicianType } from "./starter-code/clinician";
import { Patient } from "./starter-code/patient";
import { InsurancePayer, InsurancePayers } from "./starter-code/payer";
import { UsStateAbbreviation, UsStateAbbreviations } from "./starter-code/us-states";

/** A UTC instant written the way Date#toISOString prints it. Authoring type only; tablesOf re-checks at load. */
export type IsoInstant = `${number}-${number}-${number}T${number}:${number}:${number}.${number}Z`;

/**
 * One clinician as authored: the row plus everything it owns (Prisma's `availableSlots` and `appointments`
 * relations). Slot length is not authored; it follows from clinicianType. Non-empty states and insurances are
 * README rules ("must have at least one"), so they are tuple types, not runtime checks.
 */
export interface SeedClinician {
  readonly id: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly clinicianType: ClinicianType;
  readonly timezone: string;
  readonly states: readonly [UsStateAbbreviation, ...UsStateAbbreviation[]];
  readonly insurances: readonly [InsurancePayer, ...InsurancePayer[]];
  readonly maxDailyAppointments: number;
  readonly maxWeeklyAppointments: number;
  readonly slots: readonly IsoInstant[];
  readonly appointments: readonly SeedAppointment[];
}

/** What one SEED_CLINICIANS value contributes: clinicians (with their slots and appointments) and patients. */
export interface SeedSet {
  readonly clinicians: readonly SeedClinician[];
  readonly patients: readonly Patient[];
}

/** The four README tables as the mock database holds them. */
export interface SeedTables {
  readonly clinicians: readonly Clinician[];
  readonly slots: readonly AvailableAppointmentSlot[];
  readonly appointments: readonly Appointment[];
  readonly patients: readonly Patient[];
}

/** Row ids by position in their table, so each seed set keeps its own id space. */
export interface SeedRowIds {
  readonly slot: (index: number) => string;
  readonly appointment: (index: number) => string;
}

export const SLOT_MINUTES: Readonly<Record<ClinicianType, number>> = {
  PSYCHOLOGIST: APPOINTMENT_MINUTES.ASSESSMENT_SESSION_1,
  THERAPIST: APPOINTMENT_MINUTES.THERAPY_INTAKE,
};

export const EMPTY_SET: SeedSet = { clinicians: [], patients: [] };

/**
 * Flattens authored clinicians into the four tables, in input order. Invariants by construction: every slot and
 * appointment row's clinicianId is its owner's id; slot length is SLOT_MINUTES[owner.clinicianType]; each
 * Clinician's `availableSlots` and `appointments` are the very row objects of the slot and appointment tables;
 * `timezone` is parseTimeZone(raw); createdAt and updatedAt are new Date(0), so evidence is byte-stable.
 * Throws naming the clinician for an unknown zone, a slot or scheduledFor that is not canonical toISOString()
 * output, a repeated clinician id, or a cap that is not a non-negative integer.
 */
export function tablesOf(set: SeedSet, ids: SeedRowIds): SeedTables {
  const clinicians: Clinician[] = [];
  const slots: AvailableAppointmentSlot[] = [];
  const appointments: Appointment[] = [];
  const seen = new Set<string>();
  for (const seed of set.clinicians) {
    const refuse = (problem: string) => new Error(`seed clinician ${seed.firstName} ${seed.lastName} (${seed.id}): ${problem}`);
    if (seen.has(seed.id)) throw refuse("repeated id");
    seen.add(seed.id);
    for (const cap of ["maxDailyAppointments", "maxWeeklyAppointments"] as const) {
      if (!Number.isInteger(seed[cap]) || seed[cap] < 0) throw refuse(`${cap} must be a non-negative integer, got ${seed[cap]}`);
    }
    let timezone: TimeZone;
    try {
      timezone = parseTimeZone(seed.timezone);
    } catch (e) {
      throw refuse(e instanceof Error ? e.message : String(e));
    }
    const instant = (iso: string): Date => {
      const date = new Date(iso);
      if (Number.isNaN(date.getTime()) || date.toISOString() !== iso) throw refuse(`not a canonical ISO instant: "${iso}"`);
      return date;
    };
    const ownSlots = seed.slots.map((iso) => {
      const row: AvailableAppointmentSlot = {
        id: ids.slot(slots.length),
        clinicianId: seed.id,
        date: instant(iso),
        length: SLOT_MINUTES[seed.clinicianType],
        createdAt: new Date(0),
        updatedAt: new Date(0),
      };
      slots.push(row);
      return row;
    });
    const ownAppointments = seed.appointments.map((raw) => {
      const row: Appointment = {
        id: ids.appointment(appointments.length),
        patientId: raw.patientId,
        clinicianId: seed.id,
        scheduledFor: instant(raw.scheduledFor),
        appointmentType: raw.appointmentType,
        status: raw.status,
        createdAt: new Date(0),
        updatedAt: new Date(0),
      };
      appointments.push(row);
      return row;
    });
    clinicians.push({
      id: seed.id,
      firstName: seed.firstName,
      lastName: seed.lastName,
      states: [...seed.states],
      insurances: [...seed.insurances],
      clinicianType: seed.clinicianType,
      timezone,
      appointments: ownAppointments,
      availableSlots: ownSlots,
      maxDailyAppointments: seed.maxDailyAppointments,
      maxWeeklyAppointments: seed.maxWeeklyAppointments,
      createdAt: new Date(0),
      updatedAt: new Date(0),
    });
  }
  return { clinicians, slots, appointments, patients: set.patients };
}

const CROWD_SLOTS: readonly IsoInstant[] = ["2024-09-10T15:00:00.000Z", "2024-09-11T15:00:00.000Z"];

/**
 * Near-miss volume tier, derived from the patients so it never needs editing. For each patient, in order: one
 * THERAPIST with their exact state and insurance; one PSYCHOLOGIST per other state with their insurance; one
 * PSYCHOLOGIST in their state per other insurance. Dropped: a (type, state, insurance) already emitted, and any
 * psychologist eligible for some patient. So every crowd clinician matches some patient on exactly two of the
 * three keys and is offered to none, and dropping any eligibility filter shows up as an extra group. Each has
 * one pairable slot pair (2024-09-10T15:00Z, 2024-09-11T15:00Z), America/New_York, 2/8. Ids are
 * c0de0000-0000-4000-8000-<n, 12 digits from 1>, last names "Miss <TYPE> <STATE> <PAYER>".
 */
export function crowdOf(patients: readonly Pick<Patient, "state" | "insurance">[]): SeedClinician[] {
  const seen = new Set<string>();
  const kept: Pick<SeedClinician, "clinicianType" | "states" | "insurances">[] = [];
  const consider = (clinicianType: ClinicianType, state: UsStateAbbreviation, insurance: InsurancePayer) => {
    const key = `${clinicianType} ${state} ${insurance}`;
    if (seen.has(key)) return;
    seen.add(key);
    if (clinicianType === "PSYCHOLOGIST" && patients.some((p) => p.state === state && p.insurance === insurance)) return;
    kept.push({ clinicianType, states: [state], insurances: [insurance] });
  };
  for (const patient of patients) {
    consider("THERAPIST", patient.state, patient.insurance);
    for (const state of UsStateAbbreviations) if (state !== patient.state) consider("PSYCHOLOGIST", state, patient.insurance);
    for (const insurance of InsurancePayers) if (insurance !== patient.insurance) consider("PSYCHOLOGIST", patient.state, insurance);
  }
  return kept.map((c, n) => ({
    ...c,
    id: `c0de0000-0000-4000-8000-${String(n + 1).padStart(12, "0")}`,
    firstName: "Near",
    lastName: `Miss ${c.clinicianType} ${c.states[0]} ${c.insurances[0]}`,
    timezone: "America/New_York",
    maxDailyAppointments: 2,
    maxWeeklyAppointments: 8,
    slots: CROWD_SLOTS,
    appointments: [],
  }));
}
