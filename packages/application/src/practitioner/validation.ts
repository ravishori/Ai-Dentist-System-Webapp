import {
  PractitionerValidationError,
  isUnavailabilityKind,
  isWeekday,
  type PractitionerAvailabilityQuery,
  type PractitionerCreateInput,
  type PractitionerCreateScheduleInput,
  type PractitionerReplaceScheduleInput,
  type PractitionerUnavailabilityCreateInput,
  type PractitionerUpdateInput,
  type WeeklyIntervalInput,
} from "@dentalcare/domain";
import { assertIanaTimeZone } from "@dentalcare/domain";

const CREATE_FIELDS = new Set(["userId", "displayName"]);
const UPDATE_FIELDS = new Set(["displayName"]);
const ASSIGN_FIELDS = new Set(["branchId"]);
const SCHEDULE_FIELDS = new Set(["branchId", "timezone", "intervals"]);
const REPLACE_FIELDS = new Set(["timezone", "intervals"]);
const INTERVAL_FIELDS = new Set(["weekday", "startMinute", "endMinute", "startLocal", "endLocal"]);
const UNAVAILABILITY_FIELDS = new Set(["kind", "startAtUtc", "endAtUtc", "timezone"]);
const ISO_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

export function parseCreateInput(raw: Record<string, unknown>): PractitionerCreateInput {
  assertAllowed(raw, CREATE_FIELDS);
  const input: PractitionerCreateInput = {
    userId: requireId(raw.userId, "userId"),
  };
  if (raw.displayName !== undefined) {
    return { ...input, displayName: requireDisplayName(raw.displayName) };
  }
  return input;
}

export function parseUpdateInput(raw: Record<string, unknown>): PractitionerUpdateInput {
  assertAllowed(raw, UPDATE_FIELDS);
  return { displayName: requireDisplayName(raw.displayName) };
}

export function parseAssignInput(raw: Record<string, unknown>): { branchId: string } {
  assertAllowed(raw, ASSIGN_FIELDS);
  return { branchId: requireId(raw.branchId, "branchId") };
}

export function parseCommandBody(raw: Record<string, unknown>): void {
  if (Object.keys(raw).length > 0) {
    throw new PractitionerValidationError("body");
  }
}

export function parseScheduleInput(raw: Record<string, unknown>): PractitionerCreateScheduleInput {
  assertAllowed(raw, SCHEDULE_FIELDS);
  return {
    branchId: requireId(raw.branchId, "branchId"),
    timezone: requireTimeZone(raw.timezone),
    intervals: parseIntervals(raw.intervals),
  };
}

export function parseReplaceScheduleInput(
  raw: Record<string, unknown>,
): PractitionerReplaceScheduleInput {
  assertAllowed(raw, REPLACE_FIELDS);
  return {
    timezone: requireTimeZone(raw.timezone),
    intervals: parseIntervals(raw.intervals),
  };
}

export function parseUnavailabilityInput(
  raw: Record<string, unknown>,
): PractitionerUnavailabilityCreateInput {
  assertAllowed(raw, UNAVAILABILITY_FIELDS);
  const startAtUtc = requireInstant(raw.startAtUtc, "startAtUtc");
  const endAtUtc = requireInstant(raw.endAtUtc, "endAtUtc");
  if (!(new Date(endAtUtc).getTime() > new Date(startAtUtc).getTime())) {
    throw new PractitionerValidationError("endAtUtc");
  }
  if (typeof raw.kind !== "string" || !isUnavailabilityKind(raw.kind)) {
    throw new PractitionerValidationError("kind");
  }
  return {
    kind: raw.kind,
    startAtUtc,
    endAtUtc,
    timezone: requireTimeZone(raw.timezone),
  };
}

export function parseAvailabilityQuery(query: URLSearchParams): PractitionerAvailabilityQuery {
  const durationRaw = query.get("durationMinutes");
  const durationMinutes = durationRaw ? Number(durationRaw) : NaN;
  if (!Number.isInteger(durationMinutes) || durationMinutes < 1 || durationMinutes > 24 * 60) {
    throw new PractitionerValidationError("durationMinutes");
  }
  const startAtUtc = requireInstant(query.get("startAtUtc"), "startAtUtc");
  const endAtUtc = requireInstant(query.get("endAtUtc"), "endAtUtc");
  if (!(new Date(endAtUtc).getTime() > new Date(startAtUtc).getTime())) {
    throw new PractitionerValidationError("endAtUtc");
  }
  return {
    branchId: requireId(query.get("branchId"), "branchId"),
    startAtUtc,
    endAtUtc,
    durationMinutes,
  };
}

function parseIntervals(value: unknown): WeeklyIntervalInput[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 21) {
    throw new PractitionerValidationError("intervals");
  }
  return value.map((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new PractitionerValidationError("intervals");
    }
    const raw = item as Record<string, unknown>;
    assertAllowed(raw, INTERVAL_FIELDS);
    if (typeof raw.weekday !== "number" || !isWeekday(raw.weekday)) {
      throw new PractitionerValidationError("weekday");
    }
    const startMinute =
      raw.startMinute !== undefined
        ? requireMinute(raw.startMinute, "startMinute")
        : parseLocalTime(raw.startLocal, "startLocal");
    const endMinute =
      raw.endMinute !== undefined
        ? requireMinute(raw.endMinute, "endMinute")
        : parseLocalTime(raw.endLocal, "endLocal", true);
    if (!(startMinute < endMinute) || endMinute > 1440) {
      throw new PractitionerValidationError("endMinute");
    }
    return { weekday: raw.weekday, startMinute, endMinute };
  });
}

function parseLocalTime(value: unknown, field: string, allowMidnightEnd = false): number {
  if (typeof value !== "string") {
    throw new PractitionerValidationError(field);
  }
  const match =
    /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value) ??
    (allowMidnightEnd && value === "24:00" ? ["24:00", "24", "00"] : null);
  if (!match) {
    throw new PractitionerValidationError(field);
  }
  return Number(match[1]) * 60 + Number(match[2]);
}

function requireMinute(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > 1440) {
    throw new PractitionerValidationError(field);
  }
  return value;
}

function assertAllowed(raw: Record<string, unknown>, allowed: ReadonlySet<string>): void {
  for (const key of Object.keys(raw)) {
    if (!allowed.has(key)) {
      throw new PractitionerValidationError(key);
    }
  }
}

function requireId(value: unknown, field: string): string {
  if (typeof value !== "string") {
    throw new PractitionerValidationError(field);
  }
  const trimmed = value.trim();
  if (trimmed.length < 1 || trimmed.length > 128) {
    throw new PractitionerValidationError(field);
  }
  return trimmed;
}

function requireDisplayName(value: unknown): string {
  if (typeof value !== "string") {
    throw new PractitionerValidationError("displayName");
  }
  const trimmed = value.trim();
  if (trimmed.length < 1 || trimmed.length > 120) {
    throw new PractitionerValidationError("displayName");
  }
  return trimmed;
}

function requireInstant(value: unknown, field: string): string {
  if (typeof value !== "string" || !ISO_PATTERN.test(value)) {
    throw new PractitionerValidationError(field);
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new PractitionerValidationError(field);
  }
  return date.toISOString();
}

function requireTimeZone(value: unknown): string {
  if (typeof value !== "string") {
    throw new PractitionerValidationError("timezone");
  }
  return assertIanaTimeZone(value);
}
