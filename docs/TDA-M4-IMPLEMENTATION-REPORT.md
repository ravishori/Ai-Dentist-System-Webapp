# TDA-M4 Implementation Report

**Milestone:** M4 Appointment Domain  
**Date:** 2026-08-15  
**Status:** Implemented on the M4 feature branch; **not production-ready**  
**Depends on:** M0, M1 (`feat(auth)`), M2 (`feat(authz)`), M3 (`feat(patient)`), approved `docs/ADR-FOLLOWUP-M4.md`  
**Does not redesign:** M1 authentication, M2 authorization evaluator, M3 patient domain

---

## 1. What was implemented

M4 adds organization-scoped appointments and a minimum practitioner profile on top of the frozen M1 session, M2 `AuthorizationPort`, and M3 patient identity.

```text
HTTP /api/appointments
        ↓
M1 session (AuthenticationPort)
        ↓
M2 AuthorizationPort.authorize(userId, organizationId, permission)
        ↓
AppointmentApplicationService
        ↓
same-org Patient / Practitioner / Branch lookup
        ↓
AppointmentRepository (organizationId + appointmentId)
        ↓
appointments + appointment_history + security_events + notification_outbox
```

Architecture follows `docs/ADR-FOLLOWUP-M4.md` (APPROVED 2026-08-15). Discovery remains on `cursor/m4-appointment-discovery-3efc` / PR #4 and was not rewritten.

---

## 2. Files created

### Domain

- `packages/domain/src/appointment/appointment.ts`
- `packages/domain/src/appointment/lifecycle.ts`
- `packages/domain/src/appointment/practitioner.ts`
- `packages/domain/src/appointment/branch-record.ts`
- `packages/domain/src/appointment/history.ts`
- `packages/domain/src/appointment/appointment-repository.ts`

### Application

- `packages/application/src/appointment/validation.ts`
- `packages/application/src/appointment/service.ts`
- `packages/application/src/appointment/http.ts`
- `packages/application/src/appointment/in-memory-repository.ts`
- `packages/application/src/appointment/appointment.security.test.ts`

### Persistence

- `packages/db/prisma/migrations/20260815120000_m4_appointment_domain/migration.sql`
- `packages/db/src/appointment-store.ts`

### HTTP

- `apps/web/src/app/api/appointments/route.ts`
- `apps/web/src/app/api/appointments/[appointmentId]/route.ts`
- `apps/web/src/app/api/appointments/[appointmentId]/reschedule/route.ts`
- `apps/web/src/app/api/appointments/[appointmentId]/cancel/route.ts`
- `apps/web/src/infrastructure/appointment/service.ts`

### Documentation

- `docs/TDA-M4-APPOINTMENT-CONTRACT.md`
- `docs/TDA-M4-IMPLEMENTATION-REPORT.md`

`docs/ADR-FOLLOWUP-M4.md` was already APPROVED on the discovery branch and was not edited in this implementation.

---

## 3. Files modified

- `packages/domain/src/foundation/permissions.ts` — appointment permission keys
- `packages/application/src/foundation/authz/in-memory-directory.ts` — staff role grants
- `packages/application/src/foundation/authz/authorization.security.test.ts` — unknown-permission example
- `packages/db/prisma/schema.prisma` — Practitioner, Appointment, history, outbox
- `packages/db/src/index.ts`
- `apps/web/src/app/api/health/route.ts` — milestone `M4`
- `apps/web/src/instrumentation.ts` / `layout.tsx` / `page.tsx`
- `apps/worker/src/runtime.ts` — milestone `M4` (still no dispatcher)
- `packages/contracts/src/index.ts` — milestone union
- `tests/e2e/smoke.spec.ts` — health `M4` + unauthenticated appointments `401`
- `packages/db/prisma/migrations/README.md`
- `README.md`
- `.cursor/rules/00-dentalcare-master.mdc`
- `docs/architecture/TECHNOLOGY-STACK.md`
- `docs/governance/SOURCE-OF-TRUTH-MANIFEST.md`
- `docs/governance/M0-BASELINE-EVIDENCE.md`

M1–M3 Prisma migrations were **not** modified.

---

## 4. Domain objects

- `Appointment` — org-scoped scheduled visit (not a clinical record)
- `Practitioner` — minimum profile linked 0..1 to an application user
- `BranchRecord` — same-org branch integrity check (no branch-level authorization)
- `AppointmentHistoryRecord` / `NotificationOutboxIntent`
- Lifecycle helpers: `canCancel`, `canReschedule`, `ACTIVE_SCHEDULING_STATUSES`

Invariants:

- organization association required
- patient, branch, and practitioner must belong to the same organization
- identifiers immutable
- IANA timezone required; UTC instants stored
- `endAtUtc > startAtUtc`
- initial status `REQUESTED`
- no Cognito / clinical fields

---

## 5. Application services

- `AppointmentApplicationService` — create, list, get, requireForUpdate, reschedule, cancel
- HTTP handlers — authentication first, then validation, then authorization, then persistence
- DTOs — `toPublicAppointment` (no Prisma types on the wire)
- PATCH — after `appointment.update.tenant` + scoped lookup, returns `400` (no mutable fields)

---

## 6. Authorization changes

Evaluator still uses `AuthorizationPort`. Unknown keys remain deny.

New keys recognized by `isApplicationPermission`:

- `appointment.create`
- `appointment.read.tenant`
- `appointment.update.tenant`
- `appointment.reschedule`
- `appointment.cancel`

SYSTEM_ADMIN still receives only foundation tenant permissions. Appointment APIs deny SYSTEM_ADMIN and PATIENT. STAFF, PRACTITIONER, and PRACTICE_ADMIN receive all five appointment permissions.

---

## 7. Database

Additive migration `20260815120000_m4_appointment_domain`:

- tables `practitioners`, `appointments`, `appointment_history`, `notification_outbox`
- FKs **ON DELETE RESTRICT**
- `btree_gist` exclusion constraints `appointments_practitioner_time_excl` and `appointments_patient_time_excl` for active statuses, range `[start, end)`
- status and time CHECK constraints
- seeds the five appointment permissions for STAFF / PRACTITIONER / PRACTICE_ADMIN

Prisma writes use `$transaction` so appointment + history + `security_events` + outbox commit together. PostgreSQL `23P01` / `*_time_excl` map to `AppointmentConflictError`.

In-memory tests serialize writes with a mutex (`exclusive()`) so concurrent overlapping creates cannot double-book.

---

## 8. Tests

`packages/application/src/appointment/appointment.security.test.ts` covers:

1. unauthenticated create
2. STAFF happy path (create / read / list / reschedule / cancel)
3. PRACTITIONER and PRACTICE_ADMIN create
4. cross-tenant GET / PATCH / cancel / reschedule → `404`
5. tampered organization header → `403`
6. missing membership / revoked / disabled
7. PATIENT deny
8. SYSTEM_ADMIN deny
9. foreign patient / branch / practitioner
10. inactive patient (no new appointment; historical readable)
11. invalid transition after cancel
12. overlapping practitioner and patient appointments
13. adjacent slots and cancelled-slot reuse
14. concurrent conflicting creates
15. history / audit / outbox failure atomicity
16. deny bodies do not leak PII
17. migration SQL contains exclusion + RESTRICT + no CASCADE + no `appointment.read.self`

E2E: unauthenticated `GET /api/appointments` returns `401`.

---

## 9. Security assumptions

- M1 session cookie remains the only browser session.
- Organization context is server-validated through membership + permission.
- Appointment queries always include `organizationId`.
- Cross-tenant reads look like not-found.
- Appointment PII is not written to ordinary logs.
- Notification outbox is intent-only; the worker does not dispatch.

---

## 10. Known limitations

- No confirm / check-in / start / complete / no-show HTTP operations.
- No practitioner management API.
- No branch-scoped authorization.
- No patient portal / self-access.
- No calendar integration.
- No notification delivery.
- No hard delete.
- Cognito Hosted UI still uses placeholder domains until human AWS setup.

---

## 11. Validation

| Gate           | Command                 | Result                                                          |
| -------------- | ----------------------- | --------------------------------------------------------------- |
| Tests          | `pnpm test`             | PASS (124 tests)                                                |
| Lint           | `pnpm lint`             | PASS                                                            |
| Format         | `pnpm format:check`     | PASS                                                            |
| Typecheck      | `pnpm typecheck`        | PASS                                                            |
| DB validation  | `pnpm db:validate`      | PASS                                                            |
| Build          | `pnpm build`            | PASS (`/api/appointments`, `/api/appointments/[appointmentId]`) |
| Security audit | `pnpm security:audit`   | PASS (no known vulnerabilities)                                 |
| Secrets        | `pnpm security:secrets` | PASS                                                            |
| E2E            | `CI=true pnpm test:e2e` | PASS (5 tests)                                                  |

---

## 12. Git

Branch: `cursor/m4-appointment-domain-3efc` (from approved discovery `9183efe`). M0–M3 and discovery/approval commits intact.

| Commit    | Message                                                          |
| --------- | ---------------------------------------------------------------- |
| `30f246c` | `feat(appointment): add appointment domain foundation`           |
| `e85713b` | `feat(appointment): add scheduling integrity`                    |
| `828e9e4` | `feat(appointment): add appointment authorization and lifecycle` |
| `9c7d4b9` | `test(appointment): add security and concurrency coverage`       |
| `ab010dc` | `docs(appointment): document m4 implementation`                  |
| `3685c8a` | `fix(appointment): satisfy lint, format, and typecheck`          |

Draft PR: https://github.com/ravishori/Ai-Dentist-System-Webapp/pull/5 (base: `cursor/m4-appointment-discovery-3efc`). Not merged. PR #4 remains discovery/approval only.

---

## 13. Production readiness

M4 is **not** production-ready unless production security, privacy, operational, infrastructure, and governance prerequisites have been independently reviewed and approved by the human.
