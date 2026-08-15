# TDA-ADR-FOLLOWUP-M6

## M6 Appointment Operations — Human Architecture Decision Record

**Document ID:** TDA-ADR-FOLLOWUP-M6  
**Version:** 1.0  
**Status:** APPROVED  
**Date:** 2026-08-15  
**Milestone:** M6 — Appointment Operations  
**Depends on:** approved `docs/ADR-FOLLOWUP-M4.md` (M4-13 lifecycle; M4-10 permissions; M4-16 retention; M4-17 history) and approved `docs/ADR-FOLLOWUP-M5.md` (M5-06 events; M5-09 worker disabled by default)  
**Scope:** Confirm, check-in, start, complete, and no-show operations on existing organization-scoped appointments  
This file is the approved M6 architecture decision record.

```text
This approval authorizes M6 implementation only within M6-01 through M6-12.

It does not authorize production release, deployment, merge to main, calendar integration, clinical documentation, billing, patient self-service, new M5 notification event types, or unrelated features.
```

---

# 1. Purpose

M4 persisted the appointment status vocabulary and implemented **create**, **read**, **reschedule**, and **cancel**. Status values `CONFIRMED`, `CHECKED_IN`, `IN_PROGRESS`, `COMPLETED`, and `NO_SHOW` already exist in the CHECK constraint and domain helpers, but **no command mutates into those states**.

M6 may add the remaining lifecycle operations according to the approved decisions in this document.

```text
APPROVED — M6 implementation authorized within M6-01 through M6-12 only
```

---

# 2. Verified M4 / M5 baseline (do not redesign)

Inspected on `cursor/m3-patient-domain-3efc` after M5 merge (`5503e19`) plus the M5-07 retry-config cleanup on this branch.

## 2.1 Status model

Stored statuses (`appointments_status_check` and `APPOINTMENT_STATUSES`):

```text
REQUESTED
CONFIRMED
CHECKED_IN
IN_PROGRESS
COMPLETED
NO_SHOW
CANCELLED
```

New appointments start as `REQUESTED`. M4 mutates status only via **cancel** → `CANCELLED`. Reschedule is a command and history event; there is **no** `RESCHEDULED` status.

M4 domain helpers today:

| Helper          | Allowed from                                          |
| --------------- | ----------------------------------------------------- |
| `canCancel`     | `REQUESTED`, `CONFIRMED`, `CHECKED_IN`, `IN_PROGRESS` |
| `canReschedule` | `REQUESTED`, `CONFIRMED`                              |

M4 ADR M4-13 diagram showed `CANCELLED` from `REQUESTED` and `NO_SHOW` from `CONFIRMED`. The implemented `canCancel` helper is **wider** than that diagram. M6-01 and M6-02 must resolve the gap.

## 2.2 Conflict / slot occupancy

`ACTIVE_SCHEDULING_STATUSES` and both exclusion constraints (`appointments_practitioner_time_excl`, `appointments_patient_time_excl`) occupy a slot when status is:

```text
REQUESTED, CONFIRMED, CHECKED_IN, IN_PROGRESS
```

`COMPLETED`, `NO_SHOW`, and `CANCELLED` are **already excluded** from those constraints and therefore already release the slot. Range is half-open `[start, end)`.

## 2.3 Authorization

Existing appointment permissions: `appointment.create`, `appointment.read.tenant`, `appointment.update.tenant`, `appointment.reschedule`, `appointment.cancel`.

Granted to `STAFF`, `PRACTITIONER`, and `PRACTICE_ADMIN`. **Denied** to `PATIENT` (M4-08) and `SYSTEM_ADMIN` (M4-09). Application code uses `AuthorizationPort.authorize()` and does not branch on role names.

There are **no** confirm / check-in / start / complete / no-show permissions.

## 2.4 HTTP surface today

| Method  | Path                               | Permission                                                       |
| ------- | ---------------------------------- | ---------------------------------------------------------------- |
| `POST`  | `/api/appointments`                | `appointment.create`                                             |
| `GET`   | `/api/appointments`                | `appointment.read.tenant`                                        |
| `GET`   | `/api/appointments/:id`            | `appointment.read.tenant`                                        |
| `PATCH` | `/api/appointments/:id`            | `appointment.update.tenant` (lookup then 400; no mutable fields) |
| `POST`  | `/api/appointments/:id/reschedule` | `appointment.reschedule`                                         |
| `POST`  | `/api/appointments/:id/cancel`     | `appointment.cancel`                                             |

No `DELETE`. No confirm / check-in / start / complete / no-show routes. Cross-tenant ids return the same `404 not_found` as a missing row.

## 2.5 History, audit, and outbox

History event types today: `created`, `rescheduled`, `cancelled`.

Each mutation writes, in one transaction: appointment row + `appointment_history` (`actorUserId` = authenticated user) + `security_events` (`appointment.create` / `appointment.reschedule` / `appointment.cancel`) + `notification_outbox` intent.

M5 delivers only:

```text
appointment.created
appointment.rescheduled
appointment.cancelled
```

The M5 worker remains **disabled by default**. Real SMTP remains fail-closed.

## 2.6 Retention

M4-16: no `DELETE /api/appointments/:id`; foreign keys `ON DELETE RESTRICT`; no hard delete through the application API.

M1–M5 architecture is not to be redesigned by M6.

---

# 3. Decision summary (approved)

| #     | Decision                       | Approved decision                                                                                                                                                                                                          |
| ----- | ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M6-01 | Status lifecycle               | Strict forward transitions only. No skipped states. `NO_SHOW` only from `CONFIRMED`. Terminal: `COMPLETED`, `NO_SHOW`, `CANCELLED`.                                                                                        |
| M6-02 | Cancel after check-in / start  | Cancel **allowed** after check-in. Cancel **not allowed** after `IN_PROGRESS`. This **narrows** M4 `canCancel`.                                                                                                            |
| M6-03 | Who may operate                | `STAFF`, `PRACTITIONER`, `PRACTICE_ADMIN` for all M6 commands. `PATIENT` and `SYSTEM_ADMIN` remain denied.                                                                                                                 |
| M6-04 | New permissions                | `appointment.confirm`, `appointment.check_in`, `appointment.start`, `appointment.complete`, `appointment.no_show`. Do not reuse `appointment.update.tenant`.                                                               |
| M6-05 | Command API                    | Dedicated `POST /api/appointments/:id/{confirm,check-in,start,complete,no-show}`. No PATCH status. Do not implement until approved.                                                                                        |
| M6-06 | Time rules                     | Check-in from 30 minutes before start until scheduled end. Start after `CHECKED_IN` with no extra time rule. Complete after `IN_PROGRESS` with no extra time rule. `NO_SHOW` from `CONFIRMED` at or after scheduled start. |
| M6-07 | Conflict / slot release        | Confirm existing M4 exclusions: `COMPLETED`, `NO_SHOW`, `CANCELLED` release the slot; the four active statuses continue to block overlap.                                                                                  |
| M6-08 | History and audit              | One history event and one `security_events` row per successful transition; actor is the authenticated user.                                                                                                                |
| M6-09 | Notifications                  | **No new notification event types in M6.** M5 remains created / rescheduled / cancelled only.                                                                                                                              |
| M6-10 | Clinical / billing on complete | **No.** Completion changes lifecycle status only.                                                                                                                                                                          |
| M6-11 | Reopen                         | **No reopen in M6.** Terminal states stay terminal.                                                                                                                                                                        |
| M6-12 | Retention / hard delete        | Preserve M4-16: no hard delete.                                                                                                                                                                                            |

These decisions are **approved**. Future changes require a new or updated decision record.

---

# 4. M6-01 — Exact status lifecycle and allowed transitions

## Proposed transitions

```text
REQUESTED
    ├── CONFIRMED          (confirm)
    └── CANCELLED          (existing cancel)

CONFIRMED
    ├── CHECKED_IN         (check-in)
    ├── NO_SHOW            (no-show)
    └── CANCELLED          (existing cancel)
    (reschedule remains an operation; status stays CONFIRMED or REQUESTED per M4)

CHECKED_IN
    ├── IN_PROGRESS        (start)
    └── CANCELLED          (existing cancel; see M6-02)

IN_PROGRESS
    └── COMPLETED          (complete)
    (cancel denied; see M6-02)

COMPLETED                  terminal
NO_SHOW                    terminal
CANCELLED                  terminal
```

## Explicitly not allowed (unless the human changes this)

- Skipping `CONFIRMED` (`REQUESTED` → `CHECKED_IN` / `IN_PROGRESS` / `COMPLETED` / `NO_SHOW`)
- Skipping `CHECKED_IN` (`CONFIRMED` → `IN_PROGRESS` / `COMPLETED`)
- Skipping `IN_PROGRESS` (`CHECKED_IN` → `COMPLETED`)
- `NO_SHOW` from any status other than `CONFIRMED`
- Reverse transitions (for example `CONFIRMED` → `REQUESTED`)
- Any transition out of `COMPLETED`, `NO_SHOW`, or `CANCELLED` (see M6-11)

Reschedule does **not** become a status. It remains the M4 command, allowed only from `REQUESTED` or `CONFIRMED`.

## Rationale

Matches the M4-13 diagram more closely than the current `canCancel` helper, while keeping cancel on `CONFIRMED` and `CHECKED_IN` as operational reality. Forcing every visit through confirm → check-in → start → complete keeps audit history unambiguous.

## M4 / M5 compatibility

No new status strings. The existing CHECK constraint is sufficient if these transitions are enforced in application code. M5 is unaffected because no new outbox types are proposed (M6-09).

## Requires human confirmation

The exact allowed-from set for each command, including whether `NO_SHOW` may ever be recorded from `REQUESTED` or `CHECKED_IN`.

---

# 5. M6-02 — Cancellation after check-in or after work begins

## Proposed

```text
Cancel after CHECKED_IN: allowed
Cancel after IN_PROGRESS: not allowed
```

## Rationale

A checked-in patient may still leave before treatment. Once work has started (`IN_PROGRESS`), the visit should end as `COMPLETED` rather than `CANCELLED`, so reporting and slot-release semantics stay distinct.

This **narrows** M4 `canCancel`, which currently allows cancel from `IN_PROGRESS`. If approved, M6 implementation must update that helper. If the human prefers to keep M4’s wider cancel rule, say so explicitly in approval.

## Security implications

Invalid transitions must return the same generic `400 invalid_input` used by M4. Do not leak current status or schedule in denied bodies.

---

# 6. M6-03 — Who may perform each operation

## Proposed role matrix

| Operation | STAFF            | PRACTITIONER     | PRACTICE_ADMIN   | PATIENT | SYSTEM_ADMIN |
| --------- | ---------------- | ---------------- | ---------------- | ------- | ------------ |
| confirm   | allow            | allow            | allow            | deny    | deny         |
| check-in  | allow            | allow            | allow            | deny    | deny         |
| start     | allow            | allow            | allow            | deny    | deny         |
| complete  | allow            | allow            | allow            | deny    | deny         |
| no-show   | allow            | allow            | allow            | deny    | deny         |
| cancel    | allow (existing) | allow (existing) | allow (existing) | deny    | deny         |

Enforcement is by **permission keys** (M6-04) granted to those three tenant roles, not by role-name branching in appointment code.

## Rationale

Same tenant-staff pattern as M4. A patient portal and platform-admin appointment access remain out of scope.

## Security implications

`PATIENT` and `SYSTEM_ADMIN` stay denied on appointment APIs. Cross-tenant ids continue to return `404 not_found`. Inactive membership / inactive organization continue to fail closed through `AuthorizationPort`.

---

# 7. M6-04 — New tenant-scoped permissions

## Proposed keys

```text
appointment.confirm
appointment.check_in
appointment.start
appointment.complete
appointment.no_show
```

Seed them for `STAFF`, `PRACTITIONER`, and `PRACTICE_ADMIN` only.

Do **not**:

- reuse `appointment.update.tenant` for status commands (PATCH remains non-mutating)
- introduce `appointment.read.self` or patient self-service keys
- grant these keys to `PATIENT` or `SYSTEM_ADMIN`

## Rationale

M4 already separated `reschedule` and `cancel` from generic update. Status operations are similarly irreversible and must be independently authorizable.

---

# 8. M6-05 — Command-style API surface

## Proposed routes (do not implement in this task)

```text
POST /api/appointments/:id/confirm
POST /api/appointments/:id/check-in
POST /api/appointments/:id/start
POST /api/appointments/:id/complete
POST /api/appointments/:id/no-show
```

Existing `POST /api/appointments/:id/cancel` remains the cancel command.

## Proposed HTTP behavior

- Authenticate (M1) then authorize the matching M6-04 permission in the requested organization (M2).
- Lookup by `organizationId + appointmentId` only.
- Empty bodies unless a later approved decision adds fields (M6-10 proposes none).
- Success: `200` with `{ appointment }` in the existing public shape.
- Invalid transition / time-rule failure: `400 invalid_input`.
- Unauthenticated: `401`. Forbidden: `403`. Missing or cross-tenant: `404`. Persistence failure: `503`.
- Prefix remains `/api/...`, not `/api/v1`.

## Explicitly out of scope

- Generic PATCH of `status`
- Batch operations
- History list HTTP routes
- Practitioner management APIs
- Patient-portal APIs

---

# 9. M6-06 — Time rules

All comparisons use the appointment’s stored `startAtUtc` / `endAtUtc` (UTC instants). The appointment `timezone` is not a separate clock; it remains display metadata.

## Proposed

```text
Check-in is allowed from 30 minutes before the scheduled start until the scheduled end.

Start is allowed only after CHECKED_IN. There is no additional scheduled-time restriction.

Complete is allowed only after IN_PROGRESS. There is no additional scheduled-time restriction.

NO_SHOW is allowed only from CONFIRMED at or after the scheduled start.

These rules do not create appointment availability, calendar, clinical, billing, or notification behavior.
```

There is **no** automatic no-show job in M6. Recording no-show is an explicit staff command.

## Requires human confirmation

Whether 30 minutes is the correct check-in lead time, and whether a grace period after start should be required before no-show. Start and complete have no additional scheduled-time restriction beyond `CHECKED_IN` and `IN_PROGRESS`.

---

# 10. M6-07 — Conflict semantics for terminal states

## Proposed

Confirm the existing M4 exclusion behavior. Do **not** change the PostgreSQL exclusion constraints in M6 unless a human decision requires it.

| Status        | Occupies practitioner/patient slot |
| ------------- | ---------------------------------- |
| `REQUESTED`   | yes                                |
| `CONFIRMED`   | yes                                |
| `CHECKED_IN`  | yes                                |
| `IN_PROGRESS` | yes                                |
| `COMPLETED`   | **no — releases slot**             |
| `NO_SHOW`     | **no — releases slot**             |
| `CANCELLED`   | **no — releases slot**             |

After complete, no-show, or cancel, another appointment may use the same practitioner or patient overlap window.

## Rationale

Slot release is already how M4 cancel works. Terminal M6 states should behave the same way so reporting and scheduling stay consistent.

---

# 11. M6-08 — Required history and audit events

## Proposed appointment history event types (additive)

| Command  | `eventType`  | `fromStatus`  | `toStatus`    | `actorUserId`      |
| -------- | ------------ | ------------- | ------------- | ------------------ |
| confirm  | `confirmed`  | `REQUESTED`   | `CONFIRMED`   | authenticated user |
| check-in | `checked_in` | `CONFIRMED`   | `CHECKED_IN`  | authenticated user |
| start    | `started`    | `CHECKED_IN`  | `IN_PROGRESS` | authenticated user |
| complete | `completed`  | `IN_PROGRESS` | `COMPLETED`   | authenticated user |
| no-show  | `no_show`    | `CONFIRMED`   | `NO_SHOW`     | authenticated user |

Existing `created`, `rescheduled`, and `cancelled` remain unchanged.

## Proposed security audit actions

```text
appointment.confirm
appointment.check_in
appointment.start
appointment.complete
appointment.no_show
```

Same shape as M4: `actorUserId`, `organizationId`, `action`, `outcome: allowed`. No patient PII, appointment times, or clinical text in history or audit rows.

Routine GET remains unaudited.

Writes remain **one transaction**: appointment status + history + security event. **No** outbox insert for these operations under M6-09.

There is no system actor in M6; every transition is a human API command.

---

# 12. M6-09 — Notification intents

## Proposed default

```text
No new notification event types in M6.
```

M5 continues to send only created, rescheduled, and cancelled email (when the worker is explicitly enabled and eligibility passes). Confirm, check-in, start, complete, and no-show do **not** write `notification_outbox` rows.

## Rationale

M5-06 is approved as those three events only. Adding confirm/complete/no-show mail would require templates, consent reuse, retry load, and a new M5 decision. M6 should not silently expand M5.

## Compatibility

The worker stays disabled by default. Real SMTP stays fail-closed. This task must not enable either.

If the human wants patient-facing confirm or no-show mail, that is a **separate** notification decision after M6, not an M6 default.

---

# 13. M6-10 — Completion payload (clinical / billing)

## Proposed default

```text
No.
```

`POST .../complete` changes appointment lifecycle status only. It must not accept or persist clinical notes, diagnosis, treatment outcome, prescriptions, charting, invoices, payments, or insurance data.

## Rationale

Clinical and billing domains are explicitly out of M0–M5 scope and remain out of M6.

---

# 14. M6-11 — Reopen policy

## Proposed default

```text
No reopen in M6.
```

`COMPLETED`, `NO_SHOW`, and `CANCELLED` cannot return to an active scheduling status. Correcting a mistaken no-show or cancel is a future, separately approved workflow (if ever).

---

# 15. M6-12 — Retention and hard delete

## Proposed default

```text
Preserve M4-16: no hard delete.
```

No `DELETE /api/appointments/:id`. Foreign keys remain `ON DELETE RESTRICT`. Terminal appointments remain readable according to `appointment.read.tenant`. Automatic purge remains unauthorized (M5-11 already requires a separate retention policy for outbox metadata).

---

# 16. Security implications (summary)

- Tenant scope and BOLA 404 behavior stay identical to M4.
- Each new command has its own permission; PATCH cannot become a status backdoor.
- Denied responses must not include patient names, emails, phones, dates of birth, appointment times, practitioner identity, or branch information.
- History/audit store actor id and status names only.
- No patient portal. No SYSTEM_ADMIN appointment operations.
- No new notification PII paths.

---

# 17. Authorization of implementation

This approved record authorizes a **later** M6 implementation task to follow M6-01 through M6-12.

```text
This approval authorizes M6 implementation only within M6-01 through M6-12.

It does not authorize production release, deployment, merge to main, calendar integration, clinical documentation, billing, patient self-service, new M5 notification event types, or unrelated features.
```

This approval task does **not** start that implementation.

---

# 18. What was approved

1. Exact allowed transitions (M6-01), including `NO_SHOW` source states.
2. Cancel after `CHECKED_IN` and after `IN_PROGRESS` (M6-02). Proposed: yes after check-in, no after start.
3. Role access for each command (M6-03). Proposed: tenant staff only.
4. New permission key names and grants (M6-04).
5. Command routes (M6-05). Proposed paths above; do not implement until approved.
6. Time rules (M6-06). Proposed: check-in from 30 minutes before start until scheduled end; start after `CHECKED_IN` with no extra time rule; complete after `IN_PROGRESS` with no extra time rule; `NO_SHOW` from `CONFIRMED` at or after scheduled start.
7. Slot release for `COMPLETED` / `NO_SHOW` / `CANCELLED` (M6-07). Proposed: confirm current M4 exclusions.
8. History event names and security-event actions (M6-08).
9. Whether any M6 operation creates a notification intent (M6-09). Proposed: **none**.
10. Whether complete may record clinical or billing data (M6-10). Proposed: **no**.
11. Whether terminal appointments may be reopened (M6-11). Proposed: **no**.
12. Retention / hard-delete (M6-12). Proposed: keep M4-16.

---

# 19. HUMAN APPROVAL

## Approval Status

```text
APPROVED
```

## Approved By

```text
Name: Project Owner
Role: Project Owner
Date: 2026-08-15
```

## Human Approval Statement

I have reviewed the M6 Appointment Operations decisions in this document and approve them as the architectural basis for M6 implementation.

I understand that:

- M6 implementation will follow these decisions only.
- This approval authorizes M6 implementation only within M6-01 through M6-12.
- It does not authorize production release, deployment, merge to main, calendar integration, clinical documentation, billing, patient self-service, new M5 notification event types, or unrelated features.
- Future changes require a new or updated decision record.

```text
Human Approval:

[x] APPROVED
[ ] NOT APPROVED
```

---

# 20. Post-approval rule

This document is the M6 implementation source of truth.

A **separate** implementation task may follow M6-01 through M6-12. This approval does not itself add routes, migrations, permissions, notifications, tests, or worker changes.

If implementation reveals a conflict with approved M4 or M5: **STOP** and report it. Do not silently change the architecture.

Production release, deployment, and merge to `main` remain separate decisions.
