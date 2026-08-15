-- M6 appointment operations: tenant-scoped command permissions.
-- Additive. Does not alter M1–M5 migration files or appointment status CHECK.
-- Does not add notification outbox event types, clinical fields, or hard-delete.

INSERT INTO "permissions" ("id", "key", "name", "scope", "createdAt") VALUES
    ('perm_appointment_confirm', 'appointment.confirm', 'Confirm appointment', 'tenant', CURRENT_TIMESTAMP),
    ('perm_appointment_check_in', 'appointment.check_in', 'Check in appointment', 'tenant', CURRENT_TIMESTAMP),
    ('perm_appointment_start', 'appointment.start', 'Start appointment', 'tenant', CURRENT_TIMESTAMP),
    ('perm_appointment_complete', 'appointment.complete', 'Complete appointment', 'tenant', CURRENT_TIMESTAMP),
    ('perm_appointment_no_show', 'appointment.no_show', 'Record appointment no-show', 'tenant', CURRENT_TIMESTAMP);

INSERT INTO "role_permissions" ("roleId", "permissionId") VALUES
    ('role_staff', 'perm_appointment_confirm'),
    ('role_staff', 'perm_appointment_check_in'),
    ('role_staff', 'perm_appointment_start'),
    ('role_staff', 'perm_appointment_complete'),
    ('role_staff', 'perm_appointment_no_show'),
    ('role_practitioner', 'perm_appointment_confirm'),
    ('role_practitioner', 'perm_appointment_check_in'),
    ('role_practitioner', 'perm_appointment_start'),
    ('role_practitioner', 'perm_appointment_complete'),
    ('role_practitioner', 'perm_appointment_no_show'),
    ('role_practice_admin', 'perm_appointment_confirm'),
    ('role_practice_admin', 'perm_appointment_check_in'),
    ('role_practice_admin', 'perm_appointment_start'),
    ('role_practice_admin', 'perm_appointment_complete'),
    ('role_practice_admin', 'perm_appointment_no_show');
