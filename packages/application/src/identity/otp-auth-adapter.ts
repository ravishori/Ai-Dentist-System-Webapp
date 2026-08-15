import type {
  AuthenticatedIdentity,
  AuthenticationPort,
  AuthCookie,
  CompleteLoginInput,
  CompleteLoginResult,
  LogoutInput,
  LogoutResult,
  ReadSessionInput,
  StartLoginResult,
} from "@dentalcare/domain";
import { AUTH_LOGIN_COOKIE, AUTH_SESSION_COOKIE, AuthenticationError } from "@dentalcare/domain";
import { randomUrlSafe, sha256Hex } from "../foundation/auth/crypto.js";
import type { SessionStore, UserIdentityDirectory } from "../foundation/auth/types.js";

export interface OtpAuthRuntimeConfig {
  readonly issuer: string;
  readonly sessionSecret: string;
  readonly sessionTtlSeconds: number;
  readonly cookieSecure: boolean;
  readonly appBaseUrl: string;
}

/**
 * Application OTP authentication adapter (TDA-ADR-004).
 * Issues the same opaque `dc_session` cookies as Cognito after verified OTP login.
 * OIDC authorization-code endpoints are not used; startLogin redirects to the app login page.
 */
export class OtpAuthenticationAdapter implements AuthenticationPort {
  readonly providerId = "otp" as const;

  constructor(
    private readonly config: OtpAuthRuntimeConfig,
    private readonly identityDirectory: UserIdentityDirectory,
    private readonly sessions: SessionStore,
    private readonly now: () => Date = () => new Date(),
  ) {}

  isConfigured(): boolean {
    return true;
  }

  async startLogin(): Promise<StartLoginResult> {
    const loginUrl = new URL("/login", this.config.appBaseUrl).toString();
    return {
      authorizationUrl: loginUrl,
      cookies: [],
    };
  }

  async completeLogin(_input: CompleteLoginInput): Promise<CompleteLoginResult> {
    throw new AuthenticationError("invalid_request", "otp_provider_uses_passwordless_endpoints");
  }

  /**
   * After OTP verification succeeds, map/create UserIdentity and issue dc_session.
   */
  async establishSession(input: {
    userId: string;
    email?: string;
    emailVerified?: boolean;
    displayName?: string;
  }): Promise<{ identity: AuthenticatedIdentity; cookies: readonly AuthCookie[] }> {
    const now = this.now();
    const nowMs = now.getTime();
    const record = await this.identityDirectory.findByIssuerSubject(
      this.config.issuer,
      input.userId,
    );
    const identityRecord =
      record ??
      (await this.identityDirectory.provisionFromClaims({
        issuer: this.config.issuer,
        subject: input.userId,
        email: input.email,
        emailVerified: input.emailVerified ?? Boolean(input.email),
      }));

    if (identityRecord.status !== "active") {
      throw new AuthenticationError("account_disabled", "user_inactive");
    }

    const token = randomUrlSafe(32);
    const sessionId = randomUrlSafe(16);
    await this.sessions.save({
      id: sessionId,
      tokenHash: sha256Hex(token),
      userId: identityRecord.userId,
      subject: identityRecord.subject,
      issuer: identityRecord.issuer,
      email: identityRecord.email ?? input.email,
      emailVerified: identityRecord.emailVerified,
      displayName: input.displayName,
      authenticatedAt: now.toISOString(),
      expiresAtMs: nowMs + this.config.sessionTtlSeconds * 1000,
    });

    const identity: AuthenticatedIdentity = {
      userId: identityRecord.userId,
      issuer: identityRecord.issuer,
      subject: identityRecord.subject,
      email: identityRecord.email ?? input.email,
      emailVerified: identityRecord.emailVerified,
      displayName: input.displayName,
      authenticatedAt: now.toISOString(),
    };

    return {
      identity,
      cookies: [
        {
          name: AUTH_SESSION_COOKIE,
          value: token,
          maxAgeSeconds: this.config.sessionTtlSeconds,
          httpOnly: true,
          sameSite: "lax",
          path: "/",
          secure: this.config.cookieSecure,
        },
      ],
    };
  }

  async logout(input: LogoutInput): Promise<LogoutResult> {
    if (input.sessionCookie) {
      await this.sessions.revokeByTokenHash(sha256Hex(input.sessionCookie), this.now().getTime());
    }
    return {
      cookies: [
        clearedCookie(AUTH_LOGIN_COOKIE, this.config.cookieSecure),
        clearedCookie(AUTH_SESSION_COOKIE, this.config.cookieSecure),
      ],
    };
  }

  async readSession(input: ReadSessionInput): Promise<AuthenticatedIdentity | null> {
    if (!input.sessionCookie) {
      return null;
    }
    const session = await this.sessions.findByTokenHash(
      sha256Hex(input.sessionCookie),
      this.now().getTime(),
    );
    if (!session || session.revokedAtMs) {
      return null;
    }
    return {
      userId: session.userId,
      issuer: session.issuer,
      subject: session.subject,
      email: session.email,
      emailVerified: session.emailVerified,
      displayName: session.displayName,
      authenticatedAt: session.authenticatedAt,
    };
  }
}

function clearedCookie(name: AuthCookie["name"], secure: boolean): AuthCookie {
  return {
    name,
    value: "",
    maxAgeSeconds: 0,
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure,
    cleared: true,
  };
}
