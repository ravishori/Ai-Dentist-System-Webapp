import { describe, expect, it } from "vitest";
import { ConfigurationError, createLogger, loadConfig, redactRecord } from "./index.js";

const validEnv = {
  NODE_ENV: "test",
  DATABASE_URL: "postgresql://USER:PASSWORD@localhost:5432/dentalcare",
  AUTH_PROVIDER: "unset",
  LOG_LEVEL: "info",
  APP_BASE_URL: "http://localhost:3000",
};

describe("loadConfig", () => {
  it("loads valid placeholder configuration", () => {
    const config = loadConfig(validEnv);
    expect(config.NODE_ENV).toBe("test");
    expect(config.AUTH_PROVIDER).toBe("unset");
    expect(config.DATABASE_URL.startsWith("postgresql://")).toBe(true);
  });

  it("fails fast when DATABASE_URL is missing without echoing secrets", () => {
    expect(() => loadConfig({ NODE_ENV: "test" })).toThrow(ConfigurationError);
    try {
      loadConfig({ NODE_ENV: "test", DATABASE_URL: "not-a-postgres-url" });
      throw new Error("expected ConfigurationError");
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigurationError);
      expect(String(error)).not.toContain("not-a-postgres-url");
      expect((error as ConfigurationError).fieldNames).toContain("DATABASE_URL");
    }
  });
});

describe("redactRecord", () => {
  it("redacts secret-like keys", () => {
    expect(
      redactRecord({
        SMTP_PASSWORD: "should-not-appear",
        service: "worker",
      }),
    ).toEqual({
      SMTP_PASSWORD: "[redacted]",
      service: "worker",
    });
  });
});

describe("createLogger", () => {
  it("does not print secret field values", () => {
    const lines: string[] = [];
    const original = console.log;
    console.log = (message: string) => {
      lines.push(message);
    };
    try {
      const logger = createLogger({ LOG_LEVEL: "info", NODE_ENV: "test" });
      logger.info("startup", { DATABASE_URL: "postgresql://USER:secret@localhost:5432/db" });
    } finally {
      console.log = original;
    }
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("[redacted]");
    expect(lines[0]).not.toContain("secret");
  });
});
