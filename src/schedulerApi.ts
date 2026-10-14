import { AvailableAppointmentSlot } from "./starter-code/appointment";
import { Clinician } from "./starter-code/clinician";
import { Patient } from "./starter-code/patient";
import { ClinicianRepository, clinicianRepository } from "./mockClinicianOrm";
import { SlotRepository, slotRepository } from "./mockSlotOrm";
import { daysBetween, UtcDay, utcDayOf } from "./utcDay";

/** The two sessions of an assessment start on different UTC days at most this many days apart. */
export const MAX_ASSESSMENT_DAY_GAP = 7;

/** Two sessions with one psychologist, `first` on an earlier UTC day than `second`, 1 to MAX_ASSESSMENT_DAY_GAP days apart. */
export interface AssessmentOption {
  readonly first: AvailableAppointmentSlot;
  readonly second: AvailableAppointmentSlot;
}

/** Everything one psychologist can offer the patient. `options` is never empty and is in README order (by first, then second). */
export interface ClinicianAssessmentOptions {
  readonly clinician: Pick<Clinician, "id" | "firstName" | "lastName">;
  readonly options: readonly AssessmentOption[];
}

export interface SchedulerRepositories {
  readonly clinicians: ClinicianRepository;
  readonly slots: SlotRepository;
}

const seededRepositories: SchedulerRepositories = { clinicians: clinicianRepository, slots: slotRepository };

/**
 * Assessment options the patient can book, grouped by clinician (README Task 1).
 * Eligible clinicians operate in the patient's state, accept the patient's insurance, and are psychologists.
 * Clinicians with no valid pair are omitted. One slot query per eligible psychologist.
 */
export function findAvailableSlots(
  patient: Patient,
  repositories: SchedulerRepositories = seededRepositories,
): ClinicianAssessmentOptions[] {
  return repositories.clinicians
    .findByTypeStateAndInsurance({ clinicianType: "PSYCHOLOGIST", state: patient.state, insurance: patient.insurance })
    .map(({ id, firstName, lastName }) => ({
      clinician: { id, firstName, lastName },
      options: pairAssessmentSlots(repositories.slots.findByClinician(id)),
    }))
    .filter((group) => group.options.length > 0);
}

function pairAssessmentSlots(slots: readonly AvailableAppointmentSlot[]): AssessmentOption[] {
  const days = slotsByUtcDay(slots);
  const options: AssessmentOption[] = [];
  const dayEntries = [...days.entries()];
  dayEntries.forEach(([day, firsts], i) => {
    for (const first of firsts) {
      for (let j = i + 1; j < dayEntries.length; j++) {
        const [laterDay, seconds] = dayEntries[j];
        if (daysBetween(day, laterDay) > MAX_ASSESSMENT_DAY_GAP) break;
        for (const second of seconds) options.push({ first, second });
      }
    }
  });
  return options;
}

function slotsByUtcDay(slots: readonly AvailableAppointmentSlot[]): Map<UtcDay, AvailableAppointmentSlot[]> {
  const buckets = new Map<UtcDay, AvailableAppointmentSlot[]>();
  for (const slot of [...slots].sort((a, b) => a.date.getTime() - b.date.getTime())) {
    const day = utcDayOf(slot.date);
    const bucket = buckets.get(day);
    if (bucket) bucket.push(slot);
    else buckets.set(day, [slot]);
  }
  return buckets;
}
