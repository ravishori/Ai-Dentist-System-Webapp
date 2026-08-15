# TDA-M6 Implementation Report

**Milestone:** M6 Appointment Operations  
**Date:** 2026-08-15  
**Status:** Implemented on `cursor/m6-appointment-operations-3efc`; **not production-ready**  
**Depends on:** M0–M5, approved `docs/ADR-FOLLOWUP-M6.md` (APPROVED 2026-08-15)  
**Does not redesign:** M1 authentication, M2 authorization evaluator, M3 patient identity, M4 appointment identity/exclusions, M5 delivery/worker/SMTP

---

## 1. What was implemented

Command-style tenant-scoped appointment operations following M6-01 through M6-12:

```text
POST /api/appointments/:id/confirm
POST /api/appointments/:id/check-in
POST /api/appointments/:id/start
POST /api/appointments/:id/complete
POST /api/appointments/:id/no-show
```

M4 create, list, get, PATCH (non-mutating), reschedule, and cancel remain. Cancel is narrowed: allowed through `CHECKED_IN`, denied after `IN_PROGRESS`.

---

## 2. Files created

- `packages/db/prisma/migrations/20260815160000_m6_appointment_operations/migration.sql`
- `apps/web/src/app/api/appointments/[appointmentId]/confirm/route.ts`
- `apps/web/src/app/api/appointments/[appointmentId]/check-in/route.ts`
- `apps/web/src/app/api/appointments/[appointmentId]/start/route.ts`
- `apps/web/src/app/api/appointments/[appointmentId]/complete/route.ts`
- `apps/web/src/app/api/appointments/[appointmentId]/no-show/route.ts`
- `apps/web/src/infrastructure/appointment/command-route.ts`
- `packages/application/src/appointment/appointment.operations.test.ts`
- `docs/TDA-M6-APPOINTMENT-OPERATIONS-CONTRACT.md`
- `docs/TDA-M6-IMPLEMENTATION-REPORT.md`

M1–M5 Prisma migration files were **not** rewritten. `docs/ADR-FOLLOWUP-M6.md` was not edited in this implementation.

---

## 3. Lifecycle, timing, and slot release

Strict forward transitions only. Terminal: `COMPLETED`, `NO_SHOW`, `CANCELLED` (no reopen).

Time rules: check-in from 30 minutes before `startAtUtc` through `endAtUtc`; start after `CHECKED_IN` with no extra clock rule; complete after `IN_PROGRESS` with no extra clock rule; no-show from `CONFIRMED` at or after `startAtUtc`.

Exclusion constraints are unchanged. Terminal statuses already fall outside `ACTIVE_SCHEDULING_STATUSES` and therefore release practitioner and patient slots.

---

## 4. Authorization

New tenant permissions: `appointment.confirm`, `appointment.check_in`, `appointment.start`, `appointment.complete`, `appointment.no_show`.

Seeded for `STAFF`, `PRACTITIONER`, and `PRACTICE_ADMIN` only. `PATIENT` and `SYSTEM_ADMIN` remain denied. Lookups remain `organizationId + appointmentId`. Cross-tenant commands return `404 not_found`.

---

## 5. Persistence, audit, notifications

Each successful M6 command writes appointment status + one history event + one security event in the same transaction. `actorUserId` is the authenticated user.

**No** `notification_outbox` insert for confirm, check-in, start, complete, or no-show. M5 event types, templates, worker defaults, SMTP, and consent/opt-out are unchanged.

No clinical notes, billing, calendar, or patient-portal fields.

---

## 6. Tests

`packages/application/src/appointment/appointment.operations.test.ts` covers valid and prohibited transitions, terminal non-reopen, check-in window, no-show-before-start, start/complete status rules, cancel through check-in and deny after in-progress, slot release after terminal states, history/audit once per command, rollback if history/audit fails, no new outbox types, RBAC denials, cross-tenant 404, and body tampering.

Live PostgreSQL concurrent exclusion tests are **not** executed in CI: CI `DATABASE_URL` is the `USER:PASSWORD` placeholder and no Postgres service is started. In-memory overlap coverage matches the M4 exclusion `WHERE` list (`REQUESTED`, `CONFIRMED`, `CHECKED_IN`, `IN_PROGRESS`). See existing M4/M5 CI limitation notes.

---

## 7. Validation

Recorded after the M6 implementation gates in this task.

---

## 8. Production readiness blockers

- Human review of draft PR #7
- Production Cognito / DNS / credentials
- Production Postgres + backups
- Real SMTP remains disabled (not authorized here)
- Calendar, clinical, billing, and patient-portal features remain out of scope
- Merge to `main` and deployment are not authorized
