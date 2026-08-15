import type {
  NotificationDeliveryPort,
  NotificationDeliveryResult,
  NotificationMessage,
} from "@dentalcare/domain";
import type { SmtpSettings } from "./delivery-config.js";

export interface SmtpMailRequest {
  readonly from: string;
  readonly to: string;
  readonly subject: string;
  readonly text: string;
  readonly messageId: string;
  readonly idempotencyKey: string;
}

export interface SmtpTransport {
  sendMail(mail: SmtpMailRequest): Promise<{ messageId?: string }>;
}

const TRANSIENT_CODES = new Set([
  "ETIMEDOUT",
  "ECONNREFUSED",
  "ECONNRESET",
  "ESOCKET",
  "ECONNECTION",
  "ETLS",
  "EAI_AGAIN",
  "EPIPE",
]);

/**
 * SMTP adapter. Domain/application callers depend only on NotificationDeliveryPort.
 * Nodemailer types stay inside the transport factory.
 */
export class SmtpNotificationAdapter implements NotificationDeliveryPort {
  private readonly accepted = new Map<string, NotificationDeliveryResult>();

  constructor(
    private readonly transport: SmtpTransport,
    private readonly settings: SmtpSettings,
  ) {}

  async deliver(message: NotificationMessage): Promise<NotificationDeliveryResult> {
    const existing = this.accepted.get(message.idempotencyKey);
    if (existing) {
      return existing;
    }
    const from = this.settings.fromName
      ? `${this.settings.fromName} <${this.settings.fromAddress}>`
      : this.settings.fromAddress;
    try {
      const info = await this.transport.sendMail({
        from,
        to: message.toAddress,
        subject: message.subject,
        text: message.textBody,
        messageId: `<${message.idempotencyKey}@${this.settings.fromDomain}>`,
        idempotencyKey: message.idempotencyKey,
      });
      const result: NotificationDeliveryResult = {
        outcome: "accepted",
        providerMessageId: sanitizeProviderMessageId(info.messageId),
      };
      this.accepted.set(message.idempotencyKey, result);
      return result;
    } catch (error) {
      return classifySmtpError(error);
    }
  }
}

export function classifySmtpError(error: unknown): NotificationDeliveryResult {
  const code = errorCode(error);
  const responseCode = numericResponse(error);
  if (TRANSIENT_CODES.has(code) || isTransientResponse(responseCode)) {
    return { outcome: "transient_failure", errorCategory: "provider_transient" };
  }
  return { outcome: "rejected", errorCategory: "provider_permanent" };
}

function errorCode(error: unknown): string {
  if (error && typeof error === "object" && "code" in error) {
    const value = (error as { code?: unknown }).code;
    return typeof value === "string" ? value : "";
  }
  return "";
}

function numericResponse(error: unknown): number | undefined {
  if (error && typeof error === "object" && "responseCode" in error) {
    const value = (error as { responseCode?: unknown }).responseCode;
    return typeof value === "number" ? value : undefined;
  }
  return undefined;
}

function isTransientResponse(code: number | undefined): boolean {
  return code === 421 || code === 450 || code === 451 || code === 452 || code === 429;
}

function sanitizeProviderMessageId(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > 200) {
    return undefined;
  }
  if (/[\n\r]/.test(trimmed)) {
    return undefined;
  }
  return trimmed;
}

export async function createNodemailerTransport(settings: SmtpSettings): Promise<SmtpTransport> {
  const nodemailer = await import("nodemailer");
  const transporter = nodemailer.createTransport({
    host: settings.host,
    port: settings.port,
    secure: settings.port === 465,
    auth: {
      user: settings.username,
      pass: settings.password,
    },
    logger: false,
    debug: false,
  });
  return {
    async sendMail(mail) {
      const info = await transporter.sendMail({
        from: mail.from,
        to: mail.to,
        subject: mail.subject,
        text: mail.text,
        messageId: mail.messageId,
        headers: { "X-Idempotency-Key": mail.idempotencyKey },
      });
      return { messageId: typeof info.messageId === "string" ? info.messageId : undefined };
    },
  };
}
