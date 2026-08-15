# TDA-M7 Implementation Report

**Milestone:** M7 Practitioner Management and Availability  
**Date:** 2026-08-15  
**Status:** Implemented on `cursor/m7-practitioner-availability-3efc`; **not production-ready**  
**Depends on:** M0–M6, approved `docs/ADR-FOLLOWUP-M7.md` (APPROVED 2026-08-15)  
**Does not redesign:** M1 authentication, M2 authorization evaluator, M3 patient identity, M4 appointment identity/exclusions, M5 delivery/worker/SMTP, M6 lifecycle commands

---

## 1. What was implemented

Organization-scoped practitioner profile operations, explicit branch assignment, weekly working hours, dated unavailability, and internal advisory availability, following M7-01 through M7-12.

```text
POST /api/practitioners
GET  /api/practitioners
GET  /api/practitioners/:id
POST /api/practitioners/:id/update
POST /api/practitioners/:id/deactivate
POST /api/practitioners/:id/activate
POST /api/practitioners/:id/branches
POST /api/practitioners/:id/branches/:branchId/unassign
POST /api/practitioners/:id/schedules
POST /api/practitioners/:id/schedules/:scheduleId/replace
POST /api/practitioners/:id/unavailability
POST /api/practitioners/:id/unavailability/:intervalId/cancel
GET  /api/practitioners/:id/availability
```

M4 create/reschedule now require an **active** practitioner assigned to the appointment branch. Existing appointments are preserved if the practitioner is later deactivated or unassigned.

---

## 2. Files created

Domain:

- `packages/domain/src/practitioner/*`

Persistence:

- `packages/db/prisma/migrations/20260815180000_m7_practitioner_availability/migration.sql`
- `packages/db/src/practitioner-store.ts`

Application:

- `packages/application/src/practitioner/*`
- `packages/application/src/practitioner/practitioner.security.test.ts`
- `packages/application/src/practitioner/practitioner.availability.test.ts`

HTTP:

- `apps/web/src/app/api/practitioners/**`
- `apps/web/src/infrastructure/practitioner/*`

Docs:

- `docs/TDA-M7-PRACTITIONER-CONTRACT.md`
- `docs/TDA-M7-IMPLEMENTATION-REPORT.md`

M1–M6 Prisma migration files were **not** rewritten. `docs/ADR-FOLLOWUP-M7.md` was not edited.

---

## 3. Practitioner lifecycle and branch assignment

One org-scoped profile per application user. Globally unique `userId` retained. Create verifies same-organization active membership. No unlink, replacement, or hard delete. Deactivate/activate are commands. Display name is the only administrative field added.

Assignments are unique per practitioner+branch and must target a branch in the same organization. New appointment create/reschedule reject inactive or unassigned practitioners (`400`). Existing appointments stay in place and are flagged as operational conflicts.

---

## 4. Availability model, timezone/DST, durable constraints

Weekly intervals store weekday + local minute-of-day + schedule IANA timezone. Overnight intervals are rejected. PostgreSQL `btree_gist` exclusion enforces non-overlap per practitioner+branch+weekday on `int4range(startMinute, endMinute, '[)')`.

Dated unavailability stores UTC instants plus IANA timezone. Active intervals for one practitioner may not overlap (`tstzrange` exclusion). Breaks/leave/exceptions may sit inside working hours.

Evaluation converts weekly hours through the schedule timezone (including Europe/London DST). Availability is **advisory**. M4 gist exclusions on appointments remain the booking lock.

Live PostgreSQL concurrent exclusion tests are **not** executed in CI: CI `DATABASE_URL` is the placeholder and no Postgres service is started. In-memory overlap coverage matches the SQL exclusion predicates. See existing M4/M5/M6 CI limitation notes.

---

## 5. Authorization

| Permission                       | STAFF | PRACTITIONER | PRACTICE_ADMIN | PATIENT | SYSTEM_ADMIN |
| -------------------------------- | ----- | ------------ | -------------- | ------- | ------------ |
| `practitioner.read.tenant`       | allow | allow        | allow          | deny    | deny         |
| `practitioner.manage`            | deny  | deny         | allow          | deny    | deny         |
| `practitioner.assignment.manage` | deny  | deny         | allow          | deny    | deny         |
| `practitioner.schedule.manage`   | allow | deny         | allow          | deny    | deny         |
| `practitioner.leave.manage`      | allow | deny         | allow          | deny    | deny         |
| `practitioner.availability.read` | allow | allow        | allow          | deny    | deny         |

Application code uses `AuthorizationPort` only. Practitioners cannot self-manage schedules or leave. Cross-tenant object access returns safe `404`.

---

## 6. Advisory availability and operational conflicts

Availability GET returns `available` ranges, `unavailable` segments with reasons, `conflicts` on existing appointments, and `advisory: true`.

Conflict reasons: `practitioner_inactive`, `practitioner_unassigned`, `leave_covers_appointment`. Adding leave that covers a future appointment does not mutate that appointment and does not write outbox rows.

---

## 7. Audit, history, and notification boundaries

Each successful mutation writes `practitioner_history` + `security_events` in the same transaction. Availability GET is not audited. **No** `notification_outbox` insert. M5 event types, templates, worker defaults, SMTP, and consent/opt-out are unchanged. No calendar adapters.

---

## 8. Tests

`practitioner.security.test.ts` and `practitioner.availability.test.ts` cover profile create/update/activate/deactivate, unique `userId`, no unlink/hard-delete path, same-org assignment, rejected cross-org assignment, inactive/unassigned appointment rejection, preservation of existing appointments, weekly and unavailability non-overlap, DST conversion, advisory availability vs M4 `409`, STAFF/PRACTITIONER/PRACTICE_ADMIN grants, PATIENT/SYSTEM_ADMIN denial, practitioner self-schedule/leave denial, unauthenticated/disabled/missing/revoked denial, cross-tenant `404`, audit rollback, and no new outbox types.

Appointment and notification tests were updated so seeded practitioners are assigned to the appointment branch before create.

---

## 9. Validation

Recorded after the validation suite in this implementation pass.

---

## 10. Production readiness blockers

- Human review of draft PR #8
- Production Cognito / DNS / credentials
- Production Postgres + backups
- Real SMTP remains disabled (not authorized here)
- Live PostgreSQL exclusion tests are not run in CI
- Calendar, clinical, billing, patient-portal, and practitioner self-service remain out of scope
- Merge to `main` and deployment are not authorized
- M8 is not started
