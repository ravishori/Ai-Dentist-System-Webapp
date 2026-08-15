import { z } from "zod";

const SENSITIVE_KEY =
  /(password|secret|token|authorization|api[_-]?key|database_url|private|code_verifier|nonce|refresh|smtp_username|recipient|to_address|text_body|html_body|message_body|from_email|from_address)/i;

const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
    DATABASE_URL: z
      .string()
      .min(1, "DATABASE_URL is required")
      .refine(
        (value) => value.startsWith("postgresql://") || value.startsWith("postgres://"),
        "DATABASE_URL must be a PostgreSQL connection string",
      ),
    AUTH_PROVIDER: z.enum(["unset", "managed", "otp"]).default("unset"),
    APP_BASE_URL: z.string().url().default("http://localhost:3000"),
    OIDC_ISSUER: z.string().url().optional(),
    OIDC_CLIENT_ID: z.string().min(1).optional(),
    OIDC_CLIENT_SECRET: z.string().min(1).optional(),
    OIDC_REDIRECT_URI: z.string().url().optional(),
    OIDC_POST_LOGOUT_REDIRECT_URI: z.string().url().optional(),
    AUTH_SESSION_SECRET: z.string().min(32).optional(),
    AUTH_SESSION_TTL_SECONDS: z.coerce.number().int().positive().max(86_400).default(28_800),
    AUTH_CLOCK_SKEW_SECONDS: z.coerce.number().int().min(0).max(120).default(60),
    AUTH_COOKIE_SECURE: z.enum(["true", "false"]).optional(),
    OTP_ISSUER: z.string().url().optional(),
    OTP_PEPPER: z.string().min(32).optional(),
    OTP_LENGTH: z.coerce.number().int().min(4).max(10).default(6),
    OTP_TTL_SECONDS: z.coerce.number().int().positive().max(3600).default(300),
    OTP_MAX_ATTEMPTS: z.coerce.number().int().positive().max(20).default(5),
    OTP_RESEND_COOLDOWN_SECONDS: z.coerce.number().int().min(0).max(3600).default(60),
    OTP_MAX_RESENDS: z.coerce.number().int().positive().max(20).default(5),
    OTP_RATE_LIMIT_WINDOW_SECONDS: z.coerce.number().int().positive().max(3600).default(60),
    OTP_RATE_LIMIT_MAX_REQUESTS: z.coerce.number().int().positive().max(100).default(5),
    OTP_VERIFY_RATE_LIMIT_MAX: z.coerce.number().int().positive().max(100).default(10),
    INVITATION_TTL_SECONDS: z.coerce.number().int().positive().max(2_592_000).default(604_800),
    REGISTRATION_SESSION_TTL_SECONDS: z.coerce.number().int().positive().max(86_400).default(3_600),
    SMS_PROVIDER: z.enum(["unset", "fake"]).default("unset"),
    OTP_ALLOW_FAKE_SMS: z.enum(["true", "false"]).default("false"),
    SMTP_HOST: z.string().min(1).optional(),
    SMTP_PORT: z.coerce.number().int().positive().max(65535).optional(),
    SMTP_USERNAME: z.string().min(1).optional(),
    SMTP_PASSWORD: z.string().min(1).optional(),
    TWILIO_ACCOUNT_SID: z.string().min(1).optional(),
    TWILIO_AUTH_TOKEN: z.string().min(1).optional(),
    NOTIFICATION_PROCESSING_ENABLED: z.enum(["true", "false"]).default("false"),
    NOTIFICATION_PROVIDER: z.enum(["unset", "fake", "smtp"]).default("unset"),
    NOTIFICATION_ALLOW_REAL_DELIVERY: z.enum(["true", "false"]).default("false"),
    NOTIFICATION_POLL_INTERVAL_SECONDS: z.coerce.number().int().positive().max(3600).default(60),
    NOTIFICATION_CLAIM_LEASE_SECONDS: z.coerce.number().int().positive().max(3600).default(120),
    NOTIFICATION_FROM_EMAIL: z.string().email().optional(),
    NOTIFICATION_FROM_DOMAIN: z.string().min(1).optional(),
    NOTIFICATION_FROM_NAME: z.string().min(1).max(80).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.NOTIFICATION_FROM_EMAIL && data.NOTIFICATION_FROM_DOMAIN) {
      const domain = data.NOTIFICATION_FROM_EMAIL.split("@")[1]?.toLowerCase();
      if (domain !== data.NOTIFICATION_FROM_DOMAIN.toLowerCase()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["NOTIFICATION_FROM_EMAIL"],
          message: "NOTIFICATION_FROM_EMAIL must use NOTIFICATION_FROM_DOMAIN",
        });
      }
    }
    if (data.AUTH_PROVIDER === "managed") {
      const required = {
        OIDC_ISSUER: data.OIDC_ISSUER,
        OIDC_CLIENT_ID: data.OIDC_CLIENT_ID,
        OIDC_REDIRECT_URI: data.OIDC_REDIRECT_URI,
        AUTH_SESSION_SECRET: data.AUTH_SESSION_SECRET,
      } as const;
      for (const [field, value] of Object.entries(required)) {
        if (!value) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [field],
            message: `${field} is required when AUTH_PROVIDER=managed`,
          });
        }
      }
      if (data.NODE_ENV === "production" && data.OIDC_REDIRECT_URI) {
        if (isLoopbackUrl(data.OIDC_REDIRECT_URI)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["OIDC_REDIRECT_URI"],
            message: "production must not use loopback redirect URIs",
          });
        }
      }
      if (data.NODE_ENV === "production" && data.OIDC_POST_LOGOUT_REDIRECT_URI) {
        if (isLoopbackUrl(data.OIDC_POST_LOGOUT_REDIRECT_URI)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["OIDC_POST_LOGOUT_REDIRECT_URI"],
            message: "production must not use loopback logout redirect URIs",
          });
        }
      }
    }
    if (data.AUTH_PROVIDER === "otp") {
      const required = {
        OTP_ISSUER: data.OTP_ISSUER,
        OTP_PEPPER: data.OTP_PEPPER,
        AUTH_SESSION_SECRET: data.AUTH_SESSION_SECRET,
      } as const;
      for (const [field, value] of Object.entries(required)) {
        if (!value) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [field],
            message: `${field} is required when AUTH_PROVIDER=otp`,
          });
        }
      }
      if (data.NODE_ENV === "production") {
        if (data.SMS_PROVIDER === "fake" || data.OTP_ALLOW_FAKE_SMS === "true") {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["SMS_PROVIDER"],
            message: "production must not use fake SMS for OTP",
          });
        }
        if (data.SMS_PROVIDER === "unset") {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["SMS_PROVIDER"],
            message: "production OTP requires a configured SMS provider (not yet selected in C3)",
          });
        }
      }
    }
  });

export type AppConfig = z.infer<typeof envSchema>;

export class ConfigurationError extends Error {
  readonly fieldNames: string[];

  constructor(fieldNames: string[]) {
    super(`Invalid configuration. Missing or invalid: ${fieldNames.join(", ")}`);
    this.name = "ConfigurationError";
    this.fieldNames = fieldNames;
  }
}

function issuePath(issue: z.ZodIssue): string {
  return issue.path.length > 0 ? issue.path.map(String).join(".") : "environment";
}

export function isLoopbackUrl(value: string): boolean {
  try {
    const { hostname } = new URL(value);
    return (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "[::1]" ||
      hostname === "::1"
    );
  } catch {
    return false;
  }
}

export function loadConfig(source: NodeJS.Dict<string | undefined> = process.env): AppConfig {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const fieldNames = [...new Set(result.error.issues.map(issuePath))];
    throw new ConfigurationError(fieldNames);
  }
  return result.data;
}

export function redactRecord(fields: Record<string, unknown>): Record<string, unknown> {
  const redacted: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    redacted[key] = SENSITIVE_KEY.test(key) ? "[redacted]" : value;
  }
  return redacted;
}

export function createLogger(config: Pick<AppConfig, "LOG_LEVEL" | "NODE_ENV">) {
  const rank: Record<AppConfig["LOG_LEVEL"], number> = {
    debug: 10,
    info: 20,
    warn: 30,
    error: 40,
  };

  function write(level: AppConfig["LOG_LEVEL"], message: string, fields?: Record<string, unknown>) {
    if (rank[level] < rank[config.LOG_LEVEL]) {
      return;
    }
    const payload = {
      timestamp: new Date().toISOString(),
      level,
      message,
      ...(fields ? redactRecord(fields) : {}),
    };
    const serialized = JSON.stringify(payload);
    if (level === "error") {
      console.error(serialized);
      return;
    }
    if (level === "warn") {
      console.warn(serialized);
      return;
    }
    console.log(serialized);
  }

  return {
    debug: (message: string, fields?: Record<string, unknown>) => write("debug", message, fields),
    info: (message: string, fields?: Record<string, unknown>) => write("info", message, fields),
    warn: (message: string, fields?: Record<string, unknown>) => write("warn", message, fields),
    error: (message: string, fields?: Record<string, unknown>) => write("error", message, fields),
  };
}
