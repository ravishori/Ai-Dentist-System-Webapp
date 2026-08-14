/**
 * Foundation permission keys (TDA-ADR-002 §12).
 * Patient/Appointment/Notification keys are deferred until those domains.
 */
export const FOUNDATION_PERMISSIONS = [
  "organization.read",
  "membership.manage",
  "role.assign",
  "audit.read",
  "security.manage",
] as const;

export type FoundationPermission = (typeof FOUNDATION_PERMISSIONS)[number];

export const PLATFORM_PERMISSIONS = ["security.manage"] as const;

export type PlatformPermission = (typeof PLATFORM_PERMISSIONS)[number];

export function isFoundationPermission(value: string): value is FoundationPermission {
  return (FOUNDATION_PERMISSIONS as readonly string[]).includes(value);
}

export function isPlatformPermission(value: string): value is PlatformPermission {
  return (PLATFORM_PERMISSIONS as readonly string[]).includes(value);
}
