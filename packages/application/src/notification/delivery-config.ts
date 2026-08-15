import type { AppConfig } from "@dentalcare/config";

export type NotificationDeliveryMode = "disabled" | "fake" | "smtp";

export interface SmtpSettings {
  readonly host: string;
  readonly port: number;
  readonly username: string;
  readonly password: string;
  readonly fromAddress: string;
  readonly fromDomain: string;
  readonly fromName?: string;
}

export interface NotificationDeliveryDecision {
  readonly mode: NotificationDeliveryMode;
  readonly processingEnabled: boolean;
  readonly pollIntervalSeconds: number;
  readonly claimLeaseSeconds: number;
  readonly reason?: string;
  readonly smtp?: SmtpSettings;
}

export function notificationFlagEnabled(value: string | undefined): boolean {
  return value === "true";
}

export function resolveNotificationDelivery(config: AppConfig): NotificationDeliveryDecision {
  const pollIntervalSeconds = config.NOTIFICATION_POLL_INTERVAL_SECONDS;
  const claimLeaseSeconds = config.NOTIFICATION_CLAIM_LEASE_SECONDS;
  const processingRequested = notificationFlagEnabled(config.NOTIFICATION_PROCESSING_ENABLED);
  const base = { pollIntervalSeconds, claimLeaseSeconds };

  if (!processingRequested) {
    return { ...base, mode: "disabled", processingEnabled: false, reason: "processing_disabled" };
  }

  if (config.NOTIFICATION_PROVIDER === "fake") {
    if (config.NODE_ENV === "production") {
      return {
        ...base,
        mode: "disabled",
        processingEnabled: false,
        reason: "fake_not_allowed_in_production",
      };
    }
    return { ...base, mode: "fake", processingEnabled: true };
  }

  if (config.NOTIFICATION_PROVIDER === "smtp") {
    const smtp = readSmtpSettings(config);
    const realAllowed =
      config.NODE_ENV === "production" &&
      notificationFlagEnabled(config.NOTIFICATION_ALLOW_REAL_DELIVERY);
    if (!realAllowed) {
      return {
        ...base,
        mode: "disabled",
        processingEnabled: false,
        reason: "real_delivery_not_allowed",
      };
    }
    if (!smtp) {
      return {
        ...base,
        mode: "disabled",
        processingEnabled: false,
        reason: "smtp_config_invalid",
      };
    }
    return { ...base, mode: "smtp", processingEnabled: true, smtp };
  }

  return { ...base, mode: "disabled", processingEnabled: false, reason: "provider_unset" };
}

function readSmtpSettings(config: AppConfig): SmtpSettings | undefined {
  const host = config.SMTP_HOST?.trim();
  const port = config.SMTP_PORT;
  const username = config.SMTP_USERNAME?.trim();
  const password = config.SMTP_PASSWORD;
  const fromAddress = config.NOTIFICATION_FROM_EMAIL?.trim().toLowerCase();
  const fromDomain = config.NOTIFICATION_FROM_DOMAIN?.trim().toLowerCase();
  if (!host || !port || !username || !password || !fromAddress || !fromDomain) {
    return undefined;
  }
  const domain = fromAddress.split("@")[1];
  if (domain !== fromDomain) {
    return undefined;
  }
  return {
    host,
    port,
    username,
    password,
    fromAddress,
    fromDomain,
    fromName: config.NOTIFICATION_FROM_NAME,
  };
}
