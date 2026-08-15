/**
 * SMS delivery port for OTP (TDA-ADR-004).
 * C3 ships test/fake adapter only — no production SMS vendor selection.
 */
export type SmsDeliveryOutcome = "accepted" | "rejected" | "transient_failure" | "disabled";

export interface SmsMessage {
  readonly toE164: string;
  readonly body: string;
  readonly idempotencyKey: string;
}

export interface SmsDeliveryResult {
  readonly outcome: SmsDeliveryOutcome;
  readonly providerMessageId?: string;
  readonly errorCategory?: string;
}

export interface SmsDeliveryPort {
  deliver(message: SmsMessage): Promise<SmsDeliveryResult>;
}
