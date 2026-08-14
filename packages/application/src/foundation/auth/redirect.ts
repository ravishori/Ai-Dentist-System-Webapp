import { AuthenticationError } from "@dentalcare/domain";
import type { OidcRuntimeConfig } from "./types.js";

export function assertConfiguredRedirectUri(
  configured: string,
  candidate: string | undefined,
): string {
  if (candidate && candidate !== configured) {
    throw new AuthenticationError("invalid_request", "redirect_uri_not_allowlisted");
  }
  return configured;
}

export function isAllowlistedPostLogoutUri(config: OidcRuntimeConfig, candidate?: string): string {
  const allowed = config.postLogoutRedirectUri;
  if (!candidate || candidate === allowed) {
    return allowed;
  }
  throw new AuthenticationError("invalid_request", "logout_redirect_not_allowlisted");
}

export function rejectClientSuppliedJwksUrl(candidate: string | undefined): void {
  if (candidate) {
    throw new AuthenticationError("invalid_request", "client_jwks_url_rejected");
  }
}
