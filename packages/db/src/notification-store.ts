import type { Prisma, PrismaClient } from "@prisma/client";
import type {
  NotificationAuditInput,
  NotificationOutboxRecord,
  NotificationOutboxRepository,
  OutboxClaimOptions,
} from "@dentalcare/domain";
import { isOutboxStatus } from "@dentalcare/domain";

type OutboxRow = {
  id: string;
  organizationId: string;
  appointmentId: string;
  eventType: string;
  status: string;
  attemptCount: number;
  createdAt: Date;
  claimedAt: Date | null;
  claimedUntil: Date | null;
  claimedBy: string | null;
  nextAttemptAt: Date;
  processedAt: Date | null;
  lastErrorCode: string | null;
  providerMessageId: string | null;
};

export class PrismaNotificationOutboxRepository implements NotificationOutboxRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async claimDue(options: OutboxClaimOptions): Promise<readonly NotificationOutboxRecord[]> {
    const claimedUntil = new Date(options.now.getTime() + options.leaseMs);
    const rows = await this.prisma.$queryRaw<OutboxRow[]>`
      UPDATE notification_outbox AS n
      SET
        status = 'processing',
        "attemptCount" = n."attemptCount" + 1,
        "claimedAt" = ${options.now},
        "claimedUntil" = ${claimedUntil},
        "claimedBy" = ${options.workerId}
      FROM (
        SELECT id
        FROM notification_outbox
        WHERE (
            status = 'pending'
            OR (
              status = 'processing'
              AND "claimedUntil" IS NOT NULL
              AND "claimedUntil" <= ${options.now}
            )
          )
          AND "nextAttemptAt" <= ${options.now}
        ORDER BY "createdAt" ASC
        LIMIT ${options.limit}
        FOR UPDATE SKIP LOCKED
      ) AS due
      WHERE n.id = due.id
      RETURNING
        n.id,
        n."organizationId",
        n."appointmentId",
        n."eventType",
        n.status,
        n."attemptCount",
        n."createdAt",
        n."claimedAt",
        n."claimedUntil",
        n."claimedBy",
        n."nextAttemptAt",
        n."processedAt",
        n."lastErrorCode",
        n."providerMessageId"
    `;
    return rows.map(toRecord);
  }

  async findByOrganizationAndId(
    organizationId: string,
    outboxId: string,
  ): Promise<NotificationOutboxRecord | null> {
    const record = await this.prisma.notificationOutbox.findFirst({
      where: { id: outboxId, organizationId },
    });
    return record ? toRecord(record) : null;
  }

  async markSent(
    organizationId: string,
    outboxId: string,
    providerMessageId: string | undefined,
    now: Date,
  ): Promise<NotificationOutboxRecord | null> {
    return this.complete(organizationId, outboxId, {
      status: "sent",
      processedAt: now,
      providerMessageId: providerMessageId ?? null,
      claimedAt: null,
      claimedUntil: null,
      claimedBy: null,
    });
  }

  async markSuppressed(
    organizationId: string,
    outboxId: string,
    errorCategory: string,
    now: Date,
  ): Promise<NotificationOutboxRecord | null> {
    return this.complete(organizationId, outboxId, {
      status: "suppressed",
      processedAt: now,
      lastErrorCode: errorCategory,
      claimedAt: null,
      claimedUntil: null,
      claimedBy: null,
    });
  }

  async markFailedTerminal(
    organizationId: string,
    outboxId: string,
    errorCategory: string,
    now: Date,
  ): Promise<NotificationOutboxRecord | null> {
    return this.complete(organizationId, outboxId, {
      status: "failed_terminal",
      processedAt: now,
      lastErrorCode: errorCategory,
      claimedAt: null,
      claimedUntil: null,
      claimedBy: null,
    });
  }

  async scheduleRetry(
    organizationId: string,
    outboxId: string,
    errorCategory: string,
    nextAttemptAt: Date,
  ): Promise<NotificationOutboxRecord | null> {
    return this.complete(organizationId, outboxId, {
      status: "pending",
      lastErrorCode: errorCategory,
      nextAttemptAt,
      claimedAt: null,
      claimedUntil: null,
      claimedBy: null,
    });
  }

  async recordAudit(input: NotificationAuditInput): Promise<void> {
    await this.prisma.securityEvent.create({
      data: {
        organizationId: input.organizationId,
        action: input.action,
        outcome: input.outcome,
        reason: input.reason,
      },
    });
  }

  private async complete(
    organizationId: string,
    outboxId: string,
    data: Prisma.NotificationOutboxUpdateManyMutationInput,
  ): Promise<NotificationOutboxRecord | null> {
    const result = await this.prisma.notificationOutbox.updateMany({
      where: { id: outboxId, organizationId },
      data,
    });
    if (result.count !== 1) {
      return null;
    }
    return this.findByOrganizationAndId(organizationId, outboxId);
  }
}

function toRecord(record: OutboxRow): NotificationOutboxRecord {
  return {
    id: record.id,
    organizationId: record.organizationId,
    appointmentId: record.appointmentId,
    eventType: record.eventType,
    status: isOutboxStatus(record.status) ? record.status : "pending",
    attemptCount: record.attemptCount,
    createdAt: record.createdAt.toISOString(),
    claimedAt: record.claimedAt?.toISOString(),
    claimedUntil: record.claimedUntil?.toISOString(),
    claimedBy: record.claimedBy ?? undefined,
    nextAttemptAt: record.nextAttemptAt.toISOString(),
    processedAt: record.processedAt?.toISOString(),
    lastErrorCode: record.lastErrorCode ?? undefined,
    providerMessageId: record.providerMessageId ?? undefined,
  };
}
