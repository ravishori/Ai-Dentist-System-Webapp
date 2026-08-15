import type { SmsDeliveryPort, SmsDeliveryResult, SmsMessage } from "@dentalcare/domain";

/** Test/fake SMS adapter for C3. Must not be used as a silent production fallback. */
export class FakeSmsDeliveryAdapter implements SmsDeliveryPort {
  readonly sent: SmsMessage[] = [];
  nextOutcome: SmsDeliveryResult = { outcome: "accepted", providerMessageId: "fake-sms-1" };

  async deliver(message: SmsMessage): Promise<SmsDeliveryResult> {
    this.sent.push(message);
    return this.nextOutcome;
  }
}

/** Fail-closed SMS when production OTP is enabled without a real provider. */
export class FailClosedSmsDeliveryAdapter implements SmsDeliveryPort {
  async deliver(_message: SmsMessage): Promise<SmsDeliveryResult> {
    return { outcome: "disabled", errorCategory: "sms_provider_unset" };
  }
}
