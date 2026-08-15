/**
 * Processor registry for the notification worker.
 * Provider calls must never execute inside the originating business transaction.
 */
export const REGISTERED_OUTBOX_PROCESSORS = [
  "appointment.created",
  "appointment.rescheduled",
  "appointment.cancelled",
] as const;

export interface ProcessorRegistry {
  list(): string[];
}

export function createProcessorRegistry(): ProcessorRegistry {
  return {
    list() {
      return [...REGISTERED_OUTBOX_PROCESSORS];
    },
  };
}
