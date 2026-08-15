import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { RbacAuthorizationAdapter } from "./rbac-adapter.js";
import { InMemoryAuthorizationDirectory } from "./in-memory-directory.js";
import { handleOrganizationAuthorizeGet } from "./http.js";
import type { AuthenticatedIdentity } from "@dentalcare/domain";

const USER = "user_1";
const ORG_A = "org_a";
const ORG_B = "org_b";

function identity(userId = USER): AuthenticatedIdentity {
  return {
    userId,
    issuer: "https://example.test",
    subject: "sub-1",
    authenticatedAt: "2026-08-14T00:00:00.000Z",
  };
}

function directoryWithPracticeAdmin(): InMemoryAuthorizationDirectory {
  const directory = new InMemoryAuthorizationDirectory();
  directory.addUser(USER).addOrganization(ORG_A).addOrganization(ORG_B);
  directory.addMembership({
    userId: USER,
    organizationId: ORG_A,
    roleKeys: ["PRACTICE_ADMIN"],
  });
  return directory;
}

describe("M2 authorization security", () => {
  it("1. unauthenticated user is denied", async () => {
    const adapter = new RbacAuthorizationAdapter(directoryWithPracticeAdmin());
    await expect(adapter.authorize({ permission: "organization.read" })).resolves.toMatchObject({
      allowed: false,
      reason: "unauthenticated",
    });
  });

  it("2. authenticated user without membership is denied", async () => {
    const directory = new InMemoryAuthorizationDirectory();
    directory.addUser(USER).addOrganization(ORG_A);
    const adapter = new RbacAuthorizationAdapter(directory);
    await expect(
      adapter.authorize({
        principalUserId: USER,
        requestedOrganizationId: ORG_A,
        permission: "organization.read",
      }),
    ).resolves.toMatchObject({ allowed: false, reason: "membership_missing" });
  });

  it("3. authenticated user with inactive membership is denied", async () => {
    const directory = new InMemoryAuthorizationDirectory();
    directory.addUser(USER).addOrganization(ORG_A);
    directory.addMembership({
      userId: USER,
      organizationId: ORG_A,
      status: "inactive",
      roleKeys: ["PRACTICE_ADMIN"],
    });
    const adapter = new RbacAuthorizationAdapter(directory);
    await expect(
      adapter.authorize({
        principalUserId: USER,
        requestedOrganizationId: ORG_A,
        permission: "organization.read",
      }),
    ).resolves.toMatchObject({ allowed: false, reason: "membership_inactive" });
  });

  it("4/7. valid membership with required permission is allowed", async () => {
    const adapter = new RbacAuthorizationAdapter(directoryWithPracticeAdmin());
    const decision = await adapter.authorize({
      principalUserId: USER,
      requestedOrganizationId: ORG_A,
      permission: "organization.read",
    });
    expect(decision).toMatchObject({
      allowed: true,
      reason: "allowed",
      context: { userId: USER, organizationId: ORG_A },
    });
    expect(decision.context?.permissionKeys).toContain("organization.read");
  });

  it("5. valid membership without required role is denied", async () => {
    const directory = new InMemoryAuthorizationDirectory();
    directory.addUser(USER).addOrganization(ORG_A);
    directory.addMembership({ userId: USER, organizationId: ORG_A, roleKeys: [] });
    const adapter = new RbacAuthorizationAdapter(directory);
    await expect(
      adapter.authorize({
        principalUserId: USER,
        requestedOrganizationId: ORG_A,
        permission: "organization.read",
      }),
    ).resolves.toMatchObject({ allowed: false, reason: "permission_missing" });
  });

  it("6. valid role without required permission is denied", async () => {
    const directory = new InMemoryAuthorizationDirectory();
    directory.addUser(USER).addOrganization(ORG_A);
    directory.addMembership({ userId: USER, organizationId: ORG_A, roleKeys: ["STAFF"] });
    const adapter = new RbacAuthorizationAdapter(directory);
    await expect(
      adapter.authorize({
        principalUserId: USER,
        requestedOrganizationId: ORG_A,
        permission: "membership.manage",
      }),
    ).resolves.toMatchObject({ allowed: false, reason: "permission_missing" });
  });

  it("8/19. membership in organization A does not authorize organization B", async () => {
    const adapter = new RbacAuthorizationAdapter(directoryWithPracticeAdmin());
    await expect(
      adapter.authorize({
        principalUserId: USER,
        requestedOrganizationId: ORG_B,
        permission: "organization.read",
      }),
    ).resolves.toMatchObject({ allowed: false, reason: "membership_missing" });
  });

  it("9. tenant context tampering via claimed roles/permissions is ignored", async () => {
    const directory = new InMemoryAuthorizationDirectory();
    directory.addUser(USER).addOrganization(ORG_A);
    directory.addMembership({ userId: USER, organizationId: ORG_A, roleKeys: ["STAFF"] });
    const adapter = new RbacAuthorizationAdapter(directory);
    await expect(
      adapter.authorize({
        principalUserId: USER,
        requestedOrganizationId: ORG_A,
        permission: "membership.manage",
        claimedRoles: ["PRACTICE_ADMIN", "SYSTEM_ADMIN"],
        claimedPermissions: ["membership.manage", "security.manage"],
      }),
    ).resolves.toMatchObject({ allowed: false, reason: "permission_missing" });
  });

  it("10. disabled user cannot obtain authorization", async () => {
    const directory = directoryWithPracticeAdmin();
    directory.addUser(USER, "disabled");
    const adapter = new RbacAuthorizationAdapter(directory);
    await expect(
      adapter.authorize({
        principalUserId: USER,
        requestedOrganizationId: ORG_A,
        permission: "organization.read",
      }),
    ).resolves.toMatchObject({ allowed: false, reason: "user_disabled" });
  });

  it("11. unknown role on a membership does not authorize", async () => {
    const directory = new InMemoryAuthorizationDirectory();
    directory.addUser(USER).addOrganization(ORG_A);
    directory.addMembership({
      userId: USER,
      organizationId: ORG_A,
      roleKeys: ["CLINIC_WIZARD"],
    });
    const adapter = new RbacAuthorizationAdapter(directory);
    await expect(
      adapter.authorize({
        principalUserId: USER,
        requestedOrganizationId: ORG_A,
        permission: "organization.read",
      }),
    ).resolves.toMatchObject({ allowed: false, reason: "unknown_role" });
  });

  it("12. unknown permission is denied", async () => {
    const adapter = new RbacAuthorizationAdapter(directoryWithPracticeAdmin());
    await expect(
      adapter.authorize({
        principalUserId: USER,
        requestedOrganizationId: ORG_A,
        permission: "notification.retry",
      }),
    ).resolves.toMatchObject({ allowed: false, reason: "unknown_permission" });
  });

  it("13. authorization lookup failure is denied", async () => {
    const directory = directoryWithPracticeAdmin();
    directory.failLookups = true;
    const adapter = new RbacAuthorizationAdapter(directory);
    await expect(
      adapter.authorize({
        principalUserId: USER,
        requestedOrganizationId: ORG_A,
        permission: "organization.read",
      }),
    ).resolves.toMatchObject({ allowed: false, reason: "lookup_failure" });
  });

  it("14. malformed authorization context is denied", async () => {
    const adapter = new RbacAuthorizationAdapter(directoryWithPracticeAdmin());
    await expect(
      adapter.authorize({
        principalUserId: USER,
        requestedOrganizationId: ORG_A,
        permission: "   ",
      }),
    ).resolves.toMatchObject({ allowed: false, reason: "malformed_context" });
  });

  it("15. missing organization context fails closed for tenant permissions", async () => {
    const adapter = new RbacAuthorizationAdapter(directoryWithPracticeAdmin());
    await expect(
      adapter.authorize({
        principalUserId: USER,
        permission: "organization.read",
      }),
    ).resolves.toMatchObject({ allowed: false, reason: "missing_organization_context" });
  });

  it("16. revoked membership does not authorize", async () => {
    const directory = new InMemoryAuthorizationDirectory();
    directory.addUser(USER).addOrganization(ORG_A);
    directory.addMembership({
      userId: USER,
      organizationId: ORG_A,
      status: "revoked",
      roleKeys: ["PRACTICE_ADMIN"],
    });
    const adapter = new RbacAuthorizationAdapter(directory);
    await expect(
      adapter.authorize({
        principalUserId: USER,
        requestedOrganizationId: ORG_A,
        permission: "organization.read",
      }),
    ).resolves.toMatchObject({ allowed: false, reason: "membership_revoked" });
  });

  it("17/18. user may belong to multiple organizations without sharing permissions", async () => {
    const directory = new InMemoryAuthorizationDirectory();
    directory.addUser(USER).addOrganization(ORG_A).addOrganization(ORG_B);
    directory.addMembership({
      userId: USER,
      organizationId: ORG_A,
      roleKeys: ["PRACTICE_ADMIN"],
    });
    directory.addMembership({
      userId: USER,
      organizationId: ORG_B,
      roleKeys: ["STAFF"],
    });
    const adapter = new RbacAuthorizationAdapter(directory);
    await expect(
      adapter.authorize({
        principalUserId: USER,
        requestedOrganizationId: ORG_A,
        permission: "membership.manage",
      }),
    ).resolves.toMatchObject({ allowed: true });
    await expect(
      adapter.authorize({
        principalUserId: USER,
        requestedOrganizationId: ORG_B,
        permission: "membership.manage",
      }),
    ).resolves.toMatchObject({ allowed: false, reason: "permission_missing" });
    await expect(
      adapter.authorize({
        principalUserId: USER,
        requestedOrganizationId: ORG_B,
        permission: "organization.read",
      }),
    ).resolves.toMatchObject({ allowed: true });
  });

  it("20. session/user mismatch is denied", async () => {
    const adapter = new RbacAuthorizationAdapter(directoryWithPracticeAdmin());
    await expect(
      adapter.authorize({
        principalUserId: USER,
        sessionUserId: "other_user",
        requestedOrganizationId: ORG_A,
        permission: "organization.read",
      }),
    ).resolves.toMatchObject({ allowed: false, reason: "session_user_mismatch" });
  });

  it("SYSTEM_ADMIN is not granted by a tenant membership role", async () => {
    const directory = new InMemoryAuthorizationDirectory();
    directory.addUser(USER).addOrganization(ORG_A);
    directory.addMembership({
      userId: USER,
      organizationId: ORG_A,
      roleKeys: ["SYSTEM_ADMIN"],
    });
    const adapter = new RbacAuthorizationAdapter(directory);
    await expect(
      adapter.authorize({
        principalUserId: USER,
        permission: "security.manage",
      }),
    ).resolves.toMatchObject({ allowed: false, reason: "permission_missing" });
  });

  it("SYSTEM_ADMIN platform role can use security.manage without membership", async () => {
    const directory = new InMemoryAuthorizationDirectory();
    directory.addUser(USER).setPlatformRoles(USER, ["SYSTEM_ADMIN"]);
    const adapter = new RbacAuthorizationAdapter(directory);
    await expect(
      adapter.authorize({
        principalUserId: USER,
        permission: "security.manage",
      }),
    ).resolves.toMatchObject({ allowed: true });
  });

  it("missing user is denied", async () => {
    const adapter = new RbacAuthorizationAdapter(new InMemoryAuthorizationDirectory());
    await expect(
      adapter.authorize({
        principalUserId: "missing",
        requestedOrganizationId: ORG_A,
        permission: "organization.read",
      }),
    ).resolves.toMatchObject({ allowed: false, reason: "user_missing" });
  });

  it("inactive organization is denied", async () => {
    const directory = directoryWithPracticeAdmin();
    directory.addOrganization(ORG_A, "inactive");
    const adapter = new RbacAuthorizationAdapter(directory);
    await expect(
      adapter.authorize({
        principalUserId: USER,
        requestedOrganizationId: ORG_A,
        permission: "organization.read",
      }),
    ).resolves.toMatchObject({ allowed: false, reason: "organization_inactive" });
  });

  it("duplicate memberships are rejected by the directory", () => {
    const directory = directoryWithPracticeAdmin();
    expect(() =>
      directory.addMembership({
        userId: USER,
        organizationId: ORG_A,
        roleKeys: ["STAFF"],
      }),
    ).toThrow("duplicate_membership");
  });
});

describe("M2 authorization HTTP probe", () => {
  it("returns 401 without a session", async () => {
    const adapter = new RbacAuthorizationAdapter(directoryWithPracticeAdmin());
    const result = await handleOrganizationAuthorizeGet(adapter, {
      identity: null,
      requestedOrganizationId: ORG_A,
    });
    expect(result.status).toBe(401);
    expect(result.body.error).toBe("unauthenticated");
  });

  it("returns 403 when membership is missing", async () => {
    const directory = new InMemoryAuthorizationDirectory();
    directory.addUser(USER).addOrganization(ORG_A);
    const result = await handleOrganizationAuthorizeGet(new RbacAuthorizationAdapter(directory), {
      identity: identity(),
      requestedOrganizationId: ORG_A,
    });
    expect(result.status).toBe(403);
    expect(JSON.stringify(result.body)).not.toContain("PRACTICE_ADMIN");
  });

  it("returns 200 when membership and permission are valid", async () => {
    const result = await handleOrganizationAuthorizeGet(
      new RbacAuthorizationAdapter(directoryWithPracticeAdmin()),
      { identity: identity(), requestedOrganizationId: ORG_A },
    );
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ allowed: true, organizationId: ORG_A });
  });

  it("does not honor a client-supplied user id", async () => {
    const result = await handleOrganizationAuthorizeGet(
      new RbacAuthorizationAdapter(directoryWithPracticeAdmin()),
      {
        identity: identity(),
        claimedUserId: "attacker",
        requestedOrganizationId: ORG_A,
      },
    );
    expect(result.status).toBe(403);
  });
});

describe("M2 schema constraints", () => {
  it("defines unique memberships, RBAC FKs, and RESTRICT deletes", () => {
    const sql = readFileSync(
      path.resolve(
        process.cwd(),
        "packages/db/prisma/migrations/20260814180000_m2_organization_authorization/migration.sql",
      ),
      "utf8",
    );
    expect(sql).toContain('CREATE UNIQUE INDEX "memberships_userId_organizationId_key"');
    expect(sql).toContain('CREATE UNIQUE INDEX "roles_key_key"');
    expect(sql).toContain('CREATE UNIQUE INDEX "permissions_key_key"');
    expect(sql).toContain("ON DELETE RESTRICT");
    expect(sql).not.toContain("ON DELETE CASCADE");
    expect(sql).toContain('CREATE TABLE "organizations"');
    expect(sql).toContain('CREATE TABLE "memberships"');
    expect(sql).toContain('CREATE TABLE "roles"');
    expect(sql).toContain('CREATE TABLE "permissions"');
    expect(sql).toContain('CREATE TABLE "role_permissions"');
    expect(sql).toContain('CREATE TABLE "membership_roles"');
    expect(sql).toContain('CREATE TABLE "user_platform_roles"');
    expect(sql).toContain('CREATE TABLE "branches"');
    expect(sql).toContain('CREATE TABLE "security_events"');
    expect(sql).not.toContain('CREATE TABLE "patients"');
    expect(sql).toContain("'organization.read'");
    expect(sql).toContain("'PRACTICE_ADMIN'");
  });
});
