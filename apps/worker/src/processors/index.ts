/**
 * Processor registry for the notification worker.
 * M4 will register outbox claim/dispatch adapters here.
 * Provider calls must never execute inside the originating business transaction.
 */
export interface ProcessorRegistry {
  list(): string[];
}

export function createProcessorRegistry(): ProcessorRegistry {
  return {
    list() {
      return [];
    },
  };
}
