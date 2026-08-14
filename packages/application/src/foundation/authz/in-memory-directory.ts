import type {
  AuthorizationDirectory,
  AuthorizationUserRecord,
  MembershipRecord,
  MembershipStatus,
  OrganizationRecord,
  RecordStatus,
} from "./types.js";

interface StoredMembership extends MembershipRecord {
  roleKeys: string[];
}

export class InMemoryAuthorizationDirectory implements AuthorizationDirectory {
  readonly users = new Map<string, AuthorizationUserRecord>();
  readonly organizations = new Map<string, OrganizationRecord>();
  readonly memberships = new Map<string, StoredMembership>();
  readonly platformRoles = new Map<string, string[]>();
  readonly rolePermissions = new Map<string, string[]>();
  failLookups = false;
  private membershipSeq = 0;

  constructor() {
    this.rolePermissions.set("PATIENT", ["organization.read"]);
    this.rolePermissions.set("STAFF", ["organization.read"]);
    this.rolePermissions.set("PRACTITIONER", ["organization.read"]);
    this.rolePermissions.set("PRACTICE_ADMIN", [
      "organization.read",
      "membership.manage",
      "role.assign",
      "audit.read",
    ]);
    this.rolePermissions.set("SYSTEM_ADMIN", [
      "organization.read",
      "membership.manage",
      "role.assign",
      "audit.read",
      "security.manage",
    ]);
  }

  addUser(id: string, status: AuthorizationUserRecord["status"] = "active"): this {
    this.users.set(id, { id, status });
    return this;
  }

  addOrganization(id: string, status: RecordStatus = "active", name = `Organization ${id}`): this {
    this.organizations.set(id, { id, name, status });
    return this;
  }

  addMembership(input: {
    userId: string;
    organizationId: string;
    status?: MembershipStatus;
    roleKeys?: readonly string[];
    id?: string;
  }): StoredMembership {
    const key = membershipKey(input.userId, input.organizationId);
    if (this.memberships.has(key)) {
      throw new Error("duplicate_membership");
    }
    this.membershipSeq += 1;
    const record: StoredMembership = {
      id: input.id ?? `membership_${this.membershipSeq}`,
      userId: input.userId,
      organizationId: input.organizationId,
      status: input.status ?? "active",
      roleKeys: [...(input.roleKeys ?? [])],
    };
    this.memberships.set(key, record);
    return record;
  }

  setPlatformRoles(userId: string, roleKeys: readonly string[]): this {
    this.platformRoles.set(userId, [...roleKeys]);
    return this;
  }

  setRolePermissions(roleKey: string, permissions: readonly string[]): this {
    this.rolePermissions.set(roleKey, [...permissions]);
    return this;
  }

  async getUser(userId: string): Promise<AuthorizationUserRecord | null> {
    this.assertAvailable();
    return this.users.get(userId) ?? null;
  }

  async getOrganization(organizationId: string): Promise<OrganizationRecord | null> {
    this.assertAvailable();
    return this.organizations.get(organizationId) ?? null;
  }

  async getMembership(userId: string, organizationId: string): Promise<MembershipRecord | null> {
    this.assertAvailable();
    return this.memberships.get(membershipKey(userId, organizationId)) ?? null;
  }

  async getMembershipRoleKeys(membershipId: string): Promise<readonly string[]> {
    this.assertAvailable();
    for (const membership of this.memberships.values()) {
      if (membership.id === membershipId) {
        return membership.roleKeys;
      }
    }
    return [];
  }

  async getPlatformRoleKeys(userId: string): Promise<readonly string[]> {
    this.assertAvailable();
    return this.platformRoles.get(userId) ?? [];
  }

  async getPermissionKeysForRoles(roleKeys: readonly string[]): Promise<readonly string[]> {
    this.assertAvailable();
    const permissions = new Set<string>();
    for (const roleKey of roleKeys) {
      for (const permission of this.rolePermissions.get(roleKey) ?? []) {
        permissions.add(permission);
      }
    }
    return [...permissions];
  }

  private assertAvailable(): void {
    if (this.failLookups) {
      throw new Error("authorization_directory_unavailable");
    }
  }
}

function membershipKey(userId: string, organizationId: string): string {
  return `${userId}|${organizationId}`;
}
