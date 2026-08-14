/** Appointment application services. M4 implements organization-scoped scheduling. */
export const APPOINTMENT_APPLICATION = "appointment" as const;

export { AppointmentApplicationService, toPublicAppointment } from "./service.js";
export {
  handleAppointmentCreate,
  handleAppointmentList,
  handleAppointmentGet,
  handleAppointmentPatch,
  handleAppointmentReschedule,
  handleAppointmentCancel,
} from "./http.js";
export {
  InMemoryAppointmentRepository,
  InMemoryPractitionerRepository,
  InMemoryBranchLookup,
} from "./in-memory-repository.js";
export {
  parseCreateInput,
  parseRescheduleInput,
  parseListFilter,
  parsePatchInput,
} from "./validation.js";
