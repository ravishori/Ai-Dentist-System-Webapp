import type { AuthorizationDecision, AuthorizationRequest } from "@dentalcare/domain";

export type MembershipStatus = "active" | "inactive" | "revoked";
export type RecordStatus = "active" | "inactive";

export interface AuthorizationUserRecord {
  readonly id: string;
  readonly status: "active" | "disabled";
}

export interface OrganizationRecord {
  readonly id: string;
  readonly name: string;
  readonly status: RecordStatus;
}

export interface MembershipRecord {
  readonly id: string;
  readonly userId: string;
  readonly organizationId: string;
  readonly branchId?: string;
  readonly status: MembershipStatus;
}

export interface AuthorizationDirectory {
  getUser(userId: string): Promise<AuthorizationUserRecord | null>;
  getOrganization(organizationId: string): Promise<OrganizationRecord | null>;
  getMembership(userId: string, organizationId: string): Promise<MembershipRecord | null>;
  getMembershipRoleKeys(membershipId: string): Promise<readonly string[]>;
  getPlatformRoleKeys(userId: string): Promise<readonly string[]>;
  getPermissionKeysForRoles(roleKeys: readonly string[]): Promise<readonly string[]>;
}

export interface AuthorizationEvaluator {
  authorize(request: AuthorizationRequest): Promise<AuthorizationDecision>;
}
