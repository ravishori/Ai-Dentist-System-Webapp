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
    OTP_LENGTH: 6,
    OTP_TTL_SECONDS: 300,
    OTP_MAX_ATTEMPTS: 5,
    OTP_RESEND_COOLDOWN_SECONDS: 60,
    OTP_MAX_RESENDS: 5,
    OTP_RATE_LIMIT_WINDOW_SECONDS: 60,
    OTP_RATE_LIMIT_MAX_REQUESTS: 5,
    OTP_VERIFY_RATE_LIMIT_MAX: 10,
    INVITATION_TTL_SECONDS: 604_800,
    REGISTRATION_SESSION_TTL_SECONDS: 3_600,
    SMS_PROVIDER: "unset",
    OTP_ALLOW_FAKE_SMS: "false",
    NOTIFICATION_PROCESSING_ENABLED: "false",
    NOTIFICATION_PROVIDER: "unset",
    NOTIFICATION_ALLOW_REAL_DELIVERY: "false",
    NOTIFICATION_POLL_INTERVAL_SECONDS: 60,
    NOTIFICATION_CLAIM_LEASE_SECONDS: 120,
    ...overrides,
  };
}
