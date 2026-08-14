import type * as jose from "jose";
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
import {
  decodeSignedJson,
  encodeSignedJson,
  pkceChallenge,
  randomUrlSafe,
  sha256Hex,
} from "./crypto.js";
import { mapProviderIdentity } from "./identity-mapping.js";
import { createRemoteJwks, verifyIdToken } from "./id-token.js";
import { OidcDiscoveryClient } from "./oidc-discovery.js";
import { LOGIN_TRANSACTION_TTL_SECONDS, OIDC_SCOPES } from "./types.js";
import type {
  LoginTransactionStore,
  OidcRuntimeConfig,
  SessionStore,
  UserIdentityDirectory,
} from "./types.js";

interface LoginCookiePayload {
  readonly v: 1;
  readonly state: string;
  readonly nonce: string;
  readonly codeVerifier: string;
  readonly issuedAtMs: number;
}

interface TokenEndpointResponse {
  readonly id_token?: string;
  readonly access_token?: string;
  readonly refresh_token?: string;
  readonly token_type?: string;
}

export interface CognitoOidcAdapterDependencies {
  readonly config: OidcRuntimeConfig;
  readonly identityDirectory: UserIdentityDirectory;
  readonly sessions: SessionStore;
  readonly loginTransactions: LoginTransactionStore;
  readonly fetchImpl?: typeof fetch;
  readonly jwks?: jose.JWTVerifyGetKey;
  readonly now?: () => Date;
  readonly discovery?: OidcDiscoveryClient;
}

/**
 * Cognito User Pool adapter implemented as standards-based OIDC.
 * No AWS SDK. Cognito-specific types do not leak through AuthenticationPort.
 */
export class CognitoOidcAuthenticationAdapter implements AuthenticationPort {
  readonly providerId = "managed" as const;
  private readonly config: OidcRuntimeConfig;
  private readonly identityDirectory: UserIdentityDirectory;
  private readonly sessions: SessionStore;
  private readonly loginTransactions: LoginTransactionStore;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => Date;
  private readonly discovery: OidcDiscoveryClient;
  private readonly jwksOverride?: jose.JWTVerifyGetKey;
  private remoteJwks?: jose.JWTVerifyGetKey;
  private remoteJwksUri?: string;

  constructor(deps: CognitoOidcAdapterDependencies) {
    this.config = deps.config;
    this.identityDirectory = deps.identityDirectory;
    this.sessions = deps.sessions;
    this.loginTransactions = deps.loginTransactions;
    this.fetchImpl = deps.fetchImpl ?? fetch;
    this.now = deps.now ?? (() => new Date());
    this.discovery =
      deps.discovery ??
      new OidcDiscoveryClient(this.config, this.fetchImpl, () => this.now().getTime());
    this.jwksOverride = deps.jwks;
  }

  isConfigured(): boolean {
    return true;
  }

  async startLogin(): Promise<StartLoginResult> {
    const document = await this.discovery.load();
    const state = randomUrlSafe(32);
    const nonce = randomUrlSafe(32);
    const codeVerifier = randomUrlSafe(32);
    const codeChallenge = await pkceChallenge(codeVerifier);
    const nowMs = this.now().getTime();

    await this.loginTransactions.save({
      stateHash: sha256Hex(state),
      nonceHash: sha256Hex(nonce),
      redirectUri: this.config.redirectUri,
      expiresAtMs: nowMs + LOGIN_TRANSACTION_TTL_SECONDS * 1000,
    });

    const authorizationUrl = new URL(document.authorization_endpoint);
    authorizationUrl.searchParams.set("client_id", this.config.clientId);
    authorizationUrl.searchParams.set("response_type", "code");
    authorizationUrl.searchParams.set("scope", OIDC_SCOPES);
    authorizationUrl.searchParams.set("redirect_uri", this.config.redirectUri);
    authorizationUrl.searchParams.set("state", state);
    authorizationUrl.searchParams.set("nonce", nonce);
    authorizationUrl.searchParams.set("code_challenge", codeChallenge);
    authorizationUrl.searchParams.set("code_challenge_method", "S256");

    const loginCookie = encodeSignedJson(this.config.sessionSecret, {
      v: 1,
      state,
      nonce,
      codeVerifier,
      issuedAtMs: nowMs,
    } satisfies LoginCookiePayload);

    return {
      authorizationUrl: authorizationUrl.toString(),
      cookies: [this.cookie(AUTH_LOGIN_COOKIE, loginCookie, LOGIN_TRANSACTION_TTL_SECONDS)],
    };
  }

  async completeLogin(input: CompleteLoginInput): Promise<CompleteLoginResult> {
    if (input.error) {
      throw new AuthenticationError("invalid_request", "provider_authorization_error");
    }
    if (!input.code || !input.state || !input.loginCookie) {
      throw new AuthenticationError("invalid_request", "missing_callback_parameters");
    }

    const payload = decodeSignedJson<LoginCookiePayload>(
      this.config.sessionSecret,
      input.loginCookie,
    );
    if (!payload || payload.v !== 1 || payload.state !== input.state) {
      throw new AuthenticationError("invalid_state", "login_cookie_state_mismatch");
    }

    const nowMs = this.now().getTime();
    if (nowMs - payload.issuedAtMs > LOGIN_TRANSACTION_TTL_SECONDS * 1000) {
      throw new AuthenticationError("invalid_state", "login_transaction_expired");
    }

    const transaction = await this.loginTransactions.consume(sha256Hex(input.state), nowMs);
    if (!transaction) {
      throw new AuthenticationError("invalid_state", "state_replay_or_unknown");
    }
    if (transaction.nonceHash !== sha256Hex(payload.nonce)) {
      throw new AuthenticationError("invalid_nonce", "nonce_binding_mismatch");
    }
    if (transaction.redirectUri !== this.config.redirectUri) {
      throw new AuthenticationError("invalid_request", "redirect_uri_not_allowlisted");
    }

    const document = await this.discovery.load();
    const tokens = await this.exchangeCode(
      document.token_endpoint,
      input.code,
      payload.codeVerifier,
    );
    if (!tokens.id_token) {
      throw new AuthenticationError("invalid_token", "missing_id_token");
    }

    const jwks = await this.jwksFor(document.jwks_uri);
    const claims = await verifyIdToken({
      idToken: tokens.id_token,
      jwks,
      config: this.config,
      nonce: payload.nonce,
      now: this.now,
    });

    const identityRecord = await mapProviderIdentity(this.identityDirectory, {
      issuer: claims.issuer,
      subject: claims.subject,
      email: claims.email,
      emailVerified: claims.emailVerified,
    });

    const sessionToken = randomUrlSafe(32);
    const authenticatedAt = this.now().toISOString();
    await this.sessions.save({
      id: randomUrlSafe(16),
      tokenHash: sha256Hex(sessionToken),
      userId: identityRecord.userId,
      subject: claims.subject,
      issuer: claims.issuer,
      email: identityRecord.email,
      emailVerified: identityRecord.emailVerified,
      displayName: claims.displayName,
      authenticatedAt,
      expiresAtMs: nowMs + this.config.sessionTtlSeconds * 1000,
    });

    const identity: AuthenticatedIdentity = {
      userId: identityRecord.userId,
      subject: claims.subject,
      issuer: claims.issuer,
      email: identityRecord.email,
      emailVerified: identityRecord.emailVerified,
      displayName: claims.displayName,
      authenticatedAt,
    };

    return {
      identity,
      cookies: [
        this.cleared(AUTH_LOGIN_COOKIE),
        this.cookie(AUTH_SESSION_COOKIE, sessionToken, this.config.sessionTtlSeconds),
      ],
    };
  }

  async logout(input: LogoutInput): Promise<LogoutResult> {
    if (input.sessionCookie) {
      await this.sessions.revokeByTokenHash(sha256Hex(input.sessionCookie), this.now().getTime());
    }
    let providerLogoutUrl: string | undefined;
    try {
      const document = await this.discovery.load();
      if (document.end_session_endpoint) {
        const logoutUrl = new URL(document.end_session_endpoint);
        logoutUrl.searchParams.set("client_id", this.config.clientId);
        logoutUrl.searchParams.set("logout_uri", this.config.postLogoutRedirectUri);
        providerLogoutUrl = logoutUrl.toString();
      }
    } catch {
      providerLogoutUrl = undefined;
    }
    return {
      cookies: [this.cleared(AUTH_LOGIN_COOKIE), this.cleared(AUTH_SESSION_COOKIE)],
      providerLogoutUrl,
    };
  }

  async readSession(input: ReadSessionInput): Promise<AuthenticatedIdentity | null> {
    if (!input.sessionCookie) {
      return null;
    }
    const record = await this.sessions.findByTokenHash(
      sha256Hex(input.sessionCookie),
      this.now().getTime(),
    );
    if (!record) {
      return null;
    }
    return {
      userId: record.userId,
      subject: record.subject,
      issuer: record.issuer,
      email: record.email,
      emailVerified: record.emailVerified,
      displayName: record.displayName,
      authenticatedAt: record.authenticatedAt,
    };
  }

  private async exchangeCode(
    tokenEndpoint: string,
    code: string,
    codeVerifier: string,
  ): Promise<TokenEndpointResponse> {
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      client_id: this.config.clientId,
      code,
      redirect_uri: this.config.redirectUri,
      code_verifier: codeVerifier,
    });
    if (this.config.clientSecret) {
      body.set("client_secret", this.config.clientSecret);
    }
    let response: Response;
    try {
      response = await this.fetchImpl(tokenEndpoint, {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          accept: "application/json",
        },
        body,
        redirect: "error",
      });
    } catch {
      throw new AuthenticationError("provider_unavailable", "token_endpoint_unreachable");
    }
    if (!response.ok) {
      if (response.status >= 500) {
        throw new AuthenticationError("provider_unavailable", "token_endpoint_http_error");
      }
      throw new AuthenticationError("invalid_token", "authorization_code_rejected");
    }
    let json: unknown;
    try {
      json = await response.json();
    } catch {
      throw new AuthenticationError("provider_unavailable", "malformed_token_response");
    }
    if (!json || typeof json !== "object") {
      throw new AuthenticationError("provider_unavailable", "malformed_token_response");
    }
    const record = json as Record<string, unknown>;
    return {
      id_token: typeof record.id_token === "string" ? record.id_token : undefined,
      access_token: typeof record.access_token === "string" ? record.access_token : undefined,
      refresh_token: typeof record.refresh_token === "string" ? record.refresh_token : undefined,
      token_type: typeof record.token_type === "string" ? record.token_type : undefined,
    };
  }

  private async jwksFor(jwksUri: string): Promise<jose.JWTVerifyGetKey> {
    if (this.jwksOverride) {
      return this.jwksOverride;
    }
    if (!this.remoteJwks || this.remoteJwksUri !== jwksUri) {
      this.remoteJwks = createRemoteJwks(jwksUri);
      this.remoteJwksUri = jwksUri;
    }
    return this.remoteJwks;
  }

  private cookie(name: AuthCookie["name"], value: string, maxAgeSeconds: number): AuthCookie {
    return {
      name,
      value,
      maxAgeSeconds,
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      secure: this.config.cookieSecure,
    };
  }

  private cleared(name: AuthCookie["name"]): AuthCookie {
    return {
      ...this.cookie(name, "", 0),
      cleared: true,
    };
  }
}
