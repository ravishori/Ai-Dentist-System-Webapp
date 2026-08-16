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
  PATIENT_PERMISSIONS,
  APPOINTMENT_PERMISSIONS,
  NOTIFICATION_PERMISSIONS,
  PRACTITIONER_PERMISSIONS,
  IDENTITY_PERMISSIONS,
  APPLICATION_PERMISSIONS,
  PLATFORM_PERMISSIONS,
  isFoundationPermission,
  isPatientPermission,
  isAppointmentPermission,
  isNotificationPermission,
  isPractitionerPermission,
  isIdentityPermission,
  isApplicationPermission,
  isPlatformPermission,
  type FoundationPermission,
  type PatientPermission,
  type AppointmentPermission,
  type NotificationPermission,
  type PractitionerPermission,
  type IdentityPermission,
  type ApplicationPermission,
  type PlatformPermission,
} from "./permissions.js";
export {
  ADDRESS_TYPES,
  isAddressType,
  type AddressType,
  type Address,
  type AddressCreateInput,
} from "./address.js";
export {
  INVITATION_PURPOSES,
  INVITATION_STATUSES,
  CLINIC_CODE_STATUSES,
  isInvitationPurpose,
  isInvitationStatus,
  isClinicCodeStatus,
  type InvitationPurpose,
  type InvitationStatus,
  type OrganizationInvitation,
  type ClinicCodeStatus,
  type ClinicCode,
} from "./invitation.js";
export {
  OTP_DESTINATION_TYPES,
  OTP_PURPOSES,
  REGISTRATION_SESSION_STATUSES,
  isOtpDestinationType,
  isOtpPurpose,
  isRegistrationSessionStatus,
  type OtpDestinationType,
  type OtpPurpose,
  type AuthOtpChallenge,
  type RegistrationSessionStatus,
  type RegistrationSession,
  type AddressDraft,
} from "./otp.js";
export { type PatientUserLink } from "./patient-user-link.js";
export {
  type SmsDeliveryOutcome,
  type SmsMessage,
  type SmsDeliveryResult,
  type SmsDeliveryPort,
} from "./sms-delivery-port.js";
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
