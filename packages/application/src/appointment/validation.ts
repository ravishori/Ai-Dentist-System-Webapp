import { AppointmentValidationError, isAppointmentStatus } from "@dentalcare/domain";
import type {
  AppointmentCreateInput,
  AppointmentListFilter,
  AppointmentRescheduleInput,
} from "@dentalcare/domain";

const CREATE_FIELDS = new Set([
  "patientId",
  "branchId",
  "practitionerId",
  "startAtUtc",
  "endAtUtc",
  "timezone",
]);
const RESCHEDULE_FIELDS = new Set(["startAtUtc", "endAtUtc", "timezone"]);
const ISO_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

export function parseCreateInput(raw: Record<string, unknown>): AppointmentCreateInput {
  assertAllowed(raw, CREATE_FIELDS);
  const startAtUtc = requireInstant(raw.startAtUtc, "startAtUtc");
  const endAtUtc = requireInstant(raw.endAtUtc, "endAtUtc");
  assertEndAfterStart(startAtUtc, endAtUtc);
  return {
    patientId: requireId(raw.patientId, "patientId"),
    branchId: requireId(raw.branchId, "branchId"),
    practitionerId: requireId(raw.practitionerId, "practitionerId"),
    startAtUtc,
    endAtUtc,
    timezone: requireTimeZone(raw.timezone),
  };
}

export function parseRescheduleInput(raw: Record<string, unknown>): AppointmentRescheduleInput {
  assertAllowed(raw, RESCHEDULE_FIELDS);
  const startAtUtc = requireInstant(raw.startAtUtc, "startAtUtc");
  const endAtUtc = requireInstant(raw.endAtUtc, "endAtUtc");
  assertEndAfterStart(startAtUtc, endAtUtc);
  return {
    startAtUtc,
    endAtUtc,
    timezone: requireTimeZone(raw.timezone),
  };
}

export function parsePatchInput(raw: Record<string, unknown>): void {
  if (Object.keys(raw).length === 0) {
    throw new AppointmentValidationError("body");
  }
  throw new AppointmentValidationError("body");
}

export function parseCommandBody(raw: Record<string, unknown>): void {
  if (Object.keys(raw).length > 0) {
    throw new AppointmentValidationError("body");
  }
}

export function parseListFilter(query: URLSearchParams): AppointmentListFilter {
  const filter: {
    patientId?: string;
    practitionerId?: string;
    branchId?: string;
    status?: AppointmentListFilter["status"];
  } = {};
  const patientId = query.get("patientId");
  const practitionerId = query.get("practitionerId");
  const branchId = query.get("branchId");
  const status = query.get("status");
  if (patientId) filter.patientId = requireId(patientId, "patientId");
  if (practitionerId) filter.practitionerId = requireId(practitionerId, "practitionerId");
  if (branchId) filter.branchId = requireId(branchId, "branchId");
  if (status) {
    if (!isAppointmentStatus(status)) {
      throw new AppointmentValidationError("status");
    }
    filter.status = status;
  }
  return filter;
}

function assertAllowed(raw: Record<string, unknown>, allowed: ReadonlySet<string>): void {
  for (const key of Object.keys(raw)) {
    if (!allowed.has(key)) {
      throw new AppointmentValidationError(key);
    }
  }
}

function requireId(value: unknown, field: string): string {
  if (typeof value !== "string") {
    throw new AppointmentValidationError(field);
  }
  const trimmed = value.trim();
  if (trimmed.length < 1 || trimmed.length > 128) {
    throw new AppointmentValidationError(field);
  }
  return trimmed;
}

function requireInstant(value: unknown, field: string): string {
  if (typeof value !== "string" || !ISO_PATTERN.test(value)) {
    throw new AppointmentValidationError(field);
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new AppointmentValidationError(field);
  }
  return date.toISOString();
}

function requireTimeZone(value: unknown): string {
  if (typeof value !== "string") {
    throw new AppointmentValidationError("timezone");
  }
  const trimmed = value.trim();
  if (!/^[A-Za-z_]+\/[A-Za-z0-9_+-]+$/.test(trimmed) && trimmed !== "UTC") {
    throw new AppointmentValidationError("timezone");
  }
  try {
    Intl.DateTimeFormat("en-US", { timeZone: trimmed });
  } catch {
    throw new AppointmentValidationError("timezone");
  }
  return trimmed;
}

function assertEndAfterStart(startAtUtc: string, endAtUtc: string): void {
  if (!(new Date(endAtUtc).getTime() > new Date(startAtUtc).getTime())) {
    throw new AppointmentValidationError("endAtUtc");
  }
}
