export const FOUNDATION_BOUNDARY = "foundation" as const;

export {
  AUTH_LOGIN_COOKIE,
  AUTH_SESSION_COOKIE,
  type AuthCookie,
  type AuthProviderId,
  type AuthenticationPort,
  type CompleteLoginInput,
  type CompleteLoginResult,
  type LogoutInput,
  type LogoutResult,
  type ReadSessionInput,
  type StartLoginResult,
} from "./auth-port.js";
export {
  type AuthenticatedIdentity,
  type ApplicationUser,
  type UserAccountStatus,
} from "./authenticated-identity.js";
export { AuthenticationError, type AuthenticationErrorCode } from "./authentication-error.js";
