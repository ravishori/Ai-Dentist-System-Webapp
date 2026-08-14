/**
 * Delivery-phase role keys (TDA-ADR-002 §11).
 * SYSTEM_ADMIN is platform-scoped and is not an ordinary membership privilege.
 */
export const TENANT_ROLE_KEYS = ["PATIENT", "STAFF", "PRACTITIONER", "PRACTICE_ADMIN"] as const;

export const PLATFORM_ROLE_KEYS = ["SYSTEM_ADMIN"] as const;

export const ROLE_KEYS = [...TENANT_ROLE_KEYS, ...PLATFORM_ROLE_KEYS] as const;

export type TenantRoleKey = (typeof TENANT_ROLE_KEYS)[number];
export type PlatformRoleKey = (typeof PLATFORM_ROLE_KEYS)[number];
export type RoleKey = (typeof ROLE_KEYS)[number];

export function isTenantRoleKey(value: string): value is TenantRoleKey {
  return (TENANT_ROLE_KEYS as readonly string[]).includes(value);
}

export function isPlatformRoleKey(value: string): value is PlatformRoleKey {
  return (PLATFORM_ROLE_KEYS as readonly string[]).includes(value);
}

export function isRoleKey(value: string): value is RoleKey {
  return (ROLE_KEYS as readonly string[]).includes(value);
}
