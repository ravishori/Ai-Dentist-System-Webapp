import type { AppConfig } from "@dentalcare/config";
import type { AuthenticationPort } from "@dentalcare/domain";
import { OtpAuthenticationAdapter } from "../../identity/otp-auth-adapter.js";
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

export function otpConfigFromApp(config: AppConfig) {
  if (config.AUTH_PROVIDER !== "otp") {
    return null;
  }
  if (!config.OTP_ISSUER || !config.OTP_PEPPER || !config.AUTH_SESSION_SECRET) {
    throw new Error("otp authentication is missing required configuration");
  }
  return {
    issuer: config.OTP_ISSUER,
    sessionSecret: config.AUTH_SESSION_SECRET,
    sessionTtlSeconds: config.AUTH_SESSION_TTL_SECONDS,
    cookieSecure:
      config.AUTH_COOKIE_SECURE === "true" ||
      (config.AUTH_COOKIE_SECURE !== "false" && config.NODE_ENV === "production"),
    appBaseUrl: config.APP_BASE_URL,
    pepper: config.OTP_PEPPER,
    length: config.OTP_LENGTH,
    ttlSeconds: config.OTP_TTL_SECONDS,
    maxAttempts: config.OTP_MAX_ATTEMPTS,
    resendCooldownSeconds: config.OTP_RESEND_COOLDOWN_SECONDS,
    maxResends: config.OTP_MAX_RESENDS,
    requestRateLimit: {
      windowSeconds: config.OTP_RATE_LIMIT_WINDOW_SECONDS,
      maxRequests: config.OTP_RATE_LIMIT_MAX_REQUESTS,
    },
    verifyRateLimit: {
      windowSeconds: config.OTP_RATE_LIMIT_WINDOW_SECONDS,
      maxRequests: config.OTP_VERIFY_RATE_LIMIT_MAX,
    },
    invitationTtlSeconds: config.INVITATION_TTL_SECONDS,
    registrationSessionTtlSeconds: config.REGISTRATION_SESSION_TTL_SECONDS,
    smsProvider: config.SMS_PROVIDER,
    allowFakeSms: config.OTP_ALLOW_FAKE_SMS === "true",
  };
}

export function createAuthenticationPort(input: {
  config: AppConfig;
  identityDirectory: UserIdentityDirectory;
  sessions: SessionStore;
  loginTransactions: LoginTransactionStore;
  fetchImpl?: typeof fetch;
}): AuthenticationPort {
  if (input.config.AUTH_PROVIDER === "otp") {
    const otp = otpConfigFromApp(input.config);
    if (!otp) {
      return unsetAuthentication;
    }
    return new OtpAuthenticationAdapter(
      {
        issuer: otp.issuer,
        sessionSecret: otp.sessionSecret,
        sessionTtlSeconds: otp.sessionTtlSeconds,
        cookieSecure: otp.cookieSecure,
        appBaseUrl: otp.appBaseUrl,
      },
      input.identityDirectory,
      input.sessions,
    );
  }
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
