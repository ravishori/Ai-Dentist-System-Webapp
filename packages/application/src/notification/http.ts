import type { AuthenticatedIdentity } from "@dentalcare/domain";
import { toPublicNotification, type NotificationApplicationService } from "./service.js";

export interface NotificationHttpResult {
  readonly status: number;
  readonly headers: Record<string, string>;
  readonly body: Record<string, unknown>;
}

const JSON_HEADERS = { "content-type": "application/json" };

export async function handleNotificationGet(
  service: NotificationApplicationService,
  input: {
    identity: AuthenticatedIdentity | null;
    organizationId?: string;
    outboxId?: string;
  },
): Promise<NotificationHttpResult> {
  const result = await service.get(input.identity, input.organizationId, input.outboxId);
  if (!result.ok) {
    return {
      status: result.status,
      headers: JSON_HEADERS,
      body: { error: result.error, message: result.message },
    };
  }
  return {
    status: result.status,
    headers: JSON_HEADERS,
    body: { notification: toPublicNotification(result.data) },
  };
}
