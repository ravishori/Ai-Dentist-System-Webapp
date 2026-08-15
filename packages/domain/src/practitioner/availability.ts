import { isActiveSchedulingStatus, type Appointment } from "../appointment/appointment.js";
import type { AppointmentStatus } from "../appointment/lifecycle.js";
import {
  addCalendarDays,
  compareCivilDate,
  zonedLocalToUtc,
  zonedParts,
} from "./timezone.js";
import type {
  AvailabilityUnavailableReason,
  OperationalConflict,
  Practitioner,
  PractitionerAvailabilityQuery,
  PractitionerAvailabilityResult,
  PractitionerSchedule,
  PractitionerUnavailability,
  UnavailableRange,
  AvailableRange,
} from "./practitioner.js";

export interface UtcInterval {
  readonly startMs: number;
  readonly endMs: number;
}

export interface AvailabilityAppointment {
  readonly id: string;
  readonly branchId: string;
  readonly startAtUtc: string;
  readonly endAtUtc: string;
  readonly status: AppointmentStatus | Appointment["status"];
}

export interface EvaluateAvailabilityInput {
  readonly practitioner: Pick<Practitioner, "id" | "status">;
  readonly assignedBranchIds: readonly string[];
  readonly query: PractitionerAvailabilityQuery;
  readonly schedule: PractitionerSchedule | null;
  readonly unavailability: readonly PractitionerUnavailability[];
  readonly appointments: readonly AvailabilityAppointment[];
}

export function intervalsOverlap(left: UtcInterval, right: UtcInterval): boolean {
  return left.startMs < right.endMs && right.startMs < left.endMs;
}

export function subtractIntervals(base: UtcInterval, blocks: readonly UtcInterval[]): UtcInterval[] {
  let remaining: UtcInterval[] = [base];
  for (const block of blocks) {
    const next: UtcInterval[] = [];
    for (const current of remaining) {
      if (!intervalsOverlap(current, block)) {
        next.push(current);
        continue;
      }
      if (block.startMs > current.startMs) {
        next.push({ startMs: current.startMs, endMs: Math.min(block.startMs, current.endMs) });
      }
      if (block.endMs < current.endMs) {
        next.push({ startMs: Math.max(block.endMs, current.startMs), endMs: current.endMs });
      }
    }
    remaining = next.filter((interval) => interval.endMs > interval.startMs);
  }
  return remaining;
}

export function mergeIntervals(intervals: readonly UtcInterval[]): UtcInterval[] {
  const sorted = [...intervals].sort((a, b) => a.startMs - b.startMs);
  const merged: Array<{ startMs: number; endMs: number }> = [];
  for (const interval of sorted) {
    const last = merged[merged.length - 1];
    if (!last || interval.startMs > last.endMs) {
      merged.push({ startMs: interval.startMs, endMs: interval.endMs });
    } else {
      last.endMs = Math.max(last.endMs, interval.endMs);
    }
  }
  return merged;
}

export function weeklyIntervalsOverlap(
  left: { weekday: number; startMinute: number; endMinute: number },
  right: { weekday: number; startMinute: number; endMinute: number },
): boolean {
  return (
    left.weekday === right.weekday &&
    left.startMinute < right.endMinute &&
    right.startMinute < left.endMinute
  );
}

function toIso(ms: number): string {
  return new Date(ms).toISOString();
}

function activeUnavailability(records: readonly PractitionerUnavailability[]): UtcInterval[] {
  return records
    .filter((record) => record.status === "active")
    .map((record) => ({
      startMs: new Date(record.startAtUtc).getTime(),
      endMs: new Date(record.endAtUtc).getTime(),
    }));
}

function activeAppointments(records: readonly AvailabilityAppointment[]): AvailabilityAppointment[] {
  return records.filter((record) => isActiveSchedulingStatus(record.status));
}

export function operationalConflicts(input: {
  readonly practitioner: Pick<Practitioner, "id" | "status">;
  readonly assignedBranchIds: readonly string[];
  readonly unavailability: readonly PractitionerUnavailability[];
  readonly appointments: readonly AvailabilityAppointment[];
}): OperationalConflict[] {
  const assigned = new Set(input.assignedBranchIds);
  const leave = activeUnavailability(input.unavailability);
  const conflicts: OperationalConflict[] = [];
  for (const appointment of activeAppointments(input.appointments)) {
    if (input.practitioner.status !== "active") {
      conflicts.push({
        appointmentId: appointment.id,
        branchId: appointment.branchId,
        startAtUtc: appointment.startAtUtc,
        endAtUtc: appointment.endAtUtc,
        reason: "practitioner_inactive",
      });
      continue;
    }
    if (!assigned.has(appointment.branchId)) {
      conflicts.push({
        appointmentId: appointment.id,
        branchId: appointment.branchId,
        startAtUtc: appointment.startAtUtc,
        endAtUtc: appointment.endAtUtc,
        reason: "practitioner_unassigned",
      });
      continue;
    }
    const range = {
      startMs: new Date(appointment.startAtUtc).getTime(),
      endMs: new Date(appointment.endAtUtc).getTime(),
    };
    if (leave.some((interval) => intervalsOverlap(range, interval))) {
      conflicts.push({
        appointmentId: appointment.id,
        branchId: appointment.branchId,
        startAtUtc: appointment.startAtUtc,
        endAtUtc: appointment.endAtUtc,
        reason: "leave_covers_appointment",
      });
    }
  }
  return conflicts;
}

function expandWeeklyHours(
  schedule: PractitionerSchedule,
  window: UtcInterval,
): UtcInterval[] {
  const startParts = zonedParts(new Date(window.startMs), schedule.timezone);
  const endParts = zonedParts(new Date(window.endMs - 1), schedule.timezone);
  const expanded: UtcInterval[] = [];
  let cursor = { year: startParts.year, month: startParts.month, day: startParts.day };
  const last = { year: endParts.year, month: endParts.month, day: endParts.day };
  while (compareCivilDate(cursor, last) <= 0) {
    const weekday = zonedParts(
      zonedLocalToUtc(schedule.timezone, cursor.year, cursor.month, cursor.day, 12, 0) ??
        new Date(Date.UTC(cursor.year, cursor.month - 1, cursor.day, 12, 0)),
      schedule.timezone,
    ).weekday;
    for (const interval of schedule.intervals) {
      if (interval.weekday !== weekday) {
        continue;
      }
      const start = zonedLocalToUtc(
        schedule.timezone,
        cursor.year,
        cursor.month,
        cursor.day,
        Math.floor(interval.startMinute / 60),
        interval.startMinute % 60,
      );
      let end: Date | null;
      if (interval.endMinute === 1440) {
        const next = addCalendarDays(cursor.year, cursor.month, cursor.day, 1);
        end = zonedLocalToUtc(schedule.timezone, next.year, next.month, next.day, 0, 0);
      } else {
        end = zonedLocalToUtc(
          schedule.timezone,
          cursor.year,
          cursor.month,
          cursor.day,
          Math.floor(interval.endMinute / 60),
          interval.endMinute % 60,
        );
      }
      if (!start || !end || end.getTime() <= start.getTime()) {
        continue;
      }
      const clipped = {
        startMs: Math.max(start.getTime(), window.startMs),
        endMs: Math.min(end.getTime(), window.endMs),
      };
      if (clipped.endMs > clipped.startMs) {
        expanded.push(clipped);
      }
    }
    cursor = addCalendarDays(cursor.year, cursor.month, cursor.day, 1);
  }
  return mergeIntervals(expanded);
}

function coverUnavailable(
  window: UtcInterval,
  available: readonly UtcInterval[],
  classify: (interval: UtcInterval) => AvailabilityUnavailableReason,
): UnavailableRange[] {
  const holes = subtractIntervals(window, available);
  return holes.map((interval) => ({
    startAtUtc: toIso(interval.startMs),
    endAtUtc: toIso(interval.endMs),
    reason: classify(interval),
  }));
}

function classifyHole(
  interval: UtcInterval,
  working: readonly UtcInterval[],
  unavailability: readonly UtcInterval[],
  appointments: readonly UtcInterval[],
): AvailabilityUnavailableReason {
  const mid = Math.floor((interval.startMs + interval.endMs) / 2);
  const point = { startMs: mid, endMs: mid + 1 };
  if (appointments.some((block) => intervalsOverlap(point, block))) {
    return "appointment";
  }
  if (unavailability.some((block) => intervalsOverlap(point, block))) {
    return "unavailability";
  }
  if (!working.some((block) => intervalsOverlap(point, block))) {
    return "outside_hours";
  }
  if (appointments.some((block) => intervalsOverlap(interval, block))) {
    return "appointment";
  }
  if (unavailability.some((block) => intervalsOverlap(interval, block))) {
    return "unavailability";
  }
  return "outside_hours";
}

export function evaluateAvailability(input: EvaluateAvailabilityInput): PractitionerAvailabilityResult {
  const window: UtcInterval = {
    startMs: new Date(input.query.startAtUtc).getTime(),
    endMs: new Date(input.query.endAtUtc).getTime(),
  };
  const durationMs = input.query.durationMinutes * 60 * 1000;
  const conflicts = operationalConflicts(input);
  const assigned = input.assignedBranchIds.includes(input.query.branchId);

  const base = {
    practitionerId: input.practitioner.id,
    branchId: input.query.branchId,
    timezone: input.schedule?.timezone,
    durationMinutes: input.query.durationMinutes,
    windowStartAtUtc: input.query.startAtUtc,
    windowEndAtUtc: input.query.endAtUtc,
    conflicts,
  };

  if (input.practitioner.status !== "active") {
    return {
      ...base,
      available: [],
      unavailable: [
        {
          startAtUtc: input.query.startAtUtc,
          endAtUtc: input.query.endAtUtc,
          reason: "practitioner_inactive",
        },
      ],
    };
  }

  if (!assigned) {
    return {
      ...base,
      available: [],
      unavailable: [
        {
          startAtUtc: input.query.startAtUtc,
          endAtUtc: input.query.endAtUtc,
          reason: "practitioner_unassigned",
        },
      ],
    };
  }

  const working = input.schedule ? expandWeeklyHours(input.schedule, window) : [];
  const leave = activeUnavailability(input.unavailability);
  const booked = activeAppointments(input.appointments)
    .filter((appointment) => appointment.branchId === input.query.branchId)
    .map((appointment) => ({
      startMs: new Date(appointment.startAtUtc).getTime(),
      endMs: new Date(appointment.endAtUtc).getTime(),
    }));
  const blockers = [...leave, ...booked];
  const free: UtcInterval[] = [];
  for (const interval of working) {
    free.push(...subtractIntervals(interval, blockers));
  }
  const mergedFree = mergeIntervals(free);
  const available: AvailableRange[] = mergedFree
    .filter((interval) => interval.endMs - interval.startMs >= durationMs)
    .map((interval) => ({
      startAtUtc: toIso(interval.startMs),
      endAtUtc: toIso(interval.endMs),
    }));
  const availableForCover = available.map((range) => ({
    startMs: new Date(range.startAtUtc).getTime(),
    endMs: new Date(range.endAtUtc).getTime(),
  }));
  const unavailable = coverUnavailable(window, availableForCover, (interval) =>
    classifyHole(interval, working, leave, booked),
  );

  return {
    ...base,
    available,
    unavailable,
  };
}
