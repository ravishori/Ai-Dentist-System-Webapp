export const LOGIN_TRANSACTION_TTL_SECONDS = 600;
export const OIDC_SCOPES = "openid email profile";
export const ALLOWED_ID_TOKEN_ALGORITHMS = ["RS256"] as const;
export const CLOCK_SKEW_SECONDS_DEFAULT = 60;
export const SESSION_TTL_SECONDS_DEFAULT = 28_800;

export interface OidcRuntimeConfig {
  readonly issuer: string;
  readonly clientId: string;
  readonly clientSecret?: string;
  readonly redirectUri: string;
  readonly postLogoutRedirectUri: string;
  readonly sessionSecret: string;
  readonly sessionTtlSeconds: number;
  readonly clockSkewSeconds: number;
  readonly cookieSecure: boolean;
  readonly nodeEnv: "development" | "test" | "production";
}

export interface OidcDiscoveryDocument {
  readonly issuer: string;
  readonly authorization_endpoint: string;
  readonly token_endpoint: string;
  readonly jwks_uri: string;
  readonly userinfo_endpoint?: string;
  readonly end_session_endpoint?: string;
  readonly id_token_signing_alg_values_supported?: string[];
}

export interface LoginTransactionRecord {
  readonly stateHash: string;
  readonly nonceHash: string;
  readonly redirectUri: string;
  readonly expiresAtMs: number;
  consumedAtMs?: number;
}

export interface SessionRecord {
  readonly id: string;
  readonly tokenHash: string;
  readonly userId: string;
  readonly subject: string;
  readonly issuer: string;
  readonly email?: string;
  readonly emailVerified?: boolean;
  readonly displayName?: string;
  readonly authenticatedAt: string;
  readonly expiresAtMs: number;
  revokedAtMs?: number;
}

export interface IdentityRecord {
  readonly userId: string;
  readonly status: "active" | "disabled";
  readonly email?: string;
  readonly emailVerified: boolean;
  readonly issuer: string;
  readonly subject: string;
}

export interface LoginTransactionStore {
  save(record: LoginTransactionRecord): Promise<void>;
  consume(stateHash: string, nowMs: number): Promise<LoginTransactionRecord | null>;
}

export interface SessionStore {
  save(record: SessionRecord): Promise<void>;
  findByTokenHash(tokenHash: string, nowMs: number): Promise<SessionRecord | null>;
  revokeByTokenHash(tokenHash: string, nowMs: number): Promise<void>;
}

export interface UserIdentityDirectory {
  findByIssuerSubject(issuer: string, subject: string): Promise<IdentityRecord | null>;
  provisionFromClaims(input: {
    issuer: string;
    subject: string;
    email?: string;
    emailVerified?: boolean;
  }): Promise<IdentityRecord>;
  /**
   * Bind an identity to an existing application user (OTP registration).
   * Cognito adapter does not require this; OTP registration uses it to avoid duplicate users.
   */
  linkIdentity?(input: {
    userId: string;
    issuer: string;
    subject: string;
    email?: string;
    emailVerified?: boolean;
  }): Promise<IdentityRecord>;
}
