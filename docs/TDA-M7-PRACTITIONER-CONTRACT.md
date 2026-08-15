# TDA-M7 Practitioner Management and Availability Contract

**Status:** Implemented for M7 (Practitioner Management and Availability)  
**Date:** 2026-08-15  
**Depends on:** M0–M6, approved `docs/ADR-FOLLOWUP-M7.md` (APPROVED 2026-08-15)  
**Does not implement:** calendar sync, patient-facing booking, practitioner self-schedule, branch timezone, public holidays, complex recurrence, licensing/credentials, hard-delete, new notification event types, automatic cancel/reschedule

This document is the application-facing contract for M7. Architecture decisions are those approved in `docs/ADR-FOLLOWUP-M7.md`. M4 appointment row shape and PostgreSQL exclusion constraints remain unchanged. M6 lifecycle commands remain unchanged.

---

## 1. Objective

M7 adds organization-scoped practitioner profile operations, explicit branch assignment, weekly working hours, dated unavailability, and **advisory** internal availability evaluation.

```text
Authenticated User
        ↓
AuthorizationPort.authorize(permission)
        ↓
organizationId + practitionerId lookup
        ↓
profile / assignment / schedule / leave command
        ↓
same transaction: practitioner mutation + practitioner_history + security_events
        ↓
no notification_outbox row
```

Availability GET is a read/compute path. It does not lock appointments. Create/reschedule remain protected by M4 gist exclusions (`409 conflict`).

---

## 2. Profile lifecycle (M7-01)

One organization-scoped Practitioner Profile per application user. The existing globally unique `userId` is retained.

- Staff (`PRACTICE_ADMIN`) create, update display name, activate, and deactivate.
- Create requires the target user to exist, be active, and have an active membership in the same organization.
- No unlink, linked-user replacement, or hard delete. There is no `DELETE /api/practitioners/:id`.
- Deactivation preserves the row and historical appointments and blocks **new** assignment (M7-07).
- Administrative field in M7: optional `displayName`. No credentials, payroll, or clinical fields.

Statuses: `active` | `inactive`.

---

## 3. Branch assignment (M7-02)

Explicit organization-owned practitioner-to-branch assignments. Unique `(practitionerId, branchId)`.

A new appointment may be created or rescheduled with a practitioner only when:

```text
practitioner belongs to the appointment organization
practitioner is active
practitioner is assigned to the appointment branch
```

User branch-level authorization is not introduced. Membership `branchId` remains unused for RBAC.

---

## 4. Availability data model (M7-03 / M7-04 / M7-05)

### Weekly working hours

One schedule per practitioner+branch. Required IANA timezone on the schedule. Do not infer timezone from the browser. Branch has no timezone column.

Intervals: weekday `0=Sunday` … `6=Saturday`, local start/end as minutes from midnight (`0..1440`, start < end). Overnight intervals are rejected; callers must split them into separate daily intervals.

Durable PostgreSQL exclusion:

```text
EXCLUDE gist (practitionerId, branchId, weekday, int4range(startMinute, endMinute, '[)'))
```

### Dated unavailability

UTC instants plus IANA timezone for local representation. Kinds: `break` | `leave` | `exception`. Status: `active` | `cancelled` (no hard delete). Unavailability may sit inside working hours. Overlapping **active** unavailability intervals for one practitioner are rejected.

Durable PostgreSQL exclusion:

```text
EXCLUDE gist (practitionerId, tstzrange(startAtUtc, endAtUtc, '[)')) WHERE status = 'active'
```

Public-holiday calendars and complex recurrence are deferred.

---

## 5. Timezone and DST policy (M7-03)

- Validate IANA names (`Europe/London`, `UTC`). Reject abbreviations (`IST`, `EST`).
- Expand weekly intervals to UTC with the **schedule** timezone, including DST transitions.
- Appointment `startAtUtc` / `endAtUtc` / appointment `timezone` are unchanged (M4-03).
- Availability queries require explicit `startAtUtc` / `endAtUtc` (UTC) plus `durationMinutes`.

---

## 6. Advisory calculation (M7-06)

Internal evaluation for a requested branch, UTC window, and duration:

```text
assigned branch + active practitioner
  + weekly hours in schedule timezone
  − dated unavailability
  − active M4 appointments (REQUESTED, CONFIRMED, CHECKED_IN, IN_PROGRESS)
```

Outputs:

| Field         | Meaning                                                                                                                      |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `available`   | Remaining UTC ranges whose length is at least `durationMinutes`                                                              |
| `unavailable` | Window coverage with `outside_hours`, `unavailability`, `appointment`, `practitioner_inactive`, or `practitioner_unassigned` |
| `conflicts`   | Existing active appointments that are operationally inconsistent (see §7)                                                    |
| `advisory`    | Always `true`                                                                                                                |

Two overlapping “available” reads can both proceed; M4 exclusions serialize writes.

---

## 7. Appointment behavior and operational conflicts (M7-07)

New create/reschedule onto an inactive or unassigned practitioner returns `400 invalid_input`. Existing appointments are not cancelled, rescheduled, or notified.

Conflict reasons (staff-facing flags only):

| Reason                     | When                                                            |
| -------------------------- | --------------------------------------------------------------- |
| `practitioner_inactive`    | Practitioner is inactive and an active appointment still exists |
| `practitioner_unassigned`  | Practitioner is not assigned to the appointment’s branch        |
| `leave_covers_appointment` | Active unavailability overlaps an active appointment            |

Returned on deactivate, unassign, unavailability create, and availability GET. No new outbox event.

---

## 8. Routes and permissions (M7-08 / M7-09)

| Method | Path                                                       | Permission                       |
| ------ | ---------------------------------------------------------- | -------------------------------- |
| `POST` | `/api/practitioners`                                       | `practitioner.manage`            |
| `GET`  | `/api/practitioners`                                       | `practitioner.read.tenant`       |
| `GET`  | `/api/practitioners/:id`                                   | `practitioner.read.tenant`       |
| `POST` | `/api/practitioners/:id/update`                            | `practitioner.manage`            |
| `POST` | `/api/practitioners/:id/deactivate`                        | `practitioner.manage`            |
| `POST` | `/api/practitioners/:id/activate`                          | `practitioner.manage`            |
| `POST` | `/api/practitioners/:id/branches`                          | `practitioner.assignment.manage` |
| `POST` | `/api/practitioners/:id/branches/:branchId/unassign`       | `practitioner.assignment.manage` |
| `POST` | `/api/practitioners/:id/schedules`                         | `practitioner.schedule.manage`   |
| `POST` | `/api/practitioners/:id/schedules/:scheduleId/replace`     | `practitioner.schedule.manage`   |
| `POST` | `/api/practitioners/:id/unavailability`                    | `practitioner.leave.manage`      |
| `POST` | `/api/practitioners/:id/unavailability/:intervalId/cancel` | `practitioner.leave.manage`      |
| `GET`  | `/api/practitioners/:id/availability`                      | `practitioner.availability.read` |

There is no `DELETE /api/practitioners/:id` and no patient-facing booking endpoint.

| Permission                       | STAFF | PRACTITIONER | PRACTICE_ADMIN | PATIENT | SYSTEM_ADMIN |
| -------------------------------- | ----- | ------------ | -------------- | ------- | ------------ |
| `practitioner.read.tenant`       | allow | allow        | allow          | deny    | deny         |
| `practitioner.manage`            | deny  | deny         | allow          | deny    | deny         |
| `practitioner.assignment.manage` | deny  | deny         | allow          | deny    | deny         |
| `practitioner.schedule.manage`   | allow | **deny**     | allow          | deny    | deny         |
| `practitioner.leave.manage`      | allow | **deny**     | allow          | deny    | deny         |
| `practitioner.availability.read` | allow | allow        | allow          | deny    | deny         |

Practitioners do **not** self-manage schedules or leave. Lookups are `organizationId + practitionerId`. Cross-tenant ids return `404 not_found` when the caller is authorized in their own tenant, and reveal no names, emails, or schedules. Unauthenticated: `401`. Forbidden: `403`. Invalid input: `400`. Unique/overlap conflicts: `409`. Persistence failure: `503`.

---

## 9. Audit and retention (M7-11)

Each successful mutation writes practitioner history + `security_events` with authenticated `actorUserId` in the same transaction. Availability GET is not audited.

History events: `created`, `updated`, `deactivated`, `activated`, `assigned`, `unassigned`, `schedule_replaced`, `unavailability_created`, `unavailability_cancelled`.

Audit actions: `practitioner.create`, `practitioner.update`, `practitioner.deactivate`, `practitioner.activate`, `practitioner.assignment.assign`, `practitioner.assignment.unassign`, `practitioner.schedule.replace`, `practitioner.leave.create`, `practitioner.leave.cancel`.

No hard delete. Foreign keys remain `ON DELETE RESTRICT`. Restrictive retention until a separate legal policy is approved.

---

## 10. Notifications and calendar (M7-12)

No new M5 outbox event types. No calendar synchronization. No patient-facing notifications from practitioner mutations. M5 remains `appointment.created` / `appointment.rescheduled` / `appointment.cancelled` only. Worker remains disabled by default.

---

## 11. Compatibility

M1–M6 migrations are not rewritten. Existing practitioner rows receive `status='active'` and nullable `displayName`. Existing appointments remain readable and are not automatically modified. M4 exclusion constraints are unchanged.
