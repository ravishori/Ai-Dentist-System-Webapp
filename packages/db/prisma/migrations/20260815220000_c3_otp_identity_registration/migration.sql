-- C3 passwordless OTP identity & registration (TDA-ADR-004).
-- Additive only: does not drop M3–M7 tables/columns or Cognito identity rows.

-- User contact channels for OTP
ALTER TABLE "users" ADD COLUMN "phone" TEXT;
ALTER TABLE "users" ADD COLUMN "phoneVerified" BOOLEAN NOT NULL DEFAULT false;
CREATE UNIQUE INDEX "users_phone_key" ON "users"("phone");

-- Practitioner professional verification (separate from operational status)
ALTER TABLE "practitioners" ADD COLUMN "verificationStatus" TEXT NOT NULL DEFAULT 'pending';
CREATE INDEX "practitioners_organizationId_verificationStatus_idx" ON "practitioners"("organizationId", "verificationStatus");

-- Existing staff-created M7 practitioners are treated as professionally verified.
UPDATE "practitioners" SET "verificationStatus" = 'verified';

-- Shared address entity
CREATE TABLE "addresses" (
    "id" TEXT NOT NULL,
    "line1" TEXT NOT NULL,
    "line2" TEXT,
    "city" TEXT NOT NULL,
    "state" TEXT,
    "postalCode" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "addresses_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "patient_addresses" (
    "patientId" TEXT NOT NULL,
    "addressId" TEXT NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "patient_addresses_pkey" PRIMARY KEY ("patientId","addressId")
);

CREATE TABLE "practitioner_addresses" (
    "practitionerId" TEXT NOT NULL,
    "addressId" TEXT NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "practitioner_addresses_pkey" PRIMARY KEY ("practitionerId","addressId")
);

CREATE INDEX "patient_addresses_addressId_idx" ON "patient_addresses"("addressId");
CREATE INDEX "practitioner_addresses_addressId_idx" ON "practitioner_addresses"("addressId");

ALTER TABLE "patient_addresses" ADD CONSTRAINT "patient_addresses_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "patient_addresses" ADD CONSTRAINT "patient_addresses_addressId_fkey" FOREIGN KEY ("addressId") REFERENCES "addresses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "practitioner_addresses" ADD CONSTRAINT "practitioner_addresses_practitionerId_fkey" FOREIGN KEY ("practitionerId") REFERENCES "practitioners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "practitioner_addresses" ADD CONSTRAINT "practitioner_addresses_addressId_fkey" FOREIGN KEY ("addressId") REFERENCES "addresses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Explicit Patient ↔ User link (tenant-scoped)
CREATE TABLE "patient_user_links" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "linkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "linkedByUserId" TEXT,
    CONSTRAINT "patient_user_links_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "patient_user_links_patientId_key" ON "patient_user_links"("patientId");
CREATE UNIQUE INDEX "patient_user_links_organizationId_userId_key" ON "patient_user_links"("organizationId", "userId");
CREATE INDEX "patient_user_links_organizationId_idx" ON "patient_user_links"("organizationId");
CREATE INDEX "patient_user_links_userId_idx" ON "patient_user_links"("userId");

ALTER TABLE "patient_user_links" ADD CONSTRAINT "patient_user_links_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "patient_user_links" ADD CONSTRAINT "patient_user_links_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "patient_user_links" ADD CONSTRAINT "patient_user_links_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "patient_user_links" ADD CONSTRAINT "patient_user_links_linkedByUserId_fkey" FOREIGN KEY ("linkedByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Organization invitations (hashed token; purpose-scoped)
CREATE TABLE "organization_invitations" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "emailHint" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "redeemedAt" TIMESTAMP(3),
    "redeemedByUserId" TEXT,
    "maxUses" INTEGER NOT NULL DEFAULT 1,
    "useCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "organization_invitations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "organization_invitations_tokenHash_key" ON "organization_invitations"("tokenHash");
CREATE INDEX "organization_invitations_organizationId_purpose_status_idx" ON "organization_invitations"("organizationId", "purpose", "status");
CREATE INDEX "organization_invitations_expiresAt_idx" ON "organization_invitations"("expiresAt");

ALTER TABLE "organization_invitations" ADD CONSTRAINT "organization_invitations_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "organization_invitations" ADD CONSTRAINT "organization_invitations_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "organization_invitations" ADD CONSTRAINT "organization_invitations_redeemedByUserId_fkey" FOREIGN KEY ("redeemedByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Org-scoped reusable clinic codes (PATIENT purpose; hashed)
CREATE TABLE "clinic_codes" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "purpose" TEXT NOT NULL DEFAULT 'PATIENT',
    "codeHash" TEXT NOT NULL,
    "label" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "expiresAt" TIMESTAMP(3),
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "clinic_codes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "clinic_codes_organizationId_codeHash_key" ON "clinic_codes"("organizationId", "codeHash");
CREATE INDEX "clinic_codes_organizationId_status_idx" ON "clinic_codes"("organizationId", "status");

ALTER TABLE "clinic_codes" ADD CONSTRAINT "clinic_codes_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "clinic_codes" ADD CONSTRAINT "clinic_codes_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Registration sessions (organization always server-resolved from invite/code)
CREATE TABLE "registration_sessions" (
    "id" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "invitationId" TEXT,
    "clinicCodeId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'IN_PROGRESS',
    "email" TEXT,
    "emailVerifiedAt" TIMESTAMP(3),
    "phone" TEXT,
    "phoneVerifiedAt" TIMESTAMP(3),
    "firstName" TEXT,
    "lastName" TEXT,
    "displayName" TEXT,
    "addressDraft" JSONB,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "completedUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "registration_sessions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "registration_sessions_organizationId_status_idx" ON "registration_sessions"("organizationId", "status");
CREATE INDEX "registration_sessions_expiresAt_idx" ON "registration_sessions"("expiresAt");
CREATE INDEX "registration_sessions_invitationId_idx" ON "registration_sessions"("invitationId");

ALTER TABLE "registration_sessions" ADD CONSTRAINT "registration_sessions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "registration_sessions" ADD CONSTRAINT "registration_sessions_invitationId_fkey" FOREIGN KEY ("invitationId") REFERENCES "organization_invitations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "registration_sessions" ADD CONSTRAINT "registration_sessions_clinicCodeId_fkey" FOREIGN KEY ("clinicCodeId") REFERENCES "clinic_codes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- OTP challenges (hashed codes only)
CREATE TABLE "auth_otp_challenges" (
    "id" TEXT NOT NULL,
    "destinationType" TEXT NOT NULL,
    "destinationNormalized" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "codeSalt" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "registrationSessionId" TEXT,
    "organizationId" TEXT,
    "invitationId" TEXT,
    "userId" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "lastSentAt" TIMESTAMP(3) NOT NULL,
    "resendCount" INTEGER NOT NULL DEFAULT 0,
    "ipHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "auth_otp_challenges_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "auth_otp_challenges_destinationNormalized_purpose_createdAt_idx" ON "auth_otp_challenges"("destinationNormalized", "purpose", "createdAt");
CREATE INDEX "auth_otp_challenges_expiresAt_idx" ON "auth_otp_challenges"("expiresAt");
CREATE INDEX "auth_otp_challenges_registrationSessionId_idx" ON "auth_otp_challenges"("registrationSessionId");
CREATE INDEX "auth_otp_challenges_userId_purpose_createdAt_idx" ON "auth_otp_challenges"("userId", "purpose", "createdAt");

ALTER TABLE "auth_otp_challenges" ADD CONSTRAINT "auth_otp_challenges_registrationSessionId_fkey" FOREIGN KEY ("registrationSessionId") REFERENCES "registration_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Durable rate-limit buckets
CREATE TABLE "auth_rate_limit_buckets" (
    "id" TEXT NOT NULL,
    "bucketKey" TEXT NOT NULL,
    "windowStartedAt" TIMESTAMP(3) NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "auth_rate_limit_buckets_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "auth_rate_limit_buckets_bucketKey_windowStartedAt_key" ON "auth_rate_limit_buckets"("bucketKey", "windowStartedAt");
CREATE INDEX "auth_rate_limit_buckets_bucketKey_idx" ON "auth_rate_limit_buckets"("bucketKey");

-- C3 identity permissions
INSERT INTO "permissions" ("id", "key", "name", "scope", "createdAt") VALUES
    ('perm_invitation_patient_create', 'invitation.patient.create', 'Create patient invitations', 'tenant', CURRENT_TIMESTAMP),
    ('perm_invitation_practitioner_create', 'invitation.practitioner.create', 'Create practitioner invitations', 'tenant', CURRENT_TIMESTAMP),
    ('perm_invitation_revoke', 'invitation.revoke', 'Revoke invitations', 'tenant', CURRENT_TIMESTAMP),
    ('perm_clinic_code_manage', 'clinic_code.manage', 'Manage clinic registration codes', 'tenant', CURRENT_TIMESTAMP),
    ('perm_practitioner_verify', 'practitioner.verify', 'Set practitioner professional verification status', 'tenant', CURRENT_TIMESTAMP),
    ('perm_patient_link_user', 'patient.link_user', 'Link patient records to portal users', 'tenant', CURRENT_TIMESTAMP);

INSERT INTO "role_permissions" ("roleId", "permissionId") VALUES
    ('role_practice_admin', 'perm_invitation_patient_create'),
    ('role_practice_admin', 'perm_invitation_practitioner_create'),
    ('role_practice_admin', 'perm_invitation_revoke'),
    ('role_practice_admin', 'perm_clinic_code_manage'),
    ('role_practice_admin', 'perm_practitioner_verify'),
    ('role_practice_admin', 'perm_patient_link_user'),
    ('role_staff', 'perm_invitation_patient_create'),
    ('role_staff', 'perm_invitation_revoke'),
    ('role_staff', 'perm_patient_link_user');
