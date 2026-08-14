import { z } from "zod";

const SENSITIVE_KEY = /(password|secret|token|authorization|api[_-]?key|database_url|private)/i;

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  DATABASE_URL: z
    .string()
    .min(1, "DATABASE_URL is required")
    .refine(
      (value) => value.startsWith("postgresql://") || value.startsWith("postgres://"),
      "DATABASE_URL must be a PostgreSQL connection string",
    ),
  AUTH_PROVIDER: z.enum(["unset", "managed"]).default("unset"),
  APP_BASE_URL: z.string().url().default("http://localhost:3000"),
  SMTP_HOST: z.string().min(1).optional(),
  SMTP_PORT: z.coerce.number().int().positive().optional(),
  SMTP_USERNAME: z.string().min(1).optional(),
  SMTP_PASSWORD: z.string().min(1).optional(),
  TWILIO_ACCOUNT_SID: z.string().min(1).optional(),
  TWILIO_AUTH_TOKEN: z.string().min(1).optional(),
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
