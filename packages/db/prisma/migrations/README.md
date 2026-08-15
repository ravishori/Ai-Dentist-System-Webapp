# Prisma migrations

M0 established PostgreSQL + Prisma as the schema evolution mechanism.

- M1: `20260814120000_m1_authentication_identity` (unchanged in M4)
- M2: `20260814180000_m2_organization_authorization` (unchanged in M4)
- M3: `20260814190000_m3_patient_identity` — organization-scoped `patients` (unchanged in M4)
- M4: `20260815120000_m4_appointment_domain` — practitioners, appointments, history, outbox intent (unchanged in M5)
- M5: `20260815140000_m5_notification_delivery` — patient consent/opt-out and outbox claim/delivery metadata

M5 does not rewrite M1–M4 migrations. Real SMTP is not enabled by this migration.
