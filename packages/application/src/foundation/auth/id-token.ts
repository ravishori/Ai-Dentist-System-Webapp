import * as jose from "jose";
import { AuthenticationError } from "@dentalcare/domain";
import { ALLOWED_ID_TOKEN_ALGORITHMS } from "./types.js";
import type { OidcRuntimeConfig } from "./types.js";

export interface ValidatedIdTokenClaims {
  readonly subject: string;
  readonly issuer: string;
  readonly email?: string;
  readonly emailVerified?: boolean;
  readonly displayName?: string;
  readonly tokenUse?: string;
}

export async function verifyIdToken(input: {
  idToken: string;
  jwks: jose.JWTVerifyGetKey;
  config: Pick<OidcRuntimeConfig, "issuer" | "clientId" | "clockSkewSeconds">;
  nonce: string;
  now: () => Date;
}): Promise<ValidatedIdTokenClaims> {
  const { idToken, jwks, config, nonce, now } = input;
  const parts = idToken.split(".");
  if (parts.length !== 3) {
    throw new AuthenticationError("invalid_token", "malformed_jwt");
  }

  let header: jose.ProtectedHeaderParameters;
  try {
    header = jose.decodeProtectedHeader(idToken);
  } catch {
    throw new AuthenticationError("invalid_token", "malformed_jwt_header");
  }
  if (!header.alg || !ALLOWED_ID_TOKEN_ALGORITHMS.includes(header.alg as "RS256")) {
    throw new AuthenticationError("invalid_token", "invalid_algorithm");
  }
  if (header.alg === "none") {
    throw new AuthenticationError("invalid_token", "invalid_algorithm");
  }
  if (header.jku || header.x5u) {
    throw new AuthenticationError("invalid_token", "jwks_poisoning_rejected");
  }

  let result: jose.JWTVerifyResult;
  try {
    result = await jose.jwtVerify(idToken, jwks, {
      issuer: config.issuer,
      audience: config.clientId,
      algorithms: [...ALLOWED_ID_TOKEN_ALGORITHMS],
      clockTolerance: config.clockSkewSeconds,
      currentDate: now(),
    });
  } catch (error) {
    const code = mapJoseError(error);
    throw new AuthenticationError("invalid_token", code);
  }

  const claims = result.payload;
  if (typeof claims.sub !== "string" || claims.sub.length === 0) {
    throw new AuthenticationError("invalid_token", "missing_subject");
  }
  if (typeof claims.nonce !== "string" || claims.nonce !== nonce) {
    throw new AuthenticationError("invalid_nonce", "nonce_mismatch");
  }
  if (claims.token_use !== undefined && claims.token_use !== "id") {
    throw new AuthenticationError("invalid_token", "unexpected_token_use");
  }
  if (typeof claims.iat !== "number") {
    throw new AuthenticationError("invalid_token", "missing_iat");
  }

  return {
    subject: claims.sub,
    issuer: config.issuer,
    email: typeof claims.email === "string" ? claims.email : undefined,
    emailVerified: typeof claims.email_verified === "boolean" ? claims.email_verified : undefined,
    displayName: typeof claims.name === "string" ? claims.name : undefined,
    tokenUse: typeof claims.token_use === "string" ? claims.token_use : undefined,
  };
}

function mapJoseError(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  if (/issuer/i.test(message)) return "wrong_issuer";
  if (/audience/i.test(message)) return "wrong_audience";
  if (/expir/i.test(message)) return "expired_id_token";
  if (/signature/i.test(message) || /JWS/i.test(message)) return "invalid_signature";
  if (/JWKS/i.test(message) || /key/i.test(message)) return "unknown_signing_key";
  if (/alg/i.test(message)) return "invalid_algorithm";
  return "id_token_validation_failed";
}

export function createRemoteJwks(jwksUri: string): jose.JWTVerifyGetKey {
  const url = new URL(jwksUri);
  if (url.protocol !== "https:" && url.hostname !== "localhost" && url.hostname !== "127.0.0.1") {
    throw new AuthenticationError("provider_unavailable", "insecure_jwks_uri");
  }
  return jose.createRemoteJWKSet(url, {
    cooldownDuration: 30_000,
    timeoutDuration: 5_000,
    cacheMaxAge: 10 * 60 * 1000,
  });
}
