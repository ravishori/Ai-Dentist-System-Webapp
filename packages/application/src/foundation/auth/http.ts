import type { AuthenticatedIdentity, AuthCookie, AuthenticationPort } from "@dentalcare/domain";
import { AUTH_LOGIN_COOKIE, AUTH_SESSION_COOKIE, AuthenticationError } from "@dentalcare/domain";

export interface AuthHttpResult {
  readonly status: number;
  readonly headers: Record<string, string>;
  readonly cookies: readonly AuthCookie[];
  readonly body?: Record<string, unknown>;
  readonly redirectTo?: string;
}

function publicErrorStatus(error: AuthenticationError): number {
  if (error.code === "not_configured") return 503;
  if (error.code === "unauthorized") return 401;
  if (error.code === "provider_unavailable") return 503;
  return 400;
}

function publicErrorBody(error: AuthenticationError): Record<string, unknown> {
  return {
    error: "authentication_failed",
    message: error.message,
  };
}

function assertNoSecrets(value: string): void {
  const banned = ["id_token", "access_token", "refresh_token", "client_secret", "code_verifier"];
  const lower = value.toLowerCase();
  for (const item of banned) {
    if (lower.includes(item)) {
      throw new Error("refusing to emit authentication secret material");
    }
  }
}

export async function handleLoginGet(port: AuthenticationPort): Promise<AuthHttpResult> {
  try {
    const started = await port.startLogin();
    assertNoSecrets(started.authorizationUrl.split("#")[0] ?? started.authorizationUrl);
    return {
      status: 302,
      headers: { location: started.authorizationUrl },
      cookies: started.cookies,
    };
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return {
        status: publicErrorStatus(error),
        headers: { "content-type": "application/json" },
        cookies: [],
        body: publicErrorBody(error),
      };
    }
    throw error;
  }
}

export async function handleCallbackGet(
  port: AuthenticationPort,
  input: {
    code?: string;
    state?: string;
    error?: string;
    redirectUri?: string;
    loginCookie?: string;
    successRedirect: string;
  },
): Promise<AuthHttpResult> {
  if (input.redirectUri) {
    return {
      status: 400,
      headers: { "content-type": "application/json" },
      cookies: [],
      body: { error: "authentication_failed", message: "Authentication request was invalid." },
    };
  }
  try {
    const completed = await port.completeLogin({
      code: input.code,
      state: input.state,
      error: input.error,
      loginCookie: input.loginCookie,
    });
    return {
      status: 302,
      headers: { location: input.successRedirect },
      cookies: completed.cookies,
    };
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return {
        status: publicErrorStatus(error),
        headers: { "content-type": "application/json" },
        cookies: [],
        body: publicErrorBody(error),
      };
    }
    throw error;
  }
}

export async function handleLogoutPost(
  port: AuthenticationPort,
  input: { sessionCookie?: string; fallbackRedirect: string },
): Promise<AuthHttpResult> {
  const result = await port.logout({ sessionCookie: input.sessionCookie });
  const location = result.providerLogoutUrl ?? input.fallbackRedirect;
  return {
    status: 302,
    headers: { location },
    cookies: result.cookies,
  };
}

export async function handleSessionGet(
  port: AuthenticationPort,
  input: { sessionCookie?: string },
): Promise<AuthHttpResult> {
  const identity = await port.readSession({ sessionCookie: input.sessionCookie });
  if (!identity) {
    return {
      status: 401,
      headers: { "content-type": "application/json" },
      cookies: [],
      body: { error: "unauthenticated", message: "Authentication required." },
    };
  }
  return {
    status: 200,
    headers: { "content-type": "application/json" },
    cookies: [],
    body: toPublicIdentity(identity),
  };
}

function toPublicIdentity(identity: AuthenticatedIdentity): Record<string, unknown> {
  return {
    userId: identity.userId,
    subject: identity.subject,
    issuer: identity.issuer,
    emailVerified: identity.emailVerified,
    authenticatedAt: identity.authenticatedAt,
  };
}

export function cookieHeaderNames(): { login: string; session: string } {
  return { login: AUTH_LOGIN_COOKIE, session: AUTH_SESSION_COOKIE };
}
