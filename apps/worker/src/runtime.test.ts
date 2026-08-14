import { describe, expect, it } from "vitest";
import { startWorker } from "./runtime.js";
import { createProcessorRegistry } from "./processors/index.js";

describe("notification worker shell", () => {
  it("starts, logs readiness, and does not register processors at M0", async () => {
    const messages: string[] = [];
    await startWorker({
      config: {
        NODE_ENV: "test",
        LOG_LEVEL: "info",
        DATABASE_URL: "postgresql://USER:PASSWORD@localhost:5432/dentalcare",
        AUTH_PROVIDER: "unset",
        APP_BASE_URL: "http://localhost:3000",
      },
      logger: {
        info(message) {
          messages.push(message);
        },
      },
      waitForSignal: async () => undefined,
    });

    expect(createProcessorRegistry().list()).toEqual([]);
    expect(messages).toContain("notification worker starting");
    expect(messages).toContain("notification worker ready");
    expect(messages).toContain("notification worker stopping");
  });
});
