/**
 * Provider-neutral notification delivery port (M5-02).
 * Implementations must not leak HTTP, Prisma, SMTP-library, or vendor SDK types.
 */
export type NotificationChannel = "email";

export type NotificationDeliveryOutcome = "accepted" | "rejected" | "transient_failure";

export interface NotificationMessage {
  readonly channel: NotificationChannel;
  readonly idempotencyKey: string;
  readonly toAddress: string;
  readonly subject: string;
  readonly textBody: string;
}

export interface NotificationDeliveryResult {
  readonly outcome: NotificationDeliveryOutcome;
  readonly providerMessageId?: string;
  readonly errorCategory?: string;
}

export interface NotificationDeliveryPort {
  deliver(message: NotificationMessage): Promise<NotificationDeliveryResult>;
}
