import type { PrismaClient } from "@prisma/client";
import type {
  AuthorizationDirectory,
  AuthorizationUserRecord,
  MembershipRecord,
  MembershipStatus,
  OrganizationRecord,
} from "@dentalcare/application";

export class PrismaAuthorizationDirectory implements AuthorizationDirectory {
  constructor(private readonly prisma: PrismaClient) {}

  async getUser(userId: string): Promise<AuthorizationUserRecord | null> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return null;
    }
    return {
      id: user.id,
      status: user.status === "disabled" ? "disabled" : "active",
    };
  }

  async getOrganization(organizationId: string): Promise<OrganizationRecord | null> {
    const organization = await this.prisma.organization.findUnique({
      where: { id: organizationId },
    });
    if (!organization) {
      return null;
    }
    return {
      id: organization.id,
      name: organization.name,
      status: organization.status === "active" ? "active" : "inactive",
    };
  }

  async getMembership(userId: string, organizationId: string): Promise<MembershipRecord | null> {
    const membership = await this.prisma.membership.findUnique({
      where: { userId_organizationId: { userId, organizationId } },
    });
    if (!membership) {
      return null;
    }
    return {
      id: membership.id,
      userId: membership.userId,
      organizationId: membership.organizationId,
      branchId: membership.branchId ?? undefined,
      status: toMembershipStatus(membership.status),
    };
  }

  async getMembershipRoleKeys(membershipId: string): Promise<readonly string[]> {
    const rows = await this.prisma.membershipRole.findMany({
      where: { membershipId },
      include: { role: true },
    });
    return rows.map((row) => row.role.key);
  }

  async getPlatformRoleKeys(userId: string): Promise<readonly string[]> {
    const rows = await this.prisma.userPlatformRole.findMany({
      where: { userId },
      include: { role: true },
    });
    return rows.map((row) => row.role.key);
  }

  async getPermissionKeysForRoles(roleKeys: readonly string[]): Promise<readonly string[]> {
    if (roleKeys.length === 0) {
      return [];
    }
    const rows = await this.prisma.rolePermission.findMany({
      where: { role: { key: { in: [...roleKeys] } } },
      include: { permission: true },
    });
    return [...new Set(rows.map((row) => row.permission.key))];
  }
}

function toMembershipStatus(status: string): MembershipStatus {
  if (status === "revoked") return "revoked";
  if (status === "inactive") return "inactive";
  return "active";
}
