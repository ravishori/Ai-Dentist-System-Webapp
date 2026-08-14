import type { AppConfig } from "@dentalcare/config";
import type { AuthenticationPort } from "@dentalcare/domain";
import { CognitoOidcAuthenticationAdapter } from "./cognito-oidc-adapter.js";
import { unsetAuthentication } from "./unset-adapter.js";
import type { LoginTransactionStore, SessionStore, UserIdentityDirectory } from "./types.js";

export function oidcConfigFromApp(config: AppConfig) {
  if (config.AUTH_PROVIDER !== "managed") {
    return null;
  }
  if (
    !config.OIDC_ISSUER ||
    !config.OIDC_CLIENT_ID ||
    !config.OIDC_REDIRECT_URI ||
    !config.AUTH_SESSION_SECRET
  ) {
    throw new Error("managed authentication is missing required OIDC configuration");
  }
  return {
    issuer: config.OIDC_ISSUER,
    clientId: config.OIDC_CLIENT_ID,
    clientSecret: config.OIDC_CLIENT_SECRET,
    redirectUri: config.OIDC_REDIRECT_URI,
    postLogoutRedirectUri: config.OIDC_POST_LOGOUT_REDIRECT_URI ?? config.APP_BASE_URL,
    sessionSecret: config.AUTH_SESSION_SECRET,
    sessionTtlSeconds: config.AUTH_SESSION_TTL_SECONDS,
    clockSkewSeconds: config.AUTH_CLOCK_SKEW_SECONDS,
    cookieSecure:
      config.AUTH_COOKIE_SECURE === "true" ||
      (config.AUTH_COOKIE_SECURE !== "false" && config.NODE_ENV === "production"),
    nodeEnv: config.NODE_ENV,
  };
}

export function createAuthenticationPort(input: {
  config: AppConfig;
  identityDirectory: UserIdentityDirectory;
  sessions: SessionStore;
  loginTransactions: LoginTransactionStore;
  fetchImpl?: typeof fetch;
}): AuthenticationPort {
  const oidc = oidcConfigFromApp(input.config);
  if (!oidc) {
    return unsetAuthentication;
  }
  return new CognitoOidcAuthenticationAdapter({
    config: oidc,
    identityDirectory: input.identityDirectory,
    sessions: input.sessions,
    loginTransactions: input.loginTransactions,
    fetchImpl: input.fetchImpl,
  });
}
