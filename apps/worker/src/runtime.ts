import type { AppConfig } from "@dentalcare/config";
import {
  createNotificationDeliveryPort,
  NotificationOutboxProcessor,
  resolveNotificationDelivery,
} from "@dentalcare/application";
import {
  createPrismaClient,
  PrismaAppointmentRepository,
  PrismaNotificationOutboxRepository,
  PrismaPatientRepository,
} from "@dentalcare/db";
import { createProcessorRegistry } from "./processors/index.js";
import { randomUUID } from "node:crypto";

export interface WorkerLogger {
  info(message: string, fields?: Record<string, unknown>): void;
  warn?(message: string, fields?: Record<string, unknown>): void;
  error?(message: string, fields?: Record<string, unknown>): void;
}

export interface WorkerRuntimeOptions {
  config: AppConfig;
  logger: WorkerLogger;
  waitForSignal?: () => Promise<void>;
  processor?: { processBatch(): Promise<number> };
  poll?: (intervalMs: number, wait: Promise<void>) => Promise<void>;
}

export async function startWorker(options: WorkerRuntimeOptions): Promise<void> {
  const processors = createProcessorRegistry();
  const decision = resolveNotificationDelivery(options.config);
  options.logger.info("notification worker starting", {
    service: "worker",
    milestone: "M5",
    nodeEnv: options.config.NODE_ENV,
    authProvider: options.config.AUTH_PROVIDER,
    registeredProcessors: processors.list(),
    processingEnabled: decision.processingEnabled,
    deliveryMode: decision.mode,
    pollIntervalSeconds: decision.pollIntervalSeconds,
  });

  const wait = options.waitForSignal ?? defaultWaitForSignal;
  if (!decision.processingEnabled) {
    options.logger.info("notification worker ready", {
      processingEnabled: false,
      deliveryMode: "disabled",
      reason: decision.reason ?? "processing_disabled",
      note: "Notification processing stays disabled until explicit validated configuration enables it",
    });
    await wait();
    options.logger.info("notification worker stopping");
    return;
  }

  const processor = options.processor ?? (await createDefaultProcessor(options));
  options.logger.info("notification worker ready", {
    processingEnabled: true,
    deliveryMode: decision.mode,
    pollIntervalSeconds: decision.pollIntervalSeconds,
  });

  const stop = wait();
  const poll =
    options.poll ??
    ((intervalMs: number, signal: Promise<void>) =>
      pollUntil(processor, intervalMs, signal, options.logger));
  await Promise.race([stop, poll(decision.pollIntervalSeconds * 1000, stop)]);
  options.logger.info("notification worker stopping");
}

async function createDefaultProcessor(options: WorkerRuntimeOptions) {
  const prisma = createPrismaClient();
  const delivery = await createNotificationDeliveryPort(options.config);
  const decision = resolveNotificationDelivery(options.config);
  return new NotificationOutboxProcessor({
    outbox: new PrismaNotificationOutboxRepository(prisma),
    appointments: new PrismaAppointmentRepository(prisma),
    patients: new PrismaPatientRepository(prisma),
    delivery,
    logger: {
      info: (message, fields) => options.logger.info(message, fields),
      warn: (message, fields) =>
        options.logger.warn
          ? options.logger.warn(message, fields)
          : options.logger.info(message, fields),
      error: (message, fields) =>
        options.logger.error
          ? options.logger.error(message, fields)
          : options.logger.info(message, fields),
    },
    workerId: `worker_${randomUUID()}`,
    leaseMs: decision.claimLeaseSeconds * 1000,
  });
}

async function pollUntil(
  processor: { processBatch(): Promise<number> },
  intervalMs: number,
  stop: Promise<void>,
  logger: WorkerLogger,
): Promise<void> {
  let stopped = false;
  void stop.then(() => {
    stopped = true;
  });
  while (!stopped) {
    try {
      await processor.processBatch();
    } catch {
      logger.error?.("notification_poll_failed", { errorCategory: "poll_failure" });
    }
    await Promise.race([stop, sleep(intervalMs)]);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
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
