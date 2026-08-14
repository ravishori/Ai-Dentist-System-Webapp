export type AuthenticationErrorCode =
  | "not_configured"
  | "invalid_request"
  | "invalid_state"
  | "invalid_nonce"
  | "invalid_token"
  | "account_disabled"
  | "provider_unavailable"
  | "unauthorized";

const CLIENT_MESSAGES: Record<AuthenticationErrorCode, string> = {
  not_configured: "Authentication is not configured.",
  invalid_request: "Authentication request was invalid.",
  invalid_state: "Authentication request was invalid.",
  invalid_nonce: "Authentication request was invalid.",
  invalid_token: "Authentication request was invalid.",
  account_disabled: "Authentication request was invalid.",
  provider_unavailable: "Authentication is temporarily unavailable.",
  unauthorized: "Authentication required.",
};

export class AuthenticationError extends Error {
  readonly code: AuthenticationErrorCode;
  readonly category: string;

  constructor(code: AuthenticationErrorCode, category: string) {
    super(CLIENT_MESSAGES[code]);
    this.name = "AuthenticationError";
    this.code = code;
    this.category = category;
  }
}
