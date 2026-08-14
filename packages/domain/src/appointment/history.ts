export const APPOINTMENT_HISTORY_EVENTS = ["created", "rescheduled", "cancelled"] as const;

export type AppointmentHistoryEvent = (typeof APPOINTMENT_HISTORY_EVENTS)[number];

export interface AppointmentHistoryRecord {
  readonly id: string;
  readonly appointmentId: string;
  readonly organizationId: string;
  readonly eventType: AppointmentHistoryEvent;
  readonly fromStatus?: string;
  readonly toStatus: string;
  readonly actorUserId: string;
  readonly createdAt: string;
}

export const OUTBOX_EVENT_TYPES = [
  "appointment.created",
  "appointment.rescheduled",
  "appointment.cancelled",
] as const;

export type OutboxEventType = (typeof OUTBOX_EVENT_TYPES)[number];

export interface NotificationOutboxIntent {
  readonly id: string;
  readonly organizationId: string;
  readonly appointmentId: string;
  readonly eventType: OutboxEventType;
  readonly status: "pending";
  readonly createdAt: string;
}
