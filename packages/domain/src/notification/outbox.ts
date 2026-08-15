import type { OutboxEventType } from "../appointment/history.js";

export const OUTBOX_STATUSES = [
  "pending",
  "processing",
  "sent",
  "suppressed",
  "failed_terminal",
] as const;

export type OutboxStatus = (typeof OUTBOX_STATUSES)[number];

export function isOutboxStatus(value: string): value is OutboxStatus {
  return (OUTBOX_STATUSES as readonly string[]).includes(value);
}

export const NOTIFICATION_MAX_ATTEMPTS = 5;

/** Waits after transient failures 1–4 before attempts 2–5. The fifth value is the unused sixth-attempt cap. */
export const NOTIFICATION_RETRY_DELAYS_MS = [
  60_000,
  5 * 60_000,
  30 * 60_000,
  2 * 60 * 60_000,
  6 * 60 * 60_000,
] as const;

export const NOTIFICATION_ERROR_CATEGORIES = [
  "consent_missing",
  "opted_out",
  "inactive_patient",
  "missing_email",
  "invalid_email",
  "unknown_event",
  "appointment_missing",
  "patient_missing",
  "validation_rejected",
  "provider_permanent",
  "provider_transient",
  "delivery_disabled",
] as const;

export type NotificationErrorCategory = (typeof NOTIFICATION_ERROR_CATEGORIES)[number];

export interface NotificationOutboxRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly appointmentId: string;
  readonly eventType: OutboxEventType | string;
  readonly status: OutboxStatus;
  readonly attemptCount: number;
  readonly createdAt: string;
  readonly claimedAt?: string;
  readonly claimedUntil?: string;
  readonly claimedBy?: string;
  readonly nextAttemptAt: string;
  readonly processedAt?: string;
  readonly lastErrorCode?: string;
  readonly providerMessageId?: string;
}

export interface OutboxClaimOptions {
  readonly limit: number;
  readonly leaseMs: number;
  readonly workerId: string;
  readonly now: Date;
}

export interface NotificationAuditInput {
  readonly organizationId: string;
  readonly outboxId: string;
  readonly action: "notification.deliver" | "notification.suppress" | "notification.fail";
  readonly outcome: "allowed" | "denied" | "failed";
  readonly reason?: string;
}

export interface NotificationOutboxRepository {
  claimDue(options: OutboxClaimOptions): Promise<readonly NotificationOutboxRecord[]>;
  findByOrganizationAndId(
    organizationId: string,
    outboxId: string,
  ): Promise<NotificationOutboxRecord | null>;
  markSent(
    organizationId: string,
    outboxId: string,
    providerMessageId: string | undefined,
    now: Date,
  ): Promise<NotificationOutboxRecord | null>;
  markSuppressed(
    organizationId: string,
    outboxId: string,
    errorCategory: string,
    now: Date,
  ): Promise<NotificationOutboxRecord | null>;
  markFailedTerminal(
    organizationId: string,
    outboxId: string,
    errorCategory: string,
    now: Date,
  ): Promise<NotificationOutboxRecord | null>;
  scheduleRetry(
    organizationId: string,
    outboxId: string,
    errorCategory: string,
    nextAttemptAt: Date,
  ): Promise<NotificationOutboxRecord | null>;
  recordAudit(input: NotificationAuditInput): Promise<void>;
}
