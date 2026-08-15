import type {
  AuthOtpChallenge,
  NotificationDeliveryPort,
  OtpDestinationType,
  OtpPurpose,
  SmsDeliveryPort,
} from "@dentalcare/domain";
import { sha256Hex } from "../foundation/auth/crypto.js";
import { randomUrlSafe } from "../foundation/auth/crypto.js";
import {
  generateNumericOtp,
  generateOtpSalt,
  hashOtp,
  normalizeEmail,
  normalizePhone,
  verifyOtpHash,
} from "./otp-crypto.js";
import { consumeRateLimit, type RateLimitBucketStore, type RateLimitConfig } from "./rate-limit.js";

export interface OtpRuntimeConfig {
  readonly pepper: string;
  readonly length: number;
  readonly ttlSeconds: number;
  readonly maxAttempts: number;
  readonly resendCooldownSeconds: number;
  readonly maxResends: number;
  readonly requestRateLimit: RateLimitConfig;
  readonly verifyRateLimit: RateLimitConfig;
}

export interface OtpChallengeStore {
  save(challenge: AuthOtpChallenge): Promise<void>;
  findById(id: string): Promise<AuthOtpChallenge | null>;
  update(challenge: AuthOtpChallenge): Promise<void>;
  findLatestActive(input: {
    destinationNormalized: string;
    purpose: OtpPurpose;
    registrationSessionId?: string;
    nowIso: string;
  }): Promise<AuthOtpChallenge | null>;
  /** Optional atomic consume for concurrent verification safety. */
  tryConsume?(id: string, now: Date): Promise<boolean>;
}

export type OtpServiceFailure = {
  readonly ok: false;
  readonly error:
    | "rate_limited"
    | "resend_cooldown"
    | "max_resends"
    | "expired"
    | "consumed"
    | "invalid_code"
    | "max_attempts"
    | "not_found"
    | "delivery_failed"
    | "delivery_disabled";
  readonly message: string;
};

export type OtpRequestSuccess = {
  readonly ok: true;
  readonly challengeId: string;
  readonly expiresAt: string;
  /** Test-only plaintext when capturePlaintext is enabled; never for production adapters. */
  readonly debugCode?: string;
};

export type OtpVerifySuccess = {
  readonly ok: true;
  readonly challenge: AuthOtpChallenge;
};

export class OtpChallengeService {
  constructor(
    private readonly config: OtpRuntimeConfig,
    private readonly challenges: OtpChallengeStore,
    private readonly rateLimits: RateLimitBucketStore,
    private readonly email: NotificationDeliveryPort,
    private readonly sms: SmsDeliveryPort,
    private readonly options: {
      readonly now?: () => Date;
      readonly idFactory?: () => string;
      /** Only for unit tests — never enable in production wiring. */
      readonly capturePlaintext?: boolean;
    } = {},
  ) {}

  async request(input: {
    destinationType: OtpDestinationType;
    destination: string;
    purpose: OtpPurpose;
    registrationSessionId?: string;
    organizationId?: string;
    invitationId?: string;
    userId?: string;
    ip?: string;
  }): Promise<OtpRequestSuccess | OtpServiceFailure> {
    const now = this.options.now?.() ?? new Date();
    const nowMs = now.getTime();
    const destinationNormalized =
      input.destinationType === "EMAIL"
        ? normalizeEmail(input.destination)
        : normalizePhone(input.destination);
    const ipHash = input.ip ? sha256Hex(input.ip) : undefined;

    const destLimit = await consumeRateLimit(
      this.rateLimits,
      `otp_request:dest:${sha256Hex(destinationNormalized)}`,
      this.config.requestRateLimit,
      nowMs,
    );
    if (!destLimit.allowed) {
      return { ok: false, error: "rate_limited", message: "Too many OTP requests." };
    }
    if (ipHash) {
      const ipLimit = await consumeRateLimit(
        this.rateLimits,
        `otp_request:ip:${ipHash}`,
        this.config.requestRateLimit,
        nowMs,
      );
      if (!ipLimit.allowed) {
        return { ok: false, error: "rate_limited", message: "Too many OTP requests." };
      }
    }

    const existing = await this.challenges.findLatestActive({
      destinationNormalized,
      purpose: input.purpose,
      registrationSessionId: input.registrationSessionId,
      nowIso: now.toISOString(),
    });
    if (existing) {
      const lastSent = Date.parse(existing.lastSentAt);
      if (nowMs - lastSent < this.config.resendCooldownSeconds * 1000) {
        return {
          ok: false,
          error: "resend_cooldown",
          message: "Please wait before requesting another code.",
        };
      }
      if (existing.resendCount >= this.config.maxResends) {
        return {
          ok: false,
          error: "max_resends",
          message: "Maximum resends reached. Start a new registration.",
        };
      }
    }

    const otp = generateNumericOtp(this.config.length);
    const salt = generateOtpSalt();
    const codeHash = hashOtp(this.config.pepper, salt, otp);
    const id = this.options.idFactory?.() ?? `otp_${randomUrlSafe(12)}`;
    const challenge: AuthOtpChallenge = {
      id,
      destinationType: input.destinationType,
      destinationNormalized,
      purpose: input.purpose,
      codeSalt: salt,
      codeHash,
      registrationSessionId: input.registrationSessionId,
      organizationId: input.organizationId,
      invitationId: input.invitationId,
      userId: input.userId,
      attempts: 0,
      maxAttempts: this.config.maxAttempts,
      expiresAt: new Date(nowMs + this.config.ttlSeconds * 1000).toISOString(),
      lastSentAt: now.toISOString(),
      resendCount: existing ? existing.resendCount + 1 : 0,
      ipHash,
      createdAt: now.toISOString(),
    };

    if (existing && !existing.consumedAt) {
      await this.challenges.update({
        ...existing,
        consumedAt: now.toISOString(),
      });
    }

    const delivered = await this.deliver(input.destinationType, destinationNormalized, otp, id);
    if (!delivered.ok) {
      return delivered;
    }

    await this.challenges.save(challenge);
    return {
      ok: true,
      challengeId: id,
      expiresAt: challenge.expiresAt,
      ...(this.options.capturePlaintext ? { debugCode: otp } : {}),
    };
  }

  async verify(input: {
    challengeId: string;
    code: string;
    ip?: string;
  }): Promise<OtpVerifySuccess | OtpServiceFailure> {
    const now = this.options.now?.() ?? new Date();
    const nowMs = now.getTime();
    const ipHash = input.ip ? sha256Hex(input.ip) : undefined;
    if (ipHash) {
      const ipLimit = await consumeRateLimit(
        this.rateLimits,
        `otp_verify:ip:${ipHash}`,
        this.config.verifyRateLimit,
        nowMs,
      );
      if (!ipLimit.allowed) {
        return { ok: false, error: "rate_limited", message: "Too many verification attempts." };
      }
    }

    const challenge = await this.challenges.findById(input.challengeId);
    if (!challenge) {
      return { ok: false, error: "not_found", message: "Challenge not found." };
    }
    if (challenge.consumedAt) {
      return { ok: false, error: "consumed", message: "Code already used." };
    }
    if (Date.parse(challenge.expiresAt) <= nowMs) {
      await this.challenges.update({ ...challenge, consumedAt: now.toISOString() });
      return { ok: false, error: "expired", message: "Code expired." };
    }
    if (challenge.attempts >= challenge.maxAttempts) {
      return { ok: false, error: "max_attempts", message: "Too many incorrect attempts." };
    }

    const destLimit = await consumeRateLimit(
      this.rateLimits,
      `otp_verify:dest:${sha256Hex(challenge.destinationNormalized)}`,
      this.config.verifyRateLimit,
      nowMs,
    );
    if (!destLimit.allowed) {
      return { ok: false, error: "rate_limited", message: "Too many verification attempts." };
    }

    const ok = verifyOtpHash(
      this.config.pepper,
      challenge.codeSalt,
      input.code,
      challenge.codeHash,
    );
    if (!ok) {
      const attempts = challenge.attempts + 1;
      const updated: AuthOtpChallenge = {
        ...challenge,
        attempts,
        ...(attempts >= challenge.maxAttempts ? { consumedAt: now.toISOString() } : {}),
      };
      await this.challenges.update(updated);
      if (attempts >= challenge.maxAttempts) {
        return { ok: false, error: "max_attempts", message: "Too many incorrect attempts." };
      }
      return { ok: false, error: "invalid_code", message: "Incorrect code." };
    }

    if (this.challenges.tryConsume) {
      const consumedOk = await this.challenges.tryConsume(challenge.id, now);
      if (!consumedOk) {
        return { ok: false, error: "consumed", message: "Code already used." };
      }
      return {
        ok: true,
        challenge: { ...challenge, consumedAt: now.toISOString() },
      };
    }

    const consumed: AuthOtpChallenge = { ...challenge, consumedAt: now.toISOString() };
    await this.challenges.update(consumed);
    return { ok: true, challenge: consumed };
  }

  private async deliver(
    type: OtpDestinationType,
    destination: string,
    otp: string,
    challengeId: string,
  ): Promise<{ ok: true } | OtpServiceFailure> {
    const body = `Your DentalCare verification code is ${otp}. It expires soon.`;
    if (type === "EMAIL") {
      const result = await this.email.deliver({
        channel: "email",
        idempotencyKey: `otp:${challengeId}`,
        toAddress: destination,
        subject: "Your verification code",
        textBody: body,
      });
      if (result.outcome === "accepted") {
        return { ok: true };
      }
      return {
        ok: false,
        error: result.outcome === "rejected" ? "delivery_failed" : "delivery_failed",
        message: "Unable to send verification email.",
      };
    }
    const result = await this.sms.deliver({
      toE164: destination,
      body,
      idempotencyKey: `otp:${challengeId}`,
    });
    if (result.outcome === "accepted") {
      return { ok: true };
    }
    if (result.outcome === "disabled") {
      return {
        ok: false,
        error: "delivery_disabled",
        message: "SMS delivery is not configured.",
      };
    }
    return { ok: false, error: "delivery_failed", message: "Unable to send verification SMS." };
  }
}
