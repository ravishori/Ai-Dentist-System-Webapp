export const OTP_DESTINATION_TYPES = ["EMAIL", "PHONE"] as const;

export type OtpDestinationType = (typeof OTP_DESTINATION_TYPES)[number];

export function isOtpDestinationType(value: string): value is OtpDestinationType {
  return (OTP_DESTINATION_TYPES as readonly string[]).includes(value);
}

export const OTP_PURPOSES = [
  "REGISTRATION_EMAIL",
  "REGISTRATION_PHONE",
  "LOGIN_EMAIL",
  "LOGIN_PHONE",
] as const;

export type OtpPurpose = (typeof OTP_PURPOSES)[number];

export function isOtpPurpose(value: string): value is OtpPurpose {
  return (OTP_PURPOSES as readonly string[]).includes(value);
}

/**
 * Persisted OTP challenge (TDA-ADR-004 §6).
 * Plaintext OTP is never stored — only salt + keyed hash.
 */
export interface AuthOtpChallenge {
  readonly id: string;
  readonly destinationType: OtpDestinationType;
  readonly destinationNormalized: string;
  readonly purpose: OtpPurpose;
  readonly codeSalt: string;
  readonly codeHash: string;
  readonly registrationSessionId?: string;
  readonly organizationId?: string;
  readonly invitationId?: string;
  readonly userId?: string;
  readonly attempts: number;
  readonly maxAttempts: number;
  readonly expiresAt: string;
  readonly consumedAt?: string;
  readonly lastSentAt: string;
  readonly resendCount: number;
  readonly ipHash?: string;
  readonly createdAt: string;
}

export const REGISTRATION_SESSION_STATUSES = [
  "IN_PROGRESS",
  "COMPLETED",
  "EXPIRED",
  "ABANDONED",
] as const;

export type RegistrationSessionStatus = (typeof REGISTRATION_SESSION_STATUSES)[number];

export function isRegistrationSessionStatus(value: string): value is RegistrationSessionStatus {
  return (REGISTRATION_SESSION_STATUSES as readonly string[]).includes(value);
}

export interface RegistrationSession {
  readonly id: string;
  readonly purpose: "PATIENT" | "PRACTITIONER";
  readonly organizationId: string;
  readonly invitationId?: string;
  readonly clinicCodeId?: string;
  readonly status: RegistrationSessionStatus;
  readonly email?: string;
  readonly emailVerifiedAt?: string;
  readonly phone?: string;
  readonly phoneVerifiedAt?: string;
  readonly firstName?: string;
  readonly lastName?: string;
  readonly displayName?: string;
  readonly addressDraft?: AddressDraft;
  readonly expiresAt: string;
  readonly completedUserId?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface AddressDraft {
  readonly line1: string;
  readonly line2?: string;
  readonly city: string;
  readonly state?: string;
  readonly postalCode: string;
  readonly country: string;
  readonly type: "HOME" | "WORK" | "BILLING" | "OTHER";
}
