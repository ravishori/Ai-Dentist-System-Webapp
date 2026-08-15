import type { Appointment, OutboxEventType, Patient } from "@dentalcare/domain";
import { OUTBOX_EVENT_TYPES } from "@dentalcare/domain";

const SUBJECTS: Record<OutboxEventType, string> = {
  "appointment.created": "Appointment scheduled",
  "appointment.rescheduled": "Appointment rescheduled",
  "appointment.cancelled": "Appointment cancelled",
};

const ACTIONS: Record<OutboxEventType, string> = {
  "appointment.created": "scheduled",
  "appointment.rescheduled": "rescheduled",
  "appointment.cancelled": "cancelled",
};

export function isSupportedOutboxEvent(value: string): value is OutboxEventType {
  return (OUTBOX_EVENT_TYPES as readonly string[]).includes(value);
}

export function renderAppointmentEmail(input: {
  eventType: OutboxEventType;
  patient: Patient;
  appointment: Appointment;
}): { subject: string; textBody: string } {
  const localStart = formatLocal(input.appointment.startAtUtc, input.appointment.timezone);
  const localEnd = formatLocal(input.appointment.endAtUtc, input.appointment.timezone);
  const firstName = input.patient.firstName;
  const action = ACTIONS[input.eventType];
  return {
    subject: SUBJECTS[input.eventType],
    textBody: `Hello ${firstName}, your appointment ${action} for ${localStart}–${localEnd} (${input.appointment.timezone}).`,
  };
}

function formatLocal(isoUtc: string, timezone: string): string {
  try {
    return new Intl.DateTimeFormat("en-GB", {
      timeZone: timezone,
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(isoUtc));
  } catch {
    return isoUtc;
  }
}

const FORBIDDEN_TEMPLATE = /(diagnos|treatment|histor|payment|token|password|dob|date of birth)/i;

export function assertTemplatePrivacy(text: string): void {
  if (FORBIDDEN_TEMPLATE.test(text)) {
    throw new Error("template_privacy_violation");
  }
}
