/** Notification domain boundary. M5 implements email delivery of appointment outbox intents. */
export const NOTIFICATION_BOUNDARY = "notification" as const;

export type {
  NotificationChannel,
  NotificationDeliveryOutcome,
  NotificationMessage,
  NotificationDeliveryResult,
  NotificationDeliveryPort,
} from "./delivery-port.js";
export {
  OUTBOX_STATUSES,
  isOutboxStatus,
  NOTIFICATION_MAX_ATTEMPTS,
  NOTIFICATION_RETRY_DELAYS_MS,
  NOTIFICATION_ERROR_CATEGORIES,
  type OutboxStatus,
  type NotificationErrorCategory,
  type NotificationOutboxRecord,
  type OutboxClaimOptions,
  type NotificationAuditInput,
  type NotificationOutboxRepository,
} from "./outbox.js";
