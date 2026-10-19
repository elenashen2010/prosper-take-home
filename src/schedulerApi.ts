import { AvailableAppointmentSlot } from "./starter-code/appointment";
import { Clinician } from "./starter-code/clinician";
import { Patient } from "./starter-code/patient";
import { ClinicianRepository, clinicianRepository } from "./mockClinicianOrm";
import { SEED_NOW, SlotRepository, slotRepository } from "./mockSlotOrm";
import { AppointmentRepository, appointmentRepository } from "./mockAppointmentOrm";
import { APPOINTMENT_MINUTES, capacityOf, ClinicianCapacity } from "./capacity";
import { daysBetween } from "./localDay";

/** The two sessions of an assessment start on different days of the clinician's calendar at most this many days apart. */
export const MAX_ASSESSMENT_DAY_GAP = 7;

const ASSESSMENT_SESSION_MINUTES = APPOINTMENT_MINUTES.ASSESSMENT_SESSION_1;

/**
 * Two sessions with one psychologist, `first` on an earlier local day than `second`, 1 to MAX_ASSESSMENT_DAY_GAP days
 * apart, with `second` starting no earlier than `first` ends.
 */
export interface AssessmentOption {
  readonly first: AvailableAppointmentSlot;
  readonly second: AvailableAppointmentSlot;
}

/**
 * Everything one psychologist can offer the patient. `options` is never empty and is in README order (by first,
 * then second). `clinician.timezone` is the calendar every day in `options` was judged on.
 */
export interface ClinicianAssessmentOptions {
  readonly clinician: Pick<Clinician, "id" | "firstName" | "lastName" | "timezone">;
  readonly options: readonly AssessmentOption[];
}

export interface SchedulerRepositories {
  readonly clinicians: ClinicianRepository;
  readonly slots: SlotRepository;
  readonly appointments: AppointmentRepository;
}

const seededRepositories: SchedulerRepositories = {
  clinicians: clinicianRepository,
  slots: slotRepository,
  appointments: appointmentRepository,
};

/**
 * Assessment options the patient can book, grouped by clinician (README Tasks 1 to 3).
 * Eligible clinicians operate in the patient's state, accept the patient's insurance, and are psychologists.
 * Days are the clinician's local days. A day is offered only while the clinician has room for one more session
 * that day and that week; a start is offered only if it overlaps no held appointment and keeps the day's
 * reachable number of sessions bookable (README Task 2, capped by that room); a pair inside one week needs room
 * for two (README Task 3); a pair's second session never starts before its first ends. Clinicians with no valid
 * pair are omitted. Only slots starting after `now` are offered; appointments before `now` still count toward
 * their day and week. `now` defaults to SEED_NOW, when the seeded tables were captured; a live caller passes
 * new Date(). Three queries in all, whatever the number of clinicians.
 */
export function findAvailableSlots(
  patient: Patient,
  repositories: SchedulerRepositories = seededRepositories,
  now: Date = SEED_NOW,
): ClinicianAssessmentOptions[] {
  const clinicians = repositories.clinicians.findByTypeStateAndInsurance({
    clinicianType: "PSYCHOLOGIST",
    state: patient.state,
    insurance: patient.insurance,
  });
  const ids = clinicians.map((c) => c.id);
  const slotsOf = groupByClinician(repositories.slots.findByCliniciansStartingAfter(ids, now));
  const appointmentsOf = groupByClinician(repositories.appointments.findByClinicians(ids));
  return clinicians
    .map((clinician) => {
      const { id, firstName, lastName, timezone } = clinician;
      const capacity = capacityOf(clinician, appointmentsOf.get(id) ?? []);
      return {
        clinician: { id, firstName, lastName, timezone },
        options: pairAssessmentSlots(slotsOf.get(id) ?? [], capacity),
      };
    })
    .filter((group) => group.options.length > 0);
}

function groupByClinician<Row extends { readonly clinicianId: string }>(rows: readonly Row[]): Map<string, Row[]> {
  const groups = new Map<string, Row[]>();
  for (const row of rows) {
    const group = groups.get(row.clinicianId);
    if (group) group.push(row);
    else groups.set(row.clinicianId, [row]);
  }
  return groups;
}

function pairAssessmentSlots(slots: readonly AvailableAppointmentSlot[], capacity: ClinicianCapacity): AssessmentOption[] {
  const options: AssessmentOption[] = [];
  const dayEntries = [...capacity.bookableDays(slots, ASSESSMENT_SESSION_MINUTES)];
  dayEntries.forEach(([day, firsts], i) => {
    for (const first of firsts) {
      const firstEnd = first.date.getTime() + ASSESSMENT_SESSION_MINUTES * 60_000;
      for (let j = i + 1; j < dayEntries.length; j++) {
        const [laterDay, seconds] = dayEntries[j];
        if (daysBetween(day, laterDay) > MAX_ASSESSMENT_DAY_GAP) break;
        if (!capacity.canBook([day, laterDay])) continue;
        for (const second of seconds) if (second.date.getTime() >= firstEnd) options.push({ first, second });
      }
    }
  });
  return options;
}
