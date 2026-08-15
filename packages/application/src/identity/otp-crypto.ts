import { createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";

/**
 * OTP hashing (TDA-ADR-004 / C3).
 *
 * OTPs are low-entropy. We do **not** store bare SHA-256(otp).
 * Instead: per-challenge random salt + HMAC-SHA256(OTP_PEPPER, salt || otp).
 * Verification uses constant-time digest compare.
 */
export function generateNumericOtp(length: number): string {
  if (!Number.isInteger(length) || length < 4 || length > 10) {
    throw new Error("invalid_otp_length");
  }
  const max = 10 ** length;
  const value = randomInt(0, max);
  return value.toString().padStart(length, "0");
}

export function generateOtpSalt(bytes = 16): string {
  return randomBytes(bytes).toString("base64url");
}

export function hashOtp(pepper: string, salt: string, otp: string): string {
  return createHmac("sha256", pepper).update(`${salt}:${otp}`, "utf8").digest("hex");
}

export function verifyOtpHash(
  pepper: string,
  salt: string,
  otp: string,
  expectedHash: string,
): boolean {
  const actual = Buffer.from(hashOtp(pepper, salt, otp), "utf8");
  const expected = Buffer.from(expectedHash, "utf8");
  if (actual.length !== expected.length) {
    return false;
  }
  return timingSafeEqual(actual, expected);
}

/** Invitation / clinic-code token hashing (high entropy secrets). */
export function hashSecretToken(pepper: string, token: string): string {
  return createHmac("sha256", pepper).update(token, "utf8").digest("hex");
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Minimal E.164-ish normalization: digits with leading +. */
export function normalizePhone(phone: string): string {
  const trimmed = phone.trim();
  const digits = trimmed.replace(/[^\d+]/g, "");
  if (digits.startsWith("+")) {
    return `+${digits.slice(1).replace(/\D/g, "")}`;
  }
  return `+${digits.replace(/\D/g, "")}`;
}
