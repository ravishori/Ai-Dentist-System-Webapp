-- M7 practitioner management and advisory availability.
-- Additive. Does not rewrite M1–M6 migrations or appointment exclusion constraints.
-- Availability is advisory; M4 gist exclusions remain the booking lock.
-- No notification outbox event types, calendar fields, or hard-delete.

CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "practitioners" ADD COLUMN "displayName" TEXT;
ALTER TABLE "practitioners" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'active';

ALTER TABLE "practitioners" ADD CONSTRAINT "practitioners_status_check"
CHECK ("status" IN ('active', 'inactive'));

CREATE TABLE "practitioner_branch_assignments" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "practitionerId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "practitioner_branch_assignments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "practitioner_branch_assignments_practitionerId_branchId_key"
ON "practitioner_branch_assignments"("practitionerId", "branchId");
CREATE INDEX "practitioner_branch_assignments_organizationId_idx"
ON "practitioner_branch_assignments"("organizationId");
CREATE INDEX "practitioner_branch_assignments_branchId_idx"
ON "practitioner_branch_assignments"("branchId");

ALTER TABLE "practitioner_branch_assignments"
ADD CONSTRAINT "practitioner_branch_assignments_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "practitioner_branch_assignments"
ADD CONSTRAINT "practitioner_branch_assignments_practitionerId_fkey"
FOREIGN KEY ("practitionerId") REFERENCES "practitioners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "practitioner_branch_assignments"
ADD CONSTRAINT "practitioner_branch_assignments_branchId_fkey"
FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "practitioner_schedules" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "practitionerId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "timezone" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "practitioner_schedules_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "practitioner_schedules_practitionerId_branchId_key"
ON "practitioner_schedules"("practitionerId", "branchId");
CREATE INDEX "practitioner_schedules_organizationId_idx"
ON "practitioner_schedules"("organizationId");

ALTER TABLE "practitioner_schedules"
ADD CONSTRAINT "practitioner_schedules_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "practitioner_schedules"
ADD CONSTRAINT "practitioner_schedules_practitionerId_fkey"
FOREIGN KEY ("practitionerId") REFERENCES "practitioners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "practitioner_schedules"
ADD CONSTRAINT "practitioner_schedules_branchId_fkey"
FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "practitioner_weekly_intervals" (
    "id" TEXT NOT NULL,
    "scheduleId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "practitionerId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "weekday" INTEGER NOT NULL,
    "startMinute" INTEGER NOT NULL,
    "endMinute" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "practitioner_weekly_intervals_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "practitioner_weekly_intervals_weekday_check" CHECK ("weekday" BETWEEN 0 AND 6),
    CONSTRAINT "practitioner_weekly_intervals_minutes_check"
      CHECK ("startMinute" >= 0 AND "endMinute" <= 1440 AND "startMinute" < "endMinute")
);

CREATE INDEX "practitioner_weekly_intervals_scheduleId_idx"
ON "practitioner_weekly_intervals"("scheduleId");
CREATE INDEX "practitioner_weekly_intervals_practitionerId_branchId_weekday_idx"
ON "practitioner_weekly_intervals"("practitionerId", "branchId", "weekday");

ALTER TABLE "practitioner_weekly_intervals"
ADD CONSTRAINT "practitioner_weekly_intervals_scheduleId_fkey"
FOREIGN KEY ("scheduleId") REFERENCES "practitioner_schedules"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "practitioner_weekly_intervals" ADD CONSTRAINT "practitioner_weekly_intervals_excl"
EXCLUDE USING gist (
    "practitionerId" WITH =,
    "branchId" WITH =,
    "weekday" WITH =,
    int4range("startMinute", "endMinute", '[)') WITH &&
);

CREATE TABLE "practitioner_unavailability" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "practitionerId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "startAtUtc" TIMESTAMPTZ NOT NULL,
    "endAtUtc" TIMESTAMPTZ NOT NULL,
    "timezone" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "practitioner_unavailability_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "practitioner_unavailability_kind_check"
      CHECK ("kind" IN ('break', 'leave', 'exception')),
    CONSTRAINT "practitioner_unavailability_status_check"
      CHECK ("status" IN ('active', 'cancelled')),
    CONSTRAINT "practitioner_unavailability_time_check"
      CHECK ("endAtUtc" > "startAtUtc")
);

CREATE INDEX "practitioner_unavailability_organizationId_practitionerId_startAtUtc_idx"
ON "practitioner_unavailability"("organizationId", "practitionerId", "startAtUtc");

ALTER TABLE "practitioner_unavailability"
ADD CONSTRAINT "practitioner_unavailability_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "practitioner_unavailability"
ADD CONSTRAINT "practitioner_unavailability_practitionerId_fkey"
FOREIGN KEY ("practitionerId") REFERENCES "practitioners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "practitioner_unavailability" ADD CONSTRAINT "practitioner_unavailability_time_excl"
EXCLUDE USING gist (
    "practitionerId" WITH =,
    tstzrange("startAtUtc", "endAtUtc", '[)') WITH &&
) WHERE ("status" = 'active');

CREATE TABLE "practitioner_history" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "practitionerId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "practitioner_history_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "practitioner_history_practitionerId_createdAt_idx"
ON "practitioner_history"("practitionerId", "createdAt");
CREATE INDEX "practitioner_history_organizationId_idx"
ON "practitioner_history"("organizationId");

ALTER TABLE "practitioner_history"
ADD CONSTRAINT "practitioner_history_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "practitioner_history"
ADD CONSTRAINT "practitioner_history_practitionerId_fkey"
FOREIGN KEY ("practitionerId") REFERENCES "practitioners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "permissions" ("id", "key", "name", "scope", "createdAt") VALUES
    ('perm_practitioner_read_tenant', 'practitioner.read.tenant', 'Read tenant practitioner profiles', 'tenant', CURRENT_TIMESTAMP),
    ('perm_practitioner_manage', 'practitioner.manage', 'Create and manage practitioner profiles', 'tenant', CURRENT_TIMESTAMP),
    ('perm_practitioner_assignment_manage', 'practitioner.assignment.manage', 'Assign practitioners to branches', 'tenant', CURRENT_TIMESTAMP),
    ('perm_practitioner_schedule_manage', 'practitioner.schedule.manage', 'Manage practitioner working hours', 'tenant', CURRENT_TIMESTAMP),
    ('perm_practitioner_leave_manage', 'practitioner.leave.manage', 'Manage practitioner unavailability', 'tenant', CURRENT_TIMESTAMP),
    ('perm_practitioner_availability_read', 'practitioner.availability.read', 'Read internal practitioner availability', 'tenant', CURRENT_TIMESTAMP);

INSERT INTO "role_permissions" ("roleId", "permissionId") VALUES
    ('role_staff', 'perm_practitioner_read_tenant'),
    ('role_staff', 'perm_practitioner_schedule_manage'),
    ('role_staff', 'perm_practitioner_leave_manage'),
    ('role_staff', 'perm_practitioner_availability_read'),
    ('role_practitioner', 'perm_practitioner_read_tenant'),
    ('role_practitioner', 'perm_practitioner_availability_read'),
    ('role_practice_admin', 'perm_practitioner_read_tenant'),
    ('role_practice_admin', 'perm_practitioner_manage'),
    ('role_practice_admin', 'perm_practitioner_assignment_manage'),
    ('role_practice_admin', 'perm_practitioner_schedule_manage'),
    ('role_practice_admin', 'perm_practitioner_leave_manage'),
    ('role_practice_admin', 'perm_practitioner_availability_read');
