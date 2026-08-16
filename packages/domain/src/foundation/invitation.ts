export const INVITATION_PURPOSES = ["PATIENT", "PRACTITIONER"] as const;

export type InvitationPurpose = (typeof INVITATION_PURPOSES)[number];

export function isInvitationPurpose(value: string): value is InvitationPurpose {
  return (INVITATION_PURPOSES as readonly string[]).includes(value);
}

export const INVITATION_STATUSES = ["PENDING", "REDEEMED", "REVOKED", "EXPIRED"] as const;

export type InvitationStatus = (typeof INVITATION_STATUSES)[number];

export function isInvitationStatus(value: string): value is InvitationStatus {
  return (INVITATION_STATUSES as readonly string[]).includes(value);
}

/**
 * Organization-scoped invitation (TDA-ADR-004 §4).
 * Purpose determines registration type — never trust the client for role.
 * Token is stored hashed only.
 */
export interface OrganizationInvitation {
  readonly id: string;
  readonly organizationId: string;
  readonly purpose: InvitationPurpose;
  readonly tokenHash: string;
  readonly emailHint?: string;
  readonly status: InvitationStatus;
  readonly expiresAt: string;
  readonly createdByUserId: string;
  readonly redeemedAt?: string;
  readonly redeemedByUserId?: string;
  readonly maxUses: number;
  readonly useCount: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export const CLINIC_CODE_STATUSES = ["ACTIVE", "REVOKED"] as const;

export type ClinicCodeStatus = (typeof CLINIC_CODE_STATUSES)[number];

export function isClinicCodeStatus(value: string): value is ClinicCodeStatus {
  return (CLINIC_CODE_STATUSES as readonly string[]).includes(value);
}

/**
 * Org-scoped reusable clinic code for PATIENT registration only.
 * Code is stored hashed. Redemption still requires OTP verification.
 */
export interface ClinicCode {
  readonly id: string;
  readonly organizationId: string;
  readonly purpose: "PATIENT";
  readonly codeHash: string;
  readonly label?: string;
  readonly status: ClinicCodeStatus;
  readonly expiresAt?: string;
  readonly createdByUserId: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}
