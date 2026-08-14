import { createHmac, createHash, randomBytes, timingSafeEqual } from "node:crypto";

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function randomUrlSafe(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function hmacSign(secret: string, payload: string): string {
  return createHmac("sha256", secret).update(payload, "utf8").digest("base64url");
}

export function hmacVerify(secret: string, payload: string, signature: string): boolean {
  const expected = Buffer.from(hmacSign(secret, payload));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length) {
    return false;
  }
  return timingSafeEqual(expected, actual);
}

export async function pkceChallenge(verifier: string): Promise<string> {
  const digest = createHash("sha256").update(verifier, "utf8").digest();
  return digest.toString("base64url");
}

export function encodeSignedJson(secret: string, value: unknown): string {
  const payload = Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
  return `${payload}.${hmacSign(secret, payload)}`;
}

export function decodeSignedJson<T>(secret: string, token: string): T | null {
  const parts = token.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    return null;
  }
  const [payload, signature] = parts;
  if (!hmacVerify(secret, payload, signature)) {
    return null;
  }
  try {
    return JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as T;
  } catch {
    return null;
  }
}
