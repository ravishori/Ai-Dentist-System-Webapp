import type {
  AuthorizationContext,
  AuthorizationDecision,
  AuthorizationDenyReason,
  AuthorizationPort,
  AuthorizationRequest,
} from "@dentalcare/domain";
import {
  isApplicationPermission,
  isPlatformPermission,
  isPlatformRoleKey,
  isTenantRoleKey,
} from "@dentalcare/domain";
import type { AuthorizationDirectory } from "./types.js";

const EMPTY_DECISION = {
  allowed: false as const,
};

/**
 * Default-deny RBAC evaluator (TDA-ADR-002 §10).
 * Cognito groups, email, and client-supplied roles/permissions are ignored.
 */
export class RbacAuthorizationAdapter implements AuthorizationPort {
  constructor(private readonly directory: AuthorizationDirectory) {}

  async authorize(request: AuthorizationRequest): Promise<AuthorizationDecision> {
    try {
      return await this.evaluate(request);
    } catch {
      return { ...EMPTY_DECISION, reason: "lookup_failure" };
    }
  }

  private async evaluate(request: AuthorizationRequest): Promise<AuthorizationDecision> {
    const principalUserId = normalizeId(request.principalUserId);
    const sessionUserId = normalizeId(request.sessionUserId);
    if (principalUserId && sessionUserId && principalUserId !== sessionUserId) {
      return deny("session_user_mismatch");
    }

    const userId = principalUserId ?? sessionUserId;
    if (!userId) {
      return deny("unauthenticated");
    }

    const permission = request.permission?.trim() ?? "";
    if (!permission || !request.permission) {
      return deny("malformed_context");
    }
    if (!isApplicationPermission(permission)) {
      return deny("unknown_permission");
    }

    const user = await this.directory.getUser(userId);
    if (!user) {
      return deny("user_missing");
    }
    if (user.status !== "active") {
      return deny("user_disabled");
    }

    const platformRoleKeys = knownPlatformRoles(await this.directory.getPlatformRoleKeys(userId));
    const requestedOrganizationId = normalizeId(request.requestedOrganizationId);

    if (isPlatformPermission(permission)) {
      if (!platformRoleKeys.includes("SYSTEM_ADMIN")) {
        return deny("permission_missing");
      }
      return allow({
        userId,
        roleKeys: platformRoleKeys,
        permissionKeys: await this.directory.getPermissionKeysForRoles(platformRoleKeys),
      });
    }

    if (!requestedOrganizationId) {
      return deny("missing_organization_context");
    }

    const organization = await this.directory.getOrganization(requestedOrganizationId);
    if (!organization) {
      return deny("organization_missing");
    }
    if (organization.status !== "active") {
      return deny("organization_inactive");
    }

    if (platformRoleKeys.includes("SYSTEM_ADMIN")) {
      const permissionKeys = await this.directory.getPermissionKeysForRoles(platformRoleKeys);
      if (permissionKeys.includes(permission)) {
        return allow({
          userId,
          organizationId: organization.id,
          roleKeys: platformRoleKeys,
          permissionKeys,
        });
      }
    }

    const membership = await this.directory.getMembership(userId, organization.id);
    if (!membership) {
      return deny("membership_missing");
    }
    if (membership.status === "revoked") {
      return deny("membership_revoked");
    }
    if (membership.status !== "active") {
      return deny("membership_inactive");
    }

    const rawRoleKeys = await this.directory.getMembershipRoleKeys(membership.id);
    const tenantRoleKeys = rawRoleKeys.filter(isTenantRoleKey);
    if (rawRoleKeys.length > 0 && tenantRoleKeys.length === 0) {
      return deny("unknown_role");
    }

    const permissionKeys = await this.directory.getPermissionKeysForRoles(tenantRoleKeys);
    if (!permissionKeys.includes(permission)) {
      return deny("permission_missing");
    }

    return allow({
      userId,
      organizationId: organization.id,
      membershipId: membership.id,
      roleKeys: tenantRoleKeys,
      permissionKeys,
    });
  }
}

function normalizeId(value: string | undefined): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function deny(reason: AuthorizationDenyReason): AuthorizationDecision {
  return { allowed: false, reason };
}

function allow(context: AuthorizationContext): AuthorizationDecision {
  return { allowed: true, reason: "allowed", context };
}

function knownPlatformRoles(keys: readonly string[]): string[] {
  return keys.filter(isPlatformRoleKey);
}
