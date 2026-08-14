import type { AuthenticatedIdentity } from "./authenticated-identity.js";

/**
 * Authentication provider port.
 *
 * M1 extends the M0 boundary with OIDC authorization-code operations.
 * Application code depends on this port, not on Cognito SDK types.
 * Authorization (RBAC, tenant, permissions) is out of scope for M1.
 */
export type AuthProviderId = "unset" | "managed";

export const AUTH_LOGIN_COOKIE = "dc_login";
export const AUTH_SESSION_COOKIE = "dc_session";

export interface AuthCookie {
  readonly name: typeof AUTH_LOGIN_COOKIE | typeof AUTH_SESSION_COOKIE;
  readonly value: string;
  readonly maxAgeSeconds: number;
  readonly httpOnly: true;
  readonly sameSite: "lax";
  readonly path: "/";
  readonly secure: boolean;
  readonly cleared?: boolean;
}

export interface StartLoginResult {
  readonly authorizationUrl: string;
  readonly cookies: readonly AuthCookie[];
}

export interface CompleteLoginInput {
  readonly code?: string;
  readonly state?: string;
  readonly error?: string;
  readonly loginCookie?: string;
}

export interface CompleteLoginResult {
  readonly identity: AuthenticatedIdentity;
  readonly cookies: readonly AuthCookie[];
}

export interface LogoutInput {
  readonly sessionCookie?: string;
}

export interface LogoutResult {
  readonly cookies: readonly AuthCookie[];
  readonly providerLogoutUrl?: string;
}

export interface ReadSessionInput {
  readonly sessionCookie?: string;
}

export interface AuthenticationPort {
  readonly providerId: AuthProviderId;
  isConfigured(): boolean;
  startLogin(): Promise<StartLoginResult>;
  completeLogin(input: CompleteLoginInput): Promise<CompleteLoginResult>;
  logout(input: LogoutInput): Promise<LogoutResult>;
  readSession(input: ReadSessionInput): Promise<AuthenticatedIdentity | null>;
}
