-- M4 organization-scoped appointments and minimum practitioner profiles.
-- Additive. Does not alter M1/M2/M3 tables.
-- Exclusion constraints prevent overlapping active practitioner and patient appointments.
-- Outbox stores notification intent only (no dispatcher).

CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE "practitioners" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "practitioners_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "practitioners_userId_key" ON "practitioners"("userId");
CREATE INDEX "practitioners_organizationId_idx" ON "practitioners"("organizationId");

ALTER TABLE "practitioners" ADD CONSTRAINT "practitioners_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "practitioners" ADD CONSTRAINT "practitioners_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "appointments" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "practitionerId" TEXT NOT NULL,
    "startAtUtc" TIMESTAMPTZ NOT NULL,
    "endAtUtc" TIMESTAMPTZ NOT NULL,
    "timezone" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'REQUESTED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "appointments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "appointments_status_check" CHECK ("status" IN ('REQUESTED', 'CONFIRMED', 'CHECKED_IN', 'IN_PROGRESS', 'COMPLETED', 'NO_SHOW', 'CANCELLED')),
    CONSTRAINT "appointments_time_check" CHECK ("endAtUtc" > "startAtUtc")
);

CREATE INDEX "appointments_organizationId_startAtUtc_idx" ON "appointments"("organizationId", "startAtUtc");
CREATE INDEX "appointments_organizationId_status_idx" ON "appointments"("organizationId", "status");
CREATE INDEX "appointments_organizationId_patientId_startAtUtc_idx" ON "appointments"("organizationId", "patientId", "startAtUtc");
CREATE INDEX "appointments_organizationId_practitionerId_startAtUtc_idx" ON "appointments"("organizationId", "practitionerId", "startAtUtc");

ALTER TABLE "appointments" ADD CONSTRAINT "appointments_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_practitionerId_fkey" FOREIGN KEY ("practitionerId") REFERENCES "practitioners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "appointments" ADD CONSTRAINT "appointments_practitioner_time_excl"
EXCLUDE USING gist (
    "organizationId" WITH =,
    "practitionerId" WITH =,
    tstzrange("startAtUtc", "endAtUtc", '[)') WITH &&
) WHERE ("status" IN ('REQUESTED', 'CONFIRMED', 'CHECKED_IN', 'IN_PROGRESS'));

ALTER TABLE "appointments" ADD CONSTRAINT "appointments_patient_time_excl"
EXCLUDE USING gist (
    "organizationId" WITH =,
    "patientId" WITH =,
    tstzrange("startAtUtc", "endAtUtc", '[)') WITH &&
) WHERE ("status" IN ('REQUESTED', 'CONFIRMED', 'CHECKED_IN', 'IN_PROGRESS'));

CREATE TABLE "appointment_history" (
    "id" TEXT NOT NULL,
    "appointmentId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "fromStatus" TEXT,
    "toStatus" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "appointment_history_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "appointment_history_appointmentId_createdAt_idx" ON "appointment_history"("appointmentId", "createdAt");
CREATE INDEX "appointment_history_organizationId_idx" ON "appointment_history"("organizationId");

ALTER TABLE "appointment_history" ADD CONSTRAINT "appointment_history_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "appointments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "notification_outbox" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "appointmentId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_outbox_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "notification_outbox_status_createdAt_idx" ON "notification_outbox"("status", "createdAt");
CREATE INDEX "notification_outbox_organizationId_status_idx" ON "notification_outbox"("organizationId", "status");

ALTER TABLE "notification_outbox" ADD CONSTRAINT "notification_outbox_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "appointments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "permissions" ("id", "key", "name", "scope", "createdAt") VALUES
    ('perm_appointment_create', 'appointment.create', 'Create appointment in tenant', 'tenant', CURRENT_TIMESTAMP),
    ('perm_appointment_read_tenant', 'appointment.read.tenant', 'Read tenant appointments', 'tenant', CURRENT_TIMESTAMP),
    ('perm_appointment_update_tenant', 'appointment.update.tenant', 'Update tenant appointments', 'tenant', CURRENT_TIMESTAMP),
    ('perm_appointment_reschedule', 'appointment.reschedule', 'Reschedule appointment', 'tenant', CURRENT_TIMESTAMP),
    ('perm_appointment_cancel', 'appointment.cancel', 'Cancel appointment', 'tenant', CURRENT_TIMESTAMP);

INSERT INTO "role_permissions" ("roleId", "permissionId") VALUES
    ('role_staff', 'perm_appointment_create'),
    ('role_staff', 'perm_appointment_read_tenant'),
    ('role_staff', 'perm_appointment_update_tenant'),
    ('role_staff', 'perm_appointment_reschedule'),
    ('role_staff', 'perm_appointment_cancel'),
    ('role_practitioner', 'perm_appointment_create'),
    ('role_practitioner', 'perm_appointment_read_tenant'),
    ('role_practitioner', 'perm_appointment_update_tenant'),
    ('role_practitioner', 'perm_appointment_reschedule'),
    ('role_practitioner', 'perm_appointment_cancel'),
    ('role_practice_admin', 'perm_appointment_create'),
    ('role_practice_admin', 'perm_appointment_read_tenant'),
    ('role_practice_admin', 'perm_appointment_update_tenant'),
    ('role_practice_admin', 'perm_appointment_reschedule'),
    ('role_practice_admin', 'perm_appointment_cancel');
