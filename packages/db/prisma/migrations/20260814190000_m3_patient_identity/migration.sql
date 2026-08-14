-- M3 organization-scoped patient identity.
-- Additive. Does not alter M1/M2 tables.
-- Does not create Appointment/Notification/clinical tables.
-- Patient is not an authentication user.

CREATE TABLE "patients" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "dateOfBirth" DATE NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "patients_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "patients_organizationId_idx" ON "patients"("organizationId");

ALTER TABLE "patients" ADD CONSTRAINT "patients_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "patients" ADD CONSTRAINT "patients_status_check" CHECK ("status" IN ('active', 'inactive'));

INSERT INTO "permissions" ("id", "key", "name", "scope", "createdAt") VALUES
    ('perm_patient_create', 'patient.create', 'Create patient in tenant', 'tenant', CURRENT_TIMESTAMP),
    ('perm_patient_read_tenant', 'patient.read.tenant', 'Read tenant patient records', 'tenant', CURRENT_TIMESTAMP),
    ('perm_patient_update_tenant', 'patient.update.tenant', 'Update tenant patient records', 'tenant', CURRENT_TIMESTAMP),
    ('perm_patient_archive', 'patient.archive', 'Archive patient (no hard delete)', 'tenant', CURRENT_TIMESTAMP);

-- TDA-ADR-002 §12 patient matrix. Self-access keys are not seeded (no patient portal).
-- SYSTEM_ADMIN does not receive patient permissions.
INSERT INTO "role_permissions" ("roleId", "permissionId") VALUES
    ('role_staff', 'perm_patient_create'),
    ('role_staff', 'perm_patient_read_tenant'),
    ('role_staff', 'perm_patient_update_tenant'),
    ('role_practitioner', 'perm_patient_create'),
    ('role_practitioner', 'perm_patient_read_tenant'),
    ('role_practitioner', 'perm_patient_update_tenant'),
    ('role_practice_admin', 'perm_patient_create'),
    ('role_practice_admin', 'perm_patient_read_tenant'),
    ('role_practice_admin', 'perm_patient_update_tenant'),
    ('role_practice_admin', 'perm_patient_archive');
