import type { AppConfig } from "@dentalcare/config";
import { createProcessorRegistry } from "./processors/index.js";

export interface WorkerLogger {
  info(message: string, fields?: Record<string, unknown>): void;
}

export interface WorkerRuntimeOptions {
  config: AppConfig;
  logger: WorkerLogger;
  waitForSignal?: () => Promise<void>;
}

export async function startWorker(options: WorkerRuntimeOptions): Promise<void> {
  const processors = createProcessorRegistry();
  options.logger.info("notification worker starting", {
    service: "worker",
    milestone: "M1",
    nodeEnv: options.config.NODE_ENV,
    authProvider: options.config.AUTH_PROVIDER,
    registeredProcessors: processors.list(),
  });
  options.logger.info("notification worker ready", {
    processingEnabled: false,
    note: "Notification outbox processing is deferred to M4",
  });

  const wait = options.waitForSignal ?? defaultWaitForSignal;
  await wait();
  options.logger.info("notification worker stopping");
}

function defaultWaitForSignal(): Promise<void> {
  return new Promise((resolve) => {
    const shutdown = () => {
      process.off("SIGINT", shutdown);
      process.off("SIGTERM", shutdown);
      resolve();
    };
    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
  });
}
