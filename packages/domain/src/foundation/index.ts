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
export {
  type AuthorizationPort,
  type AuthorizationRequest,
  type AuthorizationDecision,
  type AuthorizationContext,
  type AuthorizationDenyReason,
} from "./authorization-port.js";
export {
  FOUNDATION_PERMISSIONS,
  PLATFORM_PERMISSIONS,
  isFoundationPermission,
  isPlatformPermission,
  type FoundationPermission,
  type PlatformPermission,
} from "./permissions.js";
export {
  TENANT_ROLE_KEYS,
  PLATFORM_ROLE_KEYS,
  ROLE_KEYS,
  isTenantRoleKey,
  isPlatformRoleKey,
  isRoleKey,
  type TenantRoleKey,
  type PlatformRoleKey,
  type RoleKey,
} from "./roles.js";
