# TDA-M6 Appointment Operations Contract

**Status:** Implemented for M6 (Appointment Operations)  
**Date:** 2026-08-15  
**Depends on:** M0–M5, approved `docs/ADR-FOLLOWUP-M6.md` (APPROVED 2026-08-15)  
**Does not implement:** new notification event types, calendar integration, clinical notes, billing, payments, patient portal, hard-delete, reopen of terminal appointments

This document is the application-facing contract for M6. Architecture decisions are those approved in `docs/ADR-FOLLOWUP-M6.md`. M4 create/read/reschedule/cancel remain as specified in `docs/TDA-M4-APPOINTMENT-CONTRACT.md`, except that cancel is no longer allowed from `IN_PROGRESS`.

---

## 1. Objective

M6 adds command-style lifecycle operations on existing organization-scoped appointments.

```text
Authenticated User
        ↓
AuthorizationPort.authorize(permission)
        ↓
organizationId + appointmentId lookup
        ↓
M6-01 / M6-06 transition + time rules
        ↓
same transaction: appointment + history + security_events
        ↓
no notification_outbox row
```

---

## 2. Command routes and permissions

| Method | Path                             | Permission             |
| ------ | -------------------------------- | ---------------------- |
| `POST` | `/api/appointments/:id/confirm`  | `appointment.confirm`  |
| `POST` | `/api/appointments/:id/check-in` | `appointment.check_in` |
| `POST` | `/api/appointments/:id/start`    | `appointment.start`    |
| `POST` | `/api/appointments/:id/complete` | `appointment.complete` |
| `POST` | `/api/appointments/:id/no-show`  | `appointment.no_show`  |

Bodies must be empty. `status`, `userId`, `organizationId`, clinical notes, and other fields are rejected.

Success: `200` with `{ appointment }` in the existing public shape.  
Invalid transition or timing: `400 invalid_input`.  
Unauthenticated: `401`. Forbidden: `403`. Missing or cross-tenant: `404 not_found`. Persistence failure: `503`.

`PATCH /api/appointments/:id` still has no mutable lifecycle fields.

Granted to `STAFF`, `PRACTITIONER`, and `PRACTICE_ADMIN` only. `PATIENT` and `SYSTEM_ADMIN` remain denied.

---

## 3. Lifecycle transitions

```text
REQUESTED  → CONFIRMED (confirm) | CANCELLED (cancel)
CONFIRMED  → CHECKED_IN (check-in) | NO_SHOW (no-show) | CANCELLED (cancel)
CHECKED_IN → IN_PROGRESS (start) | CANCELLED (cancel)
IN_PROGRESS → COMPLETED (complete)
COMPLETED, NO_SHOW, CANCELLED → terminal (no reopen)
```

Skipped, reverse, and reopen transitions are rejected. There is no `RESCHEDULED` status.

Cancel is allowed from `REQUESTED`, `CONFIRMED`, and `CHECKED_IN`. Cancel from `IN_PROGRESS` is denied.

---

## 4. Time rules (M6-06)

Comparisons use stored `startAtUtc` / `endAtUtc` UTC instants.

```text
Check-in is allowed from 30 minutes before the scheduled start until the scheduled end.

Start is allowed only after CHECKED_IN. There is no additional scheduled-time restriction.

Complete is allowed only after IN_PROGRESS. There is no additional scheduled-time restriction.

NO_SHOW is allowed only from CONFIRMED at or after the scheduled start.
```

These rules do not create availability, calendar, clinical, billing, or notification behavior. There is no automatic no-show job.

---

## 5. Terminal states and slot release

`COMPLETED`, `NO_SHOW`, and `CANCELLED` do not occupy practitioner or patient slots. Active statuses remain `REQUESTED`, `CONFIRMED`, `CHECKED_IN`, and `IN_PROGRESS`. PostgreSQL exclusion constraints are unchanged from M4.

---

## 6. History and audit

Each successful M6 command writes, in one transaction:

- appointment status
- one `appointment_history` row (`confirmed`, `checked_in`, `started`, `completed`, `no_show`)
- one `security_events` row (`appointment.confirm`, `appointment.check_in`, `appointment.start`, `appointment.complete`, `appointment.no_show`)

`actorUserId` is the authenticated user. History/audit do not store clinical text or extra PII.

If history or audit persistence fails, the status change is rolled back.

---

## 7. Notification boundary

M6 emits **no** new notification outbox event types. M5 continues to support only:

```text
appointment.created
appointment.rescheduled
appointment.cancelled
```

Confirm, check-in, start, complete, and no-show do not write `notification_outbox` rows and do not change worker, SMTP, consent, or template behavior.

---

## 8. Deferred work and production-readiness gaps

| Topic                                  | Status                         |
| -------------------------------------- | ------------------------------ |
| Production Cognito / DNS / credentials | Required before production     |
| Production Postgres + backups          | Required before production     |
| Real SMTP                              | Still fail-closed; not enabled |
| Calendar integration                   | Deferred                       |
| Clinical notes / treatment outcome     | Not in M6                      |
| Billing / invoices / payments          | Not in M6                      |
| Patient portal / PATIENT self-service  | Denied                         |
| Reopen of terminal appointments        | Not in M6                      |
| Hard delete                            | Not in M6                      |
| Automatic no-show job                  | Not in M6                      |
| Merge to `main` / deploy               | Not authorized                 |

M6 is **not** production-ready.
