import type { AppConfig } from "@dentalcare/config";

/** Synthetic local/CI configuration. Never use real patient data or production secrets. */
export function testConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    NODE_ENV: "test",
    LOG_LEVEL: "error",
    DATABASE_URL: "postgresql://USER:PASSWORD@localhost:5432/dentalcare",
    AUTH_PROVIDER: "unset",
    APP_BASE_URL: "http://localhost:3000",
    ...overrides,
  };
}
