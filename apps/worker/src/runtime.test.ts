import { describe, expect, it } from "vitest";
import { startWorker } from "./runtime.js";
import { createProcessorRegistry } from "./processors/index.js";
import { testConfig } from "@dentalcare/test-utils";

describe("notification worker shell", () => {
  it("starts, logs readiness, and does not register processors at M0", async () => {
    const messages: string[] = [];
    await startWorker({
      config: testConfig({ LOG_LEVEL: "info" }),
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
