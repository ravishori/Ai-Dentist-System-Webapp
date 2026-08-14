/**
 * Application permission keys (TDA-ADR-002 §12).
 * Appointment keys are bound in M4. Notification keys remain deferred.
 */
export const FOUNDATION_PERMISSIONS = [
  "organization.read",
  "membership.manage",
  "role.assign",
  "audit.read",
  "security.manage",
] as const;

export type FoundationPermission = (typeof FOUNDATION_PERMISSIONS)[number];

/** Tenant staff patient operations. Self-access keys are not seeded in M3. */
export const PATIENT_PERMISSIONS = [
  "patient.create",
  "patient.read.tenant",
  "patient.update.tenant",
  "patient.archive",
] as const;

export type PatientPermission = (typeof PATIENT_PERMISSIONS)[number];

/** Tenant staff appointment operations. Self-access keys are not seeded in M4. */
export const APPOINTMENT_PERMISSIONS = [
  "appointment.create",
  "appointment.read.tenant",
  "appointment.update.tenant",
  "appointment.reschedule",
  "appointment.cancel",
] as const;

export type AppointmentPermission = (typeof APPOINTMENT_PERMISSIONS)[number];

export const APPLICATION_PERMISSIONS = [
  ...FOUNDATION_PERMISSIONS,
  ...PATIENT_PERMISSIONS,
  ...APPOINTMENT_PERMISSIONS,
] as const;

export type ApplicationPermission = (typeof APPLICATION_PERMISSIONS)[number];

export const PLATFORM_PERMISSIONS = ["security.manage"] as const;

export type PlatformPermission = (typeof PLATFORM_PERMISSIONS)[number];

export function isFoundationPermission(value: string): value is FoundationPermission {
  return (FOUNDATION_PERMISSIONS as readonly string[]).includes(value);
}

export function isPatientPermission(value: string): value is PatientPermission {
  return (PATIENT_PERMISSIONS as readonly string[]).includes(value);
}

export function isAppointmentPermission(value: string): value is AppointmentPermission {
  return (APPOINTMENT_PERMISSIONS as readonly string[]).includes(value);
}

export function isApplicationPermission(value: string): value is ApplicationPermission {
  return (APPLICATION_PERMISSIONS as readonly string[]).includes(value);
}

export function isPlatformPermission(value: string): value is PlatformPermission {
  return (PLATFORM_PERMISSIONS as readonly string[]).includes(value);
}
