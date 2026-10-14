import { patient as readmePatient } from "./starter-code/mock-patient";
import { seededRoster } from "./mockSlotOrm";
import { findAvailableSlots } from "./schedulerApi";

for (const patient of [readmePatient, ...seededRoster.patients]) {
  const groups = findAvailableSlots(patient);

  console.log(`${groups.reduce((sum, group) => sum + group.options.length, 0)} assessment options for ${patient.firstName} ${patient.lastName} (${patient.state}, ${patient.insurance})`);
  if (groups.length === 0) console.log("  none");
  for (const { clinician, options } of groups) {
    console.log(`${clinician.firstName} ${clinician.lastName} (${clinician.id}, ${clinician.timezone}): ${options.length} options`);
    options.slice(0, 20).forEach(({ first, second }, i) => {
      console.log(`  ${(i + 1).toString().padStart(2)}. ${first.date.toISOString()} + ${second.date.toISOString()}`);
    });
    if (options.length > 20) console.log(`  ...and ${options.length - 20} more options`);
  }
}
