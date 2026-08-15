import type {
  NotificationDeliveryPort,
  NotificationDeliveryResult,
  NotificationMessage,
} from "@dentalcare/domain";

/**
 * In-memory adapter for automated tests and local dry-run.
 * Never opens a network socket. Duplicate idempotency keys do not send again.
 */
export class FakeNotificationAdapter implements NotificationDeliveryPort {
  readonly deliveries: Array<{
    idempotencyKey: string;
    channel: "email";
    toAddress: string;
    subject: string;
    textBody: string;
    providerMessageId: string;
  }> = [];
  nextOutcome: NotificationDeliveryResult = {
    outcome: "accepted",
    providerMessageId: "fake-msg-1",
  };
  private readonly accepted = new Map<string, NotificationDeliveryResult>();
  private sequence = 0;

  async deliver(message: NotificationMessage): Promise<NotificationDeliveryResult> {
    const existing = this.accepted.get(message.idempotencyKey);
    if (existing) {
      return existing;
    }
    if (this.nextOutcome.outcome !== "accepted") {
      return this.nextOutcome;
    }
    this.sequence += 1;
    const providerMessageId = this.nextOutcome.providerMessageId ?? `fake-msg-${this.sequence}`;
    const result: NotificationDeliveryResult = { outcome: "accepted", providerMessageId };
    this.accepted.set(message.idempotencyKey, result);
    this.deliveries.push({
      idempotencyKey: message.idempotencyKey,
      channel: message.channel,
      toAddress: message.toAddress,
      subject: message.subject,
      textBody: message.textBody,
      providerMessageId,
    });
    return result;
  }

  uniqueSendCount(): number {
    return this.deliveries.length;
  }
}
