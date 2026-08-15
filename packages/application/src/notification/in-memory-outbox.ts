import type {
  NotificationAuditInput,
  NotificationOutboxRecord,
  NotificationOutboxRepository,
  OutboxClaimOptions,
  OutboxStatus,
} from "@dentalcare/domain";
import { isOutboxStatus } from "@dentalcare/domain";

export class InMemoryNotificationOutboxRepository implements NotificationOutboxRepository {
  readonly records = new Map<string, NotificationOutboxRecord>();
  readonly audit: NotificationAuditInput[] = [];
  failLookups = false;
  private sequence = 0;
  private chain: Promise<unknown> = Promise.resolve();

  seed(record: NotificationOutboxRecord): NotificationOutboxRecord {
    this.records.set(record.id, record);
    return record;
  }

  createPending(input: {
    organizationId: string;
    appointmentId: string;
    eventType: string;
    now?: Date;
  }): NotificationOutboxRecord {
    this.sequence += 1;
    const now = (input.now ?? new Date()).toISOString();
    const record: NotificationOutboxRecord = {
      id: `outbox_${this.sequence}`,
      organizationId: input.organizationId,
      appointmentId: input.appointmentId,
      eventType: input.eventType,
      status: "pending",
      attemptCount: 0,
      createdAt: now,
      nextAttemptAt: now,
    };
    this.records.set(record.id, record);
    return record;
  }

  async claimDue(options: OutboxClaimOptions): Promise<readonly NotificationOutboxRecord[]> {
    return this.exclusive(async () => {
      this.assertAvailable();
      const nowMs = options.now.getTime();
      const due = [...this.records.values()]
        .filter((row) => isClaimable(row, nowMs))
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
        .slice(0, options.limit);
      const claimed: NotificationOutboxRecord[] = [];
      for (const row of due) {
        const updated: NotificationOutboxRecord = {
          ...row,
          status: "processing",
          attemptCount: row.attemptCount + 1,
          claimedAt: options.now.toISOString(),
          claimedUntil: new Date(nowMs + options.leaseMs).toISOString(),
          claimedBy: options.workerId,
        };
        this.records.set(row.id, updated);
        claimed.push(updated);
      }
      return claimed;
    });
  }

  async findByOrganizationAndId(
    organizationId: string,
    outboxId: string,
  ): Promise<NotificationOutboxRecord | null> {
    this.assertAvailable();
    const record = this.records.get(outboxId);
    if (!record || record.organizationId !== organizationId) {
      return null;
    }
    return record;
  }

  async markSent(
    organizationId: string,
    outboxId: string,
    providerMessageId: string | undefined,
    now: Date,
  ): Promise<NotificationOutboxRecord | null> {
    return this.complete(organizationId, outboxId, "sent", undefined, providerMessageId, now);
  }

  async markSuppressed(
    organizationId: string,
    outboxId: string,
    errorCategory: string,
    now: Date,
  ): Promise<NotificationOutboxRecord | null> {
    return this.complete(organizationId, outboxId, "suppressed", errorCategory, undefined, now);
  }

  async markFailedTerminal(
    organizationId: string,
    outboxId: string,
    errorCategory: string,
    now: Date,
  ): Promise<NotificationOutboxRecord | null> {
    return this.complete(
      organizationId,
      outboxId,
      "failed_terminal",
      errorCategory,
      undefined,
      now,
    );
  }

  async scheduleRetry(
    organizationId: string,
    outboxId: string,
    errorCategory: string,
    nextAttemptAt: Date,
  ): Promise<NotificationOutboxRecord | null> {
    return this.exclusive(async () => {
      this.assertAvailable();
      const existing = await this.findByOrganizationAndId(organizationId, outboxId);
      if (!existing) {
        return null;
      }
      const updated: NotificationOutboxRecord = {
        ...existing,
        status: "pending",
        lastErrorCode: errorCategory,
        nextAttemptAt: nextAttemptAt.toISOString(),
        claimedAt: undefined,
        claimedUntil: undefined,
        claimedBy: undefined,
      };
      this.records.set(outboxId, updated);
      return updated;
    });
  }

  async recordAudit(input: NotificationAuditInput): Promise<void> {
    this.audit.push(input);
  }

  private async complete(
    organizationId: string,
    outboxId: string,
    status: OutboxStatus,
    errorCategory: string | undefined,
    providerMessageId: string | undefined,
    now: Date,
  ): Promise<NotificationOutboxRecord | null> {
    return this.exclusive(async () => {
      this.assertAvailable();
      const existing = await this.findByOrganizationAndId(organizationId, outboxId);
      if (!existing) {
        return null;
      }
      const updated: NotificationOutboxRecord = {
        ...existing,
        status,
        lastErrorCode: errorCategory,
        providerMessageId: providerMessageId ?? existing.providerMessageId,
        processedAt: now.toISOString(),
        claimedAt: undefined,
        claimedUntil: undefined,
        claimedBy: undefined,
      };
      this.records.set(outboxId, updated);
      return updated;
    });
  }

  private assertAvailable(): void {
    if (this.failLookups) {
      throw new Error("notification_outbox_unavailable");
    }
  }

  private async exclusive<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.chain.then(fn, fn);
    this.chain = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }
}

function isClaimable(row: NotificationOutboxRecord, nowMs: number): boolean {
  if (!isOutboxStatus(row.status)) {
    return false;
  }
  if (new Date(row.nextAttemptAt).getTime() > nowMs) {
    return false;
  }
  if (row.status === "pending") {
    return true;
  }
  if (
    row.status === "processing" &&
    row.claimedUntil &&
    new Date(row.claimedUntil).getTime() <= nowMs
  ) {
    return true;
  }
  return false;
}
