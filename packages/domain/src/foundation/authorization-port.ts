/**
 * Authorization port.
 *
 * M2 answers “what may this authenticated user do in this organization?”
 * Evaluation is application-owned. Cognito groups are not the authorization model.
 */
export type AuthorizationDenyReason =
  | "unauthenticated"
  | "malformed_context"
  | "user_missing"
  | "user_disabled"
  | "unknown_permission"
  | "unknown_role"
  | "missing_organization_context"
  | "organization_missing"
  | "organization_inactive"
  | "membership_missing"
  | "membership_inactive"
  | "membership_revoked"
  | "permission_missing"
  | "lookup_failure"
  | "session_user_mismatch";

export interface AuthorizationRequest {
  /** Application user id from the M1 session. Never taken from the client body. */
  readonly principalUserId?: string;
  /** Must equal principalUserId when both are present. */
  readonly sessionUserId?: string;
  /** Client-requested tenant. Server must verify membership or platform grant. */
  readonly requestedOrganizationId?: string;
  readonly permission?: string;
  /** Ignored if present. Client-supplied roles must never authorize. */
  readonly claimedRoles?: readonly string[];
  /** Ignored if present. Client-supplied permissions must never authorize. */
  readonly claimedPermissions?: readonly string[];
}

export interface AuthorizationContext {
  readonly userId: string;
  readonly organizationId?: string;
  readonly membershipId?: string;
  readonly roleKeys: readonly string[];
  readonly permissionKeys: readonly string[];
}

export interface AuthorizationDecision {
  readonly allowed: boolean;
  readonly reason: "allowed" | AuthorizationDenyReason;
  readonly context?: AuthorizationContext;
}

export interface AuthorizationPort {
  authorize(request: AuthorizationRequest): Promise<AuthorizationDecision>;
}
