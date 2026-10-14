import { patient } from "./starter-code/mock-patient";
import { findAvailableSlots } from "./schedulerApi";

const slots = findAvailableSlots(patient);
console.log(slots);