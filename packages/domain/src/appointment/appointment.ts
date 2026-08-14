import type { AppointmentStatus } from "./lifecycle.js";

/**
 * Organization-scoped scheduled visit.
 * Not a clinical record. Practitioner is a profile id, not a Cognito subject.
 */
export interface Appointment {
  readonly id: string;
  readonly organizationId: string;
  readonly branchId: string;
  readonly patientId: string;
  readonly practitionerId: string;
  readonly startAtUtc: string;
  readonly endAtUtc: string;
  readonly timezone: string;
  readonly status: AppointmentStatus;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface AppointmentCreateInput {
  readonly patientId: string;
  readonly branchId: string;
  readonly practitionerId: string;
  readonly startAtUtc: string;
  readonly endAtUtc: string;
  readonly timezone: string;
}

export interface AppointmentRescheduleInput {
  readonly startAtUtc: string;
  readonly endAtUtc: string;
  readonly timezone: string;
}

export interface AppointmentListFilter {
  readonly patientId?: string;
  readonly practitionerId?: string;
  readonly branchId?: string;
  readonly status?: AppointmentStatus;
}

export class AppointmentValidationError extends Error {
  readonly field: string;

  constructor(field: string, message = "Appointment input was invalid.") {
    super(message);
    this.name = "AppointmentValidationError";
    this.field = field;
  }
}

export class AppointmentConflictError extends Error {
  constructor(message = "Appointment scheduling conflict.") {
    super(message);
    this.name = "AppointmentConflictError";
  }
}

export class AppointmentTransitionError extends Error {
  constructor(message = "Appointment transition is not allowed.") {
    super(message);
    this.name = "AppointmentTransitionError";
  }
}

export class AppointmentNotFoundError extends Error {
  constructor(message = "Appointment was not found.") {
    super(message);
    this.name = "AppointmentNotFoundError";
  }
}
