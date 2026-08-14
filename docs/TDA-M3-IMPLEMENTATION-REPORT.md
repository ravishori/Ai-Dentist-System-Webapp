# TDA-M3 Implementation Report

**Milestone:** M3 Patient Domain Foundation  
**Date:** 2026-08-14  
**Status:** Implemented on the M3 feature branch; **not production-ready**  
**Depends on:** M0, M1 (`feat(auth)`), M2 (`feat(authz)`)  
**Does not redesign:** M1 authentication, M2 authorization evaluator

---

## 1. What was implemented

M3 adds organization-scoped patient identity on top of the frozen M1 session and M2 `AuthorizationPort`.

```text
HTTP /api/patients
        ↓
M1 session (AuthenticationPort)
        ↓
M2 AuthorizationPort.authorize(userId, organizationId, permission)
        ↓
PatientApplicationService
        ↓
PatientRepository (organizationId + patientId)
        ↓
patients table
```

---

## 2. Files created

### Domain

- `packages/domain/src/patient/patient.ts`
- `packages/domain/src/patient/patient-repository.ts`
- `packages/domain/src/patient/index.ts`

### Application

- `packages/application/src/patient/validation.ts`
- `packages/application/src/patient/service.ts`
- `packages/application/src/patient/http.ts`
- `packages/application/src/patient/in-memory-repository.ts`
- `packages/application/src/patient/index.ts`
- `packages/application/src/patient/patient.security.test.ts`

### Persistence

- `packages/db/prisma/migrations/20260814190000_m3_patient_identity/migration.sql`
- `packages/db/src/patient-store.ts`

### HTTP

- `apps/web/src/app/api/patients/route.ts`
- `apps/web/src/app/api/patients/[patientId]/route.ts`
- `apps/web/src/infrastructure/patient/service.ts`
- `apps/web/src/infrastructure/http/organization.ts`

### Documentation

- `docs/TDA-M3-PATIENT-CONTRACT.md`
- `docs/TDA-M3-IMPLEMENTATION-REPORT.md`
- `docs/ADR-FOLLOWUP-M3.md`

---

## 3. Files modified

- `packages/domain/src/foundation/permissions.ts` — patient permission keys
- `packages/application/src/foundation/authz/rbac-adapter.ts` — `isApplicationPermission`
- `packages/application/src/foundation/authz/in-memory-directory.ts` — staff role grants
- `packages/application/src/foundation/authz/authorization.security.test.ts` — unknown-permission example
- `packages/db/prisma/schema.prisma` — `Patient` model
- `packages/db/src/index.ts`
- `apps/web/src/app/api/authz/organization/route.ts` — shared org-header helper
- `apps/web/src/app/api/health/route.ts` — milestone `M3`
- `apps/web/src/instrumentation.ts` — milestone `M3`
- `apps/web/src/app/layout.tsx` / `page.tsx` — M3 shell copy
- `apps/worker/src/runtime.ts` — milestone `M3`
- `packages/contracts/src/index.ts` — milestone union
- `tests/e2e/smoke.spec.ts` — health `M3` + unauthenticated patients `401`
- `packages/db/prisma/migrations/README.md`
- `README.md`
- `.cursor/rules/00-dentalcare-master.mdc`
- `docs/architecture/TECHNOLOGY-STACK.md`
- `docs/governance/SOURCE-OF-TRUTH-MANIFEST.md`
- `docs/governance/M0-BASELINE-EVIDENCE.md`

M1 and M2 Prisma migrations were **not** modified.

---

## 4. Domain objects

- `Patient` — identity, demographics, contact, lifecycle
- `PatientStatus` — `active` | `inactive`
- `PatientCreateInput` / `PatientUpdateInput`
- `PatientRepository` — organization-scoped only

Invariants:

- organization association required
- identifiers immutable
- date of birth is a past-or-today calendar date
- status is a closed set
- no Cognito / clinical fields

---

## 5. Application services

- `PatientApplicationService` — create, list, get, update
- HTTP handlers — authentication first, then validation, then authorization, then persistence
- DTOs — `toPublicPatient` (no Prisma types on the wire)

---

## 6. Authorization changes

Evaluator still uses `AuthorizationPort`. Unknown keys remain deny.

New keys recognized by `isApplicationPermission`:

- `patient.create`
- `patient.read.tenant`
- `patient.update.tenant`
- `patient.archive`

SYSTEM_ADMIN still receives only foundation tenant permissions (`organization.read`, `membership.manage`, `role.assign`, `audit.read`, `security.manage`). Patient APIs deny SYSTEM_ADMIN without a staff membership that grants patient permissions.

---

## 7. Database

Additive migration `20260814190000_m3_patient_identity`:

- table `patients`
- FK `organizationId` → `organizations.id` **ON DELETE RESTRICT**
- index `patients_organizationId_idx`
- check `patients_status_check` (`active` | `inactive`)
- seeds the four patient permissions and role_permissions for STAFF / PRACTITIONER / PRACTICE_ADMIN

Prisma updates use `updateMany` with `{ id, organizationId }` so a mismatched organization cannot mutate a row.

---

## 8. Tests

`packages/application/src/patient/patient.security.test.ts` covers:

1. authorized create/read/list/update
2. cross-tenant GET / UPDATE / LIST
3. forged patient id
4. forged / tampered organization header
5. missing membership
6. revoked membership
7. disabled user
8. PATIENT role (no tenant patient APIs)
9. STAFF cannot archive (missing `patient.archive`)
10. SYSTEM_ADMIN without membership
11. nonexistent patient
12. malformed patient id
13. repository failure
14. authorization lookup failure
15. unauthenticated create
16. ownership fields rejected on create/update
17. deny bodies do not leak PII

E2E: unauthenticated `GET /api/patients` returns `401`.

---

## 9. Security assumptions

- M1 session cookie remains the only browser session.
- Organization context is server-validated through membership + permission.
- Patient queries always include `organizationId`.
- Cross-tenant reads look like not-found.
- Patient PII is not written to ordinary logs.
- `security_events` is not written per patient API call (deferred audit policy).

---

## 10. Known limitations

- No hard delete, merge, or duplicate detection.
- No patient portal.
- No branch-scoped patients.
- No clinical data on the patient entity.
- No per-mutation audit trail.
- No optimistic locking.
- Cognito Hosted UI still uses placeholder domains until human AWS setup.

---

## 11. Validation

| Gate | Command | Result |
|---|---|---|
| Tests | `pnpm test` | PASS (94 tests) |
| Lint | `pnpm lint` | PASS |
| Format | `pnpm format:check` | PASS |
| Typecheck | `pnpm typecheck` | PASS |
| DB validation | `pnpm db:validate` | PASS |
| Build | `pnpm build` | PASS (`/api/patients`, `/api/patients/[patientId]`) |
| Security audit | `pnpm security:audit` | PASS (no known vulnerabilities) |
| Secrets | `pnpm security:secrets` | PASS |
| E2E | `CI=true pnpm test:e2e` | PASS (4 tests) |

---

## 12. Git

Branch: `cursor/m3-patient-domain-3efc` (from frozen M2 `eff66e5`). M1 and M2 commits intact.

| Commit | Message |
|---|---|
| `9608376` | `feat(patient): add patient domain foundation` |
| `c19ad5f` | `feat(patient): add patient authorization and scoped access` |
| `bc18356` | `test(patient): add patient security and bola coverage` |
| `f35d3b0` | `docs(patient): document m3 patient foundation` |

Draft PR: https://github.com/ravishori/Ai-Dentist-System-Webapp/pull/3 (base: `cursor/m2-authorization-foundation-3efc`). Not merged.

---

## 13. Production readiness

M3 is **not** production-ready unless production security, privacy, operational, infrastructure, and governance prerequisites have been independently reviewed and approved by the human.
