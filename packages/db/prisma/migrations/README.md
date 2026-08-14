# Prisma migrations

M0 established PostgreSQL + Prisma as the schema evolution mechanism.

- M1: `20260814120000_m1_authentication_identity` (unchanged in M4)
- M2: `20260814180000_m2_organization_authorization` (unchanged in M4)
- M3: `20260814190000_m3_patient_identity` — organization-scoped `patients` (unchanged in M4)
- M4: `20260815120000_m4_appointment_domain` — practitioners, appointments, history, outbox intent

M4 does not add notification delivery, calendar, or clinical-record tables.
M4 does not use `ON DELETE CASCADE` for appointment rows. Exclusion constraints prevent overlapping active practitioner and patient appointments.
