# TDA-M4 Appointment Domain Discovery

**Status:** DISCOVERY COMPLETE — **BLOCKED — HUMAN DECISION REQUIRED**  
**Date:** 2026-08-14  
**Delivery milestone:** M4 Appointment Domain (this repository’s numbering)  
**Document numbering:** TDA-IMP-M3-001 is the Appointment implementation plan; TDA-IMP-M4-001 is Notification. Same numbering collision recorded in M2/M3 follow-ups.  
**This file is not an approved ADR and is not an implementation contract.**

No Appointment, Practitioner, calendar, schedule, availability, notification, or reminder tables were created during this discovery. M1–M3 code and migrations were not modified.

---

## Discovery gate

```text
BLOCKED — HUMAN DECISION REQUIRED
```

Appointment **cannot** be implemented safely without inventing architecture that the controlled sources leave open, conflict on, or explicitly defer.

A proposed resolution is recorded in `docs/ADR-FOLLOWUP-M4.md`. That record is **PROPOSED — AWAITING HUMAN APPROVAL**. It is **not** an approved ADR. Agents must not mark it APPROVED.

Do **not** treat this discovery document or ADR-FOLLOWUP-M4 recommendations as permission to code. Implementation must wait until ADR-FOLLOWUP-M4 §40 is marked **APPROVED** by the human.

---

## A. Current Architecture

Implemented (M0–M3):

```text
HTTP route
        ↓
AuthenticationPort (M1, Cognito OIDC)
        ↓
session userId
        ↓
AuthorizationPort (M2)
        ↓
Organization + Membership + Role + Permission
        ↓
PatientApplicationService (M3)
        ↓
PatientRepository.findByOrganizationAndId
        ↓
patients (organization-scoped)
```

Appointment is a reserved domain boundary only:

```text
packages/domain/src/appointment/index.ts
packages/application/src/appointment/index.ts
```

Those modules export a constant. They contain **no** aggregate, repository, lifecycle, or HTTP surface.

Intended (not implemented) relationship from REVIEW Appointment documents:

```text
Organization
    ├── Branch          (table exists; authorization deferred)
    ├── Patient         (M3 implemented)
    ├── Practitioner    (NOT an entity; only a tenant ROLE)
    └── Appointment     (NOT implemented)
            ├── patient_id       (same organization — required)
            ├── branch_id        (REVIEW DDD: required)
            ├── practitioner_id  (REVIEW DDD: nullable; FK target unresolved)
            ├── history
            ├── audit
            └── notification_outbox
```

M3 patient isolation that Appointment must reuse:

```text
Appointment.organizationId = Organization A
Appointment.patientId = Patient from Organization B
        → MUST BE IMPOSSIBLE
```

---

## B. Existing Components (reusable)

| Component                                                                  | Location | Reuse for Appointment                                                  |
| -------------------------------------------------------------------------- | -------- | ---------------------------------------------------------------------- |
| Session / `AuthenticationPort`                                             | M1       | Required; do not redesign                                              |
| `AuthorizationPort` + RBAC adapter                                         | M2       | Required; add appointment permission keys only after policy is decided |
| Organization + membership                                                  | M2       | Tenant root; `x-organization-id` is untrusted input                    |
| Roles `PATIENT`, `STAFF`, `PRACTITIONER`, `PRACTICE_ADMIN`, `SYSTEM_ADMIN` | M2       | Role catalog exists; `PRACTITIONER` is a **role**, not a profile       |
| Patient aggregate + org-scoped repository                                  | M3       | Patient FK and same-org check                                          |
| Anti-enumeration 404                                                       | M3       | Cross-tenant GET/UPDATE should look like `not_found`                   |
| `security_events` table                                                    | M2       | Exists; M3 did **not** write per-call audit                            |
| `branches` table                                                           | M2       | Exists; branch-scoped authorization **deferred**                       |
| Notification worker shell                                                  | M0       | Logs “processing disabled”; no outbox                                  |
| Identifier convention                                                      | M1–M3    | **cuid**, not UUID                                                     |
| HTTP convention                                                            | M1–M3    | `/api/...` (not `/api/v1`), org from header/query                      |

Do not reuse:

- Patient permissions as a substitute for appointment permissions
- SYSTEM_ADMIN M2 foundation break-glass as appointment access
- PATIENT role as portal/self-access
- Cognito `sub` / `userId` as an automatic practitioner id

---

## C. Appointment Domain Proposal (from controlled sources — not implemented)

The REVIEW documents describe Appointment as a scheduled interaction between a **patient** and **clinical/operational resources**, owned by one organization.

### C.1 What an Appointment is

From `TDA-DOM-APT-001` §6 (REVIEW):

> The Appointment aggregate represents a scheduled interaction between a patient and one or more authorized clinical/operational resources.

It owns lifecycle transitions and scheduling invariants. It does **not** own clinical records, billing, or provider delivery.

### C.2 Proposed fields (TDA-DDD-APT-001 §6, REVIEW)

| Field                                     | REVIEW DDD                                  | Notes vs M1–M3                            |
| ----------------------------------------- | ------------------------------------------- | ----------------------------------------- |
| `id`                                      | UUID PK                                     | Conflicts with implemented **cuid**       |
| `organization_id`                         | required FK organizations                   | Aligns with M2/M3                         |
| `branch_id`                               | **required** FK branches                    | Conflicts with M2/M3 deferred branch auth |
| `patient_id`                              | required FK patients                        | Aligns with M3; same-org required         |
| `practitioner_id`                         | **nullable** “FK users/domain practitioner” | **Unresolved model**                      |
| `status`                                  | constrained lifecycle                       | Values listed; storage form open          |
| `scheduled_start_at` / `scheduled_end_at` | TIMESTAMPTZ UTC                             | Duration = end − start; must be positive  |
| `timezone`                                | required IANA text                          | Clinic-calendar model still an open ADR   |
| `reason` / `notes`                        | optional                                    | PII minimization                          |
| `version`                                 | optimistic concurrency                      | M3 patients have no version               |
| `created_by` / `updated_by`               | user FKs                                    | Not on M3 patients                        |
| cancellation metadata                     | optional                                    |                                           |

### C.3 Ownership (answerable today)

| Question                      | Evidence                                   | Answer                                                                     |
| ----------------------------- | ------------------------------------------ | -------------------------------------------------------------------------- |
| Which organization owns it?   | TDA-DOM-APT INV-APT-001; DDD §3            | Exactly one organization; immutable                                        |
| Which patient?                | API create: `patientId` required; same org | Same-org patient; immutable unless a later correction workflow is approved |
| Can it move organizations?    | DOM §6; M4 prompt default                  | **No**                                                                     |
| Can it use a foreign patient? | DDD §15; M3 contract                       | **No**                                                                     |

### C.4 Who is the practitioner?

**Not answerable from approved architecture.** See §D and blocker B1.

---

## D. Practitioner Dependency — CRITICAL

### D.1 Search result

| Location                   | Finding                                                                  |
| -------------------------- | ------------------------------------------------------------------------ |
| Prisma schema              | No `Practitioner`, `Dentist`, `Doctor`, `Clinician`, or `Provider` model |
| Domain packages            | No practitioner entity                                                   |
| M2 roles                   | `PRACTITIONER` is a **tenant role key**                                  |
| M2/M3 permissions          | No practitioner-profile permissions                                      |
| Foundation DDD (Volume 04) | Dentist/appointment records are **outside** Foundation                   |
| TDA-DDD-APT-001            | `practitioner_id` → “FK users/domain practitioner”                       |
| TDA-DDD-APT-001 open ADR   | **ADR-DDD-APT-001 — Exact practitioner/resource scheduling model**       |
| TDA-DOM-APT-001            | Consumes “practitioner references”; does not define the entity           |
| TDA-API-APT-001            | `practitionerId` optional on create                                      |

### D.2 Classification

```text
Practitioner is: C — planned as a scheduling reference, but the identity model is deferred / undefined.
The PRACTITIONER role exists. A Practitioner domain does not.
```

It is **not** A (defined and approved).  
It is **not** safe to treat as B (approved but unimplemented), because the FK target itself is an open ADR.

### D.3 User vs Practitioner

These are **not** the same entity in the implemented architecture:

```text
Application User (M1 users)     = authentication identity
PRACTITIONER (M2 role)          = authorization bundle on a membership
Practitioner profile            = NOT IMPLEMENTED
Patient (M3 patients)           = care recipient, not a user
```

A Cognito `userId` must not automatically become a practitioner identifier.

Equating `role === "PRACTITIONER"` with “this user may be stored as `appointments.practitioner_id`” would be an invented architecture and would violate M2/M3 “no hard-coded role checks” unless a permission/policy ADR says so.

### D.4 Stop implication

Appointment create in the REVIEW API can omit `practitionerId`, but:

- conflict rules are defined in terms of practitioner/resource availability
- calendar indexes are defined on `practitioner_id`
- start/complete permissions are described as “Practitioner/authorized staff”

M4 **cannot** implement practitioner-aware scheduling, and **must not** invent a Practitioner domain merely to unblock Appointment.

**This is a mandatory stop condition** (prompt §31.1).

---

## E. Authorization Model

### E.1 Permission vocabulary (TDA-ADR-002 §12) — PROPOSED ADR, not seeded

| Key                       | Meaning                           |
| ------------------------- | --------------------------------- |
| `appointment.create`      | Create                            |
| `appointment.read.self`   | Own appointments (patient portal) |
| `appointment.read.tenant` | Tenant appointments               |
| `appointment.confirm`     | Confirm                           |
| `appointment.reschedule`  | Reschedule                        |
| `appointment.cancel`      | Cancel                            |
| `appointment.check_in`    | Check in                          |
| `appointment.start`       | Start                             |
| `appointment.complete`    | Complete                          |
| `appointment.no_show`     | No-show                           |

TDA-API-APT-001 uses colon keys (`appointment:create`) and adds `appointment:history:read`. The **implemented** catalog uses **dot** keys (M2/M3). Do not seed colon keys.

### E.2 Indicative role matrix (TDA-ADR-002 §12)

| Permission                                         | PATIENT | STAFF | PRACTITIONER | PRACTICE_ADMIN | SYSTEM_ADMIN |
| -------------------------------------------------- | ------- | ----- | ------------ | -------------- | ------------ |
| `appointment.read.self`                            | Y       |       |              |                |              |
| `appointment.read.tenant`                          |         | Y     | Y            | Y              |              |
| `appointment.create`                               |         | Y     | Y            | Y              |              |
| confirm / reschedule / cancel / check_in / no_show |         | Y     | Y            | Y              |              |
| start / complete                                   |         |       | Y            | Y              |              |

SYSTEM_ADMIN has **no** appointment Y in that matrix.

### E.3 Conflicts with M3 / this M4 prompt

| Topic               | ADR-002 / DOM-APT                                      | M3 implementation / M4 prompt                                                   |
| ------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------- |
| Patient self-access | `appointment.read.self` = Y for PATIENT                | M3 deferred portal; M4 prompt: **PATIENT → Appointment = DENY** unless approved |
| SYSTEM_ADMIN        | no appointment permissions                             | M3 did not expand break-glass to patients; M4 must not expand it either         |
| Branch scope        | API create requires `branchId`; staff scoped to branch | M2/M3 authorization is **organization-only**                                    |
| Hard-coded role     | DOM: “Dentist/Practitioner view assigned appointments” | M2/M3: permission-based; do not `if role === PRACTITIONER`                      |

### E.4 Who may do what — **not approved for implementation**

Until the human confirms the matrix and the M3 portal/SYSTEM_ADMIN follow-ups:

| Operation                                          | Safe conservative reading (NOT implemented)                                                       |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Create                                             | STAFF / PRACTITIONER / PRACTICE_ADMIN with `appointment.create`, org membership, same-org patient |
| Read tenant                                        | those roles with `appointment.read.tenant`, org-scoped lookup                                     |
| Confirm / cancel / reschedule / check-in / no-show | STAFF / PRACTITIONER / PRACTICE_ADMIN per key                                                     |
| Start / complete                                   | PRACTITIONER / PRACTICE_ADMIN per key                                                             |
| PATIENT                                            | **DENY** until self-access is explicitly approved                                                 |
| SYSTEM_ADMIN                                       | **DENY** until explicitly approved                                                                |

This table is a **proposal for human approval**, not a license to code.

Appointment permission is **independent** of patient permission. `patient.read.tenant` must not imply appointment access.

---

## F. Object-Level Security (BOLA)

Required pattern (same as M3; also TDA-ADR-002 §13):

```text
organizationId + appointmentId
        ↓
scoped repository query
        ↓
permission + object policy
        ↓
ALLOW / DENY
```

Forbidden:

```text
findAppointmentById(id) → authorize afterwards
```

Cross-tenant GET/PATCH/cancel/reschedule of a foreign id must not leak existence (M3: `404 not_found`).

Additional object rules from REVIEW docs, still needing policy:

- Patient actors limited to **self** even when the id is valid (conflicts with M4 prompt DENY for PATIENT)
- Staff in org A must not access org B appointments
- Guessed appointment ids must not reveal other tenants
- Patient and practitioner references must be authorized in the same tenant

---

## G. Organization Isolation

- Organization context: `x-organization-id` or `organizationId` query (M2/M3). Untrusted.
- Server validates membership + permission via `AuthorizationPort`.
- Appointment `organizationId` is immutable after create.
- Patient must belong to that organization (application **and**, where practical, database).
- PostgreSQL cannot easily enforce `patient.organization_id = appointment.organization_id` with a simple FK; composite FK or a trigger would be a **new** design choice (not in M3).
- List filters (`patientId`, `practitionerId`, `status`, date range) must remain inside the authorized organization.

---

## H. Temporal Model

**Specified in REVIEW docs, but clinic-calendar policy is an open ADR.**

| Topic                   | What exists                                                      | Gap                                       |
| ----------------------- | ---------------------------------------------------------------- | ----------------------------------------- |
| Storage                 | UTC `TIMESTAMPTZ` (`scheduled_start_at` / `scheduled_end_at`)    | Aligns with TDA-API-001 §19               |
| Duration                | `end > start`; positive duration required                        | Zero-duration forbidden in DDD            |
| Appointment timezone    | required IANA string on the row                                  | Who supplies it? org vs branch vs client? |
| Organization timezone   | **not** on `organizations`                                       | No org default                            |
| Branch timezone         | **not** on `branches`                                            | No branch default                         |
| Practitioner/patient TZ | not modeled                                                      |                                           |
| DST                     | “must be handled”                                                | No algorithm                              |
| Display                 | “clinic/branch/user timezone according to product rules”         | Product rules not written                 |
| Open ADR                | **ADR-APT-004 — Appointment timezone and clinic-calendar model** | Mandatory stop §31.8                      |

Do not store naive local timestamps. Do not implement scheduling until ADR-APT-004 is decided.

---

## I. Lifecycle

REVIEW state machine (`TDA-DOM-APT-001` §7):

| State       | Next                                        | Terminal? |
| ----------- | ------------------------------------------- | --------- |
| REQUESTED   | CONFIRMED, CANCELLED                        | no        |
| CONFIRMED   | RESCHEDULED, CANCELLED, CHECKED_IN, NO_SHOW | no        |
| RESCHEDULED | CONFIRMED, CANCELLED, CHECKED_IN            | no        |
| CHECKED_IN  | STARTED, CANCELLED                          | no        |
| STARTED     | COMPLETED, CANCELLED                        | no        |
| COMPLETED   | none                                        | yes       |
| NO_SHOW     | none                                        | yes       |
| CANCELLED   | none                                        | yes       |

**Internal conflict:** TDA-IMP-M3-001 says reschedule from CONFIRMED yields `CONFIRMED / approved scheduled state`. The DOM lists `RESCHEDULED` as a distinct state. Initial create state (“appropriate initial state”) is not specified for staff vs patient booking.

Hard delete is not an appointment operation. Retention is open (**ADR-DDD-APT-004**). Inactive patient / inactive practitioner behavior is **not** specified.

Documents are **REVIEW**, not APPROVED. Cursor rules: do not invent a complex state machine, and do not change states without approval. Using this machine in code would silently treat REVIEW as approved.

---

## J. Conflict Rules

REVIEW intent:

- Server-side conflict checks
- Concurrent create/reschedule must not double-book when the domain forbids it
- Cancelled vs completed vs overlap of **patient** vs **practitioner** vs **chair/resource** are not fully specified
- Override/emergency overlap needs an explicit policy
- APT-FR-005 conflict detection is **SHOULD**, not MUST; APT-FR-001 lifecycle is MUST

Open ADRs:

- **ADR-APT-001** exact conflict strategy / locking
- **ADR-DDD-APT-002** locking vs exclusion constraint vs hybrid
- **ADR-API-APT-001** exact scheduling conflict mechanism
- **ADR-APT-002** multi-chair / resource modeling (APT-FR-006 is P2 SHOULD)

A naive check-then-insert is explicitly forbidden if conflict prevention is claimed.

**Mandatory stop §31.10 and §31.11:** conflict and concurrent booking are required by the Appointment IMP plan, but the mechanism is undefined.

---

## K. Database Proposal (not applied)

From TDA-DDD-APT-001 (REVIEW):

| Table                 | Purpose                                                  |
| --------------------- | -------------------------------------------------------- |
| `appointments`        | Aggregate                                                |
| `appointment_history` | Lifecycle/schedule history                               |
| `notification_outbox` | Durable notification intent                              |
| `audit_events`        | Accountability (M2 has `security_events`, not this name) |

FKs: organization, branch, patient — **ON DELETE RESTRICT**. Practitioner FK target unknown.

Also required by the same DDD: atomic write of history + audit + outbox with every material mutation.

**This proposal must not be migrated until blockers are resolved.** Applying it now would invent practitioner FK, required branch, UUID ids, and outbox schema.

---

## L. API Proposal (not implemented)

TDA-API-APT-001 (REVIEW) catalogue, under `/api/v1/...`:

| ID          | Method | Path                            |
| ----------- | ------ | ------------------------------- |
| APT-API-001 | POST   | `/appointments`                 |
| APT-API-002 | GET    | `/appointments/{appointmentId}` |
| APT-API-003 | GET    | `/appointments`                 |
| APT-API-004 | POST   | `.../confirm`                   |
| APT-API-005 | POST   | `.../reschedule`                |
| APT-API-006 | POST   | `.../cancel`                    |
| APT-API-007 | POST   | `.../check-in`                  |
| APT-API-008 | POST   | `.../start`                     |
| APT-API-009 | POST   | `.../complete`                  |
| APT-API-010 | POST   | `.../no-show`                   |
| APT-API-011 | GET    | `.../history`                   |

M1–M3 implemented `/api/...` without the `v1` prefix. Choosing `/api/v1` vs `/api` is a contract decision.

Create requires `patientId`, `branchId`, `scheduledStartAt`, `scheduledEndAt`, `timezone`. `practitionerId` optional.

No generic PATCH that can change `organizationId`. Reschedule is a **command**, not a demographic PATCH.

---

## M. Security Tests (required if implementation later proceeds)

Dedicated `appointment.security.test.ts`, following M3 BOLA style:

1. Unauthenticated GET/POST; invalid session
2. Missing / inactive / revoked membership; disabled user
3. Tampered `x-organization-id`
4. Foreign appointment GET / UPDATE / cancel / reschedule → same denial as missing
5. Appointment referencing a patient from another organization
6. Patient id tampering
7. Practitioner from another organization / unauthorized practitioner (once the model exists)
8. PATIENT denied unless self-access is approved
9. SYSTEM_ADMIN denied unless approved
10. Missing permission (e.g. STAFF cannot `appointment.start` if matrix stands)
11. Invalid lifecycle transitions
12. Malformed id; repository failure; authorization lookup failure → fail closed
13. List cannot return another tenant’s rows
14. Deny bodies must not leak patient/appointment PII
15. If conflict prevention is approved: overlap, cancelled-slot reuse, concurrent create

Synthetic data only.

---

## N. Deferred / unresolved decisions

| ID  | Decision                                                                               | Status                                                                               |
| --- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| B1  | Practitioner identity: User+role vs Practitioner profile vs deferred nullable          | **Human required**                                                                   |
| B2  | Required `branchId` vs M2 deferred branch authorization                                | **Human required**                                                                   |
| B3  | Timezone / clinic-calendar (ADR-APT-004)                                               | **Human required**                                                                   |
| B4  | Conflict definition + concurrency mechanism (ADR-APT-001 / DDD-APT-002)                | **Human required**                                                                   |
| B5  | Appointment mutation **must** write notification outbox vs M4 “no notification system” | **Human required** (source-of-truth conflict)                                        |
| B6  | Audit: `security_events` vs `audit_events`; which mutations                            | **Human required**                                                                   |
| B7  | PATIENT `appointment.read.self` vs M3/M4 DENY                                          | **Human required**                                                                   |
| B8  | SYSTEM_ADMIN appointment access                                                        | **Human required** (default: deny)                                                   |
| B9  | Initial status REQUESTED vs CONFIRMED; RESCHEDULED as status vs event                  | **Human required**                                                                   |
| B10 | Identifier UUID (DDD) vs cuid (M1–M3)                                                  | **Human required**                                                                   |
| B11 | API prefix `/api/v1` vs `/api`                                                         | **Human required**                                                                   |
| B12 | Permission key dots vs colons                                                          | Follow M2/M3 **dots** unless human says otherwise                                    |
| B13 | Inactive patient / inactive practitioner effects                                       | Undefined                                                                            |
| B14 | Hard delete / retention (ADR-DDD-APT-004)                                              | Undefined                                                                            |
| B15 | Patient or practitioner reassignment after create                                      | DOM: patient immutable; practitioner change undefined                                |
| B16 | Idempotency-key strategy (ADR-APT-005)                                                 | Open                                                                                 |
| B17 | Availability, waitlist, multi-chair (APT-FR-005/006)                                   | SHOULD / P2 — out of a minimal M4 unless approved                                    |
| B18 | REVIEW docs vs APPROVED ADRs                                                           | Domain/DDD/API Appointment specs are **REVIEW**; ADR-001/002/003 remain **PROPOSED** |

---

## O. Recommended M4 implementation plan

**Do not execute this plan until the gate is READY.**

Suggested sequence **after** human decisions:

1. Resolve B1–B5 at minimum (practitioner, branch, timezone, conflict, outbox).
2. Record decisions in an **approved** ADR or an explicit human-approved M4 contract.
3. Additive Prisma migration only (do not rewrite M1–M3).
4. Domain aggregate + org-scoped `AppointmentRepository`.
5. Authorization keys through existing `AuthorizationPort` (no role `if` checks).
6. Same-org patient integrity in application and DB as far as practical.
7. Command APIs (create/list/get + approved lifecycle commands only).
8. BOLA/security tests before claiming M4 complete.
9. If outbox is required: persist intent only; **do not** call SMTP/Twilio; **do not** implement the dispatcher (that is TDA-IMP-M4-001 Notification).

---

## P. Blockers (mandatory stop)

### BLOCKER B1 — Practitioner identity

```text
BLOCKER: Practitioner identity/model is undefined and required by Appointment scheduling.
RELEVANT ADR / FILE:
  TDA-DDD-APT-001 §6 (practitioner_id “FK users/domain practitioner”)
  TDA-DDD-APT-001 §29 ADR-DDD-APT-001
  TDA-ADR-002 §11 PRACTITIONER role
  packages/db/prisma/schema.prisma (no Practitioner model)
  docs/ADR-FOLLOWUP-M3.md (no practitioner domain)
WHY IT MATTERS:
  Cannot store, authorize, conflict-check, or reassign a practitioner without choosing
  whether practitioner_id is a userId, a future profile id, or omitted.
OPTIONS:
  1. Practitioner = User with PRACTITIONER membership role in that organization
  2. Separate Practitioner profile entity (new domain, before or with Appointment)
  3. practitioner_id omitted from M4; no practitioner calendar/conflicts in M4
  4. practitioner_id nullable opaque id with no FK until a later domain
RECOMMENDED OPTION:
  Do not invent. Prefer option 3 or 2 only after human approval.
  Option 1 is convenient and likely wrong (User ≠ Practitioner, same class of error as User ≠ Patient).
HUMAN DECISION REQUIRED: yes
```

### BLOCKER B2 — Branch required vs deferred branch authorization

```text
BLOCKER: Appointment DDD/API require branchId; M2/M3 deferred branch-scoped authorization.
RELEVANT ADR / FILE:
  TDA-API-APT-001 §8 branchId required
  TDA-DDD-APT-001 appointments.branch_id NOT NULL
  docs/ADR-FOLLOWUP-M2.md “Branch-scoped checks wait for clinical resources”
  docs/ADR-FOLLOWUP-M3.md branch-scoped patients deferred
WHY IT MATTERS:
  Implementing branchId without branch authorization invents tenant semantics.
  Omitting branchId contradicts the Appointment DDD.
OPTIONS:
  1. Require branchId and implement organization+branch authorization now
  2. Organization-scoped appointments; branchId omitted or nullable until a later ADR
  3. Require branchId for data but authorize at organization level only (weaker than DDD)
RECOMMENDED OPTION:
  Option 2 until branch authorization is an approved ADR — but that is a DDD exception
  the human must grant. Do not silently drop NOT NULL.
HUMAN DECISION REQUIRED: yes
```

### BLOCKER B3 — Timezone / clinic calendar

```text
BLOCKER: Timezone semantics are incomplete (ADR-APT-004 open).
RELEVANT ADR / FILE:
  TDA-DOM-APT-001 §23 and §31 ADR-APT-004
  TDA-API-APT-001 create.timezone required IANA
  organizations / branches have no timezone columns
WHY IT MATTERS:
  Scheduling without a canonical timezone creates ambiguous local times and DST bugs.
OPTIONS:
  1. Client supplies IANA timezone per appointment; store UTC instants + that zone
  2. Organization default timezone (requires schema on organizations)
  3. Branch default timezone (depends on B2)
RECOMMENDED OPTION:
  Option 1 is the only one that matches the REVIEW API without new org/branch fields,
  but it still needs human confirmation that the client is the source of clinic time.
HUMAN DECISION REQUIRED: yes
```

### BLOCKER B4 — Conflict and concurrency mechanism

```text
BLOCKER: Conflict prevention is required by the Appointment IMP plan but the mechanism is an open ADR.
RELEVANT ADR / FILE:
  TDA-IMP-M3-001 §9
  TDA-DOM-APT-001 ADR-APT-001
  TDA-DDD-APT-001 ADR-DDD-APT-002
  TDA-API-APT-001 ADR-API-APT-001
WHY IT MATTERS:
  Check-then-insert is racy. Claiming conflict safety without a chosen isolation/constraint is false.
OPTIONS:
  1. PostgreSQL exclusion constraint on practitioner + tstzrange, ignoring terminal statuses
  2. SELECT FOR UPDATE on a practitioner calendar row inside a transaction
  3. Serializable transaction + application overlap query
  4. Defer conflict prevention; allow overlaps in M4 (must not claim scheduling integrity)
RECOMMENDED OPTION:
  Human must pick 1–3 including whether patient overlap is in or out.
  Do not implement 4 while calling the milestone “Appointment Domain.”
HUMAN DECISION REQUIRED: yes
```

### BLOCKER B5 — Notification outbox vs M4 “no notifications”

```text
BLOCKER: Approved/proposed architecture requires Appointment+History+Audit+Outbox in ONE transaction.
This M4 prompt forbids implementing a notification system.
RELEVANT ADR / FILE:
  TDA-ADR-001 §12
  TDA-DOM-APT-001 §14 INV-APT-005
  TDA-DDD-APT-001 §13
  TDA-API-APT-001 §9
  TDA-IMP-M3-001 M3-TX-001
  this prompt §27 “Notifications are out of scope”
WHY IT MATTERS:
  Implementing Appointment CRUD without outbox violates the modular-monolith invariant.
  Implementing outbox tables/worker processing violates the M4 prompt.
  This is a source-of-truth conflict: STOP (TDA-GOV-SOT-001).
OPTIONS:
  1. M4 persists notification_outbox intent only; dispatcher remains unimplemented (Notification milestone)
  2. Human explicitly waives outbox for a reduced M4; document as approved exception
  3. Do not start Appointment until Notification data contract is in the same milestone
RECOMMENDED OPTION:
  Option 1 if Appointment proceeds at all: durable intent, no SMTP/Twilio, no dispatcher.
  That still requires DDD-NOTIF table design approval and is not “no notification system.”
  The human must choose. Do not guess.
HUMAN DECISION REQUIRED: yes
```

### BLOCKER B6 — Patient self-access

```text
BLOCKER: Patient self-access for appointments is contradictory across sources.
RELEVANT ADR / FILE:
  TDA-ADR-002 §12 appointment.read.self = Y for PATIENT
  docs/ADR-FOLLOWUP-M3.md self-access deferred
  this prompt §24 PATIENT → Appointment = DENY
WHY IT MATTERS:
  Seeding read.self enables a portal path M3 refused. Denying it contradicts ADR-002.
OPTIONS:
  1. DENY PATIENT appointment APIs in M4 (consistent with M3 portal deferral)
  2. Implement appointment.read.self object-scoped to linked patient (requires Patient↔User link, which M3 also deferred)
RECOMMENDED OPTION:
  Option 1 until a portal ADR exists. Option 2 is not implementable today because Patient ≠ User and there is no link table.
HUMAN DECISION REQUIRED: yes
```

### Other stop conditions that also apply

- SYSTEM_ADMIN appointment access: treat as **deny**; do not expand M2 break-glass (prompt §23). Confirm.
- Deletion/retention: ADR-DDD-APT-004 open (prompt §31.12).
- Audit materially required by APT-FR-003 / ADR-002 §17; M3 deferred writes (prompt §31.13).
- Appointment specs are REVIEW; ADR-001/002/003 are PROPOSED — treating them as approved would silently baseline them (prompt §31.15).
- Implementing Practitioner or Notification dispatcher would cross the M4 domain boundary (prompt §31.18).

---

## Q. Answers to the discovery questions

| #   | Question                         | Answer from evidence                                                                     |
| --- | -------------------------------- | ---------------------------------------------------------------------------------------- |
| 1   | What is an Appointment?          | Scheduled patient–resource interaction; lifecycle aggregate. Not a clinical record.      |
| 2   | Who owns it?                     | The organization; created by an authorized membership actor.                             |
| 3   | Which organization?              | Exactly one; immutable; from trusted authz context, not the client body.                 |
| 4   | Which patient?                   | Required same-org `patientId`.                                                           |
| 5   | Which practitioner?              | **Undefined.** Nullable id whose FK target is an open ADR.                               |
| 6   | Does Practitioner exist?         | **No** entity. Yes as a **role**.                                                        |
| 7   | Approved practitioner reference? | **No.** ADR-DDD-APT-001 open.                                                            |
| 8   | Who may create?                  | Indicative: STAFF/PRACTITIONER/PRACTICE_ADMIN. Not seeded. Not approved for code.        |
| 9   | Who may view?                    | Indicative tenant read vs self read. Self-access conflicted.                             |
| 10  | Who may modify?                  | Command permissions, not a generic PATCH.                                                |
| 11  | Who may cancel?                  | Indicative STAFF/PRACTITIONER/PRACTICE_ADMIN + `appointment.cancel`.                     |
| 12  | Who may reschedule?              | Same set + `appointment.reschedule`; distinct command.                                   |
| 13  | Statuses                         | REVIEW machine listed in §I; initial state and RESCHEDULED semantics conflict.           |
| 14  | Conflict?                        | Must reject overlaps unless override; exact resource and locking **open**.               |
| 15  | Timezone?                        | Persist UTC; per-appointment IANA required by API; clinic model **open**.                |
| 16  | Cross organizations?             | **No.**                                                                                  |
| 17  | Move between organizations?      | **No.**                                                                                  |
| 18  | Move between practitioners?      | Not defined; do not implement.                                                           |
| 19  | Inactive patient?                | Not defined.                                                                             |
| 20  | Inactive practitioner?           | Not defined (and practitioner entity missing).                                           |
| 21  | Audit?                           | Material lifecycle mutations must be auditable; write policy deferred in M3.             |
| 22  | Deletion/retention?              | No hard delete specified; ADR-DDD-APT-004 open.                                          |
| 23  | Notification dependency?         | Outbox intent is an Appointment invariant; dispatcher is a later Notification milestone. |

Questions 5–7, 14–15, 19–22 cannot be closed from approved architecture.

---

## R. Scope confirmation

```text
No notification system implemented.
No calendar integration implemented.
No billing/payment implemented.
No clinical records implemented.
No unrelated clinical domain implemented.
No Appointment table created.
No Practitioner table created.
```

---

## S. Numbering note

| This delivery      | TDA document name                                   |
| ------------------ | --------------------------------------------------- |
| M2 Authorization   | (deferred from ADR-FOLLOWUP-M1; not TDA-IMP-M2-001) |
| M3 Patient         | TDA-IMP-M2-001 Patient Domain                       |
| **M4 Appointment** | **TDA-IMP-M3-001 Appointment Domain**               |
| later Notification | TDA-IMP-M4-001                                      |

Do not “fix” document IDs in this discovery.

---

## T. Production readiness

Not applicable. Discovery produced no runtime Appointment behavior.

M4 must not be declared production-ready even after a future implementation unless security, privacy, operational, and governance prerequisites are independently reviewed by the human.
