# Prisma migrations

M0 established PostgreSQL + Prisma as the schema evolution mechanism.

M1 adds authentication identity mapping (`users`, `user_identities`) and
application session/login-transaction tables. It does not add Organization,
Membership, Role, Permission, Patient, Appointment, or Notification tables.
