import { Appointment, AppointmentStatus, AppointmentType } from "./starter-code/appointment";
import { SEED_CLINICIAN_ID, seededRoster, seedSetFromEnv } from "./mockSlotOrm";

export interface AppointmentRepository {
  /**
   * SELECT * FROM "Appointment" WHERE "clinicianId" = $clinicianId
   *
   * Every status and every date: which statuses hold the clinician's time is scheduling policy (capacity.ts),
   * not a WHERE clause. Rows in table order. Returns [] for an unknown clinician. Returned rows are the table's
   * own objects, not copies.
   */
  findByClinician(clinicianId: Appointment["clinicianId"]): Appointment[];
}

export function createMockAppointmentRepository(rows: readonly Appointment[]): AppointmentRepository {
  const table: readonly Appointment[] = [...rows];
  return {
    findByClinician: (clinicianId) => table.filter((a) => a.clinicianId === clinicianId),
  };
}

/** One raw seed row; id, clinicianId and timestamps are filled in at seeding, like the slot seed. */
export interface SeedAppointment {
  readonly patientId: string;
  readonly scheduledFor: string;
  readonly appointmentType: AppointmentType;
  readonly status: AppointmentStatus;
}

/**
 * Dr. Doe's week of 2024-08-19, designed against the small slot seed: 2024-08-19 is full (daily cap), week
 * 2024-08-19 holds 7 of its 8 (one more session fits, a same-week pair does not), the 2024-08-21T01:00Z row
 * starts on New York 08-20, the 2024-08-21T14:00Z row overlaps the 08-21T15:00Z slot, and the four freed rows
 * sit exactly where they would hide slots if they still held time. 7 of the 11 rows hold time.
 */
export const MOCK_APPOINTMENT_DATA_BUSY: readonly SeedAppointment[] = [
  { patientId: "b05e0001-0000-4000-8000-000000000001", scheduledFor: "2024-08-19T16:00:00.000Z", appointmentType: "ASSESSMENT_SESSION_1", status: "UPCOMING" },
  { patientId: "b05e0001-0000-4000-8000-000000000002", scheduledFor: "2024-08-19T19:00:00.000Z", appointmentType: "ASSESSMENT_SESSION_2", status: "UPCOMING" },
  { patientId: "b05e0001-0000-4000-8000-000000000003", scheduledFor: "2024-08-20T14:00:00.000Z", appointmentType: "ASSESSMENT_SESSION_1", status: "OCCURRED" },
  { patientId: "b05e0001-0000-4000-8000-000000000004", scheduledFor: "2024-08-21T01:00:00.000Z", appointmentType: "ASSESSMENT_SESSION_2", status: "UPCOMING" },
  { patientId: "b05e0001-0000-4000-8000-000000000005", scheduledFor: "2024-08-21T14:00:00.000Z", appointmentType: "ASSESSMENT_SESSION_1", status: "UPCOMING" },
  { patientId: "b05e0001-0000-4000-8000-000000000006", scheduledFor: "2024-08-22T15:00:00.000Z", appointmentType: "ASSESSMENT_SESSION_1", status: "CANCELLED" },
  { patientId: "b05e0001-0000-4000-8000-000000000007", scheduledFor: "2024-08-23T13:00:00.000Z", appointmentType: "ASSESSMENT_SESSION_1", status: "NO_SHOW" },
  { patientId: "b05e0001-0000-4000-8000-000000000008", scheduledFor: "2024-08-25T14:00:00.000Z", appointmentType: "ASSESSMENT_SESSION_2", status: "UPCOMING" },
  { patientId: "b05e0001-0000-4000-8000-000000000009", scheduledFor: "2024-08-28T12:00:00.000Z", appointmentType: "ASSESSMENT_SESSION_2", status: "RE_SCHEDULED" },
  { patientId: "b05e0001-0000-4000-8000-00000000000a", scheduledFor: "2024-08-28T16:00:00.000Z", appointmentType: "ASSESSMENT_SESSION_1", status: "LATE_CANCELLATION" },
  { patientId: "b05e0001-0000-4000-8000-00000000000b", scheduledFor: "2024-08-28T18:00:00.000Z", appointmentType: "ASSESSMENT_SESSION_2", status: "LATE_CANCELLATION" },
];

export const SeedAppointmentSets = { none: [], busy: MOCK_APPOINTMENT_DATA_BUSY } as const;
export type SeedAppointmentSet = keyof typeof SeedAppointmentSets;

/** Which raw appointment set seeds the table: SEED_APPOINTMENTS=none (default, the README example's empty calendar) or busy. */
export function seedAppointmentSetFromEnv(value = process.env.SEED_APPOINTMENTS): SeedAppointmentSet {
  return seedSetFromEnv("SEED_APPOINTMENTS", SeedAppointmentSets, "none", value);
}

export const seedAppointmentSet: SeedAppointmentSet = seedAppointmentSetFromEnv();

export const appointmentRepository: AppointmentRepository = createMockAppointmentRepository([
  ...SeedAppointmentSets[seedAppointmentSet].map((row, index) => ({
    id: `mock-appointment-${index}`,
    patientId: row.patientId,
    clinicianId: SEED_CLINICIAN_ID,
    scheduledFor: new Date(row.scheduledFor),
    appointmentType: row.appointmentType,
    status: row.status,
    createdAt: new Date(),
    updatedAt: new Date(),
  })),
  ...seededRoster.appointments,
]);
