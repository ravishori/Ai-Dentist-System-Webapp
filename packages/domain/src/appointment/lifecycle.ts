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

/** Statuses that occupy a scheduling slot (M4-04/05/06, M6-07). */
export const ACTIVE_SCHEDULING_STATUSES = [
  "REQUESTED",
  "CONFIRMED",
  "CHECKED_IN",
  "IN_PROGRESS",
] as const;

export type ActiveSchedulingStatus = (typeof ACTIVE_SCHEDULING_STATUSES)[number];

export const TERMINAL_APPOINTMENT_STATUSES = ["COMPLETED", "NO_SHOW", "CANCELLED"] as const;

export type TerminalAppointmentStatus = (typeof TERMINAL_APPOINTMENT_STATUSES)[number];

/** M6-06: check-in opens 30 minutes before scheduled start. */
export const CHECK_IN_LEAD_MS = 30 * 60_000;

export const APPOINTMENT_LIFECYCLE_COMMANDS = [
  "confirm",
  "check_in",
  "start",
  "complete",
  "no_show",
] as const;

export type AppointmentLifecycleCommand = (typeof APPOINTMENT_LIFECYCLE_COMMANDS)[number];

export const APPOINTMENT_LIFECYCLE_SPECS = {
  confirm: {
    permission: "appointment.confirm",
    historyEvent: "confirmed",
    auditAction: "appointment.confirm",
    fromStatus: "REQUESTED",
    toStatus: "CONFIRMED",
  },
  check_in: {
    permission: "appointment.check_in",
    historyEvent: "checked_in",
    auditAction: "appointment.check_in",
    fromStatus: "CONFIRMED",
    toStatus: "CHECKED_IN",
  },
  start: {
    permission: "appointment.start",
    historyEvent: "started",
    auditAction: "appointment.start",
    fromStatus: "CHECKED_IN",
    toStatus: "IN_PROGRESS",
  },
  complete: {
    permission: "appointment.complete",
    historyEvent: "completed",
    auditAction: "appointment.complete",
    fromStatus: "IN_PROGRESS",
    toStatus: "COMPLETED",
  },
  no_show: {
    permission: "appointment.no_show",
    historyEvent: "no_show",
    auditAction: "appointment.no_show",
    fromStatus: "CONFIRMED",
    toStatus: "NO_SHOW",
  },
} as const;

export function isAppointmentStatus(value: string): value is AppointmentStatus {
  return (APPOINTMENT_STATUSES as readonly string[]).includes(value);
}

export function isActiveSchedulingStatus(value: string): value is ActiveSchedulingStatus {
  return (ACTIVE_SCHEDULING_STATUSES as readonly string[]).includes(value);
}

export function isTerminalAppointmentStatus(value: string): value is TerminalAppointmentStatus {
  return (TERMINAL_APPOINTMENT_STATUSES as readonly string[]).includes(value);
}

export function isAppointmentLifecycleCommand(value: string): value is AppointmentLifecycleCommand {
  return (APPOINTMENT_LIFECYCLE_COMMANDS as readonly string[]).includes(value);
}

/** M6-02: cancel through CHECKED_IN; not after IN_PROGRESS. */
export function canCancel(status: AppointmentStatus): boolean {
  return status === "REQUESTED" || status === "CONFIRMED" || status === "CHECKED_IN";
}

export function canReschedule(status: AppointmentStatus): boolean {
  return status === "REQUESTED" || status === "CONFIRMED";
}

export function canApplyLifecycleCommand(
  command: AppointmentLifecycleCommand,
  status: AppointmentStatus,
  startAtUtc: string,
  endAtUtc: string,
  now: Date,
): boolean {
  const spec = APPOINTMENT_LIFECYCLE_SPECS[command];
  if (status !== spec.fromStatus) {
    return false;
  }
  const instant = now.getTime();
  if (command === "check_in") {
    const start = Date.parse(startAtUtc);
    const end = Date.parse(endAtUtc);
    return instant >= start - CHECK_IN_LEAD_MS && instant <= end;
  }
  if (command === "no_show") {
    return instant >= Date.parse(startAtUtc);
  }
  return true;
}
