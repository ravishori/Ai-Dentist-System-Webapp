export const PRACTITIONER_STATUSES = ["active", "inactive"] as const;

export type PractitionerStatus = (typeof PRACTITIONER_STATUSES)[number];

export function isPractitionerStatus(value: string): value is PractitionerStatus {
  return (PRACTITIONER_STATUSES as readonly string[]).includes(value);
}

/** Professional verification gate (TDA-ADR-004). Separate from operational `status`. */
export const PRACTITIONER_VERIFICATION_STATUSES = ["pending", "verified", "rejected"] as const;

export type PractitionerVerificationStatus = (typeof PRACTITIONER_VERIFICATION_STATUSES)[number];

export function isPractitionerVerificationStatus(
  value: string,
): value is PractitionerVerificationStatus {
  return (PRACTITIONER_VERIFICATION_STATUSES as readonly string[]).includes(value);
}

/**
 * Organization-scoped practitioner profile (M4-01 / M7-01 / C3).
 * Linked to an Application User. Not a Cognito subject.
 * No unlink, user replacement, or hard delete.
 * `status` = operational eligibility; `verificationStatus` = professional gate.
 */
export interface Practitioner {
  readonly id: string;
  readonly organizationId: string;
  readonly userId: string;
  readonly displayName?: string;
  readonly status: PractitionerStatus;
  readonly verificationStatus: PractitionerVerificationStatus;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface PractitionerCreateInput {
  readonly userId: string;
  readonly displayName?: string;
  /**
   * Professional verification. Staff-managed create defaults to `verified`.
   * Self-registration must pass `pending` explicitly (TDA-ADR-004).
   */
  readonly verificationStatus?: PractitionerVerificationStatus;
}

export interface PractitionerUpdateInput {
  readonly displayName: string;
}

export interface PractitionerBranchAssignment {
  readonly id: string;
  readonly organizationId: string;
  readonly practitionerId: string;
  readonly branchId: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export const UNAVAILABILITY_KINDS = ["break", "leave", "exception"] as const;

export type UnavailabilityKind = (typeof UNAVAILABILITY_KINDS)[number];

export function isUnavailabilityKind(value: string): value is UnavailabilityKind {
  return (UNAVAILABILITY_KINDS as readonly string[]).includes(value);
}

export const UNAVAILABILITY_STATUSES = ["active", "cancelled"] as const;

export type UnavailabilityStatus = (typeof UNAVAILABILITY_STATUSES)[number];

export function isUnavailabilityStatus(value: string): value is UnavailabilityStatus {
  return (UNAVAILABILITY_STATUSES as readonly string[]).includes(value);
}

/** Weekday stored as JS convention: 0 = Sunday … 6 = Saturday. */
export const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6] as const;

export type Weekday = (typeof WEEKDAYS)[number];

export function isWeekday(value: number): value is Weekday {
  return Number.isInteger(value) && value >= 0 && value <= 6;
}

export interface WeeklyWorkingInterval {
  readonly id: string;
  readonly weekday: Weekday;
  readonly startMinute: number;
  readonly endMinute: number;
}

export interface PractitionerSchedule {
  readonly id: string;
  readonly organizationId: string;
  readonly practitionerId: string;
  readonly branchId: string;
  readonly timezone: string;
  readonly intervals: readonly WeeklyWorkingInterval[];
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface PractitionerUnavailability {
  readonly id: string;
  readonly organizationId: string;
  readonly practitionerId: string;
  readonly kind: UnavailabilityKind;
  readonly status: UnavailabilityStatus;
  readonly startAtUtc: string;
  readonly endAtUtc: string;
  readonly timezone: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface PractitionerCreateScheduleInput {
  readonly branchId: string;
  readonly timezone: string;
  readonly intervals: readonly WeeklyIntervalInput[];
}

export interface WeeklyIntervalInput {
  readonly weekday: Weekday;
  readonly startMinute: number;
  readonly endMinute: number;
}

export interface PractitionerReplaceScheduleInput {
  readonly timezone: string;
  readonly intervals: readonly WeeklyIntervalInput[];
}

export interface PractitionerUnavailabilityCreateInput {
  readonly kind: UnavailabilityKind;
  readonly startAtUtc: string;
  readonly endAtUtc: string;
  readonly timezone: string;
}

export interface PractitionerAvailabilityQuery {
  readonly branchId: string;
  readonly startAtUtc: string;
  readonly endAtUtc: string;
  readonly durationMinutes: number;
}

export const AVAILABILITY_UNAVAILABLE_REASONS = [
  "outside_hours",
  "unavailability",
  "appointment",
  "practitioner_inactive",
  "practitioner_unassigned",
] as const;

export type AvailabilityUnavailableReason = (typeof AVAILABILITY_UNAVAILABLE_REASONS)[number];

export const OPERATIONAL_CONFLICT_REASONS = [
  "practitioner_inactive",
  "practitioner_unassigned",
  "leave_covers_appointment",
] as const;

export type OperationalConflictReason = (typeof OPERATIONAL_CONFLICT_REASONS)[number];

export interface AvailableRange {
  readonly startAtUtc: string;
  readonly endAtUtc: string;
}

export interface UnavailableRange {
  readonly startAtUtc: string;
  readonly endAtUtc: string;
  readonly reason: AvailabilityUnavailableReason;
}

export interface OperationalConflict {
  readonly appointmentId: string;
  readonly branchId: string;
  readonly startAtUtc: string;
  readonly endAtUtc: string;
  readonly reason: OperationalConflictReason;
}

export interface PractitionerAvailabilityResult {
  readonly practitionerId: string;
  readonly branchId: string;
  readonly timezone?: string;
  readonly durationMinutes: number;
  readonly windowStartAtUtc: string;
  readonly windowEndAtUtc: string;
  readonly available: readonly AvailableRange[];
  readonly unavailable: readonly UnavailableRange[];
  readonly conflicts: readonly OperationalConflict[];
}

export class PractitionerValidationError extends Error {
  readonly field: string;

  constructor(field: string, message = "Practitioner input was invalid.") {
    super(message);
    this.name = "PractitionerValidationError";
    this.field = field;
  }
}

export class PractitionerConflictError extends Error {
  constructor(message = "Practitioner conflict.") {
    super(message);
    this.name = "PractitionerConflictError";
  }
}

export class PractitionerNotFoundError extends Error {
  constructor(message = "Practitioner was not found.") {
    super(message);
    this.name = "PractitionerNotFoundError";
  }
}
