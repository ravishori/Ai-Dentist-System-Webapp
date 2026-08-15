import type {
  AuthenticatedIdentity,
  AuthorizationPort,
  NotificationOutboxRecord,
  NotificationOutboxRepository,
} from "@dentalcare/domain";

export type NotificationServiceFailure = {
  readonly ok: false;
  readonly status: 401 | 403 | 404 | 400 | 503;
  readonly error: "unauthenticated" | "forbidden" | "not_found" | "invalid_input" | "unavailable";
  readonly message: string;
};

export type NotificationServiceSuccess<T> = {
  readonly ok: true;
  readonly status: 200;
  readonly data: T;
};

export type NotificationServiceResult<T> =
  | NotificationServiceSuccess<T>
  | NotificationServiceFailure;

export class NotificationApplicationService {
  constructor(
    private readonly authorization: AuthorizationPort,
    private readonly outbox: NotificationOutboxRepository,
  ) {}

  async get(
    identity: AuthenticatedIdentity | null,
    organizationId: string | undefined,
    outboxId: string | undefined,
  ): Promise<NotificationServiceResult<NotificationOutboxRecord>> {
    if (!identity) {
      return {
        ok: false,
        status: 401,
        error: "unauthenticated",
        message: "Authentication required.",
      };
    }
    const id = typeof outboxId === "string" ? outboxId.trim() : "";
    if (!id) {
      return {
        ok: false,
        status: 400,
        error: "invalid_input",
        message: "Notification input was invalid.",
      };
    }
    try {
      const decision = await this.authorization.authorize({
        principalUserId: identity.userId,
        sessionUserId: identity.userId,
        requestedOrganizationId: organizationId,
        permission: "notification.read",
      });
      if (!decision.allowed || !decision.context?.organizationId) {
        return {
          ok: false,
          status: decision.reason === "unauthenticated" ? 401 : 403,
          error: decision.reason === "unauthenticated" ? "unauthenticated" : "forbidden",
          message:
            decision.reason === "unauthenticated"
              ? "Authentication required."
              : "Authorization denied.",
        };
      }
      const record = await this.outbox.findByOrganizationAndId(decision.context.organizationId, id);
      if (!record) {
        return {
          ok: false,
          status: 404,
          error: "not_found",
          message: "Notification was not found.",
        };
      }
      return { ok: true, status: 200, data: record };
    } catch {
      return {
        ok: false,
        status: 503,
        error: "unavailable",
        message: "Notification service is temporarily unavailable.",
      };
    }
  }
}

export function toPublicNotification(record: NotificationOutboxRecord): Record<string, unknown> {
  const body: Record<string, unknown> = {
    id: record.id,
    organizationId: record.organizationId,
    appointmentId: record.appointmentId,
    eventType: record.eventType,
    status: record.status,
    attemptCount: record.attemptCount,
    createdAt: record.createdAt,
    nextAttemptAt: record.nextAttemptAt,
  };
  if (record.claimedAt) body.claimedAt = record.claimedAt;
  if (record.processedAt) body.processedAt = record.processedAt;
  if (record.providerMessageId) body.providerMessageId = record.providerMessageId;
  if (record.lastErrorCode) body.errorCategory = record.lastErrorCode;
  return body;
}
