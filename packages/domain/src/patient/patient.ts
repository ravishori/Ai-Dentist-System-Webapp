export const PATIENT_STATUSES = ["active", "inactive"] as const;

export type PatientStatus = (typeof PATIENT_STATUSES)[number];

export function isPatientStatus(value: string): value is PatientStatus {
  return (PATIENT_STATUSES as readonly string[]).includes(value);
}

/**
 * Organization-scoped person receiving care.
 * Not an authentication user. No Cognito subject/issuer fields.
 */
export interface Patient {
  readonly id: string;
  readonly organizationId: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly dateOfBirth: string;
  readonly email?: string;
  readonly phone?: string;
  readonly status: PatientStatus;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface PatientCreateInput {
  readonly firstName: string;
  readonly lastName: string;
  readonly dateOfBirth: string;
  readonly email?: string;
  readonly phone?: string;
}

export interface PatientUpdateInput {
  readonly firstName?: string;
  readonly lastName?: string;
  readonly dateOfBirth?: string;
  readonly email?: string | null;
  readonly phone?: string | null;
  readonly status?: PatientStatus;
}

export class PatientValidationError extends Error {
  readonly field: string;

  constructor(field: string, message = "Patient input was invalid.") {
    super(message);
    this.name = "PatientValidationError";
    this.field = field;
  }
}
