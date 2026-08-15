-- M5 notification delivery: patient consent/opt-out and outbox processing metadata.
-- Additive. Does not alter M1–M4 migration files.
-- Does not enable real SMTP. Worker processing remains disabled until explicit configuration.

ALTER TABLE "patients"
    ADD COLUMN "appointmentNotificationConsent" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN "appointmentNotificationConsentAt" TIMESTAMP(3),
    ADD COLUMN "appointmentNotificationOptOut" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN "appointmentNotificationOptedOutAt" TIMESTAMP(3);

ALTER TABLE "notification_outbox"
    ADD COLUMN "attemptCount" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "claimedAt" TIMESTAMPTZ,
    ADD COLUMN "claimedUntil" TIMESTAMPTZ,
    ADD COLUMN "claimedBy" TEXT,
    ADD COLUMN "nextAttemptAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ADD COLUMN "processedAt" TIMESTAMPTZ,
    ADD COLUMN "lastErrorCode" TEXT,
    ADD COLUMN "providerMessageId" TEXT;

ALTER TABLE "notification_outbox"
    ADD CONSTRAINT "notification_outbox_status_check"
    CHECK ("status" IN ('pending', 'processing', 'sent', 'suppressed', 'failed_terminal'));

ALTER TABLE "notification_outbox"
    ADD CONSTRAINT "notification_outbox_attemptCount_check"
    CHECK ("attemptCount" >= 0 AND "attemptCount" <= 5);

CREATE INDEX "notification_outbox_status_nextAttemptAt_idx"
    ON "notification_outbox"("status", "nextAttemptAt");

INSERT INTO "permissions" ("id", "key", "name", "scope", "createdAt") VALUES
    ('perm_notification_read', 'notification.read', 'Read tenant notification outbox metadata', 'tenant', CURRENT_TIMESTAMP);

INSERT INTO "role_permissions" ("roleId", "permissionId") VALUES
    ('role_staff', 'perm_notification_read'),
    ('role_practitioner', 'perm_notification_read'),
    ('role_practice_admin', 'perm_notification_read');
