/** Patient domain boundary. M3 implements organization-scoped patient identity only. */
export const PATIENT_BOUNDARY = "patient" as const;

export {
  PATIENT_STATUSES,
  isPatientStatus,
  PatientValidationError,
  type Patient,
  type PatientStatus,
  type PatientCreateInput,
  type PatientUpdateInput,
} from "./patient.js";
export type { PatientRepository } from "./patient-repository.js";
