# TDA-ADR-FOLLOWUP-M4

## M4 Appointment Domain — Human Architecture Decision Record

**Document ID:** TDA-ADR-FOLLOWUP-M4  
**Version:** 1.0  
**Status:** APPROVED  
**Date:** 2026-08-14  
**Milestone:** M4 — Appointment Domain  
**Supersedes:** M4 Discovery Blockers recorded in `docs/TDA-M4-APPOINTMENT-DISCOVERY.md`  
**Scope:** Appointment domain architecture only  
**This file is not an approved ADR.**

Agents and coding assistants must not mark this document approved.

---

# 1. Purpose

This decision record resolves the architecture blockers identified during M4 Appointment discovery.

No Appointment implementation may begin until the decisions in this document are reviewed and explicitly approved by the human project owner.

This document is the M4 implementation source of truth once its status becomes:

```text
APPROVED
```

---

# 2. Current Baseline

The project currently has:

```text
M0  Repository Baseline
    COMPLETE

M1  Authentication
    COMPLETE

M2  Authorization / Organization-Tenant Foundation
    COMPLETE

M3  Patient Domain
    COMPLETE

M4  Appointment Discovery
    COMPLETE

M4  Appointment Implementation
    BLOCKED pending this decision record
```

M1, M2, and M3 architecture remains frozen.

M4 must build on the existing:

```text
AuthenticationPort
AuthorizationPort
Organization
Membership
Patient
PatientRepository
```

No redesign of M1–M3 is authorized by this document.

---

# 3. Decision Summary

The following decisions are proposed for human approval:

| #     | Decision                | Proposed Decision                                                  |
| ----- | ----------------------- | ------------------------------------------------------------------ |
| M4-01 | Practitioner identity   | Practitioner Profile linked to Application User                    |
| M4-02 | Branch                  | Required; organization-owned; branch-level authorization deferred  |
| M4-03 | Timezone                | UTC instants + required IANA timezone                              |
| M4-04 | Conflict mechanism      | PostgreSQL database-enforced exclusion constraint where applicable |
| M4-05 | Practitioner conflict   | Prevent overlapping active appointments                            |
| M4-06 | Patient conflict        | Prevent overlapping active appointments                            |
| M4-07 | Outbox                  | Persist transactional notification intent only; no dispatcher      |
| M4-08 | PATIENT access          | Deny appointment self-access                                       |
| M4-09 | SYSTEM_ADMIN access     | Deny appointment access                                            |
| M4-10 | Appointment permissions | Explicit tenant-scoped permissions                                 |
| M4-11 | Identifier              | `cuid`, consistent with M3                                         |
| M4-12 | API prefix              | `/api/...`, consistent with M1–M3                                  |
| M4-13 | Initial status          | `REQUESTED`                                                        |
| M4-14 | Rescheduling            | Explicit reschedule command                                        |
| M4-15 | Inactive patient        | No new appointments; historical appointments retained              |
| M4-16 | Hard deletion           | No hard delete; restrictive retention                              |
| M4-17 | Audit                   | Mutation-oriented history/audit                                    |
| M4-18 | Calendar integration    | Deferred                                                           |
| M4-19 | Notification delivery   | Deferred                                                           |

These are **proposed decisions**, not approved decisions, until the human approval section is completed.

---

# 4. M4-01 — Practitioner Identity

## Decision

A Practitioner is **not the same thing as an Application User**.

The proposed model is:

```text
Application User
        │
        │ 0..1
        ▼
Practitioner Profile
        │
        ▼
Appointment
```

The authentication identity remains the M1 application `userId`.

A Cognito `sub` or M1 `userId` must not automatically be treated as a practitioner identifier.

## Rationale

This preserves the separation:

```text
Authentication User
        ≠
Patient
        ≠
Practitioner
```

It allows future practitioner-specific attributes without contaminating authentication.

## Scope

M4 may implement only the minimum Practitioner Profile required to support Appointment.

M4 does not implement:

- practitioner credential management
- licensing workflow
- professional qualification management
- practitioner availability
- leave management
- payroll
- practitioner performance
- practitioner portal

## Proposed decision

```text
APPROVE — Practitioner Profile linked to Application User
```

---

# 5. M4-02 — Branch

## Decision

Every Appointment requires a `branchId`.

A Branch must belong to the same Organization as the Appointment.

The invariant is:

```text
Appointment.organizationId
        ==
Branch.organizationId
```

Branch-level authorization is **not introduced in M4** unless separately approved.

M4 therefore establishes branch ownership/integrity but does not create a new branch-level permission model.

## Rationale

The Appointment DDD/API design requires a branch, while M2/M3 deliberately deferred fine-grained branch authorization.

This decision preserves both requirements without inventing a new authorization layer.

## Security rule

The client cannot select an arbitrary branch from another organization.

The server must validate the relationship.

## Proposed decision

```text
APPROVE — branch required; branch belongs to organization; branch-level authorization deferred
```

---

# 6. M4-03 — Timezone

## Decision

Appointment scheduling uses:

```text
startAtUtc
endAtUtc
timezone
```

where:

- `startAtUtc` is the UTC appointment start instant
- `endAtUtc` is the UTC appointment end instant
- `timezone` is a required IANA timezone identifier

Example:

```text
Asia/Kolkata
```

The appointment timezone is persisted with the Appointment.

## Rules

```text
endAtUtc > startAtUtc
```

must always hold.

Ambiguous local timestamps are not accepted as the canonical storage representation.

Timezone abbreviations such as:

```text
IST
EST
PST
```

are not canonical identifiers.

## Rationale

This provides deterministic scheduling and supports future:

- reminders
- calendar integration
- DST handling
- rescheduling
- reporting

without requiring a future schema redesign.

## Proposed decision

```text
APPROVE — UTC instants + required IANA timezone
```

---

# 7. M4-04 — Appointment Conflict / Concurrency

## Decision

Appointment conflict prevention must be **database/concurrency safe**.

A simple:

```text
check availability
↓
insert
```

pattern is not considered sufficient.

The preferred mechanism is a PostgreSQL exclusion constraint using an appropriate timestamp/range representation where applicable.

## Conflict scope

At minimum, the system must prevent overlapping active appointments for the same Practitioner.

The same rule applies to Patient appointments unless explicitly changed by a later approved ADR.

Cancelled appointments do not occupy scheduling capacity.

## Concurrency invariant

For a protected scheduling resource:

```text
Two concurrent conflicting booking requests
        ↓
At most one succeeds
```

The application must not claim concurrency safety without demonstrating it through tests.

## Proposed decision

```text
APPROVE — database-enforced conflict protection using PostgreSQL exclusion constraints where applicable
```

---

# 8. M4-05 — Practitioner Conflicts

A Practitioner cannot have overlapping active appointments within the same scheduling scope.

Conflict detection applies to active scheduling states.

Cancelled appointments do not block a scheduling slot.

The exact database representation must follow M4 implementation conventions while preserving this invariant.

## Proposed decision

```text
APPROVE — prevent overlapping active Practitioner appointments
```

---

# 9. M4-06 — Patient Conflicts

A Patient cannot have overlapping active appointments unless a future approved decision explicitly permits overlapping appointments.

This prevents accidental double-booking of the same Patient.

Cancelled appointments do not block a scheduling slot.

## Proposed decision

```text
APPROVE — prevent overlapping active Patient appointments
```

---

# 10. M4-07 — Outbox

## Decision

M4 implements a **transactional outbox intent**, but does not implement notification delivery.

The Appointment mutation transaction may contain:

```text
BEGIN

Appointment mutation
Appointment history
Audit event where required
Notification outbox intent

COMMIT
```

The outbox represents a durable future notification intent.

## Explicitly excluded

M4 does NOT implement:

- SMTP
- email delivery
- SMS
- WhatsApp
- Twilio
- push notifications
- notification dispatcher
- notification worker
- delivery retry system
- notification templates

These belong to a future notification milestone.

## Rationale

This preserves transactional domain-event integrity without prematurely implementing notification infrastructure.

## Proposed decision

```text
APPROVE — persist outbox intent only; no notification dispatcher in M4
```

---

# 11. M4-08 — PATIENT Appointment Access

## Decision

The `PATIENT` role does **not** receive appointment self-access in M4.

There is no:

```text
appointment.read.self
appointment.update.self
```

in M4.

No Patient-to-Application-User authentication mapping is introduced.

## Rationale

M3 explicitly deferred the Patient portal/self-access model.

Enabling appointment self-access now would implicitly introduce a Patient portal architecture.

## Proposed decision

```text
APPROVE — PATIENT appointment access DENIED
```

---

# 12. M4-09 — SYSTEM_ADMIN Appointment Access

## Decision

`SYSTEM_ADMIN` does not receive Appointment permissions in M4.

M2 foundation break-glass behavior is not expanded automatically.

If future platform-level Appointment administration is required, it must be introduced through a separate approved authorization decision.

## Proposed decision

```text
APPROVE — SYSTEM_ADMIN appointment access DENIED
```

---

# 13. M4-10 — Appointment Permissions

M4 introduces explicit Appointment permissions through the existing M2 authorization architecture.

Proposed permissions:

```text
appointment.create
appointment.read.tenant
appointment.update.tenant
appointment.reschedule
appointment.cancel
```

Additional permissions should not be created without a defined use case.

## Proposed role mapping

| Role           | Create | Read Tenant | Update | Reschedule | Cancel |
| -------------- | -----: | ----------: | -----: | ---------: | -----: |
| PATIENT        |     No |          No |     No |         No |     No |
| STAFF          |    Yes |         Yes |    Yes |        Yes |    Yes |
| PRACTITIONER   |    Yes |         Yes |    Yes |        Yes |    Yes |
| PRACTICE_ADMIN |    Yes |         Yes |    Yes |        Yes |    Yes |
| SYSTEM_ADMIN   |     No |          No |     No |         No |     No |

This table is subject to human approval.

Authorization must be performed through:

```text
AuthorizationPort
```

Do not scatter role checks throughout Appointment code.

## Proposed decision

```text
APPROVE — explicit Appointment tenant permissions and role mapping above
```

---

# 14. M4-11 — Appointment Identifier

Appointment identifiers use:

```text
cuid
```

consistent with the M3 Patient identifier strategy.

The identifier is:

- opaque
- immutable
- externally safe
- not derived from patient information
- not sequential

## Proposed decision

```text
APPROVE — cuid
```

---

# 15. M4-12 — API Convention

Appointment APIs follow the existing M1–M3 convention:

```text
/api/appointments
```

not:

```text
/api/v1/appointments
```

A future API versioning strategy may be introduced through a separate architecture decision.

## Proposed decision

```text
APPROVE — /api/appointments
```

---

# 16. M4-13 — Initial Appointment Status

New appointments begin in:

```text
REQUESTED
```

The initial state is not:

```text
CONFIRMED
```

unless the approved business workflow explicitly changes this later.

## Proposed lifecycle

```text
REQUESTED
    │
    ├── CONFIRMED
    │      │
    │      ├── CHECKED_IN
    │      │       │
    │      │       └── IN_PROGRESS
    │      │                │
    │      │                └── COMPLETED
    │      │
    │      └── NO_SHOW
    │
    ├── CANCELLED
    │
    └── RESCHEDULED
```

The implementation must enforce only the transitions explicitly defined in the approved M4 contract.

## Important

Whether `RESCHEDULED` is a persistent state or a historical event must be resolved in the implementation contract before coding if this distinction affects the state machine.

Preferred approach:

> Rescheduling is an operation/event rather than a long-lived appointment status.

## Proposed decision

```text
APPROVE — REQUESTED initial state; reschedule represented as an operation/history event
```

---

# 17. M4-14 — Rescheduling

Rescheduling is a dedicated Appointment operation.

Preferred API:

```text
POST /api/appointments/:appointmentId/reschedule
```

Rescheduling must:

1. authenticate the caller
2. authorize the caller
3. verify organization scope
4. verify patient relationship
5. verify practitioner relationship
6. verify branch relationship
7. validate timezone
8. validate start/end
9. perform conflict checking
10. update appointment scheduling information
11. create appropriate history/audit records
12. create outbox intent where required
13. commit atomically

Generic PATCH must not bypass rescheduling rules.

## Proposed decision

```text
APPROVE — explicit reschedule command
```

---

# 18. M4-15 — Inactive Patient

An inactive Patient cannot receive a new Appointment.

Existing historical Appointments remain retained and readable according to the user's authorization.

An inactive Patient's historical appointments must not be deleted automatically.

## Proposed behavior

```text
Inactive Patient
    ↓
New Appointment
    DENY

Existing Appointment
    ↓
Historical access
    ALLOW according to authorization
```

## Proposed decision

```text
APPROVE — inactive patients cannot receive new appointments; historical appointments retained
```

---

# 19. M4-16 — Deletion / Retention

Appointments are not hard-deleted through the normal application API.

No:

```text
DELETE /api/appointments/:id
```

endpoint is introduced in M4.

Appointment records remain available according to future retention/legal requirements.

Foreign-key relationships should use restrictive deletion semantics unless an approved legal-retention policy requires another mechanism.

## Proposed decision

```text
APPROVE — no hard delete; restrictive retention
```

---

# 20. M4-17 — Audit and History

M4 distinguishes:

```text
Appointment History
```

from:

```text
Security / Audit Events
```

Appointment history records meaningful Appointment mutations such as:

- creation
- confirmation
- rescheduling
- cancellation
- check-in
- start
- completion
- no-show

where those states are part of the approved lifecycle.

Security audit events record security-relevant operations according to the approved audit policy.

Routine successful GET requests do not automatically generate audit records.

No unnecessary patient PII is stored in history/audit records.

## Proposed decision

```text
APPROVE — mutation-oriented Appointment history/audit
```

---

# 21. M4-18 — Calendar Integration

Calendar integration is explicitly deferred.

M4 does not implement:

- Google Calendar
- Microsoft Outlook
- Apple Calendar
- ICS synchronization
- external calendar APIs

A future calendar milestone may consume the Appointment model.

## Proposed decision

```text
APPROVE — calendar integration deferred
```

---

# 22. M4-19 — Notification Delivery

M4 does not implement notification delivery.

The only notification-related capability permitted in M4 is:

```text
transactional outbox intent
```

No external notification provider is connected.

## Proposed decision

```text
APPROVE — notification delivery deferred to future milestone
```

---

# 23. Appointment Domain Model

Subject to the decisions above, the proposed Appointment aggregate is conceptually:

```text
Appointment
├── id
├── organizationId
├── branchId
├── patientId
├── practitionerId
├── startAtUtc
├── endAtUtc
├── timezone
├── status
├── createdAt
├── updatedAt
└── lifecycle/history metadata as approved
```

The final fields must follow the approved DDD/API contract.

Do not add speculative fields.

Do not add:

- diagnosis
- treatment
- prescription
- clinical notes
- dental chart
- billing
- payment
- insurance

---

# 24. Appointment Ownership Invariants

The following invariants are mandatory:

```text
Appointment.organizationId
        ↓
must reference an existing Organization
```

```text
Appointment.patientId
        ↓
must reference a Patient belonging to Appointment.organizationId
```

```text
Appointment.branchId
        ↓
must reference a Branch belonging to Appointment.organizationId
```

```text
Appointment.practitionerId
        ↓
must reference an approved Practitioner belonging to Appointment.organizationId
```

No cross-organization relationship may be persisted.

---

# 25. Security Model

Appointment access follows:

```text
M1 Session
      ↓
Application userId
      ↓
M2 Organization membership
      ↓
Appointment permission
      ↓
Organization-scoped Appointment lookup
      ↓
Appointment object authorization
      ↓
ALLOW / DENY
```

The client cannot grant itself:

- organization membership
- appointment permission
- practitioner identity
- patient ownership
- branch ownership
- SYSTEM_ADMIN privileges

---

# 26. BOLA / IDOR Protection

Appointment repository access must be organization-scoped.

Avoid unscoped access equivalent to:

```text
findAppointmentById(appointmentId)
```

Prefer:

```text
findByOrganizationAndId(
    organizationId,
    appointmentId
)
```

or an equivalent repository abstraction.

Cross-tenant Appointment requests must not disclose whether the Appointment exists.

The established M3 anti-enumeration approach should be reused.

---

# 27. Database Integrity

The M4 database must enforce, where practical:

- primary key
- organization foreign key
- patient foreign key
- branch foreign key
- practitioner foreign key
- status constraint
- timestamp constraints
- appropriate indexes
- scheduling conflict constraints where supported

Do not use cascading deletes for Appointment records unless explicitly approved.

---

# 28. Concurrency Requirement

Appointment scheduling must remain safe under concurrent requests.

The implementation must demonstrate:

```text
Concurrent conflicting requests
        ↓
No double booking
```

through automated tests.

A passing sequential test suite alone is insufficient.

---

# 29. Transactional Requirement

Where required, the following must commit atomically:

```text
Appointment mutation
+
Appointment history
+
Audit event
+
Outbox intent
```

If any required component fails:

```text
ROLLBACK
```

No partial Appointment mutation may remain.

---

# 30. API Contract

Subject to the approved API convention, the initial API surface is:

```text
POST /api/appointments
GET /api/appointments
GET /api/appointments/:appointmentId
PATCH /api/appointments/:appointmentId
POST /api/appointments/:appointmentId/reschedule
POST /api/appointments/:appointmentId/cancel
```

Do not implement additional command routes unless explicitly required by the approved lifecycle.

No DELETE endpoint.

No notification endpoints.

No calendar endpoints.

---

# 31. Explicitly Out of Scope

M4 does NOT implement:

```text
Notifications
SMS
WhatsApp
Email delivery
Push notifications
Calendar integration
Patient portal
Patient self-access
Clinical records
Dental chart
Treatment
Prescription
Billing
Payments
Insurance
AI diagnosis
Clinical decision support
```

M5 and later milestones will address future domains independently.

---

# 32. Required Security Tests

M4 implementation must include tests for:

### Authentication

- unauthenticated access
- invalid session
- disabled user

### Organization

- missing membership
- inactive membership
- revoked membership
- wrong organization
- tampered organization header

### Patient

- foreign patient
- inactive patient
- forged patient ID
- patient/organization mismatch

### Branch

- foreign branch
- branch/organization mismatch

### Practitioner

- foreign practitioner
- practitioner/organization mismatch
- invalid practitioner relationship

### BOLA

- foreign Appointment GET
- foreign Appointment PATCH
- foreign Appointment cancellation
- foreign Appointment reschedule

### Authorization

- PATIENT denied
- SYSTEM_ADMIN denied
- STAFF policy
- PRACTITIONER policy
- PRACTICE_ADMIN policy
- missing permission

### Lifecycle

- invalid transition
- unauthorized transition
- invalid cancellation
- invalid rescheduling

### Conflict

- overlapping practitioner appointments
- overlapping patient appointments
- cancelled appointment behavior
- concurrent conflicting creation

### Transaction

- Appointment/history failure
- Appointment/audit failure
- Appointment/outbox failure

### Leakage

Denied responses must not expose:

- patient name
- patient email
- phone
- DOB
- appointment time
- practitioner identity
- branch information
- other organization information

---

# 33. Logging

Logs must not contain unnecessary patient PII.

Prefer:

```text
eventName
appointmentId
actorId
requestId
```

Do not log complete Appointment payloads.

Do not log:

- patient name
- patient email
- phone
- DOB
- clinical information

---

# 34. Migration Safety

Create a new additive M4 migration.

Do not rewrite:

```text
M1 migrations
M2 migrations
M3 migrations
```

Do not delete or transform existing patient/authentication/organization data.

Do not introduce destructive migration behavior.

---

# 35. Production Safety

No production infrastructure changes are authorized by this record.

Do not:

- create production Cognito resources
- change production DNS
- create production notification providers
- deploy
- create production patient/appointment records
- add production credentials

All test data must be synthetic.

---

# 36. Git Policy

Implementation should occur on an M4 implementation branch derived from the current M4 discovery branch.

Do not rewrite the discovery commit.

Recommended logical commits:

```text
feat(appointment): add appointment domain foundation
feat(appointment): add appointment authorization and lifecycle
feat(appointment): add scheduling integrity
test(appointment): add security and concurrency coverage
docs(appointment): document m4 implementation
```

The PR remains draft.

Do not merge.

---

# 37. Validation Requirements

After implementation, run:

```bash
pnpm test
pnpm lint
pnpm format:check
pnpm typecheck
pnpm db:validate
pnpm build
pnpm security:audit
pnpm security:secrets
CI=true pnpm test:e2e
```

Report each gate as:

```text
PASS
FAIL
NOT APPLICABLE
BLOCKED
```

Do not claim M4 complete if a required gate fails.

---

# 38. Documentation Requirements

Create/update:

```text
docs/TDA-M4-APPOINTMENT-CONTRACT.md
docs/TDA-M4-IMPLEMENTATION-REPORT.md
docs/ADR-FOLLOWUP-M4.md
```

The implementation report must contain:

- architecture
- database
- API
- authorization
- lifecycle
- conflict handling
- concurrency mechanism
- audit/history
- outbox
- security tests
- validation evidence
- Git state
- deferred work
- production readiness

---

# 39. Human Approval Requirement

This document MUST NOT be marked APPROVED by an AI agent.

Approval requires human review.

The human must confirm that:

1. Practitioner model is acceptable.
2. Branch decision is acceptable.
3. Timezone model is acceptable.
4. Conflict/concurrency mechanism is acceptable.
5. Outbox intent approach is acceptable.
6. PATIENT denial is acceptable.
7. SYSTEM_ADMIN denial is acceptable.
8. Permission/role mapping is acceptable.
9. Lifecycle is acceptable.
10. Rescheduling model is acceptable.
11. Inactive-patient behavior is acceptable.
12. Retention/deletion policy is acceptable.
13. Identifier/API conventions are acceptable.

---

# 40. HUMAN APPROVAL

## Approval Status

```text
APPROVED
```

After review, the human may change this section to:

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

I have reviewed the M4 Appointment Domain decisions in this document and approve them as the architectural basis for M4 implementation.

I understand that:

- M4 implementation will follow these decisions.
- Future changes require a new or updated ADR.
- Appointment implementation must not silently expand into Notifications, Calendar, Clinical Records, Billing, or other future domains.
- Production readiness remains a separate approval decision.

```text
Human Approval:

[x] APPROVED
[ ] NOT APPROVED
```

---

# 41. POST-APPROVAL RULE

Once this document is marked:

```text
APPROVED
```

it becomes the authoritative M4 Appointment architecture.

Cursor must:

- follow the approved decisions
- not reinterpret them
- not replace them with its own recommendations
- not silently add permissions
- not expand SYSTEM_ADMIN access
- not introduce Patient self-access
- not invent Practitioner semantics
- not change timezone semantics
- not replace the approved concurrency strategy

If implementation reveals a conflict with this document:

```text
STOP
```

and report the conflict to the human.

Do not silently modify the architecture.

---

# 42. M4 Definition of Done

M4 may be declared complete only when:

```text
Approved architecture
        ↓
Appointment domain implemented
        ↓
Organization isolation enforced
        ↓
Patient relationship enforced
        ↓
Practitioner relationship enforced
        ↓
Branch relationship enforced
        ↓
Appointment authorization enforced
        ↓
Lifecycle enforced
        ↓
Timezone semantics enforced
        ↓
Concurrency-safe conflict prevention
        ↓
History/audit/outbox implemented as approved
        ↓
BOLA/security tests pass
        ↓
All repository validation gates pass
        ↓
Documentation complete
        ↓
Human review complete
```

Passing compilation alone does not constitute M4 completion.

---

# 43. Final Scope Boundary

M4 is:

```text
Appointment Domain
```

M4 includes only the architecture explicitly approved in this document.

M4 does not include:

```text
Notification Delivery
Calendar Integration
Patient Portal
Clinical Records
Dental Chart
Treatment
Prescription
Billing
Payments
Insurance
AI Diagnosis
Clinical Decision Support
```

Do not cross this boundary.

---

# 44. Final Instruction to Implementation Agent

Before writing code:

```text
Verify this document is marked APPROVED.
```

If not:

```text
STOP — M4 IMPLEMENTATION BLOCKED.
```

If approved:

```text
1. Inspect repository
2. Verify approved decisions
3. Implement exactly the approved architecture
4. Add database migration
5. Implement domain/application/repository layers
6. Implement authorization
7. Implement lifecycle
8. Implement conflict/concurrency protection
9. Implement history/audit/outbox where approved
10. Implement API
11. Add security and BOLA tests
12. Add concurrency tests
13. Run all validation gates
14. Review migration safety
15. Review PII leakage
16. Document evidence
17. Commit
18. Push
19. Keep PR draft
20. STOP
```

Do not proceed to M5.

**The human approval of this record is the formal gate between M4 discovery and M4 implementation.**
