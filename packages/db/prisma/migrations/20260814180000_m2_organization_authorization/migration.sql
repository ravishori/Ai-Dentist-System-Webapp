-- M2 organization/tenant, membership, RBAC catalog, and security event log.
-- Additive. Does not alter M1 authentication tables.
-- Does not create Patient/Appointment/Notification tables.
-- Catalog rows are architecture seed (TDA-ADR-002), not production users.

CREATE TABLE "organizations" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "branches" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "branches_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "memberships" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "branchId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "memberships_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "roles" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "permissions" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "role_permissions" (
    "roleId" TEXT NOT NULL,
    "permissionId" TEXT NOT NULL,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("roleId","permissionId")
);

CREATE TABLE "membership_roles" (
    "membershipId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,

    CONSTRAINT "membership_roles_pkey" PRIMARY KEY ("membershipId","roleId")
);

CREATE TABLE "user_platform_roles" (
    "userId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,

    CONSTRAINT "user_platform_roles_pkey" PRIMARY KEY ("userId","roleId")
);

CREATE TABLE "security_events" (
    "id" TEXT NOT NULL,
    "actorUserId" TEXT,
    "organizationId" TEXT,
    "action" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "security_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "roles_key_key" ON "roles"("key");
CREATE UNIQUE INDEX "permissions_key_key" ON "permissions"("key");
CREATE UNIQUE INDEX "memberships_userId_organizationId_key" ON "memberships"("userId", "organizationId");
CREATE INDEX "branches_organizationId_idx" ON "branches"("organizationId");
CREATE INDEX "memberships_organizationId_idx" ON "memberships"("organizationId");
CREATE INDEX "memberships_userId_idx" ON "memberships"("userId");
CREATE INDEX "security_events_actorUserId_idx" ON "security_events"("actorUserId");
CREATE INDEX "security_events_organizationId_idx" ON "security_events"("organizationId");

ALTER TABLE "branches" ADD CONSTRAINT "branches_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "permissions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "membership_roles" ADD CONSTRAINT "membership_roles_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "memberships"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "membership_roles" ADD CONSTRAINT "membership_roles_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "user_platform_roles" ADD CONSTRAINT "user_platform_roles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "user_platform_roles" ADD CONSTRAINT "user_platform_roles_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "roles" ("id", "key", "name", "scope", "createdAt") VALUES
    ('role_patient', 'PATIENT', 'Patient', 'tenant', CURRENT_TIMESTAMP),
    ('role_staff', 'STAFF', 'Staff', 'tenant', CURRENT_TIMESTAMP),
    ('role_practitioner', 'PRACTITIONER', 'Practitioner', 'tenant', CURRENT_TIMESTAMP),
    ('role_practice_admin', 'PRACTICE_ADMIN', 'Practice administrator', 'tenant', CURRENT_TIMESTAMP),
    ('role_system_admin', 'SYSTEM_ADMIN', 'System administrator', 'platform', CURRENT_TIMESTAMP);

INSERT INTO "permissions" ("id", "key", "name", "scope", "createdAt") VALUES
    ('perm_organization_read', 'organization.read', 'Read organization profile', 'tenant', CURRENT_TIMESTAMP),
    ('perm_membership_manage', 'membership.manage', 'Manage organization memberships', 'tenant', CURRENT_TIMESTAMP),
    ('perm_role_assign', 'role.assign', 'Assign roles within an organization', 'tenant', CURRENT_TIMESTAMP),
    ('perm_audit_read', 'audit.read', 'Read tenant audit events', 'tenant', CURRENT_TIMESTAMP),
    ('perm_security_manage', 'security.manage', 'Platform security administration', 'platform', CURRENT_TIMESTAMP);

-- TDA-ADR-002 §12 foundation matrix (tenant roles). Patient/appointment keys deferred.
INSERT INTO "role_permissions" ("roleId", "permissionId") VALUES
    ('role_patient', 'perm_organization_read'),
    ('role_staff', 'perm_organization_read'),
    ('role_practitioner', 'perm_organization_read'),
    ('role_practice_admin', 'perm_organization_read'),
    ('role_practice_admin', 'perm_membership_manage'),
    ('role_practice_admin', 'perm_role_assign'),
    ('role_practice_admin', 'perm_audit_read'),
    ('role_system_admin', 'perm_organization_read'),
    ('role_system_admin', 'perm_membership_manage'),
    ('role_system_admin', 'perm_role_assign'),
    ('role_system_admin', 'perm_audit_read'),
    ('role_system_admin', 'perm_security_manage');
