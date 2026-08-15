import type { AppConfig } from "@dentalcare/config";
import type { NotificationDeliveryPort } from "@dentalcare/domain";
import { FakeNotificationAdapter } from "./fake-adapter.js";
import { FailClosedNotificationAdapter } from "./fail-closed-adapter.js";
import { resolveNotificationDelivery } from "./delivery-config.js";
import { SmtpNotificationAdapter, createNodemailerTransport } from "./smtp-adapter.js";

export async function createNotificationDeliveryPort(
  config: AppConfig,
): Promise<NotificationDeliveryPort> {
  const decision = resolveNotificationDelivery(config);
  if (decision.mode === "fake") {
    return new FakeNotificationAdapter();
  }
  if (decision.mode === "smtp" && decision.smtp) {
    const transport = await createNodemailerTransport(decision.smtp);
    return new SmtpNotificationAdapter(transport, decision.smtp);
  }
  return new FailClosedNotificationAdapter(decision.reason ?? "delivery_disabled");
}
