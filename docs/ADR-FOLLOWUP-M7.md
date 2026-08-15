# TDA-ADR-FOLLOWUP-M7

## M7 Practitioner Management and Availability — Human Architecture Decision Record

**Document ID:** TDA-ADR-FOLLOWUP-M7  
**Version:** 1.0  
**Status:** PROPOSED — AWAITING HUMAN APPROVAL  
**Date:** 2026-08-15  
**Milestone:** M7 — Practitioner Management and Availability  
**Depends on:** approved `docs/ADR-FOLLOWUP-M4.md` (M4-01 practitioner profile; M4-02 branch integrity; M4-03 timezone; M4-04/05/06 conflict constraints; M4-16 retention; M4-18 calendar deferred), approved `docs/ADR-FOLLOWUP-M5.md` (M5-06 events; M5-09 worker disabled by default), and approved `docs/ADR-FOLLOWUP-M6.md` (appointment lifecycle operations)  
**Scope:** Organization-scoped practitioner profile operations, branch assignment, working hours, leave/exceptions, and internal availability evaluation  
**This file is not an approved ADR.**

Agents and coding assistants must not mark this document approved.

No Practitioner Management or Availability implementation may begin until the decisions in this document are reviewed and the human approval section is completed as `APPROVED`.

```text
M7 IMPLEMENTATION BLOCKED — AWAITING HUMAN M7 DECISION APPROVAL
```

This proposal does **not** authorize production release, deployment, merge to `main`, real SMTP enablement, calendar integration, booking-model changes, clinical notes, billing, patient-portal features, M8 work, or any change to M1–M6 behavior until a separate approved implementation task follows this record.

---

# 1. Purpose

M4 introduced a **minimum Practitioner Profile** so appointments can reference a same-organization practitioner. There is no public practitioner HTTP API, no activation state, no branch assignment, and no availability. Appointments may currently be created for any same-org practitioner at any same-org branch.

M7 would add practitioner operations and advisory availability **without** changing the M4 appointment row shape, M4 PostgreSQL exclusion constraints, or M6 lifecycle commands.

Implementation is blocked until the human project owner approves M7-01 through M7-12.

---

# 2. Verified M1–M6 baseline (do not redesign)

Inspected on `origin/cursor/m3-patient-domain-3efc` at `175a3b9` (M6 merge of PR #7).

## 2.1 Practitioner profile today (M4-01)

`practitioners` columns: `id` (cuid), `organizationId`, `userId`, `createdAt`, `updatedAt`.

- `userId` is **globally unique** (`practitioners_userId_key`). One application user can be linked to at most one practitioner profile across all organizations.
- Foreign keys: organization and user `ON DELETE RESTRICT`.
- Domain type has **no** `status`, display name, credentials, timezone, or branch list.
- `PractitionerRepository` supports `create(organizationId, userId)` and `findByOrganizationAndId`. There is **no** public practitioner HTTP API. Tests seed profiles through the repository.

```text
Application User  ≠  Patient  ≠  Practitioner Profile
```

A Cognito `sub` or M1 `userId` is not an appointment practitioner identifier. Appointments store `practitionerId` (profile id).

## 2.2 Branch today (M4-02)

`branches` columns: `id`, `organizationId`, `name`, `status` (default `active`), timestamps. **No timezone field.**

Membership may optionally store `branchId`; **branch-level authorization remains deferred** unless separately approved.

Every appointment requires a same-organization `branchId`. There is **no** requirement that the practitioner be assigned to that branch.

## 2.3 Appointment time and conflict (M4-03/04/05/06)

Appointments store UTC instants (`startAtUtc`, `endAtUtc`) plus a required IANA `timezone` on the appointment row. That timezone is display/notification metadata, not a branch or practitioner clock.

PostgreSQL exclusion constraints (`appointments_practitioner_time_excl`, `appointments_patient_time_excl`) prevent overlapping **active** appointments (`REQUESTED`, `CONFIRMED`, `CHECKED_IN`, `IN_PROGRESS`) for the same practitioner or patient in an organization. Range is half-open `[start, end)`. M6 terminal states already release the slot.

These constraints must remain the durable conflict backstop. M7 availability must not replace them.

## 2.4 Appointment create / M6 lifecycle

Create validates same-org patient (active), practitioner, and branch. Inactive **patients** cannot receive new appointments. Inactive **practitioners** cannot be represented today because the profile has no status.

M6 commands: confirm, check-in, start, complete, no-show. Cancel allowed through `CHECKED_IN`, not after `IN_PROGRESS`. M6 emits **no** new notification event types.

## 2.5 Authorization

Appointment and notification permissions are tenant-scoped via `AuthorizationPort`. Granted to `STAFF`, `PRACTITIONER`, and `PRACTICE_ADMIN`. **Denied** to `PATIENT` and `SYSTEM_ADMIN`. Application code does not branch on role names.

There are **no** practitioner-management or availability permission keys.

## 2.6 Notifications and calendar

M5 delivers only `appointment.created`, `appointment.rescheduled`, and `appointment.cancelled`. Worker disabled by default. Real SMTP fail-closed. Calendar integration is deferred (M4-18). M6 added no outbox types.

No approved M7 architecture decision record exists. M1–M6 must not be redesigned by M7.

---

# 3. Decision summary (proposed)

| #     | Decision                       | Recommended default                                                                                                                                                         |
| ----- | ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M7-01 | Practitioner profile lifecycle | One org-scoped profile per application user; staff create/update/activation; no unlink, replace, or hard delete; deactivation preserves history and blocks new assignment   |
| M7-02 | Branch relationship            | Explicit practitioner-to-branch assignments; appointment practitioner must be assigned to the appointment branch; no user branch-level authorization                        |
| M7-03 | Availability timezone          | Each availability schedule requires an IANA timezone; do not infer from the browser; do not add a Branch timezone model in M7; appointment UTC instants unchanged           |
| M7-04 | Working-hours model            | Recurring weekly working intervals with explicit timezone; no overlap per practitioner+branch                                                                               |
| M7-05 | Breaks, leave, exceptions      | Dated unavailability intervals; defer public-holiday calendars and complex recurring exceptions                                                                             |
| M7-06 | Availability calculation       | Internal advisory evaluation only; does not replace M4 exclusion constraints                                                                                                |
| M7-07 | Appointment behavior           | Block **new** assignment to inactive or unassigned practitioners; preserve existing appointments; flag operational conflicts; no auto cancel/reschedule/notify              |
| M7-08 | Authorization                  | Explicit tenant-scoped permissions; role grants defined individually below; PATIENT and SYSTEM_ADMIN denied; practitioners do **not** self-manage schedules unless approved |
| M7-09 | API surface                    | Command-style tenant-scoped internal APIs; no patient-facing availability or booking endpoint                                                                               |
| M7-10 | Concurrency and integrity      | Database constraints for identity/assignment; availability advisory; appointment writes remain protected by M4 exclusions                                                   |
| M7-11 | Audit and retention            | Mutation-oriented history/security audit; no hard delete; restrictive retention until separately approved                                                                   |
| M7-12 | Notifications and calendar     | No new notification event types and no calendar synchronization in M7                                                                                                       |

These are **proposed**, not approved. The human may change any row before marking this record `APPROVED`.

---

# 4. Relationship (proposed, if M7-01/M7-02/M7-04/M7-05 are approved)

```text
Organization
    ├── Branch (no timezone today)
    ├── Application User
    │       └── 0..1 Practitioner Profile (org-scoped; optional inactive)
    │               ├── PractitionerBranchAssignment[]
    │               ├── WeeklyWorkingInterval[]  (IANA timezone on the schedule)
    │               └── UnavailabilityInterval[] (breaks / leave / one-off)
    └── Appointment
            ├── branchId     (must be an assigned branch — M7-02/M7-07)
            ├── practitionerId
            ├── startAtUtc / endAtUtc
            └── timezone     (appointment IANA; unchanged)
```

Availability evaluation (M7-06) is a **read/compute** path. Appointment create/reschedule remain writes protected by M4 exclusions.

---

# 5. M7-01 — Practitioner profile lifecycle

## Options

1. **Recommended.** Authorized staff create a profile, link it to an existing same-organization application user, update administrative fields, and deactivate/reactivate. No unlink, user replacement, or hard delete. Deactivation preserves the row and historical appointments and blocks **new** assignment (M7-07).
2. Allow unlink/replace of `userId` (breaks audit continuity of “who this practitioner is”).
3. Hard-delete profiles (conflicts with M4-16 / M7-11).
4. Auto-create a profile from the `PRACTITIONER` role (collapses User ≠ Practitioner).

## Recommended default

```text
One organization-scoped Practitioner Profile per application user.
Authorized staff manage create/update/activation.
No unlink, replacement, or hard delete in M7.
Deactivation preserves history and blocks future appointment assignment.
```

## Rationale

Matches M4-01 (profile linked to user; minimum fields today) and M3 inactive-patient pattern. Global unique `userId` already exists; M7 should keep **at most one profile per user**. If the human later wants the same person to be a practitioner in two organizations, that requires a separate uniqueness decision (`UNIQUE(organizationId, userId)` instead of global `userId`). Default: keep current global unique `userId` plus org ownership.

Administrative fields in M7 should stay non-clinical (for example display name / status). Licensing, credentials, payroll, and portal remain deferred.

## Security implications

Create must verify the target user exists, is in the same organization (active membership recommended), and is not already linked. Clients must not supply another tenant’s `userId` successfully. Deactivate is a command, not `DELETE`.

## Implementation consequences (after approval only)

Additive `status` (and only those administrative columns the human approves). No public delete route. Appointment create/reschedule gain an active-practitioner check (M7-07).

---

# 6. M7-02 — Practitioner profile scope and branch relationship

## Options

1. Practitioners operate at all organization branches (status quo; no assignment table).
2. **Recommended.** Explicit organization-owned practitioner-to-branch assignments. New appointments require the practitioner to be assigned to the appointment’s branch. No user branch-level RBAC.
3. One primary branch plus additional assigned branches (primary is extra policy; assignment set is sufficient).
4. Introduce membership/branch-level authorization for all APIs (out of M7; conflicts with M4-02 deferral).

## Recommended default

```text
Use explicit organization-owned practitioner-to-branch assignments.
Require an appointment’s practitioner to be assigned to its branch.
Do not introduce user branch-level authorization in M7.
```

## Rationale

Appointments already have `branchId`. Without assignment, availability and working hours cannot be branch-specific. M4-02 deferred **user** branch authorization; M7 can still constrain **practitioner assignment** as data, evaluated in appointment create/reschedule, without a new RBAC axis.

## Security implications

Assignments are tenant-scoped. A practitioner id from org A cannot be assigned to a branch in org B. Cross-tenant ids return the same safe `404`/`400` conventions as appointments (prefer not leaking foreign branch existence).

## Implementation consequences

New assignment table with uniqueness `(practitionerId, branchId)`. Appointment create/reschedule reject unassigned practitioner+branch combinations (M7-07). Existing appointments at unassigned branches are preserved and flagged, not auto-cancelled.

---

# 7. M7-03 — Availability time-zone source

## Options

1. **Recommended.** Each availability schedule requires an explicit IANA timezone. Do not infer from the browser. Do not add a Branch timezone field in M7. Appointment `startAtUtc` / `endAtUtc` / appointment `timezone` remain M4-03.
2. Add a Branch timezone first (new data model; **not** approved today — Branch has no timezone column). Would be a separate decision.
3. Infer timezone from practitioner locale or client (unsafe; DST/ambiguous).
4. Reuse each appointment’s timezone as the schedule clock (schedules exist independently of a single appointment).

## Recommended default

```text
Each availability schedule requires an IANA timezone.
Do not infer a timezone from the browser.
Appointment UTC instants remain unchanged.
```

Branch has **no** approved timezone field. M7 should **not** introduce a Branch timezone model. Schedules carry their own IANA timezone. Expanding weekly intervals to UTC instants for a given local date must use that schedule timezone (including DST).

## Security / integrity implications

Reject abbreviations (`IST`, `EST`) as M4 already does. Invalid IANA names fail validation. Availability queries must accept an explicit timezone or use the schedule’s stored zone — never a client-only offset.

---

# 8. M7-04 — Working-hours model

## Options

1. **Recommended.** Recurring weekly intervals (weekday + local start/end) per practitioner+branch, with the schedule IANA timezone. Intervals must not overlap for one practitioner and branch.
2. Only fixed dated “I am available on this calendar day/time” intervals.
3. Both weekly recurrence and dated extra availability in M7 (larger surface).
4. External calendar free/busy (calendar integration — forbidden in M7-12).

## Recommended default

```text
Recurring weekly working intervals with explicit timezone.
Intervals must not overlap for one practitioner and branch.
```

## Rationale

Dental clinics typically repeat weekly hours. Dated extra availability can wait. Overlap of weekly intervals is a durable invariant (M7-10).

## Implementation consequences

Store weekday + local time-of-day + timezone, not a single UTC range (DST would break). Evaluation converts a requested UTC window into the schedule zone. Appointment duration remains caller-supplied on the availability query / existing appointment length — M7 does not change appointment duration rules.

---

# 9. M7-05 — Breaks, leave, and exceptions

## Options

1. **Recommended.** Dated unavailability intervals (start/end UTC or local+timezone consistent with M7-03) covering breaks, full-day leave, partial-day leave, and one-off exceptions. Defer holiday calendars and “every Wednesday off except the third.”
2. Recurring weekly breaks plus dated leave (two models in M7).
3. Full public-holiday calendar import.
4. Encode unavailability as cancelled appointments (pollutes M4/M6 lifecycle).

## Recommended default

```text
Use dated unavailability intervals for breaks, leave, and exceptions.
Defer public-holiday calendars and complex recurring exceptions.
```

## Rationale

One unavailability table keeps M7 small. Recurring weekly **working** hours (M7-04) minus dated unavailability is enough for advisory slots. Holidays and complex RRULEs are a later milestone.

Unavailability overlapping working hours is expected (a lunch break sits inside a working day). That is not a uniqueness conflict; evaluation subtracts unavailability from weekly hours (M7-06).

---

# 10. M7-06 — Availability calculation

## Options

1. **Recommended.** Internal evaluation: assigned branch + weekly hours − unavailability − existing **active** appointments, for a requested duration, using the schedule timezone/DST rules. Result is advisory. Create/reschedule still hit M4 exclusions.
2. Availability as the sole booking lock (unsafe races; rejected by M7-10 / M4-04).
3. Patient-facing slot booking API (rejected by M7-09).
4. Hold/reservation table in M7 (new concurrency product; not requested).

## Recommended default

```text
Provide internal availability evaluation only.
It is advisory for scheduling and does not replace M4’s database conflict constraints.
```

## Calculation inputs (proposed)

- practitioner is active and assigned to the branch (M7-01/M7-02)
- weekly working intervals in the schedule IANA timezone
- dated unavailability
- existing appointments in `ACTIVE_SCHEDULING_STATUSES`
- requested duration (and optional search window)
- DST as defined by the schedule timezone

Outputs are candidate UTC intervals. Two staff clients can still race; M4 exclusions return `409 conflict`.

## Implementation consequences

Read-only query API (M7-09). No change to appointment columns. No weakening of exclusion constraints.

---

# 11. M7-07 — Appointment behavior

## Options

1. **Recommended.** Block **new** create/reschedule onto an inactive practitioner or a practitioner not assigned to the requested branch. Leave existing appointments in place. Surface operational conflicts (for example leave covering a future `CONFIRMED` slot) to staff. Do not auto-cancel, auto-reschedule, or write new notification intents.
2. Auto-cancel future appointments on deactivate or leave (changes M6 lifecycle and M5 events without an M6/M5 decision).
3. Allow booking inactive/unassigned practitioners (status quo; makes M7-01/M7-02 ineffective).

## Recommended default

```text
Block new appointment assignment to inactive or unassigned practitioners.
Preserve existing appointments and flag operational conflicts for staff review.
Do not automatically cancel, reschedule, or notify in M7.
```

## Rationale

M3 already blocks new appointments for inactive patients while keeping history. Applying the same idea to practitioners avoids silent destruction of the schedule. Auto-notify would violate M7-12 / M5-06.

“Flag” in M7 means an internal read (availability query and/or appointment list annotation), not a new outbox event.

## Implementation consequences

Appointment create/reschedule validation expands (same-org + active patient + active practitioner + assignment). M6 status commands on existing rows stay as approved. Adding leave that covers a future appointment does **not** mutate that appointment.

---

# 12. M7-08 — M7 authorization

## Options

1. **Recommended.** New tenant-scoped permission keys; grants listed individually; `AuthorizationPort` only; no role-name branching in domain code. `PATIENT` and `SYSTEM_ADMIN` denied. `PRACTITIONER` does **not** manage self schedule/leave unless the human flips that row.
2. Reuse `appointment.update.tenant` for all practitioner/schedule writes (too coarse; PATCH-style backdoor).
3. Allow `PRACTITIONER` to manage only their own schedule (`*.self` keys — not seeded in M3/M4; would be a new self-access model).
4. Grant `SYSTEM_ADMIN` practitioner APIs (conflicts with M4-09 pattern).

## Recommended default

```text
Explicit tenant-scoped permissions.
STAFF, PRACTITIONER, and PRACTICE_ADMIN access must be individually defined.
PATIENT and SYSTEM_ADMIN remain denied by default.
```

## Proposed keys and grants (human may change any cell)

| Permission                       | Meaning                                   | STAFF | PRACTITIONER | PRACTICE_ADMIN | PATIENT | SYSTEM_ADMIN |
| -------------------------------- | ----------------------------------------- | ----- | ------------ | -------------- | ------- | ------------ |
| `practitioner.read.tenant`       | List/read profiles in the organization    | allow | allow        | allow          | deny    | deny         |
| `practitioner.manage`            | Create/update/activate/deactivate profile | deny  | deny         | allow          | deny    | deny         |
| `practitioner.assignment.manage` | Assign/unassign branches                  | deny  | deny         | allow          | deny    | deny         |
| `practitioner.schedule.manage`   | Mutate weekly working intervals           | allow | **deny**     | allow          | deny    | deny         |
| `practitioner.leave.manage`      | Mutate dated unavailability               | allow | **deny**     | allow          | deny    | deny         |
| `practitioner.availability.read` | Run internal availability evaluation      | allow | allow        | allow          | deny    | deny         |

Do **not** assume practitioners may manage their own schedule unless this table is explicitly approved with `PRACTITIONER` = allow on schedule/leave.

## Security implications

Same session + organization header pattern as M4/M6. Object lookup is always `organizationId + practitionerId`. Cross-tenant ids: safe not-found. No patient portal.

---

# 13. M7-09 — API surface

## Options

1. **Recommended.** Internal command/read APIs under `/api/...` (not `/api/v1`), empty or validated bodies, no patient-facing slot booking.
2. Patient booking widget / public availability (portal — out of scope).
3. Generic PATCH of practitioner/schedule JSON documents (bypasses commands).
4. No HTTP API; admin SQL only (insufficient for the product, but would still need an approved write path).

## Recommended default

```text
Use command-style tenant-scoped internal APIs.
No patient-facing availability or booking endpoint.
```

## Proposed routes (do not implement until approved)

```text
POST   /api/practitioners
GET    /api/practitioners
GET    /api/practitioners/:id
POST   /api/practitioners/:id/deactivate
POST   /api/practitioners/:id/activate

POST   /api/practitioners/:id/branches
POST   /api/practitioners/:id/branches/:branchId/unassign

POST   /api/practitioners/:id/schedules
POST   /api/practitioners/:id/schedules/:scheduleId/replace
POST   /api/practitioners/:id/unavailability
POST   /api/practitioners/:id/unavailability/:intervalId/cancel

GET    /api/practitioners/:id/availability
```

Exact path names may be adjusted in the implementation contract after approval. There is no `DELETE /api/practitioners/:id`. Availability GET is staff-authenticated and tenant-scoped.

---

# 14. M7-10 — Concurrency and integrity

## Options

1. **Recommended.** Unique constraints: one profile per `userId` (existing); unique `(practitionerId, branchId)` assignments; non-overlapping weekly intervals per practitioner+branch (exclusion or equivalent). Unavailability may overlap working hours. Availability query is a snapshot; appointment create/reschedule remain serialized by M4 gist exclusions (`409`).
2. Application-only checks without database uniqueness (racy).
3. Serialize all availability queries with appointment holds (new product).

## Recommended default

```text
Use database constraints for durable identity/assignment invariants.
Treat availability as advisory; appointment creation remains protected by M4 PostgreSQL exclusion constraints.
```

## Rationale

M4 already decided database-enforced appointment overlap. M7 must not introduce a check-then-insert booking hole. Two overlapping “available” reads can both proceed; one create wins, the other conflicts.

Leave versus weekly schedule overlap is **not** an error (M7-05). Leave versus another leave interval for the same practitioner may be unique/non-overlapping if the human wants; recommended: allow overlap of unavailability (simpler) or reject overlapping unavailability — **human should confirm**. Default proposal: **reject overlapping unavailability intervals** for one practitioner (clearer operational picture).

---

# 15. M7-11 — Audit and retention

## Options

1. **Recommended.** Each successful mutation writes security_events (and practitioner/assignment/schedule history as needed) with authenticated `actorUserId`. No hard delete. `ON DELETE RESTRICT`. Separate legal retention/purge policy later.
2. Hard-delete profiles and schedules.
3. No audit for schedule edits (weaker than M4-17 / M6-08).

## Recommended default

```text
Mutation-oriented history/security audit.
No hard delete; restrictive retention remains until separately approved.
```

Deactivate, assignment change, schedule replace, and unavailability create/cancel are auditable. Availability GET is not.

No unnecessary PII in history (no clinical data; practitioner display name only if the human approves storing it on the profile).

---

# 16. M7-12 — Notifications and calendar boundaries

## Options

1. **Recommended.** No new outbox event types. No Google/Outlook/CalDAV sync. No SMS/WhatsApp. M5 remains created/rescheduled/cancelled email only, worker still disabled by default.
2. Notify patients when leave covers their appointment (new M5 event — requires a new notification ADR).
3. Push practitioner calendars externally (M4-18 still deferred).

## Recommended default

```text
No new notification event types and no calendar synchronization in M7.
```

M7-07 already says do not notify on deactivate/leave. Staff see flags via internal reads.

---

# 17. Compatibility with M1–M6

| Milestone | Constraint on M7                                                                                            |
| --------- | ----------------------------------------------------------------------------------------------------------- |
| M1        | Session via `AuthenticationPort`; no new IdP                                                                |
| M2        | `AuthorizationPort` + organization membership; no SYSTEM_ADMIN tenant backdoor                              |
| M3        | Patient identity unchanged; inactive patient rule unchanged                                                 |
| M4        | Appointment row shape, UTC+IANA, exclusion constraints, no `RESCHEDULED` status, no practitioner HTTP today |
| M5        | Three outbox types; worker off by default; no calendar channel                                              |
| M6        | Lifecycle commands unchanged; no auto-cancel from M7                                                        |

M7 must not rewrite M1–M6 migrations. Additive schema only after approval.

---

# 18. Privacy, security, and tenant isolation

- All M7 APIs are organization-scoped. Lookups use `organizationId + practitionerId` (and branch id where relevant).
- Cross-tenant practitioner/branch/user ids must not leak names, emails, or schedules.
- PATIENT has no availability or practitioner-management access.
- SYSTEM_ADMIN remains denied on these tenant APIs unless a future ADR says otherwise.
- Availability responses include times and practitioner/branch ids needed for staff scheduling, not patient clinical data.
- Do not log full schedules with patient PII.

---

# 19. Deferred work (not in M7 even after approval of the defaults)

- Calendar sync / ICS / external free-busy
- Patient-facing booking and self-service
- Practitioner portal / self-schedule unless M7-08 is changed
- Branch-level user RBAC (M4-02)
- Branch timezone model
- Public holiday calendars and complex recurring exceptions
- Licensing, credentials, payroll, performance
- Hard delete / legal retention purge
- New notification event types
- Automatic cancel/reschedule when leave is added
- Changing M4 exclusion constraint definitions
- Clinical, billing, M8

---

# 20. Implementation freeze

Until §22 is `APPROVED`:

```text
M7 IMPLEMENTATION BLOCKED — AWAITING HUMAN M7 DECISION APPROVAL
```

Do **not**:

- add practitioner HTTP APIs, availability tables, schedules, or leave rows
- add or seed M7 permission keys
- change appointment create/reschedule validation
- rewrite M1–M6 migrations or exclusion constraints
- add outbox event types or calendar adapters
- merge to `main`, deploy, enable real SMTP, or start M8

---

# 21. What the human must confirm

1. Profile lifecycle, uniqueness, and deactivation (M7-01).
2. Branch assignment vs all-branches (M7-02).
3. Schedule IANA timezone vs a future Branch timezone (M7-03).
4. Weekly intervals vs dated availability (M7-04).
5. Dated unavailability only vs richer exception model (M7-05).
6. Advisory evaluation vs booking lock (M7-06).
7. Block new assignment vs auto-cancel on leave/deactivate (M7-07).
8. Permission keys and the PRACTITIONER self-manage question (M7-08).
9. Internal command APIs vs patient booking (M7-09).
10. Database uniqueness vs application-only checks (M7-10), including whether unavailability intervals may overlap each other.
11. Audit/retention (M7-11).
12. No notifications and no calendar in M7 (M7-12).

---

# 22. HUMAN APPROVAL

## Approval Status

```text
PROPOSED — AWAITING HUMAN APPROVAL
```

After review, the human may change this section to:

```text
APPROVED
```

Agents and coding assistants must not make that change.

## Approved By

```text
Name:
Role: Project Owner
Date:
```

## Human Approval Statement

I have reviewed the M7 Practitioner Management and Availability decisions in this document and approve them as the architectural basis for M7 implementation.

I understand that:

- M7 implementation will follow these decisions only.
- This approval does not authorize production release, deployment, or merge to `main`.
- This approval does not authorize calendar integration, patient booking, real SMTP enablement, clinical records, billing, or M8 work.
- Future changes require a new or updated decision record.

```text
Human Approval:

[ ] APPROVED
[ ] NOT APPROVED
```

---

# 23. Post-approval rule

Once this document is `APPROVED`, it becomes the M7 implementation source of truth.

A **separate** implementation task may then follow M7-01 through M7-12.

If implementation reveals a conflict with approved M1–M6: **STOP** and report it. Do not silently change the architecture.

Until that approval:

```text
M7 IMPLEMENTATION BLOCKED — AWAITING HUMAN M7 DECISION APPROVAL
```
