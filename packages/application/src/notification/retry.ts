import { NOTIFICATION_MAX_ATTEMPTS, NOTIFICATION_RETRY_DELAYS_MS } from "@dentalcare/domain";

export function nextRetryAt(attemptCount: number, now: Date): Date | undefined {
  if (attemptCount >= NOTIFICATION_MAX_ATTEMPTS) {
    return undefined;
  }
  const delay = NOTIFICATION_RETRY_DELAYS_MS[attemptCount - 1] ?? NOTIFICATION_RETRY_DELAYS_MS[0];
  return new Date(now.getTime() + delay);
}

export function isTerminalAttempt(attemptCount: number): boolean {
  return attemptCount >= NOTIFICATION_MAX_ATTEMPTS;
}
