/**
 * Notification application services begin in M4.
 * Provider calls must never execute inside the originating business transaction.
 */
export const NOTIFICATION_APPLICATION = "notification" as const;
