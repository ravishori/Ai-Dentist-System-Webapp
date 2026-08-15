import type {
  NotificationDeliveryPort,
  NotificationDeliveryResult,
  NotificationMessage,
} from "@dentalcare/domain";

/** Fail-closed adapter: no provider call and no delivery attempt. */
export class FailClosedNotificationAdapter implements NotificationDeliveryPort {
  readonly reason: string;
  callCount = 0;

  constructor(reason = "delivery_disabled") {
    this.reason = reason;
  }

  async deliver(_message: NotificationMessage): Promise<NotificationDeliveryResult> {
    this.callCount += 1;
    return { outcome: "rejected", errorCategory: "delivery_disabled" };
  }
}
