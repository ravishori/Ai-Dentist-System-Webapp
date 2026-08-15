/**
 * Notification application services. M5 delivers appointment outbox intents by email.
 * Provider calls must never execute inside the originating business transaction.
 */
export const NOTIFICATION_APPLICATION = "notification" as const;

export { resolveNotificationDelivery, notificationFlagEnabled } from "./delivery-config.js";
export type {
  NotificationDeliveryMode,
  NotificationDeliveryDecision,
  SmtpSettings,
} from "./delivery-config.js";
export { FakeNotificationAdapter } from "./fake-adapter.js";
export { FailClosedNotificationAdapter } from "./fail-closed-adapter.js";
export { SmtpNotificationAdapter, classifySmtpError } from "./smtp-adapter.js";
export type { SmtpTransport, SmtpMailRequest } from "./smtp-adapter.js";
export { createNotificationDeliveryPort } from "./create-delivery.js";
export { evaluateRecipientEligibility } from "./eligibility.js";
export type { EligibilityResult, EligibilityFailure } from "./eligibility.js";
export { renderAppointmentEmail, isSupportedOutboxEvent } from "./templates.js";
export { nextRetryAt, isTerminalAttempt } from "./retry.js";
export { InMemoryNotificationOutboxRepository } from "./in-memory-outbox.js";
export { NotificationOutboxProcessor } from "./processor.js";
export type { NotificationProcessorLogger, NotificationProcessorOptions } from "./processor.js";
export { NotificationApplicationService, toPublicNotification } from "./service.js";
export { handleNotificationGet } from "./http.js";
