import { describe, expect, it } from "vitest";
import { startWorker } from "./runtime.js";
import { createProcessorRegistry } from "./processors/index.js";
import { testConfig } from "@dentalcare/test-utils";

describe("notification worker", () => {
  it("starts disabled by default and does not process", async () => {
    const messages: Array<{ message: string; fields?: Record<string, unknown> }> = [];
    let processed = 0;
    await startWorker({
      config: testConfig({ LOG_LEVEL: "info" }),
      logger: {
        info(message, fields) {
          messages.push({ message, fields });
        },
      },
      processor: {
        async processBatch() {
          processed += 1;
          return 0;
        },
      },
      waitForSignal: async () => undefined,
    });

    expect(createProcessorRegistry().list()).toEqual([
      "appointment.created",
      "appointment.rescheduled",
      "appointment.cancelled",
    ]);
    expect(messages.map((row) => row.message)).toContain("notification worker starting");
    expect(messages.map((row) => row.message)).toContain("notification worker ready");
    expect(messages.map((row) => row.message)).toContain("notification worker stopping");
    expect(messages.some((row) => row.fields?.processingEnabled === false)).toBe(true);
    expect(processed).toBe(0);
  });

  it("polls only when fake-adapter processing is explicitly enabled", async () => {
    let processed = 0;
    await startWorker({
      config: testConfig({
        LOG_LEVEL: "info",
        NODE_ENV: "test",
        NOTIFICATION_PROCESSING_ENABLED: "true",
        NOTIFICATION_PROVIDER: "fake",
        NOTIFICATION_POLL_INTERVAL_SECONDS: 60,
      }),
      logger: {
        info() {
          return;
        },
      },
      processor: {
        async processBatch() {
          processed += 1;
          return 0;
        },
      },
      waitForSignal: async () => undefined,
      poll: async (_intervalMs, wait) => {
        await wait;
      },
    });
    expect(processed).toBe(0);
  });
});
