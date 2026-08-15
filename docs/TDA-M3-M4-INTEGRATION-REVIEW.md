# TDA-M3–M4 Integration Review Checkpoint

**Document ID:** TDA-M3-M4-INTEGRATION-REVIEW  
**Date:** 2026-08-15  
**Branch reviewed:** `cursor/m3-patient-domain-3efc`

```text
Status: VERIFIED FOR HUMAN INTEGRATION / RELEASE REVIEW — NOT RELEASE APPROVED
Reviewed by: Technical verification
Date: 2026-08-15

Included milestones:
- M1 Authentication Foundation
- M2 Authorization / Organization Foundation
- M3 Patient Domain
- M4 Appointment Domain

Verified integration branch:
cursor/m3-patient-domain-3efc

Verified M4 merge commits:
- PR #5: 496d7cda4885563c007f935e703ce996c2dd1aac
- PR #4: 371a4fc61c96f5139a4df270e806e86fc65b5b4a
```

This checkpoint is a technical verification record for a **human** integration/release review. It does **not** authorize:

- merge to `main`;
- production deployment or release;
- M5 notification delivery;
- calendar, clinical, billing, or other future-domain work.

---

## 1. Reachability

Verified on `origin/cursor/m3-patient-domain-3efc` (HEAD `371a4fc`):

| Record                       | Commit                                     | Reachable |
| ---------------------------- | ------------------------------------------ | --------- |
| PR #5 merge                  | `496d7cda4885563c007f935e703ce996c2dd1aac` | yes       |
| PR #4 merge                  | `371a4fc61c96f5139a4df270e806e86fc65b5b4a` | yes       |
| M4 architecture approval     | `9183efec2b7b0ae882afeba8788014d2e560a758` | yes       |
| M4 implementation acceptance | `9b3c10ae5274b1400b8600aea3362c3542dac8d5` | yes       |

PR #4 and PR #5 are **MERGED**. Head branches were not deleted. `main` was not updated.

---

## 2. Integrated scope (verified)

### M1 Authentication

- Cognito OIDC behind `AuthenticationPort` remains.
- Routes: `/api/auth/login`, `/callback`, `/logout`, `/session`.
- OIDC security tests present (33 tests).

### M2 Authorization

- `AuthorizationPort` / organization membership / RBAC remain the authorization source of truth.
- Route: `/api/authz/organization`.
- Authorization security tests present (27 tests).

### M3 Patient

- Organization-scoped patients remain; no unscoped `findById`.
- Routes: `POST/GET /api/patients`, `GET/PATCH /api/patients/:patientId`.
- Patient BOLA/security tests present (25 tests).
- No patient `DELETE`.

### M4 Appointment

- Matches approved `docs/ADR-FOLLOWUP-M4.md` (`APPROVED`, 2026-08-15).
- Minimum Practitioner Profile plus appointments; no practitioner management API.
- Routes: `POST/GET /api/appointments`, `GET/PATCH /api/appointments/:id`, `POST .../reschedule`, `POST .../cancel`.
- Create status `REQUESTED`. PATCH has no mutable fields. No `DELETE`.
- PATIENT and SYSTEM_ADMIN appointment access remain denied.
- Cross-tenant GET/PATCH/cancel/reschedule covered as `404`.
- Active patient/practitioner overlaps: PostgreSQL exclusion constraints; mapped to `409`.
- Outbox stores notification **intent only**; worker `processingEnabled: false`.
- Appointment security/concurrency tests present (30 tests).

### Migrations

Additive and ordered:

1. `20260814120000_m1_authentication_identity`
2. `20260814180000_m2_organization_authorization`
3. `20260814190000_m3_patient_identity`
4. `20260815120000_m4_appointment_domain`

M1–M3 migration SQL is unchanged versus pre-M4 tip `4262efb`. M4 FKs use `ON DELETE RESTRICT` (no `CASCADE`).

### Out of scope (confirmed absent)

No M5 notification delivery, calendar integration, clinical records, billing, payments, insurance, AI diagnosis, or hard-delete endpoints.

---

## 3. Validation outcomes

Run on `cursor/m3-patient-domain-3efc` at `371a4fc` (2026-08-15):

| Gate           | Command                 | Result           |
| -------------- | ----------------------- | ---------------- |
| Tests          | `pnpm test`             | PASS (124 tests) |
| Lint           | `pnpm lint`             | PASS             |
| Format         | `pnpm format:check`     | PASS             |
| Typecheck      | `pnpm typecheck`        | PASS             |
| DB validation  | `pnpm db:validate`      | PASS             |
| Build          | `pnpm build`            | PASS             |
| Security audit | `pnpm security:audit`   | PASS             |
| Secrets        | `pnpm security:secrets` | PASS             |
| E2E            | `CI=true pnpm test:e2e` | PASS (5 tests)   |

E2E includes unauthenticated `GET /api/patients` and `GET /api/appointments` returning `401`.

---

## 4. Production-readiness and release prerequisites (unresolved)

These remain open. This checkpoint does **not** close them.

- Production Cognito / Hosted UI / DNS / credentials (human-owned)
- Production PostgreSQL, backups, and operational runbooks
- Independent security, privacy, and infrastructure review
- Confirm / check-in / complete / no-show appointment operations
- Practitioner management API
- Branch-level authorization
- Patient portal / self-access
- Calendar integration
- Notification **delivery** (SMTP/Twilio/dispatcher)
- Hard-delete / legal retention policy
- Live Postgres exclusion-constraint race test (in-memory concurrency + SQL constraints are present)
- Merge to `main`, deployment topology, and production secrets handling

M3 and M4 remain **not production-ready**. M4 human acceptance is **ACCEPTED FOR DRAFT PR REVIEW — NOT PRODUCTION READY**.

---

## 5. Authorization boundary for this checkpoint

```text
This document verifies that M1–M4 are integrated on
cursor/m3-patient-domain-3efc and that the supported
validation suite passed.

It does not:
- approve a production release;
- authorize deployment;
- authorize merge to main;
- authorize M5 or other future-domain work.
```

Human integration/release review is the next decision. No release action is implied.
