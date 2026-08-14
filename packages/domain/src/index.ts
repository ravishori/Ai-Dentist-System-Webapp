export {
  FOUNDATION_BOUNDARY,
  AUTH_LOGIN_COOKIE,
  AUTH_SESSION_COOKIE,
  AuthenticationError,
  type AuthCookie,
  type AuthProviderId,
  type AuthenticationPort,
  type AuthenticationErrorCode,
  type AuthenticatedIdentity,
  type ApplicationUser,
  type UserAccountStatus,
  type CompleteLoginInput,
  type CompleteLoginResult,
  type LogoutInput,
  type LogoutResult,
  type ReadSessionInput,
  type StartLoginResult,
} from "./foundation/index.js";
export { PATIENT_BOUNDARY } from "./patient/index.js";
export { APPOINTMENT_BOUNDARY } from "./appointment/index.js";
export { NOTIFICATION_BOUNDARY } from "./notification/index.js";

export const DOMAIN_BOUNDARIES = ["foundation", "patient", "appointment", "notification"] as const;

export type DomainBoundary = (typeof DOMAIN_BOUNDARIES)[number];
