# TDA-M3 Patient Domain Contract

**Status:** Implemented for M3 (Patient Domain Foundation)  
**Date:** 2026-08-14  
**Depends on:** M0 repository baseline, M1 authentication, M2 authorization / organization-tenant foundation  
**Does not implement:** Appointments, clinical records, treatment, prescriptions, billing, payments, notifications, patient portal, AI diagnosis

This document is the application-facing contract for M3. It does not replace TDA-ADR-001, TDA-ADR-002, or TDA-IMP-M2-001. Where this contract is more specific about M3 implementation, it is the source of truth for that milestone.

---

## 1. Objective

M3 establishes the secure application foundation required to create, retrieve, update, and archive patient identities within an organization.

```text
Authenticated User
        ↓
Organization Membership
        ↓
Authorization Decision (AuthorizationPort)
        ↓
Patient Domain
        ↓
Patient Repository (organization-scoped)
        ↓
Database
```

A patient must never become globally accessible merely because a user is authenticated.

---

## 2. Patient ≠ User

M1 `users` represents application authentication identities.

M3 `patients` represents people receiving dental care.

```text
Application User  ≠  Patient
```

M3 does **not**:

- create a Cognito identity for every patient
- store Cognito issuer/subject on the patient table
- treat patient email as an authentication identity
- grant `PATIENT` role holders tenant patient APIs
- implement patient-portal self-access

---

## 3. Identity model

| Field            | Type                   | Required | Notes                                       |
| ---------------- | ---------------------- | -------- | ------------------------------------------- |
| `id`             | cuid                   | yes      | Opaque identifier; not sequential           |
| `organizationId` | cuid                   | yes      | Owning organization; immutable after create |
| `firstName`      | string                 | yes      | 1–80 characters                             |
| `lastName`       | string                 | yes      | 1–80 characters                             |
| `dateOfBirth`    | `YYYY-MM-DD`           | yes      | Calendar date; not in the future            |
| `email`          | string                 | no       | RFC-style email, max 254 characters         |
| `phone`          | string                 | no       | 7–20 digits after punctuation stripped      |
| `status`         | `active` \| `inactive` | yes      | Default `active` on create                  |
| `createdAt`      | DateTime               | yes      | Set by persistence                          |
| `updatedAt`      | DateTime               | yes      | Set by persistence                          |

Not collected in M3: gender, address, national IDs, clinical fields, Cognito fields, branch association.

Primary identifier is **not** email, phone, date of birth, or a government ID.

---

## 4. Tenant boundary

Patients belong to one organization:

```text
Organization
    │
    └── Patients
```

Organization context is taken from:

1. `x-organization-id` header, or
2. `organizationId` query parameter

The body must **not** supply `organizationId`, `userId`, `role`, or `permission`. Those fields are rejected.

The server then:

1. authenticates the session (M1)
2. authorizes the requested permission in that organization (M2 `AuthorizationPort`)
3. performs patient queries constrained by `organizationId`

Changing `x-organization-id` cannot grant access to another tenant’s patients. Changing a patient id cannot expose a record from another organization.

---

## 5. Object-level authorization

M2 answers: is this user authorized **within this organization**?

M3 additionally answers: is this user authorized to access **this specific patient**?

Required lookup:

```text
organizationId + patientId
        ↓
scoped repository query
        ↓
ALLOW / DENY
```

Forbidden:

```text
patientId
        ↓
global lookup
        ↓
authorize afterwards
```

Cross-tenant GET/UPDATE that would otherwise look like a missing record returns the same `404 not_found` as a missing patient in the caller’s organization. This avoids leaking whether a patient exists in another tenant.

---

## 6. Permissions

M3 introduces four tenant permissions from TDA-ADR-002 §12:

| Permission              | Meaning                                       |
| ----------------------- | --------------------------------------------- |
| `patient.create`        | Create a patient in the organization          |
| `patient.read.tenant`   | List and read patients in the organization    |
| `patient.update.tenant` | Update demographics (not status)              |
| `patient.archive`       | Change patient status (`active` / `inactive`) |

Not seeded / not evaluated in M3:

- `patient.read.self`
- `patient.update.self`
- `patient.preference.update`

Role mapping (tenant staff only):

| Role             | Permissions                                             |
| ---------------- | ------------------------------------------------------- |
| `STAFF`          | create, read.tenant, update.tenant                      |
| `PRACTITIONER`   | create, read.tenant, update.tenant                      |
| `PRACTICE_ADMIN` | create, read.tenant, update.tenant, archive             |
| `PATIENT`        | none of the tenant patient APIs                         |
| `SYSTEM_ADMIN`   | **no** patient permissions; no break-glass patient path |

Patient authorization uses `AuthorizationPort.authorize()`. Patient application code does not branch on role names.

---

## 7. API contract

| Method  | Path                       | Permission                                       | Notes                                       |
| ------- | -------------------------- | ------------------------------------------------ | ------------------------------------------- |
| `POST`  | `/api/patients`            | `patient.create`                                 | Create in the requested organization        |
| `GET`   | `/api/patients`            | `patient.read.tenant`                            | List patients in the requested organization |
| `GET`   | `/api/patients/:patientId` | `patient.read.tenant`                            | Scoped read                                 |
| `PATCH` | `/api/patients/:patientId` | `patient.update.tenant` and/or `patient.archive` | Partial update                              |

No `DELETE` endpoint. Hard deletion is deferred.

### 7.1 Create body

Required: `firstName`, `lastName`, `dateOfBirth`  
Optional: `email`, `phone`  
Rejected if present: `id`, `organizationId`, `userId`, `status`, `createdAt`, `updatedAt`, unknown fields

### 7.2 Update body

At least one of: `firstName`, `lastName`, `dateOfBirth`, `email`, `phone`, `status`  
Demographic fields require `patient.update.tenant`.  
`status` requires `patient.archive`.  
Rejected if present: `id`, `organizationId`, `userId`, `createdAt`, `updatedAt`, unknown fields

### 7.3 Success responses

Create: `201` with `{ patient }`  
List: `200` with `{ patients }`  
Get: `200` with `{ patient }`  
Patch: `200` with `{ patient }`

Patient JSON:

```json
{
  "id": "clxxxxxxxxxxxxxxxxxxxxxx",
  "organizationId": "clxxxxxxxxxxxxxxxxxxxxxx",
  "firstName": "Ada",
  "lastName": "Lovelace",
  "dateOfBirth": "1815-12-10",
  "email": "ada@example.test",
  "phone": "+1 555 0100",
  "status": "active",
  "createdAt": "2026-08-14T00:00:00.000Z",
  "updatedAt": "2026-08-14T00:00:00.000Z"
}
```

`email` / `phone` are omitted when null.

### 7.4 Error responses

| Status | Code              | Typical cause                              |
| ------ | ----------------- | ------------------------------------------ |
| 400    | `invalid_input`   | Validation / unexpected fields             |
| 401    | `unauthenticated` | Missing or invalid session                 |
| 403    | `forbidden`       | Authenticated but not authorized           |
| 404    | `not_found`       | Missing patient **or** cross-tenant id     |
| 503    | `unavailable`     | Persistence / authorization lookup failure |

Denied responses do not include patient names, emails, phones, dates of birth, or existence hints for other tenants.

---

## 8. Persistence

Table: `patients`

- Primary key: `id` (cuid)
- Foreign key: `organizationId` → `organizations.id` **ON DELETE RESTRICT**
- Index: `patients_organizationId_idx`
- Status check: `patients_status_check` (`active` or `inactive`)
- No unique constraint on email or phone (duplicate matching is deferred)
- M1 and M2 migrations are unchanged

Repository operations always take `organizationId`:

- `create(organizationId, input)`
- `findByOrganizationAndId(organizationId, patientId)`
- `listByOrganization(organizationId)`
- `updateByOrganizationAndId(organizationId, patientId, patch)`

There is no `findById(patientId)` API.

---

## 9. Logging and PII

Ordinary logs record event names only, for example `patient_create`, `patient_read`.

They must not record:

- full patient names
- phone numbers
- email addresses
- dates of birth
- addresses

Patient PII is not placed in URLs, query strings, cookies, or JWT claims.

---

## 10. Explicitly deferred

| Topic                            | Status                                         |
| -------------------------------- | ---------------------------------------------- |
| Hard deletion / retention        | Deferred; inactive/archive only                |
| Duplicate detection / merge      | Deferred                                       |
| Patient self-access / portal     | Deferred                                       |
| SYSTEM_ADMIN patient access      | Not granted; human approval required to change |
| Branch-scoped patients           | Deferred                                       |
| Per-request patient audit events | Deferred                                       |
| Optimistic locking               | Deferred                                       |
| Organization transfer            | Not implemented                                |
| Clinical domains                 | Future milestones                              |

---

## 11. Production readiness

M3 is **not** production-ready unless production security, privacy, operational, infrastructure, and governance prerequisites have been independently reviewed and approved by the human.
