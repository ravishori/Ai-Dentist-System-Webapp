import type { AppConfig } from "@dentalcare/config";

/** Synthetic local/CI configuration. Never use real patient data or production secrets. */
export function testConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    NODE_ENV: "test",
    LOG_LEVEL: "error",
    DATABASE_URL: "postgresql://USER:PASSWORD@localhost:5432/dentalcare",
    AUTH_PROVIDER: "unset",
    APP_BASE_URL: "http://localhost:3000",
    AUTH_SESSION_TTL_SECONDS: 28_800,
    AUTH_CLOCK_SKEW_SECONDS: 60,
    NOTIFICATION_PROCESSING_ENABLED: "false",
    NOTIFICATION_PROVIDER: "unset",
    NOTIFICATION_ALLOW_REAL_DELIVERY: "false",
    NOTIFICATION_POLL_INTERVAL_SECONDS: 60,
    NOTIFICATION_CLAIM_LEASE_SECONDS: 120,
    ...overrides,
  };
}
