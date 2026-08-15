# Prisma migrations

M0 established PostgreSQL + Prisma as the schema evolution mechanism.

- M1: `20260814120000_m1_authentication_identity` (unchanged in M4)
- M2: `20260814180000_m2_organization_authorization` (unchanged in M4)
- M3: `20260814190000_m3_patient_identity` — organization-scoped `patients` (unchanged in M4)
- M4: `20260815120000_m4_appointment_domain` — practitioners, appointments, history, outbox intent (unchanged in M5)
- M5: `20260815140000_m5_notification_delivery` — patient consent/opt-out and outbox claim/delivery metadata
- M6: `20260815160000_m6_appointment_operations` — confirm / check-in / start / complete / no-show permission seeds (unchanged in M7)
- M7: `20260815180000_m7_practitioner_availability` — practitioner status/displayName, branch assignments, weekly hours exclusion, dated unavailability, history, permission seeds

M7 does not rewrite M1–M6 migrations. It does not add notification event types, calendar fields, clinical fields, or hard-delete. Appointment gist exclusions remain unchanged.
