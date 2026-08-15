# TDA-M4 Appointment Domain Contract

**Status:** Implemented for M4 (Appointment Domain)  
**Date:** 2026-08-15  
**Depends on:** M0 repository baseline, M1 authentication, M2 authorization / organization-tenant foundation, M3 patient domain, `docs/ADR-FOLLOWUP-M4.md` (APPROVED)  
**Does not implement:** Notification delivery, calendar integration, practitioner management API, clinical records, treatment, prescriptions, billing, payments, patient portal, AI diagnosis

This document is the application-facing contract for M4. It does not replace TDA-ADR-001, TDA-ADR-002, or TDA-IMP-M3-001. Where this contract is more specific about M4 implementation, it is the source of truth for that milestone. Architecture decisions are those approved in `docs/ADR-FOLLOWUP-M4.md`.

---

## 1. Objective

M4 establishes organization-scoped appointment scheduling on top of frozen M1 session and M2 `AuthorizationPort`.

```text
Authenticated User
        ↓
Organization Membership
        ↓
Authorization Decision (AuthorizationPort)
        ↓
Appointment Domain
        ↓
same-org Patient / Practitioner Profile / Branch checks
        ↓
Appointment Repository (organization-scoped)
        ↓
Database (exclusion constraints + history + audit + outbox intent)
```

An appointment must never become globally accessible merely because a user is authenticated.

---

## 2. Practitioner ≠ User ≠ Patient

```text
Application User  ≠  Patient  ≠  Practitioner Profile
```

M4 implements a **minimum Practitioner Profile** (M4-01):

| Field            | Notes                                       |
| ---------------- | ------------------------------------------- |
| `id`             | cuid; this is `appointments.practitionerId` |
| `organizationId` | owning organization                         |
| `userId`         | 0..1 link to an application user (unique)   |

There is **no** public practitioner HTTP API in M4. Tests and operators seed profiles through the repository. Practitioner licensing, availability, leave, and portal are deferred.

A Cognito `sub` or M1 `userId` is not an appointment practitioner identifier.

---

## 3. Appointment identity model

| Field            | Type        | Required | Notes                                            |
| ---------------- | ----------- | -------- | ------------------------------------------------ |
| `id`             | cuid        | yes      | Opaque identifier; not sequential                |
| `organizationId` | cuid        | yes      | Owning organization; immutable                   |
| `branchId`       | cuid        | yes      | Same organization; no branch-level auth          |
| `patientId`      | cuid        | yes      | Same-organization patient                        |
| `practitionerId` | cuid        | yes      | Practitioner profile id, not Cognito/`userId`    |
| `startAtUtc`     | ISO instant | yes      | Stored as timestamptz                            |
| `endAtUtc`       | ISO instant | yes      | Must be strictly after `startAtUtc`              |
| `timezone`       | IANA name   | yes      | Required; abbreviations such as IST/EST rejected |
| `status`         | closed set  | yes      | Default `REQUESTED`                              |
| `createdAt`      | DateTime    | yes      | Set by persistence                               |
| `updatedAt`      | DateTime    | yes      | Set by persistence                               |

Statuses stored: `REQUESTED`, `CONFIRMED`, `CHECKED_IN`, `IN_PROGRESS`, `COMPLETED`, `NO_SHOW`, `CANCELLED`.

M4 mutates status only via **cancel** (`CANCELLED`). Confirm / check-in / start / complete / no-show routes are not implemented.

Reschedule is an **operation and history event**. It does not persist a `RESCHEDULED` status.

---

## 4. Tenant boundary

Appointments belong to one organization. Patient, branch, and practitioner must belong to that same organization.

Organization context is taken from:

1. `x-organization-id` header, or
2. `organizationId` query parameter

The body must **not** supply `organizationId`, `userId`, `role`, or `permission`. Those fields are rejected.

The server then:

1. authenticates the session (M1)
2. authorizes the requested permission in that organization (M2 `AuthorizationPort`)
3. performs appointment queries constrained by `organizationId`

Changing `x-organization-id` cannot grant access to another tenant’s appointments.

---

## 5. Object-level authorization

Required lookup:

```text
organizationId + appointmentId
        ↓
scoped repository query
        ↓
ALLOW / DENY
```

There is no unscoped `findById(appointmentId)`.

Cross-tenant GET / PATCH / cancel / reschedule of a foreign id returns the same `404 not_found` as a missing appointment in the caller’s organization.

---

## 6. Permissions

| Permission                  | Meaning                                        |
| --------------------------- | ---------------------------------------------- |
| `appointment.create`        | Create an appointment in the organization      |
| `appointment.read.tenant`   | List and read appointments in the organization |
| `appointment.update.tenant` | Authorize PATCH lookup (no mutable fields)     |
| `appointment.reschedule`    | Change schedule via reschedule command         |
| `appointment.cancel`        | Cancel an appointment                          |

Not seeded / not evaluated:

- `appointment.read.self`

Role mapping:

| Role             | Appointment permissions |
| ---------------- | ----------------------- |
| `STAFF`          | all five                |
| `PRACTITIONER`   | all five                |
| `PRACTICE_ADMIN` | all five                |
| `PATIENT`        | **none** (M4-08)        |
| `SYSTEM_ADMIN`   | **none** (M4-09)        |

Appointment authorization uses `AuthorizationPort.authorize()`. Appointment application code does not branch on role names.

---

## 7. API contract

| Method  | Path                                          | Permission                  | Notes                                                                 |
| ------- | --------------------------------------------- | --------------------------- | --------------------------------------------------------------------- |
| `POST`  | `/api/appointments`                           | `appointment.create`        | Create; status `REQUESTED`                                            |
| `GET`   | `/api/appointments`                           | `appointment.read.tenant`   | Optional filters: `patientId`, `practitionerId`, `branchId`, `status` |
| `GET`   | `/api/appointments/:appointmentId`            | `appointment.read.tenant`   | Scoped read                                                           |
| `PATCH` | `/api/appointments/:appointmentId`            | `appointment.update.tenant` | Lookup then `400`; no mutable fields                                  |
| `POST`  | `/api/appointments/:appointmentId/reschedule` | `appointment.reschedule`    | Schedule change                                                       |
| `POST`  | `/api/appointments/:appointmentId/cancel`     | `appointment.cancel`        | Status → `CANCELLED`                                                  |

No `DELETE`. No history HTTP routes. No practitioner management routes. Prefix is `/api/...`, not `/api/v1`.

Confirm, check-in, start, complete, and no-show are specified in `docs/TDA-M6-APPOINTMENT-OPERATIONS-CONTRACT.md`.

### 7.1 Create body

Required: `patientId`, `branchId`, `practitionerId`, `startAtUtc`, `endAtUtc`, `timezone`  
Rejected if present: `id`, `organizationId`, `userId`, `status`, `createdAt`, `updatedAt`, unknown fields

Inactive patients cannot receive a **new** appointment. Historical appointments remain readable (and cancellable) according to authorization.

### 7.2 Reschedule body

Required: `startAtUtc`, `endAtUtc`, `timezone`  
Allowed from `REQUESTED` or `CONFIRMED` only.

### 7.3 PATCH

After `appointment.update.tenant` and a scoped lookup: `404` if missing, `400` if the appointment exists. Protected fields include id, organizationId, patientId, branchId, practitionerId, times, and status. Schedule changes use reschedule; cancellation uses cancel.

### 7.4 Success responses

Create: `201` with `{ appointment }`  
List: `200` with `{ appointments }`  
Get: `200` with `{ appointment }`  
Reschedule / cancel: `200` with `{ appointment }`

Appointment JSON:

```json
{
  "id": "clxxxxxxxxxxxxxxxxxxxxxx",
  "organizationId": "clxxxxxxxxxxxxxxxxxxxxxx",
  "branchId": "clxxxxxxxxxxxxxxxxxxxxxx",
  "patientId": "clxxxxxxxxxxxxxxxxxxxxxx",
  "practitionerId": "clxxxxxxxxxxxxxxxxxxxxxx",
  "startAtUtc": "2026-09-01T09:00:00.000Z",
  "endAtUtc": "2026-09-01T10:00:00.000Z",
  "timezone": "Europe/London",
  "status": "REQUESTED",
  "createdAt": "2026-08-15T00:00:00.000Z",
  "updatedAt": "2026-08-15T00:00:00.000Z"
}
```

### 7.5 Error responses

| Status | Code              | Typical cause                                                           |
| ------ | ----------------- | ----------------------------------------------------------------------- |
| 400    | `invalid_input`   | Validation / invalid transition / inactive patient / foreign related id |
| 401    | `unauthenticated` | Missing or invalid session                                              |
| 403    | `forbidden`       | Authenticated but not authorized                                        |
| 404    | `not_found`       | Missing appointment **or** cross-tenant id                              |
| 409    | `conflict`        | Overlapping active practitioner or patient slot                         |
| 503    | `unavailable`     | Persistence / side-effect failure                                       |

Denied responses do not include patient names, emails, phones, dates of birth, appointment times, practitioner identity, or branch information.

---

## 8. Lifecycle helpers (M4)

Cancel allowed from: `REQUESTED`, `CONFIRMED`, `CHECKED_IN`. Cancel from `IN_PROGRESS` is denied (M6-02).  
Reschedule allowed from: `REQUESTED`, `CONFIRMED`.

Active scheduling statuses (occupy a slot): `REQUESTED`, `CONFIRMED`, `CHECKED_IN`, `IN_PROGRESS`.  
Cancelled appointments do not occupy slots. Range is half-open `[start, end)`.

---

## 9. Persistence

Additive migration `20260815120000_m4_appointment_domain`. M1–M3 migrations are unchanged.

Tables: `practitioners`, `appointments`, `appointment_history`, `notification_outbox`.

- Primary keys: `id` (cuid)
- Foreign keys: **ON DELETE RESTRICT** (no CASCADE)
- `startAtUtc` / `endAtUtc`: `TIMESTAMPTZ`
- CHECK: status set; `endAtUtc > startAtUtc`
- PostgreSQL exclusion (`btree_gist`) on overlapping active practitioner **and** patient appointments, scoped by `organizationId`, range `[start, end)`
- Permission seed for STAFF / PRACTITIONER / PRACTICE_ADMIN only

Repository operations always take `organizationId`. Writes persist appointment + history + `security_events` + outbox intent in one transaction. Exclusion violations map to `AppointmentConflictError` (`409`).

The outbox stores **notification intent only**. No SMTP, Twilio, dispatcher, or worker processing is implemented.

---

## 10. Logging and PII

Ordinary logs record event names only, for example `appointment_create`, `appointment_get`.

They must not record:

- full patient names
- phone numbers
- email addresses
- dates of birth
- complete appointment payloads

---

## 11. Explicitly deferred

| Topic                         | Status                                                                  |
| ----------------------------- | ----------------------------------------------------------------------- |
| Confirm / check-in / complete | Implemented in M6; see `docs/TDA-M6-APPOINTMENT-OPERATIONS-CONTRACT.md` |
| Practitioner management API   | Deferred                                                                |
| Branch-level authorization    | Deferred (M4-02)                                                        |
| PATIENT self-access           | Denied (M4-08)                                                          |
| SYSTEM_ADMIN appointment path | Denied (M4-09)                                                          |
| Calendar integration          | Deferred (M4-18)                                                        |
| Notification delivery         | Deferred (M4-19); outbox intent only                                    |
| Hard deletion                 | Not implemented                                                         |
| Clinical domains              | Future milestones                                                       |

---

## 12. Production readiness

M4 is **not** production-ready unless production security, privacy, operational, infrastructure, and governance prerequisites have been independently reviewed and approved by the human.
