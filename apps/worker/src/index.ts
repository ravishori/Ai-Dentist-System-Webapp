import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { config as loadDotenv } from "dotenv";

function loadLocalEnv(): void {
  const candidates = [resolve(process.cwd(), ".env"), resolve(process.cwd(), "../../.env")];
  for (const filePath of candidates) {
    if (existsSync(filePath)) {
      loadDotenv({ path: filePath, override: false });
    }
  }
}

function reportStartupFailure(error: unknown): void {
  const fieldNames =
    error instanceof Error && "fieldNames" in error
      ? (error as { fieldNames: string[] }).fieldNames
      : undefined;
  console.error(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      level: "error",
      message: "worker failed to start",
      errorName: error instanceof Error ? error.name : "unknown",
      fieldNames,
    }),
  );
}

async function main(): Promise<void> {
  loadLocalEnv();
  const { createLogger, loadConfig } = await import("@dentalcare/config");
  const { startWorker } = await import("./runtime.js");
  const config = loadConfig();
  const logger = createLogger(config);
  await startWorker({ config, logger });
}

void main().catch((error: unknown) => {
  reportStartupFailure(error);
  process.exitCode = 1;
});
