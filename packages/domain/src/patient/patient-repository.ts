import type { Patient, PatientCreateInput, PatientUpdateInput } from "./patient.js";

export interface PatientRepository {
  create(organizationId: string, input: PatientCreateInput): Promise<Patient>;
  findByOrganizationAndId(organizationId: string, patientId: string): Promise<Patient | null>;
  listByOrganization(organizationId: string): Promise<readonly Patient[]>;
  updateByOrganizationAndId(
    organizationId: string,
    patientId: string,
    input: PatientUpdateInput,
  ): Promise<Patient | null>;
}
