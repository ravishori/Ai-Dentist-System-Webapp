import type {
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

export class UnsetAuthenticationPort implements AuthenticationPort {
  readonly providerId = "unset" as const;

  isConfigured(): boolean {
    return false;
  }

  async startLogin(): Promise<StartLoginResult> {
    throw new AuthenticationError("not_configured", "auth_provider_unset");
  }

  async completeLogin(_input: CompleteLoginInput): Promise<CompleteLoginResult> {
    throw new AuthenticationError("not_configured", "auth_provider_unset");
  }

  async logout(_input: LogoutInput): Promise<LogoutResult> {
    return {
      cookies: [clearedCookie(AUTH_LOGIN_COOKIE, false), clearedCookie(AUTH_SESSION_COOKIE, false)],
    };
  }

  async readSession(_input: ReadSessionInput) {
    return null;
  }
}

export const unsetAuthentication = new UnsetAuthenticationPort();

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
