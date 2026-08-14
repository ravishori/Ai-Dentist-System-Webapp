# TDA M2 Authorization & Organization/Tenant Implementation Report

## Status

**M2 COMPLETE** (authorization foundation). Patient/clinical work is **not** started.

This increment is the deferred Foundation RBAC/tenant work from TDA-ADR-002 / `docs/ADR-FOLLOWUP-M1.md`. It is **not** TDA-IMP-M2-001 Patient Domain.

M1 authentication commits were not rewritten.

## Approved ADRs

Implemented against TDA-ADR-002 (identity/tenant/RBAC) and TDA-ADR-003 (Cognito remains IdP-only). ADR markdown under `docs/adr/` was not edited.

## Files created

- `packages/domain/src/foundation/authorization-port.ts`
- `packages/domain/src/foundation/permissions.ts`
- `packages/domain/src/foundation/roles.ts`
- `packages/application/src/foundation/authz/*`
- `packages/db/src/authz-stores.ts`
- `packages/db/prisma/migrations/20260814180000_m2_organization_authorization/migration.sql`
- `apps/web/src/infrastructure/authz/port.ts`
- `apps/web/src/app/api/authz/organization/route.ts`
- `docs/TDA-M2-AUTHORIZATION-CONTRACT.md`
- `docs/ADR-FOLLOWUP-M2.md`
- this report

## Files modified

Domain/application/db indexes and Prisma schema; health/worker milestone; landing page copy; README; technology stack; source-of-truth last paragraph; Cursor rules; e2e smoke tests.

M1 authentication adapter, port, and migration were not redesigned.

## AuthenticationPort

Unchanged. Cognito remains behind `AuthenticationPort`.

## AuthorizationPort

`packages/domain/src/foundation/authorization-port.ts`

`authorize(request) → AuthorizationDecision` (default deny).

Evaluator: `packages/application/src/foundation/authz/rbac-adapter.ts` (`RbacAuthorizationAdapter`).

## Organization / tenant model

`organizations` is the tenant root. `branches` exist as optional scope. A user is not a tenant.

## Membership model

`memberships`: unique `(userId, organizationId)`, statuses `active` / `inactive` / `revoked`, `ON DELETE RESTRICT`. Login does not create membership.

## RBAC model

Catalog roles: `PATIENT`, `STAFF`, `PRACTITIONER`, `PRACTICE_ADMIN` (tenant); `SYSTEM_ADMIN` (platform via `user_platform_roles`).

Foundation permissions: `organization.read`, `membership.manage`, `role.assign`, `audit.read`, `security.manage`.

## Route integration

`GET /api/authz/organization` — session required; organization requested via `x-organization-id` and verified server-side. Public `/` remains public.

## Tests

`packages/application/src/foundation/authz/authorization.security.test.ts` (27 cases) covering the required unauthenticated/membership/RBAC/tenant/fail-closed scenarios, plus schema SQL constraints. Playwright asserts unauthenticated 401 on the probe.

## Database

Additive migration `20260814180000_m2_organization_authorization`:

- `organizations`
- `branches`
- `memberships`
- `roles`
- `permissions`
- `role_permissions`
- `membership_roles`
- `user_platform_roles`
- `security_events`

No Patient/Appointment/Notification tables. No CASCADE deletes. Catalog seed only (no production users).

## Security properties

- Unauthenticated / invalid session → deny
- Disabled user → deny
- Missing/inactive/revoked membership → deny
- Cross-tenant membership does not authorize
- Client roles/permissions/userId do not grant access
- Unknown role/permission → deny
- Lookup failure → deny
- Default deny; errors are never allow
- Email is not the authorization key
- Cognito groups are not used

## Validation

| Gate           | Command                 | Result          |
| -------------- | ----------------------- | --------------- |
| Tests          | `pnpm test`             | PASS (69 tests) |
| Lint           | `pnpm lint`             | PASS            |
| Format         | `pnpm format:check`     | PASS            |
| Typecheck      | `pnpm typecheck`        | PASS            |
| DB validation  | `pnpm db:validate`      | PASS            |
| Build          | `pnpm build`            | PASS            |
| Security audit | `pnpm security:audit`   | PASS            |
| Secrets        | `pnpm security:secrets` | PASS            |
| E2E            | `CI=true pnpm test:e2e` | PASS (3 tests)  |

## Deferred

- Patient/Appointment/Notification domains and permission keys
- Membership/role mutation APIs and admin UI
- Clinical object-level BOLA
- Security-event writes on every probe
- Branch-scoped evaluation
- Global middleware
- Production role assignment

## Open decisions

See `docs/ADR-FOLLOWUP-M2.md`: SYSTEM_ADMIN break-glass without membership; TDA-IMP-M2-001 numbering; MFA policy; RBAC seed beyond foundation keys.

## Production readiness

M2 is not production-ready unless all production prerequisites have been independently reviewed and approved by the human.

No production Cognito, DNS, deploy, or credentials were created.

## Git

Branch: `cursor/m2-authorization-foundation-3efc` (from frozen M1 `75e27f3`). M1 commits intact.

| Commit                      | Message                                                     |
| --------------------------- | ----------------------------------------------------------- |
| `c60b6f6`                   | `feat(authz): add organization and membership foundation`   |
| `1a31f33`                   | `feat(authz): add authorization port and policy evaluation` |
| `b35117e`                   | `test(authz): add authorization security coverage`          |
| (this documentation commit) | `docs(authz): document m2 authorization foundation`         |

Working tree after this series: clean. PR created for this branch; not merged.
