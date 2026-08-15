import { PractitionerValidationError } from "./practitioner.js";

const IANA_PATTERN = /^[A-Za-z_]+\/[A-Za-z0-9_+-]+$/;

export function assertIanaTimeZone(value: string, field = "timezone"): string {
  const trimmed = value.trim();
  if (!IANA_PATTERN.test(trimmed) && trimmed !== "UTC") {
    throw new PractitionerValidationError(field);
  }
  try {
    Intl.DateTimeFormat("en-US", { timeZone: trimmed });
  } catch {
    throw new PractitionerValidationError(field);
  }
  return trimmed;
}

export function isValidIanaTimeZone(value: string): boolean {
  try {
    assertIanaTimeZone(value);
    return true;
  } catch {
    return false;
  }
}

interface CivilDateTime {
  readonly year: number;
  readonly month: number;
  readonly day: number;
  readonly hour: number;
  readonly minute: number;
  readonly second: number;
  readonly weekday: number;
}

const TZ_FORMATTER_CACHE = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  const cached = TZ_FORMATTER_CACHE.get(timeZone);
  if (cached) {
    return cached;
  }
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    weekday: "short",
  });
  TZ_FORMATTER_CACHE.set(timeZone, formatter);
  return formatter;
}

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

export function zonedParts(date: Date, timeZone: string): CivilDateTime {
  const parts = formatterFor(timeZone).formatToParts(date);
  const read = (type: string): string => parts.find((part) => part.type === type)?.value ?? "";
  const weekdayName = read("weekday");
  return {
    year: Number(read("year")),
    month: Number(read("month")),
    day: Number(read("day")),
    hour: Number(read("hour")),
    minute: Number(read("minute")),
    second: Number(read("second")),
    weekday: WEEKDAY_INDEX[weekdayName] ?? 0,
  };
}

/** Milliseconds to add to UTC to obtain the wall time in `timeZone`. */
export function timeZoneOffsetMs(date: Date, timeZone: string): number {
  const parts = zonedParts(date, timeZone);
  const asUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  return asUtc - date.getTime();
}

/**
 * Convert a civil local datetime in `timeZone` to a UTC instant.
 * Prefers the earliest UTC instant whose zoned wall time matches (DST overlap).
 * Returns null when the local time is skipped (DST spring-forward gap).
 */
export function zonedLocalToUtc(
  timeZone: string,
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
): Date | null {
  const target = Date.UTC(year, month - 1, day, hour, minute, 0);
  let utc = target;
  for (let i = 0; i < 4; i += 1) {
    const offset = timeZoneOffsetMs(new Date(utc), timeZone);
    const next = target - offset;
    if (next === utc) {
      break;
    }
    utc = next;
  }
  const verify = zonedParts(new Date(utc), timeZone);
  if (
    verify.year !== year ||
    verify.month !== month ||
    verify.day !== day ||
    verify.hour !== hour ||
    verify.minute !== minute
  ) {
    return null;
  }
  const earlier = utc - 60 * 60 * 1000;
  const earlierParts = zonedParts(new Date(earlier), timeZone);
  if (
    earlierParts.year === year &&
    earlierParts.month === month &&
    earlierParts.day === day &&
    earlierParts.hour === hour &&
    earlierParts.minute === minute
  ) {
    return new Date(earlier);
  }
  return new Date(utc);
}

export function addCalendarDays(
  year: number,
  month: number,
  day: number,
  days: number,
): { year: number; month: number; day: number } {
  const utc = new Date(Date.UTC(year, month - 1, day + days));
  return {
    year: utc.getUTCFullYear(),
    month: utc.getUTCMonth() + 1,
    day: utc.getUTCDate(),
  };
}

export function compareCivilDate(
  left: { year: number; month: number; day: number },
  right: { year: number; month: number; day: number },
): number {
  if (left.year !== right.year) return left.year - right.year;
  if (left.month !== right.month) return left.month - right.month;
  return left.day - right.day;
}
