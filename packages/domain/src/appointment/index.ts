/** Appointment domain boundary. M4 implements organization-scoped scheduling. */
export const APPOINTMENT_BOUNDARY = "appointment" as const;

export {
  APPOINTMENT_STATUSES,
  ACTIVE_SCHEDULING_STATUSES,
  TERMINAL_APPOINTMENT_STATUSES,
  CHECK_IN_LEAD_MS,
  APPOINTMENT_LIFECYCLE_COMMANDS,
  APPOINTMENT_LIFECYCLE_SPECS,
  isAppointmentStatus,
  isActiveSchedulingStatus,
  isTerminalAppointmentStatus,
  isAppointmentLifecycleCommand,
  canCancel,
  canReschedule,
  canApplyLifecycleCommand,
  type AppointmentStatus,
  type ActiveSchedulingStatus,
  type TerminalAppointmentStatus,
  type AppointmentLifecycleCommand,
} from "./lifecycle.js";
export {
  AppointmentValidationError,
  AppointmentConflictError,
  AppointmentTransitionError,
  AppointmentNotFoundError,
  type Appointment,
  type AppointmentCreateInput,
  type AppointmentRescheduleInput,
  type AppointmentListFilter,
} from "./appointment.js";
export type { Practitioner } from "./practitioner.js";
export type { BranchRecord } from "./branch-record.js";
export type {
  AppointmentHistoryRecord,
  AppointmentHistoryEvent,
  NotificationOutboxIntent,
  OutboxEventType,
} from "./history.js";
export { APPOINTMENT_HISTORY_EVENTS, OUTBOX_EVENT_TYPES } from "./history.js";
export type {
  AppointmentRepository,
  AppointmentWriteContext,
  PractitionerRepository,
  BranchLookup,
} from "./appointment-repository.js";
