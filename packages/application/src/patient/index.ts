/** Patient application services. M3 implements organization-scoped patient identity. */
export const PATIENT_APPLICATION = "patient" as const;

export { PatientApplicationService, toPublicPatient } from "./service.js";
export {
  handlePatientCreate,
  handlePatientList,
  handlePatientGet,
  handlePatientPatch,
} from "./http.js";
export { InMemoryPatientRepository } from "./in-memory-repository.js";
export { parseCreateInput, parseUpdateInput, isValidPatientEmail } from "./validation.js";
