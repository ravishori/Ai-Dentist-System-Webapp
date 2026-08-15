import type {
  AppointmentRepository,
  NotificationDeliveryPort,
  NotificationOutboxRecord,
  NotificationOutboxRepository,
  PatientRepository,
} from "@dentalcare/domain";
import { evaluateRecipientEligibility } from "./eligibility.js";
import { isTerminalAttempt, nextRetryAt } from "./retry.js";
import {
  assertTemplatePrivacy,
  isSupportedOutboxEvent,
  renderAppointmentEmail,
} from "./templates.js";

export interface NotificationProcessorLogger {
  info(message: string, fields?: Record<string, unknown>): void;
  warn(message: string, fields?: Record<string, unknown>): void;
  error(message: string, fields?: Record<string, unknown>): void;
}

export interface NotificationProcessorOptions {
  readonly outbox: NotificationOutboxRepository;
  readonly appointments: AppointmentRepository;
  readonly patients: PatientRepository;
  readonly delivery: NotificationDeliveryPort;
  readonly logger: NotificationProcessorLogger;
  readonly workerId: string;
  readonly leaseMs: number;
  readonly batchSize?: number;
  now?: () => Date;
}

export class NotificationOutboxProcessor {
  constructor(private readonly options: NotificationProcessorOptions) {}

  async processBatch(): Promise<number> {
    const now = this.clock();
    const claimed = await this.options.outbox.claimDue({
      limit: this.options.batchSize ?? 10,
      leaseMs: this.options.leaseMs,
      workerId: this.options.workerId,
      now,
    });
    for (const record of claimed) {
      await this.processClaimed(record);
    }
    return claimed.length;
  }

  async processClaimed(record: NotificationOutboxRecord): Promise<void> {
    const now = this.clock();
    const logFields = {
      organizationId: record.organizationId,
      outboxId: record.id,
      eventType: record.eventType,
      attemptCount: record.attemptCount,
      state: record.status,
    };
    try {
      if (record.providerMessageId && record.status === "processing") {
        await this.options.outbox.markSent(
          record.organizationId,
          record.id,
          record.providerMessageId,
          now,
        );
        this.options.logger.info("notification_deliver", {
          ...logFields,
          state: "sent",
        });
        return;
      }

      if (!isSupportedOutboxEvent(record.eventType)) {
        await this.fail(record, "unknown_event", now, logFields);
        return;
      }

      const appointment = await this.options.appointments.findByOrganizationAndId(
        record.organizationId,
        record.appointmentId,
      );
      if (!appointment) {
        await this.fail(record, "appointment_missing", now, logFields);
        return;
      }

      const patient = await this.options.patients.findByOrganizationAndId(
        record.organizationId,
        appointment.patientId,
      );
      if (!patient) {
        await this.fail(record, "patient_missing", now, logFields);
        return;
      }

      const eligibility = evaluateRecipientEligibility(patient);
      if (!eligibility.ok) {
        await this.suppress(record, eligibility.code, now, logFields);
        return;
      }

      const rendered = renderAppointmentEmail({
        eventType: record.eventType,
        patient,
        appointment,
      });
      assertTemplatePrivacy(rendered.subject);
      assertTemplatePrivacy(rendered.textBody);

      const result = await this.options.delivery.deliver({
        channel: "email",
        idempotencyKey: record.id,
        toAddress: eligibility.email,
        subject: rendered.subject,
        textBody: rendered.textBody,
      });

      if (result.outcome === "accepted") {
        await this.options.outbox.markSent(
          record.organizationId,
          record.id,
          result.providerMessageId,
          this.clock(),
        );
        await this.options.outbox.recordAudit({
          organizationId: record.organizationId,
          outboxId: record.id,
          action: "notification.deliver",
          outcome: "allowed",
        });
        this.options.logger.info("notification_deliver", {
          ...logFields,
          state: "sent",
          providerMessageId: result.providerMessageId,
        });
        return;
      }

      if (result.outcome === "transient_failure") {
        await this.retryOrFail(record, result.errorCategory ?? "provider_transient", logFields);
        return;
      }

      await this.fail(
        record,
        result.errorCategory ?? "provider_permanent",
        this.clock(),
        logFields,
      );
    } catch {
      await this.retryOrFail(record, "provider_transient", logFields);
    }
  }

  private async suppress(
    record: NotificationOutboxRecord,
    errorCategory: string,
    now: Date,
    logFields: Record<string, unknown>,
  ): Promise<void> {
    await this.options.outbox.markSuppressed(record.organizationId, record.id, errorCategory, now);
    await this.options.outbox.recordAudit({
      organizationId: record.organizationId,
      outboxId: record.id,
      action: "notification.suppress",
      outcome: "denied",
      reason: errorCategory,
    });
    this.options.logger.info("notification_suppress", {
      ...logFields,
      state: "suppressed",
      errorCategory,
    });
  }

  private async fail(
    record: NotificationOutboxRecord,
    errorCategory: string,
    now: Date,
    logFields: Record<string, unknown>,
  ): Promise<void> {
    await this.options.outbox.markFailedTerminal(
      record.organizationId,
      record.id,
      errorCategory,
      now,
    );
    await this.options.outbox.recordAudit({
      organizationId: record.organizationId,
      outboxId: record.id,
      action: "notification.fail",
      outcome: "failed",
      reason: errorCategory,
    });
    this.options.logger.warn("notification_fail", {
      ...logFields,
      state: "failed_terminal",
      errorCategory,
    });
  }

  private async retryOrFail(
    record: NotificationOutboxRecord,
    errorCategory: string,
    logFields: Record<string, unknown>,
  ): Promise<void> {
    const now = this.clock();
    if (isTerminalAttempt(record.attemptCount)) {
      await this.fail(record, errorCategory, now, logFields);
      return;
    }
    const retryAt = nextRetryAt(record.attemptCount, now);
    if (!retryAt) {
      await this.fail(record, errorCategory, now, logFields);
      return;
    }
    await this.options.outbox.scheduleRetry(
      record.organizationId,
      record.id,
      errorCategory,
      retryAt,
    );
    this.options.logger.info("notification_retry", {
      ...logFields,
      state: "pending",
      errorCategory,
      nextAttemptAt: retryAt.toISOString(),
    });
  }

  private clock(): Date {
    return this.options.now ? this.options.now() : new Date();
  }
}
