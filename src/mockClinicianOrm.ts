import { Clinician } from "./starter-code/clinician";
import { Patient } from "./starter-code/patient";
import { clinician as seedClinician } from "./starter-code/mock-clinician";

export type ClinicianQuery = Pick<Patient, "state" | "insurance"> & Pick<Clinician, "clinicianType">;

export interface ClinicianRepository {
  /**
   * SELECT * FROM "Clinician"
   * WHERE "clinicianType" = $clinicianType AND $state = ANY(states) AND $insurance = ANY(insurances)
   *
   * Returns [] when none match. Returned rows are the table's own objects, not copies.
   */
  findByTypeStateAndInsurance(query: ClinicianQuery): Clinician[];
}

export function createMockClinicianRepository(rows: readonly Clinician[]): ClinicianRepository {
  const table: readonly Clinician[] = [...rows];
  return {
    findByTypeStateAndInsurance: ({ clinicianType, state, insurance }) =>
      table.filter(
        (c) => c.clinicianType === clinicianType && c.states.includes(state) && c.insurances.includes(insurance),
      ),
  };
}

export const clinicianRepository: ClinicianRepository = createMockClinicianRepository([seedClinician]);
