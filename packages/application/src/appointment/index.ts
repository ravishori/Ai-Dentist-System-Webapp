/** Appointment application services. M4 implements organization-scoped scheduling. */
export const APPOINTMENT_APPLICATION = "appointment" as const;

export { AppointmentApplicationService, toPublicAppointment } from "./service.js";
export type { AppointmentHttpResult } from "./http.js";
export {
  handleAppointmentCreate,
  handleAppointmentList,
  handleAppointmentGet,
  handleAppointmentPatch,
  handleAppointmentReschedule,
  handleAppointmentCancel,
  handleAppointmentConfirm,
  handleAppointmentCheckIn,
  handleAppointmentStart,
  handleAppointmentComplete,
  handleAppointmentNoShow,
} from "./http.js";
export {
  InMemoryAppointmentRepository,
  InMemoryBranchLookup,
  InMemoryPractitionerRepository,
} from "./in-memory-repository.js";
export {
  parseCreateInput,
  parseRescheduleInput,
  parseListFilter,
  parsePatchInput,
  parseCommandBody,
} from "./validation.js";
