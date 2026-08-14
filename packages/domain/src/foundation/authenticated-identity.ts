/**
 * Application-neutral authenticated identity.
 * OIDC subject + issuer is the stable external identity reference (TDA-ADR-002).
 * Email is not the immutable identity key.
 */
export interface AuthenticatedIdentity {
  readonly userId: string;
  readonly subject: string;
  readonly issuer: string;
  readonly email?: string;
  readonly emailVerified?: boolean;
  readonly displayName?: string;
  readonly authenticatedAt: string;
}

export type UserAccountStatus = "active" | "disabled";

export interface ApplicationUser {
  readonly id: string;
  readonly status: UserAccountStatus;
  readonly email?: string;
  readonly emailVerified: boolean;
}
