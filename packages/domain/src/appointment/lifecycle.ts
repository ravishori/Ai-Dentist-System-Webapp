export const APPOINTMENT_STATUSES = [
  "REQUESTED",
  "CONFIRMED",
  "CHECKED_IN",
  "IN_PROGRESS",
  "COMPLETED",
  "NO_SHOW",
  "CANCELLED",
] as const;

export type AppointmentStatus = (typeof APPOINTMENT_STATUSES)[number];

/** Statuses that occupy a scheduling slot (M4-04/05/06). */
export const ACTIVE_SCHEDULING_STATUSES = [
  "REQUESTED",
  "CONFIRMED",
  "CHECKED_IN",
  "IN_PROGRESS",
] as const;

export type ActiveSchedulingStatus = (typeof ACTIVE_SCHEDULING_STATUSES)[number];

export function isAppointmentStatus(value: string): value is AppointmentStatus {
  return (APPOINTMENT_STATUSES as readonly string[]).includes(value);
}

export function isActiveSchedulingStatus(value: string): value is ActiveSchedulingStatus {
  return (ACTIVE_SCHEDULING_STATUSES as readonly string[]).includes(value);
}

export function canCancel(status: AppointmentStatus): boolean {
  return status === "REQUESTED" || status === "CONFIRMED" || status === "CHECKED_IN" || status === "IN_PROGRESS";
}

export function canReschedule(status: AppointmentStatus): boolean {
  return status === "REQUESTED" || status === "CONFIRMED";
}
