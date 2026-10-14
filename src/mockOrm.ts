import { Clinician } from "./starter-code/clinician";
import { Patient } from "./starter-code/patient";
import { clinician as seedClinician } from "./starter-code/mock-clinician";

export type ClinicianQuery = Pick<Patient, "state" | "insurance">;

export interface ClinicianRepository {
  /**
   * Clinicians whose `states` contain `query.state` AND whose `insurances` contain `query.insurance`.
   * Returns [] when none match. Returned rows are the table's own objects, not copies.
   */
  findByStateAndInsurance(query: ClinicianQuery): Clinician[];
}

export function createMockClinicianRepository(rows: readonly Clinician[]): ClinicianRepository {
  const table: readonly Clinician[] = [...rows];
  return {
    findByStateAndInsurance: ({ state, insurance }) =>
      table.filter((c) => c.states.includes(state) && c.insurances.includes(insurance)),
  };
}

export const clinicianRepository: ClinicianRepository = createMockClinicianRepository([seedClinician]);
