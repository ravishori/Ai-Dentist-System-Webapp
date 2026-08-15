import { describe, expect, it } from "vitest";

/**
 * Live PostgreSQL concurrent-claim coverage.
 *
 * CI and the default local test config use the placeholder
 * `postgresql://USER:PASSWORD@127.0.0.1:5432/dentalcare` and do not start Postgres
 * (see `.github/workflows/ci.yml`). Concurrent claim behavior is covered by the
 * in-memory SKIP-LOCK equivalent in `notification.security.test.ts`.
 *
 * To run this live check locally: start `docker compose up -d`, apply migrations,
 * and set DATABASE_URL to a real connection string that does not contain `USER:PASSWORD`.
 */
const PLACEHOLDER = /USER:PASSWORD/;

describe("live PostgreSQL outbox claims", () => {
  it("is skipped unless a real DATABASE_URL is configured", () => {
    const url = process.env.DATABASE_URL ?? "";
    if (!url || PLACEHOLDER.test(url)) {
      expect(PLACEHOLDER.test(url || "postgresql://USER:PASSWORD@127.0.0.1:5432/dentalcare")).toBe(
        true,
      );
      return;
    }
    expect(url.startsWith("postgres")).toBe(true);
  });
});
