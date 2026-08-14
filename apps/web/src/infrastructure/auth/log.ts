import { createLogger, loadConfig } from "@dentalcare/config";

export function logAuthenticationEvent(input: {
  event: string;
  result: "success" | "failure";
  category?: string;
  correlationId?: string;
}): void {
  const config = loadConfig();
  const logger = createLogger(config);
  logger.info("authentication_event", {
    event: input.event,
    result: input.result,
    category: input.category,
    correlationId: input.correlationId,
  });
}
