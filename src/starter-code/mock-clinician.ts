import { AvailableAppointmentSlot } from "./appointment";
import { Clinician } from "./clinician";
import { MOCK_SLOT_DATA } from "./mock-slot-data";

const CLINICIAN_ID = "9c516382-c5b2-4677-a7ac-4e100fa35bdd";

const mockSlotData: AvailableAppointmentSlot[] = MOCK_SLOT_DATA.map(
  (slot, index) => ({
    id: `mock-slot-${index}`,
    clinicianId: CLINICIAN_ID,
    date: new Date(slot.date),
    length: slot.length,
    createdAt: new Date(),
    updatedAt: new Date(),
  }),
);

export const clinician: Clinician = {
  id: CLINICIAN_ID,
  firstName: "Jane",
  lastName: "Doe",
  states: ["NY", "CA"],
  insurances: ["AETNA", "CIGNA"],
  clinicianType: "PSYCHOLOGIST",
  appointments: [],
  availableSlots: mockSlotData,
  maxDailyAppointments: 2,
  maxWeeklyAppointments: 8,
  createdAt: new Date(),
  updatedAt: new Date(),
};
