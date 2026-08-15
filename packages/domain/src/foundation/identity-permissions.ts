/**
 * C3 invitation / clinic-code permissions (TDA-ADR-004).
 * Follow existing dotted permission key convention.
 */
export const IDENTITY_PERMISSIONS = [
  "invitation.patient.create",
  "invitation.practitioner.create",
  "invitation.revoke",
  "clinic_code.manage",
  "practitioner.verify",
  "patient.link_user",
] as const;

export type IdentityPermission = (typeof IDENTITY_PERMISSIONS)[number];

export function isIdentityPermission(value: string): value is IdentityPermission {
  return (IDENTITY_PERMISSIONS as readonly string[]).includes(value);
}
