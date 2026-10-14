import { Clinician } from "./clinician";
import { SEED_CLINICIAN_ID, slotRepository } from "../mockSlotOrm";

export const clinician: Clinician = {
  id: SEED_CLINICIAN_ID,
  firstName: "Jane",
  lastName: "Doe",
  states: ["NY", "CA"],
  insurances: ["AETNA", "CIGNA"],
  clinicianType: "PSYCHOLOGIST",
  appointments: [],
  availableSlots: slotRepository.findByClinician(SEED_CLINICIAN_ID),
  maxDailyAppointments: 2,
  maxWeeklyAppointments: 8,
  createdAt: new Date(),
  updatedAt: new Date(),
};
