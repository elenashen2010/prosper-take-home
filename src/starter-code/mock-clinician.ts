import { Clinician } from "./clinician";
import { SEED_CLINICIAN_ID, SEED_CLINICIAN_TIMEZONE, slotRepository } from "../mockSlotOrm";

export const clinician: Clinician = {
  id: SEED_CLINICIAN_ID,
  firstName: "Jane",
  lastName: "Doe",
  states: ["NY", "CA"],
  insurances: ["AETNA", "CIGNA"],
  clinicianType: "PSYCHOLOGIST",
  timezone: SEED_CLINICIAN_TIMEZONE,
  appointments: [],
  availableSlots: slotRepository.findByClinician(SEED_CLINICIAN_ID),
  maxDailyAppointments: 2,
  maxWeeklyAppointments: 8,
  createdAt: new Date(),
  updatedAt: new Date(),
};
