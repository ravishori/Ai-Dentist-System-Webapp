# Prisma migrations

M0 established PostgreSQL + Prisma as the schema evolution mechanism.

- M1: `20260814120000_m1_authentication_identity` (unchanged in M3)
- M2: `20260814180000_m2_organization_authorization` (unchanged in M3)
- M3: `20260814190000_m3_patient_identity` — organization-scoped `patients`

M3 does not add Appointment, Notification, or clinical-record tables.
M3 does not use `ON DELETE CASCADE` for patient rows.
