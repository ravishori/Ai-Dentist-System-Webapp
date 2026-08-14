import { PatientValidationError, isPatientStatus } from "@dentalcare/domain";
import type { PatientCreateInput, PatientUpdateInput } from "@dentalcare/domain";

const NAME_MAX = 80;
const EMAIL_MAX = 254;
const PHONE_MAX = 20;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_PATTERN = /^\+?[0-9][0-9\s-]{6,18}[0-9]$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const CREATE_FIELDS = new Set(["firstName", "lastName", "dateOfBirth", "email", "phone"]);
const UPDATE_FIELDS = new Set(["firstName", "lastName", "dateOfBirth", "email", "phone", "status"]);

export function assertNoForbiddenFields(
  raw: Record<string, unknown>,
  allowed: ReadonlySet<string>,
): void {
  for (const key of Object.keys(raw)) {
    if (!allowed.has(key)) {
      throw new PatientValidationError(key, "Patient input was invalid.");
    }
  }
}

export function parseCreateInput(raw: Record<string, unknown>): PatientCreateInput {
  assertNoForbiddenFields(raw, CREATE_FIELDS);
  return {
    firstName: requireName(raw.firstName, "firstName"),
    lastName: requireName(raw.lastName, "lastName"),
    dateOfBirth: requireDateOfBirth(raw.dateOfBirth),
    email: optionalEmail(raw.email),
    phone: optionalPhone(raw.phone),
  };
}

export function parseUpdateInput(raw: Record<string, unknown>): PatientUpdateInput {
  assertNoForbiddenFields(raw, UPDATE_FIELDS);
  const draft: {
    firstName?: string;
    lastName?: string;
    dateOfBirth?: string;
    email?: string | null;
    phone?: string | null;
    status?: PatientUpdateInput["status"];
  } = {};
  if ("firstName" in raw) draft.firstName = requireName(raw.firstName, "firstName");
  if ("lastName" in raw) draft.lastName = requireName(raw.lastName, "lastName");
  if ("dateOfBirth" in raw) draft.dateOfBirth = requireDateOfBirth(raw.dateOfBirth);
  if ("email" in raw) draft.email = raw.email === null ? null : optionalEmail(raw.email);
  if ("phone" in raw) draft.phone = raw.phone === null ? null : optionalPhone(raw.phone);
  if ("status" in raw) {
    if (typeof raw.status !== "string" || !isPatientStatus(raw.status)) {
      throw new PatientValidationError("status");
    }
    draft.status = raw.status;
  }
  if (Object.keys(draft).length === 0) {
    throw new PatientValidationError("body");
  }
  return draft;
}

function requireName(value: unknown, field: string): string {
  if (typeof value !== "string") {
    throw new PatientValidationError(field);
  }
  const trimmed = value.trim();
  if (trimmed.length < 1 || trimmed.length > NAME_MAX) {
    throw new PatientValidationError(field);
  }
  if (/[\n\r<>]/.test(trimmed)) {
    throw new PatientValidationError(field);
  }
  return trimmed;
}

function requireDateOfBirth(value: unknown): string {
  if (typeof value !== "string" || !DATE_PATTERN.test(value)) {
    throw new PatientValidationError("dateOfBirth");
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new PatientValidationError("dateOfBirth");
  }
  const today = new Date();
  const todayUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  if (date.getTime() > todayUtc) {
    throw new PatientValidationError("dateOfBirth");
  }
  if (date.getUTCFullYear() < 1900) {
    throw new PatientValidationError("dateOfBirth");
  }
  return value;
}

function optionalEmail(value: unknown): string | undefined {
  if (value === undefined || value === "") {
    return undefined;
  }
  if (typeof value !== "string" || value.length > EMAIL_MAX || !EMAIL_PATTERN.test(value.trim())) {
    throw new PatientValidationError("email");
  }
  return value.trim().toLowerCase();
}

function optionalPhone(value: unknown): string | undefined {
  if (value === undefined || value === "") {
    return undefined;
  }
  if (typeof value !== "string" || value.length > PHONE_MAX || !PHONE_PATTERN.test(value.trim())) {
    throw new PatientValidationError("phone");
  }
  return value.trim();
}
