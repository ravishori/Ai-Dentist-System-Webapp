# TDA-ADR-002 — Identity, Authentication, Authorization & Tenant Model

| Field                | Value                                                                                                                                          |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| **ADR ID**           | TDA-ADR-002                                                                                                                                    |
| **Title**            | Identity, Authentication, Authorization & Tenant Model                                                                                         |
| **Version**          | 1.0                                                                                                                                            |
| **Status**           | PROPOSED — READY FOR HUMAN APPROVAL                                                                                                            |
| **Date**             | 14 August 2026                                                                                                                                 |
| **Repository**       | `ravishori/Ai-Dentist-System-webapp`                                                                                                           |
| **Change class**     | C3 (security boundary / major architecture) per TDA-GOV-CMP-001                                                                                |
| **Primary sources**  | TDA-SEC-001, TDA-DDD-001-D01, TDA-FRS-001 (IAM-FR-\*), TDA-PRD-BRD-001 (BRD-014/015), TDA-API-001, TDA-IMP-M1-001, TDA-IMP-M0-002, TDA-ADR-001 |
| **Does not select**  | A named authentication vendor                                                                                                                  |
| **Related open ADR** | TDA-SEC-001 ADR-SEC-001 — exact authentication provider/mechanism (to be recorded as TDA-ADR-003 when selected)                                |

AI-generated documentation is non-authoritative until reviewed and approved (TDA-GOV-SOT-001 §16, TDA-GOV-CMP-001 §14). Cursor must not self-approve this decision.

---

## 1. ADR ID

TDA-ADR-002

## 2. Title

Identity, Authentication, Authorization & Tenant Model for Ai-Dentist-System-webapp

## 3. Status

PROPOSED — READY FOR HUMAN APPROVAL

Upon human approval, this ADR is the authoritative identity/security architecture for M1 Foundation & Identity in this repository.

## 4. Date

14 August 2026

## 5. Context

M0 established a TypeScript modular monolith with an `AuthenticationPort` set to `unset` and no identity tables. TDA-IMP-M1-001 requires an approved identity mechanism before authentication integration. TDA-IMP-M0-002 and TDA-SEC-001 require a managed authentication provider behind an application authorization boundary; the exact vendor is an open decision (TDA-SEC-001 ADR-SEC-001).

Controlled documents already describe:

- Organization as the tenant root (TDA-DDD-001-D01)
- Platform-level users with organization/branch memberships (TDA-DDD-001-D01)
- Multi-tenant SaaS supporting single clinics through enterprise groups (TDA-PRD-BRD-001 §15)
- IAM-FR-001…005: identity, RBAC, sessions, MFA capability, tenant isolation (TDA-FRS-001)
- Default-deny RBAC, object-level authorization, server-derived tenant context (TDA-SEC-001)

No APPROVED/BASELINED document contradicts those identity rules. TDA-TDD-001 FastAPI/Python stack direction is already recorded as superseded for this repository by TDA-ADR-001 and is not reopened here.

This ADR defines the **identity architecture**. It does not implement authentication, migrations, or domain features.

## 6. Problem Statement

M1 cannot safely start while these questions are only implicit:

- What is a user versus a membership versus a tenant?
- Is the product a single practice or multi-tenant?
- Who authenticates the human, and who authorizes the action?
- Which roles and permissions exist for the current delivery phase?
- How is BOLA/IDOR prevented?
- What may a practice administrator never do?
- What identity does the notification worker use?

Without answers, implementation would invent a custom password system, trust `organizationId` from the client, or collapse identity into a single table.

## 7. Identity Model

These concepts are distinct. They must not be collapsed into one `User` table.

| Concept                    | Meaning                                                                                   | Persistence (Foundation DDD)                                        | Notes                                                            |
| -------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | ---------------------------------------------------------------- |
| **User**                   | Platform-level person record used by the application                                      | `users`                                                             | Exists independently of a tenant (DDD exception E01)             |
| **Identity**               | Authenticated subject (human or service) presented to application services as a principal | Derived at runtime; linked to `users` or a service identity         | Never taken from an unverified client claim alone                |
| **Authentication account** | Credential/account in the **managed identity provider**                                   | Provider-owned; application stores only a stable subject identifier | Passwords/tokens are not stored in plaintext in this application |
| **Tenant / Organization**  | Isolation and ownership root                                                              | `organizations`                                                     | Primary tenant boundary                                          |
| **Branch**                 | Physical/operational location inside one organization                                     | `branches`                                                          | Not a tenant; optional membership scope                          |
| **Membership**             | User’s authorized relationship to an organization (and optional branch)                   | `memberships`                                                       | Grants tenant access; status-controlled                          |
| **Role**                   | Named bundle of permissions in a membership or platform context                           | `roles`, `membership_roles`                                         | Cannot bypass server authorization                               |
| **Permission**             | Atomic capability                                                                         | `permissions`, `role_permissions`                                   | Stable string keys; independent of UI screens                    |
| **Session**                | Authenticated session lifecycle                                                           | Provider session and/or `user_sessions` metadata                    | Revocation required (IAM-FR-003)                                 |
| **Service identity**       | Non-human workload identity                                                               | Configuration / secret manager; not a human membership              | Least privilege; does not inherit human roles                    |

Invariant: **Identity ≠ membership ≠ role ≠ permission ≠ tenant.**

A user may hold multiple memberships (TDA-DDD-001-D01 §8). Business data is never shared across organizations through that fact alone.

## 8. Tenant Model

### Options evaluated

| Option                                 | Description                                                                   | Fit to controlled documents                                                     |
| -------------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| A — Single dental practice             | One implicit tenant; no organization isolation                                | Conflicts with BRD-015, IAM-FR-005, DDD organization root, SEC-001 tenant tests |
| B — Multi-practice / multi-tenant SaaS | Organization is tenant; data isolated per organization                        | Matches BRD-015, FRS IAM-FR-005, DDD §6, SEC-001 §7                             |
| C — Hybrid                             | Multi-tenant architecture that can deploy a single clinic as one organization | Matches BRD-015 “single clinics through enterprise dental groups”               |

### Decision

**Option C as product deployment, Option B as architecture:**

The authoritative tenancy model is **multi-tenant organization isolation**.

- `organizations` is the tenant root.
- A single dental practice is **one organization** (possibly one branch). That is a deployment subset, not a different security model.
- Multi-chair / multi-location clinics are **one organization, many branches**.
- Enterprise groups / DSOs / franchises may use multiple organizations; cross-organization data access is prohibited except for explicitly authorized platform operations (DDD §6).
- Cross-branch reporting inside one organization is allowed only when membership/authorization grants that branch scope (BRD-015).

This is not an invented commercial requirement. TDA-PRD-BRD-001 §15 already states a cloud-native multi-tenant SaaS with tenant-aware isolation.

### Tenant context establishment

```
Authenticated identity
      ↓
Membership lookup (server-side)
      ↓
Tenant context (organization_id [+ authorized branch_ids])
      ↓
Authorization policy (roles → permissions + object checks)
      ↓
Resource access (tenant-scoped query + BOLA check)
```

Rules:

- Tenant context is derived from authenticated identity and **active membership**, not from a client-supplied `tenantId` / `organizationId` / role / permission.
- A client may **request** an organization/branch switch. The server accepts it only after verifying an active membership for that user in that organization (and branch, if scoped).
- Controllers must not choose tenant context from arbitrary payload fields (TDA-IMP-M1-001 §7).
- Every tenant-owned query includes tenant authorization (TDA-SEC-001 §7).
- Background workers carry explicit tenant context on each work item.

## 9. Authentication Boundary

```
Client
  → Managed identity provider (authentication)
  → Application API boundary (token/session validation)
  → Normalized principal
  → Tenant context
  → Authorization
  → Application / domain services
```

### Application owns

- Principal mapping (provider subject → `users.id`)
- Membership, role, permission evaluation
- Tenant context
- Object-level authorization
- Audit of security-relevant application actions

### Provider owns (behind the port)

- Credential verification
- MFA challenges where enrolled
- Login/logout/session issuance according to its model
- Password reset / recovery if the selected provider uses passwords
- Email verification of the authentication account

### Rules

- Do **not** implement a custom password store in this application (TDA-IMP-M0-002, TDA-ADR-001).
- The provider must be replaceable through `AuthenticationPort` (M0 boundary).
- Protected APIs require authenticated identity unless explicitly documented as public (health/status may remain public).
- Authentication failures must not enumerate accounts (TDA-SEC-001 §5).
- Raw credentials and tokens are not persisted in plaintext (TDA-DDD-001-D01 §23).
- MFA capability is required for applicable accounts and administrative roles (IAM-FR-004). Exact MFA policy remains TDA-SEC-001 ADR-SEC-002.

## 10. Authorization Model

**Default deny. Least privilege. Server-side only.**

1. Unauthenticated → 401 (or approved equivalent).
2. Authenticated but no applicable membership/permission → 403 or safe 404 per TDA-SEC-001 / TDA-API-001 (do not leak resource existence across tenants).
3. Permission check uses **permission keys**, not UI screen names.
4. Role assignment is insufficient without object-level checks where a resource has an owner or tenant.
5. UI hiding is never a security control.
6. Feature flags are not an authorization substitute (TDA-DDD-001-D01 §11).
7. Database constraints complement authorization; they do not replace it.

Authorization evaluation order:

1. Valid authenticated principal
2. Active membership in the tenant (humans) or trusted service grant (workers)
3. Permission for the operation
4. Object-level policy for the target resource
5. Then application service / repository

## 11. Roles

Minimum roles for the current delivery phase (identity, tenant, patient, appointment, notification operations). Fine-grained occupational titles from the BRD (cashier, hygienist, inventory manager, etc.) are **not** seeded now; they may be added later as additional roles without changing this model.

| Role key         | Purpose                              | Tenant relationship                                                                        | Allowed (high level)                                                                                                            | Prohibited                                                                                |
| ---------------- | ------------------------------------ | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `PATIENT`        | Person receiving care                | Membership in the organization that holds their patient record, or equivalent patient-link | Own profile, own authorized appointments/preferences                                                                            | Other patients; staff/admin functions; tenant-wide search; notification retry; audit read |
| `STAFF`          | Reception / operational clinic staff | Organization; optional branch scope                                                        | Patient registration/search in tenant; scheduling operational actions permitted by permissions                                  | Cross-tenant access; platform administration; treating UI-hidden actions as allowed       |
| `PRACTITIONER`   | Dentist/clinician                    | Organization; authorized clinical/branch scope                                             | Appointment lifecycle actions permitted by permissions; authorized patient access in tenant                                     | Other tenants; security.manage; becoming SYSTEM_ADMIN via practice tools                  |
| `PRACTICE_ADMIN` | Organization administrator           | One organization (not platform)                                                            | Organization configuration, membership/role assignment **within that organization**, audit read for that tenant where permitted | Global/platform administration; other organizations; granting themselves `SYSTEM_ADMIN`   |
| `SYSTEM_ADMIN`   | Platform administrator               | Platform scope; not an ordinary membership privilege                                       | Break-glass platform operations, tenant lifecycle support, security administration                                              | Use as a daily clinic role; silent use without audit                                      |

`PRACTICE_ADMIN` never implies `SYSTEM_ADMIN`.

Worker/service actors are **not** human roles. They use service identities (§14).

## 12. Permissions

Permissions are stable keys, independent of screens. M1 seeds the **catalog and evaluation engine**. Domain endpoints bind keys in M2–M4. Keys below are taken from TDA-API-001, TDA-SEC-001, and TDA-IMP-M1-001 — not invented screens.

### Patient (TDA-API-001 §20)

| Key                         | Meaning                                             |
| --------------------------- | --------------------------------------------------- |
| `patient.create`            | Create patient in tenant                            |
| `patient.read.self`         | Read own patient record                             |
| `patient.read.tenant`       | Read tenant patient records authorized to the actor |
| `patient.update.self`       | Update own allowed profile fields                   |
| `patient.update.tenant`     | Update tenant patient records (contacts included)   |
| `patient.preference.update` | Update preferences/consent                          |
| `patient.archive`           | Archive patient (no destructive delete)             |

Patient merge, if implemented later, requires a distinct elevated permission (`patient.merge`) per TDA-API-001 §9. It is **not** granted by `patient.update.tenant`.

### Appointment (TDA-API-001 §21)

| Key                       | Meaning                                      |
| ------------------------- | -------------------------------------------- |
| `appointment.create`      | Create appointment                           |
| `appointment.read.self`   | Read own appointments                        |
| `appointment.read.tenant` | Read tenant appointments in authorized scope |
| `appointment.confirm`     | Confirm                                      |
| `appointment.reschedule`  | Reschedule                                   |
| `appointment.cancel`      | Cancel                                       |
| `appointment.check_in`    | Check in                                     |
| `appointment.start`       | Start                                        |
| `appointment.complete`    | Complete                                     |
| `appointment.no_show`     | Record no-show                               |

### Notification (TDA-API-001 §23; M4)

| Key                  | Meaning                                               |
| -------------------- | ----------------------------------------------------- |
| `notification.read`  | Read notification/outbox status for authorized tenant |
| `notification.retry` | Privileged retry/replay                               |

Template management permissions belong to M4 if the Notification API requires them; they are not required to seed M1.

### Foundation / security (M1)

| Key                 | Meaning                                           |
| ------------------- | ------------------------------------------------- |
| `organization.read` | Read own tenant profile                           |
| `membership.manage` | Manage memberships in the actor’s organization    |
| `role.assign`       | Assign roles within the actor’s organization      |
| `audit.read`        | Read audit events in authorized tenant            |
| `security.manage`   | Platform security administration (`SYSTEM_ADMIN`) |

Indicative role → permission mapping (default deny; unused keys remain denied):

| Permission                                                               | PATIENT | STAFF | PRACTITIONER | PRACTICE_ADMIN | SYSTEM_ADMIN |
| ------------------------------------------------------------------------ | ------- | ----- | ------------ | -------------- | ------------ |
| `patient.read.self`                                                      | Y       |       |              |                |              |
| `patient.update.self`                                                    | Y       |       |              |                |              |
| `patient.preference.update`                                              | Y       | Y     | Y            | Y              |              |
| `patient.create`                                                         |         | Y     | Y            | Y              |              |
| `patient.read.tenant`                                                    |         | Y     | Y            | Y              |              |
| `patient.update.tenant`                                                  |         | Y     | Y            | Y              |              |
| `patient.archive`                                                        |         |       |              | Y              |              |
| `appointment.read.self`                                                  | Y       |       |              |                |              |
| `appointment.read.tenant`                                                |         | Y     | Y            | Y              |              |
| `appointment.create`                                                     |         | Y     | Y            | Y              |              |
| `appointment.confirm` / `reschedule` / `cancel` / `check_in` / `no_show` |         | Y     | Y            | Y              |              |
| `appointment.start` / `complete`                                         |         |       | Y            | Y              |              |
| `notification.read`                                                      |         |       |              | Y              | Y            |
| `notification.retry`                                                     |         |       |              |                | Y            |
| `membership.manage` / `role.assign`                                      |         |       |              | Y (own org)    | Y            |
| `audit.read`                                                             |         |       |              | Y (own org)    | Y            |
| `security.manage`                                                        |         |       |              |                | Y            |

This matrix is architecture, not seed SQL. M1 must encode evaluation; M2–M4 bind endpoints. Exact seed may tighten permissions but must not loosen TDA-SEC-001.

## 13. Object-Level Authorization

BOLA/IDOR protection is mandatory (TDA-SEC-001 §4/§24, TDA-API-001 §27, TDA-IMP-M1-001).

Server-side checks on every resource access:

1. Actor is authenticated.
2. Resource’s `organization_id` matches the trusted tenant context (for tenant-owned resources).
3. Actor has the operation permission.
4. Additional object policy:
   - **Patient A** must not read/update **Patient B** unless tenant permission and policy allow (staff/practitioner), never by guessing IDs.
   - **Practice A** must not access **Practice B**.
   - Staff in Organization A must not access Organization B resources.
   - An appointment of Organization A must not be readable via a guessed ID from Organization B.
   - Patient actors are limited to **self** object scope even when the ID is valid.

Cross-tenant denial uses safe 404/403 semantics from TDA-API-001 (do not confirm foreign resource existence).

Tests required before M1 exit: M1-TEN-001, M1-TEN-002, M1-SEC-001, M1-SEC-002 (TDA-IMP-M1-001). Domain BOLA tests are added with M2/M3 endpoints.

## 14. Service Identities

| Identity            | Purpose                                    | Privilege                                                                                                                        |
| ------------------- | ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| Web/API runtime     | Serve authenticated human requests         | Database DML as application role; no schema-owner rights in production                                                           |
| Notification worker | Claim/process outbox after commit          | Outbox/notification tables and provider secrets only; **no** human RBAC; no SMTP/Twilio inside originating business transactions |
| CI/CD               | Install, test, build, migrate in pipelines | Non-production credentials; no production secrets in the repository                                                              |
| Migration runner    | Apply Prisma migrations                    | Schema credentials separated from runtime where practical (TDA-SEC-001 §13)                                                      |

Service identities must not inherit `PRACTICE_ADMIN` or `SYSTEM_ADMIN`. Worker authorization is an internal workload grant (`notification.process` or equivalent service permission), not a cloned human role.

## 15. Account Lifecycle

Architecture only — not workflows to implement in this task.

| Event                          | Architecture rule                                                                                                      |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| Registration                   | Creates/links provider authentication account and application `users` row; tenant membership is explicit, not implicit |
| Email verification             | Provider-owned for the authentication account; application may record verified state                                   |
| Mobile verification            | Only if a later approved requirement mandates it; not required by current IAM-FR set                                   |
| Login                          | Provider authenticates; application establishes principal + tenant context from membership                             |
| Logout                         | Provider session end + application session revocation (IAM-FR-003)                                                     |
| Session expiry                 | Idle/absolute limits per provider + application metadata; expired session cannot pass authorization                    |
| Password reset                 | Provider-owned if passwords exist; application never stores reset secrets                                              |
| Lock / suspension              | Membership and/or user status deactivate access without destroying audit history                                       |
| Role changes                   | `role.assign` in-tenant or `security.manage` on platform; audited                                                      |
| Membership changes             | `membership.manage`; deactivation preferred over destructive delete (DDD §16)                                          |
| Account deactivation           | Soft status; RESTRICT/controlled archive rather than cascade into clinical/financial history                           |
| Practitioner/staff offboarding | Deactivate memberships, revoke sessions, retain audit; do not delete historical appointment attribution unsafely       |

## 16. Administrative Model

|               | Practice Administrator                                          | System Administrator                          |
| ------------- | --------------------------------------------------------------- | --------------------------------------------- |
| Scope         | One organization                                                | Platform                                      |
| Typical actor | Clinic owner / org admin                                        | Vendor/platform operator                      |
| Can assign    | Roles inside own organization                                   | Platform roles and break-glass tenant support |
| Cannot        | Become `SYSTEM_ADMIN` through practice UI; access other tenants | Use this role as a routine clinic login       |
| Audit         | All membership/role/config changes                              | All platform privileged actions               |

Administrative actions are audited (TDA-SEC-001 §15). High-risk administrative operations should use stronger authentication (MFA) where the selected provider permits (TDA-SEC-001 §5).

## 17. Audit Requirements

Audit **application** events (append-oriented `audit_events` / `security_events` per DDD). Do not log secrets or full notification bodies.

Must audit:

- Login failure and privileged login success where the application can observe them without duplicating provider secrets
- Logout / session revocation initiated by the application
- Role assignment and membership create/deactivate
- Account/membership suspension
- `security.manage` and platform tenant operations
- Material patient mutations (M2; PAT-FR-004)
- Material appointment lifecycle mutations (M3; APT-FR-003) inside the same DB transaction as history/outbox
- Privileged notification retry/replay (M4)

Do not audit every successful `patient.read.self` as a default; list/read noise is not required unless a later privacy policy demands it. Authorization failures are logged safely without leaking the target resource.

Audit records include actor/service identity, tenant, action, target, timestamp, correlation ID (TDA-SEC-001 §15, TDA-IMP-M1-001 §10). Audit writes for domain mutations participate in the same transaction as the mutation.

## 18. Provider Evaluation

TDA-SEC-001 already records **ADR-SEC-001 — Exact authentication provider/mechanism** as open. This ADR does **not** pick a vendor.

### Required provider capabilities (architecture fit)

- Replaceable behind `AuthenticationPort`
- MFA support for administrative roles
- Session or token issuance that the application can validate server-side
- Email verification
- Revocation or equivalent session invalidation
- No requirement that the application store passwords
- India-usable and globally operable deployments (primary market India; BRD) — **availability is a procurement check, not a vendor pick here**
- Data/privacy review against DPDP readiness (engineering baseline, not legal advice)

### Categories compared (not a vendor bake-off)

| Category                                                   | Security / MFA                      | Tenant/RBAC                  | Lock-in                  | Fit                                               |
| ---------------------------------------------------------- | ----------------------------------- | ---------------------------- | ------------------------ | ------------------------------------------------- |
| Custom password system in-app                              | Weak unless a full IdP is rebuilt   | App-owned                    | Low vendor, high risk    | **Rejected** (M0-002 / SEC-001)                   |
| Managed OIDC/OAuth2 IdP (commercial)                       | Strong if MFA/session features used | App still owns authorization | Medium                   | **Preferred category**                            |
| Self-hosted IdP (e.g. OIDC server operated by the project) | Strong if operated well             | App owns authorization       | Lower vendor, higher ops | Acceptable alternative if operations are approved |
| Social-login-only                                          | Weak for clinic staff/admin MFA     | Poor practice IAM            | Medium                   | **Rejected** as the sole mechanism                |

### Decision

**Selected category:** managed (or equivalently operated) OIDC-compatible identity provider behind the application authentication boundary.

**Vendor:** **not selected**. Requires a separate ADR (TDA-ADR-003 / TDA-SEC-001 ADR-SEC-001) with cost, India/region data handling, MFA product SKU, and operational ownership evidence.

M1 may implement the port, principal, tenant context, and RBAC engine. M1 must not add a vendor SDK until TDA-ADR-003 is approved.

## 19. Alternatives Considered

| Alternative                                      | Outcome                                                                                     |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| Single-practice implicit tenant                  | Rejected; contradicts BRD-015, IAM-FR-005, DDD                                              |
| Collapse user + membership + role into one table | Rejected; DDD §8 Identity ≠ membership ≠ role                                               |
| Custom password tables as the IdP                | Rejected; M0-002 / this ADR                                                                 |
| Trust `organizationId` header/body as tenant     | Rejected; SEC-001 / M1-TEN-002                                                              |
| PRACTICE_ADMIN includes platform admin           | Rejected; task and DDD platform role isolation                                              |
| Pick Auth0/Cognito/Clerk/Firebase in this ADR    | Rejected; insufficient procurement/privacy evidence; SEC-001 lists a dedicated provider ADR |

## 20. Consequences

After approval:

- M1 implements Foundation identity tables from TDA-DDD-001-D01 that this model requires (organizations, branches, users, memberships, roles, permissions, sessions metadata, audit/security events) **without** Patient/Appointment/Notification business tables.
- Subscriptions/feature flags exist in DDD but are entitlement/config; they are not required to authenticate. They may be deferred if M1 remains minimal, but tenant/user/membership/role/permission/audit cannot.
- All later APIs use server-derived tenant context and permission keys in this catalog.
- Introducing a custom password IdP or removing tenant isolation is a new C3 change.

## 21. Risks

- Exact IdP vendor is still open; M1 cannot complete provider integration until TDA-ADR-003.
- BRD/FRS/DDD/SEC are REVIEW, not BASELINED; human approval of this ADR is required.
- MFA policy details (which roles, which factors) remain ADR-SEC-002.
- Cross-branch vs cross-organization rules must not be confused in implementation.
- Safe 404 vs 403 for cross-tenant reads must stay consistent to avoid user enumeration.

## 22. Open Decisions

| Decision                                        | Owner ADR / freeze                                         |
| ----------------------------------------------- | ---------------------------------------------------------- |
| Exact authentication vendor/product             | TDA-ADR-003 / ADR-SEC-001 — before M1 provider integration |
| MFA policy for privileged users                 | ADR-SEC-002 — before production admin go-live              |
| Exact RBAC seed beyond this architecture matrix | ADR-SEC-003 / M1 seed review                               |
| Session duration / idle timeout numbers         | Provider + security review; not invented here              |
| Mobile/phone verification mandate               | Not in current IAM-FR; future requirement                  |
| Data retention/deletion schedule                | ADR-SEC-004                                                |
| Encryption/key management product               | ADR-SEC-005                                                |
| Hosting, DNS, production Postgres topology      | TDA-ADR-001 open list                                      |

## 23. Relationship to M1

TDA-IMP-M1-001 stop condition: authentication mechanism must be defined by approved architecture/ADR.

This ADR defines the **mechanism category and application boundary**. It does **not** name the vendor.

M1 after this ADR is approved may:

- Persist Foundation identity/tenant/RBAC/audit schema from DDD
- Implement trusted tenant context and default-deny permission checks
- Keep `AuthenticationPort` and add an OIDC-shaped adapter **only after** TDA-ADR-003
- Add M1-SEC-_ and M1-TEN-_ tests

M1 must not:

- Implement Patient/Appointment/Notification business features
- Add vendor SDKs before TDA-ADR-003
- Create a custom password system
- Trust client tenant/role/permission fields

## 24. Approval Requirements

| Role                        | Action                                                         |
| --------------------------- | -------------------------------------------------------------- |
| Architect / Technical Owner | Approve identity and tenant model                              |
| Security reviewer           | Confirm default deny, BOLA, tenant isolation, admin split      |
| Human product owner         | Confirm multi-tenant SaaS reading of BRD-015 for this delivery |
| Cursor                      | Must not self-approve; must not implement auth in this task    |

## 25. Change History

| Version | Date           | Change                                                                     |
| ------- | -------------- | -------------------------------------------------------------------------- |
| 1.0     | 14 August 2026 | Initial identity/authz/tenant ADR; provider vendor deferred to TDA-ADR-003 |
