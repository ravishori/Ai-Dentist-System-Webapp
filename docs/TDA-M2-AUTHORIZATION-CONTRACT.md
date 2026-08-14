# TDA-M2 Authorization Contract

Version: 1.0  
Date: 14 August 2026  
Status: Implemented in code; production tenant data and role assignment remain human-owned

This milestone is the **authorization / organization-tenant foundation** deferred from TDA-ADR-002 / `docs/ADR-FOLLOWUP-M1.md`. It is **not** TDA-IMP-M2-001 Patient Domain.

## Implemented

```
Authenticated session (M1)
        ↓
Application userId
        ↓
Requested organization (untrusted)
        ↓
AuthorizationPort.authorize()
        ↓
User status + membership + roles + permissions
        ↓
Allow / Deny (default deny)
```

## AuthorizationPort

Location: `packages/domain/src/foundation/authorization-port.ts`

`authorize(request)` is the only operation. It answers whether a **session-derived** `userId` may perform a **permission key** in a **requested organization**.

The port does not accept Cognito types, JWT libraries, cookies, Prisma, or Next.js objects.

Client-supplied `role`, `permission`, and `userId` values never grant access. Email is not an authorization key.

## Organization / tenant model

- `organizations` is the tenant root (TDA-ADR-002 Option B architecture / Option C deployment).
- `branches` exist as optional membership scope. M2 evaluation is organization-scoped.
- A user is not a tenant. Membership is explicit, never implied by login.

## Membership model

`memberships` uniquely pair `userId` + `organizationId`.

Statuses: `active` | `inactive` | `revoked`. Inactive and revoked memberships deny. Destructive delete is not used (`ON DELETE RESTRICT`).

## RBAC model

Roles and permissions are a server-side catalog.

Tenant roles: `PATIENT`, `STAFF`, `PRACTITIONER`, `PRACTICE_ADMIN`  
Platform role: `SYSTEM_ADMIN` via `user_platform_roles` (not an ordinary membership privilege)

Foundation permission keys (TDA-ADR-002 §12):

| Key                 | Scope    |
| ------------------- | -------- |
| `organization.read` | tenant   |
| `membership.manage` | tenant   |
| `role.assign`       | tenant   |
| `audit.read`        | tenant   |
| `security.manage`   | platform |

Patient/Appointment/Notification permission keys are **deferred**.

## Authorization decision flow

1. Session principal required (`userId` from M1 session).
2. Session/user mismatch → deny.
3. Permission must be a known foundation key.
4. User must exist and be `active`.
5. `security.manage` requires platform `SYSTEM_ADMIN`.
6. Other keys require a requested organization that exists and is `active`.
7. Platform `SYSTEM_ADMIN` may exercise foundation tenant permissions against an existing organization (break-glass).
8. Otherwise an **active** membership in that organization is required.
9. Tenant role keys on the membership are resolved to permissions. Unknown-only roles deny.
10. Missing permission → deny.
11. Lookup errors → deny (`lookup_failure`).

## Route integration

`GET /api/authz/organization`

- Public `/` is unchanged.
- No session → 401.
- Session without a valid membership/permission → 403.
- Valid membership + `organization.read` → 200 `{ allowed: true, organizationId }`.
- Organization is requested via `x-organization-id` or `organizationId` query and **verified server-side**.

## Deferred

- Patient/Appointment/Notification domains and their permission keys
- Membership/role mutation APIs and admin UI
- Object-level BOLA for clinical resources
- Security-event **writes** on every decision (table exists)
- Branch-scoped evaluation
- Global route protection
- Production role assignment

## Human decision required

- MFA policy (ADR-SEC-002)
- Whether SYSTEM_ADMIN break-glass tenant access without membership should be narrowed
- Exact RBAC seed beyond the foundation matrix (ADR-SEC-003)
- Patient domain numbering vs this authorization increment (TDA-IMP-M2-001 remains Patient)

## Future milestone

Clinical workflows, billing, notifications, dashboards.
