import { Clinician } from "./clinician";
import { SEED_CLINICIAN_ID, SEED_CLINICIAN_TIMEZONE, slotRepository } from "../mockSlotOrm";
import { appointmentRepository } from "../mockAppointmentOrm";

export const clinician: Clinician = {
  id: SEED_CLINICIAN_ID,
  firstName: "Jane",
  lastName: "Doe",
  states: ["NY", "CA"],
  insurances: ["AETNA", "CIGNA"],
  clinicianType: "PSYCHOLOGIST",
  timezone: SEED_CLINICIAN_TIMEZONE,
  appointments: appointmentRepository.findByClinician(SEED_CLINICIAN_ID),
  availableSlots: slotRepository.findByClinician(SEED_CLINICIAN_ID),
  maxDailyAppointments: 2,
  maxWeeklyAppointments: 8,
  createdAt: new Date(),
  updatedAt: new Date(),
};
